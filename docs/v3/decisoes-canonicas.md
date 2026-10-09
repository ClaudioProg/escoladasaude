# Decisões canônicas da V3

Referência: baseline de 2026-10-05, código em
`ddb6d1e8795c67879ec107fe264b04d52867f665`. Fonte de aprovação: instrução explícita
das Etapas 04/05/06/07/08/09 e decisões anteriores fornecidas pelo responsável. As seções de
decisão descrevem o contrato alvo; consultar o [status](bloco-1-status.md) para
saber o que está implementado. Recomendações não têm autoridade de decisão.

## DECISÃO CANÔNICA — identidade e perfis

Perfis globais independentes, sem herança:

`usuario`, `institucional`, `organizador`, `administrador`, `gestor`, `diagnostico`,
`avaliador`, `relator`, `cai_administrador`, `cai_coordenador`.

`usuario` é obrigatório em conta ativa. Somente `gestor` concede/remove perfis
globais; o último gestor é protegido. A matriz de permissões continua em D6.

Contrato HTTP final:

```js
req.user = { id, perfis, areaAtiva, sessionId }
```

Não são autoridade final: `req.userId`, `req.perfil`, `req.user.perfil`, CSV,
aliases, fallbacks ou admin bypass. O contrato já existe no middleware de sessão
isolado; o legado ainda publica identidade de perfil único.

## DECISÃO CANÔNICA — sessões

**DECISÃO CANÔNICA / CONTRATO ALVO:**

- Sem lembrar: expira após 30 minutos de inatividade e não deve sobreviver ao
  encerramento do navegador.
- Com lembrar: sessão persistente, com máximo absoluto de 30 dias.
- Máximo de 5 sessões ATIVAS por usuário.
- Gestão e revogação de sessões no servidor (server-side).
- Touch com no máximo uma escrita por 60 segundos, sem heartbeat.
- Mudanças críticas revogam sessões; retenção de sessões de 90 dias.
- Cookie de produção: `__Host-escola_saude_session`, com `HttpOnly`, `Secure`,
  `SameSite=Lax`, `Path=/` e sem Domain.
- Cookie de desenvolvimento: `escola_saude_session`, com `Secure=false`.

**IMPLEMENTAÇÃO ATUAL:** o [serviço de sessões](../../backend/src/services/authSessionService.js) e o
[middleware](../../backend/src/auth/authSessionMiddleware.js) implementam o núcleo.
Retenção e integração de todas as mudanças críticas não são comprovadas apenas
pela existência desses módulos; o núcleo de sessões não substituiu todo o legado.

## DECISÃO CANÔNICA — e-mail

**DECISÃO CANÔNICA / CONTRATO ALVO:**

- `usuarios.email` continua sendo a fonte operacional oficial única.
- Todos os usuários, inclusive legados, precisam confirmação de e-mail da própria
  plataforma antes do acesso normal V3; Google `email_verified` não a substitui.
- E-mail candidato permanece somente na estrutura temporária
  `auth_email_confirmacao`, sem se tornar segunda fonte operacional de verdade.
- Finalidades: `confirmacao` e `alteracao`.
- O e-mail antigo continua oficial até a confirmação do candidato.
- Cadastro novo não confirmado permanece por 30 dias.
- Desafios permanecem por 90 dias, com exceção do cadastro nunca ativado,
  removível aos 30 dias quando elegível e sem histórico operacional.

Após confirmação do novo e-mail:

- Novo e-mail torna-se oficial em `usuarios.email`.
- Revogar sessões.
- Incrementar `auth_version` e `email_version`.
- Invalidar desafios de recuperação abertos.
- Invalidar desafios de confirmação abertos incompatíveis.
- Cancelar exclusão pendente.
- Exigir novo login.
- Notificar o endereço anterior.
- Registrar auditoria.

