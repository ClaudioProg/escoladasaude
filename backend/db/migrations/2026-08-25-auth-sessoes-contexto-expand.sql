-- Bloco 1 / EXPAND: infraestrutura persistente de sessoes revogaveis e
-- preferencia de contexto ativo. O runner executa esta migration em uma
-- transacao; nao abrir transacao propria nem usar CREATE INDEX CONCURRENTLY.

SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

DO $preflight_auth_sessao$
DECLARE
  v_usuarios_id_attnum smallint;
  v_perfil_codigo_attnum smallint;
  v_grant_usuario_id_attnum smallint;
  v_grant_perfil_codigo_attnum smallint;
BEGIN
  IF to_regclass('public.auth_sessao') IS NOT NULL
     OR to_regclass('public.auth_usuario_contexto') IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: tabela de destino ja existe; inspecao manual obrigatoria';
  END IF;

  IF to_regclass('public.usuarios') IS NULL
     OR to_regclass('public.auth_perfis') IS NULL
     OR to_regclass('public.auth_usuario_perfis') IS NULL THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: usuarios, auth_perfis e auth_usuario_perfis devem existir';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
     WHERE c.oid = 'public.usuarios'::regclass
       AND c.relkind IN ('r', 'p')
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
     WHERE c.oid = 'public.auth_perfis'::regclass
       AND c.relkind IN ('r', 'p')
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
     WHERE c.oid = 'public.auth_usuario_perfis'::regclass
       AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: tabelas-base devem ser comuns ou particionadas';
  END IF;

  SELECT a.attnum
    INTO v_usuarios_id_attnum
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.usuarios'::regclass
     AND a.attname = 'id'
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attnotnull
     AND a.atttypid = 'pg_catalog.int4'::regtype
     AND a.atttypmod = -1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: public.usuarios.id deve ser integer NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'public.usuarios'::regclass
       AND c.contype = 'p'
       AND c.convalidated
       AND NOT c.condeferrable
       AND NOT c.condeferred
       AND array_length(c.conkey, 1) = 1
       AND c.conkey[1] = v_usuarios_id_attnum
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: public.usuarios.id nao possui PK simples e imediata';
  END IF;

  SELECT a.attnum
    INTO v_perfil_codigo_attnum
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.auth_perfis'::regclass
     AND a.attname = 'codigo'
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attnotnull
     AND a.atttypid = 'pg_catalog.text'::regtype
     AND a.atttypmod = -1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: public.auth_perfis.codigo deve ser text NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'public.auth_perfis'::regclass
       AND c.contype = 'p'
       AND c.convalidated
       AND NOT c.condeferrable
       AND NOT c.condeferred
       AND array_length(c.conkey, 1) = 1
       AND c.conkey[1] = v_perfil_codigo_attnum
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: auth_perfis.codigo nao possui PK simples e imediata';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.auth_perfis p
     WHERE p.codigo = 'usuario'
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: perfil usuario nao existe em auth_perfis';
  END IF;

  SELECT a.attnum
    INTO v_grant_usuario_id_attnum
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.auth_usuario_perfis'::regclass
     AND a.attname = 'usuario_id'
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attnotnull
     AND a.atttypid = 'pg_catalog.int4'::regtype
     AND a.atttypmod = -1;

  SELECT a.attnum
    INTO v_grant_perfil_codigo_attnum
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.auth_usuario_perfis'::regclass
     AND a.attname = 'perfil_codigo'
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attnotnull
     AND a.atttypid = 'pg_catalog.text'::regtype
     AND a.atttypmod = -1;

  IF v_grant_usuario_id_attnum IS NULL
     OR v_grant_perfil_codigo_attnum IS NULL THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: auth_usuario_perfis nao possui usuario_id/perfil_codigo compativeis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'public.auth_usuario_perfis'::regclass
       AND c.contype = 'p'
       AND c.convalidated
       AND NOT c.condeferrable
       AND NOT c.condeferred
       AND array_length(c.conkey, 1) = 2
       AND c.conkey[1] = v_grant_usuario_id_attnum
       AND c.conkey[2] = v_grant_perfil_codigo_attnum
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'public.auth_usuario_perfis'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'public.usuarios'::regclass
       AND c.convalidated
       AND NOT c.condeferrable
       AND NOT c.condeferred
       AND c.confupdtype = 'r'
       AND c.confdeltype = 'r'
       AND array_length(c.conkey, 1) = 1
       AND c.conkey[1] = v_grant_usuario_id_attnum
       AND array_length(c.confkey, 1) = 1
       AND c.confkey[1] = v_usuarios_id_attnum
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'public.auth_usuario_perfis'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'public.auth_perfis'::regclass
       AND c.convalidated
       AND NOT c.condeferrable
       AND NOT c.condeferred
       AND c.confupdtype = 'r'
       AND c.confdeltype = 'r'
       AND array_length(c.conkey, 1) = 1
       AND c.conkey[1] = v_grant_perfil_codigo_attnum
       AND array_length(c.confkey, 1) = 1
       AND c.confkey[1] = v_perfil_codigo_attnum
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/sessoes: auth_usuario_perfis nao possui o shape esperado';
  END IF;
