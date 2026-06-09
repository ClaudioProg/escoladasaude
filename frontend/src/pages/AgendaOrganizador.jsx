// ✅ frontend/src/pages/Agendaorganizador.jsx — v2.1
// Atualizado em: 01/06/2026
// Plataforma Escola da Saúde
// Agenda premium do organizador montada pelas turmas vinculadas ao perfil.
// HeaderHero limpo: sem botões, stats, filtros, trilhas ou badges.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  addMonths,
  compareAsc,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Info,
  MapPin,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

import { motion, useReducedMotion } from "framer-motion";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import LegendaEventos from "../components/eventos/LegendaEventos";
import { notifyError, notifyInfo } from "../components/ui/AppToast";
import { api } from "../services/api";

/* ─────────────────────────────────────────────
 * Constantes
 * ───────────────────────────────────────────── */

const STATUS_AGENDA = {
  PROGRAMADO: "programado",
  ANDAMENTO: "andamento",
  ENCERRADO: "encerrado",
};

const STATUS_CONFIG = {
  programado: {
    label: "Programado",
    chip:
      "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-100 dark:ring-emerald-800/60",
    card:
      "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-100 dark:ring-emerald-800/60",
    dot: "bg-emerald-500",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
  },
  andamento: {
    label: "Em andamento",
    chip:
      "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/35 dark:text-amber-100 dark:ring-amber-800/60",
    card:
      "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/25 dark:text-amber-100 dark:ring-amber-800/60",
    dot: "bg-amber-500",
    gradient: "from-amber-400 via-orange-400 to-yellow-500",
  },
  encerrado: {
    label: "Encerrado",
    chip:
      "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/35 dark:text-rose-100 dark:ring-rose-800/60",
    card:
      "bg-rose-50 text-rose-950 ring-rose-200 dark:bg-rose-950/25 dark:text-rose-100 dark:ring-rose-800/60",
    dot: "bg-rose-500",
    gradient: "from-rose-500 via-red-500 to-orange-500",
  },
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/* ─────────────────────────────────────────────
 * Helpers gerais
 * ───────────────────────────────────────────── */

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function unwrap(response) {
  return response?.data ?? response ?? null;
}

function getErrorMessage(error, fallback) {
  const data = error?.response?.data || error?.data || {};

  return data?.message || data?.erro || error?.message || fallback;
}

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();

  return text || fallback;
}

/* ─────────────────────────────────────────────
 * Helpers date-only / anti-fuso
 * ───────────────────────────────────────────── */

function stripTZ(value) {
  return String(value || "")
    .trim()
    .replace(/\.\d{3,}\s*Z?$/i, "")
    .replace(/([+-]\d{2}:\d{2}|Z)$/i, "");
}

function hh(value, fallback = "") {
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }

  return fallback;
}

function toLocalDate(input) {
  if (!input) return null;

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  const value = stripTZ(input);
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return null;

  const [, year, month, day, hour = "00", minute = "00", second = "00"] =
    match;

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function ymd(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const head = stripTZ(value).slice(0, 10);

    if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
      return head;
    }
  }

  const date = toLocalDate(value);

  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function rangeDiasYMD(dataInicio, dataFim) {
  const dias = [];

  if (!dataInicio) return dias;

  const inicio = toLocalDate(`${dataInicio}T12:00:00`);
  const fim = toLocalDate(`${dataFim || dataInicio}T12:00:00`);

  if (!inicio || !fim || inicio > fim) return dias;

  for (
    const cursor = new Date(inicio);
    cursor <= fim;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const dia = ymd(cursor);
    if (dia) dias.push(dia);
  }

  return dias;
}

function formatarDataBR(value) {
  const data = ymd(value);

  if (!data) return "—";

  const date = toLocalDate(`${data}T12:00:00`);

  if (!date) return "—";

  return format(date, "dd/MM/yyyy");
}

