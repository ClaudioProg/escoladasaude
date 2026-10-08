# Testes e evidências de fechamento

Atualização documental: 2026-10-08. Último commit funcional de referência:
`1cbff88b5582308f68183fd96774f50256b17987`, anterior a esta atualização documental.

## Origem e limites

Os resultados abaixo registram fechamentos informados e aprovados pelo responsável
nas etapas anteriores, incluindo a consolidação explícita da Etapa 04 e as
validações locais da Etapa 05. Arquivos e
commits foram conferidos no repositório. Resultados de banco são **históricos do
clone**, não nova consulta nem prova de produção. Testes não foram reexecutados
na etapa exclusivamente documental. Não há logs brutos ou dados pessoais aqui.

## TOUCH — fechado

- Sessões válidas/inválidas e escrita acima da janela de 60 segundos.
- Touch fail-closed; concorrência touch/revoke comprovada em PostgreSQL.
- Fonte atual: [authSessionService](../../backend/src/services/authSessionService.js)
  e [testes](../../backend/src/services/authSessionService.test.js).
- Middleware toca antes de publicar identidade: [código](../../backend/src/auth/authSessionMiddleware.js)
  e [testes](../../backend/src/auth/authSessionMiddleware.test.js).
- Commit do endurecimento: `ba3a169bcbd9fa7e1a2c69136999fda566cf246e`.

## EMAIL EXPAND — fechado em clone

- PostgreSQL 16; 2668 usuários antes/depois, com e-mails/senhas preservados.
- Fingerprint agregado de preservação `id+email+senha`:
  `435138e20f561fc677735581bedcbcd3`.
- Legados não foram confirmados automaticamente; versões iniciais iguais a um;
  campos de confirmação/prazo pendente nulos; três tabelas novas inicialmente vazias.
- Checks, FKs e unicidade ensaiados, incluindo prazos finitos, estados terminais,
  versões, tamanho do hash e um desafio aberto por usuário.
- Concorrência de desafios: bloqueio da segunda transação seguido de `23505`.
- Rollback do ensaio funcional com resíduos zero e fingerprint preservado.
- Segunda execução pelo runner fez skip com mesmo SHA: idempotência via ledger,
  não autorização para alterar/reaplicar o SQL registrado.
- SQL final contém 29 constraints; detalhe e limites em [migrations](migrations.md).
- Commit: `7e47b5d40e64fbfc1601b8b0001a50bfd24e95e8`.

## PASSWORD 1A — fechado

Argon2id/bcrypt, Unicode/NFKC, fronteira de 72 bytes, limites e erros tipados.
Fontes: [serviço](../../backend/src/services/passwordService.js) e
[testes](../../backend/src/services/passwordService.test.js).
Commit: `2e51c1fbc5f743be23a6605c9720b8580519b5c2`.

## PASSWORD 1B — fechado

43 testes no fechamento: blocklist, previsibilidade, dados pessoais, limites de
contexto, gerador e performance. Revisão de licenças/atribuições registrada.
Não transformar esse resultado histórico em benchmark universal de produção.

Fontes: [política](../../backend/src/services/passwordPolicy.js),
[testes da política](../../backend/src/services/passwordPolicy.test.js),
[testes da blocklist](../../backend/src/services/passwordBlocklist.test.js),
[testes do gerador](../../backend/scripts/generate-password-blocklist.test.js),
[notas de licença e geração](../../backend/src/security/password-common-2097.NOTICE.md).
Commit: `05e31280f66eef7782c9b0d0a27f0cc773568e94`.

## ETAPA 01 — auditoria transacional

14 testes; commit/rollback em PostgreSQL; falha crítica `42P01`; resíduos zero.
Mesmo executor da operação crítica, sem fallback quando explícito inválido;
erro crítico preservado e rollback pelo dono da transação.
Fonte: [testes](../../backend/src/services/auditoriaService.test.js).
Commit: `2fb3090b95620e90ef16401d466abba42e71f21d`.

## ETAPA 02 — revogação transacional