END
$preflight_auth_sessao$;

CREATE TABLE public.auth_sessao (
  id uuid NOT NULL,
  usuario_id integer NOT NULL,
  token_hash bytea NOT NULL,
  criada_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em timestamptz NOT NULL,
  limite_absoluto_em timestamptz NULL,
  manter_conectado boolean NOT NULL DEFAULT false,
  revogada_em timestamptz NULL,
  motivo_revogacao varchar(64) NULL,
  area_ativa text NOT NULL DEFAULT 'usuario',
  user_agent text NULL,
  ip_criacao inet NULL,
  ultimo_ip inet NULL,
  CONSTRAINT auth_sessao_pkey PRIMARY KEY (id),
  CONSTRAINT auth_sessao_token_hash_key UNIQUE (token_hash),
  CONSTRAINT auth_sessao_usuario_fkey
    FOREIGN KEY (usuario_id)
    REFERENCES public.usuarios (id)
    ON DELETE RESTRICT
    NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_sessao_area_ativa_fkey
    FOREIGN KEY (area_ativa)
    REFERENCES public.auth_perfis (codigo)
    ON DELETE RESTRICT
    NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_sessao_token_hash_32_check
    CHECK (octet_length(token_hash) = 32),
  CONSTRAINT auth_sessao_ultimo_uso_criada_check
    CHECK (ultimo_uso_em >= criada_em),
  CONSTRAINT auth_sessao_expira_criada_check
    CHECK (expira_em > criada_em),
  CONSTRAINT auth_sessao_ultimo_uso_expira_check
    CHECK (ultimo_uso_em < expira_em),
  CONSTRAINT auth_sessao_revogada_criada_check
    CHECK (revogada_em IS NULL OR revogada_em >= criada_em),
  CONSTRAINT auth_sessao_limite_sem_manter_check
    CHECK (manter_conectado OR limite_absoluto_em IS NULL),
  CONSTRAINT auth_sessao_limite_com_manter_check
    CHECK (NOT manter_conectado OR limite_absoluto_em IS NOT NULL),
  CONSTRAINT auth_sessao_expira_limite_absoluto_check
    CHECK (limite_absoluto_em IS NULL OR expira_em <= limite_absoluto_em),
  CONSTRAINT auth_sessao_revogacao_preenchimento_check
    CHECK (
      (revogada_em IS NULL AND motivo_revogacao IS NULL)
      OR (revogada_em IS NOT NULL AND motivo_revogacao IS NOT NULL)
    ),
  CONSTRAINT auth_sessao_motivo_revogacao_codigo_check
    CHECK (motivo_revogacao IS NULL OR motivo_revogacao ~ '^[a-z0-9_]+$')
);

CREATE INDEX auth_sessao_ativas_usuario_criada_id_idx
  ON public.auth_sessao USING btree (usuario_id, criada_em, id)
  WHERE revogada_em IS NULL;

CREATE INDEX auth_sessao_ativas_expira_em_brin_idx
  ON public.auth_sessao USING brin (expira_em)
  WHERE revogada_em IS NULL;

CREATE INDEX auth_sessao_revogadas_revogada_em_idx
  ON public.auth_sessao USING btree (revogada_em)
  WHERE revogada_em IS NOT NULL;

CREATE TABLE public.auth_usuario_contexto (
  usuario_id integer NOT NULL,
  ultima_area_ativa text NOT NULL DEFAULT 'usuario',
  atualizado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_usuario_contexto_pkey PRIMARY KEY (usuario_id),
  CONSTRAINT auth_usuario_contexto_usuario_fkey
    FOREIGN KEY (usuario_id)
    REFERENCES public.usuarios (id)
    ON DELETE RESTRICT
    NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_usuario_contexto_area_ativa_fkey
    FOREIGN KEY (ultima_area_ativa)
    REFERENCES public.auth_perfis (codigo)
    ON DELETE RESTRICT
    NOT DEFERRABLE INITIALLY IMMEDIATE
);
