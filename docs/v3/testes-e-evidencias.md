# Testes e evidências de fechamento

**Etapa 14 — Reautenticação local básica encerrada em 16/10/2026**, por
instrução do responsável após aprovação da revisão independente. Implementação:
`16b89ca0f9c7455fa48d060610c209b34255df62`, branch `revisao-premium-bloco-1-auth`.
**Etapas 01–14 concluídas de 57. Etapa 15 não iniciada.**

Evidências aprovadas: **120/120 dedicados, 121/121 focados e 1.821/1.821 backend
completo**; rehearsal PostgreSQL **71/71 provas funcionais únicas**, grupos
**A 12/12, B 16/16, C 8/8, D 9/9, E 18/18 e F 8/8**. Concorrência real comprovada
com PIDs e bloqueadores PostgreSQL; consumo único, reserva durável de tentativas,
rollback e invalidações aprovados. Migration aplicada **uma única vez** em
`v3-homologacao`, ledger com **10 registros**, SHA-256 preservado:
`fc810fb0e9ea96b4f5c5c619b727cf5126ae723913d4809caa6027c697d29537`.
Zero resíduos sintéticos e triggers habilitados. Verificação independente informada
pelo responsável: **89 tabelas originais e 54.394 registros, sem divergências**.
Sequências originais preservadas, sem reinicialização; avanços legítimos do ensaio
não foram revertidos. Git e produção permaneceram inalterados no rehearsal.

**D5 permanece parcialmente aprovada, exclusivamente para reautenticação local
básica**: senha atual, prova de uso único, finalidade específica, vínculo à sessão
e versão, validade absoluta de **cinco minutos**. A prova não concede autorização
por si só e não substitui MFA. Demais parâmetros D5 e D1, D3, D4 e D6–D8 pendentes;
D2 preservada. Integração operacional, consumidores sensíveis, MFA, proteção CSRF
completa, política de retenção e proteção por IP distribuída permanecem futuros.
`AUTH_REAUTH_ENABLED` permanece **desabilitada por padrão**.

