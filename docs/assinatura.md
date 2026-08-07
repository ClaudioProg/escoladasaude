# Contrato técnico final — Sistema Central de Assinaturas

Status: consolidado para orientar implementação futura.  
Escopo desta entrega: arquitetura e contrato; nenhum código, migration, teste ou alteração foi realizado.

## 1. Diagnóstico resumido do legado

O sistema atual mantém uma única imagem mutável por usuário em `assinaturas.imagem_base64`, sem versionamento documental.

Problemas comprovados:

- `GET /api/assinatura` cria assinatura automaticamente;
- há geração pelo nome e fallback gráfico;
- abertura de telas pode persistir assinatura silenciosamente;
- reservas podem executar UPSERT da assinatura recebida pelo cliente;
- o mesmo campo recebe Data URL ou Base64 puro;
- reservas antigas guardam apenas `assinatura_id` e recuperam a imagem atual;
- certificados regulares podem emitir nome e linha sem imagem;
- a reconstrução de certificado pode usar assinatura, nome, cargo e configuração atuais;
- o login devolve a imagem, que pode ser persistida no `localStorage`;
- listas de candidatos misturam disponibilidade da imagem com autorização documental;
- não há MFA nem sessões revogáveis no checkout atual;
- a auditoria existente é não bloqueante por padrão.

Componentes centrais do legado: [assinaturaController.js](C:/Users/t0102815/escoladasaude/backend/src/controllers/assinaturaController.js:494), [salaController.js](C:/Users/t0102815/escoladasaude/backend/src/controllers/salaController.js:480), [certificadoController.js](C:/Users/t0102815/escoladasaude/backend/src/controllers/certificadoController.js:865), [certificadoAvulsoController.js](C:/Users/t0102815/escoladasaude/backend/src/controllers/certificadoAvulsoController.js:738) e [loginController.js](C:/Users/t0102815/escoladasaude/backend/src/controllers/loginController.js:123).

## 2. Contrato conceitual

A definição oficial é:

> Imagem de assinatura pessoal versionada, vinculada a uma operação autenticada.

A imagem não constitui isoladamente uma assinatura criptográfica. A autoria resulta da composição:

```text
identidade autenticada
+ reautenticação
+ MFA aplicável
+ versão imutável da imagem
+ autorização específica do módulo
+ contexto documental congelado
+ auditoria crítica
+ artefato e hash preservados
```

Invariantes:

1. Existe um único cadastro pessoal por usuário.
2. Todo cadastro ou substituição produz nova versão.
3. Nenhum módulo cria assinatura.
4. Nenhum GET cria ou altera assinatura.
5. A versão atual é indicada explicitamente.
6. A autorização é decidida pelo módulo, não pelo cadastro central.
7. Documento finalizado aponta para versão imutável.
8. Alteração ou revogação pessoal nunca reescreve documento anterior.
9. Nenhuma imagem é devolvida no login ou perfil geral.
10. Nenhuma imagem é armazenada no `localStorage`.
11. Não há upload externo: a imagem nasce exclusivamente do desenho feito na plataforma.

## 3. Modelo de dados definitivo

```text
usuarios
   │
   ├── 1:1 ── assinaturas_pessoais
   │              │
   │              ├── 1:N ── assinatura_versoes
   │              │                 │
   │              │                 └── 1:N ── assinatura_versao_criptografias
   │              │
   │              └── 1:N ── assinatura_regularizacoes
   │
   ├── 1:N ── auth_sessoes
   └── 1:N ── auth_reautenticacoes

assinatura_versoes
   ├── N:M ── assinatura_analises_seguranca
   └── 1:N ── documento_assinaturas ── N:1 ── documentos_assinados

outbox_eventos
auditoria_eventos
```

### 3.1 `assinaturas_pessoais`

Finalidade: agregado central do usuário e referência explícita da versão atual.

| Coluna                 | Tipo/contrato                                                               |
| ---------------------- | --------------------------------------------------------------------------- |
| `id`                   | `BIGINT GENERATED ALWAYS AS IDENTITY`, PK                                   |
| `usuario_id`           | `BIGINT NOT NULL`, FK `usuarios(id) ON DELETE RESTRICT`, `UNIQUE`           |
| `estado`               | `VARCHAR`, check: `ausente`, `pendente`, `valida`, `revogada`, `em_analise` |
| `versao_atual_id`      | `BIGINT NULL`, referência à versão pertencente ao cadastro                  |
| `ultima_versao_numero` | inteiro não negativo, contador transacional                                 |
| `motivo_estado`        | código controlado                                                           |
| `lock_version`         | inteiro não negativo para concorrência otimista                             |
| `criado_em`            | `TIMESTAMPTZ NOT NULL`                                                      |
| `atualizado_em`        | `TIMESTAMPTZ NOT NULL`                                                      |

Invariantes:

- uma linha por usuário;
- `estado = 'valida'` exige `versao_atual_id`;
- nenhum outro estado pode apontar para versão utilizável;
- a versão atual deve pertencer ao mesmo `assinaturas_pessoais.id`;
- uma versão não pode ser atual em mais de um cadastro;
- remover perfis adicionais não altera nem exclui a assinatura;
- `ultima_versao_numero` é incrementado sob bloqueio; versão atual nunca é inferida por maior ID.

Constraints recomendadas:

- FK composta e diferível entre `(id, versao_atual_id)` e `(assinatura_pessoal_id, id)` de `assinatura_versoes`;
- check entre `estado` e nulidade de `versao_atual_id`;
- `UNIQUE (versao_atual_id)` ignorando nulos.

Índices:

- único em `usuario_id`;
- parcial em `versao_atual_id`;
- `(estado, atualizado_em)`;
- não indexar bytes.

Retenção: a linha permanece enquanto o usuário ou qualquer versão/documento relacionado estiver sujeito a retenção.

### 3.2 `assinatura_versoes`

Finalidade: representar cada desenho, confirmação canônica, tentativa preservada ou versão histórica.

