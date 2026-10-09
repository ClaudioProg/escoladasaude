-- 2026-10-09: expansão compatível com o histórico dos trabalhos.
-- Não reescreve ou apaga chamadas, trabalhos, avaliações ou arquivos existentes.
BEGIN;

ALTER TABLE public.trabalhos_chamadas_modelos
  ADD COLUMN IF NOT EXISTS arquivo bytea;

ALTER TABLE public.trabalhos_submissoes
  ADD COLUMN IF NOT EXISTS motivo_status text;

-- Rascunhos podem possuir textos ainda não preenchidos.
ALTER TABLE public.trabalhos_submissoes
  ALTER COLUMN introducao DROP NOT NULL,
  ALTER COLUMN objetivos DROP NOT NULL,
  ALTER COLUMN metodo DROP NOT NULL,
  ALTER COLUMN resultados DROP NOT NULL,
  ALTER COLUMN consideracoes DROP NOT NULL;

-- Conserva os estados históricos e permite o contrato atual do aplicativo.
ALTER TABLE public.trabalhos_submissoes
  DROP CONSTRAINT IF EXISTS trabalhos_submissoes_status_check;
ALTER TABLE public.trabalhos_submissoes
  ADD CONSTRAINT trabalhos_submissoes_status_check CHECK (
    status IN (
      'rascunho', 'submetido', 'submetida', 'em_avaliacao',
      'aprovado_exposicao', 'aprovada_exposicao',
      'aprovado_oral', 'aprovada_oral',
      'aprovada', 'reprovado', 'reprovada', 'cancelada'
    )
  );

ALTER TABLE public.trabalhos_submissoes
  DROP CONSTRAINT IF EXISTS trabalhos_submissoes_campos_finais_obrigatorios;
ALTER TABLE public.trabalhos_submissoes
  ADD CONSTRAINT trabalhos_submissoes_campos_finais_obrigatorios CHECK (
    status = 'rascunho' OR (
      introducao IS NOT NULL AND btrim(introducao) <> '' AND
      objetivos IS NOT NULL AND btrim(objetivos) <> '' AND
      metodo IS NOT NULL AND btrim(metodo) <> '' AND
      resultados IS NOT NULL AND btrim(resultados) <> '' AND
      consideracoes IS NOT NULL AND btrim(consideracoes) <> ''
    )
  );

-- A interface admite chamadas sem coautores.
ALTER TABLE public.trabalhos_chamadas
  DROP CONSTRAINT IF EXISTS trabalhos_chamadas_max_coautores_positive_check;
ALTER TABLE public.trabalhos_chamadas
  ADD CONSTRAINT trabalhos_chamadas_max_coautores_nonnegative_check
  CHECK (max_coautores >= 0);

-- Mantém o contrato existente de 30 MB e as verificações de integridade.
ALTER TABLE public.trabalhos_arquivos
  DROP CONSTRAINT IF EXISTS trabalhos_arquivos_tamanho_max_14mb_check;
ALTER TABLE public.trabalhos_arquivos
  DROP CONSTRAINT IF EXISTS trabalhos_arquivos_tamanho_max_30mb_check;
ALTER TABLE public.trabalhos_arquivos
  ADD CONSTRAINT trabalhos_arquivos_tamanho_max_30mb_check
  CHECK (tamanho_bytes <= 31457280);

COMMIT;
