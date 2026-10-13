-- Bloco 1 / Etapa 10 / EXPAND: outbox dedicada a autenticacao.
-- O runner controla transacao e ledger. Sem backfill, enqueue, worker ou SMTP.
-- Finalidade/conta derivam do desafio: confirmacao/alteracao ou recuperacao.
-- Conteudo opaco exclusivamente AES-256-GCM; chaves nunca entram no banco.

SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

DO $preflight_auth_outbox$
DECLARE
  v_tabela text;
  v_rel oid;
  v_id_attnum smallint;
  v_nome text;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY[
    'public.auth_email_confirmacao', 'public.auth_recuperacao_senha'
  ] LOOP
    v_rel := to_regclass(v_tabela);
    IF v_rel IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.oid = v_rel AND c.relkind IN ('r', 'p')
    ) THEN
      RAISE EXCEPTION 'Preflight auth/outbox: tabela de desafio ausente ou incompativel';
    END IF;

    SELECT a.attnum INTO v_id_attnum
      FROM pg_catalog.pg_attribute a
     WHERE a.attrelid = v_rel AND a.attname = 'id'
       AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull
       AND a.atttypid = 'pg_catalog.uuid'::regtype AND a.atttypmod = -1;

    IF v_id_attnum IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_index i ON i.indexrelid = c.conindid
      WHERE c.conrelid = v_rel AND c.contype = 'p'
        AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
        AND array_length(c.conkey, 1) = 1 AND c.conkey[1] = v_id_attnum
        AND i.indisvalid AND i.indisready AND i.indislive
        AND i.indisunique AND i.indimmediate
        AND i.indpred IS NULL AND i.indexprs IS NULL
    ) THEN
      RAISE EXCEPTION 'Preflight auth/outbox: desafio.id deve ser UUID NOT NULL com PK simples imediata';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.auth_email_confirmacao'::regclass
      AND a.attname = 'finalidade' AND a.attnum > 0
      AND NOT a.attisdropped AND a.attnotnull
      AND a.atttypid = 'pg_catalog.text'::regtype AND a.atttypmod = -1
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.auth_email_confirmacao'::regclass
      AND c.conname = 'auth_email_confirmacao_finalidade_check'
      AND c.contype = 'c' AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'Preflight auth/outbox: finalidade do desafio de email incompativel';
  END IF;

  FOREACH v_nome IN ARRAY ARRAY[
    'auth_outbox', 'auth_outbox_pkey',
    'auth_outbox_confirmacao_uq', 'auth_outbox_recuperacao_uq',
    'auth_outbox_key_nonce_uq', 'auth_outbox_pendente_idx',
    'auth_outbox_lease_idx', 'auth_outbox_terminal_idx'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_nome
    ) THEN
      RAISE EXCEPTION 'Preflight auth/outbox: objeto de destino ja existe; inspecao obrigatoria';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_outbox_proteger_update'
  ) THEN
    RAISE EXCEPTION 'Preflight auth/outbox: funcao de destino ja existe; inspecao obrigatoria';
  END IF;
END;
$preflight_auth_outbox$;

