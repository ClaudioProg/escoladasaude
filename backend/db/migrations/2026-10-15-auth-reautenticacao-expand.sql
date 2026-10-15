-- Etapa 14 / D5 parcial. Forward-only; sem ativacao. Runner controla a transacao.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

DO $preflight_reautenticacao$
BEGIN
  IF to_regclass('public.auth_reautenticacao_prova') IS NOT NULL
     OR to_regclass('public.auth_reautenticacao_tentativa') IS NOT NULL THEN
    RAISE EXCEPTION 'Persistencia de reautenticacao ja existe; inspecao obrigatoria';
  END IF;
  IF to_regclass('public.auth_sessao') IS NULL OR to_regclass('public.usuarios') IS NULL
     OR to_regclass('public.auth_contexto_restrito') IS NULL THEN
    RAISE EXCEPTION 'Infraestrutura de autenticacao/D2 ausente';
  END IF;
END
$preflight_reautenticacao$;

CREATE TABLE public.auth_reautenticacao_prova (
  token_hash bytea NOT NULL,
  sessao_id uuid NOT NULL,
  usuario_id integer NOT NULL,
  auth_version_esperada integer NOT NULL,
  finalidade text NOT NULL,
  criada_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  consumida_em timestamptz,
  CONSTRAINT auth_reautenticacao_prova_pkey PRIMARY KEY (token_hash),
  CONSTRAINT auth_reautenticacao_prova_sessao_fkey FOREIGN KEY (sessao_id)
    REFERENCES public.auth_sessao (id) ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_reautenticacao_prova_usuario_fkey FOREIGN KEY (usuario_id)
    REFERENCES public.usuarios (id) ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_reautenticacao_prova_hash_check CHECK (octet_length(token_hash) = 32),
  CONSTRAINT auth_reautenticacao_prova_versao_check CHECK (auth_version_esperada >= 1),
  CONSTRAINT auth_reautenticacao_prova_finalidade_check CHECK (
    finalidade IN ('trocar_senha', 'alterar_email', 'encerrar_conta', 'conceder_perfil')),
  CONSTRAINT auth_reautenticacao_prova_tempo_check CHECK (
    isfinite(criada_em) AND isfinite(expira_em) AND expira_em = criada_em + interval '5 minutes'
    AND (consumida_em IS NULL OR (isfinite(consumida_em) AND consumida_em >= criada_em AND consumida_em < expira_em)))
);
CREATE INDEX auth_reautenticacao_prova_sessao_idx ON public.auth_reautenticacao_prova (sessao_id);
CREATE INDEX auth_reautenticacao_prova_usuario_idx ON public.auth_reautenticacao_prova (usuario_id);

-- Reserva duravel independente da emissao: falha de senha nao desfaz a tentativa.
-- Sem IP/senha/token/hash de credencial. Janela/limite exigem configuracao explicita.
CREATE TABLE public.auth_reautenticacao_tentativa (
  id uuid NOT NULL,
  usuario_id integer NOT NULL,
  registrada_em timestamptz NOT NULL,
  CONSTRAINT auth_reautenticacao_tentativa_pkey PRIMARY KEY (id),
  CONSTRAINT auth_reautenticacao_tentativa_usuario_fkey FOREIGN KEY (usuario_id)
    REFERENCES public.usuarios (id) ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT auth_reautenticacao_tentativa_tempo_check CHECK (isfinite(registrada_em))
);
CREATE INDEX auth_reautenticacao_tentativa_usuario_tempo_idx
  ON public.auth_reautenticacao_tentativa (usuario_id, registrada_em);

-- Inclui writers legados sem incremento de versao. Nao altera trigger nem dados D2.
CREATE FUNCTION public.auth_reautenticacao_invalidar_critica()
RETURNS trigger LANGUAGE plpgsql AS $invalidar_reautenticacao$
BEGIN
  IF NEW.senha IS DISTINCT FROM OLD.senha OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.auth_version IS DISTINCT FROM OLD.auth_version
     OR NEW.email_version IS DISTINCT FROM OLD.email_version
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    DELETE FROM public.auth_reautenticacao_prova WHERE usuario_id = NEW.id;
  END IF;
  RETURN NEW;
END
$invalidar_reautenticacao$;
CREATE TRIGGER auth_reautenticacao_invalidar_critica_trg
AFTER UPDATE OF senha, email, auth_version, email_version, deleted_at ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.auth_reautenticacao_invalidar_critica();

CREATE FUNCTION public.auth_reautenticacao_invalidar_sessao()
RETURNS trigger LANGUAGE plpgsql AS $invalidar_reautenticacao_sessao$
BEGIN
  IF NEW.revogada_em IS DISTINCT FROM OLD.revogada_em
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.criada_em IS DISTINCT FROM OLD.criada_em THEN
    DELETE FROM public.auth_reautenticacao_prova WHERE sessao_id = NEW.id;
  END IF;
  RETURN NEW;
END
$invalidar_reautenticacao_sessao$;
CREATE TRIGGER auth_reautenticacao_invalidar_sessao_trg
AFTER UPDATE OF revogada_em, token_hash, usuario_id, criada_em ON public.auth_sessao
FOR EACH ROW EXECUTE FUNCTION public.auth_reautenticacao_invalidar_sessao();
