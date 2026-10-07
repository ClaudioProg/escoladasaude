# Testes e evidências de fechamento

Base documental: 2026-10-05, HEAD
`ddb6d1e8795c67879ec107fe264b04d52867f665`.

## Origem e limites

Os resultados abaixo registram fechamentos informados e aprovados pelo responsável
nas etapas anteriores, incluindo a consolidação explícita da Etapa 04. Arquivos e
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

## PENDÊNCIA — evidência de produção

Aplicação de migrations, ledger, deploy, cutover e fluxos autenticados de produção
exigem comprovação própria. Nada neste registro estabelece esses resultados.
Novas evidências devem indicar versão, ambiente, método, resultado e limites,
conforme o [README](README.md).
