-- Estado distribuído e efêmero do loop breaker de GET /api/auth/me.
--
-- O runner oficial envolve este arquivo em uma transação. Não abrir uma
-- transação própria e não usar CREATE INDEX CONCURRENTLY.

SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

CREATE TABLE public.legacy_auth_loop_breaker_state (
  token_hash bytea NOT NULL,
  window_started_at timestamp with time zone NOT NULL,
  request_count integer NOT NULL,
  one_shot_consumed boolean NOT NULL DEFAULT false,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT legacy_auth_loop_breaker_state_pkey PRIMARY KEY (token_hash),
  CONSTRAINT legacy_auth_loop_breaker_state_token_hash_check
    CHECK (octet_length(token_hash) = 32),
  CONSTRAINT legacy_auth_loop_breaker_state_request_count_check
    CHECK (request_count > 0)
);

CREATE INDEX legacy_auth_loop_breaker_state_expires_at_idx
  ON public.legacy_auth_loop_breaker_state (expires_at);

COMMENT ON TABLE public.legacy_auth_loop_breaker_state IS
  'Estado efemero por SHA-256 de JWT para o breaker legado de GET /api/auth/me.';

COMMENT ON COLUMN public.legacy_auth_loop_breaker_state.token_hash IS
  'SHA-256 completo (32 bytes); nunca JWT ou Authorization em texto.';

