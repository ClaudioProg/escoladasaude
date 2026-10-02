-- Bloco 1 / EXPAND: confirmacao institucional de email, recuperacao de senha
-- e historico de credenciais. O runner controla a transacao e o ledger.
-- Sem backfill ou cutover; UUIDs e tokens serao gerados pela aplicacao.
-- usuarios.email permanece a unica fonte operacional do email atual.
-- O formato do candidato sera validado pelo service segundo a regra oficial;
-- esta migration nao duplica nem altera chk_email_formato_valido.

SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

DO $preflight_auth_email_senha$
DECLARE
  v_usuarios_id_attnum smallint;
  v_usuarios_email_attnum smallint;
  v_usuarios_cpf_attnum smallint;
  v_citext_oid oid;
  v_nome text;
BEGIN
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION 'Preflight auth/email/senha: public.usuarios ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid = 'public.usuarios'::regclass AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'Preflight auth/email/senha: usuarios deve ser tabela';
  END IF;

  SELECT t.oid INTO v_citext_oid
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_catalog.pg_depend d
      ON d.classid = 'pg_catalog.pg_type'::regclass
     AND d.objid = t.oid AND d.objsubid = 0 AND d.deptype = 'e'
     AND d.refclassid = 'pg_catalog.pg_extension'::regclass
    JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
   WHERE n.nspname = 'public' AND t.typname = 'citext'
     AND e.extname = 'citext' AND e.extnamespace = n.oid;

  IF v_citext_oid IS NULL THEN
    RAISE EXCEPTION
      'Preflight auth/email/senha: public.citext deve pertencer a extensao citext em public';
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
      AND i.indisvalid AND i.indisready AND i.indisunique AND i.indimmediate
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/email/senha: usuarios.id deve ser integer NOT NULL com PK simples imediata';
  END IF;

  SELECT a.attnum INTO v_usuarios_email_attnum
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.usuarios'::regclass AND a.attname = 'email'
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull
     AND a.atttypid = v_citext_oid AND a.atttypmod = -1;

  IF v_usuarios_email_attnum IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_index i ON i.indexrelid = c.conindid
    WHERE c.conrelid = 'public.usuarios'::regclass AND c.contype = 'u'
      AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
      AND array_length(c.conkey, 1) = 1 AND c.conkey[1] = v_usuarios_email_attnum
      AND i.indisvalid AND i.indisready AND i.indisunique AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/email/senha: usuarios.email deve ser public.citext NOT NULL UNIQUE imediato';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.usuarios'::regclass
      AND c.conname = 'chk_email_formato_valido' AND c.contype = 'c'
      AND c.convalidated AND v_usuarios_email_attnum = ANY(c.conkey)
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/email/senha: chk_email_formato_valido validada deve proteger usuarios.email';
  END IF;

  SELECT a.attnum INTO v_usuarios_cpf_attnum
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.usuarios'::regclass AND a.attname = 'cpf'
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull
     AND a.atttypid = 'pg_catalog.varchar'::regtype;

  IF v_usuarios_cpf_attnum IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_index i ON i.indexrelid = c.conindid
    WHERE c.conrelid = 'public.usuarios'::regclass AND c.contype = 'u'
      AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
      AND array_length(c.conkey, 1) = 1 AND c.conkey[1] = v_usuarios_cpf_attnum
      AND i.indisvalid AND i.indisready AND i.indisunique AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.usuarios'::regclass AND c.contype = 'c'
      AND c.convalidated AND v_usuarios_cpf_attnum = ANY(c.conkey)
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/email/senha: usuarios.cpf deve ser varchar NOT NULL UNIQUE imediato com CHECK validada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.usuarios'::regclass AND a.attname = 'senha'
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull
      AND a.atttypid = 'pg_catalog.text'::regtype AND a.atttypmod = -1
  ) THEN
    RAISE EXCEPTION 'Preflight auth/email/senha: usuarios.senha deve ser text NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.usuarios'::regclass AND a.attnum > 0
      AND NOT a.attisdropped AND a.attname IN (
        'email_confirmado_em', 'auth_version', 'email_version',
        'cadastro_pendente_expira_em'
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.usuarios'::regclass AND c.conname IN (
      'usuarios_email_confirmado_em_finito_check', 'usuarios_auth_version_check',
      'usuarios_email_version_check', 'usuarios_cadastro_pendente_finito_check',
      'usuarios_confirmado_sem_cadastro_pendente_check'
    )
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/email/senha: coluna ou constraint de destino em usuarios ja existe';
  END IF;

  FOREACH v_nome IN ARRAY ARRAY[
    'auth_email_confirmacao', 'auth_recuperacao_senha', 'auth_senha_historico',
    'auth_email_confirmacao_pkey', 'auth_email_confirmacao_token_hash_key',
    'auth_email_confirmacao_aberta_usuario_idx',
    'auth_email_confirmacao_usuario_criada_idx', 'auth_email_confirmacao_criada_idx',
    'auth_recuperacao_senha_pkey', 'auth_recuperacao_senha_token_hash_key',
    'auth_recuperacao_senha_aberta_usuario_idx',
    'auth_recuperacao_senha_usuario_criada_idx', 'auth_recuperacao_senha_criada_idx',
    'auth_senha_historico_pkey', 'auth_senha_historico_usuario_id_idx',
    'auth_senha_historico_id_seq'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_nome
    ) THEN
      RAISE EXCEPTION
        'Preflight auth/email/senha: objeto public.% ja existe; inspecao obrigatoria', v_nome;
    END IF;
  END LOOP;
