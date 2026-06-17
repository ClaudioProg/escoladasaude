// ✅ frontend/src/utils/gerarQrCodePresencaPDF.js — v2.2
// Atualizado em: 16/06/2026
// Plataforma Escola da Saúde
//
// Utilitário para gerar PDF institucional com QR Code de confirmação de presença.
//
// Revisão v2.1:
// - layout institucional premium inspirado no padrão da página do organizador;
// - QR oficial baseado em turma_id + data_presenca;
// - URL frontend oficial: /presenca?turma_id=:turma_id&data_presenca=:data_presenca;
// - um QR diferente para cada data/aula da turma;
// - impede geração sem data_presenca válida;
// - exibe data da presença no PDF;
// - exibe turma, período, local e organizador;
// - nome do arquivo inclui turma_id + data_presenca;
// - sem /api no QR;
// - sem /presencas;
// - sem query antiga "turma";
// - sem VITE_APP_URL;
// - sem fallback hardcoded de domínio;
// - sem render React oculto para gerar QR;
// - AppToast oficial em src/components/ui/AppToast;
// - Env oficial: VITE_FRONTEND_URL.

import QRCode from "qrcode";
import jsPDF from "jspdf";

import { notifyError, notifySuccess } from "../components/ui/AppToast";

/* ─────────────────────────────────────────
   Constantes
───────────────────────────────────────── */

const QR_ERROR_LEVEL = new Set(["L", "M", "Q", "H"]);
const ORIENTACAO_PDF = new Set(["portrait", "landscape"]);

const PRESENCA_FRONTEND_PATH = "/presenca";

const CORES = Object.freeze({
  fundo: [248, 250, 252],
  moldura: [15, 23, 42],
  branco: [255, 255, 255],
  laranja: [234, 88, 12],
  texto: [15, 23, 42],
  textoSuave: [71, 85, 105],
  linha: [226, 232, 240],
  borda: [203, 213, 225],
});

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

function sanitizeFilename(name = "", fallback = "arquivo.pdf") {
  const clean = String(name || "")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return clean || fallback;
}

function toPositiveInt(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function getTurmaId(turma) {
  return (
    toPositiveInt(turma?.turma_id) ||
    toPositiveInt(turma?.id) ||
    toPositiveInt(turma?.qr_payload?.turma_id)
  );
}

function normalizePositiveNumber(value, fallback, min = 1, max = 5000) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

function normalizeColor(value, fallback) {
  const color = String(value || "").trim();

  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  return fallback;
}

function normalizeOrientacao(value) {
  const orientacao = String(value || "")
    .trim()
    .toLowerCase();

  return ORIENTACAO_PDF.has(orientacao) ? orientacao : "landscape";
}

function normalizeErrorCorrectionLevel(value) {
  const level = String(value || "")
    .trim()
    .toUpperCase();

  return QR_ERROR_LEVEL.has(level) ? level : "M";
}

function ymd(value) {
  if (typeof value !== "string") {
    return "";
  }

  const clean = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(clean)) {
    return clean.slice(0, 10);
  }

  return "";
}

function hhmm(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const clean = value.trim();

  if (/^\d{2}:\d{2}$/.test(clean)) {
    return clean;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) {
    return clean.slice(0, 5);
  }

  return fallback;
}

