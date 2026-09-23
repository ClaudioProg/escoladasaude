import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const outputDir = path.join(root, ".tmp-browser-eventos");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const staticPort = 4173;
const apiPort = 4190;
const debugPort = 9223;
const partesHoje = Object.fromEntries(
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .map(({ type, value }) => [type, value]),
);
const dataPresencaTeste = `${partesHoje.year}-${partesHoje.month}-${partesHoje.day}`;
const nextPresencaTeste = `/presenca?turma_id=12&data_presenca=${dataPresencaTeste}`;
let tentativasLogin = 0;
let confirmacoesQr = 0;
let perfilFixture = "usuario";
const buscasRelatorio = [];
const requisicoesRelatorio = [];
const presencasPersistidas = new Set();

const eventos = [
  {
    id: 1,
    titulo: "Oficina de vacinação segura",
    tipo: "Oficina",
    local: "Auditório Central",
    publico_alvo_label: "Profissionais da saúde",
    publicado: true,
    evento_visivel_vitrine: true,
    status: "programado",
    data_inicio_geral: "2026-10-02",
    data_fim_geral: "2026-10-02",
    horario_inicio_geral: "08:30:00",
    horario_fim_geral: "12:00:00",
    vagas_total: 40,
    vagas_preenchidas: 20,
  },
  {
    id: 2,
    titulo:
      "Segurança alimentar e nutricional: como identificar riscos no território",
    tipo: "Curso",
    local: "Escola da Saúde",
    publico_alvo_label: "Equipes multiprofissionais da atenção básica",
    publicado: true,
    evento_visivel_vitrine: true,
    status: "programado",
    data_inicio_geral: "2026-10-05",
    data_fim_geral: "2026-10-07",
    horario_inicio_geral: "13:00:00",
    horario_fim_geral: "17:30:00",
    vagas_total: 30,
    vagas_preenchidas: 30,
  },
  {
    id: 3,
    titulo:
      "Plano de ação para educação permanente em saúde, integração das redes municipais e qualificação contínua das equipes responsáveis pelo cuidado",
    tipo: "Seminário",
    local: "Teatro Municipal",
    publico_alvo_label: "Servidores municipais e convidados",
    publicado: true,
    evento_visivel_vitrine: true,
    status: "andamento",
    data_inicio_geral: "2026-10-10",
    data_fim_geral: "2026-10-12",
    horario_inicio_geral: "09:00:00",
    horario_fim_geral: "18:00:00",
    vagas_total: 100,
    vagas_preenchidas: 83,
    restrito: true,
  },
  {
    id: 4,
    titulo:
      "Encontro intersetorial extraordinário para planejamento, monitoramento, avaliação, compartilhamento de experiências e fortalecimento das políticas públicas municipais de promoção integral da saúde",
    tipo: "Encontro",
    local: "Centro de Convenções",
    publico_alvo_label:
      "Gestores, trabalhadores, conselheiros e representantes sociais",
    publicado: true,
    evento_visivel_vitrine: true,
    status: "programado",
    data_inicio_geral: "2026-10-20",
    data_fim_geral: "2026-10-21",
    horario_inicio_geral: "08:00:00",
    horario_fim_geral: "19:00:00",
    vagas_total: 80,
    vagas_preenchidas: 12,
  },
];

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
    "Access-Control-Allow-Headers": [
      "Authorization",
      "Content-Type",
      "X-Client-TZ",
      "X-Client-Offset-Minutes",
      "X-Client-Today",
      "X-Client-Now-UTC",
      "X-Date-Only-Semantics",
      "X-Request-Id",
      "X-Client-Build",
      "X-Debug-Conflitos",
    ].join(", "),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  });
  res.end(JSON.stringify(payload));
}

async function lerJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

