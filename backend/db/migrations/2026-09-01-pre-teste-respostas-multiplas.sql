-- Modos de resposta por cardinalidade para o pré-teste diagnóstico.
--
-- Migração aditiva e compatível:
-- - questões objetivas históricas passam a resposta_unica;
-- - respostas históricas continuam em alternativa_id;
-- - a distinção entre os modos representa somente a cardinalidade;
-- - respostas múltiplas novas usam alternativas_ids para as seleções.
--
-- O runner oficial envolve este arquivo em uma transação.

SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

DO $preflight_pre_teste_multiplas$
DECLARE
  v_tipo text;
BEGIN
  IF to_regclass('public.pre_teste_perguntas') IS NULL
     OR to_regclass('public.pre_teste_alternativas') IS NULL
     OR to_regclass('public.pre_teste_respostas') IS NULL THEN
    RAISE EXCEPTION
      'Preflight pre-teste múltiplo: tabelas-base do pré-teste devem existir';
  END IF;

  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO v_tipo
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.pre_teste_perguntas'::regclass
     AND a.attname = 'modo_resposta'
     AND a.attnum > 0
     AND NOT a.attisdropped;
  IF v_tipo IS NOT NULL AND v_tipo <> 'text' THEN
    RAISE EXCEPTION 'pre_teste_perguntas.modo_resposta possui tipo incompatível: %', v_tipo;
  END IF;

  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO v_tipo
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.pre_teste_respostas'::regclass
     AND a.attname = 'alternativas_ids'
     AND a.attnum > 0
     AND NOT a.attisdropped;
  IF v_tipo IS NOT NULL AND v_tipo <> 'integer[]' THEN
    RAISE EXCEPTION 'pre_teste_respostas.alternativas_ids possui tipo incompatível: %', v_tipo;
  END IF;
END
$preflight_pre_teste_multiplas$;

ALTER TABLE public.pre_teste_perguntas
  ADD COLUMN IF NOT EXISTS modo_resposta text NULL;

UPDATE public.pre_teste_perguntas
   SET modo_resposta = 'resposta_unica'
 WHERE tipo = 'multipla_escolha'
   AND modo_resposta IS NULL;

UPDATE public.pre_teste_perguntas
   SET modo_resposta = NULL
 WHERE tipo = 'dissertativa'
   AND modo_resposta IS NOT NULL;

ALTER TABLE public.pre_teste_perguntas
  DROP CONSTRAINT IF EXISTS pre_teste_perguntas_modo_resposta_check;

ALTER TABLE public.pre_teste_perguntas
  ADD CONSTRAINT pre_teste_perguntas_modo_resposta_check
  CHECK (
    (
      tipo = 'multipla_escolha'
      AND modo_resposta IS NOT NULL
      AND modo_resposta IN ('resposta_unica', 'respostas_multiplas')
    )
    OR (tipo = 'dissertativa' AND modo_resposta IS NULL)
  );

ALTER TABLE public.pre_teste_respostas
  ADD COLUMN IF NOT EXISTS alternativas_ids integer[] NULL;

ALTER TABLE public.pre_teste_respostas
  DROP CONSTRAINT IF EXISTS pre_teste_respostas_formato_check;

ALTER TABLE public.pre_teste_respostas
  ADD CONSTRAINT pre_teste_respostas_formato_check
  CHECK (
    (
      alternativa_id IS NOT NULL
      AND alternativas_ids IS NULL
      AND resposta_texto IS NULL
    )
    OR (
      alternativa_id IS NULL
      AND alternativas_ids IS NOT NULL
      AND cardinality(alternativas_ids) > 0
      AND resposta_texto IS NULL
    )
    OR (
      alternativa_id IS NULL
      AND alternativas_ids IS NULL
      AND resposta_texto IS NOT NULL
      AND btrim(resposta_texto) <> ''
    )
  );

CREATE OR REPLACE FUNCTION public.pre_teste_validar_resposta()
RETURNS trigger
LANGUAGE plpgsql
AS $funcao$
DECLARE
  v_tipo text;
  v_modo_resposta text;
  v_total_ids integer;
  v_total_distintos integer;
  v_total_validos integer;
BEGIN
  SELECT p.tipo, p.modo_resposta
    INTO v_tipo, v_modo_resposta
    FROM public.pre_teste_submissoes s
    JOIN public.pre_teste_perguntas p ON p.versao_id = s.versao_id
   WHERE s.id = NEW.submissao_id
     AND p.id = NEW.pergunta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Pergunta não pertence à versão da submissão';
  END IF;

  IF v_tipo = 'multipla_escolha'
     AND v_modo_resposta = 'resposta_unica' THEN
    IF NEW.alternativa_id IS NULL
       OR NEW.alternativas_ids IS NOT NULL
       OR NEW.resposta_texto IS NOT NULL THEN
      RAISE EXCEPTION
        'Pergunta de resposta única exige somente alternativa_id';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.pre_teste_alternativas a
       WHERE a.id = NEW.alternativa_id
         AND a.pergunta_id = NEW.pergunta_id
    ) THEN
      RAISE EXCEPTION
        'Alternativa não pertence à pergunta informada';
    END IF;
  ELSIF v_tipo = 'multipla_escolha'
        AND v_modo_resposta = 'respostas_multiplas' THEN
    IF NEW.alternativa_id IS NOT NULL
       OR NEW.alternativas_ids IS NULL
       OR cardinality(NEW.alternativas_ids) = 0
       OR NEW.resposta_texto IS NOT NULL THEN
      RAISE EXCEPTION
        'Pergunta de respostas múltiplas exige somente alternativas_ids';
    END IF;

    IF array_position(NEW.alternativas_ids, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'alternativas_ids não aceita valores nulos';
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT alternativa_id)
      INTO v_total_ids, v_total_distintos
      FROM unnest(NEW.alternativas_ids) AS selecionada(alternativa_id);

    IF v_total_ids <> v_total_distintos THEN
      RAISE EXCEPTION 'alternativas_ids não aceita valores repetidos';
    END IF;

    SELECT COUNT(*)
      INTO v_total_validos
      FROM public.pre_teste_alternativas a
     WHERE a.pergunta_id = NEW.pergunta_id
       AND a.id = ANY(NEW.alternativas_ids);

    IF v_total_validos <> v_total_ids THEN
      RAISE EXCEPTION
        'Uma ou mais alternativas não pertencem à pergunta informada';
    END IF;
  ELSIF v_tipo = 'dissertativa' THEN
    IF NEW.alternativa_id IS NOT NULL
       OR NEW.alternativas_ids IS NOT NULL
       OR NEW.resposta_texto IS NULL
       OR btrim(NEW.resposta_texto) = '' THEN
      RAISE EXCEPTION
        'Pergunta dissertativa exige somente resposta_texto não vazia';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo ou modo de resposta inválido';
  END IF;

  RETURN NEW;
END
$funcao$;

DROP TRIGGER IF EXISTS pre_teste_respostas_validar_trigger
  ON public.pre_teste_respostas;

CREATE TRIGGER pre_teste_respostas_validar_trigger
BEFORE INSERT OR UPDATE OF
  submissao_id,
  pergunta_id,
  alternativa_id,
  alternativas_ids,
  resposta_texto
ON public.pre_teste_respostas
FOR EACH ROW
EXECUTE FUNCTION public.pre_teste_validar_resposta();
