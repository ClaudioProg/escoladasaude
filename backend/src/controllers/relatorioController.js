/* eslint-disable no-console */
"use strict";

/**
 * ✅ backend/src/controllers/relatorioController.js — v3.0
 * Atualizado em: 11/06/2026
 * Plataforma Escola da Saúde
 *
 * Função:
 * - Controller oficial de relatórios institucionais.
 * - Relatórios individuais mantidos.
 * - Novo dashboard institucional:
 *   - geral: totais globais da plataforma.
 *   - filtrado: indicadores afetados pelos filtros.
 *   - series: dados para gráficos.
 *   - tabelas: dados resumidos para tela e exportação.
 * - Exportação XLSX.
 * - Exportação PDF institucional visual.
 *
 * Mount oficial:
 * - /api/relatorio
 */

const ExcelJS = require("exceljs");
const dbFallback = require("../db");

const IS_DEV = process.env.NODE_ENV !== "production";
const TZ = "America/Sao_Paulo";
const PAPEL_ORGANIZADOR = "organizador";

/* ─────────────────────────────────────────────
 * DB
 * ───────────────────────────────────────────── */

function getDb(req) {
  if (req?.db && typeof req.db.query === "function") return req.db;
  if (dbFallback && typeof dbFallback.query === "function") return dbFallback;

  throw new Error("Contrato inválido: db.query não disponível.");
}

async function query(req, sql, params = []) {
  const db = getDb(req);
  return db.query(sql, params);
}

/* ─────────────────────────────────────────────
 * Respostas
 * ───────────────────────────────────────────── */

function getRequestId(req) {
  return req?.requestId || req?.rid || null;
}

function sucesso(req, res, data, message, code, meta = {}) {
  return res.status(200).json({
    ok: true,
    data,
    message,
    code,
    meta: {
      ...meta,
      requestId: getRequestId(req),
    },
  });
}

function erro(req, res, statusCode, message, code, adminHint, details = null) {
  return res.status(statusCode).json({
    ok: false,
    data: null,
    message,
    code,
    adminHint,
    details: IS_DEV ? details : null,
    requestId: getRequestId(req),
  });
}

/* ─────────────────────────────────────────────
 * Logs
 * ───────────────────────────────────────────── */

function logError(req, label, error) {
  console.error(
    `[relatorioController][${getRequestId(req) || "-"}][ERR] ${label}`,
    error?.stack || error?.message || error,
  );
}

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

function setNoStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function validarYMD(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizarFiltros(req) {
  const data_inicio = validarYMD(req.query?.data_inicio);
  const data_fim = validarYMD(req.query?.data_fim);
  const evento_id = toPositiveInt(req.query?.evento_id);
  const turma_id = toPositiveInt(req.query?.turma_id);
  const organizador_id = toPositiveInt(req.query?.organizador_id);
  const usuario_id = toPositiveInt(req.query?.usuario_id);
  const unidade_id = toPositiveInt(req.query?.unidade_id);
  const status =
    String(req.query?.status || "")
      .trim()
      .toLowerCase() || null;

  let inicio = data_inicio;
  let fim = data_fim;

  if (inicio && fim && inicio > fim) {
    [inicio, fim] = [fim, inicio];
  }

  return {
    data_inicio: inicio,
    data_fim: fim,
    evento_id,
    turma_id,
    organizador_id,
    usuario_id,
    unidade_id,
    status:
      ["programado", "andamento", "encerrado"].includes(status) ||
      [
        "emitido",
        "enviado",
        "cancelado",
        "anulado",
        "substituido",
        "erro_emissao",
      ].includes(status)
        ? status
        : null,
  };
}

function addFiltroPeriodo(params, where, coluna, filtros) {
  if (filtros.data_inicio) {
    params.push(filtros.data_inicio);
    where.push(`${coluna}::date >= $${params.length}::date`);
  }

  if (filtros.data_fim) {
    params.push(filtros.data_fim);
    where.push(`${coluna}::date <= $${params.length}::date`);
  }
}

function addFiltroId(params, where, coluna, value) {
  if (value) {
    params.push(value);
    where.push(`${coluna} = $${params.length}`);
  }
}

function whereSql(where) {
  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

function hojeYMD() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatarNomePlanilha(value) {
  return String(value || "Relatorio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function formatarNomeArquivo(value) {
  return String(value || "relatorio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 90);
}

function getNotaSql(alias = "a") {
  return `
    CASE ${alias}.desempenho_organizador::text
      WHEN 'Ótimo' THEN 10
      WHEN 'Bom' THEN 8
      WHEN 'Regular' THEN 6
      WHEN 'Ruim' THEN 4
      WHEN 'Péssimo' THEN 2
      ELSE NULL
    END
  `;
}

function getNotaCampoSql(campo) {
  return `
    CASE ${campo}::text
      WHEN 'Ótimo' THEN 10
      WHEN 'Bom' THEN 8
      WHEN 'Regular' THEN 6
      WHEN 'Ruim' THEN 4
      WHEN 'Péssimo' THEN 2
      ELSE NULL
    END
  `;
}

async function tableExists(req, tableName) {
  const result = await query(
    req,
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS existe
    `,
    [tableName],
  );

  return result.rows?.[0]?.existe === true;
}

function periodoTexto(filtros) {
  if (filtros.data_inicio && filtros.data_fim) {
    return `${filtros.data_inicio} a ${filtros.data_fim}`;
  }

  if (filtros.data_inicio) {
    return `A partir de ${filtros.data_inicio}`;
  }

  if (filtros.data_fim) {
    return `Até ${filtros.data_fim}`;
  }

  return "Todo o histórico";
}

/* ─────────────────────────────────────────────
 * XLSX
 * ───────────────────────────────────────────── */

async function enviarXlsx(res, filename, sheetName, columns, rows, meta = {}) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Plataforma Escola da Saúde";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = columns;

  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };

  worksheet.getRow(1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };

  rows.forEach((row) => worksheet.addRow(row));

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      cell.alignment = {
        vertical: "middle",
        wrapText: true,
      };
    });
  });

  if (columns.length) {
    const lastColumnLetter =
      columns.length <= 26 ? String.fromCharCode(64 + columns.length) : "Z";

    worksheet.autoFilter = {
      from: "A1",
      to: `${lastColumnLetter}1`,
    };
  }

  const metaSheet = workbook.addWorksheet("Metadados");

  metaSheet.columns = [
    { header: "Campo", key: "campo", width: 32 },
    { header: "Valor", key: "valor", width: 100 },
  ];

  metaSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  metaSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };

  Object.entries(meta).forEach(([campo, valor]) => {
    metaSheet.addRow({
      campo,
      valor:
        typeof valor === "object" ? JSON.stringify(valor) : String(valor ?? ""),
    });
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${formatarNomePlanilha(filename)}.xlsx`,
  );

  await workbook.xlsx.write(res);
  return res.end();
}

function addWorksheetFromObjects(workbook, sheetName, rows) {
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const safeRows = Array.isArray(rows) ? rows : [];

  const keys = Array.from(
    safeRows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set()),
  );

  const columns = keys.length
    ? keys.map((key) => ({
        header: key,
        key,
        width: Math.min(Math.max(key.length + 8, 16), 48),
      }))
    : [{ header: "sem_dados", key: "sem_dados", width: 20 }];

  worksheet.columns = columns;

  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };

  if (safeRows.length) {
    safeRows.forEach((row) => {
      const item = {};

      keys.forEach((key) => {
        const value = row?.[key];
        item[key] =
          value && typeof value === "object" ? JSON.stringify(value) : value;
      });

      worksheet.addRow(item);
    });
  }

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  });

  return worksheet;
}

