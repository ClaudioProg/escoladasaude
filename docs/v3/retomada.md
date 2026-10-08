# Retomada operacional

Projeto: **Plataforma Escola da Saúde — V3**.

Branch: `revisao-premium-bloco-1-auth`.

Atualização documental: 2026-10-08.
Último commit funcional: `665b3de7002748412d0942d124c6e501f1c2ac3d`.
Essa é a base funcional anterior a esta atualização, não o SHA do futuro commit
documental. Confirmar o HEAD real ao retomar.

Última etapa funcional concluída: **06 — ponte de auth_version no access JWT**.
Etapas **01–06 fechadas/versionadas na branch**. Etapa 04 documental incorporada em
`3247b3d305234414a493e60097d1bae8e0b238d1`; manutenção do inventário de migrations
incorporada em `dd0722b54a3837994eda44ae7434179db1ccbca1`, sem etapa funcional nova.

Próxima etapa: **07 — concorrência login/reset**.
Objetivo geral: endurecer a interação entre autenticação e alteração/reset de
credenciais para impedir emissão/uso inconsistente durante concorrência.
Terá preflight próprio, que definirá a solução e a necessidade de acesso a banco.

Estado funcional relevante:

- `passwordService/verifyPassword` integrado ao login; bcrypt legado e Argon2id
  autenticam. Bcrypt direto removido do controller de login.
- Upgrade bcrypt automático ainda **não persiste**; Argon2id com `needsRehash`
  também **não persiste** rehash.
- `requiresPasswordChange` bloqueia acesso normal com 403, sem JWT, sessão,
  cookie ou notificação. Fluxo seguro de troca ainda precisa ser implementado
  antes do cutover; concorrência login/reset permanece pendente.
- Novos access JWTs levam `auth_version`; login local e Google emitem a versão
  e o middleware Bearer compara token × banco.
- `bridge`/`strict` existem; `AUTH_VERSION_MODE` é obrigatório e fail-closed.
  Em `bridge`, token antigo realmente sem claim só é aceito como versão 1
  quando DB=1; em `strict`, ausência de claim é rejeitada.
- Nenhum writer incrementa `auth_version`; reset legado ainda não invalida
  access JWT via versão.
- Perfil único legado continua; JWT/Bearer segue durante a transição.
- Sessão/cookie permanece independente e intacto; JWTs especializados fora da ponte.
- D8 permanece pendente para o cutover `bridge → strict`. Evidência local não
  comprova presença da coluna nem configuração do modo em produção; não houve deploy.

Worktree estava limpo antes desta sincronização; somente os três documentos
autorizados ficam modificados. Esta tarefa não realiza stage/commit/push/deploy.

Ambiente de rehearsal: clone auth-recuperação,
`revisao-premium-ensaio-auth-recuperacao`. Nunca confundir com produção.
Produção requer preflight próprio do ledger; adequação feita em clone não foi
realizada em produção.

Aviso 5432: a rede municipal bloqueia PostgreSQL direto. Usar internet pessoal
somente quando uma etapa realmente exigir conexão e houver autorização para o
alvo. A documentação não exige acesso a banco.

## Antes de retomar

1. Conferir branch, HEAD e status; parar diante de mudança inesperada.
2. Ler [status](bloco-1-status.md), [decisões/D1–D8](decisoes-canonicas.md) e
   [legado](legado.md); não fechar pendências por inferência.
3. Consultar [evidências](testes-e-evidencias.md) e [migrations](migrations.md).
4. Realizar o preflight da Etapa 07 antes de definir sua implementação; não ativar
   writers Argon2id antes da proteção concorrente login/reset e compatibilidade.

Não inserir segredos, endereços de conexão, credenciais, tokens reais ou dados
pessoais neste documento. Nenhuma implantação/ação em produção é presumida.