| Coluna                      | Tipo/contrato                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`                        | `BIGINT IDENTITY`, PK                                                                                        |
| `assinatura_pessoal_id`     | FK `ON DELETE RESTRICT`                                                                                      |
| `numero_versao`             | inteiro positivo                                                                                             |
| `estado`                    | `historica`, `valida`, `substituida`, `revogada`, `pendente_analise`, `rejeitada`, `quarentena`, `eliminada` |
| `conteudo_tipo`             | `png_canonico` ou `legado_bruto`                                                                             |
| `mime_type`                 | `image/png` para versão utilizável                                                                           |
| `tamanho_bytes`             | inteiro positivo; máximo de 500 KB para versão canônica                                                      |
| `largura_px`                | inteiro positivo                                                                                             |
| `altura_px`                 | inteiro positivo                                                                                             |
| `sha256_plaintext`          | `BYTEA`, exatamente 32 bytes                                                                                 |
| `normalizacao_versao`       | versão do algoritmo de recorte/validação                                                                     |
| `criptografia_atual_id`     | referência explícita ao envelope criptográfico atual                                                         |
| `origem`                    | `cadastro`, `substituicao`, `confirmacao_legado`, `migracao`, `recadastro`                                   |
| `versao_legada_origem_id`   | referência à versão histórica confirmada                                                                     |
| `modalidade_captura`        | `autonoma` ou `assistida`                                                                                    |
| `assistencia_tipo`          | código controlado, quando assistida                                                                          |
| `criada_em`                 | data oficial do servidor                                                                                     |
| `criada_por_usuario_id`     | titular; nulo somente em migração técnica                                                                    |
| `reauth_id`                 | prova de reautenticação                                                                                      |
| `substituida_em`            | ciclo de vida                                                                                                |
| `substituida_por_versao_id` | self-FK                                                                                                      |
| `revogada_em`               | ciclo de vida                                                                                                |
| `revogada_por_usuario_id`   | autor da revogação                                                                                           |
| `motivo_revogacao`          | obrigatório quando revogada                                                                                  |
| `migracao_lote_id`          | rastreabilidade do legado                                                                                    |

Constraints:

- `UNIQUE (assinatura_pessoal_id, numero_versao)`;
- índice único parcial permitindo no máximo uma versão `valida` por cadastro;
- `octet_length(sha256_plaintext) = 32`;
- versão `valida` exige `png_canonico`, MIME, tamanho e dimensões válidos;
- `quarentena` pode conter conteúdo legado que não seja PNG válido;
- hash não é globalmente único;
- versão histórica, substituída ou revogada não pode voltar diretamente a `valida`;
- bytes lógicos, dimensões e hash são imutáveis;
- nenhum `DELETE` enquanto houver referência documental.

Índices:

- `(assinatura_pessoal_id, numero_versao)`;
- `(assinatura_pessoal_id, estado)`;
- índice não único em `sha256_plaintext`;
- `versao_legada_origem_id`;
- `reauth_id`;
- `migracao_lote_id`.

### 3.3 `assinatura_versao_criptografias`

Finalidade: separar a versão lógica imutável do envelope criptográfico, permitindo rotação de chave sem criar nova assinatura pessoal.

| Coluna                 | Tipo/contrato                                       |
| ---------------------- | --------------------------------------------------- |
| `id`                   | PK                                                  |
| `assinatura_versao_id` | FK `ON DELETE RESTRICT`                             |
| `numero_envelope`      | inteiro positivo                                    |
| `estado`               | `atual`, `substituido`, `comprometido`              |
| `algoritmo`            | inicialmente recomendado `AES-256-GCM`              |
| `versao_chave`         | identificador opaco da chave externa                |
| `nonce`                | binário, único por chave                            |
| `auth_tag`             | tag de autenticação                                 |
| `ciphertext`           | `BYTEA NOT NULL`                                    |
| `sha256_ciphertext`    | 32 bytes                                            |
| `aad_versao`           | versão do contrato de dados autenticados adicionais |
| `criado_em`            | data da criptografia                                |
| `rotacionado_em`       | data de substituição                                |
| `rotacionado_de_id`    | envelope anterior                                   |

Invariantes:

- chave nunca fica no banco;
- nonce nunca se repete para a mesma chave;
- somente um envelope atual por versão;
- AAD deve vincular no mínimo versão, usuário, hash do conteúdo e versão do schema;
- rotação cria novo envelope e só depois troca `criptografia_atual_id`;
- falha de descriptografia ou tag bloqueia a imagem e gera auditoria crítica;
- nenhuma falha pode retornar conteúdo parcial.

Índices/constraints:

- `UNIQUE (assinatura_versao_id, numero_envelope)`;
- único parcial por versão com `estado = 'atual'`;
- `UNIQUE (versao_chave, nonce)`;
- checks de tamanho de nonce/tag conforme o algoritmo;
- índice em `versao_chave` para rotação.

### 3.4 `assinatura_regularizacoes`

Finalidade: controlar ausência, recadastro, migração e bloqueio.

| Coluna                       | Contrato                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`                         | PK                                                                                                        |
| `usuario_id`                 | FK                                                                                                        |
| `assinatura_pessoal_id`      | FK                                                                                                        |
| `tipo`                       | `ausencia`, `confirmacao_legado`, `duplicidade_legada`, `revogacao`, `imagem_invalida`, `comprometimento` |
| `escopo_bloqueio`            | `facultativo`, `acao_assinada`, `global`                                                                  |
| `estado`                     | `aberta`, `resolvida`, `cancelada`                                                                        |
| `versao_historica_id`        | versão que poderá ser confirmada ou que motivou recadastro                                                |
| `permite_confirmacao_legado` | booleano                                                                                                  |
| `aberta_em`, `aberta_por`    | rastreabilidade                                                                                           |
| `resolvida_em`               | data                                                                                                      |
| `resolvida_por_versao_id`    | nova versão válida                                                                                        |
| `ultimo_lembrete_em`         | controle de lembrete                                                                                      |
| `quantidade_lembretes`       | inteiro                                                                                                   |
| `detalhes_seguros`           | JSON sem imagem ou segredo                                                                                |

Invariantes:

- uma regularização aberta principal por usuário;
- `global` bloqueia módulos de negócio;
- `acao_assinada` bloqueia somente a operação que exige assinatura;
- resolver exige versão válida;
- 76 e 442 não podem receber `permite_confirmacao_legado = true`.

### 3.5 `assinatura_analises_seguranca`

Finalidade: analisar duplicidade entre usuários, suspeita de fraude e comprometimento.

Colunas principais:

- `id UUID`, PK;
- `tipo`: `duplicidade_hash`, `suspeita_fraude`, `falha_criptografica`;
- `versao_candidata_id`;
- `estado`: `aberta`, `em_analise`, `liberada`, `rejeitada`, `encerrada`;
- `aberta_em`, `aberta_por`;
- `decidida_em`, `decidida_por`;
- `justificativa_decisao`;
- `reauth_id`;
- `request_id`;
- dados seguros de contexto.

Tabela associativa `assinatura_analise_versoes`:

- análise;
- versão conflitante;
- usuário titular;
- papel `candidata` ou `comparada`.

Regras:

- a tentativa é preservada criptografada;
- a versão candidata fica `pendente_analise`;
- não se torna atual antes da liberação;
- a análise não presume fraude;
- liberar pode ativar a versão, preservando a prova original e a decisão;
- rejeitar mantém evidência e exige nova regularização.

### 3.6 `documentos_assinados`

Finalidade: registrar documento final ou snapshot formal de fechamento.

| Coluna                         | Contrato                                                     |
| ------------------------------ | ------------------------------------------------------------ |
| `id`                           | PK UUID ou BIGINT                                            |
| `modulo`                       | código controlado                                            |
| `tipo_documento`               | código específico                                            |
| `entidade_origem_id`           | identificador do módulo                                      |
| `documento_fonte_id`           | self-FK para snapshot de fechamento ou documento substituído |
| `documento_anterior_id`        | original de uma substituição                                 |
| `estado`                       | `finalizado`, `anulado`, `substituido`, `legado`             |
| `versao_modelo`                | versão do modelo/termo                                       |
| `dados_snapshot`               | dados congelados necessários à interpretação/reprodução      |
| `artefato_ref`                 | referência imutável ao PDF/documento                         |
| `artefato_sha256`              | 32 bytes                                                     |
| `legado_sem_imagem_assinatura` | booleano                                                     |
| `finalizado_em`                | servidor                                                     |
| `finalizado_por`               | usuário/processo                                             |
| `criado_em`                    | auditoria                                                    |

Constraints:

- unicidade por módulo, tipo, origem e geração documental;
- artefato e snapshot não podem ser sobrescritos;
- correção cria novo documento com `documento_anterior_id`;
- documento antigo permanece preservado.

Para certificados, o encerramento da turma cria um documento-fonte do tipo `certificacao_turma_fechamento`, mesmo que não seja um PDF entregue ao usuário. Suas assinaturas congeladas serão a fonte das emissões posteriores.

### 3.7 `documento_assinaturas`

Finalidade: registrar o uso imutável da versão em documento ou fechamento.

| Coluna                       | Contrato                       |
| ---------------------------- | ------------------------------ |
| `id`                         | PK                             |
| `documento_assinado_id`      | FK `ON DELETE RESTRICT`        |
| `assinatura_versao_id`       | FK `ON DELETE RESTRICT`        |
| `usuario_id`                 | titular no momento             |
| `unidade_id_snapshot`        | quando aplicável               |
| `contexto_ativo_snapshot`    | área/contexto utilizado        |
| `perfis_snapshot`            | perfis relevantes no momento   |
| `nome_snapshot`              | texto exibido                  |
| `cargo_snapshot`             | texto exibido                  |
| `papel_snapshot`             | papel documental               |
| `ordem`                      | inteiro positivo               |
| `assinatura_sha256_snapshot` | hash da versão                 |
| `autorizacao_snapshot`       | regra/designação que autorizou |
| `utilizada_em`               | servidor                       |
| `criado_em`                  | auditoria                      |

Constraints:

- `UNIQUE (documento_assinado_id, ordem)`;
- versão, snapshots, papel e ordem imutáveis;
- versão revogada posteriormente continua referenciada;
- nenhuma versão atual é consultada para visualizar o documento;
- documento legado sem imagem usa a flag documental, não uma assinatura retroativa falsa.

### 3.8 `auth_sessoes`

Dependência do contrato de autenticação global.

Colunas mínimas:

- `id UUID`, PK;
- `usuario_id`;
- `metodo_autenticacao`;
- `criada_em`, `ultimo_uso_em`, `expira_em`;
- `rotacionada_em`, `rotacionada_de_id`;
- `revogada_em`, `revogada_por`, `motivo_revogacao`;
- identificação segura de dispositivo;
- IP/user-agent conforme política;
- versão de segurança da sessão.

Índice parcial em `(usuario_id, expira_em)` para sessões não revogadas.

O token autenticado deve conter ou resolver `session_id`. JWT sem estado revogável não atende ao contrato.

### 3.9 `auth_reautenticacoes`

Finalidade: prova de uso único para operação sensível.

Colunas:

- `id UUID`;
- `usuario_id`;
- `sessao_id`;
- `finalidade`;
- `metodo`;
- `estado`: `aguardando_mfa`, `pronta`, `consumida`, `expirada`, `cancelada`;
- `mfa_exigido`, `mfa_satisfeito`;
- `amr_snapshot`;
- `criada_em`;
- `autenticada_em`;
- `expira_em`, exatamente cinco minutos após autenticação;
- `consumida_em`;
- `operacao_idempotencia`;
- request ID/IP/user-agent.

Constraints:

- vinculada à mesma sessão e usuário;
- uma finalidade não pode ser reutilizada para outra;
- consumo ocorre na mesma transação da assinatura;
- expiração e consumo são verificados sob bloqueio;
- senha, credencial Google, código TOTP e recovery code nunca são persistidos.

### 3.10 `outbox_eventos`

Finalidade: garantir que a necessidade de aviso não seja perdida.

Colunas:

- `id UUID`;
- `tipo_evento`;
- `aggregate_type`, `aggregate_id`;
- `usuario_id`;
- `payload_protegido`;
- `idempotency_key`, única;
- `estado`: `pendente`, `processando`, `enviado`, `falha_temporaria`, `falha_definitiva`;
- `tentativas`;
- `proxima_tentativa_em`;
- `criado_em`, `processado_em`;
- `provider_message_id`;
- erro final sanitizado.

O `INSERT` da outbox faz parte da transação da assinatura. Falha do SMTP após o commit não desfaz a operação.

### 3.11 `auditoria_eventos`

A estrutura existente pode ser aproveitada, mas o contrato precisa:

- aceitar a conexão/transação corrente;
- registrar `perfis_snapshot` e `contexto_ativo`;
- operar obrigatoriamente como crítica para assinatura;
- nunca receber imagem, ciphertext, chave, senha, código MFA ou token;
- correlacionar assinatura, versão, reautenticação, sessão, documento e outbox.

## 4. Estados e transições

### Cadastro pessoal

```text
ausente
  ├─ desenho válido ─────────────────────────► valida
  ├─ desenho duplicado entre usuários ──────► em_analise
  └─ perfil adicional sem desenho ──────────► ausente + regularização global

pendente
  ├─ confirmação legada permitida ──────────► valida
  ├─ novo desenho válido ───────────────────► valida
  └─ duplicidade detectada ─────────────────► em_analise

valida
  ├─ substituição válida ───────────────────► valida (nova versão)
  ├─ tentativa duplicada ───────────────────► mantém atual + nova em análise
  └─ revogação ─────────────────────────────► revogada

em_analise
  ├─ liberação ─────────────────────────────► valida
  └─ rejeição ──────────────────────────────► pendente ou revogada

revogada
  └─ novo desenho válido ───────────────────► valida
```