const apiServer = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, null);
  if (req.method === "POST" && req.url === "/api/login") {
    tentativasLogin += 1;
    const body = await lerJson(req);
    if (body.senha !== "senha-valida") {
      return json(res, 401, { ok: false, message: "Credenciais inválidas." });
    }
    return json(res, 200, {
      ok: true,
      data: {
        token: "fixture.token.value",
        usuario: {
          id: 701,
          nome: "Usuário de Teste",
          perfil: perfilFixture,
          celular: "13999999999",
        },
      },
    });
  }
  if (req.url === "/api/perfil/me") {
    return json(res, 200, {
      ok: true,
      data: {
        id: 701,
        nome: "Usuário de Teste",
        perfil: perfilFixture,
        celular: "13999999999",
        perfil_incompleto: false,
      },
    });
  }
  if (req.url === "/api/evento/para-mim") {
    return json(res, 200, { ok: true, data: eventos });
  }
  if (req.url === "/api/notificacao/resumo") {
    return json(res, 200, { ok: true, data: { nao_lida: 0 } });
  }
  if (req.url?.startsWith("/api/mensagem/minhas")) {
    return json(res, 200, { ok: true, data: [] });
  }
  if (
    ["GET", "POST"].includes(req.method) &&
    req.url?.startsWith("/api/relatorio/institucional")
  ) {
    const body = req.method === "POST" ? await lerJson(req) : {};
    const busca =
      (req.method === "POST"
        ? body.busca
        : new URL(req.url, "http://localhost").searchParams.get("busca")) || "";
    requisicoesRelatorio.push({ method: req.method, url: req.url, body });
    buscasRelatorio.push(busca);
    const filtrado = busca ? 1 : 4;
    return json(res, 200, {
      ok: true,
      data: {
        geral: {
          eventos_total: 4,
          turmas_total: 4,
          inscricoes_total: 6,
          presencas_total: 2,
          avaliacoes_total: 2,
          certificados_validos_total: 2,
          usuarios_total: 2,
          reservas_total: 0,
        },
        filtrado: {
          eventos: filtrado,
          turmas: filtrado,
          inscricoes: filtrado,
          usuarios_envolvidos: filtrado,
          presencas: filtrado,
          avaliacoes: filtrado,
          certificados: filtrado,
          ausencias_registradas: 0,
          registros_presenca: filtrado,
          certificados_emitidos: filtrado,
          certificados_enviados: 0,
          taxa_presenca: 100,
          taxa_avaliacao: 100,
          taxa_certificacao: 100,
        },
        periodo: "2026",
        series: { por_mes: [], por_status: [], top_eventos: [] },
        tabelas: {
          eventos: busca
            ? [
                {
                  evento_id: 1,
                  evento: "Saúde LGBT",
                  turmas: 1,
                  inscricoes: 1,
                  presencas: 1,
                  avaliacoes: 1,
                  certificados: 1,
                },
              ]
            : [],
          saude: [],
        },
      },
    });
  }
  if (
    req.method === "POST" &&
    /^\/api\/relatorio\/exportar\/institucional\.(xlsx|pdf)$/.test(req.url)
  ) {
    const body = await lerJson(req);
    requisicoesRelatorio.push({ method: req.method, url: req.url, body });
    res.writeHead(200, {
      "Content-Type": req.url.endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fixture.${req.url.endsWith(".pdf") ? "pdf" : "xlsx"}"`,
      "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "Content-Disposition",
    });
    return res.end(
      "fixture de transporte; conteudo PDF/XLSX validado no backend",
    );
  }
  if (
    req.method === "GET" &&
    req.url?.startsWith("/api/presenca/qr/contexto")
  ) {
    return json(res, 200, {
      ok: true,
      data: {
        turma: { id: 12, nome: "Turma QR" },
        termo: { ativo: false, ja_aceito: true },
      },
    });
  }
  if (req.method === "POST" && req.url === "/api/presenca/qr") {
    confirmacoesQr += 1;
    const body = await lerJson(req);
    const key = `${body.turma_id}|${body.data_presenca}|701`;
    const jaRegistrada = presencasPersistidas.has(key);
    presencasPersistidas.add(key);
    return json(res, jaRegistrada ? 200 : 201, {
      ok: true,
      data: {
        presenca: {
          id: 1,
          turma_id: body.turma_id,
          data_presenca: body.data_presenca,
          ja_registrada: jaRegistrada,
        },
      },
      message: jaRegistrada
        ? "Presença já registrada."
        : "Presença registrada.",
    });
  }
  return json(res, 404, { ok: false, message: "Fixture não encontrada." });
});

const tipos = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".webmanifest", "application/manifest+json"],
]);

const staticServer = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const requested = path.resolve(dist, `.${pathname}`);
  const dentroDist =
    requested === dist || requested.startsWith(`${dist}${path.sep}`);
  let filePath = dentroDist ? requested : path.join(dist, "index.html");
  try {
    if ((await fsp.stat(filePath)).isDirectory())
      filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(dist, "index.html");
  }
  try {
    const body = await fsp.readFile(filePath);
    res.writeHead(200, {
      "Content-Type":
        tipos.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500);
    res.end(error.message);
  }
});

await fsp.rm(outputDir, { recursive: true, force: true });
await fsp.mkdir(outputDir, { recursive: true });
await listen(apiServer, apiPort);
await listen(staticServer, staticPort);

