# Retomada operacional

Projeto: **Plataforma Escola da Saúde — V3**.

Branch: `revisao-premium-bloco-1-auth`.

Atualização documental: 2026-10-13.
HEAD da implementação da Etapa 10, versionado/publicado na branch:
`7bb864245409155a9130756911ce531b6b5454ca`.
Confirmar HEAD/status ao retomar, incluindo o commit documental posterior.

Última etapa concluída: **10 — expand da outbox de autenticação**, com revisão
independente e rehearsal PostgreSQL isolado aprovados em **13/10/2026**.
Etapas **01–10 encerradas**. **11 implementada localmente para revisão/rehearsal**,
sobre `a745a9d18c56ff50941a7f01131d32d1cbf21e5e`; **12 pendente e não iniciada**.
A Etapa 11 não está concluída; confirmar o commit de implementação no histórico.

**Dez etapas concluídas entre 57 microetapas previstas** do roteiro técnico.
Essa contagem não equivale ao avanço ponderado do trabalho; não estabelece
percentual global, esforço restante ou estimativa de prazo.

Proteção de login/reset concorrentes da Etapa 07 permanece aprovada.
Etapas **01–06 versionadas na branch**; Etapa 07 com **fechamento local aprovado**.
Etapa 04 documental incorporada em `3247b3d305234414a493e60097d1bae8e0b238d1`;
manutenção do inventário de migrations em `dd0722b54a3837994eda44ae7434179db1ccbca1`.

Revisão independente da Etapa 07 aprovada pelo responsável em **09/10/2026**,
após conferência do código e das evidências PostgreSQL originais e complementares. O fechamento
integra o commit único de implementação, testes e documentos na branch V3.
Pendências futuras permanecem abertas; nenhuma produção foi validada.

Histórico de infraestrutura: **08 — EXPAND CONCLUÍDO / REHEARSAL E REVISÃO APROVADOS**.
Revisão independente aprovada pelo responsável em **09/10/2026**. Migration
`2026-10-09-auth-quotas-expand.sql`, testes e inventário oficial concluídos:
`auth_quota_evento`, uma linha por emissão, conta e/ou IP HMAC, oito constraints,
três B-trees adicionais e FK imediata RESTRICT.