CREATE TABLE public.auth_outbox (
  id uuid NOT NULL,
  confirmacao_id uuid NULL,
  recuperacao_id uuid NULL,
  email_destino text NOT NULL,
  conteudo_cifrado bytea NULL,
  nonce bytea NULL,
  auth_tag bytea NULL,
  key_id text NULL,
  status text NOT NULL DEFAULT 'pending',
  tentativas integer NOT NULL DEFAULT 0,
  criada_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  proxima_tentativa_em timestamptz NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_tentativa_em timestamptz NULL,
  lease_id uuid NULL,
  lease_adquirida_em timestamptz NULL,
  lease_expira_em timestamptz NULL,
  finalizada_em timestamptz NULL,
  ultimo_erro_codigo text NULL,
  ultimo_erro_smtp_status smallint NULL,
  CONSTRAINT auth_outbox_pkey PRIMARY KEY (id),
  CONSTRAINT auth_outbox_confirmacao_fkey
    FOREIGN KEY (confirmacao_id) REFERENCES public.auth_email_confirmacao (id)
    ON UPDATE RESTRICT ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_outbox_recuperacao_fkey
    FOREIGN KEY (recuperacao_id) REFERENCES public.auth_recuperacao_senha (id)
    ON UPDATE RESTRICT ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_outbox_desafio_check
    CHECK ((confirmacao_id IS NOT NULL) <> (recuperacao_id IS NOT NULL)),
  CONSTRAINT auth_outbox_destino_check
    CHECK (btrim(email_destino) <> '' AND email_destino !~ '[[:space:][:cntrl:],;<>]'),
  CONSTRAINT auth_outbox_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  CONSTRAINT auth_outbox_tentativas_check
    CHECK (tentativas >= 0
      AND ((tentativas = 0 AND ultima_tentativa_em IS NULL)
        OR (tentativas > 0 AND ultima_tentativa_em IS NOT NULL))),
  CONSTRAINT auth_outbox_tempos_check
    CHECK (isfinite(criada_em)
      AND (proxima_tentativa_em IS NULL OR
        (isfinite(proxima_tentativa_em) AND proxima_tentativa_em >= criada_em))
      AND (ultima_tentativa_em IS NULL OR
        (isfinite(ultima_tentativa_em) AND ultima_tentativa_em >= criada_em))
      AND (finalizada_em IS NULL OR
        (isfinite(finalizada_em) AND finalizada_em >= criada_em
          AND (ultima_tentativa_em IS NULL OR finalizada_em >= ultima_tentativa_em)))),
  CONSTRAINT auth_outbox_agendamento_check
    CHECK ((status = 'pending' AND proxima_tentativa_em IS NOT NULL
        AND finalizada_em IS NULL
        AND (ultima_tentativa_em IS NULL OR proxima_tentativa_em >= ultima_tentativa_em))
      OR (status = 'processing' AND proxima_tentativa_em IS NULL
        AND finalizada_em IS NULL AND tentativas > 0)
      OR (status IN ('sent', 'failed') AND proxima_tentativa_em IS NULL
        AND finalizada_em IS NOT NULL)),
  CONSTRAINT auth_outbox_lease_check
    CHECK ((status = 'processing' AND lease_id IS NOT NULL
        AND lease_adquirida_em IS NOT NULL AND lease_expira_em IS NOT NULL
        AND isfinite(lease_adquirida_em) AND isfinite(lease_expira_em)
        AND lease_adquirida_em >= criada_em
        AND lease_adquirida_em = ultima_tentativa_em
        AND lease_expira_em > lease_adquirida_em)
      OR (status <> 'processing' AND lease_id IS NULL
        AND lease_adquirida_em IS NULL AND lease_expira_em IS NULL)),
  CONSTRAINT auth_outbox_envelope_check
    CHECK ((conteudo_cifrado IS NOT NULL AND nonce IS NOT NULL
        AND auth_tag IS NOT NULL AND key_id IS NOT NULL
        AND octet_length(conteudo_cifrado) > 0
        AND octet_length(nonce) = 12 AND octet_length(auth_tag) = 16
        AND octet_length(key_id) BETWEEN 1 AND 64
        AND key_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
      OR (conteudo_cifrado IS NULL AND nonce IS NULL
        AND auth_tag IS NULL AND key_id IS NULL AND status IN ('sent', 'failed'))),
  CONSTRAINT auth_outbox_enviada_check
    CHECK (status <> 'sent' OR
      (tentativas > 0 AND conteudo_cifrado IS NULL AND ultimo_erro_codigo IS NULL
        AND ultimo_erro_smtp_status IS NULL)),
  CONSTRAINT auth_outbox_erro_check
    CHECK ((ultimo_erro_codigo IS NULL OR ultimo_erro_codigo IN (
        'SMTP_TRANSIENT', 'SMTP_PERMANENT', 'RETRY_EXHAUSTED',
        'CHALLENGE_INVALID', 'CRYPTO_FAILURE', 'INTERNAL_FAILURE', 'LEASE_EXPIRED'
      )) AND (status <> 'failed' OR ultimo_erro_codigo IS NOT NULL)
      AND (ultimo_erro_codigo IS DISTINCT FROM 'SMTP_PERMANENT' OR status = 'failed')
      AND (ultimo_erro_codigo IS DISTINCT FROM 'RETRY_EXHAUSTED' OR status = 'failed')
      AND (ultimo_erro_smtp_status IS NULL OR
        (ultimo_erro_smtp_status BETWEEN 400 AND 599
          AND ultimo_erro_codigo IS NOT NULL
          AND ultimo_erro_codigo IN ('SMTP_TRANSIENT', 'SMTP_PERMANENT'))))
);

-- Uma mensagem duravel por desafio; retries reutilizam a mesma linha/UUID.
CREATE UNIQUE INDEX auth_outbox_confirmacao_uq
  ON public.auth_outbox USING btree (confirmacao_id) WHERE confirmacao_id IS NOT NULL;
CREATE UNIQUE INDEX auth_outbox_recuperacao_uq
  ON public.auth_outbox USING btree (recuperacao_id) WHERE recuperacao_id IS NOT NULL;
CREATE UNIQUE INDEX auth_outbox_key_nonce_uq
  ON public.auth_outbox USING btree (key_id, nonce) WHERE key_id IS NOT NULL;
CREATE INDEX auth_outbox_pendente_idx
  ON public.auth_outbox USING btree (proxima_tentativa_em, id) WHERE status = 'pending';
CREATE INDEX auth_outbox_lease_idx
  ON public.auth_outbox USING btree (lease_expira_em, id) WHERE status = 'processing';
CREATE INDEX auth_outbox_terminal_idx
  ON public.auth_outbox USING btree (finalizada_em, id) WHERE status IN ('sent', 'failed');

-- Trigger apenas na tabela nova: snapshot/identidade imutaveis e terminal fechado.
-- Nao implementa claim, renovacao de lease, retry ou limpeza operacional.
CREATE FUNCTION public.auth_outbox_proteger_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $auth_outbox_proteger_update$
BEGIN
  IF ROW(NEW.id, NEW.confirmacao_id, NEW.recuperacao_id, NEW.email_destino, NEW.criada_em)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.confirmacao_id, OLD.recuperacao_id, OLD.email_destino, OLD.criada_em)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'auth_outbox: identidade e snapshot imutaveis';
  END IF;

  IF OLD.status IN ('sent', 'failed') AND ROW(NEW.status, NEW.tentativas,
    NEW.ultima_tentativa_em, NEW.finalizada_em, NEW.ultimo_erro_codigo, NEW.ultimo_erro_smtp_status)
    IS DISTINCT FROM ROW(OLD.status, OLD.tentativas,
      OLD.ultima_tentativa_em, OLD.finalizada_em, OLD.ultimo_erro_codigo, OLD.ultimo_erro_smtp_status)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'auth_outbox: estado terminal imutavel';
  END IF;

  IF NEW.tentativas < OLD.tentativas THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'auth_outbox: tentativas nao podem diminuir';
  END IF;

  IF ROW(NEW.conteudo_cifrado, NEW.nonce, NEW.auth_tag, NEW.key_id)
    IS DISTINCT FROM ROW(OLD.conteudo_cifrado, OLD.nonce, OLD.auth_tag, OLD.key_id)
    AND NOT (NEW.status IN ('sent', 'failed') AND NEW.conteudo_cifrado IS NULL
      AND NEW.nonce IS NULL AND NEW.auth_tag IS NULL AND NEW.key_id IS NULL)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'auth_outbox: envelope imutavel salvo remocao terminal';
  END IF;
  RETURN NEW;
