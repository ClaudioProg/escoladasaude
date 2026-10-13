# Migrations V3

Atualização documental: **13/10/2026**. HEAD do núcleo da Etapa 09:
`a6f49e6c15157f92b3b06d203213a27b7c454182`.
**FATO DO REPOSITÓRIO:** inventário V3 preservado; a Etapa 09 não cria migration.
Migration 08 com rehearsal e revisão independente aprovados, aplicação histórica
na branch descartável da Etapa 08 (já excluída) e aplicação única na homologação
permanente `v3-homologacao` (`br-round-union-adok19ir`), preservada. Presença no Git não
comprova aplicação em produção. Este inventário seleciona
migrations V3; não substitui o plano completo do runner para um alvo específico.

| Migration | Finalidade / status no repositório | Rehearsal conhecido | Produção |
| --- | --- | --- | --- |
| [2026-08-07-auth-perfis-independentes-expand.sql](../../backend/db/migrations/2026-08-07-auth-perfis-independentes-expand.sql) | `auth_perfis` e `auth_usuario_perfis`, catálogo/vínculos e bootstrap em expand. Commit `d469e7e8a1df22ce5b9c4771c3280455f206b95b`. | Aplicada no clone auth-recuperação durante preparo do rehearsal da Etapa 02. | Não comprovada por esta baseline. |
| [2026-08-25-auth-sessoes-contexto-expand.sql](../../backend/db/migrations/2026-08-25-auth-sessoes-contexto-expand.sql) | `auth_sessao` e `auth_usuario_contexto`, FKs/checks/índices. Commit `d500d90808710bb2aa3b1f112ef39fec62d08576`. | Aplicada no mesmo clone durante preparo do rehearsal da Etapa 02. | Não comprovada por esta baseline. |
| [2026-10-02-auth-email-recuperacao-senha-expand.sql](../../backend/db/migrations/2026-10-02-auth-email-recuperacao-senha-expand.sql) | Campos em `usuarios`, `auth_email_confirmacao`, `auth_recuperacao_senha`, `auth_senha_historico`. Commit `7e47b5d40e64fbfc1601b8b0001a50bfd24e95e8`. | Fechamento em PostgreSQL 16, clone isolado; preservação, integridade, concorrência, rollback e skip pelo ledger relatados. | Não comprovada por esta baseline. |
| [2026-10-09-auth-quotas-expand.sql](../../backend/db/migrations/2026-10-09-auth-quotas-expand.sql) | Etapa 08: tabela/eventos e índices de quotas; expand concluído, sem ativação. | 57/57 no ensaio histórico da Etapa 08, branch descartável já excluída; aplicação única em `v3-homologacao` na Etapa 09, ledger id 7, SHA preservado; rehearsal final 129/129 e revisão independente aprovada em 13/10/2026. | Não implantada; rehearsal não comprova produção. |
| [2026-10-13-auth-outbox-expand.sql](../../backend/db/migrations/2026-10-13-auth-outbox-expand.sql) | Etapa 10: outbox dedicada, estrutura local; sem enqueue/worker/ativação. | **Não realizado**; testes locais e parser somente. | Não aplicada; sem deploy. |

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
Nenhum segredo HMAC no SQL. A composição antes aberta foi resolvida pela decisão
A da Etapa 09: as três finalidades compartilham limites por conta/IP.

Contrato do runner, identidade/LF/SHA e dry-run do arquivo específico aprovados;
**149/149 testes locais**, sintaxe 2/2 e **57/57 provas PostgreSQL** aprovados.
Inventário oficial atualizado pontualmente. Revisão independente aprovada pelo
responsável em **09/10/2026**.

Na Etapa 08, aplicação oficial somente na branch descartável `br-super-wave-adut7rdn`
(`rehearsal-etapa-08-descartavel`), filha de `br-small-union-ad2nicvt`
(`revisao-premium-ensaio-auth-recuperacao`). Nova linha do ledger: **id 7**,
identidade `db/migrations/2026-10-09-auth-quotas-expand.sql`, SHA acima.
DDL e ledger na mesma transação; segunda execução com mesmo SHA fez skip.
Estado final de `public.auth_quota_evento`: **0 linhas**. A branch descartável
foi posteriormente excluída; sua aplicação permanece evidência histórica, não
alvo atual de retomada.

Relatório aprovado: dados de **89 tabelas herdadas / 54.394 linhas**, seis linhas
anteriores do ledger e definições do catálogo legado preservados. O ledger passou
de 6 para 7 linhas. A nova FK cria triggers internos próprios, inclusive em
`usuarios`; triggers herdados não foram alterados. Estado mutável das sequências
não foi comparado. Falhas da migration/ledger e checksum divergente não foram
injetados no banco; testes locais do protocolo são simulados.