### Versões

- `historica`: migração ou versão anterior preservada;
- `valida`: atual e utilizável;
- `substituida`: perdeu vigência prospectiva;
- `revogada`: bloqueada para novos documentos;
- `pendente_analise`: tentativa preservada aguardando decisão;
- `rejeitada`: não pode ser ativada;
- `quarentena`: legado inválido, preservado mas não exibível/confirmável;
- `eliminada`: conteúdo removido após retenção e processo controlado; metadados/auditoria permanecem conforme política aprovada.

Transições são unidirecionais. Uma versão histórica, substituída, rejeitada ou revogada nunca é reativada.

### Exigência de acesso

A exigência é calculada, não deve ser derivada apenas de `assinaturas_pessoais.estado`:

- somente `usuario`: `facultativa`;
- ação comum que exige assinatura: `acao_assinada`;
- qualquer perfil global adicional sem versão válida: `global`;
- regularização explícita pode elevar o escopo, como no usuário 442;
- remoção de todos os perfis adicionais reduz a exigência, mas preserva a assinatura.

## 5. Contrato final dos endpoints

Todas as mutações sensíveis exigem:

- sessão revogável;
- prova de reautenticação apropriada;
- MFA aplicável;
- `Idempotency-Key`;
- consumo transacional da prova;
- auditoria crítica;
- outbox;
- encerramento das demais sessões;
- rotação da sessão corrente.

### 5.1 Status próprio

`GET /api/me/assinatura/status`

Autorização: qualquer usuário autenticado; permitido durante bloqueio global.

Resposta `200`:

```json
{
  "ok": true,
  "data": {
    "estado": "pendente",
    "exigencia": "global",
    "access_mode": "signature_regularization_only",
    "versao_atual": null,
    "regularizacao": {
      "tipo": "confirmacao_legado",
      "permite_confirmacao": true
    },
    "mfa": {
      "obrigatorio": true,
      "configurado": false
    }
  }
}
```

Não retorna imagem, hash ou dados criptográficos.

### 5.2 Visualizar imagem atual

`GET /api/me/assinatura/imagem`

Autorização: titular autenticado.

Resposta:

- `200 image/png`;
- `Content-Disposition: inline`;
- `Cache-Control: private, no-store`;
- sem botão de download na interface.

Erros:

- `404 SIGNATURE_CURRENT_NOT_FOUND`;
- `409 SIGNATURE_NOT_VALID`;
- `503 SIGNATURE_DECRYPTION_FAILED`, com auditoria crítica.

O endpoint não permite escolher versão histórica.

### 5.3 Histórico de metadados

`GET /api/me/assinatura/versoes`

Retorna:

- número;
- data;
- estado;
- origem;
- modalidade de captura;
- motivo de substituição/revogação.

Não retorna imagem, ciphertext, nonce, hash ou identificador de chave.

### 5.4 Regularização

`GET /api/me/assinatura/regularizacao`

Permitido durante bloqueio global. Retorna motivo, escopo, opções disponíveis e se há legado confirmável.

`GET /api/me/assinatura/regularizacao/legado/imagem`

Exceção controlada para exibir a versão migrada durante confirmação:

- somente titular;
- somente regularização aberta;
- somente versão marcada como confirmável;
- `private, no-store`;
- não funciona para 76, 442 ou quarentena;
- acesso auditado;
- não integra o histórico geral.

### 5.5 Iniciar reautenticação

`POST /api/auth/reauth`

Request conforme a conta:

```json
{
  "finalidade": "assinatura:substituir",
  "metodo": "password",
  "senha_atual": "..."
}
```

Para conta somente Google: nova credencial Google.  
Para passkey: assertion conforme contrato global.

Resposta:

- `200`, prova pronta quando MFA não é necessário;
- `202`, desafio aguardando MFA;
- validade fixa de cinco minutos.

Erros:

- `401 REAUTHENTICATION_FAILED`;
- `409 REAUTHENTICATION_METHOD_INVALID`;
- `428 MFA_ENROLLMENT_REQUIRED`;
- `429 REAUTHENTICATION_RATE_LIMITED`.

### 5.6 Concluir MFA

`POST /api/auth/reauth/:reauth_id/mfa`

Request com TOTP, passkey ou recovery code conforme contrato global.

Resposta `200`: prova `pronta`.

Erros:

- `401 MFA_VERIFICATION_FAILED`;
- `409 REAUTHENTICATION_ALREADY_CONSUMED`;
- `410 REAUTHENTICATION_EXPIRED`;
- `429 MFA_RATE_LIMITED`.

### 5.7 Primeira versão

`POST /api/me/assinatura/versoes`

Multipart:

- `arquivo`: PNG resultante do desenho;
- `expected_current_version_id`: `null`;
- `reauth_id`;
- `confirmacao_expressa=true`;
- `modalidade_captura`;
- `assistencia_tipo`, quando aplicável.

Autorização: titular.

Respostas:

- `201 SIGNATURE_VERSION_CREATED`;
- `202 SIGNATURE_DUPLICATE_UNDER_REVIEW`.

Erros:

- `409 SIGNATURE_VERSION_CONFLICT`;
- `409 SIGNATURE_ALREADY_EXISTS`;
- `415 SIGNATURE_MEDIA_TYPE_INVALID`;
- `422 SIGNATURE_IMAGE_INVALID`;
- `422 SIGNATURE_IMAGE_EMPTY`;
- `422 SIGNATURE_IMAGE_TOO_LARGE`;
- `428 REAUTHENTICATION_REQUIRED`;
- `428 MFA_REQUIRED`.

### 5.8 Confirmar assinatura legada

`POST /api/me/assinatura/legado/confirmacoes`

Request:

```json
{
  "versao_historica_id": 123,
  "expected_current_version_id": null,
  "reauth_id": "...",
  "confirmacao_expressa": true
}
```

O backend:

1. valida que a versão é confirmável;
2. descriptografa;
3. valida/normaliza para PNG canônico;
4. cria nova versão;
5. usa origem `confirmacao_legado`;
6. preserva a versão migrada;
7. executa detecção de duplicidade.

Erros:

- `409 LEGACY_CONFIRMATION_NOT_ALLOWED`;
- `409 LEGACY_CONFIRMATION_FORBIDDEN_DUPLICATE`, para 76/442;
- `422 LEGACY_SIGNATURE_INVALID`;
- demais erros de reautenticação/MFA/concorrência.

