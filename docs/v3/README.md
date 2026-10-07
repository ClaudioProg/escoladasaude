# Plataforma Escola da Saúde — V3

Baseline documental de 2026-10-05. Branch: `revisao-premium-bloco-1-auth`.
HEAD de código inspecionado: `ddb6d1e8795c67879ec107fe264b04d52867f665`.

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
Argon2id e bcrypt legado. O próximo trabalho é a Etapa 05.

Ao atualizar um documento, registrar HEAD/data, origem da decisão ou evidência,
ambiente, limites da comprovação e pendências relacionadas. Alterar o status
somente com a evidência correspondente. Não modificar migration aplicada para
ajustar a documentação. Não incluir credenciais, endereços de conexão ou dados
pessoais nos documentos.

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
decisões anteriores fornecidas pelo responsável. Resultados PostgreSQL são
históricos, conforme [evidências](testes-e-evidencias.md); nenhum banco foi
consultado nesta etapa. Produção e publicação remota não foram verificadas.
