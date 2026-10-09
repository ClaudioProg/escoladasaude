# Migrations V3

**FATO DO REPOSITÓRIO:** inventário V3 conferido na base
`3210ad6c6a6b82c1ed65819f1b37e94839357ee5`, fechamento da Etapa 08 em
09/10/2026. Migration de quotas com rehearsal e revisão independente aprovados;
aplicada somente na branch descartável identificada abaixo. Presença no Git não
comprova aplicação em produção. Este inventário seleciona
migrations V3; não substitui o plano completo do runner para um alvo específico.

| Migration | Finalidade / status no repositório | Rehearsal conhecido | Produção |
| --- | --- | --- | --- |
| [2026-08-07-auth-perfis-independentes-expand.sql](../../backend/db/migrations/2026-08-07-auth-perfis-independentes-expand.sql) | `auth_perfis` e `auth_usuario_perfis`, catálogo/vínculos e bootstrap em expand. Commit `d469e7e8a1df22ce5b9c4771c3280455f206b95b`. | Aplicada no clone auth-recuperação durante preparo do rehearsal da Etapa 02. | Não comprovada por esta baseline. |
| [2026-08-25-auth-sessoes-contexto-expand.sql](../../backend/db/migrations/2026-08-25-auth-sessoes-contexto-expand.sql) | `auth_sessao` e `auth_usuario_contexto`, FKs/checks/índices. Commit `d500d90808710bb2aa3b1f112ef39fec62d08576`. | Aplicada no mesmo clone durante preparo do rehearsal da Etapa 02. | Não comprovada por esta baseline. |
| [2026-10-02-auth-email-recuperacao-senha-expand.sql](../../backend/db/migrations/2026-10-02-auth-email-recuperacao-senha-expand.sql) | Campos em `usuarios`, `auth_email_confirmacao`, `auth_recuperacao_senha`, `auth_senha_historico`. Commit `7e47b5d40e64fbfc1601b8b0001a50bfd24e95e8`. | Fechamento em PostgreSQL 16, clone isolado; preservação, integridade, concorrência, rollback e skip pelo ledger relatados. | Não comprovada por esta baseline. |
| [2026-10-09-auth-quotas-expand.sql](../../backend/db/migrations/2026-10-09-auth-quotas-expand.sql) | Etapa 08: tabela/eventos e índices de quotas; expand concluído, sem ativação. | 57/57 PostgreSQL; aplicada somente em `br-super-wave-adut7rdn`, ledger id 7; revisão independente aprovada em 09/10/2026. | Não implantada; rehearsal não comprova produção. |

## Etapa 08 — expand concluído, rehearsal aprovado

Arquivo: [2026-10-09-auth-quotas-expand.sql](../../backend/db/migrations/2026-10-09-auth-quotas-expand.sql).
SHA-256 dos bytes LF:
`a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a`.

Preflight verifica `usuarios.id INTEGER NOT NULL` com PK simples/imediata e
rejeita colisões de tabela/PK/índices antes do DDL. Cria somente
`public.auth_quota_evento`, oito constraints e três índices B-tree sobre a tabela
nova. Sem backfill, alteração das estruturas existentes, extensão, trigger de
aplicação, limpeza automática, ativação de quotas ou rate limit legado modificado.

Uma linha por emissão identifica conta, IP HMAC ou ambos; nunca sujeito vazio.
UUID fornecido pela aplicação, par HMAC/key_id íntegro, digest de 32 bytes,
key_id controlado, timestamp finito e FK imediata `ON DELETE RESTRICT`.
Nenhum segredo HMAC no SQL. Composição das finalidades continua aberta.

Contrato do runner, identidade/LF/SHA e dry-run do arquivo específico aprovados;
**149/149 testes locais**, sintaxe 2/2 e **57/57 provas PostgreSQL** aprovados.
Inventário oficial atualizado pontualmente. Revisão independente aprovada pelo
responsável em **09/10/2026**.