### 5.9 Substituir

`POST /api/me/assinatura/substituicoes`

Multipart:

- PNG;
- `expected_current_version_id` obrigatório;
- `reauth_id`;
- confirmação expressa;
- modalidade assistida quando aplicável.

Resposta:

- `201 SIGNATURE_VERSION_REPLACED`;
- ou `202 SIGNATURE_DUPLICATE_UNDER_REVIEW`.

Enquanto uma tentativa duplicada estiver em análise, a versão atual anterior continua válida, salvo se houver comprometimento ou revogação explícita.

### 5.10 Revogação própria

`POST /api/me/assinatura/revogacoes`

Request:

```json
{
  "expected_current_version_id": 456,
  "reauth_id": "...",
  "confirmacao_expressa": true,
  "motivo": "..."
}
```

Resposta `200 SIGNATURE_REVOKED`.

Consequências:

- versão atual passa a revogada;
- cadastro perde a versão atual;
- documentos antigos permanecem;
- exigência global é recalculada.

### 5.11 Revogação por gestor

`POST /api/gestao/assinaturas/usuarios/:usuario_id/revogacoes`

Autorização: `gestor`, nunca para o próprio usuário.

Exige:

- justificativa;
- reautenticação;
- MFA;
- `expected_current_version_id`;
- auditoria crítica;
- notificação ao titular.

Erros:

- `403 SELF_ADMINISTRATIVE_REVOCATION_FORBIDDEN`;
- `403 SIGNATURE_MANAGEMENT_FORBIDDEN`;
- `422 REVOCATION_REASON_REQUIRED`.

### 5.12 Consulta administrativa de status

`GET /api/gestao/assinaturas`

Autorização padrão: `gestor`.

Retorna apenas:

- usuário;
- situação `valida`, `ausente`, `pendente`, `revogada`;
- exigência;
- data da última alteração;
- regularização aberta;
- data do último lembrete.

Não retorna imagem, versão criptográfica ou hash.

### 5.13 Reenviar lembrete

`POST /api/gestao/assinaturas/usuarios/:usuario_id/lembretes`

Autorização: `gestor`.

Cria evento de outbox; não envia SMTP dentro do request.

Respostas:

- `202 SIGNATURE_REMINDER_SCHEDULED`;
- `409 SIGNATURE_REMINDER_NOT_APPLICABLE`;
- `429 SIGNATURE_REMINDER_COOLDOWN`.

### 5.14 Análise de duplicidade

- `GET /api/gestao/assinaturas/analises`;
- `GET /api/gestao/assinaturas/analises/:id`;
- `POST /api/gestao/assinaturas/analises/:id/decisoes`.

A decisão recebe:

- `liberar` ou `rejeitar`;
- justificativa;
- reautenticação;
- MFA;
- versão esperada da análise.

A interface não deve expor imagens dos outros usuários por padrão. Comparação visual exige autorização formal específica.

### 5.15 Acesso administrativo excepcional à imagem

`POST /api/gestao/assinaturas/versoes/:id/visualizacoes`

Usar `POST`, pois a ação produz auditoria.

Request:

- finalidade formal;
- justificativa;
- processo/documento relacionado;
- reautenticação/MFA.

Resposta binária inline, sem URL permanente e `private, no-store`.

### 5.16 Possíveis assinantes por módulo

Exemplos:

- `GET /api/certificado/turmas/:id/assinantes-possiveis`;
- `GET /api/certificado/admin/avulso/assinantes-possiveis`;
- endpoints equivalentes para avaliação, parecer, relatório e CAI.

Não existe endpoint geral que transforme “possui assinatura” em autorização.

### 5.17 Login e perfil geral

Login e `/perfil/me` retornam somente:

```json
{
  "signature_status": "pendente",
  "signature_requirement": "global",
  "access_mode": "signature_regularization_only"
}
```

É proibido retornar:

- imagem;
- Base64;
- Data URL;
- hash;
- URL da imagem;
- metadados criptográficos.

## 6. Idempotência, concorrência e prova

### Idempotência

Toda mutação usa `Idempotency-Key`.

- mesma chave + mesmo usuário + mesmo payload: retorna o resultado original;
- mesma chave + payload diferente: `409 IDEMPOTENCY_KEY_REUSED`;
- o fingerprint considera hash do arquivo, versão esperada, finalidade e operação;
- retries após consumo da reautenticação podem recuperar o resultado original;
- lembretes, análises e revogações também são idempotentes.

### Concorrência

- `SELECT ... FOR UPDATE` no cadastro pessoal;
- `expected_current_version_id` obrigatório para substituir/revogar;
- primeira versão exige expectativa explícita de ausência;
- versão divergente retorna `409 SIGNATURE_VERSION_CONFLICT`;
- contador de versão é incrementado dentro do lock;
- análise de segurança também possui versão otimista.

### Consumo da reautenticação

Na mesma transação:

1. bloqueia `auth_reautenticacoes`;
2. valida usuário, sessão, finalidade, MFA e cinco minutos;
3. verifica que ainda não foi consumida;
4. executa a operação;
5. marca a prova como consumida;
6. registra auditoria/outbox;
7. revoga outras sessões;
8. rotaciona a atual;
9. confirma o commit.

## 7. Fluxo de regularização e bloqueio

O middleware backend calcula:

```text
assinatura válida?
perfil adicional?
regularização aberta?
escopo explícito da regularização?
```

Em bloqueio global, a allowlist contém somente:

- status;
- regularização;
- visualização legada confirmável;
- cadastro/confirmar/substituir/revogar;
- reautenticação;
- MFA necessário;
- logout.

Qualquer outro endpoint retorna:

- HTTP `423`;
- código `SIGNATURE_GLOBAL_PENDING`;
- mensagem segura;
- nenhuma informação técnica ou imagem.

O frontend:

- apresenta tela exclusiva de regularização;
- usa modal, não toast, para etapas de segurança;
- permite desenhar, revisar e confirmar;
- não tenta criar assinatura ao carregar;
- após conclusão, atualiza a sessão rotacionada e libera a navegação.

## 8. Fluxo de captura e validação visual

