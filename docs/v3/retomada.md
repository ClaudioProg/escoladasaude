# Retomada operacional

Projeto: **Plataforma Escola da Saúde — V3**.

Branch: `revisao-premium-bloco-1-auth`.

Atualização documental: 2026-10-09.
HEAD versionado e base local da Etapa 09:
`aceb73ac845542255b843e704525084e90654f6c`, fechamento da Etapa 08.
Confirmar HEAD/status ao retomar; Etapa 09 permanece somente no worktree.

Última etapa funcional concluída: **07 — proteção de login/reset concorrentes**.
Etapas **01–06 versionadas na branch**; Etapa 07 com **fechamento local aprovado**.
Etapa 04 documental incorporada em `3247b3d305234414a493e60097d1bae8e0b238d1`;
manutenção do inventário de migrations em `dd0722b54a3837994eda44ae7434179db1ccbca1`.

Revisão independente da Etapa 07 aprovada pelo responsável em **09/10/2026**,
após conferência do código e das evidências PostgreSQL originais e complementares. O fechamento
integra o commit único de implementação, testes e documentos na branch V3.
Pendências futuras permanecem abertas; nenhuma produção foi validada.

Última etapa de infraestrutura fechada: **08 — EXPAND CONCLUÍDO / REHEARSAL E REVISÃO APROVADOS**.
Revisão independente aprovada pelo responsável em **09/10/2026**. Migration
`2026-10-09-auth-quotas-expand.sql`, testes e inventário oficial concluídos:
`auth_quota_evento`, uma linha por emissão, conta e/ou IP HMAC, oito constraints,
três B-trees adicionais e FK imediata RESTRICT.

Validação prévia: **149/149 testes locais**, sintaxe JS 2/2, dry-run oficial e
**57/57 provas PostgreSQL aprovados**. Migration aplicada somente na branch Neon
descartável `br-super-wave-adut7rdn` (`rehearsal-etapa-08-descartavel`), filha do
clone auth-recuperação. Ledger **id 7**, SHA-256
`a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a`.
Tabela final vazia; dados herdados preservados conforme relatório aprovado.
Ver [rehearsal](migrations.md#etapa-08--expand-concluído-rehearsal-aprovado) e
[evidências](testes-e-evidencias.md#etapa-08--expand-concluído--rehearsal-e-revisão-aprovados).

O fechamento documental/Git não repete testes nem executa SQL, migration ou
operações Neon. Branch de rehearsal preservada. Aprovação isolada não significa
implantação em produção; não houve deploy ou merge na main.

Etapa atual: **09 — NÚCLEO LOCAL IMPLEMENTADO / REHEARSAL PENDENTE**.
Decisão **A aprovada**: três finalidades compartilham os limites por conta e IP.
`authQuotaService.js` / `authQuotaIp.js` e testes locais criados; **142/142 focados**,
**829/829 backend completos**, sintaxe **4/4**. Suíte completa executada uma vez.
Sem novas migrations ou import do serviço nas rotas/controller/server.

API e limites em [decisões](decisoes-canonicas.md#etapa-09--núcleo-transacional-local-sem-integração).
Usar executor de `db.tx` READ COMMITTED de escrita, uma emissão por transação;
usuário antes dos advisory locks, clock único após locks. Aceita aguarda commit
externo; erros críticos devem abortar o chamador. Sem retries SMTP contabilizados.

Próximo passo: revisão do núcleo e rehearsal PostgreSQL proporcional sob
nova autorização, conforme [plano](testes-e-evidencias.md#plano-proporcional-de-rehearsal-da-etapa-09).
**Etapa 09 não concluída**, sem concorrência real comprovada. Proxies efetivos,
segredo dedicado/rotação, integração desafio/outbox/HTTP e limpeza operacional
48 h pendentes. Solicitações sem emissão não receberam política. Rate limit
legado e D1–D8 preservados. Sem Neon, SQL real, migration, SMTP real, commit,
push ou deploy na Etapa 09.

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
   Neon descartável e as evidências existentes.
5. Preservar decisões 1A/2A/3A/4A/5B/6A/7A e pendências D1–D8. Requisições já
   autenticadas antes do commit podem terminar. Não reduzir versões/reativar sessões
   em rollback. Revisão independente e rehearsal da Etapa 07 já aprovados;
   UI/browser e implantação em produção continuam sem validação.

Não inserir segredos, endereços de conexão, credenciais, tokens reais ou dados
pessoais neste documento. Nenhuma implantação/ação em produção é presumida.
