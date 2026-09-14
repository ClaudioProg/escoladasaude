import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const listagem = fs.readFileSync(path.join(directory, "Eventos.jsx"), "utf8");
const detalhe = fs.readFileSync(
  path.join(directory, "EventoDetalhe.jsx"),
  "utf8",
);
const app = fs.readFileSync(path.join(directory, "../App.jsx"), "utf8");
const privateRoute = fs.readFileSync(
  path.join(directory, "../components/layout/PrivateRoute.jsx"),
  "utf8",
);
const login = fs.readFileSync(path.join(directory, "Login.jsx"), "utf8");

test("card da vitrine é padronizado, mostra ocupação e abre a rota dedicada", () => {
  assert.match(listagem, /min-h-\[540px\]/);
  assert.match(listagem, /vagas\s+ocupadas/);
  assert.match(listagem, />\s*Abrir\s*</);
  assert.match(listagem, /eventoPath\(evento\.id\)/);
  assert.doesNotMatch(listagem, /ListaTurmasEvento/);
  assert.doesNotMatch(listagem, /ModalPreTesteInscricao/);
});

test("carregamento mantém a resposta da API como coleção antes de filtrar e ordenar", () => {
  assert.match(
    listagem,
    /const lista = await EventoService\.publico\.listarParaMim\(\)/,
  );
  assert.match(
    listagem,
    /const eventosVisiveis = filtrarEventosVitrine\(lista \|\| \[\]\);/,
  );
  assert.match(
    listagem,
    /setEventos\(eventosVisiveis\.sort\(sortEventosPublicos\)\)/,
  );
  assert.doesNotMatch(listagem, /sortEventosPublicos\(filtrarEventosVitrine\(/);
});

test("página dedicada reúne turmas, inscrição, cancelamento e atualização", () => {
  assert.match(detalhe, /ListaTurmasEvento/);
  assert.match(detalhe, /EventoService\.inscricao\.inscrever/);
  assert.match(detalhe, /EventoService\.inscricao\.cancelar/);
  assert.match(detalhe, /Cancelar inscrição/);
  assert.match(detalhe, /await carregar\(\)/);
  assert.match(detalhe, /ModalConfirmacao/);
});

test("QR e compartilhamento usam a URL canônica sem credenciais", () => {
  assert.match(detalhe, /QRCodeSVG[\s\S]*?value=\{urlCanonica\}/);
  assert.match(detalhe, /navigator\.share/);
  assert.match(detalhe, /navigator\.clipboard\.writeText\(urlCanonica\)/);
  assert.doesNotMatch(detalhe, /getToken|localStorage|cpf|usuario_id/);
});

test("rota do evento é privada e o layout protege larguras móveis", () => {
  assert.match(app, /path="eventos\/:id" element=\{<EventoDetalhe \/>\}/);
  assert.match(detalhe, /overflow-x-hidden/);
  assert.match(detalhe, /min-h-12/);
  assert.match(detalhe, /grid-cols-1|grid gap/);
  assert.match(listagem, /grid-cols-1/);
  assert.match(listagem, /md:grid-cols-2/);
  assert.match(listagem, /xl:grid-cols-3/);
});

test("rota privada preserva next e o login retorna ao destino sanitizado", () => {
  assert.match(privateRoute, /buildNextFromLocation\(location\)/);
  assert.match(privateRoute, /\/login\?next=/);
  assert.match(login, /sanitizePostLoginRedirect/);
  assert.match(login, /navigate\(redirectPath \|\| "\/painel"/);
});