1. Área lógica responsiva equivalente a 900 × 300.
2. Entrada exclusiva por mouse, toque ou caneta.
3. Fundo transparente.
4. Traço preto ou muito escuro.
5. Usuário visualiza e confirma.
6. Frontend produz PNG multipart.
7. Backend:
   - valida assinatura PNG pelos magic bytes;
   - decodifica com biblioteca segura;
   - valida MIME real;
   - verifica dimensões;
   - detecta pixels visíveis;
   - rejeita imagem vazia ou praticamente invisível;
   - recorta apenas margens transparentes;
   - preserva proporção e traços;
   - não estica;
   - gera PNG canônico;
   - rejeita resultado superior a 500 KB;
   - calcula SHA-256 antes da criptografia;
   - verifica duplicidade entre usuários;
   - criptografa e persiste.

Assistência operacional é registrada, mas a confirmação permanece do titular.

## 9. Segurança transacional

Para cadastro, confirmação, substituição e revogação:

1. sessão válida;
2. reautenticação pelo método da conta;
3. MFA obrigatório para `gestor`, `administrador`, `diagnostico` e `cai_administrador`, ou quando já habilitado;
4. prova de cinco minutos e uso único;
5. validação/criptografia;
6. persistência da versão;
7. auditoria crítica;
8. outbox;
9. revogação das demais sessões;
10. rotação da sessão atual;
11. commit.

Falhas antes do commit:

- auditoria não registrada;
- outbox não registrada;
- prova inválida;
- criptografia indisponível;
- concorrência;
- banco indisponível;

devem abortar a operação.

Falha posterior do SMTP não desfaz a assinatura. A outbox tenta novamente e, ao atingir falha definitiva, cria alerta administrativo e nova auditoria crítica.

## 10. Integração por módulo

### 10.1 Perfis e designações

- `usuario` existe para todos;
- perfil adicional exige versão válida;
- contexto ativo não concede permissão;
- designação de domínio permanece separada;
- designação de organizador pode ser salva sem assinatura;
- pessoa inapta fica ausente das listas backend de candidatos;
- nenhuma designação é removida automaticamente.

### 10.2 Reserva de salas

Autorização: somente perfil `institucional`.

Fluxo:

1. consulta status;
2. se necessário, regulariza;
3. envia `expected_signature_version_id`;
4. nunca envia imagem/base64;
5. backend valida perfil, contexto/unidade e versão sob lock;
6. usa data do servidor;
7. congela usuário, unidade, contexto, nome, cargo, termo e versão;
8. cria artefato e hash.

Invalidam o aceite:

- sala;
- data;
- período;
- finalidade;
- quantidade;
- coffee break;
- texto ou versão do termo.

Não invalidam:

- status;
- observação administrativa;
- confirmação de uso;
- registros internos.

Qualquer alteração invalidante cria novo aceite/documento. O anterior é preservado.

### 10.3 Certificados regulares

No encerramento formal da turma:

1. validar Rafaella Pitol Corrêa como obrigatória;
2. incluir Fábio Lopez somente quando selecionado;
3. permitir organizador opcional apenas se formalmente designado;
4. limitar a três;
5. validar versões atuais;
6. bloquear encerramento se algum selecionado estiver inapto;
7. congelar versão, nome, cargo, papel e ordem em documento-fonte.

Após o encerramento:

- revogação pessoal não afeta o conjunto congelado;
- certificado e segunda via usam o snapshot;
- reconstrução usa apenas dados congelados;
- não usar configuração atual da turma.

Antes do encerramento, revogação torna o assinante inapto e exige regularização ou substituição da configuração.

### 10.4 Certificados avulsos

- Rafaella obrigatória;
- Fábio opcional;
- terceiro somente organizador formalmente selecionado para a emissão;
- no máximo três;
- endpoint próprio de candidatos;
- snapshot e versões congelados na emissão;
- PDF e segunda via não consultam dados atuais.

### 10.5 Organizadores

A assinatura não é aplicada a:

- presença;
- rascunho;
- atualização intermediária.

Só é vinculada no envio final, fechamento definitivo, relatório, declaração ou documento formal.

### 10.6 Avaliadores

Assina somente:

- avaliação final;
- parecer final;
- envio definitivo.

O snapshot inclui versão, critérios, notas, submissão, contexto e data. Nota parcial e rascunho não geram uso documental.

### 10.7 Relatoria e CAI

- `relator`: relatório ou parecer final;
- `cai_coordenador`: manifestação, decisão ou documento concluído;
- `cai_administrador`: somente quando responsável formal;
- múltiplos responsáveis geram múltiplas linhas ordenadas em `documento_assinaturas`.

### 10.8 Administrador, gestor e diagnóstico

Não aplicar imagem em:

- concessão/remoção de perfil;
- bloqueio;
- configuração;
- ação administrativa comum.

Essas operações usam autenticação, MFA, reautenticação quando aplicável e auditoria.

`diagnostico` não assina documentos.

## 11. Migração das 103 assinaturas

### 11.1 Inventário vinculante

- 103 assinaturas;
- 76 Data URL PNG;
- 27 Base64 puro;
- 77 usuários com perfil adicional;
- 42 desses possuem assinatura legada;
- 35 não possuem assinatura;
- 61 assinaturas de usuários que permanecerão somente `usuario`;
- usuários 76 e 442 com bytes idênticos;
- 11 reservas vinculadas às versões de 76/442.

### 11.2 Regra central

Todas as 103 entram como versões históricas. Nenhuma se torna atual ou confirmada automaticamente.

Para cada linha:

1. preservar ID e formato de origem;
2. extrair e decodificar de modo estrito;
3. validar PNG real;
4. calcular hash;
5. criptografar;
6. criar versão `historica`;
7. registrar mapeamento legado;
8. nunca renderizar pelo nome.

Se inválida:

- preservar fonte em `quarentena`;
- não exibir para confirmação;
- exigir novo desenho;
- não gerar substituto.

### 11.3 Regularização projetada

Dos 77 com perfil adicional:

- 35, sem assinatura: precisam desenhar;
- 41, com legado confirmável: podem confirmar ou redesenhar;
- usuário 442: precisa redesenhar;
- todos ficam em bloqueio global no primeiro acesso após o cutover.

Dos 61 que permanecerão somente `usuario`:

- não sofrem bloqueio global;
- versões permanecem históricas;
- confirmam ou desenham somente quando uma ação exigir assinatura ou se receberem perfil adicional;
- usuário 76 nunca pode confirmar a imagem duplicada.

### 11.4 Confirmação do legado

Confirmar não ativa a versão migrada.

A operação:

- lê a histórica;
- cria nova versão canônica;
- origem `confirmacao_legado`;
- usa data atual;
- exige reautenticação/MFA;
- executa auditoria, outbox e encerramento de sessões;
- preserva a histórica.

## 12. Usuários 76 e 442

Para ambos:

