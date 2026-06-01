// ✅ frontend/src/pages/AgendaAdministrador.jsx — v2.2
// Atualizado em: 01/06/2026
// Plataforma Escola da Saúde
// Agenda administrativa premium montada por TURMAS, pois as datas oficiais estão em turmas.
// HeaderHero limpo: sem botões, stats, filtros, trilhas ou badges.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { useReducedMotion } from "framer-motion";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import LegendaEventos from "../components/eventos/LegendaEventos";
import CarregandoSkeleton from "../components/ui/CarregandoSkeleton";
import { notifyError, notifyInfo } from "../components/ui/AppToast";
import { apiTurmaListarAdministrador } from "../services/api";

/* ─────────────────────────────────────────────
 * Constantes
 * ───────────────────────────────────────────── */

const STORAGE_VIEW_DATE_KEY = "agendaAdministrador:v2:viewDate";
const STORAGE_BUSCA_KEY = "agendaAdministrador:v2:busca";
const STORAGE_STATUS_KEY = "agendaAdministrador:v2:status";

const STATUS_AGENDA = {
  TODOS: "todos",
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
    border: "border-emerald-200 dark:border-emerald-900/50",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
  },
  andamento: {
    label: "Em andamento",
    chip:
      "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/35 dark:text-amber-100 dark:ring-amber-800/60",
    card:
      "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/25 dark:text-amber-100 dark:ring-amber-800/60",
    dot: "bg-amber-500",
    border: "border-amber-200 dark:border-amber-900/50",
    gradient: "from-amber-400 via-orange-400 to-yellow-500",
  },
  encerrado: {
    label: "Encerrado",
    chip:
      "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/35 dark:text-rose-100 dark:ring-rose-800/60",
    card:
      "bg-rose-50 text-rose-950 ring-rose-200 dark:bg-rose-950/25 dark:text-rose-100 dark:ring-rose-800/60",
    dot: "bg-rose-500",
    border: "border-rose-200 dark:border-rose-900/50",
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

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function formatarHorario(inicio, fim) {
  const hi = hh(inicio, "");
  const hf = hh(fim, "");

  if (hi && hf) return `${hi} às ${hf}`;
  if (hi) return `A partir de ${hi}`;
  if (hf) return `Até ${hf}`;

  return "Horário não informado";
}

/* ─────────────────────────────────────────────
 * Helpers localStorage
 * ───────────────────────────────────────────── */

function getStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function setStorage(key, value) {
  try {
    localStorage.setItem(key, String(value ?? ""));
  } catch {
    // noop
  }
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

function extrairListaTurmas(response) {
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

function normalizarAgendaResponse(response) {
  const lista = extrairListaTurmas(response);

  return lista
    .map((turma) => {
      const dataInicio = ymd(turma?.data_inicio);
      const dataFim = ymd(turma?.data_fim || turma?.data_inicio);

      if (!dataInicio) return null;

      const eventoTitulo = safeText(
        turma?.evento_titulo || turma?.evento || turma?.titulo_evento,
        "Evento"
      );

      const turmaNome = safeText(turma?.nome || turma?.turma_nome, "");

      const normalizado = {
        id: turma?.id,
        turma_id: turma?.id,
        evento_id: turma?.evento_id,
        titulo: turmaNome ? `${eventoTitulo} — ${turmaNome}` : eventoTitulo,
        evento_titulo: eventoTitulo,
        turma_nome: turmaNome,
        local: turma?.local || turma?.sala || turma?.sala_nome || null,
        data_inicio: dataInicio,
        data_fim: dataFim,
        horario_inicio: hh(turma?.horario_inicio, ""),
        horario_fim: hh(turma?.horario_fim, ""),
        status: "",
        vagas_total: turma?.vagas_total ?? null,
        carga_horaria: turma?.carga_horaria ?? null,
        organizadores: normalizarOrganizadores(turma),
        _raw: turma,
      };

      normalizado.status = deriveStatus({
        ...normalizado,
        status: turma?.status,
      });

      return normalizado;
    })
    .filter(Boolean);
}

function obterDiasDoEvento(item) {
  return rangeDiasYMD(ymd(item?.data_inicio), ymd(item?.data_fim));
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

function TotalCard({ label, value, status, icon: Icon }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.programado;

  return (
    <div
      className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 dark:bg-zinc-900 ${config.card}`}
      title={`${value} ${label}`}
    >
      <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />

      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide opacity-75">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black">{value}</p>
        </div>

        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/70 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function PainelOperacionalAgenda({
  carregando,
  viewDate,
  busca,
  setBusca,
  filtroStatus,
  setFiltroStatus,
  totaisMes,
  possuiFiltros,
  onLimparFiltros,
  onRefresh,
  onHoje,
  onExportarMes,
}) {
  return (
    <section
      aria-label="Painel operacional da agenda"
      className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
              <Sparkles className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />
              Painel operacional
            </p>

            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              Mês visível:{" "}
              <strong className="text-slate-800 dark:text-zinc-100">
                {formatarMesAno(viewDate)}
              </strong>{" "}
              • {totaisMes.total} ocorrência(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onHoje}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
              aria-label="Ir para a data de hoje no calendário"
            >
              Hoje
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={carregando}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
              aria-label="Atualizar agenda"
            >
              <RefreshCw
                className={cx("h-4 w-4", carregando ? "animate-spin" : "")}
                aria-hidden="true"
              />
              {carregando ? "Atualizando..." : "Atualizar"}
            </button>

            <button
              type="button"
              onClick={onExportarMes}
              disabled={carregando || totaisMes.total <= 0}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              title="Exportar ocorrências do mês visível em CSV"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar mês
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/25 dark:text-indigo-100">
            <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600" />
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide opacity-75">
                  Total no mês
                </p>
                <p className="mt-1 text-2xl font-black">{totaisMes.total}</p>
              </div>

              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/70 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </div>

          <TotalCard
            label="Programados"
            value={totaisMes.programado}
            status="programado"
            icon={CalendarDays}
          />

          <TotalCard
            label="Em andamento"
            value={totaisMes.andamento}
            status="andamento"
            icon={Clock}
          />

          <TotalCard
            label="Encerrados"
            value={totaisMes.encerrado}
            status="encerrado"
            icon={CheckCircle2}
          />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
            <div className="relative min-w-0">
              <label
                htmlFor="busca-evento"
                className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400"
              >
                Buscar evento, turma ou local
              </label>

              <Search
                className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />

              <input
                id="busca-evento"
                type="search"
                inputMode="search"
                placeholder="Buscar evento, turma ou local..."
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="min-h-[44px] w-full rounded-2xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-950 outline-none focus:ring-2 focus:ring-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                aria-describedby="dica-busca"
              />
            </div>

            <div>
              <label
                htmlFor="filtro-status"
                className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400"
              >
                Status
              </label>

              <select
                id="filtro-status"
                value={filtroStatus}
                onChange={(event) => setFiltroStatus(event.target.value)}
                className="min-h-[44px] w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:ring-2 focus:ring-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              >
                <option value="todos">Todos os status</option>
                <option value="programado">Programados</option>
                <option value="andamento">Em andamento</option>
                <option value="encerrado">Encerrados</option>
              </select>
            </div>

            {possuiFiltros ? (
              <button
                type="button"
                onClick={onLimparFiltros}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Limpar filtros
              </button>
            ) : (
              <div className="hidden lg:block" aria-hidden="true" />
            )}
          </div>

          <p id="dica-busca" className="mt-2 text-xs text-slate-600 dark:text-zinc-300">
            A agenda é montada pelas turmas, pois as datas oficiais ficam na tabela de turmas.
          </p>
        </div>
      </div>
    </section>
  );
}

function CalendarioPremium({
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
  const mesLabel = formatarMesAno(viewDate);

  const irMesAnterior = () => {
    setViewDate((current) => subMonths(current, 1));
  };

  const irProximoMes = () => {
    setViewDate((current) => addMonths(current, 1));
  };

  return (
    <section className="rounded-[2rem] bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Calendário
          </p>

          <h2 className="mt-3 text-xl font-black text-slate-950 dark:text-white">
            {mesLabel}
          </h2>

          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Clique em uma turma dentro do dia para abrir os detalhes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={irMesAnterior}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setViewDate(new Date())}
            className="inline-flex min-h-[40px] items-center justify-center rounded-2xl bg-indigo-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
          >
            Hoje
          </button>

          <button
            type="button"
            onClick={irProximoMes}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-extrabold text-indigo-900 ring-1 ring-indigo-100 dark:bg-indigo-950/35 dark:text-indigo-100 dark:ring-indigo-800/60">
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
              <div key={index} className="min-h-[112px] bg-white p-2 dark:bg-zinc-900">
                <CarregandoSkeleton height={18} />
                <div className="mt-3 space-y-2">
                  <CarregandoSkeleton height={16} />
                  <CarregandoSkeleton height={16} />
                </div>
              </div>
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
                    !inMonth && "bg-slate-50 text-slate-400 dark:bg-zinc-950/60 dark:text-zinc-600",
                    today && "ring-2 ring-inset ring-indigo-500"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => setViewDate(dia)}
                      className={cx(
                        "inline-flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700",
                        today
                          ? "bg-indigo-700 text-white"
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
                      const config = STATUS_CONFIG[status] || STATUS_CONFIG.programado;

                      return (
                        <button
                          key={`${item.turma_id || item.id}-${key}`}
                          type="button"
                          onClick={() => onSelectEvento(item)}
                          className={cx(
                            "block w-full truncate rounded-xl px-2 py-1 text-left text-[10px] font-bold ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700",
                            config.chip,
                            reduceMotion ? "" : "hover:-translate-y-0.5"
                          )}
                          title={item.titulo}
                        >
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" />
                          {item.turma_nome || item.evento_titulo || item.titulo}
                        </button>
                      );
                    })}

                    {extras > 0 ? (
                      <button
                        type="button"
                        onClick={() => onSelectEvento(lista[max])}
                        className="w-full rounded-xl bg-indigo-50 px-2 py-1 text-left text-[10px] font-black text-indigo-900 ring-1 ring-indigo-100 transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-100 dark:ring-indigo-800/60"
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

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-6 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agenda-admin-modal-titulo"
    >
      <div className="relative my-auto w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-zinc-900 dark:ring-white/10">
        <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />

        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-zinc-700">
          <div className="min-w-0">
            <StatusChip status={status} />

            <h2
              id="agenda-admin-modal-titulo"
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                    className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900 ring-1 ring-indigo-100 dark:bg-indigo-950/35 dark:text-indigo-100 dark:ring-indigo-800/60"
                  >
                    {organizador?.nome || "Organizador"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                Nenhum organizador informado.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Página
 * ───────────────────────────────────────────── */

export default function AgendaAdministrador() {
  const reduceMotion = useReducedMotion();
  const liveRef = useRef(null);
  const erroRef = useRef(null);
  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);

  const [eventos, setEventos] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [viewDate, setViewDate] = useState(() => {
    const saved = getStorage(STORAGE_VIEW_DATE_KEY, "");
    const parsed = saved ? toLocalDate(`${saved.slice(0, 10)}T12:00:00`) : null;

    return parsed || new Date();
  });

  const [busca, setBusca] = useState(() => getStorage(STORAGE_BUSCA_KEY, ""));

  const [buscaDebounced, setBuscaDebounced] = useState(() =>
    normalizeSearch(busca)
  );

  const [filtroStatus, setFiltroStatus] = useState(() => {
    const saved = getStorage(STORAGE_STATUS_KEY, STATUS_AGENDA.TODOS);

    return Object.values(STATUS_AGENDA).includes(saved)
      ? saved
      : STATUS_AGENDA.TODOS;
  });

  const setLive = useCallback((message) => {
    if (liveRef.current) {
      liveRef.current.textContent = message || "";
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    document.title = "Agenda Geral de Eventos — Escola da Saúde";

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setStorage(STORAGE_VIEW_DATE_KEY, ymd(viewDate) || "");
  }, [viewDate]);

  useEffect(() => {
    setStorage(STORAGE_STATUS_KEY, filtroStatus);
  }, [filtroStatus]);

  useEffect(() => {
    setStorage(STORAGE_BUSCA_KEY, busca);

    const timer = window.setTimeout(() => {
      setBuscaDebounced(normalizeSearch(busca));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [busca]);

  const carregarAgenda = useCallback(async () => {
    const requestId = ++requestSeqRef.current;

    setCarregando(true);
    setErro("");
    setLive("Carregando agenda geral de eventos.");

    try {
      if (typeof apiTurmaListarAdministrador !== "function") {
        throw new Error(
          "Facade apiTurmaListarAdministrador não encontrada em frontend/src/services/api.js."
        );
      }

      const response = await apiTurmaListarAdministrador();
      const agendaNormalizada = normalizarAgendaResponse(response);

      if (!mountedRef.current || requestId !== requestSeqRef.current) return;

      setEventos(agendaNormalizada);

      setLive(
        agendaNormalizada.length
          ? `Agenda carregada com ${agendaNormalizada.length} turma(s) com data.`
          : "Nenhuma turma com data encontrada na agenda geral."
      );
    } catch (error) {
      console.error("[AgendaAdministrador] erro ao carregar agenda:", error);

      if (!mountedRef.current || requestId !== requestSeqRef.current) return;

      const message = getErrorMessage(
        error,
        "Não foi possível carregar a agenda geral de eventos."
      );

      setEventos([]);
      setErro(message);

      notifyError(
        "Não foi possível carregar a agenda. Tente novamente ou acione o suporte se o problema continuar."
      );

      setLive("Falha ao carregar agenda geral de eventos.");

      window.setTimeout(() => erroRef.current?.focus?.(), 0);
    } finally {
      if (mountedRef.current && requestId === requestSeqRef.current) {
        setCarregando(false);
      }
    }
  }, [setLive]);

  useEffect(() => {
    carregarAgenda();
  }, [carregarAgenda]);

  const eventosBasePorData = useMemo(() => {
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

  const eventosPorData = useMemo(() => {
    const filtra = (evento) => {
      const texto = normalizeSearch(
        [
          evento?.titulo,
          evento?.evento_titulo,
          evento?.turma_nome,
          evento?.local,
          ...(Array.isArray(evento?.organizadores)
            ? evento.organizadores.map((organizador) => organizador?.nome)
            : []),
        ].join(" ")
      );

      if (buscaDebounced && !texto.includes(buscaDebounced)) {
        return false;
      }

      if (
        filtroStatus !== STATUS_AGENDA.TODOS &&
        deriveStatus(evento) !== filtroStatus
      ) {
        return false;
      }

      return true;
    };

    const out = {};

    for (const [dia, lista] of Object.entries(eventosBasePorData)) {
      const filtrados = lista.filter(filtra);

      if (filtrados.length) {
        out[dia] = filtrados;
      }
    }

    return out;
  }, [eventosBasePorData, buscaDebounced, filtroStatus]);

  const totaisMes = useMemo(() => {
    const inicio = startOfMonth(viewDate);
    const fim = endOfMonth(viewDate);

    const totais = {
      total: 0,
      programado: 0,
      andamento: 0,
      encerrado: 0,
    };

    for (const [dia, lista] of Object.entries(eventosPorData)) {
      const dataDia = toLocalDate(`${dia}T12:00:00`);

      if (!dataDia || dataDia < inicio || dataDia > fim) continue;

      for (const evento of lista) {
        const status = deriveStatus(evento);

        totais.total += 1;

        if (status === STATUS_AGENDA.PROGRAMADO) totais.programado += 1;
        else if (status === STATUS_AGENDA.ANDAMENTO) totais.andamento += 1;
        else totais.encerrado += 1;
      }
    }

    return totais;
  }, [eventosPorData, viewDate]);

  const diaSelecionadoYMD = useMemo(() => {
    return ymd(viewDate) || ymd(new Date());
  }, [viewDate]);

  const eventosDoDia = eventosPorData[diaSelecionadoYMD] || [];

  const irParaHoje = useCallback(() => {
    setViewDate(new Date());
  }, []);

  const limparFiltros = useCallback(() => {
    setBusca("");
    setFiltroStatus(STATUS_AGENDA.TODOS);
  }, []);

  const exportarMesCSV = useCallback(() => {
    const inicio = startOfMonth(viewDate);
    const fim = endOfMonth(viewDate);
    const separator = ";";
    const bom = "\uFEFF";
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
      notifyInfo("Não há ocorrências no mês visível para exportar.");
      return;
    }

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([bom + csv], {
      type: "text/csv;charset=utf-8",
    });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = `agenda_${format(viewDate, "yyyy-MM")}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }, [eventosPorData, viewDate]);

  const possuiFiltros = Boolean(busca || filtroStatus !== STATUS_AGENDA.TODOS);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <HeaderHero
        titulo="Agenda Geral de Eventos"
        subtitulo="Visualize, filtre e consulte os eventos por turma e data no calendário geral da Escola da Saúde."
        icone={CalendarDays}
      />

      {carregando ? (
        <div
          className="sticky left-0 top-0 z-40 h-1 w-full bg-indigo-100 dark:bg-indigo-950/40"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Carregando agenda"
        >
          <div
            className={cx(
              "h-full w-1/3 bg-indigo-700",
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

        <PainelOperacionalAgenda
          carregando={carregando}
          viewDate={viewDate}
          busca={busca}
          setBusca={setBusca}
          filtroStatus={filtroStatus}
          setFiltroStatus={setFiltroStatus}
          totaisMes={totaisMes}
          possuiFiltros={possuiFiltros}
          onLimparFiltros={limparFiltros}
          onRefresh={carregarAgenda}
          onHoje={irParaHoje}
          onExportarMes={exportarMesCSV}
        />

        {erro ? (
          <section
            ref={erroRef}
            tabIndex={-1}
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

        <CalendarioPremium
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
              <h2
                id="eventos-dia-titulo"
                className="text-base font-black text-slate-950 dark:text-white"
              >
                Ocorrências em {formatarDataBR(diaSelecionadoYMD)}
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
              Nenhuma ocorrência neste dia.
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
                      <div className="flex items-start justify-between gap-3">
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
                      </div>

                      <div className="mt-3 flex flex-col gap-2 text-sm">
                        <div className="inline-flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            {formatarDataBR(evento.data_inicio)}
                            {evento.data_fim && evento.data_fim !== evento.data_inicio
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
                          className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                          aria-label={`Ver detalhes da turma ${
                            evento.turma_nome || evento.evento_titulo || ""
                          }`}
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

        {selecionado ? (
          <EventoDetalheModalLocal
            evento={selecionado}
            onClose={() => setSelecionado(null)}
          />
        ) : null}
      </main>

      <Footer />
    </div>
  );
}