Validação prévia: **149/149 testes locais**, sintaxe JS 2/2, dry-run oficial e
**57/57 provas PostgreSQL aprovados**. Na Etapa 08, migration aplicada somente na
branch descartável `br-super-wave-adut7rdn` (`rehearsal-etapa-08-descartavel`),
já excluída, filha do clone auth-recuperação. Ledger **id 7**, SHA-256
`a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a`.
Tabela final vazia; dados herdados preservados conforme relatório aprovado.
Ver [rehearsal](migrations.md#etapa-08--expand-concluído-rehearsal-aprovado) e
[evidências](testes-e-evidencias.md#etapa-08--expand-concluído--rehearsal-e-revisão-aprovados).

O fechamento documental/Git não repete testes nem executa SQL, migration ou
operações Neon. Homologação permanente `v3-homologacao` (`br-round-union-adok19ir`)
preservada; a branch descartável da Etapa 08 não é mais alvo de retomada.
Aprovação isolada não significa implantação em produção; não houve deploy ou merge na main.

Etapa 09: **NÚCLEO VERSIONADO / REHEARSAL E REVISÃO APROVADOS**.
Decisão **A aprovada**: três finalidades compartilham os limites por conta e IP.
`authQuotaService.js` / `authQuotaIp.js` e testes locais criados; **142/142 focados**,
**829/829 backend completos**, sintaxe **4/4**. Suíte completa executada uma vez.
Sem novas migrations ou import do serviço nas rotas/controller/server.

API e limites em [decisões](decisoes-canonicas.md#etapa-09--núcleo-transacional-aprovado-em-rehearsal-sem-integração).
Usar executor de `db.tx` READ COMMITTED de escrita, uma emissão por transação;
usuário antes dos advisory locks, clock único após locks. Aceita aguarda commit
externo; erros críticos devem abortar o chamador. Sem retries SMTP contabilizados.

Rehearsal: **129/129 provas finais**, incluindo **107 da Etapa 09**. Histórico:
**141 checagens executadas, 137 aprovações, quatro falhas intermediárias do harness
corrigidas**, mais dois erros PostgreSQL inesperados na inicialização abortada
antes do serviço; nenhum inesperado na execução corrigida.

Migration 08 aplicada uma única vez em `v3-homologacao`, ledger **id 7**, SHA-256
`a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a` inalterado;
segunda execução fez skip. Tabela de quotas **vazia**; **89 tabelas / 54.394 linhas
herdadas preservadas**. Catálogo: **1.717 atributos ativos + dez descartados =
1.727 entradas**. [Evidências e limitações](testes-e-evidencias.md#rehearsal-postgresql-da-etapa-09-aprovado).

A Etapa 09 está fechada; suas pendências de integração permanecem. A Etapa 10
aprovada está registrada abaixo, sem avançar para a Etapa 11. Custo da guarda HMAC
sujeito à avaliação operacional; proxy efetivo,
segredo dedicado/rotação, integração desafio/outbox/HTTP e limpeza de 48 h
pendentes. Solicitações sem emissão não receberam política. Rate limit legado
e D1–D8 preservados. Sem ativação HTTP, SMTP, limpeza, outbox ou produção.
O fechamento documental/Git da Etapa 09 não repetiu testes/rehearsal nem executou
SQL, migrations, operações Neon, deploy ou merge.

Etapa 10 encerrada: `2026-10-13-auth-outbox-expand.sql`, SHA-256
`2be1525aa0bf1064de5d594ad026e5cc0c0fb533c0fcaedcf42032f489d52c0a`.
Aplicada exclusivamente em **`v3-homologacao` (`br-round-union-adok19ir`)**, ledger
**id 8**, atomicidade na transação **6100996**, segunda execução com skip.
Estrutura aprovada: **19 colunas, 13 constraints, sete índices**, função e triggers.

Validações anteriores: **30/30 dedicados, 162/162 focados e 859/859 completos**.
Rehearsal: **186/186 provas finais**, incluindo **161 PostgreSQL**; **112 erros
esperados e zero inesperados**. Integridade referencial, CASCADE, rollback,
identidade, estados, leases e suporte estrutural à seleção concorrente comprovados.
Outbox e quotas **vazias**; **90 tabelas / 54.395 linhas herdadas preservadas** e
homologação permanente preservada. Nenhuma validação reexecutada neste fechamento.

Limites: sem criptografia operacional, enqueue, worker, SMTP, fencing integral,
exactly-once, limpeza operacional ou implantação em produção. Duração de lease,
cronograma de alteração e política de limpeza continuam pendentes. Não confundir
seleção concorrente estrutural com protocolo completo de claim/ack ou worker.
No fechamento da Etapa 10, as Etapas 11 e 12 permaneceram pendentes. A
implementação local da Etapa 11 está registrada abaixo e não inicia a Etapa 12.
Preservar a homologação permanente.
Sem SQL, operações Neon, SMTP, deploy, merge ou novos testes no fechamento.
Ver [contratos](decisoes-canonicas.md#etapa-10--outbox-aprovada-em-rehearsal-sem-ativação),
[migration](migrations.md#etapa-10--outbox-expand-aprovada-em-homologação) e
[evidências](testes-e-evidencias.md#etapa-10--outbox-expand--rehearsal-e-revisão-aprovados).

Etapa 11 — implementação local para revisão, sem fechamento:
`authOutboxCrypto.js` / `authEnqueueService.js` e dois testes dedicados.
AES-256-GCM real com chave externa 32, nonce aleatório 12, tag 16, AAD versionada
vinculada a mensagem/desafio/finalidade/destinatário e leitura de chaves explícitas.
Enqueue no executor do caller, mesmo UUID nas três estruturas, tokens opacos de
256 bits, somente hash no desafio e envelope na outbox, auditoria crítica.
Relógio das quotas preserva microssegundos e prazos de 24 h/30 min; resposta
normal genérica, sem token ou indicação da existência/aceitação de conta.

**134/134 testes novos** (47 crypto/87 enqueue), **290/290 focados**, **993/993
completos** (uma execução), JS 4/4 e gramática PG16 de 24 consultas aprovados.
Sem acesso externo; teste de persistência/rollback é simulado. D1/D4 e integração
HTTP/autorização permanecem bloqueios funcionais objetivos; o núcleo não emite
para cadastro pendente ou recuperação não confirmada e não implementa reativação.
Não presumir política nova nem autorização por conhecer versões de usuário.

Próxima ação depende de autorização: revisão e somente o
[rehearsal PostgreSQL necessário](testes-e-evidencias.md#rehearsal-postgresql-necessário-da-etapa-11),
na `v3-homologacao` preservada. Verificar binário, ledger/schema existentes e
identidades sintéticas; não aplicar migration nova ou repetir o rehearsal 08–10.
Não executar SMTP/worker, retries/claim/ack, limpeza operacional, frontend,
ativação de rotas, SQL externo, Neon, merge ou deploy neste trabalho.
**Etapa 12 não iniciada; contagem de concluídas permanece dez entre 57.**
Ver [contratos](decisoes-canonicas.md#etapa-11--núcleo-local-de-criptografia-e-enqueue-sem-ativação).

Estado funcional relevante:

- `passwordService/verifyPassword` integrado ao login; bcrypt legado e Argon2id
  autenticam. Bcrypt direto removido do controller de login.
- Upgrade bcrypt automático ainda **não persiste**; Argon2id com `needsRehash`
  também **não persiste** rehash.
- `requiresPasswordChange` bloqueia acesso normal com 403, sem JWT, sessão,
  cookie ou notificação. Fluxo seguro de troca ainda precisa ser implementado
  antes do cutover; proteção login/reset e rehearsal da Etapa 07 aprovados localmente.
- Novos access JWTs levam `auth_version`; login local e Google emitem a versão
  e o middleware Bearer compara token × banco.
- `bridge`/`strict` existem; `AUTH_VERSION_MODE` é obrigatório e fail-closed.
  Em `bridge`, token antigo realmente sem claim só é aceito como versão 1
  quando DB=1; em `strict`, ausência de claim é rejeitada.
- `createSession` exige `expectedAuthVersion` do snapshot original do hash,
  comparado sob lock antes de efeitos; login perdedor retorna 401 canônico,
  piso de 250 ms e nenhuma publicação de credenciais/sessão.
- Reset JWT agora exige `auth_version`; tokens antigos sem claim são inválidos.
  `redefinirSenha` local incrementa versão, revoga todas as sessões e audita
  criticamente no mesmo tx. Replay de tokens N bloqueado após commit N → N+1.
- Reset mantém bcrypt custo 10/política legada. Histórico não integrado;
  reutilização de senha possível. `atualizarBasico` ainda altera senha sem
  incremento/revogação; cadastro, exclusão e outros writers continuam pendentes.
- Perfil único legado continua; JWT/Bearer segue durante a transição.
- Sessão/cookie continua independente do verificador Bearer; reset revoga sessões
  explicitamente. JWTs especializados não usam a ponte; reset tem validação própria.
- D8 permanece pendente para o cutover `bridge → strict`. Evidência local não
  comprova presença da coluna nem configuração do modo em produção; não houve deploy.

A Etapa 07 versiona exatamente sete JS (incluindo novo teste dedicado) e quatro
documentos autorizados. Validação final prévia: **193/193 testes focados** e
**670/670 testes completos do backend**, aprovados após a correção.
Os testes não são reexecutados no fechamento documental.

Rehearsal original: **R1–R11 operacionais aprovados**, deadlock `40P01` reproduzido
no R12. `changeActiveArea` corrigido para **usuário → sessão → contexto**.
**Sete provas PostgreSQL complementares aprovadas, sem deadlocks**: três de
troca de área/reset, duas de touch/reset, bridge legado e senha nova antes/depois
do commit. O conjunto cobre **todos os 13 cenários canônicos**, conforme
[numeração e correspondência ao harness](testes-e-evidencias.md#numeração-canônica-e-correspondência-operacional).
R13 operacional continua somente pré-checagem histórica, sem prova de fechamento
posterior ao deadlock; R13 canônico é a prova complementar de login com senha nova.

Alvo das evidências da Etapa 07: branch Neon exclusiva
`rehearsal-etapa-07-descartavel`, derivada do clone auth-recuperação
`revisao-premium-ensaio-auth-recuperacao`. Identidades sintéticas e artefatos
originais/complementares preservados. Sem UI/browser, SMTP real ou implantação
em produção. Produção requer preflight próprio; o fechamento documental não
executa PostgreSQL, migrations, deploy ou exclusão da branch.

Aviso 5432: a rede municipal bloqueia PostgreSQL direto. Usar internet pessoal
somente quando uma etapa realmente exigir conexão e houver autorização para o
alvo. A documentação não exige acesso a banco.

## Antes de retomar

1. Conferir branch, HEAD e status; parar diante de mudança inesperada.
2. Ler [status](bloco-1-status.md), [decisões/D1–D8](decisoes-canonicas.md) e
   [legado](legado.md); não fechar pendências por inferência.
3. Consultar [evidências](testes-e-evidencias.md) e [migrations](migrations.md).
4. Planejar a próxima etapa autorizada preservando `atualizarBasico`, histórico
   de senhas e demais pendências. Writers Argon2id ainda exigem aprovação e
   compatibilidade; o fechamento da Etapa 07 não os ativa. Novas operações em
   banco/produção exigem autorização e preflight próprios; preservar a branch
   permanente `v3-homologacao` e as evidências existentes. Não usar a branch
   descartável da Etapa 08 já excluída como origem ou alvo.
5. Preservar decisões 1A/2A/3A/4A/5B/6A/7A e pendências D1–D8. Requisições já
   autenticadas antes do commit podem terminar. Não reduzir versões/reativar sessões
   em rollback. Revisão independente e rehearsal da Etapa 07 já aprovados;
   UI/browser e implantação em produção continuam sem validação.

Não inserir segredos, endereços de conexão, credenciais, tokens reais ou dados
pessoais neste documento. Nenhuma implantação/ação em produção é presumida.