- versões históricas separadas;
- mesmo hash permitido;
- nenhuma deduplicação;
- nenhuma confirmação da imagem antiga;
- nenhuma exclusão da evidência;
- novo desenho obrigatório para adquirir versão válida.

Usuário 76:

- permanece somente `usuario`;
- não sofre bloqueio global;
- antiga imagem continua ligada aos documentos;
- desenha quando uma ação exigir assinatura ou ao receber perfil adicional.

Usuário 442:

- possui perfil adicional;
- regularização global bloqueante;
- precisa redesenhar no primeiro acesso após o cutover.

## 13. Tratamento das 11 reservas

Durante a migração:

1. identificar cada reserva e seu `assinaturas.id` legado;
2. mapear para a versão histórica correspondente do usuário;
3. criar `documentos_assinados` e `documento_assinaturas`;
4. congelar usuário, unidade, contexto, nome, cargo, termo e data existentes;
5. preservar os bytes/hash originais;
6. impedir que futuras consultas usem `versao_atual_id`;
7. impedir edição das condições assinadas;
8. manter qualquer artefato existente;
9. se o termo era gerado dinamicamente, criar snapshot histórico antes do cutover.

As versões históricas de 76 e 442 continuam válidas exclusivamente para provar essas reservas antigas, não para novos documentos.

## 14. Preservação documental

### Documento com assinatura

- versão referenciada por FK;
- imagem incorporada;
- snapshots imutáveis;
- artefato e hash;
- reconstrução somente com dados congelados.

### Documento antigo sem imagem

- marcar `legado_sem_imagem_assinatura = true`;
- preservar exatamente;
- não adicionar imagem;
- não reconstruir com versão atual.

Correção:

1. cria documento substitutivo;
2. mantém original;
3. relaciona ambos;
4. registra motivo e auditoria.

### Revogação/fraude

- bloqueia uso futuro;
- preserva documentos;
- análise individual decide manter, anular ou substituir;
- nunca apaga evidência.

## 15. Componentes legados a remover

Backend:

- autogeração em `GET /api/assinatura`;
- `/api/assinatura/auto`;
- `ensureAutoSignature`;
- `renderSignatureFallbackPng`;
- tentativa de `../utils/signature`;
- [assinaturaAutoService.js](C:/Users/t0102815/escoladasaude/backend/src/services/assinaturaAutoService.js:165);
- [assinaturaAuto.js](C:/Users/t0102815/escoladasaude/backend/src/utils/assinaturaAuto.js:367);
- [usuarioAssinaturaController.js](C:/Users/t0102815/escoladasaude/backend/src/controllers/usuarioAssinaturaController.js:65);
- UPSERT em [salaController.js](C:/Users/t0102815/escoladasaude/backend/src/controllers/salaController.js:516);
- aceitação de `assinatura_base64`;
- JOIN de reserva com assinatura pessoal atual;
- endpoint geral `/assinatura/lista` como fonte documental;
- JOIN direto de certificados com a imagem atual;
- emissão sem imagem;
- reconstrução de PDF com dados atuais;
- `imagem_base64` no login;
- exclusão automática da assinatura no encerramento de conta;
- tabela antiga após cutover e retenção da ponte de auditoria.

Frontend:

- facade `assinatura.auto`;
- envio Base64/Data URL em JSON;
- telas que consultam assinatura e provocam criação;
- mensagens afirmando comportamento divergente;
- armazenamento da imagem em sessão/localStorage;
- cópia órfã [TermosDeUso.jsx](C:/Users/t0102815/escoladasaude/frontend/src/pages/TermosDeUso.jsx:1);
- listas gerais de assinaturas;
- fallbacks de múltiplos formatos antigos após o encerramento da compatibilidade.

## 16. Ordem segura de implementação

1. Aprovar as poucas decisões pendentes da seção 19.
2. Inspecionar `pg_catalog`, FKs, triggers, views e dependências reais.
3. Fazer backup e inventário reproduzível.
4. Implantar perfis independentes, contexto ativo validado e sessões revogáveis.
5. Implantar reautenticação e MFA global.
6. Criar tabelas centrais, criptografia, auditoria transacional e outbox.
7. Disponibilizar APIs novas atrás de feature flag.
8. Bloquear novas escritas/autogerações legadas durante o snapshot de migração.
9. Migrar as 103 como históricas.
10. Criar regularizações para os 77 perfis adicionais.
11. Criar tratamento específico de 76 e 442.
12. Congelar e mapear as 11 reservas.
13. Reconciliar contagens, formatos, hashes, referências e criptografia.
14. Liberar captura/regularização nova.
15. Migrar reserva de salas.
16. Migrar encerramento e certificados regulares.
17. Migrar certificados avulsos.
18. Migrar avaliações, pareceres, relatórios e CAI.
19. Ativar bloqueio global backend.
20. Encerrar todas as escritas legadas.
21. Monitorar período de estabilização.
22. Remover endpoints, serviços, fallbacks e tabela antiga.
23. Manter mapeamento de migração e auditoria pelo prazo aplicável.

Não manter dual-write indefinidamente.

## 17. Testes necessários

### Imagem

- PNG válido multipart;
- rejeição de Base64/Data URL JSON;
- magic bytes inválidos;
- MIME falso;
- imagem vazia/transparente;
- pontos imperceptíveis;
- traço claro demais;
- tamanho superior a 500 KB;
- dimensões inválidas;
- recorte transparente sem eliminar traços;
- preservação de proporção;
- desenho assistido.

### Criptografia

- encrypt/decrypt;
- nonce único;
- tag alterada;
- chave incorreta;
- chave ausente;
- rotação de chave;
- hash plaintext antes/depois;
- bloqueio e auditoria na falha;
- ausência de bytes/chaves em logs.

### Versionamento

- primeira versão;
- substituição;
- conflito por `expected_current_version_id`;
- duas substituições concorrentes;
- versão anterior histórica;
- revogação;
- documentos continuam apontando para versão anterior;
- versão atual nunca inferida por ID/data.

### Duplicidade

- mesmo hash no próprio histórico;
- mesmos bytes em outro usuário;
- tentativa preservada;
- nenhuma ativação automática;
- liberação;
- rejeição;
- 76/442 não confirmáveis;
- hash não único globalmente.

### Autenticação e sessões

- senha local;
- nova autenticação Google;
- passkey;
- prova expira em cinco minutos;
- finalidade incorreta;
- sessão diferente;
- prova reutilizada;
- MFA obrigatório por perfil;
- MFA habilitado voluntariamente;
- recovery code;
- encerramento das demais sessões;
- rotação da atual.

### Auditoria/outbox

