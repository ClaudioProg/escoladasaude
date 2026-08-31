# Escola da Saúde API

API oficial da **Plataforma da Escola da Saúde**, responsável por sustentar os módulos de **eventos**, **turmas**, **inscrições**, **presenças**, **avaliações**, **certificados**, **assinaturas**, **informações institucionais**, **chamadas de trabalhos**, **submissões**, **votações**, **questionários** e demais recursos administrativos da plataforma.

Esta API foi estruturada para operar em ambiente moderno, com foco em:

- segurança
- robustez
- compatibilidade com frontend web/PWA
- persistência de arquivos
- controle de acesso por perfil
- compatibilidade com deploy em produção

---

## Visão geral

A plataforma foi desenvolvida para centralizar processos institucionais da Escola da Saúde, permitindo que usuários, organizadores e administradores realizem operações como:

- autenticação local e via Google
- cadastro e atualização de perfil
- gestão de eventos e turmas
- inscrições em cursos
- controle de presença
- envio e leitura de avaliações
- geração e validação de certificados
- publicação de informações institucionais
- assinatura digital
- abertura e gestão de votações
- gerenciamento de chamadas e submissões de trabalhos
- dashboards e relatórios administrativos

---

## Stack principal

- **Node.js**
- **Express**
- **PostgreSQL**
- **JWT**
- **Google OAuth**
- **Multer**
- **Nodemailer**
- **PDFKit**
- **Canvas**
- **Helmet**
- **CORS**
- **Morgan**
- **Luxon**
- **Zod** em partes do ecossistema

---

## Estrutura principal do projeto

```bash
.
├── server.js
├── package.json
├── .env.example
├── src/
│   ├── auth/
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── validators/
│   ├── db/
│   └── paths.js
├── public/
├── scripts/
└── uploads/ / data/ (ambiente local, não versionados)
```

---

## Compatibilidade temporária de autenticação legada

`LEGACY_AUTH_LOOP_BREAKER_ENABLED` controla o breaker distribuído e one-shot
de `GET /api/auth/me` para clientes históricos sem uma assinatura moderna
válida em `X-Client-Build`. O valor seguro padrão é `false`; somente `1`,
`true`, `yes` ou `on` (sem distinção entre maiúsculas e minúsculas) habilitam o
mecanismo.

A migration `2026-08-31-legacy-auth-loop-breaker.sql` deve estar aplicada antes
de habilitar a flag. Desabilitar a flag reverte imediatamente o comportamento
do endpoint sem remover os adapters legados. O estado usa apenas SHA-256 do JWT,
expira por TTL e nunca persiste o token ou o header `Authorization`.

O 426 é one-shot por episódio. Depois do disparo, o cooldown de 10 segundos
não é renovado pelas chamadas que continuam chegando: elas recebem a resposta
normal. Encerrado o cooldown, o mesmo token pode iniciar uma nova janela e só
receber outra tentativa de 426 se atingir novamente 20 chamadas em 2 segundos.

Clientes históricos afetados pelo mecanismo de migração podem precisar realizar
um novo login uma única vez após a atualização, pois o fluxo de compatibilidade
pode encerrar a sessão legada para liberar a ativação do Service Worker atual.
Esse comportamento é esperado somente como parte da transição do cliente legado
para a versão atual; não significa que todos os usuários serão desconectados.

### Ordem segura de produção

1. Aplicar a migration PostgreSQL.
2. Confirmar o schema criado.
3. Publicar o backend candidato com
   `LEGACY_AUTH_LOOP_BREAKER_ENABLED=false`.
4. Executar o smoke do backend.
5. Confirmar que o frontend e o SW migratório atuais estão disponíveis.
6. Confirmar o conteúdo correto de `/sw.js`.
7. Somente então habilitar `LEGACY_AUTH_LOOP_BREAKER_ENABLED=true`.
8. Monitorar triggers e erros técnicos do breaker.
9. Em caso de risco, desligar imediatamente a flag, sem rollback de código ou
   schema.

Nunca habilite o breaker antes de migration, backend e SW estarem prontos.