**IMPLEMENTAÇÃO ATUAL:** confirmação e troca de e-mail V3 ainda precisam integração
operacional; esse fluxo não substituiu todo o legado.

Provas de retomada, colisões e fluxos assistidos permanecem em D1/D4.

## DECISÃO CANÔNICA — recuperação

Entrada pública por CPF; resposta genérica; token opaco; somente hash persistido
no desafio; validade de 30 minutos; uso único; somente pedido mais recente aberto.
Sucesso revoga sessões e incrementa `auth_version`. A entrega durável pode manter
o segredo exclusivamente criptografado na outbox até o envio.

Esse contrato ainda não substituiu o reset JWT legado. Elegibilidade de conta
sem e-mail confirmado e reativação assistida permanecem em D4.

Para desafios no frontend futuro: receber pelo fragmento da URL, ler uma vez,
manter somente em memória e remover imediatamente da barra com
`history.replaceState`. Não persistir em localStorage/sessionStorage nem logar.

## DECISÃO CANÔNICA — ponte JWT

**DECISÃO CANÔNICA:** access JWT novo de login local/Google carrega o claim exato
`auth_version`, número JSON inteiro de 1 a 2147483647, sem coerção. O emissor exige
a versão atual lida de `usuarios.auth_version`; não infere a versão inicial um.
Incrementar a versão do usuário invalida os access JWTs de versões anteriores.

`AUTH_VERSION_MODE` é obrigatório no verificador Bearer, com valores exatos
`bridge` ou `strict`. Ausência ou valor inválido falha fechado em todos os
ambientes, sem fallback por `NODE_ENV`. Em `bridge`, propriedade realmente
ausente equivale à versão inicial um; em `strict`, ausência é rejeitada.
Propriedade presente inválida nunca é interpretada como JWT legado.

Claim inválido, ausência em strict e divergência token/banco retornam 401:
`AUTH-401-SESSAO-INVALIDA`, `erro: "Sessão inválida."`,
`autenticado: false`, `sessionExpired: true`, com `requestId` preservado.
Não se adiciona `message` ou informação de versão. Versão inválida no banco é
falha operacional 500; no middleware, assim como configuração de modo inválida,
usa `AUTH-500-FALHA-VALIDACAO-SESSAO` e `erro: "Falha ao validar sessão."`.
Login local usa `AUTH-500-LOGIN` e o texto genérico existente; Google usa
`AUTH-GOOGLE-500-FALHA-INTERNA` e
`message: "Falha interna na autenticação com Google."`.
Logs registram somente motivos fixos seguros, sem números de versão ou segredos.

**IMPLEMENTAÇÃO DA ETAPA 06:** emissão e comparação de versão na família de
access JWT, usando as consultas existentes, com identidade/perfil legado
preservados. Esta etapa somente lê, emite claim e compara; não incrementa versões
nem integra writers críticos. Na Etapa 06, reset JWT legado ainda não invalidava
access JWT por versão. Na implementação local da Etapa 07, o reset passa a
incrementar a versão e usa validação própria, sem fallback bridge. JWT de
reset/presença, ID token Google e sessão/cookie não usam o verificador da ponte.
A migration expand precisa estar comprovada no alvo antes do código que
seleciona a coluna; esta implementação local não comprova rollout em produção.
Rollback para middleware antigo ignora o claim extra e perde a invalidação por
versão.

**PENDÊNCIA D8:** coortes, prazo e janela operacional para passar de `bridge` a
`strict` permanecem pendentes. Bearer permanece no cutover controlado; nenhuma
data ou retirada de compatibilidade foi decidida nesta etapa.

## DECISÃO CANÔNICA — Etapa 07 login/reset

**IMPLEMENTAÇÃO LOCAL CONCLUÍDA / FECHAMENTO LOCAL APROVADO** em 09/10/2026,
sobre `b84fafdec24dd527a78739e27bf1456b126d3bea`. Revisão independente aprovada
pelo responsável após conferir código e evidências PostgreSQL originais e
complementares. As decisões aprovadas permanecem iguais:

| Decisão | Contrato aprovado e implementado localmente |
| --- | --- |
| 1A | `createSession` exige `expectedAuthVersion` number inteiro 1..2147483647 sem coerção; compara com DB sob o lock de usuário já existente, antes de limite/contexto/INSERT. O login passa a versão do mesmo snapshot do hash verificado, sem reler uma versão nova. |
| 2A | Divergência na criação de sessão retorna exatamente o 401 canônico de credenciais inválidas da Etapa 05, com piso total de 250 ms; sem JWT/cookie/notificação/sessão publicada, sem next e sem compensação de sessão inexistente. Outros erros continuam operacionais. |
| 3A | `redefinirSenha` mantém `bcrypt.hash(novaSenha, 10)` e a política legada; hash antes da transação/lock. Convergência passwordService/Argon2id fica para etapa própria. |
| 4A | Sem integração de `auth_senha_historico`; reutilização de senha ainda possível até centralização/histórico. |
| 5B | JWT `pwd-reset` de 1h, issuer/audience preservados, com `sub: String(id)` e claim exato `auth_version` inteiro estrito. Emissão lê id+versão; versão DB inválida não emite token/e-mail e mantém 200 genérico. Consumo exige a claim e compara sob lock; não há fallback para JWT antigo sem versão. |
| 6A | Escopo login local × `redefinirSenha`. `atualizarBasico` ainda pode escrever senha sem `auth_version++`/revogação. Cadastro, exclusão e demais writers não convergem nesta etapa. |
| 7A | Reset distingue 200 sucesso, 400 token/estado inválido genérico e 500 operacional conforme os contratos abaixo; sem revelar a condição interna. |

`createSession` lança `AUTH_SESSION_EXPECTED_AUTH_VERSION_INVALID` para
contrato inválido, `AUTH_SESSION_DB_AUTH_VERSION_INVALID` para versão DB inválida
e `AUTH_SESSION_CREDENTIAL_STATE_CHANGED` para mismatch sob lock.

No reset, `db.tx` bloqueia exatamente um usuário por `FOR UPDATE`, exige conta
ativa e versão atual igual à do token, e atualiza senha + `auth_version + 1` no
mesmo UPDATE, exigindo exatamente uma linha. Revoga todas as sessões com
`revokeUserSessions(id, "password_changed", null, tx)`; zero sessões é válido.
Auditoria usa o mesmo `tx`, com `critica: true`, ação `alterar`, módulo `auth`,
entidade `usuarios`, sucesso e severidade `info`. Detalhe fixo:
`origem: "recuperacao_legada_protegida"`, sem req/body/hash/token/versão/e-mail.
Falha de efeito crítico exige rollback integral; 200 somente após commit.

| HTTP / code | message |
| --- | --- |
| 200 / `AUTH-200-SENHA-REDEFINIDA` | Senha atualizada com sucesso. |
| 400 / `AUTH-400-TOKEN-INVALIDO-EXPIRADO` | Token inválido ou expirado. |
| 500 / `AUTH-500-REDEFINICAO-SENHA` | Não foi possível atualizar a senha. Tente novamente mais tarde. |

O 400 abrange expiração, assinatura/finalidade/sub/claim inválidos, versão
divergente, usuário inexistente e conta excluída. O 500 abrange hash, banco,
versão DB inválida/máxima, UPDATE, revogação e auditoria. Validação legada 422
permanece. Logs de falha usam códigos/motivos fixos, sem erro bruto ou versão.

Transições: 1 → 2, 2 → 3 e 2147483646 → 2147483647. Em 2147483647,
500 operacional sem mutação; nunca wrap, reset para 1 ou incremento fora da tx.
O commit N → N+1 invalida o token consumido e todos os demais reset JWTs N.
Isso continua sendo JWT legado versionado; token opaco V3 não foi implementado.