function formatarMesAno(value) {
  const date = value instanceof Date ? value : new Date();

  return format(date, "MMMM 'de' yyyy", { locale: ptBR }).replace(
    /^\w/,
    (char) => char.toUpperCase()
  );
}

function formatarHorario(inicio, fim) {
  const hi = hh(inicio, "");
  const hf = hh(fim, "");

  if (hi && hf) return `${hi} às ${hf}`;
  if (hi) return `A partir de ${hi}`;
  if (hf) return `Até ${hf}`;

  return "Horário não informado";
}

/* ─────────────────────────────────────────────
 * Helpers de agenda
 * ───────────────────────────────────────────── */

function deriveStatus(item) {
  const statusBackend = String(item?.status || "").trim().toLowerCase();

  if (
    statusBackend === STATUS_AGENDA.PROGRAMADO ||
    statusBackend === STATUS_AGENDA.ANDAMENTO ||
    statusBackend === STATUS_AGENDA.ENCERRADO
  ) {
    return statusBackend;
  }

  const dataInicio = ymd(item?.data_inicio);
  const dataFim = ymd(item?.data_fim || item?.data_inicio);
  const horarioInicio = hh(item?.horario_inicio, "00:00");
  const horarioFim = hh(item?.horario_fim, "23:59");

  const inicio = dataInicio
    ? toLocalDate(`${dataInicio}T${horarioInicio}`)
    : null;

  const fim = dataFim ? toLocalDate(`${dataFim}T${horarioFim}`) : null;

  const agora = new Date();

  if (inicio && fim) {
    if (isBefore(agora, inicio)) return STATUS_AGENDA.PROGRAMADO;
    if (isWithinInterval(agora, { start: inicio, end: fim })) {
      return STATUS_AGENDA.ANDAMENTO;
    }
    if (isAfter(agora, fim)) return STATUS_AGENDA.ENCERRADO;
  }

  return STATUS_AGENDA.PROGRAMADO;
}

function extrairListaAgenda(response) {
  const payload = unwrap(response);

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.turmas)) return payload.turmas;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.lista)) return payload.lista;

  return [];
}

function normalizarOrganizadores(item) {
  if (Array.isArray(item?.organizadores)) return item.organizadores;

  if (Array.isArray(item?.organizadores_nome)) {
    return item.organizadores_nome.map((nome, index) => ({
      id: `${nome}-${index}`,
      nome,
    }));
  }

  const nome =
    item?.organizador_nome ||
    item?.instrutor_nome ||
    item?.responsavel_nome ||
    item?.palestrante_nome ||
    "";

  return nome
    ? [
        {
          id:
            item?.organizador_id ||
            item?.instrutor_id ||
            item?.responsavel_id ||
            nome,
          nome,
        },
      ]
    : [];
}

function textoDeObjetoOuString(value, campos = []) {
  if (typeof value === "string" || typeof value === "number") {
    return safeText(value, "");
  }

  if (value && typeof value === "object") {
    for (const campo of campos) {
      const texto = safeText(value?.[campo], "");
      if (texto) return texto;
    }
  }

  return "";
}

