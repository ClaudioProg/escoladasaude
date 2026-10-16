# Plataforma Escola da Saúde — V3

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

Baseline documental de 2026-10-05. Branch: `revisao-premium-bloco-1-auth`.
HEAD de código da baseline: `ddb6d1e8795c67879ec107fe264b04d52867f665`.
Atualização documental e fechamento da Etapa 11: **14/10/2026**.
HEAD da implementação aprovada: `d9acb48b2f13ae998bfc688f1834511f0e3771bd`.
Fechamento documental da Etapa 09: **13/10/2026**. Núcleo implementado e publicado
na branch em `a6f49e6c15157f92b3b06d203213a27b7c454182`, com revisão independente
e rehearsal PostgreSQL isolado aprovados. A aprovação foi fornecida pelo
responsável após análise do código, relatório e verificações independentes no Neon.

## Finalidade e tipos de autoridade

Esta pasta reúne decisões aprovadas, implementação comprovada, evidências de
fechamento e pendências da V3. Conversas e relatórios externos são fontes de
entrada; não substituem permanentemente este registro versionado.

Cada registro deve distinguir:

- **FATO DO REPOSITÓRIO:** verificável no código, migration ou histórico do HEAD indicado.
- **DECISÃO CANÔNICA:** aprovação explícita; descreve o contrato alvo, mesmo quando ainda não implementado.
- **PENDÊNCIA:** definição ou comprovação ainda ausente; não pode ser fechada por inferência.
- **RECOMENDAÇÃO FUTURA:** proposta técnica, sem aprovação presumida.

Ordem de autoridade adotada para a V3:

1. Decisões canônicas explicitamente aprovadas.
2. Código e migrations do HEAD correspondente, como prova da implementação efetiva.
3. Evidências de testes e rehearsal, limitadas ao ambiente e à versão ensaiados.
4. Documentação de status.
5. Recomendações ainda não aprovadas.

Uma decisão não prova implementação; um commit não prova aplicação de migration;
um teste local ou rehearsal não prova produção. Divergências entre o contrato alvo
e o código devem permanecer explícitas, sem ocultar o comportamento atual.

## Índice

| Documento | Finalidade |
| --- | --- |
| [Decisões canônicas](decisoes-canonicas.md) | Contratos aprovados, API atual de senhas e pendências D1–D8. |
| [Status do Bloco 1](bloco-1-status.md) | Fechado, parcial, legado ativo e a fazer, com commits comprovados. |
| [Migrations](migrations.md) | Inventário V3, rehearsal e limites operacionais do ledger. |
| [Testes e evidências](testes-e-evidencias.md) | Resultados históricos de fechamento e fontes locais verificáveis. |
| [Legado](legado.md) | Classificação de coexistência/retirada e condições de substituição. |
| [Retomada](retomada.md) | Ponto operacional para a próxima etapa. |

`auth-contratos.md`, `permissoes.md` e `deploy-cutover-rollback.md` ainda não existem.
Serão criados quando seus contratos forem efetivamente fechados.

## Transição e atualização

Princípio: **expand → compatibilidade → rehearsal → cutover → contract**.
A presença de estruturas expand não autoriza ativar writers ou remover leitores
legados. Antes do primeiro writer Argon2id operacional, o login precisa aceitar
Argon2id e bcrypt legado; essa compatibilidade foi entregue na Etapa 05.
A Etapa 09 fecha o núcleo transacional de quotas compartilhadas: **142/142 testes
focados**, **829/829 completos** e **129/129 provas finais do rehearsal**, incluindo
**107 da Etapa 09**. O histórico registra 141 checagens, 137 aprovações e quatro
falhas intermediárias do harness corrigidas; dois erros PostgreSQL inesperados
vieram de inicialização abortada antes do serviço, nenhum na execução corrigida.