Aplicação oficial somente na branch Neon descartável `br-super-wave-adut7rdn`
(`rehearsal-etapa-08-descartavel`), filha de `br-small-union-ad2nicvt`
(`revisao-premium-ensaio-auth-recuperacao`). Nova linha do ledger: **id 7**,
identidade `db/migrations/2026-10-09-auth-quotas-expand.sql`, SHA acima.
DDL e ledger na mesma transação; segunda execução com mesmo SHA fez skip.
Estado final de `public.auth_quota_evento`: **0 linhas**.

Relatório aprovado: dados de **89 tabelas herdadas / 54.394 linhas**, seis linhas
anteriores do ledger e definições do catálogo legado preservados. O ledger passou
de 6 para 7 linhas. A nova FK cria triggers internos próprios, inclusive em
`usuarios`; triggers herdados não foram alterados. Estado mutável das sequências
não foi comparado. Falhas da migration/ledger e checksum divergente não foram
injetados no banco; testes locais do protocolo são simulados.

**Rehearsal aprovado não equivale a implantação em produção.** Quotas, HMAC
operacional, limpeza de 48 horas, integração e Etapa 09 permanecem pendentes.
Composição das finalidades, falhas de emissão, origem do IP, rotação HMAC e
operação da limpeza continuam abertas. Produção exige plano/autorização próprios;
não reaplicar migrations antigas ou modificar o checksum da migration aprovada.
Neste fechamento não houve SQL, migration ou operação Neon, nem reexecução de
testes. Branch de rehearsal preservada; nenhuma implantação em produção.
Ver [evidências e limites](testes-e-evidencias.md#etapa-08--expand-concluído--rehearsal-e-revisão-aprovados).

## Estrutura expand de e-mail/recuperação

**FATO DO REPOSITÓRIO:** o SQL atual contém 29 constraints nomeadas: cinco em
`usuarios`, 11 em `auth_email_confirmacao`, nove em `auth_recuperacao_senha` e
quatro em `auth_senha_historico`. Índices não entram nessa contagem.

As cinco de `usuarios` são:

- `usuarios_email_confirmado_em_finito_check`;
- `usuarios_auth_version_check`;
- `usuarios_email_version_check`;
- `usuarios_cadastro_pendente_finito_check`;
- `usuarios_confirmado_sem_cadastro_pendente_check`.

O arquivo atual proíbe prazo pendente infinito e confirmação simultânea com
cadastro pendente. O catálogo antigo que mostrou apenas 27 constraints não deve
ser usado como evidência do SQL final. A contagem acima foi confirmada no arquivo;
o resultado histórico de banco consta em [testes e evidências](testes-e-evidencias.md).

Confirmação possui FK do usuário com CASCADE e autoria com RESTRICT; recuperação
e histórico possuem FK do usuário com RESTRICT. O expand não ativa serviços de
confirmação/recuperação, não integra JWT, não preenche histórico e não cria outbox.

## Clone e ledger

**EVIDÊNCIA HISTÓRICA:** o clone isolado
`revisao-premium-ensaio-auth-recuperacao` precisou receber 08-07 e 08-25 durante o
rehearsal da Etapa 02. A adequação operacional de `public.sistema_migracao`
realizada no clone foi separada da migration expand e **não foi feita em produção**.

**FATO DO REPOSITÓRIO:** o [runner oficial](../../backend/scripts/run-migration.js)
usa `public.sistema_migracao`, identifica o arquivo canônico e compara SHA-256.
Mesmo arquivo/mesmo SHA faz skip; SHA divergente interrompe a aplicação.
Seleção por arquivo e planejamento sem conexão estão disponíveis; execução por
diretório pode incluir outras migrations pendentes.

**PENDÊNCIA OPERACIONAL:** produção exige preflight específico do ledger, alvo,
histórico aplicado, checksums e plano exato. O ajuste do clone não comprova essa
compatibilidade. Esta documentação não autoriza executar runner ou migration.

**DECISÃO/PRINCÍPIO DE TRANSIÇÃO:** expand → compatibilidade → rehearsal → cutover
→ contract. Migration já aplicada deve conservar seu conteúdo/checksum; correções
posteriores exigem estratégia explícita, normalmente nova migration forward-only.
Não há comprovação de cutover/contract de produção nesta baseline.
