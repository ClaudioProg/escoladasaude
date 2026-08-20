"use strict";

const PDFDocument = require("pdfkit");

const COR_PRIMARIA = "#14532d";
const COR_DESTAQUE = "#0f766e";
const COR_TEXTO = "#0f172a";
const COR_MUTED = "#64748b";
const COR_BORDA = "#dbe4ea";
const COR_FUNDO = "#f8fafc";
const MARGEM = 42;
const RODAPE_ALTURA = 58;

function textoSeguro(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatarDataHora(value) {
  if (!value) {
    return "Não disponível";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Não disponível";
  }

  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatarPercentual(value) {
  const number = Number(value || 0);
  return `${number.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

function formatarNomeArquivoRelatorio({ eventoId, numeroVersao, tipo }) {
  return `pre-teste-evento-${Number(eventoId)}-versao-${Number(
    numeroVersao,
  )}-${tipo}.pdf`;
}

function desenharCabecalho(doc, titulo, compacto = false) {
  const pageWidth = doc.page.width;
  const altura = compacto ? 58 : 94;

  doc.save();
  doc.rect(0, 0, pageWidth, altura).fill(COR_PRIMARIA);
  doc.rect(0, 0, pageWidth, 6).fill("#f59e0b");
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(compacto ? 12 : 18)
    .text(titulo, MARGEM, compacto ? 22 : 25, {
      width: pageWidth - MARGEM * 2,
      lineBreak: false,
      ellipsis: true,
    });

  if (!compacto) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#d1fae5")
      .text(
        "Prefeitura Municipal de Santos - Secretaria Municipal de Saúde - Escola da Saúde",
        MARGEM,
        53,
        { width: pageWidth - MARGEM * 2 },
      );
    doc
      .fontSize(7.5)
      .fillColor("#bbf7d0")
      .text(
        "Documento administrativo gerado pela Plataforma Escola da Saúde",
        MARGEM,
        72,
        {
          width: pageWidth - MARGEM * 2,
        },
      );
  }

  doc.restore();
  doc.x = MARGEM;
  doc.y = altura + 20;
}

function adicionarPagina(doc, titulo) {
  doc.addPage();
  desenharCabecalho(doc, titulo, true);
}

function limiteInferior(doc) {
  return doc.page.height - RODAPE_ALTURA - 12;
}

function garantirEspaco(doc, altura, titulo) {
  if (doc.y + altura <= limiteInferior(doc)) {
    return;
  }

  adicionarPagina(doc, titulo);
}

function quebrarPalavra(doc, palavra, largura) {
  const partes = [];
  let atual = "";

  for (const char of palavra) {
    const candidato = `${atual}${char}`;
    if (atual && doc.widthOfString(candidato) > largura) {
      partes.push(atual);
      atual = char;
    } else {
      atual = candidato;
    }
  }

  if (atual) {
    partes.push(atual);
  }
  return partes;
}

function quebrarLinhas(doc, value, largura) {
  const paragraphs = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n");
  const linhas = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";

    if (!words.length) {
      linhas.push("");
    }

    for (const originalWord of words) {
      const parts =
        doc.widthOfString(originalWord) > largura
          ? quebrarPalavra(doc, originalWord, largura)
          : [originalWord];

      for (const word of parts) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && doc.widthOfString(candidate) > largura) {
          linhas.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
    }

    if (line) {
      linhas.push(line);
    }
    if (paragraphIndex < paragraphs.length - 1) {
      linhas.push("");
    }
  });

  return linhas.length ? linhas : [""];
}

function escreverTexto(
  doc,
  value,
  {
    tituloDocumento,
    x = MARGEM,
    largura = doc.page.width - MARGEM * 2,
    font = "Helvetica",
    size = 9,
    color = COR_TEXTO,
    lineHeight = size * 1.35,
    after = 4,
  } = {},
) {
  doc.font(font).fontSize(size).fillColor(color);
  const linhas = quebrarLinhas(doc, textoSeguro(value, ""), largura);

  for (const linha of linhas) {
    garantirEspaco(doc, lineHeight + 2, tituloDocumento);
    doc.font(font).fontSize(size).fillColor(color);
    const y = doc.y;
    doc.text(linha || " ", x, y, {
      width: largura,
      height: lineHeight,
      lineBreak: false,
      ellipsis: false,
    });
    doc.y = y + lineHeight;
  }

  doc.y += after;
}

function desenharTituloSecao(doc, titulo, tituloDocumento) {
  garantirEspaco(doc, 35, tituloDocumento);
  const y = doc.y;
  doc
    .roundedRect(MARGEM, y, doc.page.width - MARGEM * 2, 27, 6)
    .fill(COR_FUNDO);
  doc
    .fillColor(COR_PRIMARIA)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(titulo, MARGEM + 10, y + 8, {
      width: doc.page.width - MARGEM * 2 - 20,
      lineBreak: false,
      ellipsis: true,
    });
  doc.y = y + 37;
}

function desenharResumo(doc, dados, tituloDocumento) {
  desenharTituloSecao(doc, "Resumo", tituloDocumento);
  const items = [
    ["Respondentes únicos", dados.resumo.respondentes_unicos],
    ["Perguntas", dados.resumo.numero_perguntas],
    ["Primeira resposta", formatarDataHora(dados.resumo.primeira_resposta)],
    ["Resposta mais recente", formatarDataHora(dados.resumo.ultima_resposta)],
  ];
  const gap = 8;
  const largura = (doc.page.width - MARGEM * 2 - gap) / 2;
  garantirEspaco(doc, 112, tituloDocumento);
  const inicioY = doc.y;

  items.forEach(([label, value], index) => {
    const x = MARGEM + (index % 2) * (largura + gap);
    const y = inicioY + Math.floor(index / 2) * 58;

    doc.roundedRect(x, y, largura, 48, 7).fillAndStroke("#ffffff", COR_BORDA);
    doc
      .fillColor(COR_MUTED)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(String(label).toUpperCase(), x + 9, y + 9, {
        width: largura - 18,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(COR_TEXTO)
      .font("Helvetica-Bold")
      .fontSize(index < 2 ? 15 : 8.5)
      .text(String(value ?? "0"), x + 9, y + 25, {
        width: largura - 18,
        lineBreak: false,
        ellipsis: true,
      });
  });

  doc.y = inicioY + 120;
}

function desenharTabelaObjetiva(doc, pergunta, tituloDocumento) {
  const tableWidth = doc.page.width - MARGEM * 2;
  const answerWidth = tableWidth - 118;
  const countWidth = 56;
  const percentWidth = 62;

  garantirEspaco(doc, 26, tituloDocumento);
  const headerY = doc.y;
  doc.rect(MARGEM, headerY, tableWidth, 22).fill(COR_DESTAQUE);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text("Alternativa", MARGEM + 7, headerY + 7, {
      width: answerWidth - 14,
      lineBreak: false,
    })
    .text("Respostas", MARGEM + answerWidth, headerY + 7, {
      width: countWidth,
      align: "center",
      lineBreak: false,
    })
    .text("Percentual", MARGEM + answerWidth + countWidth, headerY + 7, {
      width: percentWidth,
      align: "center",
      lineBreak: false,
    });
  doc.y = headerY + 22;

  pergunta.alternativas.forEach((alternativa, index) => {
    doc.font("Helvetica").fontSize(8);
    const linhas = quebrarLinhas(doc, alternativa.texto, answerWidth - 14);
    const rowHeight = Math.max(24, linhas.length * 11 + 10);
    garantirEspaco(doc, rowHeight + 2, tituloDocumento);

    const y = doc.y;
    doc
      .rect(MARGEM, y, tableWidth, rowHeight)
      .fillAndStroke(index % 2 === 0 ? "#ffffff" : COR_FUNDO, COR_BORDA);
    doc
      .fillColor(COR_TEXTO)
      .font("Helvetica")
      .fontSize(8)
      .text(alternativa.texto, MARGEM + 7, y + 6, {
        width: answerWidth - 14,
      })
      .font("Helvetica-Bold")
      .text(String(alternativa.quantidade), MARGEM + answerWidth, y + 8, {
        width: countWidth,
        align: "center",
        lineBreak: false,
      })
      .text(
        formatarPercentual(alternativa.percentual),
        MARGEM + answerWidth + countWidth,
        y + 8,
        { width: percentWidth, align: "center", lineBreak: false },
      );
    doc.y = y + rowHeight;
  });

  doc.y += 6;
  escreverTexto(doc, `Total de respostas: ${pergunta.total_respostas}`, {
    tituloDocumento,
    font: "Helvetica-Bold",
    size: 8,
    color: COR_MUTED,
    after: 10,
  });
}

function desenharPerguntasConsolidadas(doc, dados, tituloDocumento) {
  desenharTituloSecao(doc, "Resultados por pergunta", tituloDocumento);

  dados.perguntas.forEach((pergunta, index) => {
    garantirEspaco(doc, 54, tituloDocumento);
    escreverTexto(doc, `Pergunta ${index + 1}`, {
      tituloDocumento,
      font: "Helvetica-Bold",
      size: 9,
      color: COR_DESTAQUE,
      after: 1,
    });
    escreverTexto(doc, pergunta.enunciado, {
      tituloDocumento,
      font: "Helvetica-Bold",
      size: 10.5,
      after: 8,
    });

    if (pergunta.tipo === "multipla_escolha") {
      desenharTabelaObjetiva(doc, pergunta, tituloDocumento);
      return;
    }

    if (!pergunta.respostas.length) {
      escreverTexto(doc, "Nenhuma resposta registrada.", {
        tituloDocumento,
        color: COR_MUTED,
        after: 12,
      });
      return;
    }

    pergunta.respostas.forEach((resposta, respostaIndex) => {
      garantirEspaco(doc, 38, tituloDocumento);
      escreverTexto(doc, `Resposta ${respostaIndex + 1}`, {
        tituloDocumento,
        font: "Helvetica-Bold",
        size: 8,
        color: COR_MUTED,
        after: 1,
      });
      escreverTexto(doc, resposta.resposta, {
        tituloDocumento,
        size: 9,
        after: 7,
      });
    });

    doc.y += 5;
  });
}

function desenharParticipantesDetalhados(doc, dados, tituloDocumento) {
  desenharTituloSecao(doc, "Respostas por participante", tituloDocumento);

  dados.participantes.forEach((participante, participantIndex) => {
    garantirEspaco(doc, 70, tituloDocumento);
    const participanteY = doc.y;
    doc
      .roundedRect(MARGEM, participanteY, doc.page.width - MARGEM * 2, 42, 7)
      .fillAndStroke("#ecfdf5", "#a7f3d0");
    doc
      .fillColor(COR_PRIMARIA)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        `Participante ${participantIndex + 1} - ${textoSeguro(participante.nome)}`,
        MARGEM + 10,
        participanteY + 8,
        { width: doc.page.width - MARGEM * 2 - 20, ellipsis: true },
      );
    doc
      .fillColor(COR_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Respondido em: ${formatarDataHora(participante.enviado_em)}`,
        MARGEM + 10,
        participanteY + 25,
        { width: doc.page.width - MARGEM * 2 - 20, lineBreak: false },
      );
    doc.y = participanteY + 54;

    participante.respostas.forEach((resposta, answerIndex) => {
      garantirEspaco(doc, 50, tituloDocumento);
      escreverTexto(doc, `Pergunta ${answerIndex + 1}`, {
        tituloDocumento,
        font: "Helvetica-Bold",
        size: 8,
        color: COR_DESTAQUE,
        after: 1,
      });
      escreverTexto(doc, resposta.enunciado, {
        tituloDocumento,
        font: "Helvetica-Bold",
        size: 9,
        after: 2,
      });
      escreverTexto(doc, `Resposta: ${textoSeguro(resposta.resposta)}`, {
        tituloDocumento,
        size: 9,
        after: 8,
      });
    });

    doc.y += 6;
  });
}

