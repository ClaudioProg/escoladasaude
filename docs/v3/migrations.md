# Migrations V3

**Etapa 14 — Reautenticação local básica implementada para revisão**, em
**15/10/2026**, base `88edbf7d550e386b3b66e651aedce92ce9469c38`, branch
`revisao-premium-bloco-1-auth`. **D5 parcialmente aprovada somente quanto à
reautenticação local básica**: senha atual, prova opaca de uso único, finalidade
exata e vínculo a conta/sessão/auth_version, validade absoluta de cinco minutos.
**120/120 dedicados + 1/1 inventário afetado; 1.821/1.821 backend completo**
(uma execução), zero falhas/skips/cancelamentos. Migration nova somente preparada
no Git; **não aplicada**. Testes modelados não comprovam concorrência física.
**Etapas 01–13 concluídas de 57. Etapa 14 aberta; Etapa 15 não iniciada.**
Flag `AUTH_REAUTH_ENABLED` ausente/`false` mantém interface desabilitada;
configuração ambígua ou incompleta falha fechada. Nenhuma ativação operacional,
SQL externo, Neon, frontend, produção, merge ou deploy. D2 e demais contratos
01–13 preservados; D1, D3, D4, D6–D8 e demais parâmetros D5 pendentes.
[Implementação, limites e provas PostgreSQL pendentes](testes-e-evidencias.md#etapa-14--reautenticação-local-básica).

Registro histórico do fechamento anterior, antes do início autorizado da Etapa 14:

**Etapa 13 — Contexto restrito e barreira de acesso, encerrada em 15/10/2026**,
por instrução do responsável após aprovação integral da revisão independente do
rehearsal complementar. **Etapas 01–13 concluídas de 57. Etapa 14 não iniciada.**
Implementação: `b63db7be5b879ee4b9b23acffeee68ce0d34faad`; correção do touch:
`ae7d0b15479f3795ec6d57f52bf0631643e4c4ee`. Validação final aprovada:
**1.701/1.701 backend, 293/293 focados, 20/20 dedicados**; rehearsal **63/63 provas
funcionais únicas** (55 históricas + oito complementares), com 11 cenários de espera
PostgreSQL real na rodada complementar. D2: **30 min de inatividade / 120 min
absolutos**; touch normal limitado a uma escrita por intervalo de **60 s**, zero
quando não devido. Migration aplicada uma vez em `v3-homologacao`, ledger 9,
checksum preservado. Barreira **desabilitada operacionalmente por padrão**.
D2 aprovada; D1 e D3–D8 pendentes. Ativação depende das integrações, regularização,
revisão, políticas, MFA, CSRF e migração dos consumidores. Este fechamento somente
documental não autoriza flags, produção, cutover, merge, deploy ou Etapa 14.
[Fechamento, evidências e limites](testes-e-evidencias.md#fechamento-aprovado-da-etapa-13).
Os registros anteriores preservam seus estados históricos; este bloco define o estado atual.

Atualização documental: **15/10/2026**. HEAD da implementação da Etapa 11:
`d9acb48b2f13ae998bfc688f1834511f0e3771bd`. Revisão independente e rehearsal aprovados.
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
| [2026-10-13-auth-outbox-expand.sql](../../backend/db/migrations/2026-10-13-auth-outbox-expand.sql) | Etapa 10: expand dedicado concluído; sem enqueue/worker/ativação. | **186/186**, incluindo **161 PostgreSQL**; exclusivamente `v3-homologacao`, ledger id 8, revisão aprovada em 13/10/2026. | Não aplicada; sem deploy. |
| [2026-10-15-auth-contexto-restrito-expand.sql](../../backend/db/migrations/2026-10-15-auth-contexto-restrito-expand.sql) | Etapa 13/D2: contexto restrito por sessão, sem backfill; arquivo/checksum preservados. | Aplicada uma única vez em v3-homologacao; ledger com nove registros e checksum preservado; 63/63 provas funcionais únicas aprovadas (55 históricas + oito complementares), revisão independente aprovada. | Não aplicada em produção; ativação não autorizada. |
| [2026-10-15-auth-reautenticacao-expand.sql](../../backend/db/migrations/2026-10-15-auth-reautenticacao-expand.sql) | Etapa 14/D5 parcial: provas descartáveis e reservas de tentativas; dois triggers próprios. | Parser/modelos locais e inventário 1/1; não aplicada, rehearsal pendente. | Não aplicada; flag desabilitada, sem ativação autorizada. |

## Etapa 14 — persistência de reautenticação preparada, não aplicada

[2026-10-15-auth-reautenticacao-expand.sql](../../backend/db/migrations/2026-10-15-auth-reautenticacao-expand.sql),
forward-only, transação do runner, sem backfill/ativação ou alterações em migrations
aplicadas. SHA-256 novo:
`fc810fb0e9ea96b4f5c5c619b727cf5126ae723913d4809caa6027c697d29537`.

- `auth_reautenticacao_prova`: hash opaco como PK, sessão/conta por FKs imediatas
  RESTRICT, versão, finalidade controlada, emissão/expiração exatamente cinco
  minutos depois e consumo. Checks de hash, finitude, versão, finalidade e consumo
  dentro do prazo; índices por sessão e conta.
- `auth_reautenticacao_tentativa`: UUID, conta e instante; reserva durável antes da
  senha e índice conta/tempo, sem senha, prova, hash de credencial ou IP em texto
  puro. Quotas dos fluxos de e-mail não reaproveitadas.
- Triggers novos removem somente provas de reautenticação em mudanças críticas
  (incluindo writers legados sem incremento) e revogação/revinculação da sessão.
  Nenhum trigger D2 alterado, nenhuma limpeza de registros herdados.

Parser oficial validado localmente; inventário afetado aprovado **1/1**.
**Não aplicada em banco**; nenhum runner de migration contra PostgreSQL nem prova
física nesta etapa. Ledger homologado permanece no marco de **nove registros**,
sem presumir décimo registro. Identidades Git antigas e checksum aplicado D2
`ba9ba77c2c7ac581415bc89ee2b2281a51ec0b12ac74f2854753b104645b29b7` preservados.
Rehearsal requer autorização/preflight próprios de TLS, HEAD, ledger/checksums,
baseline, fixtures allowlist e limpeza; sem repetir as 63 provas aprovadas D2.
[Provas necessárias](testes-e-evidencias.md#provas-postgresql-pendentes-da-etapa-14).

## Etapa 13 — persistência mínima de D2, não aplicada

Título/descrição originais preservados para rastreabilidade e manutenção das
âncoras. **Situação atual: D2 aplicada uma única vez em homologação; Etapa 13
encerrada**, ledger com nove registros, **63/63 provas funcionais únicas aprovadas**
(55 históricas + oito complementares). Revisão independente integralmente aprovada;
11 cenários de espera PostgreSQL real, dois erros `55P03` esperados e zero
inesperados na rodada complementar. Zero resíduos sintéticos; triggers D2 e
perfil-base habilitados. Conferência independente: 89 tabelas originais,
54.394 registros e zero divergências.
SHA-256 aplicado e inalterado:
`ba9ba77c2c7ac581415bc89ee2b2281a51ec0b12ac74f2854753b104645b29b7`.
O patch de touch `ae7d0b15479f3795ec6d57f52bf0631643e4c4ee` não alterou DDL,
runner, arquivo SQL ou checksums; implementação inicial em
`b63db7be5b879ee4b9b23acffeee68ce0d34faad`. A rodada complementar não reaplicou
migration. Este fechamento altera exclusivamente documentos, sem SQL/Neon,
fixtures ou repetição de ensaios. Ativação da barreira e produção não autorizadas.
**Etapas 01–13 concluídas de 57. Etapa 14 aberta; Etapa 15 não iniciada.**
[Fechamento aprovado](testes-e-evidencias.md#fechamento-aprovado-da-etapa-13);
[histórico do ajuste e das antigas pendências](testes-e-evidencias.md#ajuste-pontual-da-etapa-13--intervalo-de-touch-da-sessão).

Registro histórico anterior à aplicação D2 (inclusive os estados de pendência abaixo):

[2026-10-15-auth-contexto-restrito-expand.sql](../../backend/db/migrations/2026-10-15-auth-contexto-restrito-expand.sql):
nova tabela `auth_contexto_restrito`, seis colunas, FK/PK por `sessao_id` e cinco
checks (versão, finitude, absoluto de 120 min, ordem do uso e expiração/30 min).
Identidade/revogação vêm da sessão; sem token, usuário ou progresso duplicado.
Nenhuma migration anterior/checksum alterado; sem backfill, alteração de
`auth_sessao`/`auth_usuario_contexto` ou configuração de implantação.
Função/trigger AFTER UPDATE em `usuarios` invalidam apenas registros D2 quando
senha, e-mail, auth_version, email_version ou exclusão mudam, inclusive nos
writers legados sem incremento de versão. Apagam somente os vínculos restritos,
sem alterar versões, dados herdados ou progresso salvo do usuário.

Inspeção do DDL versionado: `auth_sessao` não persiste a versão autenticada nem um
limite restrito independente de 120 min; `auth_usuario_contexto` só guarda área.
Por isso o registro adicional mínimo é necessário. Novo contexto nasce na mesma
transação da nova sessão, com versão sob lock do usuário. Prazo absoluto deriva de
`auth_sessao.criada_em`, sem alterar as durações normais de sessão.

Contrato do runner testado localmente por `validateMigrationSql`, constraints
inspecionadas e testes de serviço com modelo transacional. Inventário estático do
teste de identidade do runner atualizado para incluir a nova migration; produção
do runner não alterada. **Nenhum SQL foi executado; rehearsal PostgreSQL pendente.**
Presença no Git ou aprovação dos testes não comprova aplicação/locks físicos.

Rehearsal posterior, somente após autorização específica: preflight de identidade,
TLS, HEAD, ledger/checksums e baseline, migration forward-only pelo runner oficial;
fixtures sintéticas em allowlist e política de rollback/limpeza previamente
aprovada. Conferir constraints reais, rollback sessão/contexto, criação concorrente,
locks usuário → sessão → contexto com `pg_backend_pid()`, limites exatos 30/120,
revogação/alteração de versão versus acesso e reautenticação sem reabrir contexto.
Validar o trigger em alteração crítica legada sem incremento de versão, rollback
da alteração junto da invalidação e preservação de outras contas.
Sem reaproveitar como prova os ensaios 01–12 nem executá-los novamente.
Não ativar a barreira ou produção. **Etapa 13 aberta; Etapa 14 não iniciada**.
[Decisão D2](decisoes-canonicas.md#decisão-canônica-aprovada--d2-contexto-restrito)
e [evidências](testes-e-evidencias.md#etapa-13--contexto-restrito-e-barreira-de-acesso).

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

## Etapa 10 — outbox expand aprovada em homologação

Fechamento aprovado em **13/10/2026**. Implementação em
`7bb864245409155a9130756911ce531b6b5454ca`, sobre `bfb3e314933e3710897379a6e1c903d614667826`.
Arquivo [2026-10-13-auth-outbox-expand.sql](../../backend/db/migrations/2026-10-13-auth-outbox-expand.sql).
SHA-256 dos bytes LF: `2be1525aa0bf1064de5d594ad026e5cc0c0fb533c0fcaedcf42032f489d52c0a`.

Uma nova tabela `auth_outbox` com 19 colunas e 13 constraints (PK, duas FKs e dez
CHECKs); seis índices B-tree adicionais, uma função/trigger de UPDATE somente na
tabela nova e comentários somente dos objetos novos. Sem extensão, backfill,
ALTER de tabela/constraint legada ou alteração de migration antiga. FKs criam
triggers internos novos nos challenges, aprovados no rehearsal; não alteram
triggers legados de aplicação. Preflight valida PK UUID imediata dos dois desafios, finalidade
da confirmação e ausência de colisões de relações/função antes do DDL.

Mensagem UUID, exatamente um desafio, unicidade por desafio; finalidade e conta
derivam do desafio. FKs `ON UPDATE RESTRICT ON DELETE CASCADE` preservam a
subordinação da mensagem ao desafio e a remoção canônica do cadastro nunca ativado.
Snapshot do destinatário e envelope imutáveis; remoção do envelope terminal
permitida e obrigatória em `sent`. AES-GCM opaco, nonce 12 bytes/tag 16/key_id,
sem chave/token/corpo aberto; SQL não prova criptografia. Categorias de erro sem
texto SMTP; permanente/esgotamento em `failed`. Quatro estados, leases/timestamps
finitos e índices de pendência/lease/terminal; sem claim operacional ou TTL fixo.

**30/30 dedicados, 162/162 focados e 859/859 completos** aprovados anteriormente;
JS 2/2, parser SQL/PL/pgSQL e dry-run de um arquivo históricos. Não reexecutados.
**186/186 provas finais**, incluindo **161 PostgreSQL**; **112 erros esperados
e zero inesperados**, conforme relatório técnico aprovado.

Aplicada **exclusivamente em `v3-homologacao` (`br-round-union-adok19ir`)**.
Ledger **id 8**, SHA acima, atomicidade na transação **6100996**: DDL, constraints,
sete índices (PK + seis adicionais), função e nove triggers novos compartilham
`xmin` com o ledger. Um trigger UPDATE e oito internos de FK aprovados;
segunda execução oficial fez skip por mesmo SHA, preservando as sete linhas
anteriores do ledger. Integridade referencial, CASCADE de desafios sintéticos,
rollback, identidade, estados, leases e suporte estrutural à seleção concorrente
comprovados. **Outbox e quotas vazias**; **90 tabelas / 54.395 linhas herdadas
preservadas**. Homologação permanente preservada.

Não houve falha DDL/ledger/checksum divergente injetada no banco: a atomicidade
provada é da aplicação bem-sucedida, distinta do protocolo de falha simulado.
Seleção concorrente real não comprova worker, claim/ack ou fencing integral;
EXPLAIN sem ANALYZE não valida desempenho de produção. Envelope sintético não
prova criptografia/AAD ou unicidade histórica de nonce após remoção.

Duração de lease, implantação do worker, cronograma de alteração e política
operacional de limpeza permanecem pendentes; cronogramas canônicos existentes e
at-least-once sem exactly-once preservados. No fechamento da Etapa 10, as Etapas
11/12 e criptografia/enqueue estavam pendentes. A Etapa 11 foi aprovada depois,
conforme seção abaixo. Worker, SMTP, fencing integral, exactly-once, limpeza
operacional e implantação em produção continuam pendentes. O fechamento documental/Git
da Etapa 10 não executou SQL, operações Neon, testes, deploy, merge ou Etapa 11.
Conteúdo/checksum da migration aplicada são imutáveis; correções futuras exigem
plano explícito. [Evidências e limites](testes-e-evidencias.md#etapa-10--outbox-expand--rehearsal-e-revisão-aprovados).

## Etapa 11 — criptografia e enqueue aprovados, sem nova migration

Implementação em `d9acb48b2f13ae998bfc688f1834511f0e3771bd`, base
`a745a9d18c56ff50941a7f01131d32d1cbf21e5e`. **Etapa encerrada em 14/10/2026**, com
revisão independente aprovada pelo responsável e rehearsal consolidado aprovado.
`authOutboxCrypto` e `authEnqueueService` usam exclusivamente os expands aprovados
08–10: quota/desafio/mensagem com mesmo UUID técnico, bytea cifrado opaco com
versão de formato, nonce/tag/key_id e snapshot imutável. Prazos PostgreSQL de
24 h/30 min e microssegundos preservados; auditoria crítica no executor do caller.
**Nenhuma nova migration ou reaplicação**; estruturas, SQL, runner e checksums
preservados. Ledger da homologação permanece com **oito registros**, incluindo
id 8/SHA da Etapa 10; nenhuma consulta ao banco neste fechamento documental/Git.

Validações anteriores: **47/47 criptografia, 87/87 enqueue, 290/290 focados e
993/993 backend completo**; JS 4/4 e gramática PG16 de 24 consultas. Rehearsal:
**37/37 provas únicas aprovadas**, **38 tentativas** com uma falha histórica do
instrumento de observação corrigida, **oito erros PostgreSQL esperados e zero
inesperados**. Dez verificações iniciais de preflight não recontadas; seis controles
complementares separados. Três finalidades, criptografia real, atomicidade, replay,
concorrência e rollback aprovados no alcance documentado. Conexões distintas,
`pg_backend_pid()`, `pg_stat_activity` e `pg_blocking_pids` demonstraram esperas
reais. [Evidências e limites](testes-e-evidencias.md#rehearsal-postgresql-da-etapa-11-aprovado).

Duas limpezas transacionais autorizadas restauraram o trigger de proteção do
perfil-base antes do commit; **zero resíduos sintéticos**. Sequência da auditoria
**349 → 358 → 364**, sem reinicialização. A conferência independente no Neon
informada pelo responsável confirmou **2.668 usuários / 2.774 vínculos**,
outbox/quotas/desafios vazios, auditorias sintéticas removidas, trigger original
habilitado, **oito registros no ledger** e **89 tabelas originais / 54.394 linhas
preservadas**, com zero divergências de conteúdo após excluir os registros das
migrations 08 e 10. Homologação permanente `v3-homologacao` preservada. O recorte
original é distinto das contagens herdadas históricas do rehearsal da Etapa 10.

Replay exige vínculo íntegro quota/desafio/mensagem; expurgo independente futuro
não é presumido seguro nem implementado. Colisões detectáveis de nonce/hash
falham fechado; nonce não promete unicidade histórica após remoção do envelope.
**D1–D8 e demais pendências preservadas; Etapa 12 não iniciada naquele fechamento**. A Etapa 11 não
implementa worker SMTP, retries, claim/ack, ativação HTTP, integrações públicas ou
exactly-once; limpeza operacional e fencing integral pendentes. Não repetir testes
ou operações PostgreSQL/Neon, executar SQL/migrations, SMTP, deploy ou merge
neste fechamento.

Decisão de implantação aprovada: **uma única plataforma pública no endereço
atual, modernizada progressivamente por blocos**, com produção operacional durante
a transição e homologação separada. Substituição da autenticação exige validação
integral das integrações essenciais, plano de implantação/reversão e autorização
expressa; não presumir duas plataformas públicas ou implantação automática após
o Bloco 1. [Decisão canônica](decisoes-canonicas.md#decisão-canônica--implantação-progressiva-na-plataforma-pública-atual).

## Etapa 12 — protocolo local sobre o schema aprovado

Implementação inicial sobre `93ede97275139dcb9285e4326f0dd8f69fd94022`, **14/10/2026**;
Etapa 12 encerrada documentalmente em **15/10/2026**, após revisão independente
aprovada de `db095b6f325c41f093c79b271670785e94eff848`. **Nenhuma migration nova ou antiga alterada**,
runner/checksums/ledger preservados; nenhum banco consultado neste fechamento documental. Usa exclusivamente
`auth_outbox`, desafios e usuários dos expands aprovados; zero schema adicional.

Transições respeitam as constraints existentes: claim/reclaim `processing` com
incremento de tentativas, `ultima_tentativa_em = lease_adquirida_em`, novo UUID,
lease 180 s, sem próximo agendamento/finalização; retry `pending` limpa lease,
agendamento absoluto futuro >= última tentativa; terminais `sent`/`failed`
finalizam, limpam lease/agendamento e os quatro campos do envelope, sem reabrir
ou alterar identidade/snapshot/auditoria. `sent` limpa erro; `failed` tem código
controlado existente. Não excluir histórico nem alterar limpeza de quotas.

Locks usuário → desafio → outbox; `FOR UPDATE SKIP LOCKED` no claim, ack protegido
por lease/estado/validade no UPDATE. Relógio PostgreSQL com microssegundos; sem
transação durante SMTP. Reclaim após interrupção também consome tentativa;
até seis tentativas, offsets absolutos de recuperação 0/1/3/7/15/25 e
confirmação/alteração 0/1/5/15/60/180 min, sem rajadas nem retries além do TTL.
Snapshots de versão são os existentes por finalidade, sem inventar o ausente.

Validação inicial histórica: **118/118 novos, 435/435 focados, 1.111/1.111 completos**
(uma execução), **9/9 JS**, com modelo transacional simulado. Posteriormente,
rehearsal PostgreSQL aprovado em `v3-homologacao`: **44/44 provas únicas**,
três falhas históricas do instrumento corrigidas e preservadas, zero resíduos
sintéticos no Neon, trigger restaurado antes do commit da limpeza autorizada,
ledger e dados herdados preservados. Nenhum SQL/Neon ou ensaio reexecutado neste
fechamento. Implementação `bf6155bccba4657ab7350692ecc2273945b6add4`, flags/dry-run
`40ab140fa23f4cf879ac00d867b0def3ef5deff5`, cancelamento/IPC
`db095b6f325c41f093c79b271670785e94eff848`. Testes atuais: **1.529/1.529 backend**,
**670/670 focados**, **29/29 regressões novas**, **4/4 subprocessos Node reais**.
[Evidências aprovadas](testes-e-evidencias.md#fechamento-aprovado-da-etapa-12).

Ativação bloqueada pelo consumidor V3 ausente; job desabilitado por padrão,
dry-run sem efeitos, sem links para JWT legado. SMTP isolado limitado tecnicamente
a 120 s; prova física aprovada com **52 verificações**, kill em **115,072 s** e
resolução em **115,078 s**. TLS positivo pelo adaptador ainda exige comprovação
física antes da futura ativação SMTP real, sem reabrir automaticamente toda a
Etapa 12. Sem exactly-once, exclusão de históricos, deploy ou produção;
configurações de implantação e D1–D8 preservadas.
**Etapas 01–12 concluídas de 57. Etapa 13 não iniciada.**
Uma plataforma pública no endereço atual, modernização por blocos, produção
separada da homologação e operacional durante a transição. [Contratos](decisoes-canonicas.md#etapa-12--worker-e-decisões-operacionais-aprovadas).

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