const profileDir = path.join(outputDir, "chrome-profile");
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function aguardarJson(url, tentativas = 80) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Aguarda o Chrome abrir a porta de depuração.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout aguardando ${url}`);
}

await aguardarJson(`http://127.0.0.1:${debugPort}/json/version`);
const targetResponse = await fetch(
  `http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:${staticPort}/login`,
  { method: "PUT" },
);
if (!targetResponse.ok) {
  throw new Error(`CDP target: HTTP ${targetResponse.status}`);
}
const target = await targetResponse.json();

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const erros = [];
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result || {});
  }
  if (message.method === "Runtime.exceptionThrown") {
    erros.push(message.params?.exceptionDetails?.text || "Runtime exception");
  }
  if (
    message.method === "Log.entryAdded" &&
    message.params?.entry?.level === "error"
  ) {
    erros.push(message.params.entry.text);
  }
});

function cdp(method, params = {}) {
  sequence += 1;
  return new Promise((resolve, reject) => {
    pending.set(sequence, { resolve, reject });
    ws.send(JSON.stringify({ id: sequence, method, params }));
  });
}

async function avaliar(expression) {
  const result = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value;
}

async function aguardar(expressao, label) {
  for (let i = 0; i < 120; i += 1) {
    if (await avaliar(expressao)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const diagnostico = await avaliar(`({
    rota: location.pathname,
    artigos: document.querySelectorAll('article').length,
    tamanhoTexto: document.body.innerText.length,
    titulo: document.title,
  })`);
  throw new Error(
    `Timeout aguardando ${label}: ${JSON.stringify(diagnostico)}`,
  );
}

async function aguardarNode(condicao, label) {
  for (let i = 0; i < 120; i += 1) {
    if (condicao()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout aguardando ${label}`);
}

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Page.navigate", { url: `http://127.0.0.1:${staticPort}/login` });
  await aguardar("document.readyState === 'complete'", "origem local");
  await avaliar(`localStorage.setItem('token','fixture.token.value');
    localStorage.setItem('usuario', JSON.stringify({id:701,nome:'Usuário de Teste',perfil:'usuario',celular:'13999999999'}));
    localStorage.setItem('perfil','usuario'); true;`);
  await cdp("Page.navigate", { url: `http://127.0.0.1:${staticPort}/evento` });
  await aguardar(
    "document.body.innerText.includes('Eventos para você') && document.querySelectorAll('article').length === 4",
    "quatro cards de eventos",
  );

  const resultados = [];
  for (const viewport of [
    { nome: "mobile", width: 390, height: 844 },
    { nome: "intermediario", width: 900, height: 900 },
    { nome: "desktop", width: 1440, height: 1000 },
    { nome: "zoom125", width: 900, height: 900 },
  ]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width < 600,
    });
    await avaliar(
      `document.body.style.zoom = '${viewport.nome === "zoom125" ? "125%" : "100%"}'; true`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const estado = await avaliar(`(() => {
      const cards = [...document.querySelectorAll('article')];
      const heights = cards.map(card => Math.round(card.getBoundingClientRect().height));
      const titles = cards.map(card => {
        const title = card.querySelector('h2');
        const style = getComputedStyle(title);
        return {text:title.textContent.trim(), lineClamp:style.webkitLineClamp, overflow:style.overflow, fontSize:style.fontSize, truncado:title.dataset.truncado};
      });
      const dates = cards.map(card => card.querySelector('dl')?.innerText || '');
      const agendaSemCorte = cards.every(card => [...card.querySelectorAll('dl dd')].slice(0,2).every(dd => {
        const style = getComputedStyle(dd);
        return style.textOverflow !== 'ellipsis' && dd.scrollWidth <= dd.clientWidth + 1 && dd.scrollHeight <= dd.clientHeight + 1;
      }));
      const links = cards.map(card => card.querySelector('a'));
      links[0]?.focus();
      return {
        cards: cards.length,
        heights,
        uniform: new Set(heights).size === 1,
        titles,
        dates,
        agendaSemCorte,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        focusedLink: document.activeElement === links[0],
        buttonsInside: links.every(link => link && link.getBoundingClientRect().bottom <= link.closest('article').getBoundingClientRect().bottom + 1),
      };
    })()`);
    await avaliar(
      "document.querySelector('article')?.scrollIntoView({block:'start'}); true",
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const screenshot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const screenshotPath = path.join(outputDir, `${viewport.nome}.png`);
    await fsp.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    resultados.push({ ...viewport, screenshotPath, ...estado });
  }

  await avaliar("localStorage.clear(); sessionStorage.clear(); true");
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:${staticPort}${nextPresencaTeste}`,
  });
  await aguardar(
    `location.pathname === '/login' && new URLSearchParams(location.search).get('next') === ${JSON.stringify(nextPresencaTeste)}`,
    "redirecionamento seguro ao login com next",
  );
  const retornoPreservado = await avaliar(
    "new URLSearchParams(location.search).get('next')",
  );

  async function preencherLogin(senha) {
    await aguardar(
      "Boolean(document.querySelector('#cpf') && document.querySelector('#senha'))",
      "formulário de login",
    );
    await avaliar(`(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const cpf = document.querySelector('#cpf');
      const senha = document.querySelector('#senha');
      setter.call(cpf, '52998224725');
      cpf.dispatchEvent(new Event('input', {bubbles:true}));
      setter.call(senha, ${JSON.stringify(senha)});
      senha.dispatchEvent(new Event('input', {bubbles:true}));
      document.querySelector('form[aria-label]')?.requestSubmit();
      return true;
    })()`);
  }

  await preencherLogin("senha-errada");
  await aguardarNode(
    () => tentativasLogin === 1,
    "tentativa inválida de login",
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  const loginInvalidoNaoRegistrou =
    confirmacoesQr === 0 && (await avaliar("location.pathname === '/login'"));
  erros.length = 0;

  await preencherLogin("senha-valida");
  await aguardar(
    "location.pathname === '/presenca' && document.querySelector('[role=dialog]')?.innerText.includes('Presença registrada com sucesso.')",
    "retorno automático e modal de sucesso",
  );
  const modalExato = await avaliar(`(() => {
    const dialog = document.querySelector('[role=dialog]');
    return dialog?.querySelector('h2')?.textContent.trim() === 'Presença registrada com sucesso.' &&
      [...dialog.querySelectorAll('button')].some(button => button.textContent.trim() === 'OK');
  })()`);
  const primeiraConfirmacaoUnica =
    confirmacoesQr === 1 && presencasPersistidas.size === 1;
  await avaliar(
    "document.querySelector('[role=dialog] button')?.click(); true",
  );
  await aguardar(
    "!document.querySelector('[role=dialog]')",
    "fechamento do modal",
  );
  const modalNaoReprocessa = confirmacoesQr === 1;

  await cdp("Page.reload", { ignoreCache: true });
  await aguardar(
    "document.querySelector('[role=dialog]')?.innerText.includes('Presença registrada com sucesso.')",
    "replay após refresh",
  );
  const refreshIdempotente =
    confirmacoesQr === 2 && presencasPersistidas.size === 1;
  const confirmacoesAntesDoLinkInvalido = confirmacoesQr;

  await cdp("Page.navigate", {
    url: `http://127.0.0.1:${staticPort}/presenca?turma_id=invalida&data_presenca=${dataPresencaTeste}`,
  });
  await aguardar(
    "document.body.innerText.includes('turma_id')",
    "rejeição de link inválido",
  );
  const linkInvalidoNaoRegistrou =
    confirmacoesQr === confirmacoesAntesDoLinkInvalido;
  const presenca = {
    retornoPreservado,
    loginInvalidoNaoRegistrou,
    modalExato,
    primeiraConfirmacaoUnica,
    modalNaoReprocessa,
    refreshIdempotente,
    linkInvalidoNaoRegistrou,
    tentativasLogin,
    confirmacoesQr,
    registrosPersistidos: presencasPersistidas.size,
  };

  perfilFixture = "administrador";
  await avaliar(`localStorage.setItem('perfil','administrador');
    localStorage.setItem('usuario', JSON.stringify({id:701,nome:'Gestor de Teste',perfil:'administrador'})); true`);
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:${staticPort}/relatorio-customizado`,
  });
  await aguardar(
    "document.body.innerText.includes('Visão geral da plataforma')",
    "relatório institucional",
  );
  const ordemRelatorio = await avaliar(`(() => {
    const html = document.body.innerText;
    return html.indexOf('Visão geral da plataforma') < html.indexOf('Filtros institucionais');
  })()`);
  await avaliar(`(() => {
    const input = document.querySelector('input[placeholder*="Título, descrição"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'LGBT');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    [...document.querySelectorAll('button')].find(button => button.innerText.includes('Aplicar filtros'))?.click();
    return true;
  })()`);
  await aguardarNode(
    () => buscasRelatorio.includes("LGBT"),
    "busca institucional aplicada",
  );
  await aguardar(
    "document.body.innerText.includes('Saúde LGBT')",
    "resultado filtrado visível",
  );
  async function aplicarBusca(termo) {
    await aguardar(
      "[...document.querySelectorAll('button')].some(button => button.innerText.includes('Aplicar filtros') && !button.disabled)",
      "botao de filtros habilitado",
    );
    await avaliar(`(() => {
      const input = document.querySelector('input[placeholder*="T"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(termo)});
      input.dispatchEvent(new Event('input', {bubbles:true}));
      [...document.querySelectorAll('button')].find(button => button.innerText.includes('Aplicar filtros'))?.click();
      return true;
    })()`);
    await aguardarNode(
      () => buscasRelatorio.includes(termo),
      "busca institucional enviada",
    );
  }
  await aplicarBusca("123.456.789-45");
  await aplicarBusca("12345678945");
  await aguardar(
    "[...document.querySelectorAll('button')].some(button => button.innerText.includes('Exportar XLSX') && !button.disabled)",
    "botao XLSX habilitado",
  );
  await avaliar(`(() => {
    [...document.querySelectorAll('button')].find(button => button.innerText.includes('Exportar XLSX'))?.click();
    return true;
  })()`);
  await aguardarNode(
    () =>
      requisicoesRelatorio.some((item) =>
        item.url.endsWith("institucional.xlsx"),
      ),
    "exportacao XLSX institucional",
  );
  await aguardar(
    "[...document.querySelectorAll('button')].some(button => button.innerText.includes('Exportar PDF institucional') && !button.disabled)",
    "botao PDF habilitado",
  );
  await avaliar(`(() => {
    [...document.querySelectorAll('button')].find(button => button.innerText.includes('Exportar PDF institucional'))?.click();
    return true;
  })()`);
  await aguardarNode(
    () =>
      requisicoesRelatorio.some((item) =>
        item.url.endsWith("institucional.pdf"),
      ),
    "exportacao PDF institucional",
  );
  await aplicarBusca("maria da");
  const requisicoesCpf = requisicoesRelatorio.filter((item) =>
    ["123.456.789-45", "12345678945"].includes(item.body.busca),
  );
  const relatorio = {
    ordemRelatorio,
    buscaEnviadaAoBackend: buscasRelatorio.includes("LGBT"),
    cpfFormatadoNoBody: requisicoesCpf.some(
      (item) => item.body.busca === "123.456.789-45" && item.method === "POST",
    ),
    cpfNumericoNoBody: requisicoesCpf.some(
      (item) => item.body.busca === "12345678945" && item.method === "POST",
    ),
    cpfAusenteDasUrls: requisicoesRelatorio.every(
      (item) =>
        !/123(?:[.]456[.]789-45|45678945)/.test(decodeURIComponent(item.url)),
    ),
    cpfNuncaNaQuery: requisicoesCpf.every(
      (item) =>
        !new URL(item.url, "http://localhost").searchParams.has("busca"),
    ),
    exportsCpfNoBody: ["xlsx", "pdf"].every((ext) =>
      requisicoesCpf.some(
        (item) =>
          item.url.endsWith(`institucional.${ext}`) && item.method === "POST",
      ),
    ),
    nomeNoBody: requisicoesRelatorio.some(
      (item) => item.body.busca === "maria da" && item.method === "POST",
    ),
    resultadoFiltradoVisivel: await avaliar(
      "document.body.innerText.includes('Saúde LGBT')",
    ),
  };

  const falhou = resultados.some(
    (item) =>
      item.cards !== 4 ||
      !item.uniform ||
      !item.agendaSemCorte ||
      item.horizontalOverflow ||
      !item.focusedLink ||
      !item.buttonsInside ||
      item.titles[0]?.truncado !== "false" ||
      item.titles[1]?.truncado !== "false" ||
      item.titles.some(
        (title) => title.lineClamp !== "4" || title.overflow !== "hidden",
      ) ||
      item.dates.some(
        (value) =>
          !/\d{2}\/\d{2}\/\d{4}/.test(value) || !/\d{2}:\d{2}/.test(value),
      ),
  );

  const presencaFalhou =
    retornoPreservado !== nextPresencaTeste ||
    Object.entries(presenca).some(
      ([key, value]) =>
        key !== "retornoPreservado" &&
        !["tentativasLogin", "confirmacoesQr", "registrosPersistidos"].includes(
          key,
        ) &&
        value !== true,
    );

  console.log(
    JSON.stringify(
      {
        ok:
          !falhou &&
          !presencaFalhou &&
          Object.values(relatorio).every(Boolean) &&
          erros.length === 0,
        erros,
        presenca,
        relatorio,
        resultados,
      },
      null,
      2,
    ),
  );
  if (
    falhou ||
    presencaFalhou ||
    !Object.values(relatorio).every(Boolean) ||
    erros.length
  )
    process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
  await Promise.all([close(apiServer), close(staticServer)]);
}