Fechamento exclusivamente documental/Git, limitado aos seis documentos autorizados,
sem repetir testes ou ensaios e sem acessar Neon, SMTP ou produção; sem merge,
deploy ou ativação operacional. O bloqueio inicial de TCP e os incidentes do
instrumento permanecem históricos, sem contagem como falhas funcionais.
[Fechamento, rastreabilidade e limites](testes-e-evidencias.md#fechamento-aprovado-da-etapa-14).
O estado atual é definido por este fechamento; estados de abertura abaixo são históricos.

Registro histórico da implementação para revisão em 15/10/2026, anterior ao rehearsal
e à aprovação independente da Etapa 14:

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
Os registros anteriores preservam seus estados históricos; o fechamento da Etapa 14 no início define o estado atual.

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

## Etapa 14 — reautenticação local básica

### Fechamento aprovado da Etapa 14

**16/10/2026**. Revisão independente aprovada, conforme informação e instrução
expressas do responsável para este fechamento. Implementação ensaiada:
`16b89ca0f9c7455fa48d060610c209b34255df62`, branch `revisao-premium-bloco-1-auth`.
**Etapas 01–14 concluídas de 57. Etapa 15 não iniciada.**
Os estados de abertura no relatório e nos registros de implementação abaixo
antecedem esta aprovação; os artefatos originais permanecem preservados.

#### Contagens e concorrência aprovadas

Testes locais aprovados: **120/120 dedicados, 121/121 focados e 1.821/1.821 backend
completo**, uma execução completa após estabilização. Os dedicados estão incluídos
nos focados e na suíte completa; não somar os totais como provas distintas.
Nenhum teste local ou ensaio anterior foi repetido neste fechamento.

Rehearsal PostgreSQL: **71/71 provas funcionais únicas aprovadas**, sem falhas
funcionais. Preflight, dry-run, aplicação da migration, controles do instrumento,
limpeza e auditoria final têm contagens separadas e não integram as 71 provas.

| Grupo | Alcance | Resultado |
| --- | --- | --- |
| A | Persistência, constraints, FKs imediatas e rollback | **12/12** |
| B | Emissão, bcrypt/Argon2id, reserva prévia, revalidação, ABA e ausência de sessão/JWT/touch | **16/16** |
| C | Cinco minutos, divergências e consumo único concorrente | **8/8** |
| D | Commit/rollback conjunto, auditoria, falhas SQL/timeout e ordem de locks | **9/9** |
| E | Invalidações por triggers, commit/rollback e preservação de contas/sessões/D2 | **18/18** |
| F | Reservas duráveis, limite compartilhado por conta/sessões, janela e concorrência | **8/8** |

Concorrência física observada com `pg_backend_pid()`, `pg_stat_activity` e
`pg_blocking_pids()`, incluindo amostras positivas e negativas de espera:
B05 PID **762** bloqueado por **717**; C04 **1079** por **762**; D09 **1079** por
**717**; F04 **1903** por **1079**. São PIDs SQL observados, sem inferência por PID
de protocolo ou apenas pela conclusão das chamadas. C04 confirmou um commit e
uma rejeição para dois consumidores da mesma prova; F04 confirmou uma reserva e
uma recusa no último espaço, e F08 uma reserva entre quatro concorrentes.

Reserva durável confirmada por observador independente antes da verificação de
senha. Consumo e operação sintética confirmados ou revertidos juntos; falhas reais
de SQL, auditoria e timeout não deixam consumo parcial. Invalidações por senha,
e-mail, versões, exclusão e revogação/revinculação da sessão aprovadas com commit
e rollback, inclusive writer legado sem incremento e ABA. D2 e contas/sessões
não relacionadas preservados. SQLSTATEs esperados: `22012` (3), `23503` (2),
`23505` (1), `23514` (14) e `57014` (1); ocorrências não equivalem a provas.
**Zero SQLSTATEs inesperados** na execução funcional.

Limite temporal da evidência: C01–C03 e F05–F07 são simulações sobre PostgreSQL
real, substituindo somente `clock_timestamp()` por literal controlado na consulta
identificada, com transforms e hashes registrados; SQL restante, constraints,
locks e transações reais. Relógio do servidor não alterado. Fronteiras de cinco
minutos e janela em -1 µs/exato/+1 µs aprovadas nesse alcance. Valores numéricos
de tentativas usados nas fixtures são sintéticos, sem aprovação de política D5.
Proteção HTTP/IP não foi validada como distribuída por este ensaio do serviço.

#### Migration, limpeza e preservação

[Migration da Etapa 14](../../backend/db/migrations/2026-10-15-auth-reautenticacao-expand.sql)
aplicada **uma única vez** pelo runner oficial exclusivamente em `v3-homologacao`.
Ledger **9 → 10**, com um único registro novo; DDL e ledger atômicos observados
antes/depois do commit por conexão independente. Dez constraints, cinco índices,
duas funções e triggers novos aprovados. SHA-256 aplicado e preservado:
`fc810fb0e9ea96b4f5c5c619b727cf5126ae723913d4809caa6027c697d29537`.
Os nove registros anteriores e seus checksums permaneceram íntegros.

Uma única limpeza transacional na allowlist autorizada; trigger de perfil-base
restaurado antes do commit. **Zero resíduos sintéticos** de usuários, perfis,
sessões, contextos, provas, tentativas e auditorias; triggers originais e novos
habilitados. O ensaio comparou integralmente **91 tabelas herdadas de dados**,
com o ledger auditado separadamente, e terminou com 94 tabelas públicas incluindo
as adições autorizadas. A **verificação independente de 89 tabelas originais e
54.394 registros, sem divergências**, foi informada pelo responsável na aprovação;
são recortes distintos, não somar as contagens. Digests de linhas e catálogo são
controles de preservação, não equivalem a backup.

**77 definições de sequências preservadas**, sem reinicialização/redução.
Avanços legítimos registrados: `auditoria_eventos_id_seq` **499 → 577** e
`sistema_migracao_id_seq` **9 → 10**; incluem INSERTs de auditoria revertidos.
Git permaneceu na mesma branch/HEAD, remoto correspondente e worktree limpo no
rehearsal; produção permaneceu inalterada. Este fechamento publica somente docs.

#### Histórico do bloqueio e dos incidentes do instrumento

- Bloqueio inicial de **TCP 5432**: tentativa preservada em
  `attempt-01-network-blocked/`, com **zero provas funcionais e zero escritas**.
- Preflight: `ENOENT` ao presumir arquivos históricos no checkout. Corrigido no
  instrumento antes de escritas, conferindo sete arquivos atuais e dois blobs Git
  históricos imutáveis, sem restaurar/alterar arquivos do repositório.
- Auditoria final: `ORDER BY id` usava o alias `id::text` e produzia ordem textual
  `1,10,2,...`. Comparação numérica corrigida somente no instrumento, snapshot
  original preservado e ledger/catálogos reconfirmados em leitura após a limpeza.

Os dois incidentes do instrumento foram corrigidos **sem alteração de código**;
não são falhas funcionais. As ocorrências auxiliares de diagnóstico e busca
continuam em `harness-incidents.json`. Nenhuma prova aprovada ou limpeza foi
repetida, e nenhuma tentativa foi contada como prova adicional.

Rastreabilidade local, somente lida neste fechamento:
`C:/tmp/escola-v3-etapa14-rehearsal-20261015-16b89ca0/`, `RELATORIO.txt`,
`resumo.json`, `proofs.json`, `concurrency.json`, `backend-pids.json`,
`sql-trace.json`, `temporal-simulations.json`, `migration-result.json`,
`migration-events.json`, `ledger-checksums-current.json`, `cleanup.json`,
`baseline.json`, `final-snapshot.json`, `final-audit.json`, `harness-incidents.json`,
`manifest-sha256.json` e diretório `attempt-01-network-blocked/` preservados.
O status aberto nos relatórios originais antecede a aprovação independente atual.

#### Decisões e limites do fechamento

**D5 parcialmente aprovada exclusivamente para reautenticação local básica**:
senha atual, prova de uso único, finalidade específica, vínculo à sessão e versão,
validade absoluta de cinco minutos. **A prova não concede autorização por si só
e não substitui MFA**. Demais parâmetros D5 e D1, D3, D4 e D6–D8 pendentes;
D2 preservada. Integração operacional, consumidores sensíveis, MFA, proteção CSRF
completa, retenção e proteção por IP distribuída permanecem futuros.
`AUTH_REAUTH_ENABLED` permanece **desabilitada por padrão**.

Fechamento exclusivamente nos seis documentos autorizados; sem mudanças em código,
testes, migrations, frontend, infraestrutura ou banco. Sem repetir as 71 provas,
os 1.821 testes ou ensaios anteriores; sem acesso Neon, SMTP ou produção, merge,
deploy ou ativação operacional. Validação deste fechamento: `git diff --check`,
links locais e integridade documental. Publicação limitada à branch autorizada.
**Etapas 01–14 concluídas de 57. Etapa 15 não iniciada.**

### Registro histórico da implementação local da Etapa 14

**15/10/2026**, base `88edbf7d550e386b3b66e651aedce92ce9469c38`, branch
`revisao-premium-bloco-1-auth`, HEAD esperado e worktree limpo confirmados antes
da implementação. **D5 parcialmente aprovada somente quanto à reautenticação
local básica**. Etapas 01–13 concluídas de 57; **Etapa 14 aberta até revisão
independente e rehearsal PostgreSQL; Etapa 15 não iniciada**.

### Arquivos e persistência da Etapa 14

- [Serviço](../../backend/src/services/authReauthenticationService.js): autenticação
  server-side sem touch, reserva de tentativa, verificação da senha, emissão e consumo.
- [HTTP](../../backend/src/auth/authReauthenticationHttp.js) e
  [rota opt-in](../../backend/src/routes/authReauthenticationRoute.js): cookie,
  concordância Bearer, barreira D2, CSRF e proteção IP.
- [Migration nova](../../backend/db/migrations/2026-10-15-auth-reautenticacao-expand.sql):
  `auth_reautenticacao_prova` e `auth_reautenticacao_tentativa`, constraints/FKs
  imediatas e dois triggers próprios de invalidação. **Somente preparada, não aplicada**.
  SHA-256 `fc810fb0e9ea96b4f5c5c619b727cf5126ae723913d4809caa6027c697d29537`.
- [Montagem](../../backend/src/routes/index.js): registro da rota nova.
  [Inventário do runner](../../backend/scripts/run-migration.identity.test.js):
  só inclusão do SQL; runner de produção não alterado.
- [Testes do serviço](../../backend/src/services/authReauthenticationService.test.js),
  [HTTP](../../backend/src/auth/authReauthenticationHttp.test.js),
  [DDL/parser](../../backend/src/services/authReauthenticationMigration.test.js),
  [fixture própria](../../backend/src/services/authReauthentication.fixture.js) e
  atualização dos seis documentos V3 pertinentes.

Necessidade confirmada por inspeção: sessão/contexto não têm prova de senha recente
com finalidade e consumo único. Desafios/quotas de e-mail e recuperação têm contratos
próprios e não foram reaproveitados. Senha, sessões, middlewares oficiais, D2,
versões, login/Bearer, auditoria, quotas e migrations foram inspecionados;
serviços existentes e migrations aplicadas permanecem inalterados.

### Emissão, invalidação e consumo da Etapa 14

1. Cookie opaco resolve sessão/conta no servidor. Não aceita identidade/perfil/
   sessão arbitrários do corpo. Locks usuário → sessão; revalidação após espera,
   relógio PostgreSQL, sem touch, novo login/JWT/sessão ou renovação de contexto.
2. Reserva de tentativa por conta, serializada pelo lock do usuário, em transação
   independente **antes** da verificação. Commit precede senha: erro de senha/hash/
   criptografia/emissão não desfaz a tentativa. Janela móvel compartilhada por
   sessões/finalidades da conta, sem reutilizar quotas dos fluxos de e-mail.
3. Somente `passwordService.verifyPassword` comprova bcrypt/Argon2id atuais;
   `requiresPasswordChange` nega. Sem rehash, atualização de senha ou histórico.
4. Após verificar, nova transação bloqueia usuário → sessão e compara conta, hash
   originalmente verificado, auth_version, email_version e revisão `xmin` do
   usuário. A revisão rejeita também mudança e restauração do hash legado durante
   a verificação. Atualização não crítica concorrente da linha pode exigir repetir
   a reautenticação; não se reaproveita snapshot de credencial anterior.
5. Segredo de 32 bytes criptográficos aleatórios, base64url; **somente SHA-256**
   persistido. Prova vinculada a conta/sessão/versão/finalidade. Emissão/expiração
   no mesmo instante PG: **exatamente cinco minutos absolutos, não renováveis**.
   Fence final revalida sessão/conta. Auditoria crítica no mesmo executor; erro de
   INSERT/auditoria/commit da emissão não deixa prova parcial nem retorna segredo.
6. Consumo somente interno: `consume(executor, { cookieToken, identity?, proof,
   purpose })`. Cookie real obrigatório; consumidor futuro fixa a finalidade no
   servidor. Executor exclusivo `db.tx`, raw/client iguais, SAVEPOINT prova
   transação read committed/read-write. Uma prova por executor; chamar **antes**
   dos locks específicos da operação sensível.
7. Locks usuário → sessão → prova vinculada; finalidade/conta/sessão/versão exatas,
   `consumida_em IS NULL`, criação não futura e **expiração > relógio PG** no UPDATE
   final. Uso único modelado: só um consumidor vence. Sem BEGIN/COMMIT próprio:
   operação futura e sua auditoria devem usar a mesma transação. Chamador propaga
   falhas e faz rollback; COMMIT externo permanece sob responsabilidade dele.
   Rollback da operação restaura a prova; não há consumo definitivo separado.
8. Triggers novos removem apenas provas de reautenticação nas mudanças de senha,
   e-mail, auth_version, email_version, exclusão ou revogação/revinculação da sessão,
   inclusive writers legados sem incremento. Expiração e absoluto da sessão são
   revalidados no uso, sem prolongá-los. Alteração/invalidação revertem juntas.
   Trigger D2 já aplicado permanece intacto.

Registro controlado: **trocar_senha, alterar_email, encerrar_conta, conceder_perfil**.
Cliente só solicita um desses códigos; operação futura fixa seu próprio código.
Não é autorização genérica e nenhuma operação sensível foi integrada nesta etapa.
Resultados `authorizationGranted=false`, `mfaSatisfied=false` e indicação dos perfis
atuais que exigem MFA não dispensam autorização/perfis/regularização, MFA aplicável
ou CSRF da operação. Gestor, administrador, diagnostico e cai_administrador
continuam exigindo MFA; senha não o substitui, nem dispensa MFA habilitado em outros casos.

### HTTP, CSRF e tentativas da Etapa 14

- **GET /api/auth/reautenticacao/csrf**: HMAC por sessão/conta/versão/origem, chave
  dedicada. **POST /api/auth/reautenticacao**: JSON só `senha`/`finalidade`, cookie
  válido, Origin ou Referer exato e header `X-Reauth-CSRF`. Origin inválido não tem
  fallback. Parser local 16 KiB e limite de senha 16 KiB mesmo após parser global.
- Bearer isolado nega. Quando fornecido, JWT usa o verificador oficial, com
  identidade/versão concordantes; inválido/conflitante não tem fallback cookie.
  Cookie duplicado/expirado/revogado nega. Cookie Host oficial em produção.
- Mesma barreira D2, **sem exceção nova na allowlist**. D2 habilitada bloqueia
  contas restritas, inclusive perfis elevados, antes da senha; reautenticação
  não é fluxo de regularização. D2 desabilitada mantém o contrato legado, sem
  transformar o componente de senha em autorização de operação sensível.
- Segredo somente na resposta de sucesso no-store; fora de URL/query/logs,
  histórico, notificação e localStorage. Consumidor futuro poderá mantê-lo em
  memória. Erros genéricos sem causa/SQL/senha/hash/token; auditoria recebe só
  usuário, ação e finalidade, sem request cru.
- `AUTH_REAUTH_ENABLED` ausente/`false` → 404, sem DB/auditoria da rota.
  Flag ambígua/configuração incompleta → 503. Configuração/store IP criados uma
  vez no startup; habilitar/alterar exige reinício e autorização futura.
  Desabilitar é observado a cada requisição, sem recriar store por request.
- Exigem valores explícitos: `AUTH_REAUTH_ATTEMPT_WINDOW_MS`,
  `AUTH_REAUTH_MAX_ACCOUNT`, `AUTH_REAUTH_MAX_IP`, inteiros positivos válidos.
  Nenhuma política numérica de produto foi presumida: defini-la antes de ativar;
  valores de teste são fixtures e não novos limites canônicos.
- `AUTH_REAUTH_ALLOWED_ORIGINS`: lista exata sem wildcard/path/duplicidade/vazio.
  `AUTH_REAUTH_CSRF_SECRET`: 32 bytes base64url canônico, chave dedicada distinta
  do JWT. Nenhum segredo foi provisionado, persistido em Git ou lido de .env.
- Proteção por **conta distribuída no PostgreSQL**; proteção **IP por processo**
  com `express-rate-limit` existente e store separado, após cookie/CSRF e antes
  da senha. Não comprova limite IP global entre réplicas. Implantação exige revisão
  da política/store. Sem mudar proxy, infraestrutura ou quotas de e-mail.
  Retenção/expurgo das novas tabelas dependem de política própria; nenhum job novo.
- Proteção CSRF proporcional não substitui Etapa 39 nem protege operações futuras
  automaticamente. Sem TOTP/passkeys/trusted device/recovery MFA nesta etapa.

### Validação local da Etapa 14

| Validação | Resultado |
| --- | --- |
| Dedicados novos: serviço, HTTP real em memória e DDL/parser | **120/120** |
| Inventário do runner afetado, selecionado por nome | **1/1** |
| Total focado executado | **121/121** |
| Sintaxe JS | **9/9** |
| Suíte oficial completa `npm.cmd test` | **1.821/1.821**, **uma execução** após estabilização |
| Falhas / skips / cancelamentos finais | **0 / 0 / 0** |
| Alterações pela suíte nos arquivos conferidos | **Zero**, manifesto antes/depois |
| SQL/migration aplicada/PostgreSQL/SMTP/rede externa | **Não executados** |

Cobertura: bcrypt/Argon2id reais corretos/incorretos, bcrypt 72 bytes exigindo troca,
hash inválido/erro criptográfico; mudanças concorrentes de senha/versão/exclusão/
revogação e ABA legado; cinco minutos -1 us/exato/+1 us, reutilização, consumidores
concorrentes modelados, finalidade/sessão/versão divergentes, sessão revogada/
expirada/absoluta, rollback operação+consumo, falhas de escrita/auditoria/commit,
limites por conta/IP, cookie/Bearer, D2/perfis sem bypass, MFA não satisfeito, CSRF,
flags, JSON e ausência de segredos. Fences finais cobrem expiração entre lock e
escrita. Parser/modelos/asserções SQL **não provam** constraints/triggers/locks
físicos. Os testes HTTP novos usam roteadores Express reais sem servidor TCP.

Artefatos: `C:/tmp/escola-v3-etapa14-20261015-88edbf7d/`,
`dedicated-initial.log`, `dedicated-second.log`, `dedicated-final.log`,
`runner-focused.log`, `full.log`, `full-exit-code.txt`, `guard.cjs`, `guard-*.json`,
`manifest-before-full.json`, `preflight-normalization.json`, `local-verification.json`.
Primeira rodada **106/113**: sete falhas da instrumentação (cinco identidades D2
não alinhadas, corpo ausente no fallthrough e expectativa indevida de sanitização
de COMMIT externo). Corrigidas/preservadas; segunda **116/116**, final **120/120**
após completar cobertura. Warning inicial da biblioteca revelou criação do limiter
no handler; movida para startup, store único, sem repetir essa falha no final.
Preflight anterior à suíte parou por comparação de CRLF histórico com bytes LF
canônicos Git, **antes de iniciar a suíte**. Identidades com filtros Git e checksum
D2 foram conferidos sem reescrever migrations. DATABASE_URL dummy só nos processos.
Guardas consolidadas: **zero tentativas PostgreSQL/rede/SMTP; uma leitura .env
bloqueada**, sem conteúdo lido. Nenhum teste dedicado/rehearsal histórico 01–13
repetido; a única suíte completa oficial inclui naturalmente os testes históricos.

### Provas PostgreSQL pendentes da Etapa 14

Roteiro histórico anterior ao rehearsal **71/71 aprovado**. Título e conteúdo
preservados para rastreabilidade e âncoras; não representam pendência atual de
repetição nem autorização para novo ensaio. Ver o
[fechamento aprovado](#fechamento-aprovado-da-etapa-14).

Somente após autorização específica, sem reutilizar autorizações de fixtures/
limpeza consumidas e sem repetir as 63 provas aprovadas da Etapa 13:

1. Preflight de branch/HEAD, identidade SQL/alvo, TLS, ledger de nove registros,
   checksums (incluindo D2), baseline de dados/catálogo, allowlist exata e limpeza.
   Migration via runner oficial, DDL/ledger atômicos e único registro novo; rollback
   em falha. Nada disso foi executado nesta etapa local.
2. Constraints reais: hash 32 bytes/PK, FKs imediatas, versões/finalidades,
   finitude, validade exatamente 300 s e consumo estritamente antes do vencimento.
   Preparação explícita de -1 us/exato/+1 us sem alterar relógio do servidor.
3. Emissão/consumo oficiais sem touch/novo JWT/sessão, snapshots físicos antes/depois;
   relógio PostgreSQL e SQL intactos. Expiração durante espera em lock e no fence final.
4. Duas conexões consumindo a mesma prova: PIDs `pg_backend_pid()`, barreira,
   observador, amostras e `pg_blocking_pids`, só um commit. Testar identidade,
   sessão, finalidade, versão, revogação e expiração divergentes sem consumo parcial.
5. Consumo+operação sintética+auditoria no mesmo executor, commit e rollback;
   falhas de UPDATE/auditoria/COMMIT e timeouts reais. Rollback restaura consumo e
   operação. Commit externo continua responsabilidade do chamador.
6. Corrida entre reserva/verificação/revalidação: senha/versões/exclusão, ABA
   legado via xmin, revogação e outra conta preservada. Triggers novos com commit
   e restauração com rollback; D2 e trigger de perfil-base preservados.
7. Reservas duráveis de falhas, duas conexões/sessões concorrendo pelo último slot,
   limite/janela exatos e ordem usuário → sessão → prova, incluindo convivência
   D2/revogação. Não reutilizar quotas de e-mail ou inferir locks pelo término.
8. Limpeza única somente na allowlist autorizada, incluindo dependências/FKs/
   auditoria e restauração de triggers antes do commit, se autorizada suspensão.
   Zero resíduos, ledger/checksums, catálogo, dados herdados, sequências e Git
   preservados; nenhuma limpeza ampla ou autorização presumida.

**Etapa 14 aberta** até revisão independente e rehearsal. Migration preparada
não equivale a aplicada; modelos não equivalem a PostgreSQL real. Nenhuma
ativação operacional, produção, cutover, deploy, merge ou Etapa 15. D5 parcial
não fecha outros parâmetros; D1, D3, D4 e D6–D8 pendentes. Integrações futuras de
operações sensíveis, regularização, MFA, CSRF completo e consumidores continuam
necessárias. Uma única plataforma pública no endereço atual, modernização
progressiva e homologação separada preservadas.

## Etapa 13 — contexto restrito e barreira de acesso

Registro histórico da Etapa 13, encerrada antes do início autorizado da Etapa 14;
os estados anteriores de Etapa 14 não iniciada referem-se àquele fechamento.

**15/10/2026**, base `07499cc96f47e9f1a0bfcb76ca7557c02904dbc5`, branch
`revisao-premium-bloco-1-auth`, HEAD/worktree conferidos antes de alterações.
Registro histórico da implementação: escopo e D2 aprovados pela instrução do
responsável. Naquele momento, Etapas 01–12 concluídas de 57 e **Etapa 13 aberta
até revisão independente e rehearsal PostgreSQL; Etapa 14 não iniciada**.
O fechamento aprovado abaixo atualiza o estado, preservando as rodadas anteriores.

### Fechamento aprovado da Etapa 13

**15/10/2026 — Etapa 13, Contexto restrito e barreira de acesso, encerrada
documentalmente**, por instrução expressa do responsável após aprovação integral
da revisão independente do rehearsal complementar. **Etapas 01–13 concluídas de
57. Etapa 14 não iniciada.** Aprovação e conferência independente informadas pelo
responsável; neste fechamento foram consultados somente os artefatos locais,
sem repetir suítes, SQL ou ensaios PostgreSQL.

| Marco aprovado | Referência / resultado |
| --- | --- |
| Implementação inicial | `b63db7be5b879ee4b9b23acffeee68ce0d34faad` |
| Correção do intervalo de touch | `ae7d0b15479f3795ec6d57f52bf0631643e4c4ee` |
| Backend completo final | **1.701/1.701**, uma execução após estabilização |
| Focados finais / dedicados da correção | **293/293 / 20/20** |
| Rehearsal funcional consolidado | **63/63 provas únicas aprovadas**: 55 históricas no primeiro HEAD + oito complementares no segundo |
| Esperas reais na rodada complementar | **11 cenários**, com `wait_event_type=Lock` e bloqueador esperado em `pg_blocking_pids` |
| Erros PostgreSQL na rodada complementar | **Dois `55P03` esperados; zero inesperados** |
| Migration D2 | Aplicada **uma única vez** em `v3-homologacao`; ledger com **nove registros**, D2 em ID 9; checksum preservado |
| Preservação | **Zero resíduos sintéticos**; triggers D2 e perfil-base habilitados |
| Conferência independente | **89 tabelas originais, 54.394 registros, zero divergências** |

D2 mantém **30 minutos de inatividade e 120 minutos absolutos** desde a
autenticação, sem extensão por manter conectado. A sessão normal permite **no
máximo uma escrita de touch por intervalo de 60 segundos**, zero quando não
devida; `valid=true, written=false` continua permitindo a operação e a renovação
própria D2. Na janela física instrumentada de **60.004,340 ms**, quatro acessos
produziram uma escrita normal e quatro renovações D2; no par concorrente adicional
sem touch devido, duas renovações D2 e zero escritas normais. A prova inspecionou
os retornos reais do CTE e `xmin`, `ctid` e timestamps separadamente, sem inferir
escrita do resultado `permitted`.

| Prova complementar | Resultado físico aprovado |
| --- | --- |
| 56 | Lock real na sessão, retomada após rollback e subcenário de timeout `55P03`, sem touch parcial. |
| 57 | Lock real no contexto sem touch normal devido; renovação D2 e sessão fisicamente inalterada. |
| 58 | Acessos concorrentes serializados; absoluto D2 fixo, uma escrita na janela real de 60 s e zero no par sem touch devido. |
| 59 | Revogação em rollback; consulta aguardou sessão e retomou válida sem touch devido. |
| 60 | Alteração crítica e invalidação D2 revertidas juntas; consulta aguardou usuário e outra conta preservada. |
| 61 | `55P03` real no contexto; rollback completo, sessão/contexto sem renovação parcial e executor sem transação aberta. |
| 62 | Revogação confirmada nega consulta com e sem touch devido, sem escrita parcial. |
| 63 | Writer legado com commit invalida D2 sem incrementar versões; consulta nega, não recria contexto e preserva outra conta. |

Os 11 cenários de espera são subcenários instrumentados das **oito provas
complementares**, não 11 novas provas funcionais. Preflight, amostras, auditoria,
limpeza e repetição de observações não aumentam a contagem 63. As 55 aprovações
históricas não foram repetidas nem atribuídas ao segundo HEAD. Os dois erros
`55P03` pertencem somente à rodada complementar; os erros esperados da rodada
histórica permanecem no registro original.

A ocorrência **`HARNESS_WAIT` da primeira rodada permanece como falha histórica
de comprovação da prova 56, com causa retrospectiva não determinada**. A prova
física válida posterior superou a pendência e completou o consolidado 63/63;
não apaga a tentativa anterior, não a transforma em aprovação e não demonstra
que o patch de touch causou ou corrigiu aquela falha de observação. O instrumento
complementar preservou amostras positivas/negativas e PIDs de `pg_backend_pid()`,
com observador independente e barreira antes da consulta. Oito provas aprovadas
na primeira tentativa complementar, sem falha ou retomada do novo instrumento.

Limites da evidência física: timestamps de elegibilidade das fixtures foram
preparados sinteticamente no PostgreSQL (70 s para devido, 5 s para não devido),
separados das escritas do serviço. O serviço oficial usou SQL intacto,
`clock_timestamp()` real e locks reais; a janela da prova 58 aguardou pelo menos
60 s fisicamente, sem alterar relógio do servidor. Durações de espera observadas
são limites inferiores entre amostras positivas, não tempos exatos de servidor.
Fingerprints MD5 de linhas são controle operacional de preservação; o manifesto
SHA-256 registra a consistência dos artefatos, sem pretensão de assinatura adversarial.

A rodada complementar não aplicou nem reaplicou migration. SHA-256 D2 preservado:
`ba9ba77c2c7ac581415bc89ee2b2281a51ec0b12ac74f2854753b104645b29b7`.
A auditoria final do rehearsal registrou igualdade integral das 92 tabelas públicas
com seu baseline, nove registros do ledger intactos e 77 sequências sem avanço
ou reinicialização; isso complementa a conferência independente das **89 tabelas
originais / 54.394 registros**, sem confundir os dois universos. Triggers D2 e
perfil-base habilitados; a suspensão pontual do perfil-base na limpeza autorizada
foi revertida e verificada **antes do COMMIT**. Git, serviços oficiais, migration,
dados herdados e produção preservados na rodada complementar.

Artefatos complementares preservados em
`C:/tmp/escola-v3-etapa13-concorrencia-20261015-ae7d0b15/`:
`RELATORIO.txt`, `resumo.json`, `preflight.json`, `proofs.json`, `attempts.json`,
`*-samples.json`, `wait-summary.json`, `physical-touch-window.json`,
`touch-results.json`, `postgres-errors.json`, `transaction-states.json`,
`baseline.json`, `final-snapshot.json`, `cleanup.json`, `final-audit.json`,
`source-hashes-initial.json` e `manifest-sha256.json`. Fontes e arquivos da primeira
rodada permanecem no histórico abaixo. O relatório complementar ainda dizia
"aberta até revisão independente e fechamento documental": era o estado na
emissão; a aprovação expressa do responsável encerra agora a etapa, sem alterar
o relatório original.

**Limitações preservadas:** a barreira continua **desabilitada operacionalmente
por padrão**. Ativação futura depende das integrações e fluxos de regularização,
revisão, políticas, MFA, CSRF e migração dos consumidores. **D2 permanece aprovada;
D1 e D3–D8 continuam pendentes**. Conclusão técnica não autoriza ativação de flags,
produção, cutover, merge, deploy ou início da Etapa 14. Consumidores HTTP dos
tokens V3, worker/envio real e prova positiva TLS do adaptador SMTP mantêm seus
gates anteriores; sem promessa de exactly-once. Uma única plataforma pública no
endereço atual, com modernização progressiva e homologação separada.

### Ajuste pontual da Etapa 13 — intervalo de touch da sessão

Registro histórico anterior ao rehearsal complementar e ao fechamento acima;
as referências a oito pendências/etapa aberta descrevem aquele momento.

**15/10/2026**, base `b63db7be5b879ee4b9b23acffeee68ce0d34faad`, branch
`revisao-premium-bloco-1-auth`, HEAD e worktree limpo conferidos antes do patch.

Desvio reproduzido antes da correção: a operação D2 permitida executava UPDATE
dos timestamps normais em cada chamada, mesmo antes de 60 s. **Cinco falhas
entre 19 cenários** no serviço original. A primeira instrumentação tinha dois
falsos positivos adicionais porque o modelo não limitava a expiração normal pelo
absoluto; foi corrigida antes de alterar produção, com os logs preservados.

Correção restrita à consulta `restricted:touch-session`:
CTEs `locked`/`touched` distinguem **validade** de **escrita**. A sessão é
revalidada por existência, revogação, expiração estrita, limite absoluto e ordem
temporal; UPDATE ocorre apenas quando `ultimo_uso_em <= instante - TOUCH_MS`.
Resultado `valid=true, written=false` permite a operação D2 sem tocar os timestamps
normais. `IDLE_MS` e `TOUCH_MS` vêm do serviço canônico, que permanece inalterado.
O relógio usado é o timestamp PostgreSQL com microssegundos da renovação D2.

A consulta inicial já adquire locks usuário → sessão → contexto. O FOR UPDATE
final incide sobre a mesma sessão já bloqueada; não adquire outra sessão nem
inverte a ordem de aquisição. Mesma transação, mesmo executor raw; falha da
consulta ou commit reverte conjuntamente a renovação D2 e o touch normal.
A renovação do próprio D2 continua em cada operação permitida, com seu absoluto
fixo de 120 min e idle de 30 min. Contratos 01–12, flags, allowlist e API mantidos.

| Validação local do patch | Resultado |
| --- | --- |
| Testes dedicados novos | **20/20**, incluídos nos focados |
| Focados afetados | **293/293** |
| Suíte oficial completa `npm.cmd test` | **1.701/1.701**, uma única execução após estabilização |
| Falhas / skips / cancelamentos na suíte completa | **0 / 0 / 0** |
| Sintaxe JS do patch | **3/3** |

Cobertura: chamadas consecutivas, -1 us/exato/+1 us em 60 s, próximo intervalo
após escrita, concorrência modelada com só uma escrita de sessão, validade sem
touch devido, expiração/revogação/absoluto, revalidação final mesmo sem escrita,
cap pelo absoluto normal, falha de consulta e rollback de commit. O modelo conta
escritas confirmadas, não apenas chamadas SQL; a SQL tem asserção do predicado de
intervalo. Testes locais não comprovam locks/concorrência física PostgreSQL.

Artefatos do patch: `C:/tmp/escola-v3-etapa13-touch-20261015-b63db7be-5cd9a985/`,
`regression-before-initial.log`, `regression-before.log`, `focused.log`,
`focused-final.log`, `full.log`, `full-exit-code.txt` e `guard-*.json`.
DATABASE_URL dummy somente nos processos; guardas de Pool/Client, TCP/TLS, SMTP e
.env. Zero tentativas PostgreSQL/rede/SMTP; uma tentativa de leitura .env bloqueada,
sem conteúdo lido. Nenhum acesso Neon, nova fixture PostgreSQL ou ensaio executado.

#### Histórico aprovado anterior ao patch

A validação local final do próprio HEAD `b63db7be5b879ee4b9b23acffeee68ce0d34faad`
foi **1.681/1.681**, uma execução oficial, antes do rehearsal parcial. Artefatos:
`C:/tmp/escola-v3-etapa13-final-local-20261015-b63db7be-5ffda578/`,
`full.log` e `final-verification.json`. Complementa o registro histórico da
implementação, cuja primeira suíte completa tinha falhado no inventário.

Revisão independente do rehearsal parcial aprovada pelo responsável quanto à
aplicação D2, preservação e **55 provas funcionais já concluídas**. No HEAD
`b63db7be5b879ee4b9b23acffeee68ce0d34faad`: **63 planejadas, 56 executadas,
55 aprovadas, uma falha de comprovação HARNESS_WAIT e sete não executadas**.
São oito pendências, não oito provas aprovadas. A falha de observação da sessão
não demonstrou ausência de lock nem defeito do serviço; sua causa continua
indeterminada e não é atribuída automaticamente ao touch antecipado.

Migration D2 aplicada uma única vez em `v3-homologacao`, ledger **9**, com DDL/ledger
atômicos conforme os artefatos aprovados. SHA-256 aplicado e preservado:
`ba9ba77c2c7ac581415bc89ee2b2281a51ec0b12ac74f2854753b104645b29b7`.
Arquivo atual byte a byte igual ao HEAD-base. Dados/objetos herdados preservados,
zero resíduos sintéticos e trigger de proteção do perfil-base restaurado antes
do commit da limpeza. A única limpeza autorizada foi consumida naquele ensaio.

Fontes preservadas, consultadas somente como arquivos locais:
`C:/tmp/escola-v3-etapa13-20261015-b63db7be/`, `RELATORIO.txt`, `resumo.json`,
`proofs.json`, `concurrency.json`, `rehearsal-failure.json`,
`migration-result.json`, `cleanup.json`, `final-audit.json` e
`manifest-sha256.json`. Simulações temporais daquele rehearsal usaram timestamps
sintéticos sobre PostgreSQL real, sem alterar relógio do servidor; o relatório
preserva esse limite. **Nenhuma das 55 provas foi repetida neste patch**, nem
tratada como nova prova física do HEAD corrigido.

#### Efeito sobre as oito provas PostgreSQL pendentes

| Prova histórica | Avaliação para retomada futura autorizada |
| --- | --- |
| 56 — lock real na sessão (HARNESS_WAIT) | Continua inconclusiva. A aquisição inicial e o FOR UPDATE permanecem; corrigir a observação com PIDs SQL/barreira, sem inferir que o patch resolveu o harness. |
| 57 — lock real no contexto | Não executada. Renovação D2 e lock do contexto preservados; comprovar bloqueio real, inclusive quando não cabe touch normal. |
| 58 — acessos simultâneos | Conferir serialização, absoluto D2 fixo e, agora, uma única escrita normal por intervalo de 60 s; validade sem escrita não é falha. |
| 59 — revogação em rollback | Locks mantidos; após rollback a sessão válida deve permitir D2, com ou sem touch devido. |
| 60 — alteração crítica em rollback | Contexto restaurado pelo rollback e renovação D2 mantida; não exigir escrita normal antes de 60 s. |
| 61 — timeout real 55P03 | Exige comprovação física; lock continua obrigatório mesmo sem UPDATE devido. Verificar rollback conjunto. |
| 62 — consulta versus revogação com commit | Após revogação confirmada, negação obrigatória em ambos os caminhos de touch; validade não pode ser presumida por não haver escrita. |
| 63 — alteração crítica legada com commit | Trigger/schema não alterados; contexto invalidado continua impedindo reutilização, independentemente do intervalo normal. |

O harness futuro deve reconhecer o retorno `valid/written` de
`restricted:touch-session` e inspecionar timestamps/escritas, sem usar rowCount da
SELECT como prova de touch. Manter PIDs de `pg_backend_pid()`, observador independente
e relógio controlado identificado. Nenhuma dessas oito provas foi concluída pelos
testes modelados. Não repetir as 55 aprovadas nem reaplicar migration.
Retomada com novas fixtures e limpeza exige autorização específica própria;
a autorização deste patch não concede isso.

**Etapa 13 permanece aberta**, com revisão independente do patch e oito provas
PostgreSQL pendentes. Sem Neon, produção, SMTP, deploy ou Etapa 14. Uma única
plataforma pública no endereço atual, modernização progressiva, homologação
separada, D1 e D3–D8 preservadas. Worker/barreira não ativados operacionalmente.

### Arquivos e arquitetura

Registro histórico da implementação inicial; resultados e estado posteriores
registrados no ajuste acima.

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
Etapa 13 descrita acima; não altera o fechamento atual da Etapa 13.

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