CREATE FUNCTION public.legacy_auth_loop_breaker_decide(
  p_token_hash bytea,
  p_threshold integer,
  p_window_ms integer,
  p_state_ttl_ms integer,
  p_max_rows integer
)
RETURNS TABLE (
  should_trigger boolean,
  observed_count integer,
  observed_window_started_at timestamp with time zone,
  observed_expires_at timestamp with time zone
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $legacy_auth_loop_breaker$
DECLARE
  v_now timestamp with time zone := clock_timestamp();
  v_state public.legacy_auth_loop_breaker_state%ROWTYPE;
  v_total_rows integer;
  v_token_lock_unsigned_1 bigint;
  v_token_lock_unsigned_2 bigint;
  v_token_lock_key_1 integer;
  v_token_lock_key_2 integer;
  v_should_trigger boolean := false;
BEGIN
  IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION 'legacy auth loop breaker requires a 32-byte token hash';
  END IF;

  IF p_threshold < 2 OR p_window_ms < 1 OR p_state_ttl_ms <= p_window_ms
     OR p_max_rows < 1 THEN
    RAISE EXCEPTION 'legacy auth loop breaker received invalid configuration';
  END IF;

  -- Os primeiros 64 bits do SHA-256 formam dois integers assinados e uma chave
  -- determinística por token. Colisão apenas serializa tokens independentes;
  -- as linhas continuam isoladas pelo hash completo de 256 bits.
  v_token_lock_unsigned_1 :=
      get_byte(p_token_hash, 0)::bigint * 16777216
    + get_byte(p_token_hash, 1)::bigint * 65536
    + get_byte(p_token_hash, 2)::bigint * 256
    + get_byte(p_token_hash, 3)::bigint;
  v_token_lock_unsigned_2 :=
      get_byte(p_token_hash, 4)::bigint * 16777216
    + get_byte(p_token_hash, 5)::bigint * 65536
    + get_byte(p_token_hash, 6)::bigint * 256
    + get_byte(p_token_hash, 7)::bigint;
  v_token_lock_key_1 := CASE
    WHEN v_token_lock_unsigned_1 >= 2147483648
      THEN (v_token_lock_unsigned_1 - 4294967296)::integer
    ELSE v_token_lock_unsigned_1::integer
  END;
  v_token_lock_key_2 := CASE
    WHEN v_token_lock_unsigned_2 >= 2147483648
      THEN (v_token_lock_unsigned_2 - 4294967296)::integer
    ELSE v_token_lock_unsigned_2::integer
  END;
  PERFORM pg_advisory_xact_lock(v_token_lock_key_1, v_token_lock_key_2);

  -- Limpeza curta e sem espera por linhas que outra decisão esteja usando.
  -- ORDER BY + LIMIT permite usar o índice de expires_at e limita o trabalho.
  DELETE FROM public.legacy_auth_loop_breaker_state AS state
   USING (
     SELECT token_hash
       FROM public.legacy_auth_loop_breaker_state
      WHERE expires_at <= v_now
      ORDER BY expires_at ASC
      LIMIT 128
      FOR UPDATE SKIP LOCKED
   ) AS expired
   WHERE state.token_hash = expired.token_hash;

  SELECT *
    INTO v_state
    FROM public.legacy_auth_loop_breaker_state
   WHERE token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    -- O lock global existe somente na admissão de novos hashes. A sobrecarga
    -- normal e a concorrência do mesmo token usam apenas o lock por token.
    -- A variante bigint usa outro namespace e não colide com os dois integers
    -- usados acima para locks por token.
    PERFORM pg_advisory_xact_lock(1684231091::bigint);

    -- Uma segunda limpeza cobre o tempo aguardado no lock de capacidade.
    DELETE FROM public.legacy_auth_loop_breaker_state AS state
     USING (
       SELECT token_hash
         FROM public.legacy_auth_loop_breaker_state
        WHERE expires_at <= clock_timestamp()
        ORDER BY expires_at ASC
        LIMIT 128
        FOR UPDATE SKIP LOCKED
     ) AS expired
     WHERE state.token_hash = expired.token_hash;

    SELECT count(*)::integer
      INTO v_total_rows
      FROM public.legacy_auth_loop_breaker_state;

    IF v_total_rows >= p_max_rows THEN
      -- Fail-open sob pressão: preservar episódios/cooldowns ativos é mais
      -- seguro que expulsar uma linha não expirada e rearmar 426 cedo demais.
      RETURN QUERY SELECT false, 0, NULL::timestamp with time zone,
        NULL::timestamp with time zone;
      RETURN;
    END IF;

    INSERT INTO public.legacy_auth_loop_breaker_state (
      token_hash,
      window_started_at,
      request_count,
      one_shot_consumed,
      expires_at
    ) VALUES (
      p_token_hash,
      v_now,
      1,
      false,
      v_now + (p_state_ttl_ms * interval '1 millisecond')
    )
    RETURNING * INTO v_state;
  ELSE
    IF v_state.one_shot_consumed THEN
      -- Cooldown fixo a partir do 426: requests posteriores retornam 200 sem
      -- renovar expires_at. Depois da expiração, outro episódio pode começar.
      NULL;
    ELSIF v_now - v_state.window_started_at
         >= p_window_ms * interval '1 millisecond' THEN
      v_state.window_started_at := v_now;
      v_state.request_count := 1;
    ELSE
      v_state.request_count := v_state.request_count + 1;

      IF v_state.request_count >= p_threshold THEN
        v_state.one_shot_consumed := true;
        v_should_trigger := true;
      END IF;
    END IF;

    IF NOT v_state.one_shot_consumed OR v_should_trigger THEN
      v_state.expires_at :=
        v_now + (p_state_ttl_ms * interval '1 millisecond');

      UPDATE public.legacy_auth_loop_breaker_state
         SET window_started_at = v_state.window_started_at,
             request_count = v_state.request_count,
             one_shot_consumed = v_state.one_shot_consumed,
             expires_at = v_state.expires_at
       WHERE token_hash = p_token_hash;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_should_trigger,
    v_state.request_count,
    v_state.window_started_at,
    v_state.expires_at;
END
$legacy_auth_loop_breaker$;

COMMENT ON FUNCTION public.legacy_auth_loop_breaker_decide(
  bytea,
  integer,
  integer,
  integer,
  integer
) IS
  'Decisao atomica, one-shot e limitada para o breaker legado de GET /api/auth/me.';