function idDeObjetoOuValor(value, campos = []) {
  if (typeof value === "number" || typeof value === "string") {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  if (value && typeof value === "object") {
    for (const campo of campos) {
      const id = Number(value?.[campo]);
      if (Number.isInteger(id) && id > 0) return id;
    }
  }

  return null;
}

function normalizarAgendaResponse(response) {
  const lista = extrairListaAgenda(response);

  return lista
    .map((item) => {
      const dataInicio = ymd(item?.data_inicio || item?.inicio);
      const dataFim = ymd(item?.data_fim || item?.fim || item?.data_inicio);

      if (!dataInicio) return null;

      const eventoTitulo = safeText(
  item?.evento_titulo ||
    textoDeObjetoOuString(item?.evento, ["titulo", "nome", "descricao"]) ||
    item?.titulo_evento ||
    item?.titulo,
  "Evento"
);

const turmaNome = safeText(
  item?.turma_nome ||
    textoDeObjetoOuString(item?.turma, ["nome", "titulo"]) ||
    item?.nome,
  ""
);

const turmaId =
  idDeObjetoOuValor(item?.turma_id) ||
  idDeObjetoOuValor(item?.turma, ["id", "turma_id"]) ||
  idDeObjetoOuValor(item?.id);

const eventoId =
  idDeObjetoOuValor(item?.evento_id) ||
  idDeObjetoOuValor(item?.evento, ["id", "evento_id"]) ||
  null;

const normalizado = {
  id: item?.id,
  turma_id: turmaId,
  evento_id: eventoId,
  titulo: turmaNome ? `${eventoTitulo} — ${turmaNome}` : eventoTitulo,
  evento_titulo: eventoTitulo,
  turma_nome: turmaNome,
        local: item?.local || item?.sala || item?.sala_nome || null,
        data_inicio: dataInicio,
        data_fim: dataFim,
        horario_inicio: hh(item?.horario_inicio, ""),
        horario_fim: hh(item?.horario_fim, ""),
        status: "",
        carga_horaria: item?.carga_horaria ?? null,
        organizadores: normalizarOrganizadores(item),
        ocorrencias: [],
        _raw: item,
      };

      normalizado.status = deriveStatus({
        ...normalizado,
        status: item?.status,
      });

      return normalizado;
    })
    .filter(Boolean);
}

function obterDiasDoEvento(item) {
  return rangeDiasYMD(ymd(item?.data_inicio), ymd(item?.data_fim));
}

function obterNomeUsuarioLocal() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
    return usuario?.nome || "";
  } catch {
    return "";
  }
}

function buildCalendarGrid(viewDate) {
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);

  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());

  const days = [];

  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }

  while (days.length < 42) {
    days.push(addDays(days[days.length - 1], 1));
  }

  return days;
}

/* ─────────────────────────────────────────────
 * Componentes locais
 * ───────────────────────────────────────────── */