**Rehearsal aprovado não equivale a implantação em produção.** O núcleo de
quotas/HMAC da Etapa 09 está aprovado; limpeza de 48 horas, integração, falhas/
solicitações sem emissão, origem confiável do IP e rotação operacional HMAC
continuam abertas. Produção exige plano/autorização próprios;
não reaplicar migrations antigas ou modificar o checksum da migration aprovada.
Neste fechamento não houve SQL, migration ou operação Neon, nem reexecução de
testes. Homologação permanente preservada; nenhuma implantação em produção.
Ver [evidências e limites](testes-e-evidencias.md#etapa-08--expand-concluído--rehearsal-e-revisão-aprovados).

## Etapa 09 — aplicação única na homologação permanente

Fonte: relatório local `C:/tmp/escola-v3-etapa09-20261013-a6f49e6c/RELATORIO.txt`,
consultado somente por leitura; aprovação independente fornecida pelo responsável
em **13/10/2026**, após análise do código, relatório e verificações no Neon.

Runner oficial aplicou **somente a migration 08, uma única vez** na branch
permanente **`v3-homologacao` (`br-round-union-adok19ir`)**. Ledger **id 7**,
mesma identidade canônica e SHA-256 `a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a`.
Segunda execução fez skip, sem reaplicação ou segunda linha. DDL e ledger na
mesma transação, comprovada por `xmin`; nenhum conteúdo/checksum foi alterado.
Nenhuma migration anterior foi reaplicada. Núcleo da Etapa 09 versionado em
`a6f49e6c15157f92b3b06d203213a27b7c454182`, sem nova migration.

Validações prévias: **142/142 testes focados**, **829/829 completos** e **129/129
provas finais**, incluindo **107 da Etapa 09**. Histórico: **141 checagens,
137 aprovações, quatro falhas intermediárias do harness corrigidas**; dois erros
PostgreSQL inesperados em inicialização abortada antes do serviço, sem eventos;
nenhum inesperado na execução corrigida.

Tabela de quotas **vazia**; **89 tabelas / 54.394 linhas herdadas preservadas** e
seis registros anteriores do ledger intactos. Contagem herdada de catálogo:
**1.717 atributos ativos + dez descartados = 1.727 entradas**, separada das
adições da migration. Branch permanente preservada, sem reset/exclusão.

Falhas de DDL/ledger/checksum divergente não foram injetadas; ensaio isolado com
adaptador do executor, quatro emissões concorrentes por cenário e planos até
10.000 eventos sintéticos em cache quente, sem ANALYZE da tabela. Custo da guarda
HMAC ainda sujeito à avaliação operacional. Sem ativação HTTP, SMTP, limpeza,
integração com outbox ou implantação em produção. Este fechamento documental/Git
não repete testes/rehearsal nem executa SQL, migration, operações Neon, deploy,
merge ou Etapa 10. Ver [evidências e limites](testes-e-evidencias.md#rehearsal-postgresql-da-etapa-09-aprovado).

## Etapa 10 — outbox expand local, nao aplicado

Data: **13/10/2026**, base `bfb3e314933e3710897379a6e1c903d614667826`.
Arquivo [2026-10-13-auth-outbox-expand.sql](../../backend/db/migrations/2026-10-13-auth-outbox-expand.sql).
SHA-256 dos bytes LF: `2be1525aa0bf1064de5d594ad026e5cc0c0fb533c0fcaedcf42032f489d52c0a`.

Uma nova tabela `auth_outbox` com 19 colunas e 13 constraints (PK, duas FKs e dez
CHECKs); seis índices B-tree adicionais, uma função/trigger de UPDATE somente na
tabela nova e comentários somente dos objetos novos. Sem extensão, backfill,
ALTER de tabela/constraint legada ou alteração de migration antiga. FKs criam
triggers internos nos challenges quando aplicadas; não alteram triggers legados
de aplicação. Preflight valida PK UUID imediata dos dois desafios, finalidade
da confirmação e ausência de colisões de relações/função antes do DDL.

Mensagem UUID, exatamente um desafio, unicidade por desafio; finalidade e conta
derivam do desafio. FKs `ON UPDATE RESTRICT ON DELETE CASCADE` preservam a
subordinação da mensagem ao desafio e a remoção canônica do cadastro nunca ativado.
Snapshot do destinatário e envelope imutáveis; remoção do envelope terminal
permitida e obrigatória em `sent`. AES-GCM opaco, nonce 12 bytes/tag 16/key_id,
sem chave/token/corpo aberto; SQL não prova criptografia. Categorias de erro sem
texto SMTP; permanente/esgotamento em `failed`. Quatro estados, leases/timestamps
finitos e índices de pendência/lease/terminal; sem claim operacional ou TTL fixo.

**162/162 focados**, **859/859 completos** (uma execução), JS 2/2, parser
PostgreSQL 16 SQL/PL/pgSQL, LF/identidade/SHA e dry-run oficial de um arquivo
aprovados. Protocolo de falha/rollback do runner simulado, sem SQL real.
**Não aplicada em nenhum banco nesta tarefa; nenhum ledger da Etapa 10 existe
como evidência local comprovada**. Rehearsal PostgreSQL ainda não realizado;
Etapa 10 aberta mesmo após publicação. Validar aplicação/skip/rollback, catálogo,
constraints/trigger, CASCADE, preservação, claim concorrente/fencing e planos
posteriormente na homologação permanente, sob autorização própria.

Duração de lease, implantação do worker, cronograma de alteração e política
operacional de limpeza permanecem pendentes; cronogramas canônicos existentes e
at-least-once sem exactly-once preservados. Sem Etapa 11, SMTP, integração real,
SQL no Neon, deploy ou alteração da Vercel/main. `v3-homologacao` intacta. Após
aprovação/aplicação, conteúdo/checksum imutáveis; correções futuras exigem plano
explícito. [Evidências e limites](testes-e-evidencias.md#etapa-10--outbox-expand-local--rehearsal-pendente).

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
