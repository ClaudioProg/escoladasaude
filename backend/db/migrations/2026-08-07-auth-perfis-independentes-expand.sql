-- Bloco 1 / EXPAND: catálogo de perfis globais independentes.
--
-- Esta migration não altera usuarios.perfil nem qualquer autorização existente.
-- As relações de domínio abaixo são consultadas exclusivamente para formar o
-- backfill inicial; elas não passam a conceder perfis automaticamente.
--
-- O runner atual envolve migrations sem BEGIN/COMMIT em uma transação. Por isso,
-- este arquivo não abre uma transação própria e não usa CREATE INDEX CONCURRENTLY.

-- Deve ser o primeiro comando executável: a segurança concorrente do backfill
-- não pode depender de default_transaction_isolation configurado no servidor.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

DO $preflight_estrutural$
DECLARE
  v_usuarios_id_tipo_oid oid;
  v_usuarios_id_tipo_mod integer;
  v_usuarios_id_tipo_nome text;
  v_usuarios_id_attnum smallint;
  v_usuarios_id_base_tipo oid;
  v_relacao_tipo_oid oid;
  v_relacao_tipo_mod integer;
BEGIN
  -- Reexecução sobre objetos já existentes deve falhar: aceitar qualquer shape
  -- anterior com IF NOT EXISTS poderia mascarar uma implantação parcial.
  IF to_regclass('public.auth_perfis') IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: public.auth_perfis já existe; inspeção manual obrigatória';
  END IF;

  IF to_regclass('public.auth_usuario_perfis') IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: public.auth_usuario_perfis já existe; inspeção manual obrigatória';
  END IF;

  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION 'Preflight auth/perfis: tabela public.usuarios não existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
     WHERE c.oid = 'public.usuarios'::regclass
       AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: public.usuarios não é tabela comum ou particionada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute a
     WHERE a.attrelid = 'public.usuarios'::regclass
       AND a.attname = 'perfil'
       AND a.attnum > 0
       AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'Preflight auth/perfis: coluna public.usuarios.perfil não existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute a
     WHERE a.attrelid = 'public.usuarios'::regclass
       AND a.attname = 'deleted_at'
       AND a.attnum > 0
       AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'Preflight auth/perfis: coluna public.usuarios.deleted_at não existe';
  END IF;

  SELECT a.atttypid,
         a.atttypmod,
         pg_catalog.format_type(a.atttypid, a.atttypmod),
         a.attnum,
         CASE WHEN t.typtype = 'd' THEN t.typbasetype ELSE t.oid END
    INTO v_usuarios_id_tipo_oid,
         v_usuarios_id_tipo_mod,
         v_usuarios_id_tipo_nome,
         v_usuarios_id_attnum,
         v_usuarios_id_base_tipo
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
   WHERE a.attrelid = 'public.usuarios'::regclass
     AND a.attname = 'id'
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attnotnull;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: public.usuarios.id não existe ou aceita NULL';
  END IF;

  -- Os IDs de bootstrap aprovados são inteiros. Um tipo físico diferente
  -- tornaria a interpretação desses IDs ambígua e deve ser revisado manualmente.
  IF v_usuarios_id_base_tipo NOT IN (
    'pg_catalog.int2'::regtype,
    'pg_catalog.int4'::regtype,
    'pg_catalog.int8'::regtype
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: tipo de public.usuarios.id (%) não é inteiro compatível',
      v_usuarios_id_tipo_nome;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_index i
     WHERE i.indrelid = 'public.usuarios'::regclass
       AND i.indisunique
       AND i.indisvalid
       AND i.indisready
       AND i.indimmediate
       AND i.indpred IS NULL
       AND i.indexprs IS NULL
       -- indnatts conta também colunas INCLUDE. Exigir uma única coluna física
       -- evita aceitar id apenas como INCLUDE de uma chave sobre outra coluna e
       -- não depende de pg_index.indnkeyatts, introduzido no PostgreSQL 11.
       AND i.indnatts = 1
       AND i.indkey[0] = v_usuarios_id_attnum
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: public.usuarios.id não possui chave única simples e válida';
  END IF;

  IF to_regclass('public.turma_responsavel') IS NULL THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: tabela public.turma_responsavel não existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
     WHERE c.oid = 'public.turma_responsavel'::regclass
       AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: public.turma_responsavel não é tabela comum ou particionada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute a
     WHERE a.attrelid = 'public.turma_responsavel'::regclass
       AND a.attname = 'papel'
       AND a.attnum > 0
       AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: coluna public.turma_responsavel.papel não existe';
  END IF;

  SELECT a.atttypid, a.atttypmod
    INTO v_relacao_tipo_oid, v_relacao_tipo_mod
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.turma_responsavel'::regclass
     AND a.attname = 'usuario_id'
     AND a.attnum > 0
     AND NOT a.attisdropped;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: coluna public.turma_responsavel.usuario_id não existe';
  END IF;

  IF v_relacao_tipo_oid IS DISTINCT FROM v_usuarios_id_tipo_oid
     OR v_relacao_tipo_mod IS DISTINCT FROM v_usuarios_id_tipo_mod THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: turma_responsavel.usuario_id não tem o mesmo tipo físico de usuarios.id';
  END IF;

  IF to_regclass('public.trabalhos_submissoes_avaliadores') IS NULL THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: tabela public.trabalhos_submissoes_avaliadores não existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
     WHERE c.oid = 'public.trabalhos_submissoes_avaliadores'::regclass
       AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: public.trabalhos_submissoes_avaliadores não é tabela comum ou particionada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute a
     WHERE a.attrelid = 'public.trabalhos_submissoes_avaliadores'::regclass
       AND a.attname = 'revoked_at'
       AND a.attnum > 0
       AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: coluna trabalhos_submissoes_avaliadores.revoked_at não existe';
  END IF;

  SELECT a.atttypid, a.atttypmod
    INTO v_relacao_tipo_oid, v_relacao_tipo_mod
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.trabalhos_submissoes_avaliadores'::regclass
     AND a.attname = 'avaliador_id'
     AND a.attnum > 0
     AND NOT a.attisdropped;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: coluna trabalhos_submissoes_avaliadores.avaliador_id não existe';
  END IF;

  IF v_relacao_tipo_oid IS DISTINCT FROM v_usuarios_id_tipo_oid
     OR v_relacao_tipo_mod IS DISTINCT FROM v_usuarios_id_tipo_mod THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: trabalhos_submissoes_avaliadores.avaliador_id não tem o mesmo tipo físico de usuarios.id';
  END IF;
END
$preflight_estrutural$;

-- Ordem fixa de aquisição: usuários primeiro e, depois, as duas fontes de
-- classificação. SHARE ROW EXCLUSIVE em usuarios evita upgrade de lock no
-- CREATE TRIGGER posterior. SHARE é suficiente nas fontes somente lidas. Ambos
-- bloqueiam INSERT/UPDATE/DELETE e permitem SELECT até o COMMIT do runner.
LOCK TABLE public.usuarios
  IN SHARE ROW EXCLUSIVE MODE;

LOCK TABLE public.turma_responsavel
  IN SHARE MODE;

LOCK TABLE public.trabalhos_submissoes_avaliadores
  IN SHARE MODE;

DO $preflight_dados$
DECLARE
  v_detalhes text;
  v_quantidade bigint;
BEGIN
  -- Somente os três códigos escalares legados possuem regra de conversão
  -- aprovada. NULL, diferenças de caixa ou qualquer outro valor abortam.
  SELECT string_agg(
           format('%s (%s)', perfil_legado, quantidade),
           ', ' ORDER BY perfil_legado
         )
    INTO v_detalhes
    FROM (
      SELECT COALESCE(u.perfil::text, '<NULL>') AS perfil_legado,
             count(*) AS quantidade
        FROM public.usuarios u
       WHERE u.perfil IS NULL
          OR u.perfil::text NOT IN ('usuario', 'organizador', 'administrador')
       GROUP BY COALESCE(u.perfil::text, '<NULL>')
    ) desconhecidos;

  IF v_detalhes IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: valores desconhecidos em usuarios.perfil: %',
      v_detalhes;
  END IF;

  -- Todos os IDs administrativos usados no bootstrap precisam existir, estar
  -- ativos e ainda possuir o perfil escalar aprovado. A mensagem contém somente
  -- IDs, códigos e estado de exclusão.
  WITH administradores_esperados(usuario_id) AS (
    VALUES
      (8), (11), (12), (13), (14), (15), (16),
      (17), (18), (19), (36), (442), (1349), (2411)
  )
  SELECT string_agg(
           format(
             '%s=%s/%s',
             e.usuario_id,
             COALESCE(u.perfil::text, '<ausente>'),
             CASE
               WHEN u.id IS NULL THEN 'ausente'
               WHEN u.deleted_at IS NULL THEN 'ativo'
               ELSE 'excluido'
             END
           ),
           ', ' ORDER BY e.usuario_id
         )
    INTO v_detalhes
   FROM administradores_esperados e
    LEFT JOIN public.usuarios u ON u.id = e.usuario_id
   WHERE u.id IS NULL
      OR u.perfil::text IS DISTINCT FROM 'administrador'
      OR u.deleted_at IS NOT NULL;

  IF v_detalhes IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: IDs administrativos ausentes, excluídos ou com perfil inesperado: %',
      v_detalhes;
  END IF;

  -- Uma relação relevante sem usuário correspondente impediria afirmar a quem
  -- o vínculo pertence. Duplicidades de vínculo não são ambíguas: o backfill
  -- usa EXISTS e concede no máximo um perfil por usuário.
  SELECT count(*)
    INTO v_quantidade
    FROM public.turma_responsavel tr
    LEFT JOIN public.usuarios u ON u.id = tr.usuario_id
   WHERE tr.papel::text = 'organizador'
     AND (tr.usuario_id IS NULL OR u.id IS NULL);

  IF v_quantidade <> 0 THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: % vínculos relevantes de organizador sem usuário válido',
      v_quantidade;
  END IF;

  SELECT count(*)
    INTO v_quantidade
    FROM public.trabalhos_submissoes_avaliadores tsa
    LEFT JOIN public.usuarios u ON u.id = tsa.avaliador_id
   WHERE tsa.revoked_at IS NULL
     AND (tsa.avaliador_id IS NULL OR u.id IS NULL);

  IF v_quantidade <> 0 THEN
    RAISE EXCEPTION
      'Preflight auth/perfis: % vínculos ativos de avaliador sem usuário válido',
      v_quantidade;
  END IF;
END
$preflight_dados$;

CREATE TABLE public.auth_perfis (
  codigo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_perfis_pkey PRIMARY KEY (codigo),
  CONSTRAINT auth_perfis_codigo_check CHECK (
    codigo IN (
      'usuario',
      'institucional',
      'organizador',
      'administrador',
      'gestor',
      'diagnostico',
      'avaliador',
      'relator',
      'cai_administrador',
      'cai_coordenador'
    )
  )
);

COMMENT ON TABLE public.auth_perfis IS
  'Catálogo controlado dos perfis globais independentes de autorização.';

COMMENT ON COLUMN public.auth_perfis.codigo IS
  'Código canônico sem hierarquia ou herança implícita entre perfis.';

INSERT INTO public.auth_perfis (codigo)
VALUES
  ('usuario'),
  ('institucional'),
  ('organizador'),
  ('administrador'),
  ('gestor'),
  ('diagnostico'),
  ('avaliador'),
  ('relator'),
  ('cai_administrador'),
  ('cai_coordenador');

DO $criar_auth_usuario_perfis$
DECLARE
  v_usuarios_id_tipo_nome text;
BEGIN
  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO STRICT v_usuarios_id_tipo_nome
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.usuarios'::regclass
     AND a.attname = 'id'
     AND a.attnum > 0
     AND NOT a.attisdropped;

  -- format_type preserva o tipo físico de usuarios.id, inclusive domínio ou
  -- qualificação de schema, em ambas as colunas que referenciam usuários.
  EXECUTE format(
    $ddl$
      CREATE TABLE public.auth_usuario_perfis (
        usuario_id %1$s NOT NULL,
        perfil_codigo text NOT NULL,
        concedido_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        concedido_por_usuario_id %1$s NULL,
        origem text NOT NULL,
        justificativa text NULL,
        CONSTRAINT auth_usuario_perfis_pkey
          PRIMARY KEY (usuario_id, perfil_codigo),
        CONSTRAINT auth_usuario_perfis_usuario_fkey
          FOREIGN KEY (usuario_id)
          REFERENCES public.usuarios (id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        CONSTRAINT auth_usuario_perfis_perfil_fkey
          FOREIGN KEY (perfil_codigo)
          REFERENCES public.auth_perfis (codigo)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        CONSTRAINT auth_usuario_perfis_concedido_por_fkey
          FOREIGN KEY (concedido_por_usuario_id)
          REFERENCES public.usuarios (id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
        CONSTRAINT auth_usuario_perfis_origem_check CHECK (
          origem IN (
            'backfill_usuario_obrigatorio',
            'backfill_relacoes_dominio',
            'bootstrap_administradores',
            'concessao_gestor',
            'sistema'
          )
        )
      )
    $ddl$,
    v_usuarios_id_tipo_nome
  );
END
$criar_auth_usuario_perfis$;

COMMENT ON TABLE public.auth_usuario_perfis IS
  'Associações independentes entre usuários e perfis globais.';

COMMENT ON COLUMN public.auth_usuario_perfis.concedido_por_usuario_id IS
  'Ator que concedeu o perfil; RESTRICT preserva a atribuição histórica.';

COMMENT ON COLUMN public.auth_usuario_perfis.origem IS
  'Código controlado da origem da concessão; relações de domínio não concedem acesso após o backfill.';

COMMENT ON COLUMN public.auth_usuario_perfis.justificativa IS
  'Justificativa opcional da concessão, sem dados pessoais no bootstrap.';

-- Protege a associação-base contra remoção ou transferência. O trigger observa
-- todo UPDATE, mas atualizações de metadados continuam permitidas porque a
-- função rejeita somente mudanças na identidade da associação-base.
CREATE FUNCTION public.auth_proteger_perfil_base_usuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $auth_proteger_perfil_base_usuario$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.perfil_codigo = 'usuario' THEN
      RAISE EXCEPTION
        'Auth/perfis: o perfil-base usuario não pode ser removido enquanto a conta existir';
    END IF;

    RETURN OLD;
  END IF;

  IF (
       OLD.perfil_codigo = 'usuario'
       OR NEW.perfil_codigo = 'usuario'
     )
     AND (
       NEW.perfil_codigo IS DISTINCT FROM OLD.perfil_codigo
       OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     ) THEN
    RAISE EXCEPTION
      'Auth/perfis: o perfil-base usuario não pode ser convertido nem transferido';
  END IF;

  RETURN NEW;
END
$auth_proteger_perfil_base_usuario$;

CREATE TRIGGER auth_usuario_perfis_proteger_perfil_base
BEFORE DELETE OR UPDATE
ON public.auth_usuario_perfis
FOR EACH ROW
EXECUTE PROCEDURE public.auth_proteger_perfil_base_usuario();

-- O cadastro legado ainda escreve apenas em usuarios. Este trigger específico
-- garante o perfil-base na mesma transação do INSERT, usando privilégios do dono
-- da função e search_path fechado para não depender do papel da aplicação.
CREATE FUNCTION public.auth_garantir_perfil_base_usuario_apos_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $auth_garantir_perfil_base_usuario_apos_insert$
BEGIN
  -- Embora RETURNS trigger já impeça chamada SQL comum, a função privilegiada
  -- também valida seu vínculo exato para não poder ser reutilizada em outro
  -- trigger, tabela, evento, timing ou granularidade.
  IF TG_RELID IS DISTINCT FROM 'public.usuarios'::regclass
     OR TG_OP IS DISTINCT FROM 'INSERT'
     OR TG_WHEN IS DISTINCT FROM 'AFTER'
     OR TG_LEVEL IS DISTINCT FROM 'ROW' THEN
    RAISE EXCEPTION
      'Auth/perfis: contexto inválido para concessão automática do perfil-base';
  END IF;

  INSERT INTO public.auth_usuario_perfis (
    usuario_id,
    perfil_codigo,
    concedido_em,
    concedido_por_usuario_id,
    origem,
    justificativa
  )
  VALUES (
    NEW.id,
    'usuario',
    CURRENT_TIMESTAMP,
    NULL,
    'sistema',
    NULL
  )
  ON CONFLICT (usuario_id, perfil_codigo) DO NOTHING;

  RETURN NEW;
END
$auth_garantir_perfil_base_usuario_apos_insert$;

CREATE TRIGGER auth_usuarios_garantir_perfil_base_apos_insert
AFTER INSERT
ON public.usuarios
FOR EACH ROW
EXECUTE PROCEDURE public.auth_garantir_perfil_base_usuario_apos_insert();

-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão. Os triggers já estão
-- instalados e continuam funcionais sem concessão à role da aplicação; somente
-- removemos a superfície de invocação deliberada das funções.
REVOKE EXECUTE
  ON FUNCTION public.auth_proteger_perfil_base_usuario()
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.auth_garantir_perfil_base_usuario_apos_insert()
  FROM PUBLIC;

COMMENT ON FUNCTION public.auth_proteger_perfil_base_usuario() IS
  'Impede remover, converter ou transferir a associação global usuario.';

COMMENT ON FUNCTION public.auth_garantir_perfil_base_usuario_apos_insert() IS
  'Concede idempotentemente o perfil-base usuario após inserir uma conta.';

COMMENT ON TRIGGER auth_usuario_perfis_proteger_perfil_base
  ON public.auth_usuario_perfis IS
  'Protege a associação usuario contra DELETE e mudança de sua identidade.';

COMMENT ON TRIGGER auth_usuarios_garantir_perfil_base_apos_insert
  ON public.usuarios IS
  'Garante perfil usuario para toda nova linha de public.usuarios.';

-- Índices de apoio para consultar membros de um perfil e o histórico por ator.
-- Não são CONCURRENTLY porque o runner executa a migration em transação.
CREATE INDEX auth_usuario_perfis_perfil_usuario_idx
  ON public.auth_usuario_perfis (perfil_codigo, usuario_id);

CREATE INDEX auth_usuario_perfis_concedido_por_idx
  ON public.auth_usuario_perfis (concedido_por_usuario_id)
  WHERE concedido_por_usuario_id IS NOT NULL;

-- A tabela temporária materializa toda a matriz aprovada antes do INSERT. Ela
-- permite validar duplicidades, catálogo, contagens e igualdade exata ao final.
CREATE TEMPORARY TABLE auth_usuario_perfis_backfill_esperado
ON COMMIT DROP
AS
  -- A) Toda conta existente recebe o perfil global obrigatório usuario.
  SELECT u.id AS usuario_id,
         'usuario'::text AS perfil_codigo,
         'backfill_usuario_obrigatorio'::text AS origem
    FROM public.usuarios u

  UNION ALL

  -- B) Somente organizadores escalares com relação real relevante recebem
  -- organizador. O ID 10 é excluído expressamente de todo perfil não-usuario.
  SELECT u.id AS usuario_id,
         'organizador'::text AS perfil_codigo,
         'backfill_relacoes_dominio'::text AS origem
    FROM public.usuarios u
   WHERE u.perfil::text = 'organizador'
     AND u.id <> 10
     AND EXISTS (
       SELECT 1
         FROM public.turma_responsavel tr
        WHERE tr.usuario_id = u.id
          AND tr.papel::text = 'organizador'
     )

  UNION ALL

  -- B) O perfil avaliador exige vínculo não revogado, independentemente de
  -- existir também vínculo de organizador.
  SELECT u.id AS usuario_id,
         'avaliador'::text AS perfil_codigo,
         'backfill_relacoes_dominio'::text AS origem
    FROM public.usuarios u
   WHERE u.perfil::text = 'organizador'
     AND u.id <> 10
     AND EXISTS (
       SELECT 1
         FROM public.trabalhos_submissoes_avaliadores tsa
        WHERE tsa.avaliador_id = u.id
          AND tsa.revoked_at IS NULL
     )

  UNION ALL

  -- C) Todo administrador escalar mantém apenas a concessão administrativa
  -- básica, salvo os acréscimos nominais aprovados abaixo. O ID 10 continua
  -- protegido pela exceção expressa caso seu perfil legado esteja inesperadamente
  -- classificado como administrador.
  SELECT u.id AS usuario_id,
         'administrador'::text AS perfil_codigo,
         'bootstrap_administradores'::text AS origem
    FROM public.usuarios u
   WHERE u.perfil::text = 'administrador'
     AND u.id <> 10

  UNION ALL

  -- C) Organizador para 8, 17, 12, 16, 36, 442 e 1349.
  SELECT u.id AS usuario_id,
         'organizador'::text AS perfil_codigo,
         'bootstrap_administradores'::text AS origem
    FROM public.usuarios u
    JOIN (
      VALUES (8), (17), (12), (16), (36), (442), (1349)
    ) AS aprovados(usuario_id) ON aprovados.usuario_id = u.id

  UNION ALL

  -- C) Avaliador para o grupo anterior e também para o ID 13.
  SELECT u.id AS usuario_id,
         'avaliador'::text AS perfil_codigo,
         'bootstrap_administradores'::text AS origem
    FROM public.usuarios u
    JOIN (
      VALUES (8), (17), (12), (16), (36), (442), (1349), (13)
    ) AS aprovados(usuario_id) ON aprovados.usuario_id = u.id

  UNION ALL

  -- C) Somente 8 e 17 recebem os três perfis adicionais abaixo.
  SELECT u.id AS usuario_id,
         adicionais.perfil_codigo,
         'bootstrap_administradores'::text AS origem
    FROM public.usuarios u
    JOIN (VALUES (8), (17)) AS aprovados(usuario_id)
      ON aprovados.usuario_id = u.id
   CROSS JOIN (
      VALUES
        ('institucional'::text),
        ('gestor'::text),
        ('diagnostico'::text)
   ) AS adicionais(perfil_codigo);

