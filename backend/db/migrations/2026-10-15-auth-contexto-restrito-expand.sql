-- Etapa 13 / D2. Forward-only, sem backfill ou ativacao; runner controla a transacao.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

DO $preflight_contexto_restrito$
BEGIN
  IF to_regclass('public.auth_contexto_restrito') IS NOT NULL THEN
    RAISE EXCEPTION 'auth_contexto_restrito ja existe; inspecao obrigatoria';
  END IF;
  IF to_regclass('public.auth_sessao') IS NULL OR to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION 'Infraestrutura de autenticacao ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
     WHERE attrelid = 'public.auth_sessao'::regclass AND attname = 'id'
       AND atttypid = 'uuid'::regtype AND attnotnull AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
     WHERE attrelid = 'public.usuarios'::regclass AND attname = 'auth_version'
       AND atttypid = 'int4'::regtype AND attnotnull AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Contrato de sessao/versao incompativel';
  END IF;
END
$preflight_contexto_restrito$;

-- Identidade e revogacao pertencem a auth_sessao; nao duplicar usuario/token/progresso.
CREATE TABLE public.auth_contexto_restrito (
  sessao_id uuid NOT NULL,
  auth_version_esperada integer NOT NULL,
  iniciada_em timestamptz NOT NULL,
  ultimo_uso_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  limite_absoluto_em timestamptz NOT NULL,
  CONSTRAINT auth_contexto_restrito_pkey PRIMARY KEY (sessao_id),
  CONSTRAINT auth_contexto_restrito_sessao_fkey FOREIGN KEY (sessao_id)
    REFERENCES public.auth_sessao (id) ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_contexto_restrito_versao_check CHECK (auth_version_esperada >= 1),
  CONSTRAINT auth_contexto_restrito_finitos_check CHECK (
    isfinite(iniciada_em) AND isfinite(ultimo_uso_em) AND isfinite(expira_em) AND isfinite(limite_absoluto_em)),
  CONSTRAINT auth_contexto_restrito_absoluto_check CHECK (
    limite_absoluto_em = iniciada_em + interval '120 minutes'),
  CONSTRAINT auth_contexto_restrito_uso_check CHECK (ultimo_uso_em >= iniciada_em),
  CONSTRAINT auth_contexto_restrito_expira_check CHECK (
    expira_em > ultimo_uso_em AND expira_em <= ultimo_uso_em + interval '30 minutes'
    AND expira_em <= limite_absoluto_em)
);

-- Writers legados podem mudar senha/email sem incrementar auth_version.
-- Invalida SOMENTE o vinculo D2, sem alterar dados, versoes ou contratos legados.
CREATE FUNCTION public.auth_contexto_restrito_invalidar_critica()
RETURNS trigger
LANGUAGE plpgsql
AS $invalidar_contexto_restrito$
BEGIN
  IF NEW.senha IS DISTINCT FROM OLD.senha
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.auth_version IS DISTINCT FROM OLD.auth_version
     OR NEW.email_version IS DISTINCT FROM OLD.email_version
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    DELETE FROM public.auth_contexto_restrito c
    USING public.auth_sessao s
    WHERE c.sessao_id = s.id AND s.usuario_id = NEW.id;
  END IF;
  RETURN NEW;
END
$invalidar_contexto_restrito$;

CREATE TRIGGER auth_contexto_restrito_invalidar_critica_trg
AFTER UPDATE OF senha, email, auth_version, email_version, deleted_at ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.auth_contexto_restrito_invalidar_critica();
