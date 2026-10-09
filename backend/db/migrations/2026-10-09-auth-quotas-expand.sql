-- Bloco 1 / Etapa 08 / EXPAND: eventos compartilhados de quotas de autenticacao.
-- Uma linha por emissao; conta e IP podem estar associados ao mesmo evento.
-- Sem backfill, ativacao de quotas, politica de composicao ou limpeza automatica.
-- O runner controla a transacao e o ledger; UUIDs sao fornecidos pela aplicacao.

SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

DO $preflight_auth_quota$
DECLARE
  v_usuarios_id_attnum smallint;
  v_nome text;
BEGIN
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION 'Preflight auth/quotas: public.usuarios ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid = 'public.usuarios'::regclass AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'Preflight auth/quotas: usuarios deve ser tabela';
  END IF;

  SELECT a.attnum INTO v_usuarios_id_attnum
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.usuarios'::regclass AND a.attname = 'id'
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull
     AND a.atttypid = 'pg_catalog.int4'::regtype AND a.atttypmod = -1;

  IF v_usuarios_id_attnum IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_index i ON i.indexrelid = c.conindid
    WHERE c.conrelid = 'public.usuarios'::regclass AND c.contype = 'p'
      AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
      AND array_length(c.conkey, 1) = 1 AND c.conkey[1] = v_usuarios_id_attnum
      AND i.indisvalid AND i.indisready AND i.indislive
      AND i.indisunique AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/quotas: usuarios.id deve ser integer NOT NULL com PK simples imediata';
  END IF;

  FOREACH v_nome IN ARRAY ARRAY[
    'auth_quota_evento',
    'auth_quota_evento_pkey',
    'auth_quota_evento_usuario_registrada_idx',
    'auth_quota_evento_ip_registrada_idx',
    'auth_quota_evento_registrada_emissao_idx'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_nome
    ) THEN
      RAISE EXCEPTION
        'Preflight auth/quotas: objeto public.% ja existe; inspecao obrigatoria', v_nome;
    END IF;
  END LOOP;
END
$preflight_auth_quota$;

CREATE TABLE public.auth_quota_evento (
  emissao_id uuid NOT NULL,
  finalidade text NOT NULL,
  usuario_id integer NULL,
  ip_hmac bytea NULL,
  ip_hmac_key_id text NULL,
  registrada_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT auth_quota_evento_pkey PRIMARY KEY (emissao_id),
  CONSTRAINT auth_quota_evento_usuario_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_quota_evento_finalidade_check
    CHECK (finalidade IN ('confirmacao', 'alteracao', 'recuperacao')),
  CONSTRAINT auth_quota_evento_ip_par_check
    CHECK ((ip_hmac IS NULL) = (ip_hmac_key_id IS NULL)),
  CONSTRAINT auth_quota_evento_ip_hmac_check
    CHECK (ip_hmac IS NULL OR octet_length(ip_hmac) = 32),
  CONSTRAINT auth_quota_evento_ip_key_id_check
    CHECK (ip_hmac_key_id IS NULL OR (
      octet_length(ip_hmac_key_id) BETWEEN 1 AND 64
      AND ip_hmac_key_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    )),
  CONSTRAINT auth_quota_evento_sujeito_check
    CHECK (usuario_id IS NOT NULL OR ip_hmac IS NOT NULL),
  CONSTRAINT auth_quota_evento_registrada_finita_check
    CHECK (isfinite(registrada_em))
);

COMMENT ON TABLE public.auth_quota_evento IS
  'Historico de emissoes para quotas futuras; uma linha pode identificar conta e IP.';
COMMENT ON COLUMN public.auth_quota_evento.emissao_id IS
  'Identificador tecnico unico da emissao, fornecido pela aplicacao; nao e token.';
COMMENT ON COLUMN public.auth_quota_evento.finalidade IS
  'Finalidade factual; nao define quotas independentes ou combinadas entre finalidades.';
COMMENT ON COLUMN public.auth_quota_evento.ip_hmac IS
  'HMAC-SHA-256 do IP normalizado com segredo dedicado externo ao banco; nunca IP bruto.';
COMMENT ON COLUMN public.auth_quota_evento.ip_hmac_key_id IS
  'Codigo ASCII de 1 a 64 bytes da versao da chave HMAC; nao armazena o segredo.';
COMMENT ON COLUMN public.auth_quota_evento.registrada_em IS
  'Instante finito da contabilizacao; futura decisao de quota captura horario do banco apos locks.';

CREATE INDEX auth_quota_evento_usuario_registrada_idx
  ON public.auth_quota_evento USING btree (usuario_id, registrada_em, finalidade)
  WHERE usuario_id IS NOT NULL;
CREATE INDEX auth_quota_evento_ip_registrada_idx
  ON public.auth_quota_evento USING btree (ip_hmac_key_id, ip_hmac, registrada_em, finalidade)
  WHERE ip_hmac IS NOT NULL;
CREATE INDEX auth_quota_evento_registrada_emissao_idx
  ON public.auth_quota_evento USING btree (registrada_em, emissao_id);

-- Quotas canonicas futuras: por conta, intervalo minimo de 60 s, 5/h e 10/24 h
-- moveis; por IP, 10/15 min moveis. A primeira emissao conta.
-- Retencao canonica de 48 horas desde registrada_em; indice apoia limpeza futura.
-- Sem expira_em redundante, predicado temporal ou mecanismo automatico de limpeza.
-- Contagens/locks/idempotencia e integracao com emissao ficam para a Etapa 09.
-- Composicao de finalidades, falhas de emissao, origem/normalizacao de IP,
-- rotacao HMAC e operacao da limpeza permanecem abertas.