DO $validar_backfill_esperado$
DECLARE
  v_detalhes text;
BEGIN
  SELECT string_agg(
           format('%s/%s (%s vezes)', usuario_id, perfil_codigo, quantidade),
           ', ' ORDER BY usuario_id, perfil_codigo
         )
    INTO v_detalhes
    FROM (
      SELECT e.usuario_id, e.perfil_codigo, count(*) AS quantidade
        FROM pg_temp.auth_usuario_perfis_backfill_esperado e
       GROUP BY e.usuario_id, e.perfil_codigo
      HAVING count(*) <> 1
    ) duplicados;

  IF v_detalhes IS NOT NULL THEN
    RAISE EXCEPTION
      'Backfill auth/perfis ambíguo: associações esperadas duplicadas: %',
      v_detalhes;
  END IF;

  SELECT string_agg(e.perfil_codigo, ', ' ORDER BY e.perfil_codigo)
    INTO v_detalhes
    FROM (
      SELECT DISTINCT esperado.perfil_codigo
        FROM pg_temp.auth_usuario_perfis_backfill_esperado esperado
        LEFT JOIN public.auth_perfis p
          ON p.codigo = esperado.perfil_codigo
       WHERE p.codigo IS NULL
    ) e;

  IF v_detalhes IS NOT NULL THEN
    RAISE EXCEPTION
      'Backfill auth/perfis contém códigos fora do catálogo: %',
      v_detalhes;
  END IF;