A homologação permanente `v3-homologacao` (`br-round-union-adok19ir`) foi preservada.
A migration 08 foi aplicada uma única vez nesse alvo, ledger id 7 e SHA-256
inalterado; a branch descartável da Etapa 08 já foi excluída. Quotas terminaram
vazias, com 89 tabelas / 54.394 linhas herdadas preservadas. Catálogo: 1.717
atributos ativos + dez descartados = 1.727 entradas. Ver
[evidências e limites](testes-e-evidencias.md#rehearsal-postgresql-da-etapa-09-aprovado).
O custo da guarda HMAC continua sujeito à avaliação operacional. Sem ativação
HTTP, SMTP, limpeza, integração com outbox ou implantação em produção; writers
Argon2id continuam pendentes. Esse fechamento da Etapa 09 não iniciou a Etapa 10.

Fechamento de **13/10/2026 — Etapa 10: expand da outbox concluído**, implementado
em `7bb864245409155a9130756911ce531b6b5454ca`, publicado na branch V3 e aprovado
em revisão independente após rehearsal PostgreSQL isolado. Validações prévias:
**30/30 dedicados, 162/162 focados e 859/859 completos**; não reexecutadas.
Rehearsal: **186/186 provas finais**, incluindo **161 PostgreSQL**, **112 erros
esperados e zero inesperados**. Fonte técnica e limites em
[evidências](testes-e-evidencias.md#etapa-10--outbox-expand--rehearsal-e-revisão-aprovados).

Migration `2026-10-13-auth-outbox-expand.sql` aplicada exclusivamente em
`v3-homologacao` (`br-round-union-adok19ir`), ledger **id 8**, SHA-256 inalterado;
atomicidade comprovada pela transação **6100996**, segunda execução com skip.
**19 colunas, 13 constraints, sete índices, função e triggers aprovados**.
Outbox e quotas vazias ao final; **90 tabelas / 54.395 linhas herdadas preservadas**.
Integridade referencial, CASCADE, rollback, identidade, estados, leases e suporte
estrutural à seleção concorrente comprovados. Homologação permanente preservada.

No fechamento da Etapa 10, criptografia operacional/enqueue e as Etapas 11/12
estavam pendentes. A Etapa 11 foi aprovada posteriormente, conforme seção abaixo.
Naquele fechamento, worker, SMTP e fencing integral ainda estavam pendentes;
o escopo da Etapa 12 foi aprovado posteriormente, conforme seção abaixo.
Exactly-once não é garantido; limpeza operacional e produção permanecem fora do
fechamento. O fechamento da Etapa 10 documental/Git não
repete testes/rehearsal nem executa SQL ou operações Neon. Ver
[migration](migrations.md#etapa-10--outbox-expand-aprovada-em-homologação).

**Etapas 01–14 concluídas de 57. Etapa 15 não iniciada.**
Contagem das microetapas do roteiro técnico.
Essa contagem não equivale ao avanço ponderado do trabalho; não estabelece
percentual global, esforço restante ou estimativa de prazo.

Etapa 11 — **criptografia e enqueue transacional encerrados**, com revisão
independente aprovada em **14/10/2026** pelo responsável. Implementação em
`d9acb48b2f13ae998bfc688f1834511f0e3771bd`, sobre `a745a9d18c56ff50941a7f01131d32d1cbf21e5e`.
`authOutboxCrypto.js` e `authEnqueueService.js` compõem AES-256-GCM/AAD versionada,
token opaco e quotas/desafio/outbox/auditoria no executor transacional do chamador.
Validações anteriores: **47/47 criptografia, 87/87 enqueue, 290/290 focados e
993/993 backend completo**; não reexecutadas neste fechamento.

Rehearsal isolado: **37/37 provas únicas aprovadas**, **38 tentativas históricas**
com uma falha do instrumento de observação posteriormente corrigida; **oito erros
PostgreSQL esperados e zero inesperados**. As **dez verificações do preflight** e
os **seis controles complementares** têm contagens separadas. Três finalidades,
criptografia real, atomicidade, replay, concorrência e rollback aprovados no
alcance documentado, com conexões distintas e PIDs SQL reais.
Duas limpezas transacionais autorizadas restauraram o trigger de proteção do
perfil-base antes do commit; **zero resíduos sintéticos**. Sequência de auditoria:
**349 → 358 → 364**, sem reinicialização.

A conferência independente no Neon informada pelo responsável confirmou **2.668
usuários, 2.774 vínculos de perfis**, outbox/quotas/desafios vazios, auditorias
sintéticas removidas, trigger original habilitado e **oito registros no ledger**.
**89 tabelas originais / 54.394 linhas preservadas**, com zero divergências de
conteúdo após excluir os registros das migrations 08 e 10. `v3-homologacao`
preservada. Fontes, contagens e limites em [evidências](testes-e-evidencias.md#etapa-11--criptografia-e-enqueue--rehearsal-e-revisão-aprovados).

**DECISÃO CANÔNICA aprovada pelo responsável:** uma única plataforma pública,
mantendo o endereço atual, com modernização progressiva por blocos. A produção
continua operacional durante a transição; homologação e produção permanecem
separadas. A substituição da autenticação exige validação integral das integrações
essenciais, plano de implantação/reversão e autorização expressa. O fechamento
do Bloco 1 não autoriza implantação automática nem pressupõe duas plataformas
públicas. Ver [decisão de implantação](decisoes-canonicas.md#decisão-canônica--implantação-progressiva-na-plataforma-pública-atual).

D1–D8 e demais pendências preservadas. A Etapa 11 não implementa worker SMTP,
retries, claim/ack, ativação HTTP, integrações públicas ou exactly-once; limpeza
operacional e fencing integral permanecem fora do núcleo da Etapa 11. No seu
fechamento, a Etapa 12 ainda não havia sido iniciada; implementação atual abaixo.
O fechamento documental/Git da Etapa 11 alterou somente os seis documentos
autorizados, sem repetir testes ou operações PostgreSQL/Neon, SMTP, deploy ou merge.

Ao atualizar um documento, registrar HEAD/data, origem da decisão ou evidência,
ambiente, limites da comprovação e pendências relacionadas. Alterar o status
somente com a evidência correspondente. Não modificar migration aplicada para
ajustar a documentação. Não incluir credenciais, endereços de conexão ou dados
pessoais nos documentos.

## Etapa 12 — worker local, ativação real bloqueada

Worker dedicado à autenticação, aprovado após revisão independente:
[authOutboxWorker](../../backend/src/services/authOutboxWorker.js),
[job](../../backend/src/jobs/authOutboxJob.js) e adaptador SMTP exclusivo,
com start/shutdown no backend e configuração institucional do mailer preservada.
Claim transacional com `FOR UPDATE SKIP LOCKED`, locks usuário → desafio → outbox,
UUID novo por lease/reclaim, **180 segundos de posse**, polling **30 segundos**,
ack com fencing e relógio PostgreSQL com microssegundos. SMTP fora da transação.

Seis tentativas máximas, incluindo claims interrompidos. Horários absolutos desde
`criada_em`: recuperação **0/1/3/7/15/25 min**; confirmação/alteração
**0/1/5/15/60/180 min**. Slots vencidos são pulados, sem rajadas; somente horário
futuro anterior à expiração. Terminais `sent`/`failed` removem todo o envelope,
preservam identidade/metadados/auditoria, sem excluir históricos ou limpar quotas.

**Desabilitado por padrão em todos os ambientes**. Desabilitado/dry-run não
consulta banco, faz claim, consome tentativa, decifra ou inicia SMTP. O backend
mantém o consumidor V3 ausente como gate fechado: **envio real bloqueado antes de
claim**, mesmo com flag true. `/api/auth/redefinir-senha` ainda espera JWT `pwd-reset`,
incompatível com token opaco V3. Não foi criado link para rota legada nem alterada
rota pública/frontend. Integração futura exige consumidor V3 e configuração completa.

O adaptador usa subprocesso SMTP isolado, encerrado com `SIGKILL` aos 115 s,
com 5 s de margem no limite técnico de **120 s**; aguarda saída efetiva, não usa
`Promise.race` como cancelamento. Resultado aceito pelo transporte pode virar
`sent`; dry-run nunca vira `sent`. Prova física aprovada: 52 verificações,
kill em 115,072 s e resolução em 115,078 s, dentro de 120 s. TLS positivo pelo
adaptador ainda requer prova física antes da futura ativação SMTP real;
essa prova não reabre automaticamente toda a Etapa 12.
At-least-once controlado, sem exactly-once; aceitação não prova entrega/leitura.

Validação inicial histórica: **118/118 testes novos, 435/435 focados, 1.111/1.111 backend completo** (uma execução),
**9/9 sintaxe JS** aprovados. Modelos transacionais/processos SMTP simulados,
criptografia real sintética; naquela rodada PostgreSQL/SMTP reais não foram ensaiados.
Fechamento aprovado: implementação `bf6155bccba4657ab7350692ecc2273945b6add4`,
flags/dry-run `40ab140fa23f4cf879ac00d867b0def3ef5deff5` e cancelamento/IPC
`db095b6f325c41f093c79b271670785e94eff848`. Validação atual: **1.529/1.529 backend**,
**670/670 focados**, **29/29 regressões novas**, **4/4 subprocessos Node reais**;
rehearsal PostgreSQL **44/44 provas únicas**, três falhas históricas do instrumento
corrigidas e preservadas; zero resíduos sintéticos, trigger restaurado,
ledger e dados herdados preservados.
**Etapas 01–12 concluídas de 57. Etapa 13 não iniciada.** D1–D8, migrations,
jobs de eventos/salas e decisão da única plataforma pública no endereço atual
preservados. Sem implantação em produção, merge ou configuração Vercel neste fechamento. [Contratos](decisoes-canonicas.md#etapa-12--worker-e-decisões-operacionais-aprovadas),
[evidências e limites](testes-e-evidencias.md#etapa-12--worker-local--revisão-e-rehearsal-pendentes) e [fechamento aprovado](testes-e-evidencias.md#fechamento-aprovado-da-etapa-12).

## Etapa 14 — reautenticação local básica

**D5 parcialmente aprovada somente quanto à reautenticação local básica**.
[Serviço dedicado](../../backend/src/services/authReauthenticationService.js),
[interface HTTP](../../backend/src/auth/authReauthenticationHttp.js),
[rota opt-in](../../backend/src/routes/authReauthenticationRoute.js) e
[migration nova](../../backend/db/migrations/2026-10-15-auth-reautenticacao-expand.sql).
Prova de senha atual, sem novo login/JWT/sessão/rehash; 32 bytes aleatórios,
somente SHA-256 persistido, **cinco minutos absolutos**, uso único, vínculo a conta,
sessão cookie, auth_version e finalidade controlada. Consumo interno na transação
da futura operação, sem commit próprio e sem renovar sessão. Locks usuário →
sessão → prova, relógio PostgreSQL após esperas e fence final. Triggers novos
invalidam apenas provas de reautenticação em mudanças críticas (inclusive writers
legados sem incremento) e revogação/revinculação da sessão; D2 permanece intacta.

**GET /api/auth/reautenticacao/csrf** fornece HMAC CSRF por sessão;
**POST /api/auth/reautenticacao** aceita somente `senha` e `finalidade`.
Cookie válido obrigatório; Bearer isolado não comprova sessão e Bearer fornecido
inválido/conflitante não tem fallback. Origin/Referer exatos, chave CSRF separada,
JSON, header `X-Reauth-CSRF`, respostas no-store. Mesma barreira D2, sem ampliar
allowlist. Limites exigem configuração explícita antes da ativação, sem novo valor
operacional presumido. Tentativas por conta reservadas duravelmente em PostgreSQL
antes da senha, sem reutilizar quotas de e-mail; proteção IP usa a biblioteca
`express-rate-limit` existente, em memória por processo.

**120/120 dedicados + 1/1 inventário afetado (121/121 focados)**, sintaxe **9/9 JS**,
**1.821/1.821 backend completo**, uma execução após estabilização e zero falhas/
skips/cancelamentos. Revisão independente e rehearsal **71/71 provas funcionais
únicas aprovados**; migration aplicada uma única vez em `v3-homologacao`, ledger
com **10 registros** e checksum preservado. Concorrência física, consumo único,
reservas duráveis, rollback e invalidações comprovados no alcance do ensaio.
**Etapa 14 encerrada em 16/10/2026**; **Etapa 15 não iniciada**. Operações sensíveis
futuras não integradas; prova não concede autorização nem satisfaz MFA, e proteção
CSRF local não substitui a Etapa 39. Retenção e proteção IP distribuída pendentes.
Reautenticação/barreira desabilitadas operacionalmente, produção e infraestrutura
preservadas. Uma plataforma pública no endereço atual, modernização progressiva.
[Fechamento, evidências e limites](testes-e-evidencias.md#fechamento-aprovado-da-etapa-14).

## Etapa 13 — contexto restrito e barreira de acesso

Registro do fechamento da Etapa 13 em 15/10/2026: ledger e decisões pendentes
abaixo referem-se àquele marco histórico. O estado atual está no fechamento da
Etapa 14 no início deste documento.

D2 aprovada pelo responsável em **15/10/2026**: contexto restrito com **30 minutos
de inatividade e 120 minutos absolutos**, comparações estritas no backend;
`manter_conectado` não estende D2. Expiração exige nova autenticação, recuperando
somente progresso comprovável nos registros do servidor. Logout/revogação,
`auth_version` divergente, exclusão ou contexto inválido impedem reutilização.
Prazos canônicos das sessões normais permanecem inalterados.

[Serviço dedicado](../../backend/src/services/authRestrictedContextService.js),
[middleware](../../backend/src/auth/authRestrictedMiddleware.js) e
[migration forward-only](../../backend/db/migrations/2026-10-15-auth-contexto-restrito-expand.sql).
Registro mínimo por sessão, sem duplicar identidade, token ou progresso;
criado na transação de nova autenticação. Sem backfill de cookies antigos.

Barreira ligada aos middlewares oficiais Bearer/admin e cookie, sob flag explícita
`AUTH_RESTRICTED_CONTEXT_ENABLED=true`; ausente/`false` preserva operação legada.
Outros valores falham fechado. A flag não é autorização para ativar agora:
os fluxos completos ainda não existem. Módulos protegidos não têm bypass por perfil.
Bearer sozinho não autoriza regularização; cookie validado/vinculado é obrigatório.
Credenciais combinadas inválidas ou divergentes são rejeitadas, sem fallback permissivo.

Allowlist atual: **somente GET /api/auth/contexto-restrito**, consulta protegida de
progresso comprovável. Nenhum `/api/auth/*`, domínio inteiro `/api/perfil` ou escrita
de perfil foi liberado. Endpoints públicos legítimos mantêm seus próprios contratos.
Revisão, políticas e MFA sem prova persistida continuam não comprovados;
mesmo conta com campos preenchidos não ganha acesso normal por ausência dessa prova.

Validação inicial histórica: **152 testes novos**, incluídos nos **347/347 focados**; sintaxe **13/13 JS**.
Naquela rodada, única execução completa: **1.678/1.679**, falha de inventário do teste do runner
pela migration nova. Lista esperada corrigida e o teste afetado aprovado **1/1**;
suíte completa não repetida naquela rodada, sem comprovar o HEAD final então.
As validações posteriores aprovadas estão registradas abaixo e no fechamento.
Na implementação inicial o rehearsal ainda não havia sido executado.
Estado atual: **Etapa 13 encerrada**, após revisão independente integralmente
aprovada. **63/63 provas funcionais únicas**: 55 históricas em `b63db7be` e oito
complementares em `ae7d0b15`; 11 cenários de espera PostgreSQL real comprovados.
Validação local final: **20/20 dedicados, 293/293 focados, 1.701/1.701 completos**
(uma execução). Sem repetição de testes/ensaios neste fechamento documental.
Migration aplicada uma vez em homologação, ledger 9 e checksum preservados;
zero resíduos sintéticos, triggers D2 e perfil-base habilitados. Conferência
independente: **89 tabelas originais, 54.394 registros, zero divergências**.
**Etapas 01–13 concluídas de 57. Etapa 14 aberta; Etapa 15 não iniciada.**
D2 aprovada; D1 e D3–D8 continuam pendentes. Ativação futura depende das
integrações e fluxos de regularização, revisão, políticas, MFA, CSRF e migração
dos consumidores; a barreira permanece desabilitada operacionalmente por padrão.
[Fechamento e rastreabilidade](testes-e-evidencias.md#fechamento-aprovado-da-etapa-13).
Jornadas 29/30 e migração por domínios 42/43 exigem integrações futuras, sem
frontend nesta etapa.
Uma única plataforma pública no endereço atual, modernização progressiva,
homologação separada e nenhuma ativação operacional/produção.
[Contratos D2](decisoes-canonicas.md#decisão-canônica-aprovada--d2-contexto-restrito)
e [evidências](testes-e-evidencias.md#etapa-13--contexto-restrito-e-barreira-de-acesso).

## Documentação histórica e conflitos

[frontend/dossie.md](../../frontend/dossie.md) permanece preservado como histórico.
Ele descreve JWT/localStorage e perfil único como contrato oficial do sistema
anterior. Isso não define o contrato final da V3, embora esse legado ainda esteja
ativo no HEAD inspecionado. As decisões V3 desta pasta prevalecem sobre decisões
V3 conflitantes em documentos históricos; isso não significa cutover realizado.

Comentários de [generateToken](../../backend/src/auth/generateToken.js) e
[authMiddleware](../../backend/src/auth/authMiddleware.js) também descrevem o
contrato JWT/perfil único vigente no legado. O middleware de sessão já possui o
contrato alvo, mas sua existência não prova migração de todas as rotas.

Nesta baseline, decisões são transcritas da aprovação explícita da Etapa 04 e das
decisões anteriores fornecidas pelo responsável, incluindo o fechamento da Etapa
11 e a decisão de implantação aprovados em 14/10/2026. Resultados PostgreSQL são
históricos, conforme [evidências](testes-e-evidencias.md); nenhum banco foi
consultado neste fechamento. O HEAD do núcleo foi conferido no remoto da branch
V3; publicação Git não comprova implantação ou funcionamento em produção.
