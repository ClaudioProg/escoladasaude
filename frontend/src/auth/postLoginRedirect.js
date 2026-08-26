const DEFAULT_POST_LOGIN_PATH = "/painel";

const LEGACY_POST_LOGIN_PATHS = new Set([
  "/usuario/dashboard",
  "/dashboard-usuario",
  "/home-escola",
  "/dashboard",
  "/usuario",
]);

// Espelha somente as rotas privadas declaradas em App.jsx.
const VALID_PRIVATE_PATHS = new Set([
  "/painel",
  "/notificacao",
  "/evento",
  "/minha-presenca",
  "/certificado",
  "/reserva",
  "/calendario-eps",
  "/curso-online",
  "/pesquisa",
  "/interacao",
  "/mensagem",
  "/submissao",
  "/trabalho",
  "/manual",
  "/scanner",
  "/perfil",
  "/ajuda",
  "/organizador",
  "/organizador/agenda",
  "/organizador/presenca",
  "/organizador/certificado",
  "/organizador/avaliacao",
  "/organizador/submissao",
  "/administrador",
  "/dashboard-analitico",
  "/administrador/agenda",
  "/administrador/reserva",
  "/administrador/calendario-eps",
  "/administrador/curso-online",
  "/administrador/pesquisa",
  "/administrador/interacao/votacao",
  "/administrador/interacao/quiz",
  "/administrador/interacao/nuvem-palavras",
  "/administrador/auditoria",
  "/administrador/mensagem",
  "/administrador/pendencia",
  "/administrador/saude-plataforma",
  "/certificado-avulso",
  "/relatorio-customizado",
  "/gestao/informacao",
  "/gestao/usuario",
  "/gestao/organizador",
  "/gestao/evento",
  "/gestao/presenca",
  "/gestao/certificado",
  "/gestao/avaliacao",
  "/gestao/qrcode",
  "/gestao/cancelamento-inscricao",
  "/gestao/calendario-bloqueio",
  "/gestao/lista-presenca-turma",
  "/chamada/nova",
  "/gestao/submissao",
]);

const VALID_PRIVATE_PATTERNS = [
  /^\/pesquisa\/[^/]+\/responder$/,
  /^\/organizador\/presenca\/[^/]+$/,
  /^\/administrador\/interacao\/apresentacao\/[^/]+$/,
  /^\/gestao\/evento\/[^/]+\/pre-teste\/resultados$/,
  /^\/chamada\/[^/]+$/,
  /^\/chamada\/[^/]+\/submissao$/,
];

function isValidPrivatePath(pathname) {
  return (
    VALID_PRIVATE_PATHS.has(pathname) ||
    VALID_PRIVATE_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}

export function sanitizePostLoginRedirect(raw) {
  const value = String(raw || "").trim();

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  let target;

  try {
    target = new URL(value, "https://escoladasaude.invalid");
  } catch {
    return DEFAULT_POST_LOGIN_PATH;
  }

  if (
    target.origin !== "https://escoladasaude.invalid" ||
    LEGACY_POST_LOGIN_PATHS.has(target.pathname) ||
    !isValidPrivatePath(target.pathname)
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  return `${target.pathname}${target.search}${target.hash}`;
}

export { DEFAULT_POST_LOGIN_PATH };