function finalizarRodapes(doc, emitidoEm) {
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const width = doc.page.width;
    const height = doc.page.height;
    const y = height - MARGEM - 12;

    doc.save();
    doc
      .moveTo(MARGEM, y - 8)
      .lineTo(width - MARGEM, y - 8)
      .strokeColor(COR_BORDA)
      .lineWidth(0.6)
      .stroke();
    doc
      .fillColor(COR_MUTED)
      .font("Helvetica")
      .fontSize(7)
      .text("Fonte: Plataforma Escola da Saúde", MARGEM, y, {
        width: 185,
        lineBreak: false,
      })
      .text(`Emitido em: ${formatarDataHora(emitidoEm)}`, 210, y, {
        width: 220,
        align: "center",
        lineBreak: false,
      })
      .text(`Página ${index + 1} de ${range.count}`, width - 135, y, {
        width: 93,
        align: "right",
        lineBreak: false,
      });
    doc.restore();
  }
}

function gerarPdfResultadosPreTeste({ tipo, dados, emitidoEm = new Date() }) {
  return new Promise((resolve, reject) => {
    const detalhado = tipo === "detalhado";
    const tituloDocumento = detalhado
      ? "Relatório Detalhado do Pré-Teste"
      : "Relatório de Resultados do Pré-Teste";
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGEM,
      bufferPages: true,
      info: {
        Title: tituloDocumento,
        Author: "Escola da Saúde - Secretaria Municipal de Saúde",
        Subject: textoSeguro(dados?.evento?.titulo, "Pré-teste"),
      },
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    desenharCabecalho(doc, tituloDocumento);
    escreverTexto(doc, `Evento: ${textoSeguro(dados.evento.titulo)}`, {
      tituloDocumento,
      font: "Helvetica-Bold",
      size: 12,
      after: 3,
    });
    escreverTexto(
      doc,
      `Versão do pré-teste: ${dados.versao_selecionada.numero_versao}`,
      {
        tituloDocumento,
        size: 9,
        color: COR_MUTED,
        after: 1,
      },
    );
    escreverTexto(
      doc,
      `Publicado em: ${formatarDataHora(dados.versao_selecionada.publicado_em)}`,
      {
        tituloDocumento,
        size: 9,
        color: COR_MUTED,
        after: 1,
      },
    );
    escreverTexto(doc, `Emitido em: ${formatarDataHora(emitidoEm)}`, {
      tituloDocumento,
      size: 9,
      color: COR_MUTED,
      after: 12,
    });

    desenharResumo(doc, dados, tituloDocumento);

    if (detalhado) {
      desenharParticipantesDetalhados(doc, dados, tituloDocumento);
    } else {
      desenharPerguntasConsolidadas(doc, dados, tituloDocumento);
    }

    finalizarRodapes(doc, emitidoEm);
    doc.end();
  });
}

module.exports = {
  formatarDataHora,
  formatarNomeArquivoRelatorio,
  gerarPdfResultadosPreTeste,
};