- falha da auditoria causa rollback;
- falha ao inserir outbox causa rollback;
- falha SMTP não reverte;
- retries;
- falha definitiva e alerta;
- idempotência;
- auditoria sem imagem/segredo.

### Autorização

- somente `usuario` navega sem assinatura;
- ação assinada retorna `428`;
- perfil adicional retorna bloqueio global;
- allowlist restrita;
- frontend não contorna backend;
- remoção do último perfil adicional preserva assinatura;
- designação sem assinatura é salva, mas não vira candidato.

### Módulos

- reserva somente institucional;
- alterações invalidantes exigem novo aceite;
- alterações administrativas não exigem;
- certificados congelam no encerramento;
- revogação posterior não afeta emissão;
- revogação anterior bloqueia encerramento;
- avulso usa endpoint próprio;
- rascunhos não são assinados;
- avaliações/pareceres apenas no envio final;
- CAI e relatoria respeitam papel formal;
- administrador/gestor/diagnóstico não aplicam imagem em ações administrativas comuns.

### Migração

- exatamente 103 versões históricas;
- exatamente 76 Data URL e 27 Base64 puro;
- nenhuma versão atual criada automaticamente;
- 77 regularizações globais;
- 35 sem legado;
- 41 confirmáveis entre os perfis adicionais;
- 442 redesenho obrigatório;
- 61 usuários somente `usuario` sem bloqueio global;
- 76 sem confirmação;
- 11 reservas ligadas às versões corretas;
- igualdade dos bytes/hashes antes e depois;
- quarentena para inválidas.

### Preservação documental

- alteração pessoal não muda PDF antigo;
- segunda via usa snapshot;
- arquivo ausente não provoca consulta de dados atuais;
- documento legado sem imagem não recebe imagem retroativa;
- substitutivo preserva original.

## 18. Critérios de aceite

O sistema só pode ser considerado concluído quando:

1. Nenhum GET cria ou altera assinatura.
2. Não existe autogeração, fallback nominal ou cópia entre usuários.
3. Apenas PNG multipart desenhado na plataforma é aceito.
4. Toda versão utilizável tem até 500 KB, validação física, hash e criptografia.
5. Nenhum login/perfil/localStorage contém imagem.
6. Toda criação/substituição/revogação exige reautenticação e MFA aplicável.
7. A prova expira em cinco minutos e só pode ser usada uma vez.
8. Outras sessões são revogadas e a atual rotacionada.
9. Auditoria crítica e outbox fazem parte da transação.
10. Toda versão atual é indicada explicitamente.
11. Todo documento final aponta para versão imutável.
12. Alterar ou revogar assinatura não muda documento antigo.
13. Candidatos são filtrados no backend por módulo.
14. Organizador sem assinatura permanece designado, mas não aparece como candidato.
15. Reserva só pode ser solicitada por `institucional`.
16. Certificado não pode emitir assinante sem imagem válida.
17. Congelamento regular ocorre no encerramento formal da turma.
18. As 103 imagens entram somente como histórico.
19. As 11 reservas permanecem ligadas às versões históricas corretas.
20. 76 e 442 não podem confirmar a imagem duplicada.
21. Usuário 442 fica globalmente bloqueado; 76 não.
22. Documentos antigos sem imagem permanecem inalterados.
23. Falha de descriptografia não expõe conteúdo parcial.
24. Logs não contêm imagem, bytes, ciphertext, chaves, senhas ou códigos MFA.
25. Workflows de fraude preservam evidências.

## 19. Riscos e controles

| Risco                                 | Controle                                                      |
| ------------------------------------- | ------------------------------------------------------------- |
| Perda/indisponibilidade de chave      | gestão externa, versionamento, backup e rotação testada       |
| Reutilização de nonce                 | constraint por chave e geração criptográfica                  |
| Falso positivo de duplicidade         | análise humana, sem acusação automática                       |
| Assinatura vazia passar               | validação de alpha, cor, área e bounding box                  |
| Bloqueio dos 77 usuários              | comunicação prévia, fluxo completo e suporte antes do cutover |
| Corrida de substituições              | lock + versão esperada + idempotência                         |
| Documento reconstruído incorretamente | snapshots, versão fixa e artefato hash                        |
| Migração mudar bytes                  | hash plaintext e reconciliação                                |
| Reserva histórica mudar               | congelamento das 11 antes do cutover                          |
| Outbox acumular                       | monitoramento, retries e alerta definitivo                    |
| Banco crescer com BYTEA               | limite de 500 KB, índices sem conteúdo, monitoramento Neon    |
| Acesso administrativo abusivo         | finalidade, justificativa, reautenticação/MFA e auditoria     |
| Imagem em logs/telemetria             | redaction central e testes automatizados                      |
| Exclusão de conta apagar evidência    | FKs `RESTRICT` e retenção documental                          |
| Reabertura indevida de versão         | máquina de estados irreversível                               |
| Dual-write inconsistente              | janela controlada e remoção contratual do legado              |

## 20. Decisões realmente pendentes

As demais decisões do contrato estão fechadas. Restam somente:

1. Provedor e operação das chaves: KMS/secret manager escolhido, política de acesso e periodicidade de rotação. O contrato recomenda AEAD com AES-256-GCM.
2. Limiares numéricos para considerar um traço visível ou “praticamente imperceptível”, incluindo alpha, luminância, área mínima e bounding box. Precisam de calibração acessível antes do aceite.
3. Qual permissão/capacidade específica autoriza:
   - análise de duplicidade;
   - investigação de fraude;
   - visualização administrativa excepcional;
   - recebimento dos alertas administrativos.
4. Prazo de retenção de cada classe documental. Está decidido apenas que versão usada acompanha o documento e versão substituída nunca usada permanece por no mínimo cinco anos.
5. Forma de eliminação após o prazo: remoção física do ciphertext, destruição criptográfica da chave ou combinação, preservando os metadados permitidos.
6. Política para reabertura formal de turma/curso depois de criado o snapshot de encerramento: manter o snapshot anterior e criar novo fechamento ou proibir reabertura documental.
7. Tratamento de uma nova captura cujos bytes sejam idênticos à versão atual do próprio usuário: criar nova versão, recusar como operação sem mudança ou pedir novo desenho.
8. Quantidade, intervalos e prazo que transformam uma falha temporária da outbox em falha definitiva.
9. Janela operacional de cutover e duração do bloqueio temporário das escritas legadas.

Nenhuma decisão já aprovada no anexo foi reaberta.

O escopo somente leitura foi preservado: não houve patch, migration, teste, acesso ao banco ou modificação do repositório. `git status` e `git diff` permaneceram vazios.
