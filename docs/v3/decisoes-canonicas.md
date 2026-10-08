# Decisões canônicas da V3

Referência: baseline de 2026-10-05, código em
`ddb6d1e8795c67879ec107fe264b04d52867f665`. Fonte de aprovação: instrução explícita
das Etapas 04/05 e decisões anteriores fornecidas pelo responsável. As seções de
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

A aprovação anterior define `auth_version` por usuário, versão inicial um,
claim da versão em JWT novo e equivalência à versão inicial para JWT legado sem
claim somente durante a ponte. Incrementar a versão deve invalidar JWT antigo;
Bearer permanece apenas no cutover controlado. Esses controles ainda não estão
implementados no emissor/middleware legado. Coortes, prazo e janela permanecem em D8.

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

**DECISÃO CANÔNICA / CONTRATO ALVO — rate limit:** para emissão de confirmação
e recuperação, com a emissão inicial também contabilizada nas quotas.

| Escopo | Quotas aprovadas |
| --- | --- |
| Por conta | Intervalo mínimo de 60 segundos; máximo 5 emissões em 1 hora; máximo 10 emissões em janela móvel de 24 horas. |
| Por IP | Máximo 10 emissões em 15 minutos. |

- Estado compartilhado em PostgreSQL; quotas em janela móvel.
- IP representado por HMAC-SHA-256, com segredo dedicado ao HMAC.
- IP bruto não deve ser persistido.
- Retenção dos registros de rate limit: 48 horas.

**IMPLEMENTAÇÃO ATUAL:** o worker da outbox dedicada à autenticação e o rate limit
PostgreSQL continuam a fazer no HEAD desta baseline. O rate limit legado em
memória permanece ativo; não foi substituído/removido. Esses valores são decisões
aprovadas, sem constituir prova de implementação ou funcionamento em produção.

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