END;
$auth_outbox_proteger_update$;

CREATE TRIGGER auth_outbox_proteger_update_trg
  BEFORE UPDATE ON public.auth_outbox
  FOR EACH ROW EXECUTE FUNCTION public.auth_outbox_proteger_update();

COMMENT ON TABLE public.auth_outbox IS
  'Outbox de autenticacao at-least-once; sem promessa exactly-once ou worker ativo.';
COMMENT ON COLUMN public.auth_outbox.confirmacao_id IS
  'FK exclusiva: finalidade confirmacao/alteracao e conta derivam de auth_email_confirmacao.';
COMMENT ON COLUMN public.auth_outbox.recuperacao_id IS
  'FK exclusiva: finalidade recuperacao e conta derivam de auth_recuperacao_senha.';
COMMENT ON COLUMN public.auth_outbox.email_destino IS
  'Snapshot imutavel do unico destinatario; formato canonico validado no futuro enqueue.';
COMMENT ON COLUMN public.auth_outbox.conteudo_cifrado IS
  'Envelope opaco AES-256-GCM; nunca token bruto, chave ou corpo aberto. SQL nao prova criptografia.';
COMMENT ON COLUMN public.auth_outbox.nonce IS
  'Nonce GCM de 12 bytes; unicidade historica por chave e geracao segura cabem a Etapa 11.';
COMMENT ON COLUMN public.auth_outbox.auth_tag IS
  'Tag GCM de 16 bytes; autenticidade e AAD devem ser verificadas pelo futuro service.';
COMMENT ON COLUMN public.auth_outbox.key_id IS
  'Identificador ASCII de chave externa de criptografia, distinta da chave HMAC de quotas.';
COMMENT ON COLUMN public.auth_outbox.lease_id IS
  'Identidade da posse para fencing futuro; ack/reclaim devem comparar id, lease e estado.';
COMMENT ON COLUMN public.auth_outbox.ultimo_erro_codigo IS
  'Apenas categorias controladas; sem mensagens, respostas SMTP, destinatarios ou tokens brutos.';

-- FK CASCADE subordina a mensagem ao desafio e preserva a remocao canonica
-- do cadastro nunca ativado: usuarios -> confirmacao -> outbox. Nao ativa exclusao.
-- Recuperacao continua protegida pelo RESTRICT de seu desafio para usuarios.
-- FKs criam triggers internos de integridade nos desafios; nenhum DDL legado alterado.
-- Duracao de lease, fencing operacional, worker, horarios de retries, cancelamento
-- por desafio expirado/invalidado e retencao/limpeza dependem de etapas proprias.
-- SMTP permanente/esgotamento terminam failed; sent exige apagar todo o envelope.