function formatarDataBR(value) {
  const data = ymd(value);

  if (!data) {
    return "—";
  }

  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function getFrontendBaseUrl(customBaseUrl) {
  const explicitBase =
    customBaseUrl || String(import.meta.env.VITE_FRONTEND_URL || "").trim();

  const origin =
    explicitBase ||
    (typeof window !== "undefined" ? window.location?.origin : "");

  if (!origin) {
    return "";
  }

  try {
    const url = new URL(origin);
    const isLocal =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1";

    if (!isLocal && url.protocol === "http:") {
      url.protocol = "https:";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function buildPresencaUrl({ baseUrl, turma_id, data_presenca, frontendPath }) {
  const base = getFrontendBaseUrl(baseUrl);

  if (!base) {
    throw new Error("URL base do frontend não configurada.");
  }

  const path = String(frontendPath || PRESENCA_FRONTEND_PATH).trim();

  if (!path.startsWith("/")) {
    throw new Error("frontendPath deve começar com '/'.");
  }

  const dataPresenca = ymd(data_presenca);

  if (!dataPresenca) {
    throw new Error("data_presenca deve estar no formato YYYY-MM-DD.");
  }

  const url = new URL(path, `${base}/`);

  url.searchParams.set("turma_id", String(turma_id));
  url.searchParams.set("data_presenca", dataPresenca);

  return url.toString();
}

function truncateLines(doc, text, maxWidth, maxLines = 2) {
  let lines = doc.splitTextToSize(String(text || ""), maxWidth);

  if (lines.length <= maxLines) {
    return lines;
  }

  lines = lines.slice(0, maxLines);

  while (
    lines[maxLines - 1] &&
    doc.getTextWidth(`${lines[maxLines - 1]}…`) > maxWidth
  ) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1);
  }

  lines[maxLines - 1] = `${lines[maxLines - 1]}…`;

  return lines;
}

async function gerarQrDataUrl(url, options = {}) {
  const {
    qrSize = 420,
    errorCorrectionLevel = "H",
    includeMargin = true,
    qrFgColor = "#000000",
    qrBgColor = "#ffffff",
  } = options;

  const width = normalizePositiveNumber(qrSize, 420, 128, 2048);
  const level = normalizeErrorCorrectionLevel(errorCorrectionLevel);

  return QRCode.toDataURL(url, {
    errorCorrectionLevel: level,
    margin: includeMargin ? 4 : 0,
    width,
    color: {
      dark: normalizeColor(qrFgColor, "#000000"),
      light: normalizeColor(qrBgColor, "#ffffff"),
    },
  });
}

function setRgb(doc, method, rgb) {
  doc[method](rgb[0], rgb[1], rgb[2]);
}

function textoSeguro(value, fallback = "—") {
  const text = String(value || "").trim();
  return text || fallback;
}

function extrairDataPresenca(turma, opcao) {
  return ymd(
    opcao?.data_presenca ||
      turma?.data_presenca ||
      turma?.data ||
      turma?.qr_payload?.data_presenca ||
      "",
  );
}

function periodoTurmaTexto(turma, dataPresenca) {
  const dataInicio = ymd(turma?.data_inicio || turma?.data);
  const dataFim = ymd(turma?.data_fim || turma?.data_inicio || turma?.data);

  const dataBase = dataPresenca || dataInicio || dataFim;

  const horarioInicio = hhmm(turma?.horario_inicio, "");
  const horarioFim = hhmm(turma?.horario_fim, "");

  const dataTexto = formatarDataBR(dataBase);

  if (horarioInicio && horarioFim) {
    return `${dataTexto} • ${horarioInicio} às ${horarioFim}`;
  }

  if (horarioInicio) {
    return `${dataTexto} • a partir de ${horarioInicio}`;
  }

  return dataTexto;
}

/* ─────────────────────────────────────────
   API pública
───────────────────────────────────────── */

/**
 * Gera um PDF institucional com QR Code de confirmação de presença.
 *
 * @param {Object} turma
 * @param {number|string} [turma.id]
 * @param {number|string} [turma.turma_id]
 * @param {Object} [turma.qr_payload]
 * @param {number|string} [turma.qr_payload.turma_id]
 * @param {string} [turma.qr_payload.data_presenca]
 * @param {string} [turma.data_presenca]
 * @param {string} [turma.data]
 * @param {string} [turma.nome]
 * @param {string} [nomeEvento="Evento"]
 * @param {string} [nomeorganizador="organizador"]
 * @param {Object} [opcao]
 * @param {string} [opcao.data_presenca] YYYY-MM-DD
 * @param {string} [opcao.baseUrl]
 * @param {string} [opcao.frontendPath="/presenca"]
 * @param {number} [opcao.qrSize=420]
 * @param {"L"|"M"|"Q"|"H"} [opcao.errorCorrectionLevel="H"]
 * @param {boolean} [opcao.includeMargin=true]
 * @param {"portrait"|"landscape"} [opcao.orientacao="landscape"]
 * @param {string} [opcao.nomeArquivo]
 * @param {string} [opcao.qrFgColor="#000000"]
 * @param {string} [opcao.qrBgColor="#ffffff"]
 * @returns {Promise<boolean>}
 */
export async function gerarQrCodePresencaPDF(
  turma,
  nomeEvento = "Evento",
  nomeorganizador = "organizador",
  opcao = {},
) {
  if (typeof window === "undefined") {
    notifyError("Não é possível gerar o PDF fora do navegador.");
    return false;
  }

  const turma_id = getTurmaId(turma);

  if (!turma_id) {
    notifyError("Turma não encontrada ou inválida.");
    return false;
  }

  const data_presenca = extrairDataPresenca(turma, opcao);

  if (!data_presenca) {
    notifyError("data_presenca inválida para geração do QR Code.");
    return false;
  }

  try {
    const {
      baseUrl,
      frontendPath = PRESENCA_FRONTEND_PATH,
      qrSize = 420,
      errorCorrectionLevel = "H",
      includeMargin = true,
      orientacao = "landscape",
      nomeArquivo,
      qrFgColor = "#000000",
      qrBgColor = "#ffffff",
    } = opcao || {};

    const url = buildPresencaUrl({
      baseUrl,
      turma_id,
      data_presenca,
      frontendPath,
    });

    const qrDataUrl = await gerarQrDataUrl(url, {
      qrSize,
      errorCorrectionLevel,
      includeMargin,
      qrFgColor,
      qrBgColor,
    });

    const doc = new jsPDF({
      orientation: normalizeOrientacao(orientacao),
      unit: "mm",
      format: "a4",
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const titulo = textoSeguro(nomeEvento, "Evento");
    const turmaNome = textoSeguro(
      turma?.nome || turma?.turma_nome || `Turma ${turma_id}`,
      `Turma ${turma_id}`,
    );
    const local = textoSeguro(
      turma?.evento?.local || turma?.evento_local || turma?.local,
      "Local a confirmar",
    );
    const organizador = textoSeguro(nomeorganizador, "Organizador");
    const periodo = periodoTurmaTexto(turma, data_presenca);

    setRgb(doc, "setFillColor", CORES.fundo);
    doc.rect(0, 0, pageW, pageH, "F");

    setRgb(doc, "setFillColor", CORES.moldura);
    doc.roundedRect(10, 10, pageW - 20, pageH - 20, 8, 8, "F");

    setRgb(doc, "setFillColor", CORES.branco);
    doc.roundedRect(14, 14, pageW - 28, pageH - 28, 7, 7, "F");

    setRgb(doc, "setFillColor", CORES.laranja);
    doc.rect(14, 14, pageW - 28, 7, "F");

    setRgb(doc, "setTextColor", CORES.texto);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("ESCOLA MUNICIPAL DE SAÚDE PÚBLICA", 24, 33);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setRgb(doc, "setTextColor", CORES.textoSuave);
    doc.text("Secretaria Municipal de Saúde — Prefeitura de Santos", 24, 39);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    setRgb(doc, "setTextColor", CORES.texto);

    const tituloLinhas = truncateLines(doc, titulo, 154, 3);
    doc.text(tituloLinhas, 24, 64);

    let y = 64 + tituloLinhas.length * 11 + 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setRgb(doc, "setTextColor", CORES.textoSuave);
    doc.text(turmaNome, 24, y);

    y += 9;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    setRgb(doc, "setTextColor", CORES.textoSuave);
    doc.text(periodo, 24, y);

    y += 8;

    const localLinhas = truncateLines(doc, local, 150, 2);
    doc.text(localLinhas, 24, y);

    y += localLinhas.length * 6 + 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setRgb(doc, "setTextColor", CORES.texto);
    doc.text(`Data da presença: ${formatarDataBR(data_presenca)}`, 24, y);

    setRgb(doc, "setFillColor", CORES.laranja);
    doc.roundedRect(24, 137, 150, 18, 4, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setRgb(doc, "setTextColor", CORES.branco);
    doc.text("REGISTRE SUA PRESENÇA PELO QR CODE", 99, 148.5, {
      align: "center",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setRgb(doc, "setTextColor", CORES.textoSuave);
    doc.text(
      "Abra a câmera do celular, escaneie o código e faça login.",
      24,
      165,
    );
    doc.text(
      "A presença será vinculada automaticamente à turma e à data desta aula.",
      24,
      171,
    );

    setRgb(doc, "setFillColor", CORES.branco);
    setRgb(doc, "setDrawColor", CORES.borda);
    doc.setLineWidth(0.6);
    doc.roundedRect(190, 41, 78, 78, 5, 5, "FD");

    doc.addImage(qrDataUrl, "PNG", 198, 49, 62, 62);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setRgb(doc, "setTextColor", CORES.texto);
    doc.text("ESCANEIE AQUI", 229, 133, {
      align: "center",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setRgb(doc, "setTextColor", CORES.textoSuave);
    doc.text("Confirmação de presença", 229, 140, {
      align: "center",
    });

    doc.setFontSize(7);
    const urlLines = doc.splitTextToSize(url, 76);
    doc.text(urlLines.slice(0, 2), 229, 147, {
      align: "center",
    });

    setRgb(doc, "setDrawColor", CORES.linha);
    doc.line(24, 184, pageW - 24, 184);

    doc.setFontSize(8);
    setRgb(doc, "setTextColor", [100, 116, 139]);
    doc.text(`Organizador: ${organizador}`, 24, 193);
    doc.text(
      `Plataforma Escola da Saúde 2.0 • Turma ${turma_id} • ${formatarDataBR(
        data_presenca,
      )}`,
      pageW - 24,
      193,
      {
        align: "right",
      },
    );

    const nomePdf = sanitizeFilename(
      nomeArquivo || `qr_presenca_turma_${turma_id}_${data_presenca}.pdf`,
      `qr_presenca_turma_${turma_id}_${data_presenca}.pdf`,
    );

    doc.save(nomePdf);

    notifySuccess("QR Code gerado com sucesso.");

    return true;
  } catch (error) {
    console.error("[QR Presença] Erro ao gerar QR Code.", {
      message: error?.message || String(error),
      turma_id,
      data_presenca,
    });

    notifyError("Erro ao gerar QR Code.");

    return false;
  }
}
