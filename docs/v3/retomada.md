# Retomada operacional

Projeto: **Plataforma Escola da Saúde — V3**.

Branch: `revisao-premium-bloco-1-auth`.

HEAD de código/base desta documentação:
`ddb6d1e8795c67879ec107fe264b04d52867f665`.

Última etapa de implementação concluída: **03 — logs seguros de autenticação**.
Etapa 04: baseline documental preparada para revisão e commit autorizado em
momento posterior; esta criação não realizou commit/push.

Próxima etapa: **05 — login com verificador misto**.
Motivo: antes do primeiro writer Argon2id operacional, login precisa aceitar
Argon2id e bcrypt legado por meio da API pública do `passwordService`.

Worktree: limpo antes desta etapa; documentação nova fica não commitada até sua
aprovação. Estado esperado após commit desta documentação: limpo. O commit
documental terá novo HEAD; confirmar esse SHA na retomada, sem confundi-lo com o
HEAD de código acima.

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
4. Respeitar o escopo da Etapa 05; não ativar writers Argon2id antes da compatibilidade.

Não inserir segredos, endereços de conexão, credenciais, tokens reais ou dados
pessoais neste documento. Nenhuma implantação/ação em produção é presumida.
