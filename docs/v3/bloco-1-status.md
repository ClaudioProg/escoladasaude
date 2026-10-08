# Bloco 1 — estado real

Atualização documental: 2026-10-08. Branch: `revisao-premium-bloco-1-auth`.
Último commit funcional de referência:
`1cbff88b5582308f68183fd96774f50256b17987`, base funcional anterior a esta
atualização documental; não é o SHA do futuro commit documental.

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

## PARCIAL

- Login local já usa o verificador misto e cria sessão/cookie de transição;
  continua emitindo JWT legado e preservando o perfil único legado.
- Writer automático bcrypt → Argon2id e rehash Argon2id ainda não estão ativos.
  O fluxo seguro de troca obrigatória precisa ser implementado antes do cutover;
  concorrência login/reset permanece para etapa posterior.
- Middleware de sessão publica `{ id, perfis, areaAtiva, sessionId }`; isso não
  prova uso desse contrato em todas as rotas/clientes.
- Campos `auth_version`/`email_version` e desafios existem no SQL expand;
  `auth_version` ainda não governa JWT no emissor/middleware legado inspecionados.
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

- **Próxima etapa: 06 — ponte de auth_version.** Integrar versionamento de
  autenticação à ponte JWT de forma compatível com o legado, sem cutover prematuro.
  A implementação e a necessidade de banco serão determinadas em preflight próprio.
- Integrar writers de senha à política/histórico/auditoria/revogação.
- Implementar confirmação institucional e recuperação com consumo único.
- Outbox dedicada, rate limit PostgreSQL, retenção/limpeza e integração crítica.
- Fechar D1–D8; implementar MFA/CSRF/regularização e permissões conforme aprovação.
- Preparar a ponte/cutover com evidência de compatibilidade e preflight de produção.

Etapas 01–05 estão fechadas/versionadas na branch; isso não comprova produção.
Ver [migrations](migrations.md), [evidências](testes-e-evidencias.md)
e [retomada](retomada.md).
