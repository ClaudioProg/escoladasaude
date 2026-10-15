# Testes e evidências de fechamento

Etapa 13 — **Contexto restrito e barreira de acesso**, implementação local para
revisão em **15/10/2026**, base `07499cc96f47e9f1a0bfcb76ca7557c02904dbc5`.
**D2 é decisão canônica aprovada**. **Etapas 01–12 concluídas de 57;
Etapa 13 aberta até revisão independente e rehearsal PostgreSQL; Etapa 14 não iniciada.**
Núcleo integrado sob `AUTH_RESTRICTED_CONTEXT_ENABLED`, **desabilitado por padrão**;
ativação operacional/produção não autorizada.
[Evidências e limites](#etapa-13--contexto-restrito-e-barreira-de-acesso).
Os registros anteriores mantêm os estados históricos das Etapas 01–12.

Atualização documental: 2026-10-15. Branch `revisao-premium-bloco-1-auth`.
HEAD do núcleo da Etapa 11: `d9acb48b2f13ae998bfc688f1834511f0e3771bd`,
versionado e publicado na branch. Revisão independente aprovada em **14/10/2026**
após análise do código, relatório do rehearsal e verificações independentes no
Neon, conforme instrução do responsável. Fechamento atual exclusivamente documental/Git.

## Origem e limites

Os resultados abaixo registram fechamentos informados e aprovados pelo responsável
nas etapas anteriores, incluindo a consolidação explícita da Etapa 04 e as
validações locais das Etapas 05 e 06. A Etapa 07 acrescenta implementação local,
resultados finais de testes e evidências PostgreSQL originais e complementares,
com revisão independente aprovada pelo responsável em **09/10/2026**. Arquivos,
commits, logs de testes e artefatos de banco existentes foram conferidos.
Resultados de banco são **históricos do rehearsal isolado**, sem nova consulta
ou prova de produção. O fechamento documental não reexecutou testes nem banco.
A Etapa 08 acrescenta resultados locais e o relatório do rehearsal PostgreSQL
isolado, com revisão independente aprovada em 09/10/2026, descritos abaixo.
A Etapa 09 acrescenta o relatório isolado de 13/10/2026 e a aprovação independente
fornecida pelo responsável; nenhum banco foi consultado para este fechamento.
A Etapa 11 acrescenta o relatório consolidado local e a revisão independente
aprovada em 14/10/2026, conforme instrução do responsável, incluindo a conferência
independente no Neon informada por ele. Nenhum teste ou SQL foi reexecutado neste
fechamento documental/Git.
Não há logs brutos, credenciais, tokens reais ou dados pessoais aqui.

## TOUCH — fechado

- Sessões válidas/inválidas e escrita acima da janela de 60 segundos.
- Touch fail-closed; concorrência touch/revoke comprovada em PostgreSQL.
- Fonte atual: [authSessionService](../../backend/src/services/authSessionService.js)
  e [testes](../../backend/src/services/authSessionService.test.js).
- Middleware toca antes de publicar identidade: [código](../../backend/src/auth/authSessionMiddleware.js)
  e [testes](../../backend/src/auth/authSessionMiddleware.test.js).
- Commit do endurecimento: `ba3a169bcbd9fa7e1a2c69136999fda566cf246e`.

## EMAIL EXPAND — fechado em clone

- PostgreSQL 16; 2668 usuários antes/depois, com e-mails/senhas preservados.
- Fingerprint agregado de preservação `id+email+senha`:
  `435138e20f561fc677735581bedcbcd3`.
- Legados não foram confirmados automaticamente; versões iniciais iguais a um;
  campos de confirmação/prazo pendente nulos; três tabelas novas inicialmente vazias.
- Checks, FKs e unicidade ensaiados, incluindo prazos finitos, estados terminais,
  versões, tamanho do hash e um desafio aberto por usuário.
- Concorrência de desafios: bloqueio da segunda transação seguido de `23505`.
- Rollback do ensaio funcional com resíduos zero e fingerprint preservado.
- Segunda execução pelo runner fez skip com mesmo SHA: idempotência via ledger,
  não autorização para alterar/reaplicar o SQL registrado.
- SQL final contém 29 constraints; detalhe e limites em [migrations](migrations.md).
- Commit: `7e47b5d40e64fbfc1601b8b0001a50bfd24e95e8`.

## PASSWORD 1A — fechado

Argon2id/bcrypt, Unicode/NFKC, fronteira de 72 bytes, limites e erros tipados.
Fontes: [serviço](../../backend/src/services/passwordService.js) e
[testes](../../backend/src/services/passwordService.test.js).
Commit: `2e51c1fbc5f743be23a6605c9720b8580519b5c2`.

## PASSWORD 1B — fechado

43 testes no fechamento: blocklist, previsibilidade, dados pessoais, limites de
contexto, gerador e performance. Revisão de licenças/atribuições registrada.
Não transformar esse resultado histórico em benchmark universal de produção.

Fontes: [política](../../backend/src/services/passwordPolicy.js),
[testes da política](../../backend/src/services/passwordPolicy.test.js),
[testes da blocklist](../../backend/src/services/passwordBlocklist.test.js),
[testes do gerador](../../backend/scripts/generate-password-blocklist.test.js),
[notas de licença e geração](../../backend/src/security/password-common-2097.NOTICE.md).
Commit: `05e31280f66eef7782c9b0d0a27f0cc773568e94`.

## ETAPA 01 — auditoria transacional

14 testes; commit/rollback em PostgreSQL; falha crítica `42P01`; resíduos zero.
Mesmo executor da operação crítica, sem fallback quando explícito inválido;
erro crítico preservado e rollback pelo dono da transação.
Fonte: [testes](../../backend/src/services/auditoriaService.test.js).
Commit: `2fb3090b95620e90ef16401d466abba42e71f21d`.

## ETAPA 02 — revogação transacional

35 testes; rollback e commit da revogação no mesmo backend/transação da operação;
cleanup final com resíduos zero. Rehearsal no clone auth-recuperação, preparado
com as migrations anteriores conforme [inventário](migrations.md).
Fontes: [sessões](../../backend/src/services/authSessionService.test.js),
[middleware](../../backend/src/auth/authSessionMiddleware.test.js) e
[login](../../backend/src/controllers/loginController.test.js).
Commit: `48761e60381e380b511dffe623e0b3ca9082f2d3`.

## ETAPA 03 — logs seguros

46 testes no fechamento; scanner adversarial sem segredos nos logs capturados.
DB/SMTP simulados, sem banco ou envio real; sanitização apenas de logging.
Cobertura inclui Morgan/DEV/error com query/fragmento, CPF/celular prefixados,
telefone formatado, datas com underscore, metadados PostgreSQL, frames Windows/
Linux sem caminho absoluto e flags do mailer sem contagem por vírgulas.
SQL/params/retorno/mesmo erro e contratos HTTP/SMTP preservados nos testes.

Fontes: [testes centrais](../../backend/test/safeAuthLogging.test.js),
[login](../../backend/src/controllers/loginController.test.js) e
[auditoria](../../backend/src/services/auditoriaService.test.js).
Commit: `ddb6d1e8795c67879ec107fe264b04d52867f665`.

## MANUTENÇÃO MIGRATIONS — inventário oficial

Falha preexistente no teste de inventário corrigida para incluir a migration de
2026-10-02, já presente na base. Runner e migrations permaneceram inalterados.
`run-migration.identity`: **82/82**; suíte backend completa após correção: **402/402**.
Manutenção de teste, sem constituir etapa funcional da V3.

Fonte: [teste de identidade](../../backend/scripts/run-migration.identity.test.js).
Commit: `dd0722b54a3837994eda44ae7434179db1ccbca1`.

## ETAPA 05 — LOGIN COM VERIFICADOR MISTO

Commit: `1cbff88b5582308f68183fd96774f50256b17987`.

| Grupo validado | Resultado |
| --- | --- |
| [loginController](../../backend/src/controllers/loginController.test.js) | 28/28 |
| [passwordService](../../backend/src/services/passwordService.test.js) | 13/13 |
| [safeAuthLogging](../../backend/test/safeAuthLogging.test.js) | 25/25 |
| [authSessionService](../../backend/src/services/authSessionService.test.js) | 35/35 |
| [authSessionMiddleware](../../backend/src/auth/authSessionMiddleware.test.js) | 5/5 |
| Total diretamente relacionado | **106/106** |
| Suíte backend completa | **402/402** |
| Revisão adicional em memória com controller e criptografia reais | **10/10** |

`node --check` nos JS modificados e `git diff --check`: aprovados.
As fixtures de resultado não autenticado foram alinhadas ao contrato real antes
do commit funcional; os resultados acima incluem a validação final da suíte.

Escopo comprovado: bcrypt e Argon2id válidos; ambos incorretos com 401 canônico;
Unicode malformado e defesa contra erro Unicode do serviço; `requiresPasswordChange`
com 403 sem acesso normal; hash armazenado inválido e falha criptográfica com 500
genérico e diagnóstico sanitizado; piso temporal mínimo de 250 ms, espera apenas
do restante e nenhuma espera adicional após 250 ms; JWT/perfil/sessão/cookie de
transição e compensação; ausência de writers proibidos no login.

Limites: nenhum PostgreSQL real, nenhum SMTP e nenhum deploy nessas validações.
São evidências locais; **não provam produção**. Upgrade bcrypt → Argon2id não foi
persistido; Argon2id com `needsRehash` também não persistiu rehash. Nenhum desses
resultados fecha a concorrência login/reset ou o futuro fluxo seguro de troca.
Os testes não foram reexecutados nesta sincronização exclusivamente documental.

## ETAPA 06 — PONTE DE auth_version

Commit funcional: `665b3de7002748412d0942d124c6e501f1c2ac3d`.

Validação final de fechamento, incluindo os dois mismatches strict na matriz
versionada do middleware:

| Grupo | Resultado |
| --- | --- |
| [authVersion](../../backend/src/auth/authVersion.test.js) | 18/18 |
| [generateToken](../../backend/src/auth/generateToken.test.js) | 26/26 |
| [authMiddleware](../../backend/src/auth/authMiddleware.test.js) | 71/71 |
| [loginController](../../backend/src/controllers/loginController.test.js) | 48/48 |
| [authGoogle](../../backend/src/auth/authGoogle.test.js) | 26/26 |
| [safeAuthLogging](../../backend/test/safeAuthLogging.test.js) | 27/27 |
| [passwordService](../../backend/src/services/passwordService.test.js) | 13/13 |
| [authSessionService](../../backend/src/services/authSessionService.test.js) | 35/35 |
| [authSessionMiddleware](../../backend/src/auth/authSessionMiddleware.test.js) | 5/5 |
| Total focado | **269/269** |
| Suíte backend completa | **565/565** |

`node --check`: **11/11**; `git diff --check`: aprovado no fechamento funcional.
Os testes não foram reexecutados nesta sincronização exclusivamente documental.

### Evidências comprovadas

- `bridge`: sem claim/DB1 aceita; sem claim/DB>1 rejeita.
- `strict`: ausência de claim rejeita; mismatches claim1/DB2 e claim2/DB1
  rejeitam com 401, `AUTH-401-SESSAO-INVALIDA`, erro "Sessão inválida.",
  `autenticado: false` e `sessionExpired: true`, sem publicar identidade.
- Claims presentes inválidas e configuração ausente/inválida: fail-closed.
- `auth_version` inválido no banco: falha operacional 500; Google também
  distingue esse caso como erro interno.
- Login local e Google leem a versão na query já existente e a encaminham ao
  issuer; zero round trips adicionais.
- Rollback de **FORMATO** comprovado: middleware antigo ignora claim adicional;
  novo middleware em `bridge` aceita token antigo sem claim somente sob DB=1.
  Voltar ao middleware antigo perde a proteção por `auth_version`.
- Concorrência: token emitido com versão antiga é rejeitado quando o middleware
  observa nova versão. Essa prova não fecha a interação concorrente login/reset.
- Logs: nenhuma versão/token/PII expostos nos caminhos testados; motivo seguro
  `version_mismatch` nos mismatches.
- Writers: nenhum writer de `auth_version` introduzido.

### Limites da evidência

- Nenhum PostgreSQL real foi acessado na Etapa 06; a presença da coluna no
  ambiente de produção **não foi comprovada**.
- Nenhuma migration foi criada/modificada; nenhum writer incrementa
  `auth_version`.
- No fechamento da Etapa 06, reset legado ainda não invalidava access JWT por
  versão; a integração local é registrada na Etapa 07 abaixo. Sessão opaca não
  é invalidada apenas por `auth_version`.
- D8 continua aberta para o cutover `bridge → strict`.
- Não houve deploy. Evidência local não equivale a produção e não comprova
  que `AUTH_VERSION_MODE` esteja configurado nesse ambiente.

## ETAPA 07 — IMPLEMENTAÇÃO LOCAL CONCLUÍDA / FECHAMENTO LOCAL APROVADO

Base: `b84fafdec24dd527a78739e27bf1456b126d3bea`, branch
`revisao-premium-bloco-1-auth`. Revisão independente aprovada pelo responsável
em **09/10/2026**, após conferência do código e das evidências PostgreSQL
originais e complementares. Este registro integra o commit único de fechamento.

### Validação final prévia após a correção

| Grupo focado | Resultado |
| --- | --- |
| [authUsuarioController](../../backend/src/controllers/authUsuarioController.test.js) | 69/69 |
| [loginController](../../backend/src/controllers/loginController.test.js) | 50/50 |
| [authSessionService](../../backend/src/services/authSessionService.test.js) | 69/69 |
| [authSessionMiddleware](../../backend/src/auth/authSessionMiddleware.test.js) | 5/5 |
| Total focado final | **193/193** |
| Suíte backend completa final | **670/670** |

Zero falhas/cancelados/skips/todo nos dois conjuntos. Logs originais:
`focused-tests.log` e `full-tests.log`, no diretório externo
`escola-etapa07-r12-fix-20261009`. A correção acrescentou um grupo e quatro
subtestes (cinco casos Node): backend de 665 para 670. O total 383/383 pertence à
seleção mais ampla anterior à correção; não é o total focado final.

Sintaxe: 7/7 JS na implementação inicial e 2/2 arquivos na correção; aprovada.
`git diff --check` aprovado anteriormente e exigido novamente antes do commit.
Lint backend sem script/configuração pertinente; nenhuma dependência instalada.
Drivers PostgreSQL/SMTP bloqueados nos testes locais; 30 processos instrumentados
com zero tentativas de conexão/query PostgreSQL ou transporte SMTP. As suítes
não substituem o rehearsal real abaixo. Não houve reexecução de testes neste
fechamento documental.

### Evidência local

- Guarda obrigatória/estrita em `createSession`: invalidade do argumento/DB,
  igualdade e mismatch sob lock antes de efeitos, rollback e limite de cinco.
- Login preserva o snapshot original; perda simulada retorna 401 canônico com
  piso de 250 ms, espera somente do restante e sem espera adicional após o piso;
  sem JWT/cookie/notificação/compensação/next. Erros operacionais preservados.
- Emissão de reset usa JWT real com segredo fictício e claim estrita; DB inválida
  mantém resposta genérica sem token/e-mail. Ausência e invalidez da claim,
  assinatura/issuer/audience/expiração/finalidade/sub inválidos retornam 400.
- Reset usa hash bcrypt custo 10 preparado antes da tx. DB atômico simulado,
  revogação e helper de auditoria reais verificam ordem e o mesmo executor.
  Falhas de hash/begin/lock/UPDATE/revogação/auditoria/commit preservam estado;
  auditoria é crítica e sucesso só responde após conclusão da tx.
- Transições 1 → 2, 2 → 3, 2147483646 → 2147483647; máximo produz 500/no-op.
  Conta excluída/inexistente e mismatch produzem o mesmo 400 genérico.
- Replay do mesmo JWT e outro JWT emitido em N rejeitados após N → N+1;
  nenhum novo efeito. Zero sessões revogadas é válido; UPDATE zero linhas falha.
- Logging adversarial sem senha/hash/JWT/versões numéricas/PII ou erro bruto
  nos caminhos cobertos. Detalhes de auditoria fixos, sem req/body/segredos.
- Execução protegida por guardas de PostgreSQL/rede/SMTP/leitura de .env;
  contadores de tentativas proibidas zero. Configuração dummy só no processo.

### Rehearsal PostgreSQL original e correção do deadlock

Execuções de **09/10/2026**, PostgreSQL 16.15, branch Neon exclusiva
`rehearsal-etapa-07-descartavel`, derivada do clone auth-recuperação. Identidade,
TLS no socket do cliente e checksums das três migrations pertinentes do ledger
confirmados antes das fixtures; nenhuma migration executada.

Controllers, serviço de sessões, middleware Bearer, bcrypt, JWT e auditoria
reais, com transações e dados PostgreSQL reais. Barreiras no executor controlaram
interleavings; `pg_blocking_pids` demonstrou esperas entre backends distintos.
HTTP capturado localmente, sem servidor HTTP/browser; mailer e notificações
suprimidos nas fronteiras; nenhum SMTP real.

**R1–R11 operacionais aprovados** na execução original. R12 original com
contexto inicialmente ausente reproduziu **deadlock `40P01`**: troca de área
retinha sessão e aguardava usuário pela FK do contexto; reset retinha usuário
e aguardava sessão para revogar. Reset abortado com 500 e rollback integral.
A tentativa anterior com contexto existente teve timeout de barreira, sem prova
de deadlock; ambas as evidências foram preservadas.

Correção localizada em `changeActiveArea`: `SELECT ... usuarios ... FOR UPDATE`
no início da transação, alinhando **usuário → sessão → contexto**. Permissões,
proprietário, sessão não revogada e contexto após UPDATE efetivo preservados.
Sem retries ou alterações em migrations/constraints/triggers. Os sete JS atuais
coincidem com os hashes da evidência complementar.

### Sete provas PostgreSQL complementares

| Prova complementar | Resultado e comportamento comprovado |
| --- | --- |
| C1 — troca de área primeiro; contexto ausente | Aprovada; reset espera usuário, troca cria contexto e reset revoga; nova troca pós-commit rejeitada. |
| C2 — reset primeiro; contexto ausente | Aprovada; troca espera usuário, rejeita sessão revogada após commit e não cria contexto. |
| C3 — reset primeiro; contexto existente | Aprovada; troca rejeitada e contexto anterior preservado. |
| C4 — touch primeiro; reset depois | Aprovada; reset espera sessão, depois revoga; touch pós-commit rejeitado. |
| C5 — reset primeiro; touch depois | Aprovada; touch espera sessão e rejeita após commit, sem renovar uso/expiração. |
| C6 — JWT legado sem claim em bridge | Aprovada; aceito com DB=1 antes/durante reset não confirmado; 401 após commit DB=2. |
| C7 — login com senha nova antes/depois do commit | Aprovada; antes 401 sem token/cookie/next; depois 200, JWT N+1 aceito e nova sessão legítima; sessão antiga permanece revogada. |

**7/7 provas aprovadas; zero deadlocks/40P01.** C1–C7 são identificadores
documentais para as sete provas, sem renumerar os nomes originais do harness.
C1–C3 cobrem R12 corrigido; C4–C7 eram identificados como `Additional` no artefato.

### Numeração canônica e correspondência operacional

Fonte canônica: roteiro explícito fornecido pelo responsável em **09/10/2026**.
A ausência desse roteiro nos relatórios anteriores era uma limitação documental,
agora resolvida por esta correspondência; os artefatos originais permanecem
inalterados. **Todos os 13 cenários canônicos estão cobertos pelo conjunto das
evidências originais e complementares**, com revisão independente aprovada.

| Cenário canônico | Contrato | Correspondência ao harness / prova |
| --- | --- | --- |
| R1 | reset confirma antes do login antigo. | R11 operacional, reset vencedor: commit N+1 antecede a decisão de criação da sessão com snapshot antigo; 401 sem credenciais. Teste local da guarda preserva o snapshot original. |
| R2 | login bloqueia primeiro; reset aguarda e revoga. | R11 operacional, login vencedor e resposta atrasada; bloqueio real, sessão depois revogada e Bearer 401. |
| R3 | reset bloqueia primeiro; login antigo é rejeitado. | R11 operacional, reset vencedor; espera real no usuário, reset 200/login 401. |
| R4 | falha de auditoria provoca rollback integral. | R10 operacional; PostgreSQL 23514 após revogação, 500 e senha/versão/sessões restauradas. |
| R5 | falha de revogação provoca rollback integral. | R9 operacional; PostgreSQL 23514, 500 e estado integral preservado. |
| R6 | JWT anterior, inclusive bridge legado, é rejeitado. | R3/R11 operacionais para access JWT anterior; C6 para JWT realmente sem claim em bridge, 401 após commit. |
| R7 | sessão anterior permanece revogada. | R3/R11 operacionais e C1–C7; C7 distingue nova sessão legítima da antiga revogada. |
| R8 | JWT de reset não admite replay. | R5 operacional; mesmo JWT e outro JWT N rejeitados com 400, sem novos efeitos. |
| R9 | limite máximo de auth_version sem overflow. | R4/R7 operacionais; transição até 2147483647, máximo retorna 500 sem wrap/mutação. |
| R10 | duas redefinições concorrentes, somente uma confirma. | R5 operacional; mesmo token e tokens distintos, bloqueio real, 200/400 e único incremento/auditoria. |
| R11 | touchSession não ressuscita sessão revogada. | C4/C5; ambos os ordenamentos, rejeição pós-commit e ausência de renovação quando reset vence. |
| R12 | changeActiveArea e reset sem deadlock. | R12 original preserva 40P01; C1–C3 aprovam a correção, contexto ausente/existente, ambos os ordenamentos e zero deadlocks. |
| R13 | login com senha nova antes/depois do commit. | C7; 401 antes, 200/JWT N+1 após commit, nova sessão e antiga ainda revogada. |

A numeração **operacional** é distinta: R1 guarda estrita; R2 emissão; R3 reset/
revogação; R4 transições; R5 replay/consumo concorrente; R6 token/estado inválido;
R7 máximo; R8 zero sessões/UPDATE zero; R9 falha de revogação; R10 falha de
auditoria; R11 login/reset; R12 troca de área/reset; R13 invariantes/logs.

**R13 operacional permanece somente pré-checagem histórica**, sem execução de
fechamento após o deadlock. O `PASS` da primeira tentativa não é prova posterior
ao R12 definitivo, que registra `NOT_RUN_AFTER_R12`. Nenhuma aprovação final é
atribuída à pré-checagem; **R13 canônico está comprovado por C7**.

### Proveniência, preservação e limites

Artefatos externos ao repositório, consultados sem executar harness ou SQL:

- `escola-etapa07-20261009`: `relatorio.md`, `harness.cjs`, `scenarios.cjs`,
  `r1-r13-first-attempt.json`, `r12-missing-context.json` e
  `final-readonly-verification.json`.
- `escola-etapa07-r12-fix-20261009`: `relatorio-complementar.md`,
  `postgresql-complement.json`, `verification-summary.json`,
  `focused-tests.log` e `full-tests.log`.

Relatórios anteriores registram a etapa aberta naquelas execuções; a aprovação
independente de **09/10/2026**, fornecida pelo responsável, fecha agora a etapa
local. Fixtures sintéticas e branch descartável preservadas; fingerprints dos
dados herdados e fixtures anteriores preservados no complemento. Nenhum artefato
bruto é incluído no commit documental.

Não houve **teste de UI/browser nem implantação em produção**. O fechamento
documental não acessou PostgreSQL, não executou migrations, testes, SMTP ou deploy,
não fez merge na main e não excluiu a branch Neon descartável. Os resultados
comprovam rehearsal isolado; produção exige comprovação própria.

Bcrypt/política legada permanecem; histórico não integrado e reutilização possível.
`atualizarBasico` continua sem incremento de versão/revogação; outros writers
pendentes. Requests já autenticados antes do commit podem terminar. **D1–D8 e
demais pendências futuras já aprovadas permanecem abertas**.

## ETAPA 08 — EXPAND CONCLUÍDO / REHEARSAL E REVISÃO APROVADOS

Data: 09/10/2026. Base `3210ad6c6a6b82c1ed65819f1b37e94839357ee5`.
Arquivo novo `backend/db/migrations/2026-10-09-auth-quotas-expand.sql`;
SHA-256 `a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a`.

| Verificação local | Resultado |
| --- | --- |
| Contratos de quotas + identidade/inventário + contrato lexical do runner | **149/149 aprovados**; zero falhas/cancelados/skips/todo na execução final |
| `node --check` nos dois JS alterados/criados | **2/2 aprovados** |
| CLI do runner oficial, `--file db/migrations/2026-10-09-auth-quotas-expand.sql --dry-run` | Aprovado; **um único arquivo**, identidade canônica e SHA acima; sem conexão/SQL |

Arquivos de testes executados: `auth-quotas-migration.test.js`,
`run-migration.identity.test.js` e `run-migration.sql-contract.test.js`, em
`backend/scripts`. A suíte completa do backend não foi executada.

Contratos cobertos: seis colunas, PK simples da emissão, finalidades factuais,
conta/IP conjuntos ou isolados, sujeito obrigatório, par HMAC/key_id, digest de
32 bytes, formato controlado do key_id, timestamp finito/default do banco, FK
imediata RESTRICT, três B-trees, preflight e ausência de alterações/backfill/
limpeza automática em objetos legados. Identidade/LF/SHA e seleção pelo CWD
também conferidos pelo runner real.

Testes do protocolo `applyFile` usam arquivo SQL real e executor inteiramente
simulado: ordem DDL/ledger/commit, skip por mesmo SHA, rejeição de SHA divergente,
rollback diante de falha de DDL ou ledger. **Isso não executa nem valida o DDL
em PostgreSQL**. O scanner do runner é lexical, não parser semântico PostgreSQL.

Execução com URL dummy somente no processo e guardas de Pool/Client PostgreSQL
e TCP/TLS; nenhum PostgreSQL externo, .env ou SMTP utilizado. Nenhum serviço de
quota, cálculo HMAC, configuração de segredo ou writer foi implementado.

### Rehearsal PostgreSQL aprovado

Relatório externo `C:/tmp/escola-etapa08-20261009/relatorio.md`, consultado sem
executar harness ou SQL. Artefatos brutos permanecem externos ao repositório.
O relatório técnico registrava revisão pendente; a instrução do responsável
aprova a **revisão independente em 09/10/2026**, fechando agora a Etapa 08 expand.

Na Etapa 08, aplicação **somente** na branch Neon descartável `br-super-wave-adut7rdn`
(`rehearsal-etapa-08-descartavel`), filha de `br-small-union-ad2nicvt`
(`revisao-premium-ensaio-auth-recuperacao`). PostgreSQL 16.15; identidade e TLS
confirmados no rehearsal. Único arquivo aplicado pelo runner oficial:
`db/migrations/2026-10-09-auth-quotas-expand.sql`, SHA acima, ledger **id 7**.
DDL/ledger criados na mesma transação; segunda execução fez skip por mesmo SHA.
Essa branch descartável já foi excluída; os artefatos históricos permanecem.
O rehearsal da Etapa 09 usou a homologação permanente descrita abaixo, com
aplicação única dessa mesma migration naquele alvo.

| Grupo PostgreSQL | Provas aprovadas |
| --- | ---: |
| Runner, aplicação atômica, ledger e estrutura | 13/13 |
| Eventos válidos, visibilidade e rollback | 10/10 |
| Rejeições reais com savepoints | 22/22 |
| Segunda execução com skip | 1/1 |
| Preservação e estado final | 11/11 |
| Total | **57/57** |

Zero erros PostgreSQL inesperados. Estrutura real: seis colunas, PK, FK imediata
RESTRICT, seis CHECKs e três B-trees adicionais, além do índice da PK. Eventos
válidos cobriram conta, IP e ambos; uma emissão conjunta apareceu nos recortes
de conta e IP sem duplicar linhas. Segunda conexão não viu eventos sem commit.
Entradas inválidas foram rejeitadas com savepoints; a transação de fixtures
válidas terminou em rollback. Estado final: **tabela vazia (0 linhas)**.

Preservação conforme relatório: comparação integral dos dados de **89 tabelas
herdadas / 54.394 linhas**, por contagens e fingerprints antes/depois. Excluiu-se
somente a nova linha autorizada do ledger da comparação final. Os seis registros
anteriores foram preservados; ledger final com sete linhas. Catálogos herdados
comparados: relações, colunas, constraints, índices, triggers, funções, views,
políticas e definições de sequências. Não se comparou `last_value` mutável das
sequências; o INSERT autorizado do ledger usa a sequência existente.

A nova FK criou quatro triggers internos próprios: dois na tabela nova e dois
em `usuarios`. Os 663 triggers herdados mantiveram definição/estado; nenhuma
trigger ou constraint legada foi alterada. Nenhum usuário herdado foi modificado.

### Limites preservados

Falhas de preflight/colisão/DDL/INSERT do ledger ou checksum divergente não foram
injetadas no banco. O rehearsal comprova atomicidade da aplicação bem-sucedida e
rollback das fixtures; não comprova rollback de migration que falhou. Os testes
locais de falha do runner continuam evidência simulada.

A prova com duas conexões demonstra isolamento de eventos sem commit; não
comprova enforcement concorrente de quotas; essa evidência foi acrescentada
no rehearsal da Etapa 09 abaixo. Na Etapa 08, núcleo/HMAC e janelas ainda eram
contratos futuros. A decisão A e a Etapa 09 fecham o núcleo compartilhado, sem
ativação. Retenção/limpeza de 48 horas, integração, falhas/solicitações sem emissão,
origem confiável do IP e rotação operacional HMAC continuam abertas.
Rate limit legado intacto.
D1–D8 e demais pendências aprovadas preservadas.

**Rehearsal e revisão aprovados não significam implantação em produção.**
Não houve UI/browser, SMTP ou deploy. Neste fechamento documental/Git não foram
reexecutados testes, SQL, migration ou operações Neon; não houve merge na main
nem exclusão da branch descartável naquele fechamento. Ela foi excluída
posteriormente; não é alvo atual. Logs brutos, credenciais e PII não são
incluídos no commit.

## ETAPA 09 — NÚCLEO VERSIONADO / REHEARSAL E REVISÃO APROVADOS

Implementação local sobre `aceb73ac845542255b843e704525084e90654f6c`, publicada
em `a6f49e6c15157f92b3b06d203213a27b7c454182`. Fechamento aprovado em **13/10/2026**.
Decisão A fornecida pelo responsável: confirmação, alteração de e-mail e
recuperação compartilham os mesmos limites por conta/IP.

| Validação local final | Resultado |
| --- | --- |
| `authQuotaIp.test.js` + `authQuotaService.test.js` | **142/142 aprovados** |
| Suíte completa do backend (`node --test`) | **829/829 aprovados**, uma execução após as alterações de código |
| `node --check` nos quatro JS novos | **4/4 aprovados** |

Zero falhas/cancelados/skips/todo nos conjuntos locais finais. Nessas execuções
locais não houve PostgreSQL real; o rehearsal posterior está documentado abaixo.
Guardas processuais de Pool/Client, TCP/TLS, SMTP e leitura
`.env`, com URL dummy somente no processo. Focados: zero tentativas proibidas.
Suíte completa: zero tentativas PostgreSQL/rede/SMTP; **uma tentativa de leitura
`.env` bloqueada**, sem conteúdo lido. Não se presume uso de credenciais reais.

Cobertura: fronteiras exatas (t−W, t] em 60 s/15 min/1 h/24 h, incluindo diferenças
de um microssegundo; primeira emissão/excedentes; finalidades misturadas;
conta/IP isolados e conjuntos; clock único após locks; resultado genérico de
negação; replay e UUID divergente; configuração/normalização IPv4/IPv6/mapped;
HMAC e múltiplas versões; cobertura incompleta de key_ids; dados futuros;
falhas de query/INSERT/resposta/release/rollback; ausência de retries/logs/import
pelas rotas legadas. Provas usam dados sintéticos, sem registros reais exportados.

`db.tx` real carregado com pool/cliente inteiramente simulados comprova uso do
mesmo cliente e protocolo de commit/rollback, inclusive falha posterior do chamador
ou commit. Mocks de contagens e SQL não comprovam execução semântica, planner,
locks/advisory waits ou concorrência em PostgreSQL. As 57 provas da Etapa 08 são
históricas do expand; não validam este novo serviço.

Riscos/pendências: proxy efetivo não validado (`server.js` usa `trust proxy = 1`
e helper legado lê diretamente `X-Forwarded-For`); nenhuma integração HTTP nova.
Guarda global de versões HMAC pode ter custo proporcional ao volume da janela;
medir planner antes de operação. Vínculo imutável key_id/segredo e rollout entre
instâncias precisam de política operacional própria. Idempotência depende do
evento retido; desafios/outbox e futuro cleanup devem preservar seu contrato.
Uma emissão por executor db.tx evita batches que invertam a ordem dos locks;
integração deve respeitar usuário antes de sujeitos/UUID e propagar falhas críticas.

Solicitações sem emissão e falhas de emissão continuam sem nova política.
Não contar retry SMTP como emissão. Retenção operacional de 48 horas pendente;
sem ativação HTTP, SMTP, limpeza, associação desafio/outbox ou produção.
Schema, rate limit legado, frontend e D1–D8 intactos; nenhuma nova migration.

### Rehearsal PostgreSQL da Etapa 09 aprovado

Fonte local consultada somente por leitura:
`C:/tmp/escola-v3-etapa09-20261013-a6f49e6c/RELATORIO.txt`, acompanhado de
`resumo.json`, `preservation.json` e artefatos das tentativas/finais no mesmo
diretório. Logs brutos, fixtures, credenciais e dados pessoais ficam fora do Git.
O relatório técnico ainda registrava revisão/fechamento pendentes; a instrução
do responsável aprova a revisão independente em **13/10/2026**, após análise do
código, relatório e verificações independentes no Neon. Este fechamento não
reexecuta o harness, testes, SQL ou operações Neon.

Alvo isolado permanente: **`v3-homologacao` (`br-round-union-adok19ir`)**,
PostgreSQL 16.15, HEAD `a6f49e6c15157f92b3b06d203213a27b7c454182`. Identidade e TLS
cliente/certificado/hostname validados no rehearsal. A antiga branch descartável
da Etapa 08 (`br-super-wave-adut7rdn`) já foi excluída; o alvo deste ensaio
é a homologação permanente. A homologação permanente foi preservada, sem reset ou exclusão.

| Grupo final | Provas aprovadas |
| --- | ---: |
| Preflight | 7/7 |
| Migration 08 / runner | 7/7 |
| Núcleo Etapa 09 | 97/97 |
| Complemento dirigido Etapa 09 | 10/10 |
| Preservação | 8/8 |
| Total | **129/129** |

As **107 provas da Etapa 09** são 97 do núcleo + dez complementares: **99 com
SQL/transações reais e oito validações JavaScript sem SQL de quotas**.
Não somar as 57 provas históricas da Etapa 08 a esse total.

### Histórico transparente das tentativas

**141 checagens efetivamente executadas: 137 aprovações e quatro falhas
intermediárias do harness, diagnosticadas e corrigidas**. As 137 incluem oito
repetições aprovadas de preflight; as 97 provas aprovadas do núcleo não foram
repetidas na retomada. O total final consolidado é 129/129, não 141/141.

| Falha intermediária do instrumento | Correção / diagnóstico preservado |
| --- | --- |
| TLS do endpoint confundido com `pg_stat_ssl` do backend | Conferidos socket cliente criptografado, cadeia e hostname; o sinal do backend não descreve o TLS do endpoint. |
| Exigência de arquivos locais para migrations históricas do ledger | Bytes dos blobs Git históricos e seus SHAs exatos verificados somente por leitura. |
| Fronteira de 60 s, t−W+1 µs | Coleta tardia de fixture corretamente desfeita pelo savepoint na negação; instrumento corrigido. |
| Replay divergente por finalidade | Fixture alterada em memória depois do INSERT; o banco ainda recebia replay idêntico; instrumento corrigido. |

Separadamente, uma inicialização abortada **antes de qualquer prova ou chamada
ao serviço** gerou **dois erros PostgreSQL inesperados `22012`**, sem inserir
eventos. A execução corrigida teve **zero erros inesperados**. Quatro erros
esperados foram registrados: `25P01` uma vez, `22012` duas e `55P03` uma.
Nenhum defeito material do serviço foi encontrado nas condições reproduzidas.

### Migration, preservação e catálogo

O runner oficial aplicou **somente a migration 08, uma única vez neste alvo**:
`db/migrations/2026-10-09-auth-quotas-expand.sql`, ledger **id 7**, SHA-256
`a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a` inalterado e igual aos bytes Git.
Segunda execução fez skip por mesmo SHA, sem reaplicar ou duplicar ledger.
DDL/ledger compartilham a transação, comprovada por `xmin`; falha de DDL/ledger
não foi injetada. A Etapa 09 não adiciona migration.

Estado final: **`auth_quota_evento` vazia (0 eventos)**. Preservadas **89 tabelas /
54.394 linhas herdadas**: 88 tabelas / 54.388 linhas + seis linhas anteriores do
ledger. Fingerprints calculados no servidor, sem exportar linhas pessoais.
Ledger final com sete linhas, sendo somente uma nova linha autorizada.

Correção da contagem de catálogo, conforme verificação independente informada
pelo responsável: **1.717 atributos ativos e dez descartados, total de 1.727
entradas**. A referência a 1.717 colunas no relatório corresponde aos atributos
ativos; não é o total incluindo descartados. Catálogo herdado preservado:
541 relações, 578 constraints, 365 índices, 663 triggers, 117 funções e definições
de 77 sequências. Valores mutáveis das sequências não foram comparados.
As adições próprias da migration foram cinco relações, 16 atributos ativos
(incluindo atributos dos índices), oito constraints, quatro índices e quatro
triggers internos da nova FK; dois destes em `usuarios`, sem alteração de
triggers herdados. As contagens herdadas acima são separadas dessas adições.

Fixtures em rollback ou, após commits de concorrência, removidas por allowlist
exata de UUIDs sintéticos no ensaio já concluído. Isso não ativa rotina de
limpeza operacional; nenhuma limpeza é executada neste fechamento.

### Comportamento comprovado e limitações

Primeira emissão, três finalidades compartilhadas, conta/IP/ambos e uma linha
por emissão; janelas **(t−W, t]** de 60 s/1 h/24 h/15 min com microssegundos,
eventos futuros falhando fechado, replay igual/divergente e UUID concorrente.
Onze cenários reais de concorrência, com quatro conexões de emissão e observador,
registraram waits/blockers/locks, usuário antes dos advisory locks ordenados,
clock único depois dos locks e liberação em commit/rollback. Savepoints, negação
sem evento e falha posterior do chamador comprovados; normalização, HMAC
independente, múltiplas versões e guarda de cobertura também exercitados.

Executor do ensaio é adaptador com `raw === client` e `pg.Client` real; não
comprova integração definitiva com `db.tx` nas rotas. Fronteiras usam fixtures
inseridas após o clock real no mesmo cliente, sem substituir clock/respostas.
Não houve UI/browser, HTTP, SMTP ou fluxo real de desafio/outbox. Concorrência
limitada a quatro emissões por cenário, sem estresse prolongado. Deadlock
`40P01`, perda física de conexão, falha de rollback, falhas de migration/ledger
e checksum divergente não foram injetados no banco.

Cinco planos das queries publicadas foram inspecionados: SELECTs com
ANALYZE/BUFFERS e INSERT sem ANALYZE. Guarda global HMAC com 100/1.000/10.000
eventos recentes sintéticos: **0,061 / 0,326 / 2,491 ms** de execução PostgreSQL.
Ela examina os eventos recentes conhecidos, inclusive de IPs distintos; índice
temporal não elimina a dependência do volume. **Custo ainda sujeito à avaliação
operacional**, sem critério aprovado de aceitação em produção. Cache quente,
sem ANALYZE da tabela ou alteração de índices; cache frio, estatísticas,
distribuição e carga prolongada de produção não reproduzidos.

Consistência dos segredos entre instâncias, rollout/retirada de versões HMAC,
proxy efetivo, retenção/limpeza de 48 h e integração continuam pendentes.
**Núcleo implementado, versionado, revisado e aprovado em rehearsal isolado**
não significa ativação HTTP, SMTP, limpeza, outbox ou implantação em produção.
Branch permanente preservada; nenhuma operação de banco, deploy, merge ou
início da Etapa 10 neste fechamento documental/Git.

## ETAPA 10 — OUTBOX EXPAND / REHEARSAL E REVISÃO APROVADOS

Data: **13/10/2026**. Implementação publicada em `7bb864245409155a9130756911ce531b6b5454ca`,
sobre `bfb3e314933e3710897379a6e1c903d614667826`, branch
`revisao-premium-bloco-1-auth`. Revisão independente aprovada pelo responsável
em **13/10/2026**; este fechamento é exclusivamente documental/Git.
HEAD/branch esperados e worktree limpo conferidos no preflight.
Contratos de outbox e challenges conferidos; sem conflito canônico identificado.
Migration única `backend/db/migrations/2026-10-13-auth-outbox-expand.sql`;
SHA-256 LF `2be1525aa0bf1064de5d594ad026e5cc0c0fb533c0fcaedcf42032f489d52c0a`.

Preflight local leu as migrations de perfis/sessões/email/quotas, o runner,
DDL de `auth_email_confirmacao`/`auth_recuperacao_senha`, mailer, controllers de
notificação e services de lembrete de evento/uso de sala. `notificacoes` atende
notificações funcionais; `notificacoes_programadas` mantém mensagens/controles dos
services funcionais. Para `notificacoes_evento_agendadas`, o checkout contém
referência de exclusão no controller legado, sem DDL encontrado: a finalidade
vem da auditoria preliminar fornecida pelo responsável, não de catálogo atual.
Não se inferiu schema de produção; nenhuma dessas estruturas foi modificada.

| Validação local anterior, não reexecutada no fechamento | Resultado |
| --- | --- |
| `auth-outbox-migration.test.js` | **30/30 aprovados** no conjunto focado final |
| Outbox + `run-migration.identity.test.js` + `run-migration.sql-contract.test.js` | **162/162 aprovados**, zero falhas/skips/cancelados/todo finais |
| Suíte completa backend `node --test` | **859/859 aprovados**, executada uma vez após focados aprovados |
| `node --check` dos dois JS criados/alterados | **2/2 aprovados** |
| Parser PostgreSQL 16 `libpg-query@16.3.0` WASM | **21 statements SQL e dois blocos PL/pgSQL aprovados**, versão reportada 160001; sem executar SQL |
| Runner oficial `--file db/migrations/2026-10-13-auth-outbox-expand.sql --dry-run` | **Um arquivo**, identidade canônica e SHA acima; nenhum pool/SQL/ledger |
| `git diff --check` | Aprovado |

Histórico transparente: primeira rodada focada **161/162**, com uma falha do teste
por regex ampla que confundia `IF NOT EXISTS` do preflight com DDL tolerante a
colisão. Asserção restringida a `CREATE TABLE/INDEX`; rodada final **162/162**.
Nenhuma falha funcional encontrada. Parser Python `pglast` não compilou no Windows;
o parser WASM foi instalado somente em diretório temporário, com scripts de
instalação desativados. O loader exigiu carregar o binário local diretamente.
Nenhum manifest/lockfile ou dependência do projeto foi alterado.

Guardas temporárias de Pool/Client, TCP/TLS, SMTP e leitura `.env`, herdadas pelos
processos de testes; DATABASE_URL dummy somente no processo. **Zero tentativas
PostgreSQL/rede/SMTP**; **uma tentativa de leitura `.env` bloqueada**, sem conteúdo
lido, na suíte completa. Artefatos fora do Git em
`C:/tmp/escola-v3-etapa10-20261013-bfb3e314`: `focused.log`, `focused-final.log`,
`full.log`, `syntax.json` e registros sanitizados das guardas. Suíte completa
não foi repetida; na implementação local não houve aplicação no Neon. A aplicação
posterior e o rehearsal aprovado estão registrados abaixo.

Cobertura documental/lexical: 19 colunas, PK e FKs XOR, finalidade derivada dos
desafios sem duplicação, unicidade por desafio, snapshot imutável, envelope GCM
completo/remoção terminal, estados/agendamento/tentativas/leases, timestamps
finitos, erros controlados/SMTP permanente, terminais, índices sem predicado
volátil, preflight e ausência de DDL/DML em objetos legados. Inventário oficial
atualizado somente com a nova identidade. Runner real com arquivo real e executor
simulado cobre aplicação, skip, SHA divergente e falhas de DDL/ledger/rollback.

**Limites da validação local anterior:** testes de contrato e parser não executam
constraints, FKs ou trigger; não comprovam semântica de catálogo, planos, aplicação/ledger atômicos ou rollback
PostgreSQL real. Índices e lease_id fornecem estrutura para futura seleção com
`FOR UPDATE SKIP LOCKED` e fencing. A seleção estrutural foi posteriormente
comprovada no rehearsal abaixo; claim/worker e fencing integral permanecem
pendentes. [PostgreSQL 16 — seleção e locking](https://www.postgresql.org/docs/16/sql-select.html)
e [triggers](https://www.postgresql.org/docs/16/sql-createtrigger.html) foram
consultados para o desenho. Envelope SQL não prova criptografia, AAD ou unicidade
histórica de nonce após remoção; essas validações pertencem à Etapa 11.

FKs CASCADE preservam dependência da mensagem ao desafio e o fluxo canônico de
remoção do cadastro nunca ativado. A aplicação adicionou somente os triggers
internos das novas FKs nos challenges, sem reescrever objetos/constraints/triggers
de aplicação existentes. CASCADE e preservação foram provados no rehearsal abaixo;
política de limpeza/cancelamento e coordenação com SMTP futuro permanecem pendentes.

### Rehearsal PostgreSQL da Etapa 10 aprovado

Fonte técnica consultada somente por leitura:
`C:/tmp/escola-v3-etapa10-20261013-7bb86424/RELATORIO.txt`.
O relatório técnico registrava revisão/fechamento pendentes; a instrução do
responsável aprova a revisão independente e o fechamento em **13/10/2026**.
Artefatos brutos permanecem fora do repositório. Nenhum SQL, operação Neon,
teste ou rehearsal foi executado neste fechamento documental/Git.

Alvo exclusivo: homologação permanente **`v3-homologacao`
(`br-round-union-adok19ir`)**, PostgreSQL 16.15, HEAD `7bb864245409155a9130756911ce531b6b5454ca`.
Identidade, TLS cliente, certificado e hostname foram validados no ensaio antes
do SQL. Nenhuma implantação em produção; credenciais e dados pessoais não foram
incluídos neste registro.

| Grupo final | Provas aprovadas |
| --- | ---: |
| Preflight | 9/9 |
| Aplicação / estrutura / runner | 8/8 |
| Rehearsal PostgreSQL real | **161/161** |
| Preservação | 8/8 |
| Total | **186/186** |

Zero falhas, repetições ou erros do instrumento no rehearsal. **112 erros
PostgreSQL esperados e zero inesperados**: `23502` = 1, `23503` = 4,
`23505` = 5, `23514` = 101 e `55P03` = 1. Rejeições esperadas são provas
aprovadas: SQLSTATE e rollback por savepoint real conferidos, preservando o
fingerprint anterior. Restrições sobrepostas podem rejeitar pela primeira
constraint efetivamente observada; não se atribui erro a outro check por inferência.
As **161 provas PostgreSQL** não são os 162 testes focados locais e não os substituem.

### Aplicação, estrutura e preservação aprovadas

Runner oficial aplicou exclusivamente
`db/migrations/2026-10-13-auth-outbox-expand.sql` na homologação permanente.
Ledger **id 8**, SHA-256 `2be1525aa0bf1064de5d594ad026e5cc0c0fb533c0fcaedcf42032f489d52c0a`;
sete registros anteriores intactos, ledger final com oito linhas. Atomicidade da
aplicação bem-sucedida: DDL, constraints, índices, função, triggers e linha do
ledger compartilham `xmin`/transação **6100996**. Segunda execução fez **skip**
por mesmo SHA, sem reaplicar ou duplicar registro. Migration e checksum preservados.

Estrutura real: **19 colunas, 13 constraints e sete índices** (PK + seis adicionais),
uma função PL/pgSQL invoker com `search_path=pg_catalog`, um trigger BEFORE UPDATE
na outbox e oito triggers internos das novas FKs: quatro na outbox, dois em
`auth_email_confirmacao` e dois em `auth_recuperacao_senha`. Todos novos;
nenhum trigger herdado alterado.

Integridade referencial, unicidade, CASCADE de desafios sintéticos e restauração
por rollback, defaults, identidade/referências/criada_em e destinatário imutáveis,
contadores, estados, timestamps e leases comprovados. Envelope de bytes opacos
completo, rejeição de parciais/tamanhos inválidos, imutabilidade, remoção terminal
obrigatória em `sent` e impossibilidade de restaurar envelope removido verificadas.
Outbox e desafio invisíveis ao observador antes do commit; rollback externo e
savepoints restauraram/desfizeram fixtures, inclusive após CASCADE. Não houve
escrita/exclusão de usuários herdados.

**Outbox e quotas vazias ao final**, sem resíduos de fixtures. **90 tabelas /
54.395 linhas herdadas preservadas**: 88 tabelas / 54.388 linhas, sete registros
anteriores do ledger e tabela de quotas vazia. Contagens/fingerprints agregados
no servidor e definições do catálogo comparadas sem exportar linhas pessoais.
Adições autorizadas: tabela/seus índices, 13 constraints, uma função e nove
triggers novos; nenhuma sequência nova. Valores mutáveis de sequências e
estatísticas de runtime não foram comparados. Três desafios e três mensagens
confirmados para concorrência foram removidos por UUIDs de INSERTs confirmados,
com allowlist exata; isso não implementa limpeza operacional. **Homologação
permanente preservada**, sem reset ou exclusão.

### Seleção concorrente e limites do ensaio

Seis cenários com duas conexões reais: seleção de linhas diferentes por
`FOR UPDATE SKIP LOCKED`, `NOWAIT` contra linha bloqueada retornando `55P03`,
omissão de candidato bloqueado, seleção vazia quando todos bloqueados e liberação
após commit/rollback. Candidatos permaneceram `pending`: **suporte estrutural à
seleção concorrente comprovado**, sem claim/ack operacional de worker ou fencing
integral. Três EXPLAIN JSON de candidatos, leases e terminais foram inspecionados,
sem ANALYZE ou benchmark de produção; não aprovam custo operacional.

Limites preservados: envelope usa bytes sintéticos sem criptografia real,
autenticidade AES-GCM ou AAD. Unicidade key_id/nonce só enquanto o envelope existe;
remoção terminal permite reutilização no SQL, sem garantia histórica/criptográfica.
Constraints/trigger não são máquina operacional de worker; `pending` → `sent` com
campos consistentes é estruturalmente permitido. Leases de duração positiva foram
fixtures, sem definir duração, teto de tentativas, cronograma, cancelamento ou retenção.
Não se injetaram falhas DDL/ledger, checksum divergente, deadlock, perda de conexão
ou falha do rollback; atomicidade comprovada é a da aplicação bem-sucedida.

**Etapa 10 expand encerrada**, com revisão e rehearsal aprovados. Naquele
fechamento, as Etapas 11 e 12 estavam pendentes, sem criptografia operacional
ou enqueue. A Etapa 11 foi aprovada posteriormente, conforme seção abaixo.
Continuam pendentes worker, SMTP, fencing integral, exactly-once, limpeza
operacional e implantação em produção. O fechamento da Etapa 10 não executou
integração HTTP, deploy, merge ou início da Etapa 11. D1–D8 e Etapas 01–09
preservados; nenhum código, migration, teste ou runner alterado.

## ETAPA 11 — CRIPTOGRAFIA E ENQUEUE / REHEARSAL E REVISÃO APROVADOS

**Fechamento aprovado em 14/10/2026**, após revisão independente informada pelo
responsável. HEAD da implementação: `d9acb48b2f13ae998bfc688f1834511f0e3771bd`.
O registro de implementação/testes locais abaixo é histórico, de **13/10/2026**;
o rehearsal real aprovado está registrado em seção própria.

Data da implementação: **13/10/2026**. Base `a745a9d18c56ff50941a7f01131d32d1cbf21e5e` na branch
`revisao-premium-bloco-1-auth`. Preflight confirmou branch/HEAD esperados e árvore
limpa. Contratos de quotas/locks, challenges, outbox, db.tx, auditoria e autenticação
examinados; nenhuma alteração de schema necessária identificada. Quatro JS novos,
sem mudar serviços anteriores, migrations, rotas/controllers/server ou frontend.

| Validação local final | Resultado |
| --- | --- |
| `authOutboxCrypto.test.js` | **47/47 aprovados**, criptografia real node:crypto |
| `authEnqueueService.test.js` | **87/87 aprovados**, persistência/locks em modelo simulado |
| Novos + `authQuotaIp.test.js`, `authQuotaService.test.js`, `auditoriaService.test.js` | **290/290 aprovados**, zero falhas/skips/cancelados/todo |
| Backend completo `node --test` | **993/993 aprovados**, uma execução após estabilização/focados |
| `node --check` dos quatro JS novos | **4/4 aprovados** |
| Parser PostgreSQL 16 WASM `libpg-query@16.3.0` | **24/24 consultas distintas aprovadas**, incluindo invalidação de ambos os agregados; sem SQL externo |
| `git diff --check` | Aprovado |

Histórico local: rodada inicial dos dois novos testes **122/122**, depois cobertura
ampliada de falhas/replay/colisões para **134/134** dentro dos 290 focados finais.
Nenhuma rodada de testes falhou. A suíte completa foi executada somente uma vez.
Após a suíte completa, revisão alinhou somente fixtures do teste novo ao schema:
prazo expirado de 24 h consistente e hashes distintos entre desafios distintos.
Os focados foram conferidos novamente: **290/290 aprovados**, sem alteração dos
dois serviços ou repetição da suíte completa. O resultado 993/993 refere-se ao
mesmo código de implementação, antes desse ajuste exclusivo de dados de teste.
Consulta de gramática cobre SQL dos serviços/quotas/auditoria e savepoints;
parser não verifica catálogo, casts/tipos do driver, locks ou constraints em banco.
Reutilizado parser temporário existente, sem dependência/manifest/lockfile novo.

Guardas externas de Pool/Client, TCP/TLS, SMTP e `.env`, herdadas pelos processos;
DATABASE_URL dummy somente no processo. **Zero tentativas PostgreSQL/rede/SMTP**;
**uma tentativa de leitura `.env` bloqueada**, sem conteúdo lido, na suíte completa.
Artefatos fora do Git: `C:/tmp/escola-v3-etapa11-20261013-a745a9d1`, com
`focused-initial.log`, `focused-final.log`, `focused-fixtures-final.log`,
`full.log`, `sql-syntax.json` e guardas
sanitizadas. Há um arquivo Vercel versionado conferido sem alterações; ignorar
builds da branch V3 é configuração externa informada pelo responsável, não
verificada no painel nesta tarefa. Não houve deploy ou mudança de configuração.

Criptografia exercitada com dados/chaves exclusivamente sintéticos: AES-256-GCM
real, nonce/tag, AAD independente, adulterações de ciphertext/nonce/tag e identidade,
key_id/versão desconhecidos, chave incorreta e anterior explicitamente configurada,
configurações incompletas/acessors, mutação de configuração e RNG. Nenhum plaintext
parcial é exposto antes de autenticar. Buffers abertos temporários próprios são zerados,
sem promessa de limpar cópias nativas/strings ou todo o heap. Limites técnicos:
64 KiB de plaintext e 1 KiB de destinatário; sem redefinir regras funcionais.

Enqueue compõe quota real, crypto real e db.tx/auditoria reais carregados com
pool/cliente inteiramente simulados. O modelo verifica ordem usuário/advisory locks/
clock/desafio/outbox, cliente único sem pool/facade, microssegundos, prazos 24 h/30 min,
SHA-256 de token base64url de 256 bits, vínculos/UUIDs e destinatário. Exercitados
negação sem efeitos, desafios anteriores abertos/expirados/consumidos/invalidos,
versões/estado, replay igual/divergente, envelope removido, pares órfãos e replay
retido fora da janela. Colisões de nonce/hash são falhas críticas sem retry.

Falhas simuladas nos pontos do protocolo: savepoint/modo/usuário/locks/clock/
contagens/INSERT de quota, leitura/replay/desafio anterior/invalidação, RNG/cipher,
INSERT/resposta de desafio e outbox, auditoria, RELEASE, rollback, falha posterior
do caller e COMMIT. Preservação/restauração integral de quotas/desafios/mensagens/
auditoria verificada no modelo; não são provas PostgreSQL reais. Concorrência
local testa rejeição da segunda chamada no mesmo executor com barreira async;
não comprova serialização de duas conexões PostgreSQL. Sem logs/respostas com
conteúdo, token, chave, causa/detail do driver ou destinatário; auditoria recebe
somente IDs/finalidade. `{ status: "processada" }` é igual nos resultados normais,
sem provar commit, envio, autorização ou equalização de timing HTTP.

**Limites funcionais objetivos:** D1/retomada/provas de cadastro e colisões,
D4/recuperação sem confirmação/reativação assistida, identificação pública por CPF
e autorização/reautenticação/HTTP não implementados. Núcleo não emite para
cadastro pendente/excluído ou versões divergentes; confirmação somente de endereço
oficial não confirmado, alteração/recuperação no subconjunto com e-mail confirmado.
Nenhuma política nova de elegibilidade foi aprovada. Retenção futura deve preservar
ou definir explicitamente vínculo quota/desafio/mensagem: par incompleto falha
fechado, sem reconstrução ou cobrança. Nonce aleatório não garante unicidade
histórica depois de remover envelope; índice só protege entradas retidas.
Mensagens de desafios antigos invalidados não são apagadas nem enviadas aqui;
worker futuro deve revalidar o desafio.

### Rehearsal PostgreSQL da Etapa 11 aprovado

Fonte técnica local: `C:/tmp/escola-v3-etapa11-20261013-d9acb48b/RELATORIO.txt`,
registro UTC **2026-10-14T16:02:52.241Z**, consultado somente por leitura neste
fechamento. Alvo exclusivo do ensaio: projeto `wild-sky-49742510`, branch
**`v3-homologacao` (`br-round-union-adok19ir`)**, banco `neondb`, HEAD
`d9acb48b2f13ae998bfc688f1834511f0e3771bd`. Identidade/TLS, certificado e hostname
conferidos antes das escritas e em cada conexão transacional, segundo o relatório.

O relatório técnico ainda registra a etapa aberta para revisão e fechamento
formal: esse era o estado no momento da emissão. A **revisão independente foi
posteriormente aprovada em 14/10/2026**, conforme instrução explícita do responsável,
que também informou a conferência independente no Neon. Este registro encerra a
Etapa 11 no alcance aprovado; não resulta de uma nova consulta ao banco.

| Conjunto | Resultado / contagem |
| --- | --- |
| Provas PostgreSQL únicas consolidadas | **37/37 aprovadas** |
| Histórico de tentativas funcionais | **38 tentativas: 37 aprovadas e uma falha histórica do instrumento**, corrigida posteriormente |
| Erros PostgreSQL | **Oito esperados; zero inesperados** |
| Preflight inicial já aprovado | **Dez verificações**, reutilizadas e não contadas novamente nas 37 provas |
| Controles complementares | **Seis aprovados**, registrados separadamente das provas funcionais |

A primeira rodada registrou **27 tentativas, 26 aprovadas e uma falha
`E11_BLOCK_NOT_OBSERVED`** do instrumento de observação. A rodada complementar
funcional registrou **11/11 aprovações**. A prova corrigida de concorrência na
mesma conta/IP substitui a falha apenas na consolidação por nome: **27 + 11 = 38
tentativas; 26 + 11 = 37 provas únicas aprovadas**. A tentativa original, o
diagnóstico e as 26 aprovações anteriores permanecem preservados. Não declarar
38/38 provas nem apagar a falha histórica; ela não foi erro PostgreSQL inesperado.
Oito erros esperados abrangem o ensaio consolidado, incluindo um da rodada
complementar; não somar esse erro novamente. Preflight e controles não aumentam
o total das 37 provas únicas. Os controles complementares verificaram:

1. Três usuários sintéticos sem colisão, CPF válido e IDs explícitos.
2. Fronteira real de 60 segundos para a conta de recuperação.
3. Limpeza exata e atômica com exceção temporária autorizada do trigger.
4. Preservação final de dados, catálogo, ledger e homologação.
5. Valores finais das sequências, sem reinicialização.
6. Privacidade de logs e evidências.

### Alcance funcional real aprovado da Etapa 11

Serviço oficial de enqueue e `db.tx` reais, com criptografia real e identidades
sintéticas. **Confirmação de e-mail, recuperação de senha e alteração de e-mail**
aprovadas: emissão, hash, AES-GCM/AAD, envelope lido do PostgreSQL, TTL e auditoria;
adulterações rejeitadas. Microssegundos e prazos de 24 h/30 min preservados no
alcance ensaiado. Desafios anteriores `open`, `consumed` e `invalidated`, quota
negada, elegibilidade/versões, colisões reais de hash/nonce e PK e FK de mensagem
para desafio inexistente exercitados; falhas críticas sem retry nem efeitos órfãos.

**Atomicidade e rollback:** quota/desafio/outbox/auditoria compõem a transação;
falhas reais em CHECK de desafio, CHECK da outbox e FK da auditoria desfazem o
agregado e restauram o desafio anterior. Erro posterior do chamador restaura o
desafio confirmado e desfaz as quatro escritas. Não há transação independente
do serviço ou reparo automático de pares incompletos.

**Replay:** UUID idêntico concorrente aguarda commit e faz replay; após rollback
do líder, o seguidor cria a emissão. Replay idêntico com IP IPv4-mapped aprovado;
divergência por IP/finalidade rejeitada. Alteração mantém o destinatário e rejeita
candidato divergente; envelope removido em estado terminal não é recriado.
Pares quota-only, par sem quota e timestamps divergentes falham fechado.

**Concorrência:** mesma conta/IP produz uma emissão e uma quota negada;
recuperação/alteração compartilham quotas sob bloqueio; contas distintas disputando
a última vaga do IP não excedem a quota. Mudanças de `auth_version` e `email_version`
enquanto a emissão aguarda lock impedem uso de snapshot antigo. Observador, líder
e seguidor usam **conexões distintas e `pg_backend_pid()`**, com
**`pg_stat_activity` e `pg_blocking_pids`** para demonstrar esperas e bloqueios reais.
A falha histórica do observador foi `E11_BLOCK_NOT_OBSERVED`; a correção usa
os PIDs SQL reais. A validação isolada do observador não substitui a concorrência
do enqueue, comprovada nos cenários funcionais complementares.

### Limpezas, sequências e preservação da Etapa 11

**Duas limpezas transacionais explicitamente autorizadas**, limitadas aos IDs
sintéticos efetivamente confirmados; trigger
`auth_usuario_perfis_proteger_perfil_base` suspenso somente na transação protegida
e **restaurado antes de cada commit**. Na segunda limpeza, 63 referências FK
conferidas, contas com `FOR UPDATE NOWAIT` e perfil-base sob `ACCESS EXCLUSIVE NOWAIT`;
sem `session_replication_role`. Trigger original habilitado após a limpeza
(estado `O`). **Zero resíduos sintéticos** em usuários, vínculos, quotas,
desafios, outbox e auditorias. Essas limpezas não implementam limpeza operacional.

Sequência de auditoria avançou **349 → 358 → 364** por INSERTs, inclusive desfeitos;
**nenhuma reinicialização**. Na rodada complementar, 77 sequências conferidas,
somente `auditoria_eventos_id_seq` avançou de 358 para 364; `usuarios_id_seq`
inalterada. Não confundir rollback de dados com reversão de sequência.

A **conferência independente no Neon informada pelo responsável** confirmou:

- **2.668 usuários e 2.774 vínculos de perfis** preservados.
- **Outbox, quotas e desafios vazios**, auditorias sintéticas removidas e trigger
  original habilitado.
- **Oito registros no ledger**, sem reaplicação de migrations ou mudança de checksum.
- **89 tabelas originais e 54.394 linhas preservadas**, com **zero divergências de
  conteúdo após excluir os registros das migrations 08 e 10**. Essa comparação
  usa o recorte original; não substitui as contagens históricas de 90 tabelas /
  54.395 linhas herdadas usadas no rehearsal da Etapa 10.
- Branch **`v3-homologacao` preservada**, sem reset ou exclusão.

O relatório registra preservação de dados, catálogo/OIDs/definições e ledger
contra o baseline; snapshots cobrem o estado observado. Manifest com 48 arquivos,
34 artefatos anteriores com hashes inalterados. Segredos/chaves/tokens/destinatários
sintéticos e valores sensíveis mantidos em memória; evidências e logs sanitizados.
A prova histórica de redação da facade foi preservada, sem reexecução; controle
complementar registrou zero logs novos e 78 valores sensíveis verificados em memória.

### Limites e implantação da Etapa 11

**Etapa 11 encerrada; onze etapas concluídas entre 57**, sem percentual ponderado
ou novo prazo. **D1–D8 e demais pendências preservadas; Etapa 12 não iniciada naquele fechamento**.
Não implementa worker SMTP, retries, claim/ack, ativação HTTP, integrações públicas
ou exactly-once; limpeza operacional e fencing integral continuam pendentes.
Três finalidades e garantias aprovadas se limitam aos cenários documentados,
sem prova de produção, entrega SMTP ou autorização pública.

Decisão aprovada pelo responsável: **uma única plataforma pública, mantendo o
endereço atual, com modernização progressiva por blocos**; produção operacional
durante a transição, homologação e produção separadas. Substituição da autenticação
somente após validação integral das integrações essenciais, plano de implantação/
reversão e autorização expressa. Não presumir duas plataformas públicas ou
implantação automática após o Bloco 1. [Decisão canônica](decisoes-canonicas.md#decisão-canônica--implantação-progressiva-na-plataforma-pública-atual).

O fechamento documental/Git da Etapa 11 alterou somente os seis documentos de
`docs/v3`, sem código, teste, migration, banco ou configuração de implantação,
reexecução de testes/SQL/Neon/PostgreSQL, SMTP, deploy, merge ou início da Etapa 12.
A implementação posterior da Etapa 12 está registrada abaixo; aprovação e
publicação Git não equivalem a implantação.

## Etapa 13 — contexto restrito e barreira de acesso

**15/10/2026**, base `07499cc96f47e9f1a0bfcb76ca7557c02904dbc5`, branch
`revisao-premium-bloco-1-auth`, HEAD/worktree conferidos antes de alterações.
Escopo e D2 aprovados pela instrução do responsável. Etapas 01–12 continuam
concluídas de 57; **Etapa 13 implementada para revisão, aberta até revisão
independente e rehearsal PostgreSQL; Etapa 14 não iniciada**.

### Arquivos e arquitetura

- Novos: serviço `authRestrictedContextService.js`, middleware
  `authRestrictedMiddleware.js`, rota `authRestrictedRoute.js`, migration
  `2026-10-15-auth-contexto-restrito-expand.sql`, quatro arquivos de teste dedicados
  e fixture transacional de apoio.
- Integração pontual: `authSessionService.js` cria contexto na transação de nova
  autenticação quando habilitado; `authMiddleware.js` aplica a barreira após JWT
  oficial, também em authAdmin; `authSessionMiddleware.js` revalida cookie e
  credenciais combinadas; `routes/index.js` monta a consulta exata.
- `run-migration.identity.test.js`: somente nova entrada no inventário esperado.
  Runner de produção, migrations antigas, contratos 06/08–12, loginController,
  frontend, infraestrutura, Vercel/Render e produção preservados.

D2: 30 min de inatividade e 120 min absolutos fixos, inclusive com
`manter_conectado=true`. Comparações estritas com relógio PostgreSQL/microssegundos,
depois dos locks; fence final temporal no UPDATE. Negação não renova o contexto.
Logout/revogação, exclusão e versão divergente invalidam reutilização.
Cookie antigo/sem registro D2 exige nova autenticação; não há criação tardia,
upsert ou renovação do absoluto. Cadastro salvo no usuário é relido após nova
autenticação; preferência de área nunca é progresso.

Prova de e-mail/cadastro e preenchimento institucional vêm do servidor.
Revisão/políticas/MFA não implementados continuam não comprovados: nenhuma conta
é promovida a regularizada por ausência de prova. Uma flag não fabrica essa prova.

Inspeção de `usuarioController.atualizarBasico` encontrou writers legados de
senha/e-mail sem incremento de auth_version. A migration nova inclui função/trigger
que remove somente vínculos D2 ao mudar senha, e-mail, auth_version, email_version
ou exclusão. Preserva os dados/versões e progresso do usuário. O contrato do
trigger e seu efeito modelado foram validados localmente; execução PostgreSQL
real pendente, sem apresentar o trigger como aplicado.

### Cobertura efetiva e limites das rotas

Integração central nos dois autenticadores oficiais, sob
`AUTH_RESTRICTED_CONTEXT_ENABLED`: ausente/`false` preserva operação legada;
`true` aplica a barreira e valores ambíguos falham fechado.
Inspeção estática encontrou **33 módulos existentes** importando o autenticador
Bearer, além da nova rota de contexto. Isso é inventário de imports, não prova
de execução de cada endpoint. Cookie middleware prepara integração futura por
domínios 42/43; rotas legadas mantêm exigência Bearer atual, sem fallback global.

Allowlist exata única: **GET /api/auth/contexto-restrito**, consulta do estado e
progresso comprovável. Cookie válido vinculado à sessão/versão é obrigatório;
Bearer sozinho não autoriza regularização. Sem autenticação não existe acesso
restrito autorizado. Credenciais combinadas inválidas/divergentes são rejeitadas.
Nenhuma exceção por perfil, por `/api/auth/*` ou por todo `/api/perfil`;
nenhum método de atualização de perfil foi autorizado.

Testes atravessam os roteadores Express reais de **dashboard, agenda, perfil e
evento**, com controllers, rate limit e banco simulados, autenticador/JWT real.
Validam negação antes do controller e preservam dois endpoints públicos:
GET /api/perfil/opcao e GET /api/evento/:id/folder. A consulta nova usa roteador
real e testa cookie sozinho, Bearer fornecido inválido, ausência de autenticação,
desabilitado e métodos distintos. Não houve servidor HTTP/TCP ou browser real.
O diagnóstico legado de cadastro incompleto foi instrumentado como permissivo
em erro, mas não integra a decisão de autorização do novo fluxo.

### Validação local

| Validação | Resultado |
| --- | --- |
| Testes novos dedicados | **152/152**, incluídos nos focados |
| Focados: núcleo novo + autenticação, sessão e login afetados | **347/347** |
| Sintaxe JS | **13/13** arquivos criados/alterados |
| Única execução da suíte completa | **1.678/1.679**, uma falha no inventário estático do teste do runner |
| Correção da falha de inventário | Lista acrescida da migration nova; teste afetado revalidado **1/1** |
| PostgreSQL/rehearsal novo | **Não executado**, pendente |
| Ativação operacional/produção | **Não realizada nem autorizada** |

A única falha da suíte completa esperava seis arquivos no inventário oficial,
mas a nova migration acrescenta o sétimo. Corrigida somente a lista esperada em
`run-migration.identity.test.js`; reexecução do teste exato aprovada.
A suíte completa **não foi repetida** por limite expresso do responsável.
Essa rodada antecede a correção da lista esperada e o complemento final do
trigger D2, que acrescentou dois testes aos 150 iniciais; a validação focada
final inclui **152 novos / 347 focados**, todos aprovados.
**Não alegar suíte completa verde sobre o patch final.** Não somar rodadas
históricas ou reexecuções como novas provas.

Cobertura nova: limites exatos e ±1 microssegundo em 30/120 min, atividade sem
renovação absoluta, manter conectado, revogação/logout, versão, exclusão, dados
obrigatórios ausentes, campos persistidos e reautenticação, papéis múltiplos,
cookies e JWTs reais válidos/expirados/divergentes, conflito de identidade,
allowlist por método/caminho, falha de banco/rollback, erros sanitizados,
concorrência serializada em **modelo** e fence de expiração entre leitura/escrita.
Criação de sessão/contexto é testada na mesma transação, com rollback conjunto.
Modelos e checks de contrato SQL não provam constraints/locks/concorrência física
do PostgreSQL; isso permanece no rehearsal posterior.

Artefatos fora do repositório:
`C:/tmp/escola-v3-etapa13-20261015-07499cc9/`, `core-initial.log`,
`dedicated-initial.log`, `dedicated-second.log`, `focused.log`,
`focused-final.log`, `full.log`,
`runner-inventory-fix.log`, `runner-inventory-final.log` e `guard-*.json`. Falhas iniciais dos instrumentos
(regex abrangente/comentário e helper VM de modo de versão) preservadas; não
confundidas com resultado final focado. DATABASE_URL dummy somente nos processos;
guardas de Pool/Client, TCP/TLS, SMTP e leitura .env. **Zero tentativas PostgreSQL,
rede ou SMTP; uma leitura .env bloqueada**, sem conteúdo lido.

### Dependências e continuidade

Núcleo implementado difere de ativação operacional: **não habilitar globalmente
antes dos fluxos completos de regularização**, revisão e plano de integração.
Ainda faltam consumidores V3, fluxos de escrita/revisão/políticas das Etapas
29/30, MFA/CSRF e migração por domínios 42/43. Google mantém o contrato Bearer
legado; regularização requer sessão cookie comprovável, sem antecipar D3.
D1 e D3–D8 continuam pendentes. Uma única plataforma pública no endereço atual,
modernização progressiva e homologação separada. Sem Neon, produção, deploy,
merge, mudança Vercel/Render ou início da Etapa 14.

A migration está somente preparada no Git. Rehearsal futuro descrito em
[migrations](migrations.md#etapa-13--persistência-mínima-de-d2-não-aplicada),
mediante autorização específica. **Etapa 13 permanece aberta até revisão
independente e rehearsal PostgreSQL.**

## Fechamento aprovado da Etapa 12

Registro histórico do fechamento da Etapa 12, anterior à implementação da
Etapa 13 descrita acima; não altera o status atual de abertura da Etapa 13.

**15/10/2026 — Etapa 12, Worker de envio e retries, encerrada documentalmente**, por
instrução expressa do responsável, após revisão independente aprovada do commit
`db095b6f325c41f093c79b271670785e94eff848`, sem defeitos materiais remanescentes
identificados no escopo. **Etapas 01–12 concluídas de 57. Etapa 13 não iniciada.**

### Histórico Git aprovado

| Marco | Commit |
| --- | --- |
| Implementação inicial | `bf6155bccba4657ab7350692ecc2273945b6add4` |
| Correção das flags/dry-run | `40ab140fa23f4cf879ac00d867b0def3ef5deff5` |
| Correção final de cancelamento/IPC | `db095b6f325c41f093c79b271670785e94eff848` |

A correção final torna IPC provisório até a saída normal do processo: cancelamento
manual/automático, erro ou saída anormal não confirmam envio por presunção;
`accepted` permanece válido com saída zero, sem sinal e sem cancelamento.
Revisão independente final aprovada conforme instrução do responsável neste
fechamento. Os registros anteriores abaixo preservam o estado anterior à aprovação.

### Provas consolidadas e rastreabilidade

| Evidência aprovada | Resultado e origem |
| --- | --- |
| Backend completo atual | **1.529/1.529**, uma execução após estabilização do patch |
| Focados atuais | **670/670** |
| Regressões novas | **29/29**, incluídas nos focados; 22 falhavam antes do patch |
| Subprocessos Node reais com IPC sintético, sem SMTP | **4/4**, distintos das provas físicas SMTP |
| Rehearsal PostgreSQL | **44/44 provas únicas**, com três falhas históricas do instrumento corrigidas e preservadas |
| Transporte SMTP físico controlado | **52 verificações aprovadas**, kill em **115,072 s** e resolução em **115,078 s**, dentro de **120 s** |

Rehearsal PostgreSQL em `v3-homologacao`, sobre
`40ab140fa23f4cf879ac00d867b0def3ef5deff5`, aprovado pelo responsável.
As 44 provas únicas correspondem a **47 tentativas concluídas históricas**:
44 aprovadas e três falhas do instrumento nas três finalidades, código `42883`,
corrigidas no harness e preservadas nos artefatos originais. Duas provas aprovadas
foram reutilizadas e 42 tentativas corrigidas completaram a rodada; não somar
reexecuções como provas únicas. **13 erros PostgreSQL esperados**; três inesperados
históricos do instrumento e zero inesperados na execução corrigida. **11 controles
de preflight** e **cinco controles da rodada** têm contagens separadas.

Limpeza transacional autorizada concluída: **zero resíduos sintéticos no Neon**,
trigger de proteção do perfil-base restaurado antes do commit, ledger e dados
herdados preservados. Não houve nova consulta ao Neon ou limpeza neste fechamento.
Rastreabilidade local: `C:/tmp/escola-v3-etapa12-20261014-40ab140f/`,
`RELATORIO.txt`, `resumo.json`, `rehearsal.json`, `rehearsal-resumed.cjs`,
`attempt1-rehearsal.json`, `attempt1-unexpected-postgres-errors.json`,
`final-audit.json` e `manifest-sha256.json`. Artefatos e falhas históricas preservados;
o status pendente nesses relatórios é anterior à aprovação independente atual.

SMTP físico: **52 verificações consolidadas**, com **47 do adaptador real**,
três controles TLS auxiliares e dois de escopo/Git. Encerramento por `SIGKILL`
em 115,072 s, resolução após saída em 115,078 s, sem resíduos de processos/sockets
na conferência final. A prova de resposta tardia do servidor não comprovava IPC
`accepted` já enfileirado; essa lacuna foi tratada pelo patch final aprovado.
Fontes: `C:/tmp/escola-v3-etapa12-smtp-local-20261014-40ab140f/`,
`RELATORIO.txt`, `evidencia.json` e `verificacao-final.json`.
TLS negativo foi comprovado; o controle TLS positivo auxiliar não prova o caminho
positivo pelo adaptador SMTP. Os logs de testes e a prova Node do patch permanecem
em `C:/tmp/escola-v3-etapa12-ipc-20261015-40ab140f/`, conforme seção da correção final.

### Limites preservados e ativação futura

- Consumidores HTTP dos tokens V3 ainda não integrados; worker operacional
  **desabilitado por padrão** e envio real bloqueado.
- **TLS positivo pelo adaptador SMTP ainda não comprovado fisicamente**.
  Sua prova deverá anteceder a futura ativação de SMTP real, sem reabrir
  automaticamente toda a Etapa 12.
- Política at-least-once, **sem exactly-once**: duplicação externa continua possível
  após aceitação SMTP e perda de confirmação; aceitação não garante caixa/leitura.
- Nenhuma implantação em produção. D1–D8 e demais pendências preservadas.
- **Etapa 13 não iniciada**; nenhuma nova atividade de implementação ou ensaio
  autorizada por este fechamento.

Decisão canônica preservada: modernização progressiva por blocos da **única
plataforma pública no endereço atual**, com produção operacional durante a transição
e homologação separada. Integrações essenciais, plano de implantação/reversão
e autorização expressa continuam necessários ao cutover.

Fechamento **exclusivamente documental/Git**, sem alterar código, testes,
migrations, banco, rotas, frontend ou configurações de implantação; sem reexecutar
suítes, PostgreSQL, SMTP ou ensaios anteriores. Revisão de links e
`git diff --check` são as validações deste fechamento. Sem merge ou deploy.

## ETAPA 12 — WORKER LOCAL / REVISÃO E REHEARSAL PENDENTES

Registro histórico da implementação inicial, anterior aos ensaios e à revisão
final; status de abertura abaixo superado pelo fechamento aprovado acima.

Data: **14/10/2026**. Branch `revisao-premium-bloco-1-auth`, base de implementação
`93ede97275139dcb9285e4326f0dd8f69fd94022`, confirmada com worktree limpo no
preflight. Decisões operacionais autorizadas pelo responsável na solicitação;
**implementação para revisão, sem encerramento da Etapa 12 ou início da Etapa 13**.

### Arquivos e validação local da Etapa 12

Sete novos JS: `authOutboxWorker.js` / `.test.js`, `authSmtpSender.js` / `.test.js`,
`authSmtpProcess.js`, `jobs/authOutboxJob.js` / `.test.js`. Alterações pontuais em
`mailer.js` (factory institucional exclusiva) e `server.js` (start/shutdown).
Somente os seis documentos pertinentes de `docs/v3` atualizados. Nenhuma migration,
rota pública, controller, frontend, configuração Vercel, manifest/dependência,
serviço de quotas/enqueue/criptografia anterior ou job de eventos/salas alterado.

| Validação final | Resultado / alcance |
| --- | --- |
| Testes novos do worker, processo SMTP e job | **118/118**, incluídos nos focados finais |
| Focados com crypto/enqueue/quotas/auditoria e safeAuthLogging | **435/435**, zero falhas/skips/cancelados/todo |
| Backend completo `node --test` | **1.111/1.111**, executado **uma única vez após estabilização** |
| Sintaxe dos nove JS criados/alterados | **9/9**, `node --check` |
| PostgreSQL / SMTP reais | **Não executados**; dependem de revisão e autorização posteriores |

Rodada inicial dos três novos arquivos: **100/100**; revisão ampliou para 118
novos casos, todos aprovados nos focados finais. Ajustes de código terminaram antes
da única suíte completa; não foi reexecutada após documentação. Não somar 100,
435 e 1.111 como provas únicas nem confundir resultados com o rehearsal da Etapa 11.

Modelo transacional deliberado, com estado compartilhado, isolamento de escritas
até commit, SKIP LOCKED simulado, ordem de locks e invariantes de transição
independentes das queries. Não é emulador PostgreSQL nem prova de seus locks,
triggers, casts, constraints ou query planner. Crypto/AES-GCM realmente executado
com chave/token/destinatários sintéticos; filhos SMTP e timers substituídos por
mocks, sem processo real de envio. A tentativa adicional de parser SQL local
não produziu validação: `queryparser.node` ausente no pacote nativo temporário.
**Sem conclusão de gramática SQL nesta etapa**; sintaxe JS aprovada não substitui
PostgreSQL real. Nenhuma dependência foi instalada ou alterada para contornar isso.

Cobertura: três finalidades/destinatário imutável e hash, seis slots absolutos,
slots atrasados sem rajada, TTL/microssegundos, três workers concorrentes, claim
exclusivo/invisível antes do commit, identidade nova em reclaim, fencing e limite
exato do lease, crash antes/depois de SMTP, aceitação tardia após perda da posse,
limite de tentativas interrompidas, erro transacional/commit/ack e rollback,
conta/desafio/versão/destino inválidos, adulteração GCM e chave ausente, limpeza
terminal, dry-run/desabilitado sem efeitos, polling sem sobreposição, stop/restart,
logs com códigos fixos e compatibilidade de mailer/jobs/lifecycle.

Mocks do adaptador conferem término com `SIGKILL` aos 115 s e espera por exit,
resultados de aceitação/4xx/5xx/indeterminado/dry-run, configuração TLS/timeouts,
nenhuma credencial em argumentos/env/stdout/stderr e payload sem cc/bcc/envelope.
Não provam latência física nem cancelamento efetivo de sockets no SO/SMTP real.

Artefatos fora do Git: `C:/tmp/escola-v3-etapa12-20261014-93ede972/`,
`focused-initial.log`, `focused-final.log`, `full.log` e guardas `guard-*.json`.
DATABASE_URL dummy somente nos processos de validação. Guardas bloquearam
Pool/Client/TCP/TLS/transporte SMTP e leitura `.env`: **zero tentativas PostgreSQL,
rede ou SMTP reais**; uma tentativa de leitura `.env` bloqueada, sem conteúdo
lido, durante a suíte completa. Nenhum acesso Neon/produção, envio real, deploy,
merge ou mudança de configuração de implantação.

### Garantias locais e dependências da ativação da Etapa 12

Claim/reclaim transacional com `SKIP LOCKED` e UUID novo, lease **180 s**, tentativa
consumida na aquisição; polling **30 s**, uma mensagem por processamento. Usuário
→ desafio → outbox; ack/revalidação esperam brevemente na mesma ordem, sem locks
reversos. Clock PostgreSQL e UTC com seis casas; SMTP fora de transação.
Ack exige id/estado/UUID e lease não expirado no UPDATE; resultado obsoleto `stale`
não altera a posse nova. Statement timeout 5 s e lock timeout 2 s por transação.

Offsets absolutos desde `criada_em`: recuperação **0/1/3/7/15/25 min**,
confirmação/alteração **0/1/5/15/60/180 min**. Até seis claims, incluindo inicial e
interrompidos. Retry escolhe primeiro slot futuro permitido, pula vencidos e não
agenda em/apos expiração. Permanente termina `failed`; esgotamento idem. Terminais
limpam ciphertext/nonce/tag/key_id sem excluir identidade, histórico ou auditoria.
Quotas de 48 horas e sua limpeza permanecem inalteradas.

Antes do SMTP revalida desafio aberto/TTL/finalidade, conta elegível/destinatário e
**versão persistida por finalidade**, conforme expand: e-mail em confirmação/
alteração, auth em recuperação. Schema não guarda ambos os snapshots por desafio;
nenhum snapshot ausente inventado. AES-GCM/AAD autenticados, token/hash comparados;
buffers próprios zerados, sem promessa sobre strings/copias IPC/heap. Logs/respostas
contêm status/códigos fixos, nunca conteúdo/token/hash/chave/URL ou SMTP bruto.

**Ativação real bloqueada antes de claim:** consumidor V3 ausente no job padrão.
Rotas de recuperação atuais usam JWT `pwd-reset`, não token opaco; nenhum link V3
para essas rotas. Um flag de prontidão não abre o gate. Habilitação explícita,
consumidor V3 integrado e configuração completa devem preceder processamento real.
Desabilitado e dry-run não consultam DB, fazem claim, consomem, decifram ou enviam.

Adaptador institucional dedicado em processo isolado: kill aos **115 s**, margem
de 5 s no limite técnico **120 s**, aguarda saída efetiva; timeouts por fase e TLS
seguro. Falha de kill bloqueia novos envios, sem ack presumido. Para iniciar SMTP,
a revalidação exige ainda **mais de 125 s de lease**. `sent` representa aceitação
pelo transporte; nunca dry-run, garantia de leitura ou entrega na caixa postal.
Prazo físico/cancelamento real exigem comprovação separada antes da ativação.

Perda de resultado/ack ou crash após aceitação podem causar duplicidade externa,
mesmo com fencing de banco; não há exactly-once. Invalidação pode ocorrer entre
liberar os locks e iniciar SMTP; não prometer cancelamento retroativo. Retenção
histórica não aprovada: sem exclusão automática nem política nova de descarte.
Consumo HTTP/links V3, revisão independente, provas PostgreSQL e transporte real
são dependências abertas; não bloqueiam a publicação do núcleo desabilitado para
revisão, mas bloqueiam sua ativação real e o encerramento da Etapa 12.

D1–D8, decisões anteriores e **uma plataforma pública no endereço atual**
preservados, modernização progressiva por blocos com produção operacional e
separada da homologação. Cutover só com integrações essenciais integralmente
validadas, plano de implantação/reversão e autorização expressa.
**Onze etapas encerradas entre 57; Etapa 12 não encerrada; Etapa 13 não iniciada.**

### Correção pontual — flags de dry-run da Etapa 12

**14/10/2026**, base `bf6155bccba4657ab7350692ecc2273945b6add4` na mesma branch,
HEAD/worktree conferidos. A revisão independente identificou comparações exatas
com `"true"` que divergiam dos aliases do mailer institucional. Correção autorizada,
sem fechar a Etapa 12 nem iniciar a Etapa 13.

Criado `authOutboxFlags.js`; ajustes localizados em `authOutboxJob.js`,
`authOutboxWorker.js` e somente na autorização de `mailer.createAuthEmailSender`.
Ampliados os três testes dedicados de job/worker/adaptador. `sendEmail`, seu
normalizador e todo o mailer antes da factory V3 preservados byte a byte.
Atualizados pontualmente decisões canônicas, evidências e retomada.

- **534/534 focados**, nos três testes dedicados e `safeAuthLogging`, zero falhas,
  skips/cancelados/todo; matriz de aliases, caixa/trim, booleanos/números, ausência,
  inválidos/ambíguos em cada uma das quatro flags, outbox sem efeitos, consumidor
  ausente bloqueado, polling/readiness revalidados e mailer institucional simulado.
- **1.500/1.500 backend completo**, **uma única execução após estabilização**;
  nenhum código alterado depois dessa execução. Resultado anterior 1.111/1.111
  permanece histórico da implementação inicial, não validação corrente da correção.
- **7/7 sintaxe JS**. As 389 verificações adicionais estão incluídas nos totais;
  não somar as rodadas nem confundir testes locais com PostgreSQL/SMTP reais.

Parser V3 compartilhado: ENABLED ausente fica desligado; DRY_RUN ausente fica
ligado até falso explícito. Strings reconhecidas são case-insensitive com trim,
compatíveis com aliases institucionais; valor inválido bloqueia antes de claim
ou SMTP. As duas habilitações e os dois dry-runs compõem o gate, sem ignorar
flags de uma camada. Dry-run jamais vira `sent`, inicia transporte ou altera a
outbox. Configuração plena continua insuficiente sem consumidor V3.

Artefatos separados e anteriores preservados:
`C:/tmp/escola-v3-etapa12-dry-run-20261014-bf6155bc/`, com `focused.log`, `full.log`
e `guard-*.json`. DATABASE_URL dummy só nos processos; Pool/Client, TCP/TLS, SMTP
e leitura `.env` bloqueados. **Zero tentativas PostgreSQL, rede ou SMTP reais**;
uma tentativa `.env` bloqueada na suíte completa, sem conteúdo lido. Transporte
SMTP e processos de envio substituídos por mocks; nenhum rehearsal executado.

Migrations/contratos 08–11, SQL do worker, rotas/frontend, jobs anteriores e
produção preservados. **Etapa 12 continua aberta para rehearsal PostgreSQL e
validação física do transporte**, com consumidor V3 ausente e ativação bloqueada;
**Etapa 13 não iniciada**. Publicação da correção não autoriza implantação.
[Contrato das flags](decisoes-canonicas.md#ajuste-pontual--flags-booleanas-e-dry-run-fail-closed).

### Correção final da Etapa 12 — cancelamento e IPC

**15/10/2026**, base `40ab140fa23f4cf879ac00d867b0def3ef5deff5`, branch
`revisao-premium-bloco-1-auth`. **Estado anterior à revisão final: Etapa 12 aberta; Etapa 13 não iniciada**.
A revisão independente deste patch foi aprovada posteriormente; ver o
[fechamento aprovado](#fechamento-aprovado-da-etapa-12).

A revisão independente informada pelo responsável aprovou o ensaio físico SMTP
anterior: **52 verificações consolidadas**, encerramento real em **115,078 s**.
O relatório e a verificação final em
`C:/tmp/escola-v3-etapa12-smtp-local-20261014-40ab140f/` foram consultados somente
para leitura. Não foi repetido o ensaio físico nem acessado SMTP neste patch.

Defeito confirmado antes da alteração: **22 falhas entre 29 regressões novas**,
incluindo `accepted` antes/depois de cancelamento manual ou automático,
saída anormal/sinal e IPC posterior a erro de subprocesso. O resultado IPC era
preservado quando `kill()` retornava true e podia ser sobrescrito por IPC tardio;
`exit` ignorava código e sinal.

Correção mínima em `authSmtpSender.js`: marcar cancelamento e zerar o resultado
antes de `SIGKILL`; ignorar IPC após cancelamento ou finalização; invalidar o
resultado em `exit` se código diferente de zero ou houver sinal. Continuar
aguardando encerramento efetivo. `accepted` só prevalece com saída zero,
sem sinal/cancelamento. Erro de subprocesso/envio IPC e falha de kill não podem
ser revertidos por `accepted` posterior. Contrato externo, subprocesso isolado,
limite de 120 s, kill aos 115 s e timeouts de conexão/TLS não foram alterados.

| Validação após correção | Resultado |
| --- | --- |
| Regressões novas | **29/29**, incluídas nos focados |
| Focados: sender, worker, job, crypto e enqueue | **670/670** |
| Suíte completa do backend | **1.529/1.529**, executada uma vez após estabilização |
| Node real com IPC sintético, sem SMTP | **4/4**: normal, cancelamento, timer, saída 1 |

O teste integrado usa sender/worker reais com fork/timers e banco modelados.
Confere que o worker recebe `indeterminate`, mantém envelope, registra
`INTERNAL_FAILURE`, agenda o próximo slot absoluto e consome uma segunda
tentativa após restart. Aceitação normal segue para `sent`.
Política **at-least-once** preservada: o retry pode duplicar mensagem aceita
pelo servidor antes de cancelamento/perda de confirmação; não há exactly-once
nem garantia de entrega na caixa/leitura.

A prova Node real fica fora do repositório; quatro filhos terminaram, com
resultados observados somente após `exit`: normal (código 0) → `accepted`,
cancelamento manual/timer (`SIGKILL`) e saída 1 → `indeterminate`.
Duração de cada cenário inferior a 0,4 s. O cenário de timer aciona seu callback
capturado, sem modificar os valores de produção nem repetir os 115 s.
As ordens de IPC após cancelamento são regressões determinísticas modeladas;
a prova Node confirma IPC antes do cancelamento e encerramento real.

Logs e harnesses em `C:/tmp/escola-v3-etapa12-ipc-20261015-40ab140f/`:
`regression-before.log`, `focused.log`, `full.log`, `guard-*.json`,
`ipc-proof.cjs`, `ipc-child.cjs` e `ipc-proof.json`.
DATABASE_URL dummy apenas nos processos. Guardas de Pool/Client, TCP/TLS,
SMTP e leitura de `.env`: **zero tentativas PostgreSQL/rede/SMTP**;
**uma tentativa de leitura de .env bloqueada**, sem conteúdo lido.
Nenhum processo da prova Node permaneceu ativo na conferência posterior.

Sem Neon, SMTP externo, produção, migrations, frontend, rotas públicas,
mudanças de contratos 08–11 ou início da Etapa 13. A revisão física anterior
não equivale à aprovação deste patch nem autoriza ativação/deploy.

### Roteiro enxuto de rehearsal da Etapa 12

**Roteiro histórico, anterior à execução aprovada das 44 provas.** Sua redação
não autorizou ensaio por si só. Preservado para rastreabilidade; não repetir
por causa deste fechamento. Qualquer novo ensaio exige autorização específica,
preflight e política de fixtures/limpeza, sem produção ou repetição de 08–11.
O ensaio aprovado usou consumidor/transporte sintéticos sem habilitar o job
operacional nem apontar tokens opacos para rotas JWT legadas.

1. Preflight: branch/HEAD/worktree, identidade SQL/TLS, ledger de oito registros e
   checksums das migrations aprovadas, schema/constraints/triggers, baseline de
   dados/catalogs e sequências sanitizado. Nenhuma escrita se divergente; nenhuma
   leitura `.env`/exportação de credenciais. Fixtures sintéticas sem colisão,
   IDs e allowlist exatos, política de rollback/limpeza aprovada antes das escritas.
2. Duas/três conexões reais e serviço oficial/db.tx: `SELECT pg_backend_pid()` em
   cada conexão, `pg_stat_activity`/`pg_blocking_pids`, barreiras e testes de claim
   invisível antes de commit, seleção exclusiva/skip, usuário → desafio → outbox,
   sem tx aberta durante transporte sintético suspenso. Conferir status/tentativas/
   relógios/lease id e 180 s; reclaim e reinício com novo UUID, ack velho rejeitado.
3. Três finalidades, envelope AES-GCM real, hash/AAD/destino/versão persistida;
   inválido/consumido/expirado/invalidação concorrente e mudanças de versão não
   enviam. Ack após lease expirado ou troca de posse é rejeitado; se o TTL expirar
   após aceitação SMTP, ack sob posse válida ainda registra essa aceitação, sem
   cancelamento retroativo ou sobrescrita de outra posse.
4. Simular transporte accepted/temporary/permanent/indeterminate/dry-run e crash
   antes/depois de SMTP/ack. Conferir horários absolutos com precisão, atraso sem
   rajada, esgotamento de seis claims, nenhum retry além do TTL, falhas reais de
   UPDATE/constraints e rollback de claim/retry/limpeza. Interrupções por restart
   consomem tentativas; envelope removido integralmente em `sent`/`failed`.
5. Shutdown/restart e preservação: sem novo polling após stop, jobs anteriores
   preservados; baseline de dados/catalog/ledger/checksum, audit/quotas e branch
   mantidos. Finalizar fixtures por rollback ou limpeza em allowlist previamente
   autorizada; se perfil-base exigir exceção, autorização explícita e trigger
   restaurado antes de commit. Zero resíduos; não reinicializar sequências.

A prova física separada do limite SMTP foi executada e aprovada posteriormente,
conforme fechamento acima; não repetir neste fechamento. O roteiro original
previa autorização específica para
um servidor SMTP controlado/sintético e ambiente isolado: conexões/DNS/TLS/DATA
interrompidos, medir sockets/processo encerrados até 120 s, resultado tardio,
shutdown e falha de kill. Não usar produção nem destinatários reais. Consumidores
V3 e links corretos exigem etapa de integração/cutover autorizada, sem inferi-los
pela existência de configuração. A etapa está encerrada; TLS positivo pelo
adaptador deve ser comprovado antes da futura ativação SMTP real, sem reabrir
automaticamente toda a Etapa 12.

## PENDÊNCIA — evidência de produção

Aplicação de migrations, ledger, deploy, cutover e fluxos autenticados de produção
exigem comprovação própria. Nada neste registro estabelece esses resultados.
Novas evidências devem indicar versão, ambiente, método, resultado e limites,
conforme o [README](README.md).