35 testes; rollback e commit da revogação no mesmo backend/transação da operação;
cleanup final com resíduos zero. Rehearsal no clone auth-recuperação, preparado
com as migrations anteriores conforme [inventário](migrations.md).
Fontes: [sessões](../../backend/src/services/authSessionService.test.js),
[middleware](../../backend/src/auth/authSessionMiddleware.test.js) e
[login](../../backend/src/controllers/loginController.test.js).
Commit: `48761e60381e380b511dffe623e0b3ca9082f2d3`.

## ETAPA 03 — logs seguros

46 testes no fechamento; scanner adversarial sem segredos nos logs capturados.
DB/SMTP simulados, sem banco ou envio real; sanitização apenas de logging.
Cobertura inclui Morgan/DEV/error com query/fragmento, CPF/celular prefixados,
telefone formatado, datas com underscore, metadados PostgreSQL, frames Windows/
Linux sem caminho absoluto e flags do mailer sem contagem por vírgulas.
SQL/params/retorno/mesmo erro e contratos HTTP/SMTP preservados nos testes.

Fontes: [testes centrais](../../backend/test/safeAuthLogging.test.js),
[login](../../backend/src/controllers/loginController.test.js) e
[auditoria](../../backend/src/services/auditoriaService.test.js).
Commit: `ddb6d1e8795c67879ec107fe264b04d52867f665`.

## MANUTENÇÃO MIGRATIONS — inventário oficial

Falha preexistente no teste de inventário corrigida para incluir a migration de
2026-10-02, já presente na base. Runner e migrations permaneceram inalterados.
`run-migration.identity`: **82/82**; suíte backend completa após correção: **402/402**.
Manutenção de teste, sem constituir etapa funcional da V3.

Fonte: [teste de identidade](../../backend/scripts/run-migration.identity.test.js).
Commit: `dd0722b54a3837994eda44ae7434179db1ccbca1`.

## ETAPA 05 — LOGIN COM VERIFICADOR MISTO

Commit: `1cbff88b5582308f68183fd96774f50256b17987`.

| Grupo validado | Resultado |
| --- | --- |
| [loginController](../../backend/src/controllers/loginController.test.js) | 28/28 |
| [passwordService](../../backend/src/services/passwordService.test.js) | 13/13 |
| [safeAuthLogging](../../backend/test/safeAuthLogging.test.js) | 25/25 |
| [authSessionService](../../backend/src/services/authSessionService.test.js) | 35/35 |
| [authSessionMiddleware](../../backend/src/auth/authSessionMiddleware.test.js) | 5/5 |
| Total diretamente relacionado | **106/106** |
| Suíte backend completa | **402/402** |
| Revisão adicional em memória com controller e criptografia reais | **10/10** |

`node --check` nos JS modificados e `git diff --check`: aprovados.
As fixtures de resultado não autenticado foram alinhadas ao contrato real antes
do commit funcional; os resultados acima incluem a validação final da suíte.

Escopo comprovado: bcrypt e Argon2id válidos; ambos incorretos com 401 canônico;
Unicode malformado e defesa contra erro Unicode do serviço; `requiresPasswordChange`
com 403 sem acesso normal; hash armazenado inválido e falha criptográfica com 500
genérico e diagnóstico sanitizado; piso temporal mínimo de 250 ms, espera apenas
do restante e nenhuma espera adicional após 250 ms; JWT/perfil/sessão/cookie de
transição e compensação; ausência de writers proibidos no login.

Limites: nenhum PostgreSQL real, nenhum SMTP e nenhum deploy nessas validações.
São evidências locais; **não provam produção**. Upgrade bcrypt → Argon2id não foi
persistido; Argon2id com `needsRehash` também não persistiu rehash. Nenhum desses
resultados fecha a concorrência login/reset ou o futuro fluxo seguro de troca.
Os testes não foram reexecutados nesta sincronização exclusivamente documental.

## PENDÊNCIA — evidência de produção

Aplicação de migrations, ledger, deploy, cutover e fluxos autenticados de produção
exigem comprovação própria. Nada neste registro estabelece esses resultados.
Novas evidências devem indicar versão, ambiente, método, resultado e limites,
conforme o [README](README.md).