A requisição já autenticada antes do commit pode terminar. Se login criar sessão
antes do reset, o reset deve revogá-la; se reset ganhar primeiro, a guarda deve
impedir a sessão antiga. A resposta de um login vencedor pode chegar após o reset,
já com JWT/sessão inválidos. Esses ordenamentos foram comprovados em PostgreSQL
real na branch descartável do rehearsal.
Reverter a guarda reabre a corrida; reverter o writer perde invalidações futuras;
reverter a ponte perde proteção por versão. Não reduzir versões nem reativar sessões.

### Fechamento e numeração canônica da Etapa 07

Validação final prévia: **193/193 testes focados**, **670/670 testes completos do
backend**, R1–R11 operacionais aprovados e sete provas PostgreSQL complementares
aprovadas, sem deadlocks. O R12 original reproduziu `40P01`: troca de área retinha
a sessão e aguardava usuário pela FK do contexto; reset retinha usuário e
aguardava sessão. A correção bloqueia usuário no início de `changeActiveArea`,
mantendo **usuário → sessão → contexto** e os predicados de autorização,
proprietário e sessão não revogada. Ambos os ordenamentos e contexto ausente/
existente foram comprovados após a correção.

A numeração abaixo é a fonte canônica fornecida pelo responsável em 09/10/2026.
Ela não renumera os artefatos operacionais do harness:

| Cenário canônico | Contrato |
| --- | --- |
| R1 | reset confirma antes do login antigo. |
| R2 | login bloqueia primeiro; reset aguarda e revoga. |
| R3 | reset bloqueia primeiro; login antigo é rejeitado. |
| R4 | falha de auditoria provoca rollback integral. |
| R5 | falha de revogação provoca rollback integral. |
| R6 | JWT anterior, inclusive bridge legado, é rejeitado. |
| R7 | sessão anterior permanece revogada. |
| R8 | JWT de reset não admite replay. |
| R9 | limite máximo de auth_version sem overflow. |
| R10 | duas redefinições concorrentes, somente uma confirma. |
| R11 | touchSession não ressuscita sessão revogada. |
| R12 | changeActiveArea e reset sem deadlock. |
| R13 | login com senha nova antes/depois do commit. |

