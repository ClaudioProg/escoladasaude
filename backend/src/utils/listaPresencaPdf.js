"use strict";

const PDFDocument = require("pdfkit");

const LAYOUT = Object.freeze({
  margin: 36,
  rowHeight: 28,
  confirmationWidth: 116,
  minimumSignatureWidth: 210,
});

function formatarDataBR(value) {
  const text = String(value || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text || "—";
}

function formatarDataHoraBR(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function cpfProtegido(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11) return "—";
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

function criarListaPresencaPdf({ turma, datas, inscritos, presencas, output }) {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: LAYOUT.margin,
    bufferPages: true,
    info: {
      Title: `Lista de Presença - Turma ${turma.id}`,
      Author: "Plataforma Escola da Saúde",
    },
  });

  if (output) doc.pipe(output);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - LAYOUT.margin * 2;
  const cols = [220, 105, 88, LAYOUT.confirmationWidth];
  cols.push(contentWidth - cols.reduce((total, width) => total + width, 0));

  if (cols[4] < LAYOUT.minimumSignatureWidth) {
    throw new Error("Largura insuficiente para a coluna de assinatura.");
  }

  const presencaMap = new Map(
    (presencas || []).map((item) => [
      `${item.usuario_id}|${item.data_presenca}`,
      item,
    ]),
  );

  function drawHeader(dataTurma) {
    const margin = LAYOUT.margin;

    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("LISTA DE PRESENÇA", margin, 24, {
        width: contentWidth,
        align: "center",
      });

    doc
      .moveTo(margin, 52)
      .lineTo(pageWidth - margin, 52)
      .lineWidth(1.5)
      .strokeColor("#0f766e")
      .stroke();

    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`Evento: ${turma.evento_titulo || "—"}`, margin, 64, {
        width: contentWidth,
        ellipsis: true,
      });

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#334155")
      .text(`Turma: ${turma.nome || "—"}`, margin, 82, { width: 315 })
      .text(`Data: ${formatarDataBR(dataTurma.data)}`, margin + 320, 82, {
        width: 165,
      })
      .text(
        `Horário: ${dataTurma.horario_inicio || "—"} às ${dataTurma.horario_fim || "—"}`,
        margin + 490,
        82,
        { width: contentWidth - 490 },
      );

    if (turma.evento_local) {
      doc.text(`Local: ${turma.evento_local}`, margin, 98, {
        width: contentWidth,
        ellipsis: true,
      });
    }

    doc
      .fillColor("#64748b")
      .fontSize(9)
      .text(`Gerado em: ${formatarDataHoraBR(new Date())}`, margin, 112, {
        width: contentWidth,
        align: "right",
      });
  }

  function drawTableHeader(y) {
    doc
      .save()
      .roundedRect(LAYOUT.margin, y, contentWidth, 24, 8)
      .fill("#0f766e")
      .restore();

    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
    let x = LAYOUT.margin + 8;

    ["Nome", "CPF", "Situação", "Confirmação", "Assinatura"].forEach(
      (label, index) => {
        doc.text(label, x, y + 7, { width: cols[index] - 12, ellipsis: true });
        x += cols[index];
      },
    );

    return y + 30;
  }

  function startPage(dataTurma, addPage) {
    if (addPage) {
      doc.addPage({ size: "A4", layout: "landscape", margin: LAYOUT.margin });
    }
    drawHeader(dataTurma);
    return drawTableHeader(132);
  }

  (datas || []).forEach((dataTurma, dataIndex) => {
    let y = startPage(dataTurma, dataIndex > 0);

    for (const inscrito of inscritos || []) {
      if (y + LAYOUT.rowHeight > pageHeight - LAYOUT.margin - 16) {
        y = startPage(dataTurma, true);
      }

      const key = `${inscrito.usuario_id}|${dataTurma.data}`;
      const presenca = presencaMap.get(key);
      const presente = presenca?.presente === true;
      const confirmacao = presente
        ? formatarDataHoraBR(presenca.confirmado_em)
        : "—";

      doc
        .save()
        .roundedRect(
          LAYOUT.margin,
          y - 3,
          contentWidth,
          LAYOUT.rowHeight - 4,
          6,
        )
        .fill(
          Math.floor(y / LAYOUT.rowHeight) % 2 === 0 ? "#f8fafc" : "#ffffff",
        )
        .restore();

      doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
      let x = LAYOUT.margin + 8;

      doc.text(inscrito.nome || "—", x, y + 5, {
        width: cols[0] - 12,
        ellipsis: true,
      });
      x += cols[0];

      doc.text(cpfProtegido(inscrito.cpf), x, y + 5, {
        width: cols[1] - 12,
        ellipsis: true,
      });
      x += cols[1];

      doc
        .fillColor(presente ? "#166534" : "#991b1b")
        .font("Helvetica-Bold")
        .text(presente ? "Presente" : "Ausente", x, y + 5, {
          width: cols[2] - 12,
          ellipsis: true,
        });
      x += cols[2];

      doc
        .fillColor("#0f172a")
        .font("Helvetica")
        .fontSize(8)
        .text(confirmacao, x, y + 5, {
          width: cols[3] - 12,
          ellipsis: true,
        });
      x += cols[3];

      if (presente) {
        doc.text("—", x, y + 5, { width: cols[4] - 12, align: "center" });
      } else {
        const lineY = y + 14;
        doc
          .moveTo(x + 8, lineY)
          .lineTo(x + cols[4] - 12, lineY)
          .lineWidth(0.6)
          .strokeColor("#334155")
          .stroke();
      }

      y += LAYOUT.rowHeight;
    }
  });

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#64748b")
      .text(
        `Página ${index + 1} de ${range.count}`,
        pageWidth - LAYOUT.margin - 100,
        pageHeight - LAYOUT.margin - 24,
        { width: 100, align: "right", lineBreak: false },
      );
  }

  doc.end();
  return { doc, layout: { ...LAYOUT, columns: cols, contentWidth } };
}

module.exports = { LAYOUT, criarListaPresencaPdf };
