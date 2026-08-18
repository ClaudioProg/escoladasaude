# Migrations legadas

Os arquivos desta pasta são artefatos históricos imutáveis.

- Não fazem parte do fluxo oficial executável de migrations.
- Não devem ser editados nem reexecutados.
- Correções futuras devem ser implementadas como novas migrations forward-only em `db/migrations`.
- A presença de um arquivo nesta pasta não afirma que ele tenha sido executado atomicamente pelo ledger atual.