function StatusChip({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.programado;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${config.chip}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function KpiCard({ titulo, valor, descricao, status, icon: Icon = CalendarDays }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.programado;

  return (
    <motion.div
      className={`overflow-hidden rounded-2xl border shadow-sm ${config.card}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      role="group"
      aria-label={`${titulo}: ${valor}`}
    >
      <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />

      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${config.chip}`}
          >
            <span className={`h-2 w-2 rounded-full ${config.dot}`} />
            {titulo}
          </span>

          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/70 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>

        <p className="mt-3 text-3xl font-black">{valor}</p>

        {descricao ? <p className="mt-1 text-xs opacity-75">{descricao}</p> : null}
      </div>
    </motion.div>
  );
}

function PainelOperacionalOrganizador({
  nome,
  carregando,
  stats,
  total,
  viewDate,
  onHoje,
  onAtualizar,
  onExportar,
}) {
  return (
    <section
      aria-label="Painel operacional da agenda do organizador"
      className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
              <Sparkles className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
              Painel operacional
            </p>

            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              {nome ? (
                <>
                  Organizador:{" "}
                  <strong className="text-slate-800 dark:text-zinc-100">
                    {nome}
                  </strong>{" "}
                  •{" "}
                </>
              ) : null}
              Mês visível:{" "}
              <strong className="text-slate-800 dark:text-zinc-100">
                {formatarMesAno(viewDate)}
              </strong>{" "}
              • {total} turma(s) com data
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onHoje}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
            >
              Hoje
            </button>

            <button
              type="button"
              onClick={onAtualizar}
              disabled={carregando}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
            >
              <RefreshCw
                className={cx("h-4 w-4", carregando ? "animate-spin" : "")}
                aria-hidden="true"
              />
              {carregando ? "Atualizando..." : "Atualizar"}
            </button>

            <button
              type="button"
              onClick={onExportar}
              disabled={carregando || total <= 0}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar mês
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            titulo="Programados"
            valor={stats.programados}
            descricao="Turmas futuras"
            status="programado"
          />

          <KpiCard
            titulo="Em andamento"
            valor={stats.andamento}
            descricao="Turmas em execução"
            status="andamento"
            icon={Clock}
          />

          <KpiCard
            titulo="Encerrados"
            valor={stats.encerrados}
            descricao="Turmas já finalizadas"
            status="encerrado"
            icon={CheckCircle2}
          />
        </div>
      </div>
    </section>
  );
}

function CalendarioPremiumOrganizador({
  viewDate,
  setViewDate,
  eventosPorData,
  eventos,
  carregando,
  reduceMotion,
  onSelectEvento,
}) {
  const dias = useMemo(() => buildCalendarGrid(viewDate), [viewDate]);
  const hoje = new Date();

  function irMesAnterior() {
    setViewDate((current) => subMonths(current, 1));
  }

  function irProximoMes() {
    setViewDate((current) => addMonths(current, 1));
  }

  return (
    <section className="rounded-[2rem] bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Calendário
          </p>

          <h2 className="mt-3 text-xl font-black text-slate-950 dark:text-white">
            {formatarMesAno(viewDate)}
          </h2>

          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Clique em uma turma dentro do dia para abrir os detalhes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={irMesAnterior}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setViewDate(new Date())}
            className="inline-flex min-h-[40px] items-center justify-center rounded-2xl bg-cyan-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
          >
            Hoje
          </button>

          <button
            type="button"
            onClick={irProximoMes}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <span className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-extrabold text-cyan-900 ring-1 ring-cyan-100 dark:bg-cyan-950/35 dark:text-cyan-100 dark:ring-cyan-800/60">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            {eventos.length} turma(s) com data
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {DIAS_SEMANA.map((dia) => (
            <div
              key={dia}
              className="px-2 py-3 text-center text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400"
            >
              {dia}
            </div>
          ))}
        </div>

        {carregando ? (
          <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-zinc-800">
            {Array.from({ length: 42 }).map((_, index) => (
              <div
                key={index}
                className="min-h-[112px] bg-white p-2 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-zinc-800">
            {dias.map((dia) => {
              const key = ymd(dia);
              const lista = eventosPorData[key] || [];
              const inMonth = isSameMonth(dia, viewDate);
              const today = isSameDay(dia, hoje);
              const max = 3;
              const visiveis = lista.slice(0, max);
              const extras = Math.max(0, lista.length - max);

              return (
                <div
                  key={key}
                  className={cx(
                    "min-h-[122px] bg-white p-2 transition dark:bg-zinc-900",
                    !inMonth &&
                      "bg-slate-50 text-slate-400 dark:bg-zinc-950/60 dark:text-zinc-600",
                    today && "ring-2 ring-inset ring-cyan-500"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => setViewDate(dia)}
                      className={cx(
                        "inline-flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700",
                        today
                          ? "bg-cyan-700 text-white"
                          : "text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                      aria-label={`Selecionar ${formatarDataBR(key)}`}
                    >
                      {format(dia, "d")}
                    </button>

                    {lista.length ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700 ring-1 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700">
                        {lista.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    {visiveis.map((item) => {
                      const status = deriveStatus(item);
                      const config =
                        STATUS_CONFIG[status] || STATUS_CONFIG.programado;

                      return (
                        <button
                          key={`${item.turma_id || item.id}-${key}`}
                          type="button"
                          onClick={() => onSelectEvento(item)}
                          className={cx(
                            "block w-full truncate rounded-xl px-2 py-1 text-left text-[10px] font-bold ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700",
                            config.chip,
                            reduceMotion ? "" : "hover:-translate-y-0.5"
                          )}
                          title={item.titulo}
                        >
                          {item.turma_nome || item.evento_titulo || item.titulo}
                        </button>
                      );
                    })}

                    {extras > 0 ? (
                      <button
                        type="button"
                        onClick={() => onSelectEvento(lista[max])}
                        className="w-full rounded-xl bg-cyan-50 px-2 py-1 text-left text-[10px] font-black text-cyan-900 ring-1 ring-cyan-100 transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:bg-cyan-950/35 dark:text-cyan-100 dark:ring-cyan-800/60"
                      >
                        +{extras} ocorrência(s)
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function EventoDetalheModalLocal({ evento, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!evento) return null;

  const status = deriveStatus(evento);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.programado;
  const organizadores = Array.isArray(evento?.organizadores)
    ? evento.organizadores
    : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-6 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agenda-organizador-modal-titulo"
    >
      <div className="relative my-auto w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-zinc-900 dark:ring-white/10">
        <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />

        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-zinc-700">
          <div className="min-w-0">
            <StatusChip status={status} />

            <h2
              id="agenda-organizador-modal-titulo"
              className="mt-3 break-words text-lg font-extrabold text-slate-950 dark:text-white sm:text-xl"
            >
              {evento.evento_titulo || evento.titulo || "Evento"}
            </h2>

            {evento.turma_nome ? (
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-zinc-300">
                Turma: {evento.turma_nome}
              </p>
            ) : null}
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Fechar detalhes do evento"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-zinc-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Data inicial
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                {formatarDataBR(evento.data_inicio)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-zinc-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Data final
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                {formatarDataBR(evento.data_fim)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-zinc-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Horário
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                {formatarHorario(evento.horario_inicio, evento.horario_fim)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-zinc-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Local
              </p>
              <p className="mt-1 break-words text-sm font-bold text-slate-950 dark:text-white">
                {evento.local || "Não informado"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-zinc-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Evento ID
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                {evento.evento_id || "—"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-zinc-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Turma ID
              </p>
              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                {evento.turma_id || evento.id || "—"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
              Organizadores vinculados
            </p>

            {organizadores.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {organizadores.map((organizador) => (
                  <li
                    key={organizador?.id || organizador?.nome}
                    className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900 ring-1 ring-cyan-100 dark:bg-cyan-950/35 dark:text-cyan-100 dark:ring-cyan-800/60"
                  >
                    {organizador?.nome || "Organizador"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                Nenhum organizador adicional informado.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────────────────────────────
 * Página
 * ───────────────────────────────────────────── */

export default function Agendaorganizador() {
  const reduceMotion = useReducedMotion();
  const liveRef = useRef(null);
  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);

  const [nome] = useState(() => obterNomeUsuarioLocal());
  const [eventos, setEventos] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [viewDate, setViewDate] = useState(() => new Date());

  function setLive(message) {
    if (liveRef.current) {
      liveRef.current.textContent = message;
    }
  }

  const carregarAgenda = useCallback(async () => {
    const requestId = ++requestSeqRef.current;

    setCarregando(true);
    setErro("");
    setLive("Carregando agenda do organizador.");

    try {
      if (typeof api?.organizador?.minhasTurmas !== "function") {
        throw new Error(
          "Facade api.organizador.minhasTurmas não encontrada em frontend/src/services/api.js."
        );
      }

      const response = await api.organizador.minhasTurmas();
      const agendaNormalizada = normalizarAgendaResponse(response);

      if (!mountedRef.current || requestId !== requestSeqRef.current) return;

      setEventos(agendaNormalizada);

      setLive(
        agendaNormalizada.length
          ? `Agenda carregada com ${agendaNormalizada.length} turma(s) com data.`
          : "Nenhuma turma localizada na agenda do organizador."
      );
    } catch (error) {
      console.error("[Agendaorganizador] erro ao carregar agenda:", error);

      if (!mountedRef.current || requestId !== requestSeqRef.current) return;

      const message = getErrorMessage(
        error,
        "Não foi possível carregar sua agenda de organizador."
      );

      setEventos([]);
      setErro(message);

      notifyError(
        "Não foi possível carregar sua agenda. Tente novamente ou acione o suporte se o problema continuar."
      );

      setLive("Falha ao carregar agenda do organizador.");
    } finally {
      if (mountedRef.current && requestId === requestSeqRef.current) {
        setCarregando(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    document.title = "Agenda do Organizador — Escola da Saúde";
    carregarAgenda();
  }, [carregarAgenda]);

  const eventosPorData = useMemo(() => {
    const map = {};

    for (const evento of eventos) {
      const dias = obterDiasDoEvento(evento);

      for (const dia of dias) {
        if (!map[dia]) map[dia] = [];
        map[dia].push(evento);
      }
    }

    for (const dia of Object.keys(map)) {
      map[dia].sort((a, b) => {
        const aStart = toLocalDate(
          `${ymd(a.data_inicio || dia)}T${hh(a.horario_inicio, "00:00")}`
        );
        const bStart = toLocalDate(
          `${ymd(b.data_inicio || dia)}T${hh(b.horario_inicio, "00:00")}`
        );

        if (!aStart || !bStart) return 0;

        return compareAsc(aStart, bStart);
      });
    }

    return map;
  }, [eventos]);

  const stats = useMemo(() => {
    return eventos.reduce(
      (acc, evento) => {
        const status = deriveStatus(evento);

        if (status === STATUS_AGENDA.PROGRAMADO) acc.programados += 1;
        else if (status === STATUS_AGENDA.ANDAMENTO) acc.andamento += 1;
        else acc.encerrados += 1;

        return acc;
      },
      {
        programados: 0,
        andamento: 0,
        encerrados: 0,
      }
    );
  }, [eventos]);

  const diaSelecionadoYMD = useMemo(() => {
    return ymd(viewDate) || ymd(new Date());
  }, [viewDate]);

  const eventosDoDia = eventosPorData[diaSelecionadoYMD] || [];

  const irParaHoje = useCallback(() => {
    setViewDate(new Date());
  }, []);

  const exportarMesCSV = useCallback(() => {
    const separator = ";";
    const bom = "\uFEFF";
    const inicio = startOfMonth(viewDate);
    const fim = endOfMonth(viewDate);

    const safe = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    const header = [
      "Turma ID",
      "Evento ID",
      "Evento",
      "Turma",
      "Status",
      "Data início",
      "Hora início",
      "Data fim",
      "Hora fim",
      "Local",
    ].join(separator);

    const rows = [];

    for (const [dia, lista] of Object.entries(eventosPorData)) {
      const dataDia = toLocalDate(`${dia}T12:00:00`);

      if (!dataDia || dataDia < inicio || dataDia > fim) continue;

      for (const evento of lista) {
        const status = deriveStatus(evento);
        const config = STATUS_CONFIG[status] || STATUS_CONFIG.programado;

        rows.push(
          [
            safe(evento.turma_id || evento.id || ""),
            safe(evento.evento_id || ""),
            safe(evento.evento_titulo || evento.titulo || ""),
            safe(evento.turma_nome || ""),
            safe(config.label),
            safe(formatarDataBR(evento.data_inicio)),
            safe(hh(evento.horario_inicio, "")),
            safe(formatarDataBR(evento.data_fim)),
            safe(hh(evento.horario_fim, "")),
            safe(evento.local || ""),
          ].join(separator)
        );
      }
    }

    if (!rows.length) {
      notifyInfo("Não há turmas no mês visível para exportar.");
      return;
    }

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([bom + csv], {
      type: "text/csv;charset=utf-8",
    });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = `agenda_organizador_${format(viewDate, "yyyy-MM")}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }, [eventosPorData, viewDate]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <HeaderHero
        titulo="Agenda do Organizador"
        subtitulo="Consulte seus encontros, aulas, turmas e eventos vinculados ao seu perfil de organizador."
        icone={CalendarDays}
      />

      {carregando ? (
        <div
          className="sticky left-0 top-0 z-40 h-1 w-full bg-cyan-100 dark:bg-cyan-950/40"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Carregando agenda"
        >
          <div
            className={cx(
              "h-full w-1/3 bg-cyan-700",
              reduceMotion ? "" : "animate-pulse"
            )}
          />
        </div>
      ) : null}

      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-3 py-5 sm:px-4 sm:py-6"
      >
        <p ref={liveRef} className="sr-only" aria-live="polite" />

        <PainelOperacionalOrganizador
          nome={nome}
          carregando={carregando}
          stats={stats}
          total={eventos.length}
          viewDate={viewDate}
          onHoje={irParaHoje}
          onAtualizar={carregarAgenda}
          onExportar={exportarMesCSV}
        />

        {erro ? (
          <section
            className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 outline-none shadow-sm dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-100"
            role="alert"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-extrabold">Falha ao carregar agenda</p>
                  <p className="mt-1">{erro}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={carregarAgenda}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-900 transition hover:bg-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 dark:bg-rose-900/40 dark:text-rose-100 dark:hover:bg-rose-900/60"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Tentar novamente
              </button>
            </div>
          </section>
        ) : null}

        <CalendarioPremiumOrganizador
          viewDate={viewDate}
          setViewDate={setViewDate}
          eventosPorData={eventosPorData}
          eventos={eventos}
          carregando={carregando}
          reduceMotion={reduceMotion}
          onSelectEvento={setSelecionado}
        />

        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">
                Turmas em {formatarDataBR(diaSelecionadoYMD)}
              </h2>

              <p className="text-sm text-slate-600 dark:text-zinc-400">
                {eventosDoDia.length
                  ? `${eventosDoDia.length} turma(s) encontrada(s) para este dia.`
                  : "Nenhuma turma encontrada para este dia."}
              </p>
            </div>
          </div>

          {!eventosDoDia.length ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700">
              Nenhuma turma neste dia.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {eventosDoDia.map((evento) => {
                const status = deriveStatus(evento);
                const config = STATUS_CONFIG[status] || STATUS_CONFIG.programado;

                return (
                  <li
                    key={
                      evento.turma_id ||
                      evento.id ||
                      `${evento.titulo}-${evento.data_inicio}-${evento.horario_inicio}`
                    }
                    className={`overflow-hidden rounded-3xl ring-1 ${config.card}`}
                  >
                    <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />

                    <div className="p-4">
                      <div className="min-w-0">
                        <p className="break-words font-extrabold">
                          {evento.evento_titulo || evento.titulo || "Evento"}
                        </p>

                        {evento.turma_nome ? (
                          <p className="mt-1 text-sm font-semibold opacity-80">
                            Turma: {evento.turma_nome}
                          </p>
                        ) : null}

                        <div className="mt-2">
                          <StatusChip status={status} />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 text-sm">
                        <div className="inline-flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            {formatarDataBR(evento.data_inicio)}
                            {evento.data_fim &&
                            evento.data_fim !== evento.data_inicio
                              ? ` até ${formatarDataBR(evento.data_fim)}`
                              : ""}{" "}
                            • {formatarHorario(evento.horario_inicio, evento.horario_fim)}
                          </span>
                        </div>

                        {evento.local ? (
                          <div className="inline-flex items-center gap-2">
                            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="break-words">{evento.local}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelecionado(evento)}
                          className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                        >
                          Ver detalhes
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex justify-center">
          <LegendaEventos />
        </div>
      </main>

      {selecionado ? (
        <EventoDetalheModalLocal
          evento={selecionado}
          onClose={() => setSelecionado(null)}
        />
      ) : null}

      <Footer />
    </div>
  );
}