END
$validar_backfill_esperado$;

INSERT INTO public.auth_usuario_perfis (
  usuario_id,
  perfil_codigo,
  concedido_em,
  concedido_por_usuario_id,
  origem,
  justificativa
)
SELECT e.usuario_id,
       e.perfil_codigo,
       CURRENT_TIMESTAMP,
       NULL,
       e.origem,
       NULL
  FROM pg_temp.auth_usuario_perfis_backfill_esperado e
 ORDER BY e.usuario_id, e.perfil_codigo;

DO $validacoes_finais$
DECLARE
  v_esperado bigint;
  v_atual bigint;
  v_detalhes text;
BEGIN
  -- Validação final independente da tabela temporária: os IDs nominais precisam
  -- continuar existentes, ativos e administradores no legado até o commit.
  WITH administradores_esperados(usuario_id) AS (
    VALUES
      (8), (11), (12), (13), (14), (15), (16),
      (17), (18), (19), (36), (442), (1349), (2411)
  )
  SELECT string_agg(
           format(
             '%s=%s/%s',
             e.usuario_id,
             COALESCE(u.perfil::text, '<ausente>'),
             CASE
               WHEN u.id IS NULL THEN 'ausente'
               WHEN u.deleted_at IS NULL THEN 'ativo'
               ELSE 'excluido'
             END
           ),
           ', ' ORDER BY e.usuario_id
         )
    INTO v_detalhes
    FROM administradores_esperados e
    LEFT JOIN public.usuarios u ON u.id = e.usuario_id
   WHERE u.id IS NULL
      OR u.perfil::text IS DISTINCT FROM 'administrador'
      OR u.deleted_at IS NOT NULL;

  IF v_detalhes IS NOT NULL THEN
    RAISE EXCEPTION
      'Validação auth/perfis: IDs administrativos ausentes, excluídos ou com perfil inesperado: %',
      v_detalhes;
  END IF;

  -- Confirma que os dois mecanismos duráveis foram criados e estão habilitados.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger t
     WHERE t.tgrelid = 'public.usuarios'::regclass
       AND t.tgname = 'auth_usuarios_garantir_perfil_base_apos_insert'
       AND NOT t.tgisinternal
       AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION
      'Validação auth/perfis: trigger de concessão automática do perfil-base ausente ou desabilitado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger t
     WHERE t.tgrelid = 'public.auth_usuario_perfis'::regclass
       AND t.tgname = 'auth_usuario_perfis_proteger_perfil_base'
       AND NOT t.tgisinternal
       AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION
      'Validação auth/perfis: trigger de proteção do perfil-base ausente ou desabilitado';
  END IF;

  -- O catálogo deve possuir exatamente os dez códigos canônicos: nenhum a mais
  -- e nenhum a menos.
  SELECT count(*) INTO v_atual FROM public.auth_perfis;

  IF v_atual <> 10
     OR EXISTS (
       SELECT codigo
         FROM (
           VALUES
             ('usuario'),
             ('institucional'),
             ('organizador'),
             ('administrador'),
             ('gestor'),
             ('diagnostico'),
             ('avaliador'),
             ('relator'),
             ('cai_administrador'),
             ('cai_coordenador')
         ) AS canonicos(codigo)
       EXCEPT
       SELECT p.codigo FROM public.auth_perfis p
     )
     OR EXISTS (
       SELECT p.codigo FROM public.auth_perfis p
       EXCEPT
       SELECT codigo
         FROM (
           VALUES
             ('usuario'),
             ('institucional'),
             ('organizador'),
             ('administrador'),
             ('gestor'),
             ('diagnostico'),
             ('avaliador'),
             ('relator'),
             ('cai_administrador'),
             ('cai_coordenador')
         ) AS canonicos(codigo)
     ) THEN
    RAISE EXCEPTION
      'Validação auth/perfis: catálogo diferente dos dez códigos canônicos';
  END IF;

  SELECT count(*)
    INTO v_esperado
    FROM pg_temp.auth_usuario_perfis_backfill_esperado;

  SELECT count(*)
    INTO v_atual
    FROM public.auth_usuario_perfis;

  IF v_atual <> v_esperado THEN
    RAISE EXCEPTION
      'Validação auth/perfis: total de associações atual (%) difere do esperado (%)',
      v_atual,
      v_esperado;
  END IF;

  -- A igualdade é conferida também pelo conjunto completo, incluindo a origem.
  IF EXISTS (
    SELECT e.usuario_id, e.perfil_codigo, e.origem
      FROM pg_temp.auth_usuario_perfis_backfill_esperado e
    EXCEPT
    SELECT a.usuario_id, a.perfil_codigo, a.origem
      FROM public.auth_usuario_perfis a
  ) OR EXISTS (
    SELECT a.usuario_id, a.perfil_codigo, a.origem
      FROM public.auth_usuario_perfis a
    EXCEPT
    SELECT e.usuario_id, e.perfil_codigo, e.origem
      FROM pg_temp.auth_usuario_perfis_backfill_esperado e
  ) THEN
    RAISE EXCEPTION
      'Validação auth/perfis: associações persistidas diferem da matriz aprovada';
  END IF;

  -- Contagens por perfil facilitam detectar qualquer desvio de classificação.
  SELECT string_agg(
           format(
             '%s: esperado=%s, atual=%s',
             codigo,
             quantidade_esperada,
             quantidade_atual
           ),
           '; ' ORDER BY codigo
         )
    INTO v_detalhes
    FROM (
      SELECT p.codigo,
             (
               SELECT count(*)
                 FROM pg_temp.auth_usuario_perfis_backfill_esperado e
                WHERE e.perfil_codigo = p.codigo
             ) AS quantidade_esperada,
             (
               SELECT count(*)
                 FROM public.auth_usuario_perfis a
                WHERE a.perfil_codigo = p.codigo
             ) AS quantidade_atual
        FROM public.auth_perfis p
    ) contagens
   WHERE quantidade_esperada <> quantidade_atual;

  IF v_detalhes IS NOT NULL THEN
    RAISE EXCEPTION
      'Validação auth/perfis: contagens por perfil divergentes: %',
      v_detalhes;
  END IF;

  -- Validação direta e independente da matriz temporária para contas não
  -- excluídas: compara public.usuarios com a associação persistida.
  SELECT count(*)
    INTO v_atual
    FROM public.usuarios u
   WHERE u.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.auth_usuario_perfis a
        WHERE a.usuario_id = u.id
          AND a.perfil_codigo = 'usuario'
     );

  IF v_atual <> 0 THEN
    RAISE EXCEPTION
      'Validação auth/perfis: % usuários não excluídos estão sem o perfil usuario',
      v_atual;
  END IF;

  -- O contrato de backfill é mais forte: toda linha atual de usuarios, inclusive
  -- excluída logicamente, recebeu usuario conforme a matriz aprovada.
  SELECT count(*)
    INTO v_atual
    FROM public.usuarios u
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.auth_usuario_perfis a
      WHERE a.usuario_id = u.id
        AND a.perfil_codigo = 'usuario'
   );

  IF v_atual <> 0 THEN
    RAISE EXCEPTION
      'Validação auth/perfis: % usuários atuais estão sem o perfil usuario',
      v_atual;
  END IF;

  SELECT count(*)
    INTO v_atual
    FROM public.auth_usuario_perfis a
    LEFT JOIN public.auth_perfis p ON p.codigo = a.perfil_codigo
   WHERE p.codigo IS NULL;

  IF v_atual <> 0 THEN
    RAISE EXCEPTION
      'Validação auth/perfis: % associações apontam para código inexistente',
      v_atual;
  END IF;

  SELECT count(*)
    INTO v_atual
    FROM (
      SELECT a.usuario_id, a.perfil_codigo
        FROM public.auth_usuario_perfis a
       GROUP BY a.usuario_id, a.perfil_codigo
      HAVING count(*) > 1
    ) duplicados;

  IF v_atual <> 0 THEN
    RAISE EXCEPTION
      'Validação auth/perfis: % pares usuario/perfil estão duplicados',
      v_atual;
  END IF;

  SELECT count(*)
    INTO v_atual
    FROM public.auth_usuario_perfis a
    LEFT JOIN public.usuarios u ON u.id = a.usuario_id
   WHERE u.id IS NULL;

  IF v_atual <> 0 THEN
    RAISE EXCEPTION
      'Validação auth/perfis: % associações apontam para usuário inexistente',
      v_atual;
  END IF;

  SELECT count(*)
    INTO v_atual
    FROM public.auth_usuario_perfis a
    LEFT JOIN public.usuarios u ON u.id = a.concedido_por_usuario_id
   WHERE a.concedido_por_usuario_id IS NOT NULL
     AND u.id IS NULL;

  IF v_atual <> 0 THEN
    RAISE EXCEPTION
      'Validação auth/perfis: % concessões apontam para ator inexistente',
      v_atual;
  END IF;

  -- Exceção nominal: o ID 10 permanece somente com usuario, se existir.
  SELECT count(*)
    INTO v_atual
    FROM public.auth_usuario_perfis a
   WHERE a.usuario_id = 10
     AND a.perfil_codigo <> 'usuario';

  IF v_atual <> 0 THEN
    RAISE EXCEPTION
      'Validação auth/perfis: usuario_id 10 recebeu perfil além de usuario';
  END IF;

  -- D) Módulos novos permanecem sem atribuição inicial.
  SELECT count(*)
    INTO v_atual
    FROM public.auth_usuario_perfis a
   WHERE a.perfil_codigo IN (
     'relator',
     'cai_administrador',
     'cai_coordenador'
   );

  IF v_atual <> 0 THEN
    RAISE EXCEPTION
      'Validação auth/perfis: perfis de Relatoria/CAI receberam atribuição inicial';
  END IF;

  -- Gestor e diagnostico são concessões nominais exclusivas de 8 e 17.
  IF EXISTS (
    SELECT 1
      FROM public.auth_usuario_perfis a
     WHERE a.perfil_codigo IN ('gestor', 'diagnostico')
       AND a.usuario_id NOT IN (8, 17)
  ) OR EXISTS (
    SELECT aprovados.usuario_id, perfis.perfil_codigo
      FROM (VALUES (8), (17)) AS aprovados(usuario_id)
     CROSS JOIN (VALUES ('gestor'), ('diagnostico')) AS perfis(perfil_codigo)
    EXCEPT
    SELECT a.usuario_id, a.perfil_codigo
      FROM public.auth_usuario_perfis a
  ) THEN
    RAISE EXCEPTION
      'Validação auth/perfis: concessões de gestor/diagnostico divergem dos IDs 8 e 17';
  END IF;
END
$validacoes_finais$;
