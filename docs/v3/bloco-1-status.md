# Bloco 1 — estado real

Atualização documental: 2026-10-09. Branch: `revisao-premium-bloco-1-auth`.
Base Git anterior ao fechamento da Etapa 07:
`b84fafdec24dd527a78739e27bf1456b126d3bea`. O commit que incorpora este registro
reúne código, testes e quatro documentos; consultar seu SHA no histórico da branch.
O SHA base não é o commit de fechamento.

## FECHADO / versionado na branch

**FATO DO REPOSITÓRIO:** os commits abaixo existem e são ancestrais do HEAD.
"Publicado" neste registro significa incorporado ao histórico da branch V3;
publicação remota/deploy e aplicação em produção não foram comprovados nesta etapa.
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
- Confirmação institucional, recuperação V3 e histórico de senhas têm estrutura;
  não estão demonstrados como serviços operacionais integrados.

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
- Integrar writers que incrementam `auth_version`, inclusive senha/e-mail,
  à política/histórico/auditoria/revogação.
- Implementar upgrade bcrypt → Argon2id persistente e rehash Argon2id.
- Implementar confirmação institucional e recuperação com consumo único.
- Outbox dedicada, rate limit PostgreSQL, retenção/limpeza e integração crítica.
- Fechar D1–D8; implementar MFA/CSRF/regularização e permissões conforme aprovação.
- Preparar o cutover bridge → strict conforme D8, com preflight de produção.

Etapas 01–06 estão versionadas; a Etapa 07 tem fechamento local aprovado e é
incorporada pelo commit deste registro. Nenhum desses estados comprova produção.
Ver [migrations](migrations.md), [evidências](testes-e-evidencias.md)
e [retomada](retomada.md).
