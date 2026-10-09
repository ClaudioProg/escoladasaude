# Testes e evidências de fechamento

Atualização documental: 2026-10-09. Base Git do fechamento da Etapa 08:
`3210ad6c6a6b82c1ed65819f1b37e94839357ee5`, fechamento da Etapa 07, na branch
`revisao-premium-bloco-1-auth`. O fechamento da Etapa 08 integra um único commit
de migration, testes e cinco documentos; consultar seu SHA no histórico.

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
Nenhum teste ou SQL foi reexecutado neste fechamento documental/Git.
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

Aplicação **somente** na branch Neon descartável `br-super-wave-adut7rdn`
(`rehearsal-etapa-08-descartavel`), filha de `br-small-union-ad2nicvt`
(`revisao-premium-ensaio-auth-recuperacao`). PostgreSQL 16.15; identidade e TLS
confirmados no rehearsal. Único arquivo aplicado pelo runner oficial:
`db/migrations/2026-10-09-auth-quotas-expand.sql`, SHA acima, ledger **id 7**.
DDL/ledger criados na mesma transação; segunda execução fez skip por mesmo SHA.

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
comprova enforcement concorrente de quotas. **Quotas, HMAC operacional, limpeza
de 48 horas, integração e Etapa 09 permanecem pendentes**. Janelas móveis de
60 s/15 min/1 h/24 h, primeira emissão contabilizada e retenção permanecem como
contratos futuros. Rate limit legado intacto. Composição de finalidades, falhas
de emissão, origem do IP, rotação HMAC e operação da limpeza continuam abertas.
D1–D8 e demais pendências aprovadas preservadas.

**Rehearsal e revisão aprovados não significam implantação em produção.**
Não houve UI/browser, SMTP ou deploy. Neste fechamento documental/Git não foram
reexecutados testes, SQL, migration ou operações Neon; não houve merge na main
nem exclusão da branch descartável. Logs brutos, credenciais e PII não são
incluídos no commit.

## ETAPA 09 — IMPLEMENTAÇÃO LOCAL / REHEARSAL PENDENTE

Data: 09/10/2026. HEAD base `aceb73ac845542255b843e704525084e90654f6c`.
Decisão A fornecida pelo responsável: confirmação, alteração de e-mail e
recuperação compartilham os mesmos limites por conta/IP. Nenhuma aprovação de
fechamento da Etapa 09 ou concorrência PostgreSQL real é reivindicada.

| Validação local final | Resultado |
| --- | --- |
| `authQuotaIp.test.js` + `authQuotaService.test.js` | **142/142 aprovados** |
| Suíte completa do backend (`node --test`) | **829/829 aprovados**, uma execução após as alterações de código |
| `node --check` nos quatro JS novos | **4/4 aprovados** |

Zero falhas/cancelados/skips/todo nos conjuntos finais. Nenhum teste PostgreSQL
real foi executado. Guardas processuais de Pool/Client, TCP/TLS, SMTP e leitura
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
nenhuma limpeza automática, migration, operação Neon, SMTP real, commit, push,
merge ou deploy realizado. Schema, rate limit legado, frontend e D1–D8 intactos.
**Etapa 09 não concluída; rehearsal pendente.**

### Plano proporcional de rehearsal da Etapa 09

Após autorização própria, usar nova branch Neon descartável filha do rehearsal
da Etapa 08 (`br-super-wave-adut7rdn`), cujo expand já foi aplicado. Confirmar
projeto/filiação/endpoint/database/TLS, schema e SHA/ledger da Etapa 08 antes das
fixtures; não aplicar migrations antigas ou alterar a migration aprovada.

1. Conferir SQL real, casts/arrays bytea, precisão de microssegundos e timezone;
   eventos nas quatro fronteiras e finalidades misturadas, conta/IP e ambos.
2. Duas ou mais conexões com barreiras reais: usuário primeiro, IP sem eventos,
   mesma conta/IP e contas distintas com IP comum; somente o espaço disponível
   confirma, sem deadlock ou excesso. Capturar esperas no catálogo de locks.
3. UUID igual com argumentos iguais/divergentes, commit vencedor e rollback;
   falhas críticas com savepoints e falha posterior do chamador. Provar que
   aceita não persiste antes do commit e que negação/falha não deixa evento.
4. Configuração explícita de múltiplas versões, quotas somadas, versão ausente,
   lock IP estável; medir `EXPLAIN` das contagens e da guarda global, sem afirmar
   política de rotação/retirada de chaves aprovada.
5. Preservação de dados/catalogo herdados e ledger, tabela de quotas e cleanup
   somente das fixtures do ensaio. Preservar branches/evidências anteriores.

Sem SMTP/HTTP/produção. O ensaio do núcleo não autoriza ativar rotas, limpeza ou
rotacionar segredos. Integração definitiva com desafio/outbox exige etapa própria.

## PENDÊNCIA — evidência de produção

Aplicação de migrations, ledger, deploy, cutover e fluxos autenticados de produção
exigem comprovação própria. Nada neste registro estabelece esses resultados.
Novas evidências devem indicar versão, ambiente, método, resultado e limites,
conforme o [README](README.md).