END
$preflight_auth_email_senha$;

ALTER TABLE public.usuarios
  ADD COLUMN email_confirmado_em timestamptz NULL,
  ADD COLUMN auth_version integer NOT NULL DEFAULT 1,
  ADD COLUMN email_version integer NOT NULL DEFAULT 1,
  ADD COLUMN cadastro_pendente_expira_em timestamptz NULL,
  ADD CONSTRAINT usuarios_email_confirmado_em_finito_check
    CHECK (email_confirmado_em IS NULL OR isfinite(email_confirmado_em)),
  ADD CONSTRAINT usuarios_auth_version_check CHECK (auth_version >= 1),
  ADD CONSTRAINT usuarios_email_version_check CHECK (email_version >= 1),
  ADD CONSTRAINT usuarios_cadastro_pendente_finito_check
    CHECK (cadastro_pendente_expira_em IS NULL OR isfinite(cadastro_pendente_expira_em)),
  ADD CONSTRAINT usuarios_confirmado_sem_cadastro_pendente_check
    CHECK (email_confirmado_em IS NULL OR cadastro_pendente_expira_em IS NULL);

-- NULL no prazo preserva o legado; somente cadastro V3 novo recebe prazo no service.
-- Confirmacao futura limpa o prazo. Nao reinterpretar usuarios.criado_em legado.
CREATE TABLE public.auth_email_confirmacao (
  id uuid NOT NULL,
  usuario_id integer NOT NULL,
  email_candidato public.citext NOT NULL,
  token_hash bytea NOT NULL,
  finalidade text NOT NULL,
  email_version_esperada integer NOT NULL,
  criado_por_usuario_id integer NULL,
  criada_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em timestamptz NOT NULL,
  consumida_em timestamptz NULL,
  invalidada_em timestamptz NULL,
  CONSTRAINT auth_email_confirmacao_pkey PRIMARY KEY (id),
  CONSTRAINT auth_email_confirmacao_token_hash_key UNIQUE (token_hash),
  CONSTRAINT auth_email_confirmacao_usuario_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios (id)
    ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_email_confirmacao_criado_por_usuario_fkey
    FOREIGN KEY (criado_por_usuario_id) REFERENCES public.usuarios (id)
    ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_email_confirmacao_finalidade_check
    CHECK (finalidade IN ('confirmacao', 'alteracao')),
  CONSTRAINT auth_email_confirmacao_email_version_check
    CHECK (email_version_esperada >= 1),
  CONSTRAINT auth_email_confirmacao_token_hash_check
    CHECK (octet_length(token_hash) = 32),
  CONSTRAINT auth_email_confirmacao_prazo_check
    CHECK (isfinite(criada_em) AND isfinite(expira_em)
      AND expira_em = criada_em + INTERVAL '24 hours'),
  CONSTRAINT auth_email_confirmacao_consumida_check
    CHECK (consumida_em IS NULL OR (isfinite(consumida_em)
      AND consumida_em >= criada_em AND consumida_em < expira_em)),
  CONSTRAINT auth_email_confirmacao_invalidada_check
    CHECK (invalidada_em IS NULL OR (isfinite(invalidada_em)
      AND invalidada_em >= criada_em)),
  CONSTRAINT auth_email_confirmacao_estado_terminal_check
    CHECK (consumida_em IS NULL OR invalidada_em IS NULL)
);

