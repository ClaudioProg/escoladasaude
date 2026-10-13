# Plataforma Escola da Saúde — V3

Baseline documental de 2026-10-05. Branch: `revisao-premium-bloco-1-auth`.
HEAD de código da baseline: `ddb6d1e8795c67879ec107fe264b04d52867f665`.
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

Sem criptografia operacional, enqueue, worker, SMTP, fencing integral,
exactly-once, limpeza operacional ou implantação em produção. **Etapas 11 e 12
pendentes**; Etapa 11 não iniciada. Este fechamento somente documental/Git não
repete testes/rehearsal nem executa SQL ou operações Neon. Ver
[migration](migrations.md#etapa-10--outbox-expand-aprovada-em-homologação).

**Dez etapas concluídas entre 57 microetapas previstas** do roteiro técnico.
Essa contagem não equivale ao avanço ponderado do trabalho; não estabelece
percentual global, esforço restante ou estimativa de prazo.

Etapa 11 — **criptografia e enqueue implementados localmente para revisão**,
sobre `a745a9d18c56ff50941a7f01131d32d1cbf21e5e`. Serviços isolados
`authOutboxCrypto.js` e `authEnqueueService.js`: AES-256-GCM com chaves externas,
AAD versionada, token opaco, composição de quotas/desafios/outbox/auditoria no
executor explícito do chamador e resultado genérico sem token bruto.
**134/134 testes novos, 290/290 focados e 993/993 completos** aprovados;
suíte completa executada uma vez, sintaxe JS 4/4 e 24 consultas no parser PG16.
**Etapa 11 aberta: revisão independente e rehearsal PostgreSQL pendentes**.
Casos de cadastro pendente/D1, recuperação não confirmada/reativação/D4 e
integração/autorização HTTP permanecem fora do núcleo; não se definiram políticas.
Sem nova migration, SQL externo, Neon, SMTP, worker, claim/ack, limpeza, ativação,
merge ou deploy. Etapa 12 não iniciada; contagem permanece em **dez de 57 etapas
concluídas**, sem equivalência com avanço ponderado. Ver
[evidências e rehearsal necessário](testes-e-evidencias.md#etapa-11--criptografia-e-enqueue-local--revisão-e-rehearsal-pendentes).

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
consultado neste fechamento. O HEAD do núcleo foi conferido no remoto da branch
V3; publicação Git não comprova implantação ou funcionamento em produção.