**Todos os 13 cenários canônicos estão cobertos pelo conjunto das evidências**;
ver [correspondência operacional](testes-e-evidencias.md#numeração-canônica-e-correspondência-operacional).
R1–R11 operacionais são resultados originais aprovados; R12 registra a falha
original e três provas corretivas. R13 operacional permanece pré-checagem
histórica, sem fechamento posterior ao deadlock; R13 canônico é a prova
complementar de login com senha nova antes/depois do commit.

D1–D8, `atualizarBasico`, histórico de senhas, centralização dos writers e demais
pendências futuras já aprovadas continuam abertos. Não houve teste de UI/browser
nem implantação em produção. PostgreSQL foi comprovado no rehearsal isolado;
o fechamento documental não reexecuta testes nem banco.

## DECISÃO CANÔNICA — senhas

- Argon2id: 19456 KiB de memória, duas iterações, paralelismo um.
- Blocklist local de 2.097 entradas; medidor zxcvbn-ts common + pt-BR; score mínimo três.
- Bloqueio de dados pessoais conforme `passwordPolicy`, sem inventar heurísticas novas.

**DECISÃO CANÔNICA / CONTRATO ALVO — senhas novas Argon2id:**

- Normalização NFKC.
- 15–128 code points após NFKC.
- Máximo de 512 bytes UTF-8 após NFKC.
- Sem trim e sem lowercase da senha.
- Unicode e emoji permitidos; surrogate malformado rejeitado.

**DECISÃO CANÔNICA — bcrypt legado (regra distinta da política de senhas novas):**

- Verificação usa a entrada original.
- Menos de 72 bytes pode receber upgrade transparente quando elegível.
- 72 bytes ou mais não recebe upgrade transparente e exige troca de senha.

**FATO DO REPOSITÓRIO — API pública atual de**
[passwordService](../../backend/src/services/passwordService.js):

| Export | Contrato atual |
| --- | --- |
| `PasswordServiceError` | Erro tipado, com `name` e `code`. |
| `createNewPasswordHash(password, context)` | Valida estrutura/contexto/política e retorna hash Argon2id. Contexto objeto obrigatório. |
| `verifyPassword(password, hash)` | Verifica Argon2id ou bcrypt e retorna `authenticated`, `algorithm`, `needsRehash`, `canUpgrade`, `requiresPasswordChange`. |
| `upgradeLegacyPasswordHash(password, legacyHash)` | Revalida bcrypt elegível e retorna hash Argon2id; não aceita metadados de elegibilidade como autoridade. |

Contexto: `nome`, `cpf`, `email`, `celular`, `dataNascimento`. Campos opcionais
aceitam ausência/null; quando presentes devem ser strings com limites de
200/32/320/32/32 code points, respectivamente. Unicode inválido não é migrado
automaticamente. A comparação bcrypt preserva a apresentação legada; Argon2id
usa NFKC. A política normaliza cópias de dados para comparação, sem lowercase da
senha armazenada.

**CONTRATO APROVADO — login local (Etapa 05):**

- `POST /api/login` usa o verificador misto Argon2id + bcrypt pelo
  `verifyPassword(password, hash)` oficial de `passwordService`.
- Credenciais inválidas retornam `401`, `AUTH-401-CREDENCIAIS-INVALIDAS` e o
  texto exato em `message` e `erro`: “CPF ou senha inválidos. Verifique os dados
  informados e tente novamente.”
- bcrypt elegível mantém upgrade automático/transparente planejado, com writer
  concorrente seguro em etapa posterior para login/reset.
- Autenticação válida com `requiresPasswordChange=true`, após validação do perfil
  legado, bloqueia o acesso normal: `403`, `AUTH-403-TROCA-SENHA-OBRIGATORIA`,
  `trocaSenhaObrigatoria=true` e, em `message` e `erro`, “Por segurança, é necessário
  atualizar sua senha antes de continuar.” Sem JWT, sessão, cookie, notificação,
  dados adicionais do usuário ou acesso ao dashboard; sem revelar a causa.
- Argon2id válido com `needsRehash=true` autentica normalmente.
- Unicode malformado apresentado é credencial inválida, incluindo o erro defensivo
  `PASSWORD_INVALID_UNICODE`; conta excluída mantém a precedência e resposta legadas.
- Hash armazenado inválido e falha criptográfica são erros operacionais:
  `500`, `AUTH-500-LOGIN`, `message` e `erro` iguais a “Erro interno no servidor.”
  O erro bruto não chega ao cliente/log. Diagnósticos internos fixos:
  `stored_hash_invalid` e `crypto_operation_failed`.
- Respostas `401` de credenciais inválidas têm piso total de 250 ms desde o início
  da tentativa, com relógio monotônico, descontando o processamento e sem jitter.

**IMPLEMENTAÇÃO DESTA ETAPA — Etapa 05:**

O login integra somente a verificação mista e os contratos acima. bcrypt com
`canUpgrade=true` autentica sem persistir upgrade; Argon2id com `needsRehash=true`
autentica sem rehash/persistência. Não chama writers de hash, não escreve senha,
histórico ou `auth_version`, nem audita rehash técnico. O bloqueio de troca
obrigatória é temporário na branch V3; o fluxo restrito de troca será implementado
antes do cutover. JWT/perfil legado, sessão, cookie, `manter_conectado`, notificação
e compensação permanecem no contrato de transição atual. Validação `422`, conta
excluída e perfil inválido preservam seus contratos legados.

## DECISÃO CANÔNICA — outbox e rate limit

**DECISÃO CANÔNICA / CONTRATO ALVO — outbox:** dedicada à autenticação.
Cronogramas completos de tentativas já aprovados:

| Finalidade | Cronograma de tentativa imediata e retries |
| --- | --- |
| Recuperação de senha | Tentativa imediata; retry em 1 minuto; retry em 3 minutos; retry em 7 minutos; retry em 15 minutos; retry em 25 minutos. |
| Confirmação de e-mail | Tentativa imediata; retry em 1 minuto; retry em 5 minutos; retry em 15 minutos; retry em 1 hora; retry em 3 horas. |

- Erro SMTP permanente encerra novas tentativas; após esgotamento, estado final
  igual a `failed`.
- Erro persistido somente de forma sanitizada, preservando diagnóstico operacional.
- Modelo at-least-once controlado, sem promessa de exactly-once.
- `email_destino` representa snapshot imutável do endereço efetivamente usado
  para aquela entrega.
- Segredo/token bruto fica somente criptografado no outbox com AES-256-GCM e
  `key_id`; o challenge armazena somente hash.
- Segredo criptografado deve ser apagado após envio bem-sucedido.

**DECISÃO CANÔNICA / CONTRATO ALVO — rate limit:** decisão funcional **A aprovada**
na Etapa 09: confirmação, alteração de e-mail e recuperação de senha compartilham
os mesmos limites por conta e IP. A emissão inicial também conta nas quotas.

| Escopo | Quotas aprovadas |
| --- | --- |
| Por conta | Intervalo mínimo de 60 segundos; máximo 5 emissões em 1 hora; máximo 10 emissões em janela móvel de 24 horas. |
| Por IP | Máximo 10 emissões em 15 minutos. |

- Estado compartilhado em PostgreSQL; quotas em janela móvel.
- IP representado por HMAC-SHA-256, com segredo dedicado ao HMAC.
- IP bruto não deve ser persistido.
- Retenção dos registros de rate limit: 48 horas.

**IMPLEMENTAÇÃO ATUAL:** o worker da outbox dedicada à autenticação e a integração
de quotas continuam pendentes. O núcleo transacional da Etapa 09 está implementado
e testado somente localmente, sem ativação nas rotas; rehearsal pendente.
O expand da Etapa 08 foi aplicado somente
na branch Neon descartável `br-super-wave-adut7rdn`, com rehearsal e revisão
independente aprovados em 09/10/2026. Rate limit legado em memória preservado.
Aprovação da estrutura não constitui ativação de quotas ou implantação em produção.

### Etapa 08 — estrutura de quotas aprovada em rehearsal, sem ativação

Contrato autorizado: `public.auth_quota_evento` com uma linha por emissão e
`emissao_id UUID` como PK simples. `finalidade` factual admite `confirmacao`,
`alteracao` e `recuperacao`; a estrutura expand não definia sua composição.
A decisão A da Etapa 09 agora determina limites compartilhados entre as três.
`usuario_id INTEGER NULL` referencia `usuarios(id)` por FK imediata,
`ON UPDATE RESTRICT ON DELETE RESTRICT`. Conta e IP podem coexistir na mesma linha.

`ip_hmac BYTEA NULL` e `ip_hmac_key_id TEXT NULL` devem estar ambos ausentes ou
ambos presentes. Digest presente exige 32 bytes; key_id é código ASCII de 1–64
bytes, iniciado por letra minúscula/dígito e composto por `a-z`, `0-9`, `_` e `-`.
O código identifica a chave; nunca contém o segredo. Ao menos um sujeito deve
existir. `registrada_em TIMESTAMPTZ NOT NULL` exige timestamp finito e tem default
`clock_timestamp()`; o protocolo futuro deve capturar o instante após seus locks.

Índices B-tree por conta/instante/finalidade, key_id+HMAC/instante/finalidade e
instante+emissão. Índices de sujeitos têm somente predicados de nulidade; nenhum
predicado temporal. Retenção continua 48 horas desde o registro, sem coluna de
expiração redundante ou mecanismo automático de limpeza. O schema não persiste
IP bruto, CPF, e-mail, tokens ou segredos e não calcula HMAC; cálculo com segredo
dedicado e validação da origem criptográfica pertencem à integração futura.

Implementação sobre `3210ad6c6a6b82c1ed65819f1b37e94839357ee5`:
**149/149 testes locais** e **57/57 provas PostgreSQL** aprovados; sintaxe 2/2 e
dry-run aprovados. Revisão independente aprovada em **09/10/2026**.
Aplicação somente na branch Neon descartável `br-super-wave-adut7rdn`, ledger
**id 7**, SHA-256
`a9b2f706473ff160f7dfac16eb36eecf7f2d78862ea01593193c9e2f45e8901a`.
Tabela final vazia; dados herdados preservados conforme relatório aprovado.
Sem backfill ou alteração de objetos legados. Quotas, HMAC operacional, limpeza,
integração e Etapa 09 permanecem pendentes; rehearsal não comprova produção.
Os testes e SQL não foram reexecutados neste fechamento documental/Git.

**QUESTÕES ABERTAS:** contabilização diante de falhas/solicitações sem emissão;
origem confiável do IP na integração HTTP; configuração e rotação operacional
HMAC; execução/frequência/monitoramento da limpeza. Composição das finalidades
resolvida pela decisão A. Não contar retries SMTP como novas emissões.
D1–D8 e demais pendências aprovadas permanecem abertas.

### Etapa 09 — núcleo transacional local, sem integração

Base `aceb73ac845542255b843e704525084e90654f6c`, somente worktree local.
API: `createAuthQuotaService({ hmacConfig })` e
`registrarEmissao(executor, { emissaoId, finalidade, usuarioId, ip })`.
Executor é o objeto de `db.tx`, com `raw === client`; serviço usa `raw.query` do
mesmo cliente para evitar logging de parâmetros da facade. Sem pool/fallback.
Uma emissão por executor/transação, inclusive negação; segunda chamada é rejeitada
para impedir acumulação de locks em ordem inversa. Argumentos são estritos;
conta e/ou IP explícito, sem CPF/e-mail ou objetos HTTP como sujeitos.

Savepoint exige transação ativa. Somente `READ COMMITTED` de escrita é admitido,
sem alterar silenciosamente o isolamento do chamador. Ordem: usuário `FOR UPDATE`
quando aplicável, advisory locks transacionais de conta/IP/UUID ordenados pelos
identificadores int4. Namespace `0x41515441` separado do runner. Locks existem
mesmo sem eventos. Hash do sujeito usado no lock é identificador efêmero, não
chave persistida de quota; colisões serializam trabalho adicional. O lock IP
independe da versão HMAC. Chamador deve respeitar essa ordem também nas operações
que vier a integrar antes/depois do serviço.

Um `clock_timestamp()` após todos os locks, representado em UTC com seis casas,
é reutilizado nas consultas e no INSERT. Janelas exatas **(t−W, t]**: intervalo
mínimo de 60 s, 5/h e 10/24 h por conta, 10/15 min por IP. Finalidade não filtra
as contagens. Primeiro evento conta; conta/IP conjuntos criam uma linha. Evento
futuro do sujeito impede nova emissão, falhando fechado diante de anomalia temporal.

Resultado interno: `status: aceita`, `repetida`, `registradaEm`, ou somente
`status: negada`. Conta inexistente e limite negado usam o mesmo resultado.
Aceita é provisória até o commit externo; erros críticos são `AuthQuotaError`
com código fixo, sem causa/detail brutos. Serviço não faz commit ou retry;
negação/falha desfaz seus efeitos por savepoint, e o chamador deve propagar erro
crítico para abortar `db.tx`. Falha do rollback também é crítica.

PK e lock de emissão protegem UUID. Replay idêntico retorna o instante original,
sem INSERT ou nova contagem. Finalidade, conta ou identidade IP divergentes são
rejeitadas. Comparação IP admite as versões explicitamente configuradas.
Idempotência depende do evento retido; a integração definitiva com desafio/outbox
e o comportamento após futura remoção de eventos ainda exigem etapa própria.

Normalização isolada: IPv4 estrito, IPv6 em forma expandida minúscula e IPv4-mapped
unificado ao IPv4. Rejeita whitespace, listas, portas, CIDR e zone IDs. Não interpreta
`X-Forwarded-For`. HMAC-SHA-256 recebe segredo dedicado como Buffer (mínimo 32 bytes),
sem env/default; key_ids controlados/únicos, até 16 versões explícitas, uma ativa.
Segredos são copiados para evitar mutação externa. O serviço grava apenas o digest
ativo e consulta todas as versões configuradas. Conta isolada não exige HMAC.

Guarda de cobertura rejeita versão não configurada presente na janela IP de 15 min,
inclusive registros futuros. Essa consulta global requer avaliação de custo no
rehearsal. Não comprova consistência do segredo entre instâncias: `key_id` deve
ter vínculo imutável com a chave dedicada; completude/rollout/retirada de versões
permanecem decisões operacionais abertas. Sem rotação automática.

Testes locais: **142/142 focados**, **829/829 completos**, sintaxe **4/4**; mocks e
cliente simulado com `db.tx` real. Sem prova de concorrência PostgreSQL real.
Rehearsal pendente; Etapa 09 não concluída. Sem ativação HTTP, associação outbox/
desafio, SMTP, limpeza, mudança de schema ou D1–D8.

## DECISÃO CANÔNICA — auditoria

Operação crítica e auditoria usam o mesmo executor transacional. Falha crítica
propaga o erro e provoca rollback pelo chamador dono da transação. Retenção
planejada: cinco anos. O helper não abre/fecha transação por conta própria.

## DECISÃO CANÔNICA — MFA e CSRF

MFA obrigatório para `gestor`, `administrador`, `diagnostico`, `cai_administrador`;
opcional para os demais. TOTP, passkeys, recovery, trusted device e reauth estão
previstos, com parâmetros restantes em D5. MFA não está comprovado como implementado.

CSRF: Origin/Referer exatos, HMAC por sessão, segredo separado; frontend mantém
token em memória. O contrato não autoriza afirmar proteção V3 já operacional.

## DECISÃO CANÔNICA — regularização e ciclo de conta

Regularização: login → e-mail → dados → revisão → políticas → dashboard.

Ciclo: ativa / inativa / encerrada; inatividade superior a 366 dias;
encerramento reversível com sete dias. Efeito definitivo após esse prazo,
retenção e liberação de identificadores continuam em D7.

## PENDÊNCIAS — sem decisão nesta etapa

| ID | Definição pendente |
| --- | --- |
| D1 | Prova para retomada de cadastro pendente e colisões de CPF/e-mail. |
| D2 | Duração e recuperação do contexto de autenticação restrita. |
| D3 | Primeira vinculação Google, desvinculação e recuperação de conta sem senha local. |
| D4 | Recuperação/reativação quando e-mail não confirmado e fluxo assistido. |
| D5 | Parâmetros restantes de MFA: reauth, trusted device, recovery, RP/passkeys etc. |
| D6 | Matriz explícita de permissões dos dez perfis. |
| D7 | Efeito definitivo do encerramento após sete dias, retenção e liberação de identificadores. |
| D8 | Coortes/prazo de ponte e janela operacional de produção. |

Essas pendências não foram decididas por esta baseline. Novas definições exigem
aprovação explícita e atualização versionada, conforme o [README](README.md).