-- Sem predicado temporal: o service invalida o anterior antes de emitir outro.
CREATE UNIQUE INDEX auth_email_confirmacao_aberta_usuario_idx
  ON public.auth_email_confirmacao (usuario_id)
  WHERE consumida_em IS NULL AND invalidada_em IS NULL;
CREATE INDEX auth_email_confirmacao_usuario_criada_idx
  ON public.auth_email_confirmacao (usuario_id, criada_em DESC);
CREATE INDEX auth_email_confirmacao_criada_idx
  ON public.auth_email_confirmacao (criada_em);

CREATE TABLE public.auth_recuperacao_senha (
  id uuid NOT NULL,
  usuario_id integer NOT NULL,
  token_hash bytea NOT NULL,
  auth_version_esperada integer NOT NULL,
  criada_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em timestamptz NOT NULL,
  consumida_em timestamptz NULL,
  invalidada_em timestamptz NULL,
  CONSTRAINT auth_recuperacao_senha_pkey PRIMARY KEY (id),
  CONSTRAINT auth_recuperacao_senha_token_hash_key UNIQUE (token_hash),
  CONSTRAINT auth_recuperacao_senha_usuario_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios (id)
    ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_recuperacao_senha_auth_version_check
    CHECK (auth_version_esperada >= 1),
  CONSTRAINT auth_recuperacao_senha_token_hash_check
    CHECK (octet_length(token_hash) = 32),
  CONSTRAINT auth_recuperacao_senha_prazo_check
    CHECK (isfinite(criada_em) AND isfinite(expira_em)
      AND expira_em = criada_em + INTERVAL '30 minutes'),
  CONSTRAINT auth_recuperacao_senha_consumida_check
    CHECK (consumida_em IS NULL OR (isfinite(consumida_em)
      AND consumida_em >= criada_em AND consumida_em < expira_em)),
  CONSTRAINT auth_recuperacao_senha_invalidada_check
    CHECK (invalidada_em IS NULL OR (isfinite(invalidada_em)
      AND invalidada_em >= criada_em)),
  CONSTRAINT auth_recuperacao_senha_estado_terminal_check
    CHECK (consumida_em IS NULL OR invalidada_em IS NULL)
);

CREATE UNIQUE INDEX auth_recuperacao_senha_aberta_usuario_idx
  ON public.auth_recuperacao_senha (usuario_id)
  WHERE consumida_em IS NULL AND invalidada_em IS NULL;
CREATE INDEX auth_recuperacao_senha_usuario_criada_idx
  ON public.auth_recuperacao_senha (usuario_id, criada_em DESC);
CREATE INDEX auth_recuperacao_senha_criada_idx
  ON public.auth_recuperacao_senha (criada_em);

-- Janela futura: hash atual + quatro anteriores, mantida pelo protocolo transacional.
-- A carga inicial fica para o cutover de todos os escritores de senha.
CREATE TABLE public.auth_senha_historico (
  id bigint GENERATED ALWAYS AS IDENTITY,
  usuario_id integer NOT NULL,
  senha_hash text NOT NULL,
  criada_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_senha_historico_pkey PRIMARY KEY (id),
  CONSTRAINT auth_senha_historico_usuario_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios (id)
    ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_senha_historico_senha_hash_check CHECK (btrim(senha_hash) <> ''),
  CONSTRAINT auth_senha_historico_criada_check CHECK (isfinite(criada_em))
);

CREATE INDEX auth_senha_historico_usuario_id_idx
  ON public.auth_senha_historico (usuario_id, id DESC);

-- Retencao futura dos desafios: 90 dias desde criada_em; auditoria separada: 5 anos.
-- CASCADE de confirmacao atende somente a remocao autorizada de cadastro V3 novo
-- nunca ativado, sem historico operacional, apos 30 dias; nao autoriza apagar ativos.
-- Emissao inicial conta nas quotas futuras: 60 s, 5/h, 10/24 h moveis por conta.
-- Comparacao de versoes, locks, quotas e invalidacoes ficam para os services.
-- Sem reserva UNIQUE de email_candidato; a promocao usa UNIQUE(usuarios.email).
-- Aplicacao e ledger sao atomicos no runner; reexecucao somente via ledger/skip.
