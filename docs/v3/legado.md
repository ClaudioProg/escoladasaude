# Legado e condições de retirada

Base: `ddb6d1e8795c67879ec107fe264b04d52867f665`, 2026-10-05.
Os fatos abaixo foram conferidos em fontes locais e na auditoria anterior.
A existência na branch não comprova o estado de produção.

## Categorias

- **A:** remover antes da ativação do substituto.
- **B:** coexistência temporária explícita.
- **C:** remover no cutover.
- **D:** permanecer.

**RECOMENDAÇÃO FUTURA:** a tabela classifica a retirada a partir dos contratos
aprovados e do comportamento auditado. Ela não aprova datas, coortes, permissões
ou implementações novas. Onde falta decisão, a condição depende de D1–D8.
Nenhuma remoção de código é executada nesta etapa documental.

| Item / fato atual | Categoria | Condição de retirada ou permanência |
| --- | --- | --- |
| Escrita direta de e-mail/senha em [usuarioController](../../backend/src/controllers/usuarioController.js) e [authUsuarioController](../../backend/src/controllers/authUsuarioController.js) | A | Substituir os writers antes de ativar o fluxo V3 correspondente; confirmação, política/histórico, versões, revogação e auditoria devem compor a operação aprovada. |
| Reset JWT de uma hora em [authUsuarioController](../../backend/src/controllers/authUsuarioController.js) | A | Desativar emissão/consumo legado na ativação da recuperação opaca; tratar desafios antigos e elegibilidade conforme decisão explícita, sem fallback ao JWT. |
| `bcrypt.hash` direto nos controllers | A | Remover o writer direto quando a política/serviço/histórico estiverem integrados. Login misto deve preceder qualquer writer Argon2id operacional. |
| Verificação bcrypt no [login](../../backend/src/controllers/loginController.js) | B | Substituir chamada direta pelo verificador misto na Etapa 05; suporte bcrypt permanece temporariamente até migração/troca da população legada e fechamento da ponte D8. |
| JWT de acesso em [generateToken](../../backend/src/auth/generateToken.js) / [authMiddleware](../../backend/src/auth/authMiddleware.js) | B | Coexistir somente na ponte controlada; emissão/validação de versões ainda precisa implementação. Retirar após cutover para sessões e fechamento D8. Revogar sessões hoje não invalida automaticamente JWT legado. |
| JWT/localStorage em [api.js](../../frontend/src/services/api.js) | C | Retirar ao migrar cliente e rotas para sessão/cookie/CSRF, com compatibilidade e rehearsal comprovados. |
| Perfil único e consumidores de representação/aliases legados | C | Migrar para `perfis`/`areaAtiva` e matriz D6; nenhum alias/fallback ganha autoridade final. O [dossiê](../../frontend/dossie.md) descreve o contrato antigo. |
| Google localizado por e-mail em [authGoogle](../../backend/src/auth/authGoogle.js) | B | Substituir após fechar vinculação/desvinculação e recuperação D3; `email_verified` não dispensa confirmação institucional. |
| Anonimização imediata em [contaExclusaoController](../../backend/src/controllers/contaExclusaoController.js) | A | Desativar antes de ativar encerramento reversível de sete dias; definir efeito definitivo/retenção/liberação em D7. |
| Rate limit em memória no [server](../../backend/src/server.js) / [rotas públicas](../../backend/src/routes/authPublicRoute.js) | B | Manter proteção existente até rate limit PostgreSQL/HMAC e quotas aprovadas estarem integrados e ensaiados; então retirar limitadores duplicados/substituídos. |
| Notificações funcionais antigas em [notificacaoController](../../backend/src/controllers/notificacaoController.js) e [notificacaoProgramadaController](../../backend/src/controllers/notificacaoProgramadaController.js) | D | Permanecem em sua finalidade funcional; não assumir que substituem outbox durável de autenticação. |
| JWT de presença em [presencaController](../../backend/src/controllers/presencaController.js) | D | Permanecer como finalidade distinta de autenticação de conta; retirar JWT de acesso não autoriza remover esse mecanismo. |
| Diagnóstico de cadastro incompleto em [forcarAtualizacaoCadastro](../../backend/src/auth/forcarAtualizacaoCadastro.js) | D | Preservar diagnóstico útil; adequar sua integração à regularização V3, sem transformá-lo em autoridade de identidade/permissões. |
| Touch em [authSessionService](../../backend/src/services/authSessionService.js) | D | Preservar fail-closed, locking e limite de escrita; usar atividade real da sessão, sem heartbeat. |
| [passwordService](../../backend/src/services/passwordService.js) | D | Permanecer como fundação pública; integrar writers/verificador. Não expor helpers internos como bypass da política. |

## Pendências e limites

Datas e janela de retirada dependem de D8. Google depende de D3; ciclo de conta
de D7; autorização de D6. A lista não decide essas pendências nem cria exceção
de administrador. Ver [decisões](decisoes-canonicas.md) e [status](bloco-1-status.md).

JWT/perfil único/localStorage ainda ativos são diferenças entre implementação e
contrato alvo, não prova de regressão ou autorização de retirada imediata.
