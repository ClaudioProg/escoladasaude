# Bloco 1 — estado real

**Etapa 15 — Histórico e mutação atômica de senha encerrada em 16/10/2026**,
após parecer favorável da revisão independente de implementação e rehearsal.
Implementação: `72f3e0b613dab46d5e225804393007d5b374baa0`, branch
`revisao-premium-bloco-1-auth`. **Etapas 01–15 concluídas de 57.
Etapa 16 não iniciada.**
[Fechamento aprovado, evidências e limites](testes-e-evidencias.md#fechamento-aprovado-da-etapa-15).

Registro histórico da implementação para revisão, anterior ao rehearsal e ao
fechamento da Etapa 15:

**Etapa 15 — Histórico e mutação atômica de senha implementados localmente para
revisão**, em **16/10/2026**, base `ea5a9430eac7a441f09622cbc23c5585f52a55cc`,
branch `revisao-premium-bloco-1-auth`. **Etapas 01–14 concluídas de 57.
Etapa 15 aberta; Etapa 16 não iniciada.**

Serviço interno dedicado, sem endpoint ou writer operacional conectado:
[authPasswordMutationService](../../backend/src/services/authPasswordMutationService.js).
Preparação criptográfica fora dos locks prolongados; referência opaca de uso único
e revalidação da conta/versão/revisão da linha e identidades do histórico sob lock.
Autorização explícita por dependência interna confiável, nunca pelo `usuarioId`.
Senha atual + **quatro anteriores conhecidas**; novo Argon2id, rotação do histórico,
incremento único de `auth_version`, revogação de todas as sessões e auditoria
crítica no mesmo executor. Nenhum backfill fictício ou global.

**101/101 dedicados, 501/501 focados e 1.922/1.922 backend completo**, uma única
suíte oficial completa após estabilização, zero falhas/skips/cancelamentos.
Modelo transacional local não comprova locks, constraints ou triggers PostgreSQL
reais. Serviço sem integração operacional; writers legados permanecem pendentes.
Nenhuma migration criada/aplicada, SQL externo, Neon, SMTP, produção, frontend,
merge, deploy ou ativação. Integrações futuras: Etapas 19 e 38; upgrade bcrypt
reservado à Etapa 16, não iniciada. Etapas 01–14, D2 e D5 parcial preservadas.
[API, evidências, histórico das tentativas e limites](testes-e-evidencias.md#etapa-15--histórico-e-mutação-atômica-de-senha).

Registro histórico do fechamento documental da Etapa 14, anterior ao
desenvolvimento autorizado da Etapa 15:

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
Este fechamento define o marco histórico da Etapa 14; o estado atual consta no fechamento da Etapa 15 no início.

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
Os registros anteriores preservam seus estados históricos; o fechamento da Etapa 15 no início define o estado atual.

Atualização documental: 2026-10-15. Branch: `revisao-premium-bloco-1-auth`.
HEAD da implementação da Etapa 11, versionado e publicado na branch:
`d9acb48b2f13ae998bfc688f1834511f0e3771bd`.
Revisão independente aprovada em 14/10/2026, com rehearsal PostgreSQL isolado aprovado.
Sem ativação nas rotas ou implantação em produção.

## FECHADO / versionado na branch

**FATO DO REPOSITÓRIO:** os commits abaixo existem e são ancestrais do HEAD.
"Publicado" neste registro significa incorporado ao histórico da branch V3.
O HEAD da Etapa 09 também foi conferido no remoto; deploy e aplicação em
produção não foram comprovados neste fechamento.
Fechamento de uma fundação não significa integração completa do contrato V3.

| Item fechado | Commit comprovado | Alcance |
| --- | --- | --- |
| Migration de perfis independentes | `d469e7e8a1df22ce5b9c4771c3280455f206b95b` | Expand do catálogo e vínculos; perfil legado continua presente. |
| Migration de sessões/contexto | `d500d90808710bb2aa3b1f112ef39fec62d08576` | Estruturas de sessão e área/contexto; não é cutover JWT. |
| Touch fail-closed | `ba3a169bcbd9fa7e1a2c69136999fda566cf246e` | Validação/locking e escrita limitada; concorrência touch/revoke historicamente provada. |
| Migration expand e-mail/recuperação/senha | `7e47b5d40e64fbfc1601b8b0001a50bfd24e95e8` | Estrutura, sem ativar novos fluxos. |
| PasswordService 1A | `2e51c1fbc5f743be23a6605c9720b8580519b5c2` | Fundação Argon2id/bcrypt, Unicode, limites e erros tipados. |
| Política de senha 1B | `05e31280f66eef7782c9b0d0a27f0cc773568e94` | Blocklist, previsibilidade e dados pessoais. |
| Etapa 01 — auditoria transacional | `2fb3090b95620e90ef16401d466abba42e71f21d` | Executor explícito e falha crítica sem fallback. |
| Etapa 02 — revogação transacional | `48761e60381e380b511dffe623e0b3ca9082f2d3` | `revokeUserSessions` no executor do chamador. |
| Etapa 03 — logs seguros | `ddb6d1e8795c67879ec107fe264b04d52867f665` | Sanitização DB/mailer/auth, inclusive datas com underscore; 46 testes no fechamento. |
| Etapa 04 — baseline documental | `3247b3d305234414a493e60097d1bae8e0b238d1` | Registro do estado, decisões, legado, migrations e evidências do Bloco 1. |
| MANUTENÇÃO MIGRATIONS | `dd0722b54a3837994eda44ae7434179db1ccbca1` | Teste de inventário oficial atualizado para incluir a migration de 2026-10-02; runner e migrations inalterados; suíte backend 402/402 após correção. Não é etapa funcional da V3. |
| ETAPA 05 — LOGIN COM VERIFICADOR MISTO | `1cbff88b5582308f68183fd96774f50256b17987` | Login usa `passwordService/verifyPassword`, aceita bcrypt legado e Argon2id e remove bcrypt direto do controller. Credenciais inválidas usam texto canônico e piso total mínimo de 250 ms; `requiresPasswordChange` bloqueia acesso normal com 403. Sem writer de upgrade bcrypt ou rehash Argon2id; JWT/perfil/sessão/cookie de transição preservados. |
| ETAPA 06 — PONTE DE auth_version NO ACCESS JWT | `665b3de7002748412d0942d124c6e501f1c2ac3d` | Novos access JWTs locais e Google levam auth_version; middleware Bearer compara token × banco em bridge/strict, com configuração obrigatória e fail-closed. Sem writer de versão; sessão/cookie e JWTs especializados preservados; D8 pendente. |

### Alcance comprovado da Etapa 06

- Novos access JWTs emitidos pelo login local e Google carregam a claim
  `auth_version` como número JSON inteiro estrito entre 1 e 2147483647.
- `generateToken` exige `auth_version` válido; `authMiddleware` compara a
  versão efetiva do token com `usuarios.auth_version`.
- `AUTH_VERSION_MODE` aceita somente `bridge` ou `strict`; configuração
  ausente/inválida falha fechado.
- `bridge` aceita token realmente sem claim como versão 1 somente quando
  o banco também está em 1; `strict` rejeita token sem claim.
- Claim presente inválida nunca é tratada como legado. Mismatch retorna
  sessão inválida 401; versão inválida no banco é falha operacional 500.
- Google diferencia versão inválida no banco como erro interno 500.
- Logs usam apenas motivos seguros, sem valores de versão nos caminhos testados.
- JWTs especializados permaneceram fora da ponte; sessão/cookie ficaram intactos.
- Nenhum writer de `auth_version` foi ativado. D8 continua pendente para o
  momento de `bridge → strict`.

## ETAPA 07 — FECHAMENTO LOCAL APROVADO

Implementação local concluída sobre `b84fafdec24dd527a78739e27bf1456b126d3bea`.
Revisão independente aprovada pelo responsável em **09/10/2026**, após conferência
do código e das evidências PostgreSQL originais e complementares. Este registro
integra o commit único de código, testes e quatro documentos na branch V3.

- Decisões 1A, 2A, 3A, 4A, 5B, 6A e 7A preservadas; detalhes nos
  [contratos canônicos](decisoes-canonicas.md#decisão-canônica--etapa-07-loginreset).
- `createSession` exige a versão do mesmo snapshot do hash verificado e a
  compara sob `FOR UPDATE` antes de efeitos. Login perdedor retorna o 401 canônico
  com piso de 250 ms, sem publicar credenciais/sessão.
- Reset JWT de uma hora exige `auth_version` estrito, inclusive no consumo.
  Reset bem-sucedido incrementa N → N+1, revoga todas as sessões e audita
  criticamente no mesmo executor; sucesso somente após commit. Replay de tokens
  N e tokens antigos sem claim são rejeitados.
- Validação final prévia: **193/193 testes focados** e **670/670 testes completos
  do backend** aprovados. Não foram reexecutados no fechamento documental.
- Rehearsal original: **R1–R11 operacionais aprovados**; deadlock real `40P01`
  reproduzido no R12 operacional. `changeActiveArea` corrigido para a ordem
  **usuário → sessão → contexto**, alinhada ao reset.
- **Sete provas PostgreSQL complementares aprovadas, sem deadlocks**.
  O conjunto cobre **todos os 13 cenários canônicos**, com
  [correspondência ao harness](testes-e-evidencias.md#numeração-canônica-e-correspondência-operacional).
  R13 operacional permanece pré-checagem histórica, sem prova de fechamento
  posterior ao deadlock; R13 canônico vem da prova complementar de senha nova.
- Writer permanece bcrypt custo 10/política legada. Histórico não integrado;
  reutilização possível. `atualizarBasico`, D1–D8 e demais pendências continuam abertos.
- Limites: PostgreSQL em branch Neon descartável, com identidades sintéticas;
  sem teste de UI/browser, SMTP real ou implantação em produção. O fechamento
  documental não executa testes, PostgreSQL, migrations ou deploy.

## ETAPA 08 — EXPAND CONCLUÍDO / REHEARSAL E REVISÃO APROVADOS

Implementação e rehearsal isolado concluídos em 09/10/2026. Revisão independente
aprovada pelo responsável em **09/10/2026**, após o relatório do rehearsal.
A [migration](../../backend/db/migrations/2026-10-09-auth-quotas-expand.sql)
define `public.auth_quota_evento`: uma linha por emissão, PK `emissao_id` UUID,
finalidade, conta opcional e par HMAC/key_id opcional, permitindo conta e IP juntos.
Oito constraints e três B-trees adicionais; FK imediata RESTRICT para `usuarios(id)`.
Sem backfill, alteração de objetos legados, writer, serviço de quotas ou limpeza.

- **149/149 testes locais aprovados**, sintaxe JS 2/2 e dry-run oficial aprovados.
  **57/57 provas PostgreSQL aprovadas**, sem erros PostgreSQL inesperados.
  Nenhum teste reexecutado neste fechamento documental/Git.
- Na Etapa 08, migration aplicada **somente** na branch Neon descartável
  `br-super-wave-adut7rdn` (`rehearsal-etapa-08-descartavel`), filha do clone
  auth-recuperação. Ledger **id 7**, SHA-256
  `a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a`.
  Tabela final **vazia (0 linhas)**; segunda execução oficial fez skip.
  Essa branch descartável já foi excluída; o histórico do ensaio permanece.
  A aplicação posterior em `v3-homologacao` consta na Etapa 09 abaixo.
- Conforme o relatório aprovado, dados das **89 tabelas herdadas / 54.394 linhas**
  e os seis registros anteriores do ledger preservados; catálogo legado também
  preservado. Limites e método em [evidências](testes-e-evidencias.md#etapa-08--expand-concluído--rehearsal-e-revisão-aprovados).
- Naquele fechamento, o núcleo de quotas/HMAC e a Etapa 09 ainda eram pendentes;
  agora estão implementados e aprovados no alcance abaixo. Decisão A resolve
  a composição de finalidades. Integração, falhas/solicitações sem emissão,
  origem confiável do IP, rotação operacional HMAC e limpeza de 48 horas
  continuam abertas; rate limit legado e D1–D8 preservados.
- Aprovação do rehearsal isolado não comprova implantação/funcionamento em produção.
  Este fechamento não executa SQL, migration, operações Neon, SMTP ou deploy.

## ETAPA 09 — NÚCLEO VERSIONADO / REHEARSAL E REVISÃO APROVADOS

Fechamento aprovado em **13/10/2026**, após revisão independente do código em
`a6f49e6c15157f92b3b06d203213a27b7c454182`, relatório do rehearsal e verificações
independentes no Neon, conforme instrução do responsável.

Decisão funcional **A aprovada**: confirmação, alteração de e-mail e recuperação
de senha compartilham os mesmos limites por conta e IP. Núcleo em
[authQuotaService](../../backend/src/services/authQuotaService.js), normalização/
HMAC em [authQuotaIp](../../backend/src/services/authQuotaIp.js), sem nova migration.

- **142/142 testes focados** e **829/829 testes completos do backend** aprovados;
  suíte completa executada uma vez após as alterações de código. Sintaxe JS 4/4.
- Executor explícito `db.tx`, `READ COMMITTED` de escrita e savepoint; usuário
  primeiro, advisory locks transacionais ordenados por sujeito/UUID. Clock único
  do banco após locks, com microssegundos preservados; check + INSERT na mesma tx.
- Uma emissão por executor/transação; aceita fica pendente até commit do chamador.
  Negação não grava linha; replay idêntico não conta novamente; divergência falha
  fechado. Sem retries automáticos, associação desafio/outbox ou contabilização SMTP.
- HMAC-SHA-256 com segredo dedicado injetado, versões explícitas e guarda contra
  omissão de versões presentes na janela IP; sem leitura de headers/ambiente,
  configuração de segredo em produção ou rotação automática.
- **129/129 provas finais do rehearsal aprovadas**, incluindo **107 da Etapa 09**
  (99 com SQL/transações reais e oito validações JavaScript). Concorrência real,
  locks, janelas, replay, rollback e HMAC comprovados no alcance do ensaio.
- Histórico: **141 checagens executadas, 137 aprovações e quatro falhas do harness
  corrigidas**. Dois erros PostgreSQL inesperados na inicialização abortada antes
  do serviço, sem eventos; **nenhum inesperado na execução corrigida**.
- Migration 08 aplicada uma única vez em `v3-homologacao`
  (`br-round-union-adok19ir`), ledger **id 7**, SHA-256
  `a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a`;
  segunda execução fez skip. Tabela de quotas **vazia** e **89 tabelas / 54.394
  linhas herdadas preservadas**. Catálogo: **1.717 atributos ativos + dez
  descartados = 1.727 entradas**. Branch permanente preservada.
- Limites: adaptador com cliente PostgreSQL real, sem integração definitiva HTTP/
  `db.tx`; quatro emissões simultâneas por cenário, sem estresse prolongado. Custo
  da guarda HMAC ainda sujeito à avaliação operacional.
  [Detalhes e limitações](testes-e-evidencias.md#rehearsal-postgresql-da-etapa-09-aprovado).
- Proxy efetivo, configuração/rotação operacional HMAC, integração e limpeza de
  48 horas pendentes. Solicitações sem emissão não receberam política.
- Sem ativação HTTP, SMTP, limpeza, integração com outbox ou produção. Rotas,
  rate limit legado, frontend e D1–D8 preservados. Este fechamento somente
  documental/Git não repete testes/rehearsal nem executa SQL, migration, operações
  Neon, deploy, merge ou Etapa 10.

## ETAPA 10 — EXPAND CONCLUÍDO / REHEARSAL E REVISÃO APROVADOS

Implementação em `7bb864245409155a9130756911ce531b6b5454ca`, sobre
`bfb3e314933e3710897379a6e1c903d614667826`. **Revisão independente aprovada em
13/10/2026**, conforme instrução do responsável e relatório técnico aprovado.
[Migration](../../backend/db/migrations/2026-10-13-auth-outbox-expand.sql) preservada;
fechamento exclusivamente documental/Git, sem backfill ou alteração do legado.

- **30/30 testes dedicados, 162/162 focados e 859/859 completos**, aprovados
  anteriormente. Nenhum teste reexecutado neste fechamento.
- **186/186 provas finais do rehearsal**, incluindo **161 PostgreSQL**;
  **112 erros esperados e zero inesperados**, sem falha do instrumento ou repetição.
- Aplicação exclusivamente em **`v3-homologacao` (`br-round-union-adok19ir`)**,
  ledger **id 8**, SHA-256 `2be1525aa0bf1064de5d594ad026e5cc0c0fb533c0fcaedcf42032f489d52c0a`.
  DDL, função, triggers e ledger na transação **6100996**; segunda execução com skip.
- Estrutura real aprovada: **19 colunas, 13 constraints, sete índices** (PK + seis
  adicionais), uma função PL/pgSQL invoker, um trigger de UPDATE e oito internos
  de FK novos. Nenhum trigger herdado alterado.
- Integridade referencial, unicidade por desafio, CASCADE, savepoints/rollback,
  identidade e destinatário imutáveis, estados, leases, tentativas e envelope
  estrutural comprovados. Remoção integral do envelope obrigatória em `sent`.
- Duas conexões selecionaram candidatos diferentes com `FOR UPDATE SKIP LOCKED`;
  omissão de bloqueados e liberação por commit/rollback provadas. **Suporte
  estrutural à seleção concorrente**, sem claim/ack de worker ou fencing integral.
- Outbox e quotas **vazias** ao final; **90 tabelas / 54.395 linhas herdadas
  preservadas**, sete registros anteriores do ledger intactos. Homologação
  permanente preservada. [Evidências e limites](testes-e-evidencias.md#etapa-10--outbox-expand--rehearsal-e-revisão-aprovados).
- No fechamento da Etapa 10, criptografia operacional/enqueue e Etapas 11/12
  estavam pendentes. A Etapa 11 foi aprovada posteriormente, conforme seção abaixo.
  Naquele fechamento, worker, SMTP e fencing integral ainda estavam pendentes;
  o escopo da Etapa 12 foi aprovado posteriormente, conforme seção abaixo.
  Exactly-once não é garantido; limpeza operacional e produção permanecem
  pendentes. D1–D8 e Etapas 01–09 preservados.
- Este fechamento não executa SQL, operações Neon, SMTP, deploy, merge ou testes.

**Etapas 01–15 concluídas de 57. Etapa 16 não iniciada.**
Contagem das microetapas do roteiro técnico.
Essa contagem não equivale ao avanço ponderado do trabalho; não estabelece
percentual global, esforço restante ou estimativa de prazo.

## ETAPA 11 — CRIPTOGRAFIA E ENQUEUE / REHEARSAL E REVISÃO APROVADOS

Implementação em `d9acb48b2f13ae998bfc688f1834511f0e3771bd`, de **13/10/2026**,
base `a745a9d18c56ff50941a7f01131d32d1cbf21e5e`. **Etapa encerrada em 14/10/2026**,
com revisão independente aprovada pelo responsável após o rehearsal consolidado
e a conferência independente no Neon. Fechamento atual exclusivamente documental/Git.

- [Criptografia](../../backend/src/services/authOutboxCrypto.js): `node:crypto`,
  AES-256-GCM, chaves externas de 32 bytes, nonce aleatório 12, tag 16, AAD JSON
  determinística/versionada vinculada a mensagem/desafio/finalidade/destinatário.
  Configuração explícita de até 16 key_ids; leitura de chaves anteriores somente
  quando configuradas. Sem JWT_SECRET, env, defaults ou chaves HMAC reutilizadas.
- [Enqueue](../../backend/src/services/authEnqueueService.js): executor de `db.tx`
  READ COMMITTED de escrita, uma emissão por executor, usuário antes dos advisory
  locks ordenados das quotas; mesmo cliente e relógio PostgreSQL com microssegundos.
  Mesmo UUID identifica quota/desafio/mensagem; 24 h para e-mail e 30 min para reset.
- Token opaco CSPRNG de 256 bits, base64url 43 caracteres; desafio guarda apenas
  SHA-256 e outbox apenas envelope. Auditoria crítica obrigatória com IDs/finalidade,
  sem conteúdo, IP, destinatário, token, hash ou chave nos parâmetros de auditoria.
  Queries do núcleo usam raw client, evitando logging de parâmetros da facade.
- Invalidação do desafio aberto anterior no mesmo agregado, persistência conjunta
  e rollback por savepoint/erro propagado ao chamador. Negação não cria mensagem;
  replay não gera token/cobrança/mensagem/auditoria nova; divergência falha fechado.
  Resultado normal sempre `{ status: "processada" }`, provisório até commit.
- Limite local: usuários existentes, não excluídos e sem cadastro pendente;
  confirmação do endereço oficial ainda não confirmado, alteração/recuperação
  somente no subconjunto com e-mail confirmado e versões esperadas atuais.
  D1/D4, criação/retomada de cadastro, autorização/reautenticação/reativação e HTTP
  não foram implementados ou decididos; este recorte não cria política canônica.
- **47/47 criptografia + 87/87 enqueue = 134/134 novos**, **290/290 focados** com
  quotas/auditoria, **993/993 completos** (uma execução). JS 4/4 e gramática de
  24 consultas PG16 aprovados; testes locais de persistência/locks são simulados,
  distintos do rehearsal real aprovado. Nenhum teste reexecutado neste fechamento.
- **37/37 provas únicas PostgreSQL aprovadas** em **38 tentativas**; uma falha
  histórica do observador corrigida, oito erros esperados e zero inesperados.
  Dez verificações do preflight não recontadas nas 37; seis controles complementares
  separados. Três finalidades, criptografia real, atomicidade, replay, concorrência
  e rollback aprovados no alcance documentado. Conexões distintas, `pg_backend_pid()`,
  `pg_stat_activity` e `pg_blocking_pids` comprovaram esperas e bloqueios reais.
- Duas limpezas transacionais autorizadas, trigger de proteção do perfil-base
  restaurado antes do commit, zero resíduos sintéticos. Sequência da auditoria
  **349 → 358 → 364**, sem reinicialização. Conferência independente informada:
  **2.668 usuários / 2.774 vínculos**, outbox/quotas/desafios vazios, auditorias
  sintéticas removidas, trigger original habilitado, ledger com oito registros,
  **89 tabelas originais / 54.394 linhas preservadas** e zero divergências de
  conteúdo após excluir os registros das migrations 08 e 10; `v3-homologacao` preservada.
- Retenção futura não pode
  desmembrar as identidades sem contrato próprio: quota sem mensagem, ou mensagem
  sem quota retida, falham fechado; sem reconstrução, emissão ou cobrança nova.
  Colisões detectáveis de nonce/hash são críticas, sem retry; não há unicidade
  histórica de nonce após remoção de envelope.
- Migrations, serviços 08–10, db.tx, auditoria, rotas/controllers/server, frontend
  e Vercel preservados. O núcleo não implementa worker SMTP, retries, claim/ack,
  ativação HTTP, integrações públicas ou exactly-once; limpeza operacional e
  fencing integral pendentes. Sem SQL/Neon, testes, SMTP, merge ou deploy neste
  fechamento da Etapa 11, que não iniciou a Etapa 12. D1–D8 e demais pendências
  intactos; implementação atual da Etapa 12 registrada abaixo.
  [Evidências e limites](testes-e-evidencias.md#etapa-11--criptografia-e-enqueue--rehearsal-e-revisão-aprovados).

Implantação aprovada: **uma única plataforma pública no endereço atual**, com
modernização por blocos e produção operacional durante a transição. Homologação
e produção separadas; substituir a autenticação somente após validação integral
das integrações essenciais, plano de implantação/reversão e autorização expressa.
O fechamento do Bloco 1 não autoriza implantação automática ou duas plataformas
públicas. [Decisão canônica](decisoes-canonicas.md#decisão-canônica--implantação-progressiva-na-plataforma-pública-atual).

## ETAPA 12 — WORKER E RETRIES / ENCERRADA

Implementação inicial `bf6155bccba4657ab7350692ecc2273945b6add4`; correção de flags/dry-run
`40ab140fa23f4cf879ac00d867b0def3ef5deff5`; correção final de cancelamento/IPC
`db095b6f325c41f093c79b271670785e94eff848`, aprovada pela revisão independente.
**Etapa 12 encerrada em 15/10/2026**, sem defeitos materiais remanescentes
identificados no escopo. Decisões operacionais aprovadas pelo
responsável na solicitação: lease 180 s, polling 30 s, limite SMTP 120 s, seis
horários absolutos por finalidade e remoção integral do envelope terminal.

- Worker com PostgreSQL compartilhado, claim exclusivo e `SKIP LOCKED`; locks
  usuário → desafio → outbox, sem cobrar novas quotas em retries. Uma mensagem
  por processamento, até 32 candidatos sem locks na descoberta. UUID novo em
  toda posse/reclaim; tentativas incrementadas no claim, inclusive interrompidos.
- Revalidação do desafio/conta/destinatário e versão persistida por finalidade
  antes de enviar. Crypto/AAD e hash do token conferidos. Ack compara estado,
  UUID e validade do lease no próprio UPDATE; obsoleto não altera estado.
- SMTP fora da transação, subprocesso com timeouts por fase e kill aos 115 s;
  confirmação somente após saída. Falha de término bloqueia novos envios, sem
  confirmação presumida. `sent` significa aceitação SMTP, não entrega/leitura;
  incerteza/perda de ack pode ocasionar duplicidade externa, sem exactly-once.
- Retry absoluto, sem rajadas e sem ultrapassar TTL. Permanente/esgotamento
  terminam `failed`; `sent` e `failed` apagam ciphertext/nonce/tag/key_id. Histórico,
  identidades e auditorias retidos; limpeza de quotas de 48 h inalterada.
- Job no lifecycle do backend, **desabilitado por padrão**; sem efeitos quando
  desabilitado/dry-run. **Consumidor V3 ausente: ativação real bloqueada antes
  de claim**, sem confiar em flag de prontidão ou apontar tokens para JWT legado.
- Validação inicial histórica: **118/118 novos, 435/435 focados, 1.111/1.111 completos** (uma execução), **9/9 JS**.
  Simulações de banco/SMTP e criptografia sintética real, sem prova PostgreSQL/SMTP
  reais naquela rodada. [Evidências e roteiro](testes-e-evidencias.md#etapa-12--worker-local--revisão-e-rehearsal-pendentes).

Migrations, D1–D8, decisões anteriores, rotas públicas/frontend, jobs existentes,
quotas e Vercel preservados. Uma plataforma pública no endereço atual, modernizada
por blocos, com produção operacional e separada da homologação. Integrações,
plano de implantação/reversão e autorização expressa continuam gates do cutover.
Fechamento aprovado: **1.529/1.529 backend**, **670/670 focados**, **29/29 regressões**,
**4/4 subprocessos Node reais**; PostgreSQL **44/44 provas únicas**, com três falhas
históricas do instrumento corrigidas/preservadas. Zero resíduos sintéticos no Neon,
trigger restaurado, ledger e dados herdados preservados. SMTP físico: **52 verificações**,
kill em **115,072 s**, resolução em **115,078 s**, dentro de **120 s**.
TLS positivo pelo adaptador ainda exige prova física antes da futura ativação
SMTP real, sem reabrir automaticamente toda a Etapa 12.
[Fechamento e rastreabilidade](testes-e-evidencias.md#fechamento-aprovado-da-etapa-12).
**Etapas 01–12 concluídas de 57. Etapa 13 não iniciada.**

## Etapa 15 — histórico e mutação atômica de senha

**Encerrada em 16/10/2026**, após revisão independente favorável da implementação
`72f3e0b613dab46d5e225804393007d5b374baa0` e do rehearsal PostgreSQL **51/51**.
Desenvolvida sobre `ea5a9430eac7a441f09622cbc23c5585f52a55cc`, conforme registro
histórico acima. **Etapas 01–15 concluídas de 57. Etapa 16 não iniciada**.
Serviço interno sem montagem HTTP e sem integração dos writers existentes.
Senha atual em `usuarios.senha`; até quatro
hashes anteriores em `auth_senha_historico`, em ordem numérica decrescente do
`id` das alterações confirmadas. Só arquiva o hash que deixou de ser atual;
primeira alteração com histórico vazio grava uma entrada, sem inventar anteriores.
A quinta senha anterior sai da janela; nada prova senhas nunca registradas.

`prepare({ usuarioId, expectedAuthVersion, newPassword })` lê conta e histórico em
transação curta e executa a política/hash/verificações canônicas fora dos locks.
Contexto pessoal exclusivamente dos campos atuais do servidor (`nome`, `cpf`,
`email`, `celular`, `data_nascimento`); cliente não pode fornecer contexto.
`mutate(preparation[, executor])` revalida os snapshots sob `FOR UPDATE`, incluindo
`xmin` da conta e de cada entrada histórica, IDs, hashes e versão. Mudança/ABA ou
divergência exigem nova preparação, sem retry automático. Referência opaca,
privada à instância e consumida na primeira tentativa; não expõe senha/hash.

Factory exige `authorize` confiável, configurado pelo servidor para a operação
futura: fase `prepare` apenas verifica autorização, sem consumi-la ou escrever;
fase `mutate` deve demonstrá-la novamente no executor da mutação. Sem autorizador
padrão, booleano de cliente ou inferência por ID. A implementação não comprova
recuperação/troca autenticada por si só, nem consome a reautenticação da Etapa 14.

Após revalidação: troca para Argon2id, incrementa versão uma vez, chama
`revokeUserSessions(id, "password_changed", null, executor)`, insere o hash
anterior, mantém só quatro entradas e registra auditoria crítica com ação
`alterar`, módulo `auth`, entidade `usuarios`, severidade `info` e detalhe fixo.
Sem senha, hashes, prova, cookie/JWT, request cru ou dados pessoais na auditoria.
Hash atual/novo e histórico usam o client raw da mesma transação para evitar
parâmetros sensíveis na fachada de logs. Versão inválida/esgotada falha fechada.

Sem executor, mutação usa `db.tx`; com executor, exige client transacional
read committed/read-write, usa o mesmo executor e savepoint, sem transação
independente ou commit próprio. Resultado `staged` só informa efeitos pendentes;
o chamador deve propagar erros e fazer rollback integral, inclusive se houver
falha no commit externo. `committed` só retorna após commit da transação própria.
Triggers D2/reautenticação existentes e a rejeição de JWTs de versão superada
permanecem nos contratos anteriores; nenhum mecanismo equivalente foi criado.

Validação local: **101/101 dedicados, 501/501 focados, 1.922/1.922 completos**,
**3/3 sintaxe JS**. Histórico conhecido/rotação, bcrypt/Argon2id, NFKC, 72 bytes,
dados pessoais, snapshots/ABA, concorrência modelada, revogação e rollback
cobertos. Rehearsal PostgreSQL aprovado: **51/51 provas funcionais únicas**,
com concorrência física, atomicidade, invalidações e rollback comprovados.
[Fechamento, incidentes e preservação](testes-e-evidencias.md#fechamento-aprovado-da-etapa-15).
Nenhuma migration/backfill ou integração operacional. `atualizarBasico`,
`redefinirSenha`, login/Google, cadastro e emissão/consumo de recuperação intactos.
Etapa 16 (upgrade bcrypt) não iniciada; consumo pela recuperação na Etapa 19 e
troca autenticada/fechamento dos writers genéricos na Etapa 38 permanecem futuros.
O fechamento não autoriza alterar controllers legados. D5 parcial não é ampliada;
`AUTH_REAUTH_ENABLED` permanece desabilitada por padrão.

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
abaixo referem-se àquele marco histórico. O estado atual está na implementação da
Etapa 15 no início deste documento.

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

## PARCIAL

- Login local já usa o verificador misto e cria sessão/cookie de transição.
  `auth_version` já governa os access JWTs emitidos pelos fluxos local e Google
  e validados pelo middleware Bearer; access JWT/Bearer segue transitório,
  com perfil único legado ativo.
- Tokens antigos realmente sem claim são compatíveis somente em `bridge`,
  sob a regra de versão inicial 1 no token e no banco. D8 determina o cutover
  `bridge → strict`; isso não comprova configuração nem uso em produção.
- Writer automático bcrypt → Argon2id e rehash Argon2id ainda não estão ativos.
  O fluxo seguro de troca obrigatória precisa ser implementado antes do cutover;
  a proteção login/reset da Etapa 07 tem implementação e rehearsal aprovados localmente.
- Middleware de sessão publica `{ id, perfis, areaAtiva, sessionId }`; isso não
  prova uso desse contrato em todas as rotas/clientes.
- Campos `auth_version`/`email_version` e desafios existem no SQL expand.
  A implementação local da Etapa 07 conecta `redefinirSenha` ao incremento de
  `auth_version` e à revogação transacional, com rehearsal e revisão aprovados.
  `atualizarBasico` ainda altera senha sem incremento/revogação; outros writers
  de senha/e-mail e operações críticas continuam pendentes.
- Revogação e auditoria aceitam o mesmo executor; fluxos críticos futuros ainda
  precisam compor sua transação e consumir desafios/histórico/outbox.
- Confirmação institucional e recuperação V3 têm estrutura; não estão demonstradas
  como serviços operacionais integrados. Histórico/mutação têm serviço interno na
  Etapa 15, ainda sem consumidores ou writers operacionais centralizados.

## LEGADO ATIVO

**FATO DO REPOSITÓRIO:** reset por e-mail com JWT de uma hora; bcrypt em outros
fluxos legados; alterações diretas de e-mail/senha; JWT de acesso/localStorage;
identidade de perfil único; Google localizado por e-mail; anonimização imediata
na confirmação de exclusão; limitadores em memória.

Fontes e condições de retirada estão em [legado](legado.md). JWT não foi removido;
a recuperação nova não substituiu a antiga. Nenhuma conclusão sobre produção é
deduzida da presença desses arquivos na branch.

## A FAZER

- **Etapa 07: fechamento local aprovado em 09/10/2026**, com publicação Git
  restrita à branch V3. UI/browser e implantação em produção exigem etapa própria;
  publicação da branch não comprova produção.
- Etapa 15 encerrada: implementação e rehearsal aprovados, sem ativação
  operacional. Etapa 16 (upgrade bcrypt) não iniciada; exige autorização própria.
- Integrar writers que incrementam `auth_version`, inclusive senha/e-mail,
  à política/histórico/auditoria/revogação.
- Implementar upgrade bcrypt → Argon2id persistente e rehash Argon2id.
- Implementar confirmação institucional e recuperação com consumo único.
- Comprovar fisicamente TLS positivo pelo adaptador antes da futura ativação SMTP
  real, sem reabertura automática de toda a Etapa 12; integrar consumidores HTTP
  dos tokens V3 e manter envio real bloqueado até os gates de ativação.
- Integração pública dos núcleos aprovados
  de criptografia/enqueue e quotas PostgreSQL,
  retenção/limpeza e integração crítica.
- Integrar os fluxos e consumidores necessários à futura ativação da barreira;
  Etapa 13 tecnicamente encerrada, D2 aprovada e flag operacional desabilitada.
- Integrar operacionalmente a reautenticação e seus consumidores sensíveis em etapa
  futura autorizada; Etapa 14 encerrada, D5 parcial e flag desabilitada. Definir
  política de tentativas, retenção e proteção IP distribuída antes de ativar.
- Fechar D1, D3, D4, D6–D8 e parâmetros restantes D5; implementar
  MFA/CSRF/regularização e permissões conforme aprovação.
- Preparar o cutover bridge → strict conforme D8, com preflight de produção.

Etapas 01–15 estão concluídas e versionadas na branch; as Etapas 10–15 têm
rehearsal e revisão aprovados. Nenhum desses estados comprova produção.
Ver [migrations](migrations.md), [evidências](testes-e-evidencias.md)
e [retomada](retomada.md).