async function enviarXlsxInstitucional(req, res, dashboard) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Plataforma Escola da Saúde";
  workbook.created = new Date();
  workbook.modified = new Date();

  addWorksheetFromObjects(workbook, "Resumo Geral", [dashboard.geral]);
  addWorksheetFromObjects(workbook, "Resumo Filtrado", [dashboard.filtrado]);
  addWorksheetFromObjects(workbook, "Serie por Mes", dashboard.series?.por_mes);
  addWorksheetFromObjects(workbook, "Status", dashboard.series?.por_status);
  addWorksheetFromObjects(
    workbook,
    "Top Eventos",
    dashboard.series?.top_eventos,
  );
  addWorksheetFromObjects(workbook, "Eventos", dashboard.tabelas?.eventos);
  addWorksheetFromObjects(workbook, "Saude", dashboard.tabelas?.saude);

  const metaSheet = workbook.addWorksheet("Filtros");

  metaSheet.columns = [
    { header: "Campo", key: "campo", width: 32 },
    { header: "Valor", key: "valor", width: 90 },
  ];

  metaSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  metaSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };

  Object.entries(dashboard.filtros || {}).forEach(([campo, valor]) => {
    metaSheet.addRow({ campo, valor: String(valor ?? "") });
  });

  metaSheet.addRow({
    campo: "gerado_em",
    valor: dashboard.gerado_em || new Date().toISOString(),
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${formatarNomeArquivo(
      `relatorio_institucional_${hojeYMD()}`,
    )}.xlsx`,
  );

  await workbook.xlsx.write(res);
  return res.end();
}

/* ─────────────────────────────────────────────
 * Dashboard institucional
 * ───────────────────────────────────────────── */

function buildTurmasFiltradasWhere(filtros) {
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "t.data_inicio", filtros);
  addFiltroId(params, where, "e.id", filtros.evento_id);
  addFiltroId(params, where, "t.id", filtros.turma_id);

  if (filtros.status) {
    params.push(filtros.status);
    where.push(`
      CASE
        WHEN (now() AT TIME ZONE '${TZ}') BETWEEN
          (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
          AND
          (t.data_fim::timestamp + COALESCE(t.horario_fim, '23:59'::time))
          THEN 'andamento'
        WHEN (now() AT TIME ZONE '${TZ}') <
          (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
          THEN 'programado'
        ELSE 'encerrado'
      END = $${params.length}
    `);
  }

  if (filtros.organizador_id) {
    params.push(filtros.organizador_id);
    where.push(`
      EXISTS (
        SELECT 1
        FROM turma_responsavel tr
        WHERE tr.turma_id = t.id
          AND tr.usuario_id = $${params.length}
          AND tr.papel = '${PAPEL_ORGANIZADOR}'
      )
    `);
  }

  return {
    params,
    where,
    sqlWhere: whereSql(where),
  };
}

async function consultarDashboardInstitucional(req, filtros) {
  const { params, sqlWhere } = buildTurmasFiltradasWhere(filtros);
  const paramsBase = [...params];

  const usuarioFilterSql = filtros.usuario_id
    ? `AND i.usuario_id = $${paramsBase.length + 1}`
    : "";

  if (filtros.usuario_id) {
    paramsBase.push(filtros.usuario_id);
  }

  const unidadeFilterSql = filtros.unidade_id
    ? `AND u.unidade_id = $${paramsBase.length + 1}`
    : "";

  if (filtros.unidade_id) {
    paramsBase.push(filtros.unidade_id);
  }

  const result = await query(
    req,
    `
    WITH turmas_filtradas AS (
      SELECT
        t.id AS turma_id,
        t.evento_id,
        t.nome AS turma,
        t.data_inicio,
        t.data_fim,
        t.horario_inicio,
        t.horario_fim,
        e.titulo AS evento,
        e.local AS local,
        CASE
          WHEN (now() AT TIME ZONE '${TZ}') BETWEEN
            (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
            AND
            (t.data_fim::timestamp + COALESCE(t.horario_fim, '23:59'::time))
            THEN 'andamento'
          WHEN (now() AT TIME ZONE '${TZ}') <
            (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
            THEN 'programado'
          ELSE 'encerrado'
        END AS status_calculado
      FROM turmas t
      JOIN eventos e ON e.id = t.evento_id
      ${sqlWhere}
    ),
    inscritos_filtrados AS (
      SELECT
        i.id AS inscricao_id,
        i.usuario_id,
        i.turma_id,
        i.data_inscricao,
        u.unidade_id
      FROM inscricoes i
      JOIN turmas_filtradas tf ON tf.turma_id = i.turma_id
      JOIN usuarios u ON u.id = i.usuario_id
      WHERE true
      ${usuarioFilterSql}
      ${unidadeFilterSql}
    ),
    presencas_filtradas AS (
  SELECT DISTINCT
    p.id,
    p.usuario_id,
    p.turma_id,
    p.data_presenca,
    p.presente
  FROM inscritos_filtrados i
  JOIN presencas p
    ON p.turma_id = i.turma_id
   AND p.usuario_id = i.usuario_id
  WHERE true
),
    avaliacoes_filtradas AS (
      SELECT
        a.id,
        a.usuario_id,
        a.turma_id,
        a.data_avaliacao
      FROM avaliacoes a
      JOIN turmas_filtradas tf ON tf.turma_id = a.turma_id
      JOIN usuarios u ON u.id = a.usuario_id
      WHERE true
      ${filtros.usuario_id ? `AND a.usuario_id = $${filtros.unidade_id ? paramsBase.length - 1 : paramsBase.length}` : ""}
      ${filtros.unidade_id ? `AND u.unidade_id = $${paramsBase.length}` : ""}
    ),
    certificados_filtrados AS (
      SELECT
        c.id,
        c.usuario_id,
        c.turma_id,
        c.status,
        c.gerado_em
      FROM certificados c
      JOIN turmas_filtradas tf ON tf.turma_id = c.turma_id
      JOIN usuarios u ON u.id = c.usuario_id
      WHERE true
      ${filtros.usuario_id ? `AND c.usuario_id = $${filtros.unidade_id ? paramsBase.length - 1 : paramsBase.length}` : ""}
      ${filtros.unidade_id ? `AND u.unidade_id = $${paramsBase.length}` : ""}
    ),
geral AS (
  SELECT
    (SELECT COUNT(*)::int FROM eventos) AS eventos_total,
    (SELECT COUNT(*)::int FROM turmas) AS turmas_total,
    (SELECT COUNT(*)::int FROM inscricoes) AS inscricoes_total,

    (
      SELECT COUNT(DISTINCT (p.usuario_id, p.turma_id)) FILTER (WHERE p.presente IS TRUE)::int
      FROM presencas p
      WHERE EXISTS (
        SELECT 1
        FROM inscricoes i
        WHERE i.turma_id = p.turma_id
          AND i.usuario_id = p.usuario_id
      )
    ) AS presencas_total,

    (
      SELECT COUNT(*) FILTER (WHERE p.presente IS TRUE)::int
      FROM presencas p
      WHERE EXISTS (
        SELECT 1
        FROM inscricoes i
        WHERE i.turma_id = p.turma_id
          AND i.usuario_id = p.usuario_id
      )
    ) AS registros_presenca_total,

    (SELECT COUNT(*)::int FROM avaliacoes) AS avaliacoes_total,
    (SELECT COUNT(*) FILTER (WHERE status IN ('emitido', 'enviado'))::int FROM certificados) AS certificados_validos_total,
    (SELECT COUNT(*) FILTER (WHERE status IN ('emitido', 'enviado'))::int FROM certificados_avulsos) AS certificados_avulsos_validos_total,
    (SELECT COUNT(*)::int FROM usuarios) AS usuarios_total,
    (SELECT COUNT(*)::int FROM reservas_salas) AS reservas_total
),
    filtrado AS (
      SELECT
        (SELECT COUNT(DISTINCT evento_id)::int FROM turmas_filtradas) AS eventos,
        (SELECT COUNT(DISTINCT turma_id)::int FROM turmas_filtradas) AS turmas,
        (SELECT COUNT(*)::int FROM inscritos_filtrados) AS inscricoes,
        (SELECT COUNT(DISTINCT usuario_id)::int FROM inscritos_filtrados) AS usuarios_envolvidos,
        (
  SELECT COUNT(DISTINCT (usuario_id, turma_id)) FILTER (WHERE presente IS TRUE)::int
  FROM presencas_filtradas
) AS presencas,

(
  SELECT COUNT(*) FILTER (WHERE presente IS TRUE)::int
  FROM presencas_filtradas
) AS registros_presenca,

(
  SELECT COUNT(DISTINCT (usuario_id, turma_id)) FILTER (WHERE presente IS NOT TRUE)::int
  FROM presencas_filtradas
) AS ausencias_registradas,
        (SELECT COUNT(*)::int FROM avaliacoes_filtradas) AS avaliacoes,
        (SELECT COUNT(*) FILTER (WHERE status IN ('emitido', 'enviado'))::int FROM certificados_filtrados) AS certificados,
        (SELECT COUNT(*) FILTER (WHERE status = 'emitido')::int FROM certificados_filtrados) AS certificados_emitidos,
        (SELECT COUNT(*) FILTER (WHERE status = 'enviado')::int FROM certificados_filtrados) AS certificados_enviados
    )
    SELECT
      row_to_json(geral.*) AS geral,
      row_to_json(filtrado.*) AS filtrado
    FROM geral, filtrado
    `,
    paramsBase,
  );

  const base = result.rows?.[0] || {};
  const geral = base.geral || {};
  const filtradoRaw = base.filtrado || {};

  const inscricoes = Number(filtradoRaw.inscricoes || 0);
  const presencas = Number(filtradoRaw.presencas || 0);
  const avaliacoes = Number(filtradoRaw.avaliacoes || 0);
  const certificados = Number(filtradoRaw.certificados || 0);

  const filtrado = {
    ...filtradoRaw,
    taxa_presenca:
      inscricoes > 0 ? Number(((presencas / inscricoes) * 100).toFixed(2)) : 0,
    taxa_avaliacao:
      inscricoes > 0 ? Number(((avaliacoes / inscricoes) * 100).toFixed(2)) : 0,
    taxa_certificacao:
      inscricoes > 0
        ? Number(((certificados / inscricoes) * 100).toFixed(2))
        : 0,
  };

  const paramsSeries = [...paramsBase];

  const seriesPorMes = await query(
    req,
    `
  WITH turmas_filtradas AS (
    SELECT
      t.id AS turma_id,
      t.evento_id,
      t.data_inicio
    FROM turmas t
    JOIN eventos e ON e.id = t.evento_id
    ${sqlWhere}
  ),
  inscritos_filtrados AS (
    SELECT
      i.id AS inscricao_id,
      i.usuario_id,
      i.turma_id,
      i.data_inscricao
    FROM inscricoes i
    JOIN turmas_filtradas tf ON tf.turma_id = i.turma_id
    JOIN usuarios u ON u.id = i.usuario_id
    WHERE true
    ${usuarioFilterSql}
    ${unidadeFilterSql}
  )
    SELECT
      to_char(date_trunc('month', tf.data_inicio::date), 'YYYY-MM') AS mes,
      COUNT(DISTINCT tf.evento_id)::int AS eventos,
      COUNT(DISTINCT tf.turma_id)::int AS turmas,
      COUNT(DISTINCT i.inscricao_id)::int AS inscricoes,
      COUNT(DISTINCT (p.usuario_id, p.turma_id)) FILTER (WHERE p.presente IS TRUE)::int AS presencas,
COUNT(DISTINCT p.id) FILTER (WHERE p.presente IS TRUE)::int AS registros_presenca,
      COUNT(DISTINCT a.id)::int AS avaliacoes,
      COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('emitido', 'enviado'))::int AS certificados
    FROM turmas_filtradas tf
    LEFT JOIN inscritos_filtrados i ON i.turma_id = tf.turma_id
    LEFT JOIN presencas p ON p.turma_id = tf.turma_id
      AND p.usuario_id = i.usuario_id
      AND p.presente IS TRUE
    LEFT JOIN avaliacoes a ON a.turma_id = tf.turma_id
      AND a.usuario_id = i.usuario_id
    LEFT JOIN certificados c ON c.turma_id = tf.turma_id
      AND c.usuario_id = i.usuario_id
    GROUP BY date_trunc('month', tf.data_inicio::date)
    ORDER BY mes ASC
    `,
    paramsSeries,
  );

  const porStatus = await query(
    req,
    `
    WITH turmas_filtradas AS (
      SELECT
        t.id AS turma_id,
        CASE
          WHEN (now() AT TIME ZONE '${TZ}') BETWEEN
            (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
            AND
            (t.data_fim::timestamp + COALESCE(t.horario_fim, '23:59'::time))
            THEN 'andamento'
          WHEN (now() AT TIME ZONE '${TZ}') <
            (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
            THEN 'programado'
          ELSE 'encerrado'
        END AS status
      FROM turmas t
      JOIN eventos e ON e.id = t.evento_id
      ${sqlWhere}
    )
    SELECT
      status,
      COUNT(*)::int AS total
    FROM turmas_filtradas
    GROUP BY status
    ORDER BY status ASC
    `,
    params,
  );

  const topEventos = await query(
    req,
    `
  WITH turmas_filtradas AS (
    SELECT
      t.id AS turma_id,
      t.evento_id,
      e.titulo AS evento
    FROM turmas t
    JOIN eventos e ON e.id = t.evento_id
    ${sqlWhere}
  ),
  inscritos_filtrados AS (
    SELECT
      i.id AS inscricao_id,
      i.usuario_id,
      i.turma_id,
      i.data_inscricao
    FROM inscricoes i
    JOIN turmas_filtradas tf ON tf.turma_id = i.turma_id
    JOIN usuarios u ON u.id = i.usuario_id
    WHERE true
    ${usuarioFilterSql}
    ${unidadeFilterSql}
  )
    SELECT
      tf.evento_id,
      tf.evento,
      COUNT(DISTINCT tf.turma_id)::int AS turmas,
      COUNT(DISTINCT i.inscricao_id)::int AS inscricoes,
      COUNT(DISTINCT (p.usuario_id, p.turma_id)) FILTER (WHERE p.presente IS TRUE)::int AS presencas,
COUNT(DISTINCT p.id) FILTER (WHERE p.presente IS TRUE)::int AS registros_presenca,
      COUNT(DISTINCT a.id)::int AS avaliacoes,
      COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('emitido', 'enviado'))::int AS certificados
    FROM turmas_filtradas tf
    LEFT JOIN inscritos_filtrados i ON i.turma_id = tf.turma_id
    LEFT JOIN presencas p ON p.turma_id = tf.turma_id
      AND p.usuario_id = i.usuario_id
      AND p.presente IS TRUE
    LEFT JOIN avaliacoes a ON a.turma_id = tf.turma_id
      AND a.usuario_id = i.usuario_id
    LEFT JOIN certificados c ON c.turma_id = tf.turma_id
      AND c.usuario_id = i.usuario_id
    GROUP BY tf.evento_id, tf.evento
    ORDER BY inscricoes DESC, presencas DESC, tf.evento ASC
    LIMIT 12
    `,
    paramsSeries,
  );

  const eventosTabela = await query(
    req,
    `
    WITH turmas_filtradas AS (
      SELECT
        t.id AS turma_id,
        t.evento_id,
        t.nome AS turma,
        t.data_inicio,
        t.data_fim,
        e.titulo AS evento,
        e.local AS local
      FROM turmas t
      JOIN eventos e ON e.id = t.evento_id
      ${sqlWhere}
    )
    SELECT
      tf.evento_id,
      tf.evento,
      COUNT(DISTINCT tf.turma_id)::int AS turmas,
      MIN(tf.data_inicio)::date AS primeira_data,
      MAX(tf.data_fim)::date AS ultima_data,
      COUNT(DISTINCT i.id)::int AS inscricoes,
      COUNT(DISTINCT (p.usuario_id, p.turma_id)) FILTER (WHERE p.presente IS TRUE)::int AS presencas,
COUNT(DISTINCT p.id) FILTER (WHERE p.presente IS TRUE)::int AS registros_presenca,
      COUNT(DISTINCT a.id)::int AS avaliacoes,
      COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('emitido', 'enviado'))::int AS certificados
    FROM turmas_filtradas tf
    LEFT JOIN inscricoes i ON i.turma_id = tf.turma_id
    LEFT JOIN usuarios u ON u.id = i.usuario_id
    LEFT JOIN presencas p ON p.turma_id = tf.turma_id
      AND p.usuario_id = i.usuario_id
      AND p.presente IS TRUE
    LEFT JOIN avaliacoes a ON a.turma_id = tf.turma_id
      AND a.usuario_id = i.usuario_id
    LEFT JOIN certificados c ON c.turma_id = tf.turma_id
      AND c.usuario_id = i.usuario_id
    WHERE true
    ${filtros.usuario_id ? `AND i.usuario_id = $${filtros.unidade_id ? paramsBase.length - 1 : paramsBase.length}` : ""}
    ${filtros.unidade_id ? `AND u.unidade_id = $${paramsBase.length}` : ""}
    GROUP BY tf.evento_id, tf.evento
    ORDER BY primeira_data DESC NULLS LAST, tf.evento ASC
    LIMIT 50
    `,
    paramsBase,
  );

  const saude = await consultarSaudePlataforma(req);

  return {
    filtros,
    periodo: periodoTexto(filtros),
    gerado_em: new Date().toISOString(),
    geral: {
      eventos_total: Number(geral.eventos_total || 0),
      turmas_total: Number(geral.turmas_total || 0),
      inscricoes_total: Number(geral.inscricoes_total || 0),
      presencas_total: Number(geral.presencas_total || 0),
      registros_presenca_total: Number(geral.registros_presenca_total || 0),
      avaliacoes_total: Number(geral.avaliacoes_total || 0),
      certificados_validos_total: Number(geral.certificados_validos_total || 0),
      certificados_avulsos_validos_total: Number(
        geral.certificados_avulsos_validos_total || 0,
      ),
      usuarios_total: Number(geral.usuarios_total || 0),
      reservas_total: Number(geral.reservas_total || 0),
    },
    filtrado: {
      eventos: Number(filtrado.eventos || 0),
      turmas: Number(filtrado.turmas || 0),
      inscricoes: Number(filtrado.inscricoes || 0),
      usuarios_envolvidos: Number(filtrado.usuarios_envolvidos || 0),
      presencas: Number(filtrado.presencas || 0),
      registros_presenca: Number(filtrado.registros_presenca || 0),
      ausencias_registradas: Number(filtrado.ausencias_registradas || 0),
      avaliacoes: Number(filtrado.avaliacoes || 0),
      certificados: Number(filtrado.certificados || 0),
      certificados_emitidos: Number(filtrado.certificados_emitidos || 0),
      certificados_enviados: Number(filtrado.certificados_enviados || 0),
      taxa_presenca: Number(filtrado.taxa_presenca || 0),
      taxa_avaliacao: Number(filtrado.taxa_avaliacao || 0),
      taxa_certificacao: Number(filtrado.taxa_certificacao || 0),
    },
    series: {
      por_mes: seriesPorMes.rows || [],
      por_status: porStatus.rows || [],
      top_eventos: topEventos.rows || [],
    },
    tabelas: {
      eventos: eventosTabela.rows || [],
      saude,
    },
  };
}

async function relatorioInstitucional(req, res) {
  setNoStore(res);

  try {
    const filtros = normalizarFiltros(req);
    const dashboard = await consultarDashboardInstitucional(req, filtros);

    return sucesso(
      req,
      res,
      dashboard,
      "Relatório institucional carregado com sucesso.",
      "RELATORIO_INSTITUCIONAL",
      {
        filtros,
        gerado_em: dashboard.gerado_em,
      },
    );
  } catch (error) {
    logError(req, "Erro em relatorioInstitucional", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório institucional.",
      "RELATORIO_INSTITUCIONAL_ERRO",
      "Falha ao consolidar dashboard institucional.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 1. Resumo geral
 * ───────────────────────────────────────────── */

async function resumoGeral(req, res) {
  setNoStore(res);

  try {
    const result = await query(
      req,
      `
      WITH eventos_base AS (
        SELECT
          COUNT(*)::int AS total_eventos,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM turmas t
              WHERE t.evento_id = eventos.id
                AND (now() AT TIME ZONE '${TZ}') <
                  (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
            )
          )::int AS eventos_programados,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM turmas t
              WHERE t.evento_id = eventos.id
                AND (now() AT TIME ZONE '${TZ}') BETWEEN
                  (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
                  AND
                  (t.data_fim::timestamp + COALESCE(t.horario_fim, '23:59'::time))
            )
          )::int AS eventos_andamento,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM turmas t
              WHERE t.evento_id = eventos.id
                AND (now() AT TIME ZONE '${TZ}') >
                  (t.data_fim::timestamp + COALESCE(t.horario_fim, '23:59'::time))
            )
          )::int AS eventos_encerrados
        FROM eventos
      ),
      turmas_base AS (
        SELECT COUNT(*)::int AS total_turmas
        FROM turmas
      ),
      inscricoes_base AS (
        SELECT COUNT(*)::int AS total_inscricoes
        FROM inscricoes
      ),
presencas_base AS (
  SELECT
    COUNT(DISTINCT (p.usuario_id, p.turma_id)) FILTER (WHERE p.presente IS TRUE)::int AS total_presencas,
    COUNT(*) FILTER (WHERE p.presente IS TRUE)::int AS total_registros_presenca,
    COUNT(DISTINCT (p.usuario_id, p.turma_id)) FILTER (WHERE p.presente IS NOT TRUE)::int AS total_ausencias
  FROM presencas p
  WHERE EXISTS (
    SELECT 1
    FROM inscricoes i
    WHERE i.turma_id = p.turma_id
      AND i.usuario_id = p.usuario_id
  )
),
      avaliacoes_base AS (
        SELECT COUNT(*)::int AS total_avaliacoes
        FROM avaliacoes
      ),
      certificados_base AS (
        SELECT
          COUNT(*)::int AS total_certificados,
          COUNT(*) FILTER (WHERE status = 'emitido')::int AS certificados_emitidos,
          COUNT(*) FILTER (WHERE status = 'enviado')::int AS certificados_enviados,
          COUNT(*) FILTER (WHERE status = 'cancelado')::int AS certificados_cancelados,
          COUNT(*) FILTER (WHERE status = 'anulado')::int AS certificados_anulados,
          COUNT(*) FILTER (WHERE status = 'substituido')::int AS certificados_substituidos,
          COUNT(*) FILTER (WHERE status = 'erro_emissao')::int AS certificados_erro
        FROM certificados
      ),
      certificados_avulsos_base AS (
        SELECT
          COUNT(*)::int AS total_certificados_avulsos,
          COUNT(*) FILTER (WHERE status = 'emitido')::int AS certificados_avulsos_emitidos,
          COUNT(*) FILTER (WHERE status = 'enviado')::int AS certificados_avulsos_enviados,
          COUNT(*) FILTER (WHERE status = 'cancelado')::int AS certificados_avulsos_cancelados,
          COUNT(*) FILTER (WHERE status = 'anulado')::int AS certificados_avulsos_anulados,
          COUNT(*) FILTER (WHERE status = 'substituido')::int AS certificados_avulsos_substituidos,
          COUNT(*) FILTER (WHERE status = 'erro_emissao')::int AS certificados_avulsos_erro
        FROM certificados_avulsos
      ),
      usuarios_base AS (
        SELECT COUNT(*)::int AS total_usuarios
        FROM usuarios
      ),
      reservas_base AS (
        SELECT
          COUNT(*)::int AS total_reservas,
          COUNT(*) FILTER (WHERE status = 'pendente')::int AS reservas_pendentes,
          COUNT(*) FILTER (WHERE status = 'aprovado')::int AS reservas_aprovadas,
          COUNT(*) FILTER (WHERE status = 'cancelado')::int AS reservas_canceladas
        FROM reservas_salas
      )
      SELECT *
      FROM eventos_base,
           turmas_base,
           inscricoes_base,
           presencas_base,
           avaliacoes_base,
           certificados_base,
           certificados_avulsos_base,
           usuarios_base,
           reservas_base
    `,
    );

    return sucesso(
      req,
      res,
      result.rows?.[0] || {},
      "Resumo geral carregado com sucesso.",
      "RELATORIO_RESUMO_GERAL",
    );
  } catch (error) {
    logError(req, "Erro em resumoGeral", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar resumo geral.",
      "RELATORIO_RESUMO_GERAL_ERRO",
      "Falha ao consolidar indicadores gerais.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 2. Eventos
 * ───────────────────────────────────────────── */

async function relatorioEventos(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "t.data_inicio", filtros);
  addFiltroId(params, where, "e.id", filtros.evento_id);
  addFiltroId(params, where, "t.id", filtros.turma_id);

  if (filtros.organizador_id) {
    params.push(filtros.organizador_id);
    where.push(`
      EXISTS (
        SELECT 1
        FROM turma_responsavel tr
        WHERE tr.turma_id = t.id
          AND tr.usuario_id = $${params.length}
          AND tr.papel = '${PAPEL_ORGANIZADOR}'
      )
    `);
  }

  if (filtros.unidade_id) {
    params.push(filtros.unidade_id);
    where.push(`
      EXISTS (
        SELECT 1
        FROM inscricoes ix
        JOIN usuarios ux ON ux.id = ix.usuario_id
        WHERE ix.turma_id = t.id
          AND ux.unidade_id = $${params.length}
      )
    `);
  }

  if (filtros.status) {
    params.push(filtros.status);
  }

  const statusParamIndex = filtros.status ? params.length : null;

  const sql = `
    WITH base AS (
      SELECT
        e.id AS evento_id,
        e.titulo AS evento,
        COUNT(DISTINCT t.id)::int AS total_turmas,
        COALESCE(SUM(t.vagas_total), 0)::int AS vagas,
        COUNT(DISTINCT i.id)::int AS inscritos,
        COUNT(DISTINCT i.usuario_id) FILTER (WHERE p.presente IS TRUE)::int AS presentes,
        COUNT(DISTINCT a.id)::int AS avaliacoes,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('emitido', 'enviado'))::int AS certificados_emitidos,
        ROUND(AVG(${getNotaSql("a")})::numeric, 2) AS media_organizador,
        CASE
          WHEN BOOL_OR((now() AT TIME ZONE '${TZ}') BETWEEN
            (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
            AND
            (t.data_fim::timestamp + COALESCE(t.horario_fim, '23:59'::time))
          ) THEN 'andamento'
          WHEN BOOL_OR((now() AT TIME ZONE '${TZ}') <
            (t.data_inicio::timestamp + COALESCE(t.horario_inicio, '00:00'::time))
          ) THEN 'programado'
          ELSE 'encerrado'
        END AS status_calculado
      FROM eventos e
      JOIN turmas t ON t.evento_id = e.id
      LEFT JOIN inscricoes i ON i.turma_id = t.id
        ${filtros.usuario_id ? `AND i.usuario_id = ${Number(filtros.usuario_id)}` : ""}
      LEFT JOIN presencas p ON p.turma_id = t.id
        AND p.usuario_id = i.usuario_id
      LEFT JOIN certificados c ON c.turma_id = t.id
        AND c.usuario_id = i.usuario_id
      LEFT JOIN avaliacoes a ON a.turma_id = t.id
        AND a.usuario_id = i.usuario_id
      ${whereSql(where)}
      GROUP BY e.id, e.titulo
    )
    SELECT
      *,
      CASE WHEN vagas > 0 THEN ROUND((inscritos::numeric / vagas::numeric) * 100, 2) ELSE NULL END AS taxa_ocupacao,
      CASE WHEN inscritos > 0 THEN ROUND((presentes::numeric / inscritos::numeric) * 100, 2) ELSE NULL END AS taxa_presenca,
      CASE WHEN inscritos > 0 THEN ROUND((avaliacoes::numeric / inscritos::numeric) * 100, 2) ELSE NULL END AS taxa_avaliacao,
      CASE WHEN inscritos > 0 THEN ROUND((certificados_emitidos::numeric / inscritos::numeric) * 100, 2) ELSE NULL END AS taxa_certificacao
    FROM base
    ${filtros.status ? `WHERE status_calculado = $${statusParamIndex}` : ""}
    ORDER BY evento ASC
  `;

  try {
    const result = await query(req, sql, params);

    return sucesso(
      req,
      res,
      result.rows,
      "Relatório de eventos carregado com sucesso.",
      "RELATORIO_EVENTOS",
      { filtros, total: result.rows.length },
    );
  } catch (error) {
    logError(req, "Erro em relatorioEventos", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório de eventos.",
      "RELATORIO_EVENTOS_ERRO",
      "Falha na consulta consolidada de eventos.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 3. Presenças
 * ───────────────────────────────────────────── */

async function relatorioPresencas(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "t.data_inicio", filtros);
  addFiltroId(params, where, "e.id", filtros.evento_id);
  addFiltroId(params, where, "t.id", filtros.turma_id);
  addFiltroId(params, where, "u.id", filtros.usuario_id);

  if (filtros.unidade_id) {
    addFiltroId(params, where, "u.unidade_id", filtros.unidade_id);
  }

  if (filtros.organizador_id) {
    params.push(filtros.organizador_id);
    where.push(`
      EXISTS (
        SELECT 1
        FROM turma_responsavel tr
        WHERE tr.turma_id = t.id
          AND tr.usuario_id = $${params.length}
          AND tr.papel = '${PAPEL_ORGANIZADOR}'
      )
    `);
  }

  try {
    const result = await query(
      req,
      `
      WITH datas AS (
        SELECT
          t.id AS turma_id,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM datas_turma dt
              WHERE dt.turma_id = t.id
            )
              THEN (
                SELECT COUNT(*)::int
                FROM datas_turma dt
                WHERE dt.turma_id = t.id
              )
            ELSE GREATEST(1, ((t.data_fim::date - t.data_inicio::date) + 1))::int
          END AS total_dias
        FROM turmas t
      ),
      base AS (
        SELECT
          e.id AS evento_id,
          e.titulo AS evento,
          t.id AS turma_id,
          t.nome AS turma,
          to_char(t.data_inicio::date, 'YYYY-MM-DD') AS data_inicio,
          to_char(t.data_fim::date, 'YYYY-MM-DD') AS data_fim,
          u.id AS usuario_id,
          u.nome AS usuario,
          u.cpf,
          u.email,
          COUNT(DISTINCT p.data_presenca::date) FILTER (WHERE p.presente IS TRUE)::int AS presencas_confirmadas,
          d.total_dias
        FROM turmas t
        JOIN eventos e ON e.id = t.evento_id
        JOIN inscricoes i ON i.turma_id = t.id
        JOIN usuarios u ON u.id = i.usuario_id
        JOIN datas d ON d.turma_id = t.id
        LEFT JOIN presencas p ON p.turma_id = t.id AND p.usuario_id = u.id
        ${whereSql(where)}
        GROUP BY
          e.id, e.titulo,
          t.id, t.nome, t.data_inicio, t.data_fim,
          u.id, u.nome, u.cpf, u.email,
          d.total_dias
      )
      SELECT
        *,
        CASE
          WHEN total_dias > 0 THEN ROUND((presencas_confirmadas::numeric / total_dias::numeric) * 100, 2)
          ELSE NULL
        END AS percentual_frequencia,
        CASE
          WHEN total_dias > 0 AND ROUND((presencas_confirmadas::numeric / total_dias::numeric) * 100, 2) >= 75
          THEN true
          ELSE false
        END AS apto_certificado
      FROM base
      ORDER BY evento ASC, turma ASC, usuario ASC
      `,
      params,
    );

    return sucesso(
      req,
      res,
      result.rows,
      "Relatório de presenças carregado com sucesso.",
      "RELATORIO_PRESENCAS",
      { filtros, total: result.rows.length },
    );
  } catch (error) {
    logError(req, "Erro em relatorioPresencas", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório de presenças.",
      "RELATORIO_PRESENCAS_ERRO",
      "Falha na consulta consolidada de presenças.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 4. Avaliações
 * ───────────────────────────────────────────── */

async function relatorioAvaliacoes(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "t.data_inicio", filtros);
  addFiltroId(params, where, "e.id", filtros.evento_id);
  addFiltroId(params, where, "t.id", filtros.turma_id);
  addFiltroId(params, where, "u.id", filtros.usuario_id);
  addFiltroId(params, where, "u.unidade_id", filtros.unidade_id);

  if (filtros.organizador_id) {
    params.push(filtros.organizador_id);
    where.push(`
      EXISTS (
        SELECT 1
        FROM turma_responsavel tr
        WHERE tr.turma_id = t.id
          AND tr.usuario_id = $${params.length}
          AND tr.papel = '${PAPEL_ORGANIZADOR}'
      )
    `);
  }

  try {
    const result = await query(
      req,
      `
      SELECT
        e.id AS evento_id,
        e.titulo AS evento,
        t.id AS turma_id,
        t.nome AS turma,
        COUNT(a.id)::int AS total_avaliacoes,
        COUNT(DISTINCT a.usuario_id)::int AS usuarios_avaliadores,
        ROUND(AVG(${getNotaCampoSql("a.divulgacao_evento")})::numeric, 2) AS media_divulgacao_evento,
        ROUND(AVG(${getNotaCampoSql("a.pontualidade")})::numeric, 2) AS media_pontualidade,
        ROUND(AVG(${getNotaCampoSql("a.conteudo_temas")})::numeric, 2) AS media_conteudo_temas,
        ROUND(AVG(${getNotaCampoSql("a.desempenho_organizador")})::numeric, 2) AS media_desempenho_organizador,
        ROUND(AVG(${getNotaCampoSql("a.inscricao_online")})::numeric, 2) AS media_inscricao_online,
        COUNT(NULLIF(BTRIM(a.gostou_mais), ''))::int AS comentarios_positivos,
        COUNT(NULLIF(BTRIM(a.sugestoes_melhoria), ''))::int AS sugestoes_melhoria,
        COUNT(NULLIF(BTRIM(a.comentarios_finais), ''))::int AS comentarios_finais
      FROM avaliacoes a
      JOIN turmas t ON t.id = a.turma_id
      JOIN eventos e ON e.id = t.evento_id
      JOIN usuarios u ON u.id = a.usuario_id
      ${whereSql(where)}
      GROUP BY e.id, e.titulo, t.id, t.nome
      ORDER BY e.titulo ASC, t.nome ASC
      `,
      params,
    );

    return sucesso(
      req,
      res,
      result.rows,
      "Relatório de avaliações carregado com sucesso.",
      "RELATORIO_AVALIACOES",
      { filtros, total: result.rows.length },
    );
  } catch (error) {
    logError(req, "Erro em relatorioAvaliacoes", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório de avaliações.",
      "RELATORIO_AVALIACOES_ERRO",
      "Falha na consulta consolidada de avaliações.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 5. Organizadores
 * ───────────────────────────────────────────── */

async function relatorioorganizadores(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "t.data_inicio", filtros);
  addFiltroId(params, where, "u.id", filtros.organizador_id);
  addFiltroId(params, where, "e.id", filtros.evento_id);
  addFiltroId(params, where, "t.id", filtros.turma_id);

  try {
    const result = await query(
      req,
      `
      WITH vinculos AS (
        SELECT DISTINCT
          tr.usuario_id AS organizador_id,
          t.id AS turma_id,
          t.evento_id
        FROM turma_responsavel tr
        JOIN turmas t ON t.id = tr.turma_id
        WHERE tr.papel = '${PAPEL_ORGANIZADOR}'
      )
      SELECT
        u.id AS organizador_id,
        u.nome AS organizador,
        u.email,
        COUNT(DISTINCT v.evento_id)::int AS eventos_vinculados,
        COUNT(DISTINCT v.turma_id)::int AS turmas_vinculadas,
        COUNT(DISTINCT i.id)::int AS inscritos,
        COUNT(DISTINCT p.id) FILTER (WHERE p.presente IS TRUE)::int AS presencas,
        COUNT(DISTINCT a.id)::int AS total_avaliacoes,
        ROUND(AVG(${getNotaSql("a")})::numeric, 2) AS media_desempenho_organizador,
        COALESCE(
          BOOL_OR(ass.imagem_base64 IS NOT NULL AND BTRIM(ass.imagem_base64) <> ''),
          false
        ) AS possui_assinatura
      FROM vinculos v
      JOIN usuarios u ON u.id = v.organizador_id
      JOIN turmas t ON t.id = v.turma_id
      JOIN eventos e ON e.id = t.evento_id
      LEFT JOIN inscricoes i ON i.turma_id = v.turma_id
      LEFT JOIN presencas p ON p.turma_id = v.turma_id AND p.usuario_id = i.usuario_id
      LEFT JOIN avaliacoes a ON a.turma_id = v.turma_id
      LEFT JOIN assinaturas ass ON ass.usuario_id = u.id
      ${whereSql(where)}
      GROUP BY u.id, u.nome, u.email
      ORDER BY u.nome ASC
      `,
      params,
    );

    return sucesso(
      req,
      res,
      result.rows,
      "Relatório de organizadores carregado com sucesso.",
      "RELATORIO_ORGANIZADORES",
      { filtros, total: result.rows.length },
    );
  } catch (error) {
    logError(req, "Erro em relatorioorganizadores", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório de organizadores.",
      "RELATORIO_ORGANIZADORES_ERRO",
      "Falha na consulta consolidada de organizadores.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 6. Certificados
 * ───────────────────────────────────────────── */

async function relatorioCertificados(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const whereReg = [];
  const whereAv = [];

  addFiltroPeriodo(params, whereReg, "c.gerado_em", filtros);
  addFiltroId(params, whereReg, "c.evento_id", filtros.evento_id);
  addFiltroId(params, whereReg, "c.turma_id", filtros.turma_id);
  addFiltroId(params, whereReg, "c.usuario_id", filtros.usuario_id);

  if (filtros.status) {
    params.push(filtros.status);
    whereReg.push(`c.status::text = $${params.length}`);
  }

  if (filtros.data_inicio) {
    params.push(filtros.data_inicio);
    whereAv.push(`ca.emitido_em::date >= $${params.length}::date`);
  }

  if (filtros.data_fim) {
    params.push(filtros.data_fim);
    whereAv.push(`ca.emitido_em::date <= $${params.length}::date`);
  }

  if (filtros.status) {
    params.push(filtros.status);
    whereAv.push(`ca.status::text = $${params.length}`);
  }

  try {
    const result = await query(
      req,
      `
      SELECT *
      FROM (
        SELECT
          'evento' AS origem,
          c.id::text AS id,
          c.numero_certificado,
          c.codigo_validacao,
          c.status::text AS status,
          c.tipo::text AS tipo,
          u.nome AS participante,
          u.cpf AS identificador,
          e.titulo AS evento_ou_curso,
          t.nome AS turma,
          to_char(c.gerado_em, 'YYYY-MM-DD HH24:MI:SS') AS emitido_em,
          to_char(c.enviado_em, 'YYYY-MM-DD HH24:MI:SS') AS enviado_em,
          c.hash_pdf,
          c.hash_dados
        FROM certificados c
        JOIN usuarios u ON u.id = c.usuario_id
        JOIN eventos e ON e.id = c.evento_id
        JOIN turmas t ON t.id = c.turma_id
        ${whereSql(whereReg)}

        UNION ALL

        SELECT
          'avulso' AS origem,
          ca.id::text AS id,
          ca.numero_certificado,
          ca.codigo_validacao,
          ca.status::text AS status,
          ca.modalidade::text AS tipo,
          ca.nome AS participante,
          ca.identificador_mascarado AS identificador,
          ca.curso AS evento_ou_curso,
          NULL::text AS turma,
          to_char(ca.emitido_em, 'YYYY-MM-DD HH24:MI:SS') AS emitido_em,
          to_char(ca.enviado_em, 'YYYY-MM-DD HH24:MI:SS') AS enviado_em,
          ca.hash_pdf,
          ca.hash_dados
        FROM certificados_avulsos ca
        ${whereSql(whereAv)}
      ) base
      ORDER BY emitido_em DESC NULLS LAST, numero_certificado DESC
      `,
      params,
    );

    return sucesso(
      req,
      res,
      result.rows,
      "Relatório de certificados carregado com sucesso.",
      "RELATORIO_CERTIFICADOS",
      {
        filtros,
        total: result.rows.length,
      },
    );
  } catch (error) {
    logError(req, "Erro em relatorioCertificados", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório de certificados.",
      "RELATORIO_CERTIFICADOS_ERRO",
      "Falha na consulta documental de certificados.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 7. Pendências de certificados
 * ───────────────────────────────────────────── */

async function relatorioCertificadosPendencias(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "t.data_inicio", filtros);
  addFiltroId(params, where, "e.id", filtros.evento_id);
  addFiltroId(params, where, "t.id", filtros.turma_id);

  try {
    const result = await query(
      req,
      `
      WITH dias_turma AS (
        SELECT
          t.id AS turma_id,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM datas_turma dt
              WHERE dt.turma_id = t.id
            )
              THEN (
                SELECT COUNT(*)::int
                FROM datas_turma dt
                WHERE dt.turma_id = t.id
              )
            ELSE GREATEST(1, ((t.data_fim::date - t.data_inicio::date) + 1))::int
          END AS total_dias
        FROM turmas t
      ),
      frequencia AS (
        SELECT
          i.usuario_id,
          i.turma_id,
          COUNT(DISTINCT p.data_presenca::date) FILTER (WHERE p.presente IS TRUE)::int AS presencas,
          d.total_dias,
          CASE
            WHEN d.total_dias > 0 THEN ROUND((COUNT(DISTINCT p.data_presenca::date) FILTER (WHERE p.presente IS TRUE)::numeric / d.total_dias::numeric) * 100, 2)
            ELSE 0
          END AS percentual
        FROM inscricoes i
        JOIN dias_turma d ON d.turma_id = i.turma_id
        LEFT JOIN presencas p ON p.turma_id = i.turma_id AND p.usuario_id = i.usuario_id
        GROUP BY i.usuario_id, i.turma_id, d.total_dias
      ),
      aval AS (
        SELECT usuario_id, turma_id, COUNT(*)::int AS total
        FROM avaliacoes
        GROUP BY usuario_id, turma_id
      )
      SELECT
        u.id AS usuario_id,
        u.nome AS usuario,
        u.email,
        e.id AS evento_id,
        e.titulo AS evento,
        t.id AS turma_id,
        t.nome AS turma,
        f.percentual AS percentual_frequencia,
        COALESCE(av.total, 0) AS avaliacoes_respondidas,
        c.id AS certificado_id,
        c.numero_certificado,
        c.status::text AS status_certificado,
        CASE
          WHEN (now() AT TIME ZONE '${TZ}') <= (t.data_fim::timestamp + COALESCE(t.horario_fim, '23:59'::time))
            THEN 'turma_nao_encerrada'
          WHEN f.percentual < 75
            THEN 'frequencia_insuficiente'
          WHEN COALESCE(av.total, 0) = 0
            THEN 'avaliacao_pendente'
          WHEN c.id IS NULL
            THEN 'certificado_pendente'
          WHEN c.status = 'erro_emissao'
            THEN 'erro_emissao'
          WHEN c.enviado_em IS NULL
            THEN 'envio_pendente'
          ELSE 'sem_pendencia'
        END AS motivo
      FROM inscricoes i
      JOIN usuarios u ON u.id = i.usuario_id
      JOIN turmas t ON t.id = i.turma_id
      JOIN eventos e ON e.id = t.evento_id
      JOIN frequencia f ON f.usuario_id = i.usuario_id AND f.turma_id = i.turma_id
      LEFT JOIN aval av ON av.usuario_id = i.usuario_id AND av.turma_id = i.turma_id
      LEFT JOIN certificados c ON c.usuario_id = i.usuario_id AND c.turma_id = i.turma_id
      ${whereSql(where)}
      ORDER BY evento ASC, turma ASC, usuario ASC
      `,
      params,
    );

    const pendencias = result.rows.filter(
      (row) => row.motivo !== "sem_pendencia",
    );

    return sucesso(
      req,
      res,
      pendencias,
      "Relatório de pendências de certificados carregado com sucesso.",
      "RELATORIO_CERTIFICADOS_PENDENCIAS",
      { filtros, total: pendencias.length },
    );
  } catch (error) {
    logError(req, "Erro em relatorioCertificadosPendencias", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar pendências de certificados.",
      "RELATORIO_CERTIFICADOS_PENDENCIAS_ERRO",
      "Falha no diagnóstico de pendências de certificados.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 8. Usuários
 * ───────────────────────────────────────────── */

async function relatorioUsuarios(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "u.criado_em", filtros);
  addFiltroId(params, where, "u.id", filtros.usuario_id);
  addFiltroId(params, where, "u.unidade_id", filtros.unidade_id);

  try {
    const result = await query(
      req,
      `
      SELECT
        u.id,
        u.nome,
        u.email,
        u.cpf,
        u.perfil,
        u.celular,
        un.nome AS unidade,
        un.sigla AS unidade_sigla,
        c.nome AS cargo,
        esc.nome AS escolaridade,
        d.nome AS deficiencia,
        to_char(u.criado_em, 'YYYY-MM-DD HH24:MI:SS') AS criado_em,
        CASE
          WHEN BTRIM(COALESCE(u.nome, '')) = '' THEN false
          WHEN BTRIM(COALESCE(u.cpf, '')) = '' THEN false
          WHEN BTRIM(COALESCE(u.email, '')) = '' THEN false
          WHEN BTRIM(COALESCE(u.celular, '')) = '' THEN false
          ELSE true
        END AS cadastro_basico_completo,
        CASE
          WHEN u.unidade_id IS NULL THEN false
          WHEN u.cargo_id IS NULL THEN false
          WHEN u.data_nascimento IS NULL THEN false
          WHEN u.escolaridade_id IS NULL THEN false
          WHEN u.deficiencia_id IS NULL THEN false
          ELSE true
        END AS perfil_institucional_completo
      FROM usuarios u
      LEFT JOIN unidades un ON un.id = u.unidade_id
      LEFT JOIN cargos c ON c.id = u.cargo_id
      LEFT JOIN escolaridades esc ON esc.id = u.escolaridade_id
      LEFT JOIN deficiencias d ON d.id = u.deficiencia_id
      ${whereSql(where)}
      ORDER BY u.nome ASC
      `,
      params,
    );

    return sucesso(
      req,
      res,
      result.rows,
      "Relatório de usuários carregado com sucesso.",
      "RELATORIO_USUARIOS",
      { filtros, total: result.rows.length },
    );
  } catch (error) {
    logError(req, "Erro em relatorioUsuarios", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório de usuários.",
      "RELATORIO_USUARIOS_ERRO",
      "Confirme se as colunas oficiais de cadastro/perfil existem em usuarios.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 9. Salas / reservas
 * ───────────────────────────────────────────── */

async function relatorioSalas(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "r.data", filtros);
  addFiltroId(params, where, "r.solicitante_id", filtros.usuario_id);

  try {
    const existeReservas = await tableExists(req, "reservas_salas");

    if (!existeReservas) {
      return sucesso(
        req,
        res,
        [],
        "Tabela oficial de reservas de sala ainda não encontrada.",
        "RELATORIO_SALAS_TABELA_AUSENTE",
        {
          adminHint:
            "Quando o módulo de salas for revisado, confirmar o nome oficial da tabela e ajustar este relatório.",
        },
      );
    }

    const result = await query(
      req,
      `
      SELECT
        r.id,
        r.solicitante_id,
        u.nome AS solicitante,
        u.email AS solicitante_email,
        r.sala::text AS sala,
        r.periodo::text AS periodo,
        to_char(r.data::date, 'YYYY-MM-DD') AS data,
        r.qtd_pessoas,
        r.coffee_break,
        r.finalidade,
        r.status::text AS status,
        r.termo_aceito,
        r.termo_assinado_em,
        r.confirmacao_solicitada_em,
        r.confirmado_em,
        r.confirmado_por,
        uc.nome AS confirmado_por_nome,
        r.cancelado_em,
        r.cancelado_por,
        uca.nome AS cancelado_por_nome,
        r.motivo_cancelamento,
        r.observacao_admin,
        r.created_at,
        r.updated_at
      FROM reservas_salas r
      LEFT JOIN usuarios u ON u.id = r.solicitante_id
      LEFT JOIN usuarios uc ON uc.id = r.confirmado_por
      LEFT JOIN usuarios uca ON uca.id = r.cancelado_por
      ${whereSql(where)}
      ORDER BY r.data DESC, r.id DESC
      `,
      params,
    );

    return sucesso(
      req,
      res,
      result.rows,
      "Relatório de salas carregado com sucesso.",
      "RELATORIO_SALAS",
      { filtros, total: result.rows.length },
    );
  } catch (error) {
    logError(req, "Erro em relatorioSalas", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório de salas.",
      "RELATORIO_SALAS_ERRO",
      "Falha na consulta de reservas de sala.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 10. Notificações
 * ───────────────────────────────────────────── */

async function relatorioNotificacoes(req, res) {
  setNoStore(res);

  const filtros = normalizarFiltros(req);
  const params = [];
  const where = [];

  addFiltroPeriodo(params, where, "n.criado_em", filtros);
  addFiltroId(params, where, "n.usuario_id", filtros.usuario_id);
  addFiltroId(params, where, "n.evento_id", filtros.evento_id);
  addFiltroId(params, where, "n.turma_id", filtros.turma_id);

  try {
    const result = await query(
      req,
      `
      SELECT
        n.id,
        n.usuario_id,
        u.nome AS usuario,
        n.titulo,
        n.tipo,
        n.lida,
        n.turma_id,
        n.evento_id,
        n.reserva_id,
        n.link,
        n.metadata,
        to_char(n.criado_em, 'YYYY-MM-DD HH24:MI:SS') AS criado_em
      FROM notificacoes n
      LEFT JOIN usuarios u ON u.id = n.usuario_id
      ${whereSql(where)}
      ORDER BY n.criado_em DESC, n.id DESC
      `,
      params,
    );

    return sucesso(
      req,
      res,
      result.rows,
      "Relatório de notificações carregado com sucesso.",
      "RELATORIO_NOTIFICACOES",
      { filtros, total: result.rows.length },
    );
  } catch (error) {
    logError(req, "Erro em relatorioNotificacoes", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar relatório de notificações.",
      "RELATORIO_NOTIFICACOES_ERRO",
      "Falha na consulta de notificações.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 11. Saúde da plataforma
 * ───────────────────────────────────────────── */

async function consultarSaudePlataforma(req) {
  const checks = [];

  const certificadosSemHash = await query(
    req,
    `
    SELECT COUNT(*)::int AS total
    FROM certificados
    WHERE status IN ('emitido', 'enviado')
      AND (hash_pdf IS NULL OR BTRIM(hash_pdf) = '' OR hash_dados IS NULL OR BTRIM(hash_dados) = '')
  `,
  );

  checks.push({
    categoria: "certificados",
    item: "Certificados emitidos sem hash_pdf/hash_dados",
    severidade: certificadosSemHash.rows[0].total > 0 ? "critico" : "ok",
    total: certificadosSemHash.rows[0].total,
  });

  const certificadosSemNumero = await query(
    req,
    `
    SELECT COUNT(*)::int AS total
    FROM certificados
    WHERE numero_certificado IS NULL OR BTRIM(numero_certificado) = ''
  `,
  );

  checks.push({
    categoria: "certificados",
    item: "Certificados sem numero_certificado",
    severidade: certificadosSemNumero.rows[0].total > 0 ? "critico" : "ok",
    total: certificadosSemNumero.rows[0].total,
  });

  const avulsosSemNumero = await query(
    req,
    `
    SELECT COUNT(*)::int AS total
    FROM certificados_avulsos
    WHERE numero_certificado IS NULL OR BTRIM(numero_certificado) = ''
  `,
  );

  checks.push({
    categoria: "certificados_avulsos",
    item: "Certificados avulsos sem numero_certificado",
    severidade: avulsosSemNumero.rows[0].total > 0 ? "critico" : "ok",
    total: avulsosSemNumero.rows[0].total,
  });

  const turmasEncerradasPendentes = await query(
    req,
    `
    SELECT COUNT(*)::int AS total
    FROM turmas t
    WHERE (now() AT TIME ZONE '${TZ}') >
      (t.data_fim::timestamp + COALESCE(t.horario_fim, '23:59'::time))
      AND EXISTS (
        SELECT 1
        FROM inscricoes i
        WHERE i.turma_id = t.id
          AND NOT EXISTS (
            SELECT 1
            FROM certificados c
            WHERE c.turma_id = t.id
              AND c.usuario_id = i.usuario_id
              AND c.status IN ('emitido', 'enviado')
          )
      )
  `,
  );

  checks.push({
    categoria: "certificados",
    item: "Turmas encerradas com inscritos sem certificado válido",
    severidade: turmasEncerradasPendentes.rows[0].total > 0 ? "alerta" : "ok",
    total: turmasEncerradasPendentes.rows[0].total,
  });

  const usuariosIncompletos = await query(
    req,
    `
    SELECT COUNT(*)::int AS total
    FROM usuarios
    WHERE BTRIM(COALESCE(nome, '')) = ''
       OR BTRIM(COALESCE(cpf, '')) = ''
       OR BTRIM(COALESCE(email, '')) = ''
       OR BTRIM(COALESCE(celular, '')) = ''
  `,
  );

  checks.push({
    categoria: "usuarios",
    item: "Usuários com cadastro básico incompleto",
    severidade: usuariosIncompletos.rows[0].total > 0 ? "alerta" : "ok",
    total: usuariosIncompletos.rows[0].total,
  });

  const notificacoesNaoLidas = await query(
    req,
    `
    SELECT COUNT(*)::int AS total
    FROM notificacoes
    WHERE lida IS NOT TRUE
  `,
  );

  checks.push({
    categoria: "notificacoes",
    item: "Notificações não lidas",
    severidade: notificacoesNaoLidas.rows[0].total > 0 ? "info" : "ok",
    total: notificacoesNaoLidas.rows[0].total,
  });

  const reservasAprovadasSemConfirmacao = await query(
    req,
    `
    SELECT COUNT(*)::int AS total
    FROM reservas_salas
    WHERE status = 'aprovado'
      AND data::date >= CURRENT_DATE
      AND confirmado_em IS NULL
  `,
  );

  checks.push({
    categoria: "reservas_salas",
    item: "Reservas aprovadas futuras ainda sem confirmação de uso",
    severidade:
      reservasAprovadasSemConfirmacao.rows[0].total > 0 ? "info" : "ok",
    total: reservasAprovadasSemConfirmacao.rows[0].total,
  });

  const turmasSemOrganizador = await query(
    req,
    `
    SELECT COUNT(*)::int AS total
    FROM turmas t
    WHERE NOT EXISTS (
      SELECT 1
      FROM turma_responsavel tr
      WHERE tr.turma_id = t.id
        AND tr.papel = '${PAPEL_ORGANIZADOR}'
    )
  `,
  );

  checks.push({
    categoria: "eventos_turmas",
    item: "Turmas sem organizador oficial vinculado",
    severidade: turmasSemOrganizador.rows[0].total > 0 ? "critico" : "ok",
    total: turmasSemOrganizador.rows[0].total,
  });

  return checks;
}

async function relatorioSaudePlataforma(req, res) {
  setNoStore(res);

  try {
    const checks = await consultarSaudePlataforma(req);

    return sucesso(
      req,
      res,
      checks,
      "Relatório de saúde da plataforma carregado com sucesso.",
      "RELATORIO_SAUDE_PLATAFORMA",
      {
        total: checks.length,
        gerado_em: new Date().toISOString(),
      },
    );
  } catch (error) {
    logError(req, "Erro em relatorioSaudePlataforma", error);

    return erro(
      req,
      res,
      500,
      "Erro ao carregar saúde da plataforma.",
      "RELATORIO_SAUDE_PLATAFORMA_ERRO",
      "Falha nos diagnósticos de saúde da plataforma.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 12. Exportação XLSX
 * ───────────────────────────────────────────── */

async function capturarPayloadRelatorio(req, tipo) {
  const fakeRes = {
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };

  const mapa = {
    institucional: relatorioInstitucional,
    eventos: relatorioEventos,
    presencas: relatorioPresencas,
    avaliacoes: relatorioAvaliacoes,
    organizadores: relatorioorganizadores,
    certificados: relatorioCertificados,
    usuarios: relatorioUsuarios,
    salas: relatorioSalas,
    notificacoes: relatorioNotificacoes,
    "saude-plataforma": relatorioSaudePlataforma,
  };

  const handler = mapa[tipo];

  if (!handler) {
    const error = new Error("Tipo de relatório inválido.");
    error.code = "RELATORIO_EXPORTACAO_TIPO_INVALIDO";
    error.status = 400;
    throw error;
  }

  await handler(req, fakeRes);

  if (!fakeRes.payload?.ok) {
    const error = new Error("O handler do relatório retornou erro.");
    error.code = "RELATORIO_EXPORTACAO_HANDLER_ERRO";
    error.status = fakeRes.statusCode || 500;
    error.details = fakeRes.payload;
    throw error;
  }

  return fakeRes.payload;
}

async function exportarRelatorioXlsx(req, res) {
  setNoStore(res);

  const tipo = String(req.params?.tipo || "")
    .trim()
    .toLowerCase();

  try {
    if (tipo === "institucional") {
      const filtros = normalizarFiltros(req);
      const dashboard = await consultarDashboardInstitucional(req, filtros);
      return enviarXlsxInstitucional(req, res, dashboard);
    }

    const payload = await capturarPayloadRelatorio(req, tipo);
    const rows = Array.isArray(payload.data) ? payload.data : [];

    const allKeys = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row || {}).forEach((key) => set.add(key));
        return set;
      }, new Set()),
    );

    const columns = allKeys.map((key) => ({
      header: key,
      key,
      width: Math.min(Math.max(key.length + 8, 14), 45),
    }));

    const normalizedRows = rows.map((row) => {
      const item = {};

      allKeys.forEach((key) => {
        const value = row?.[key];

        item[key] =
          value && typeof value === "object" ? JSON.stringify(value) : value;
      });

      return item;
    });

    return enviarXlsx(
      res,
      `relatorio_${tipo}_${hojeYMD()}`,
      tipo.slice(0, 31),
      columns.length
        ? columns
        : [{ header: "sem_dados", key: "sem_dados", width: 20 }],
      columns.length ? normalizedRows : [],
      {
        tipo,
        gerado_em: new Date().toISOString(),
        filtros: normalizarFiltros(req),
      },
    );
  } catch (error) {
    logError(req, "Erro em exportarRelatorioXlsx", error);

    return erro(
      req,
      res,
      error.status || 500,
      "Erro ao exportar relatório.",
      error.code || "RELATORIO_EXPORTACAO_ERRO",
      "Falha ao gerar XLSX.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * 13. Exportação PDF institucional
 * ───────────────────────────────────────────── */

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR") : "0";
}

function formatPercent(value) {
  const number = Number(value || 0);
  return `${number.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function carregarPdfKit() {
  try {
    return require("pdfkit");
  } catch {
    const error = new Error(
      "Dependência pdfkit não instalada. Rode: npm install pdfkit",
    );
    error.status = 500;
    error.code = "RELATORIO_PDFKIT_AUSENTE";
    throw error;
  }
}

function drawCard(doc, x, y, w, h, titulo, valor, detalhe, color = "#0f766e") {
  doc.roundedRect(x, y, w, h, 10).fillAndStroke("#ffffff", "#e2e8f0");

  doc.roundedRect(x, y, 6, h, 4).fill(color);

  doc
    .fillColor("#64748b")
    .fontSize(8)
    .font("Helvetica-Bold")
    .text(String(titulo || "").toUpperCase(), x + 14, y + 12, {
      width: w - 24,
    });

  doc
    .fillColor("#0f172a")
    .fontSize(21)
    .font("Helvetica-Bold")
    .text(String(valor ?? "0"), x + 14, y + 28, {
      width: w - 24,
    });

  if (detalhe) {
    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica")
      .text(String(detalhe), x + 14, y + 55, {
        width: w - 24,
      });
  }
}

function drawBar(doc, x, y, w, label, value, max, color) {
  const safeMax = Math.max(Number(max || 0), 1);
  const safeValue = Math.max(Number(value || 0), 0);
  const barW = Math.max(0, Math.min(w, (safeValue / safeMax) * w));

  const labelText = String(label || "—").trim();

  doc
    .fillColor("#334155")
    .fontSize(7.5)
    .font("Helvetica-Bold")
    .text(labelText, x, y, {
      width: w,
      height: 10,
      ellipsis: true,
      lineBreak: false,
    });

  doc
    .fillColor("#475569")
    .fontSize(7.5)
    .font("Helvetica")
    .text(formatNumber(value), x + w + 10, y, {
      width: 58,
      height: 10,
      align: "left",
      lineBreak: false,
    });

  doc.roundedRect(x, y + 15, w, 8, 4).fill("#e2e8f0");

  doc.roundedRect(x, y + 15, barW, 8, 4).fill(color);
}

function drawTableHeader(doc, x, y, widths, labels) {
  doc
    .rect(
      x,
      y,
      widths.reduce((a, b) => a + b, 0),
      20,
    )
    .fill("#0f172a");

  let currentX = x;

  labels.forEach((label, index) => {
    doc
      .fillColor("#ffffff")
      .fontSize(7)
      .font("Helvetica-Bold")
      .text(label, currentX + 5, y + 7, {
        width: widths[index] - 10,
      });

    currentX += widths[index];
  });
}

function drawTableRow(doc, x, y, widths, values, fill = "#ffffff") {
  doc
    .rect(
      x,
      y,
      widths.reduce((a, b) => a + b, 0),
      22,
    )
    .fillAndStroke(fill, "#e2e8f0");

  let currentX = x;

  values.forEach((value, index) => {
    doc
      .fillColor("#334155")
      .fontSize(7)
      .font(index === 0 ? "Helvetica-Bold" : "Helvetica")
      .text(String(value ?? "—"), currentX + 5, y + 6, {
        width: widths[index] - 10,
        height: 12,
        ellipsis: true,
      });

    currentX += widths[index];
  });
}

function finalizarRodapePdf(doc, dashboard) {
  const pageRange = doc.bufferedPageRange();
  const pageCount = pageRange.count;

  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(pageRange.start + i);

    const pageW = doc.page.width;
    const pageH = doc.page.height;

    const lineY = pageH - 64;
    const footerY = pageH - 52;

    doc
      .save()
      .moveTo(40, lineY)
      .lineTo(pageW - 40, lineY)
      .strokeColor("#e2e8f0")
      .lineWidth(0.6)
      .stroke()
      .restore();

    doc
      .fillColor("#64748b")
      .fontSize(7)
      .font("Helvetica")
      .text("Fonte: Plataforma Escola da Saúde", 40, footerY, {
        width: 190,
        height: 10,
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .fillColor("#64748b")
      .fontSize(7)
      .font("Helvetica")
      .text(
        `Emitido em: ${new Date(dashboard.gerado_em).toLocaleString("pt-BR")}`,
        235,
        footerY,
        {
          width: 210,
          height: 10,
          lineBreak: false,
          ellipsis: true,
        },
      );

    doc
      .fillColor("#64748b")
      .fontSize(7)
      .font("Helvetica")
      .text(`Página ${i + 1} de ${pageCount}`, pageW - 130, footerY, {
        width: 90,
        height: 10,
        align: "right",
        lineBreak: false,
      });
  }
}

async function gerarPdfInstitucional(req, res, dashboard) {
  const PDFDocument = carregarPdfKit();

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    info: {
      Title: "Relatório Institucional - Plataforma Escola da Saúde",
      Author: "Plataforma Escola da Saúde",
      Subject: "Relatório institucional",
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${formatarNomeArquivo(
      `relatorio_institucional_${hojeYMD()}`,
    )}.pdf`,
  );

  doc.pipe(res);

  const pageW = doc.page.width;
  const contentW = pageW - 80;

  doc.rect(0, 0, pageW, 92).fill("#0f172a");
  doc.rect(0, 0, pageW, 8).fill("#10b981");
  doc.rect(pageW * 0.35, 0, pageW * 0.3, 8).fill("#f59e0b");
  doc.rect(pageW * 0.65, 0, pageW * 0.35, 8).fill("#ef4444");

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("RELATÓRIO INSTITUCIONAL", 40, 28);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#cbd5e1")
    .text("Plataforma Escola da Saúde • Secretaria Municipal de Saúde", 40, 55);

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#ffffff")
    .text(`Período: ${dashboard.periodo}`, 40, 72);

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#cbd5e1")
    .text(`Filtros: ${JSON.stringify(dashboard.filtros || {})}`, 210, 72, {
      width: contentW - 170,
      ellipsis: true,
    });

  doc.y = 118;

  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("1. Visão geral da plataforma", 40, doc.y);

  doc
    .fillColor("#64748b")
    .font("Helvetica")
    .fontSize(8)
    .text(
      "Totais históricos, sem interferência dos filtros aplicados.",
      40,
      doc.y + 17,
    );

  const geral = dashboard.geral || {};
  const filtrado = dashboard.filtrado || {};

  let y = 160;
  const cardW = (contentW - 18) / 4;
  const cardH = 76;

  drawCard(
    doc,
    40,
    y,
    cardW,
    cardH,
    "Eventos",
    formatNumber(geral.eventos_total),
    "Histórico",
    "#4f46e5",
  );
  drawCard(
    doc,
    40 + cardW + 6,
    y,
    cardW,
    cardH,
    "Inscrições",
    formatNumber(geral.inscricoes_total),
    "Histórico",
    "#0f766e",
  );
  drawCard(
    doc,
    40 + (cardW + 6) * 2,
    y,
    cardW,
    cardH,
    "Presenças",
    formatNumber(geral.presencas_total),
    "Confirmadas",
    "#16a34a",
  );
  drawCard(
    doc,
    40 + (cardW + 6) * 3,
    y,
    cardW,
    cardH,
    "Avaliações",
    formatNumber(geral.avaliacoes_total),
    "Respondidas",
    "#d97706",
  );

  y += 92;

  drawCard(
    doc,
    40,
    y,
    cardW,
    cardH,
    "Certificados",
    formatNumber(geral.certificados_validos_total),
    "Emitidos/enviados",
    "#7c3aed",
  );
  drawCard(
    doc,
    40 + cardW + 6,
    y,
    cardW,
    cardH,
    "Avulsos",
    formatNumber(geral.certificados_avulsos_validos_total),
    "Emitidos/enviados",
    "#0891b2",
  );
  drawCard(
    doc,
    40 + (cardW + 6) * 2,
    y,
    cardW,
    cardH,
    "Usuários",
    formatNumber(geral.usuarios_total),
    "Cadastrados",
    "#be123c",
  );
  drawCard(
    doc,
    40 + (cardW + 6) * 3,
    y,
    cardW,
    cardH,
    "Reservas",
    formatNumber(geral.reservas_total),
    "Salas",
    "#475569",
  );

  y += 108;

  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("2. Indicadores do período filtrado", 40, y);

  y += 32;

  drawCard(
    doc,
    40,
    y,
    cardW,
    cardH,
    "Eventos",
    formatNumber(filtrado.eventos),
    "No filtro",
    "#4f46e5",
  );
  drawCard(
    doc,
    40 + cardW + 6,
    y,
    cardW,
    cardH,
    "Turmas",
    formatNumber(filtrado.turmas),
    "No filtro",
    "#0ea5e9",
  );
  drawCard(
    doc,
    40 + (cardW + 6) * 2,
    y,
    cardW,
    cardH,
    "Inscrições",
    formatNumber(filtrado.inscricoes),
    "No filtro",
    "#0f766e",
  );
  drawCard(
    doc,
    40 + (cardW + 6) * 3,
    y,
    cardW,
    cardH,
    "Presenças",
    formatNumber(filtrado.presencas),
    formatPercent(filtrado.taxa_presenca),
    "#16a34a",
  );

  y += 92;

  drawCard(
    doc,
    40,
    y,
    cardW,
    cardH,
    "Avaliações",
    formatNumber(filtrado.avaliacoes),
    formatPercent(filtrado.taxa_avaliacao),
    "#d97706",
  );
  drawCard(
    doc,
    40 + cardW + 6,
    y,
    cardW,
    cardH,
    "Certificados",
    formatNumber(filtrado.certificados),
    formatPercent(filtrado.taxa_certificacao),
    "#7c3aed",
  );
  drawCard(
    doc,
    40 + (cardW + 6) * 2,
    y,
    cardW,
    cardH,
    "Usuários",
    formatNumber(filtrado.usuarios_envolvidos),
    "Envolvidos",
    "#be123c",
  );
  drawCard(
    doc,
    40 + (cardW + 6) * 3,
    y,
    cardW,
    cardH,
    "Ausências",
    formatNumber(filtrado.ausencias_registradas),
    "Registradas",
    "#dc2626",
  );

  doc.addPage();

  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("3. Evolução e distribuição", 40, 50);

  const meses = dashboard.series?.por_mes || [];
  const maxMes = Math.max(
    ...meses.map((item) => Number(item.inscricoes || 0)),
    1,
  );

  y = 86;

  doc
    .fillColor("#334155")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Inscrições por mês", 40, y);

  y += 24;

  meses.slice(0, 10).forEach((item) => {
    drawBar(doc, 40, y, 330, item.mes, item.inscricoes, maxMes, "#4f46e5");
    y += 32;
  });

  if (!meses.length) {
    doc
      .fillColor("#64748b")
      .font("Helvetica")
      .fontSize(9)
      .text("Sem dados mensais para o filtro aplicado.", 40, y);
    y += 28;
  }

  y += 14;

  const topEventos = dashboard.series?.top_eventos || [];
  const maxTop = Math.max(
    ...topEventos.map((item) => Number(item.inscricoes || 0)),
    1,
  );

  doc
    .fillColor("#334155")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Top eventos por inscrições", 40, y);

  y += 24;

  topEventos.slice(0, 8).forEach((item) => {
    drawBar(
      doc,
      40,
      y,
      330,
      String(item.evento || "Evento").slice(0, 55),
      item.inscricoes,
      maxTop,
      "#0f766e",
    );
    y += 32;
  });

  doc.addPage();

  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("4. Tabela-resumo de eventos", 40, 50);

  y = 82;

  const widths = [190, 50, 58, 58, 58, 58];

  drawTableHeader(doc, 40, y, widths, [
    "Evento",
    "Turmas",
    "Inscrições",
    "Presenças",
    "Avaliações",
    "Certificados",
  ]);

  y += 20;

  const eventos = dashboard.tabelas?.eventos || [];

  eventos.slice(0, 18).forEach((item, index) => {
    drawTableRow(
      doc,
      40,
      y,
      widths,
      [
        item.evento,
        item.turmas,
        item.inscricoes,
        item.presencas,
        item.avaliacoes,
        item.certificados,
      ],
      index % 2 === 0 ? "#ffffff" : "#f8fafc",
    );

    y += 22;
  });

  if (!eventos.length) {
    doc
      .fillColor("#64748b")
      .font("Helvetica")
      .fontSize(9)
      .text("Nenhum evento encontrado no filtro aplicado.", 40, y + 10);
  }

  finalizarRodapePdf(doc, dashboard);

  doc.end();
}

async function exportarRelatorioPdf(req, res) {
  setNoStore(res);

  const tipo = String(req.params?.tipo || "")
    .trim()
    .toLowerCase();

  if (tipo !== "institucional") {
    return erro(
      req,
      res,
      400,
      "PDF disponível apenas para o relatório institucional.",
      "RELATORIO_PDF_TIPO_INVALIDO",
      "Use /api/relatorio/exportar/institucional.pdf.",
      { tipo },
    );
  }

  try {
    const filtros = normalizarFiltros(req);
    const dashboard = await consultarDashboardInstitucional(req, filtros);

    return gerarPdfInstitucional(req, res, dashboard);
  } catch (error) {
    logError(req, "Erro em exportarRelatorioPdf", error);

    return erro(
      req,
      res,
      error.status || 500,
      "Erro ao exportar PDF institucional.",
      error.code || "RELATORIO_PDF_ERRO",
      "Falha ao gerar PDF institucional visual.",
      error.message,
    );
  }
}

/* ─────────────────────────────────────────────
 * Export
 * ───────────────────────────────────────────── */

module.exports = {
  relatorioInstitucional,
  resumoGeral,
  relatorioEventos,
  relatorioPresencas,
  relatorioAvaliacoes,
  relatorioorganizadores,
  relatorioCertificados,
  relatorioCertificadosPendencias,
  relatorioUsuarios,
  relatorioSalas,
  relatorioNotificacoes,
  relatorioSaudePlataforma,
  exportarRelatorioXlsx,
  exportarRelatorioPdf,
};
