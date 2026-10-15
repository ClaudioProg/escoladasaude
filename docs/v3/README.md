# Plataforma Escola da Saúde — V3

Etapa 13 — **ajuste pontual do intervalo de touch**, em **15/10/2026**, sobre
`b63db7be5b879ee4b9b23acffeee68ce0d34faad`. Renovação D2 preservada; touch da sessão
normal respeita **60 segundos**, sem negar sessão válida quando a escrita não é devida.
**1.701/1.701 backend completo (uma execução), 293/293 focados, 20/20 dedicados**.
Migration D2 já aplicada na homologação, sem alteração neste patch; rehearsal
parcial com **55 provas aprovadas e oito pendências**. **Etapa 13 aberta;
Etapa 14 não iniciada**. Ativação operacional continua desabilitada.
[Evidências e avaliação das pendências](testes-e-evidencias.md#ajuste-pontual-da-etapa-13--intervalo-de-touch-da-sessão).
Os registros anteriores preservam os marcos históricos; este ajuste registra o estado atual.

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

**Etapas 01–12 concluídas de 57. Etapa 13 aberta; Etapa 14 não iniciada.**
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

## Etapa 13 — contexto restrito e barreira de acesso

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
Única execução completa: **1.678/1.679**, falha de inventário do teste do runner
pela migration nova. Lista esperada corrigida e o teste afetado aprovado **1/1**;
suíte completa não repetida, sem alegar execução completa verde do patch final.
Na implementação inicial o rehearsal ainda não havia sido executado.
Estado atual: D2 aplicada, 55 provas PostgreSQL aprovadas, oito pendências;
ajuste de touch com **20/20 dedicados, 293/293 focados, 1.701/1.701 completos**
(uma execução), sem nova operação PostgreSQL. Ver evidências do ajuste no topo.
**Etapa 13 aberta**, aguardando revisão independente e rehearsal; **Etapa 14 não iniciada**.
D1 e D3–D8 permanecem independentes. MFA/CSRF, jornadas 29/30 e migração por
domínios 42/43 exigem integrações futuras, sem frontend nesta etapa.
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
