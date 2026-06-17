// ✅ frontend/src/pages/DashboardAdministrador.jsx — v2.2

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import useEscolaTheme from "../hooks/useEscolaTheme";
import {
  apiEventoExcluir,
  apiEventoListarAdministrador,
  apiEventoPublicar,
  apiTurmaListarPorEvento,
} from "../services/api";
import { getEventoFolderUrl } from "../services/eventoService";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function unwrap(response) {
  return response?.data ?? response;
}

function toArrayPayload(response, key) {
  const payload = unwrap(response);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (key && Array.isArray(payload?.[key])) {
    return payload[key];
  }
  return [];
}

function getErrorMessage(error, fallback) {
  const data = error?.response?.data || error?.data || {};
  return data?.message || data?.erro || error?.message || fallback;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function ymd(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(
      value.getDate(),
    )}`;
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  return "";
}

function formatarDataBR(value) {
  const data = ymd(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return "—";
  }
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function normalizarBusca(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function getNomeMes(mesIndex) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long" })
    .format(new Date(2026, mesIndex, 1))
    .replace(/^./, (char) => char.toUpperCase());
}

function getIntervaloMes(ano, mesIndex) {
  const inicio = `${ano}-${pad2(mesIndex + 1)}-01`;
  const ultimoDia = new Date(ano, mesIndex + 1, 0).getDate();
  const fim = `${ano}-${pad2(mesIndex + 1)}-${pad2(ultimoDia)}`;
  return { inicio, fim };
}

function getDatasTurma(turma) {
  const datas = [];

  const inicio = ymd(turma?.data_inicio);
  const fim = ymd(turma?.data_fim || turma?.data_inicio);

  if (inicio) {
    datas.push(inicio);
  }
  if (fim) {
    datas.push(fim);
  }

  if (Array.isArray(turma?.datas)) {
    for (const item of turma.datas) {
      const data = ymd(item?.data || item);
      if (data) {
        datas.push(data);
      }
    }
  }

  if (Array.isArray(turma?.ocorrencias)) {
    for (const item of turma.ocorrencias) {
      const data = ymd(item?.data || item?.data_presenca || item);
      if (data) {
        datas.push(data);
      }
    }
  }

  return [...new Set(datas)].filter(Boolean).sort();
}

function getDatasEvento(evento, turmas = []) {
  const datas = [];

  const eventoInicio = ymd(
    evento?.data_inicio_geral ||
      evento?.data_inicio ||
      evento?.primeira_data ||
      evento?.inicio,
  );

  const eventoFim = ymd(
    evento?.data_fim_geral ||
      evento?.data_fim ||
      evento?.ultima_data ||
      eventoInicio,
  );

  if (eventoInicio) {
    datas.push(eventoInicio);
  }
  if (eventoFim) {
    datas.push(eventoFim);
  }

  for (const turma of turmas) {
    datas.push(...getDatasTurma(turma));
  }

  return [...new Set(datas)].filter(Boolean).sort();
}

function getDataInicioEvento(evento, turmas = []) {
  return getDatasEvento(evento, turmas)[0] || "9999-12-31";
}

function eventoTemAulaNoMes(evento, turmas, ano, mesIndex) {
  const { inicio, fim } = getIntervaloMes(ano, mesIndex);
  const datas = getDatasEvento(evento, turmas);

  if (datas.some((data) => data >= inicio && data <= fim)) {
    return true;
  }

  const di = datas[0];
  const df = datas.at(-1);

  if (!di && !df) {
    return false;
  }

  return di <= fim && df >= inicio;
}

function getPeriodoEvento(evento, turmas = []) {
  const datas = getDatasEvento(evento, turmas);

  if (!datas.length) {
    return "Período não informado";
  }

  const inicio = datas[0];
  const fim = datas.at(-1);

  return inicio === fim
    ? formatarDataBR(inicio)
    : `${formatarDataBR(inicio)} a ${formatarDataBR(fim)}`;
}

function getTituloEvento(evento) {
  return String(evento?.titulo || "Evento sem título").trim();
}

function isEventoPublicado(evento) {
  return (
    evento?.publicado === true ||
    evento?.publicado === "true" ||
    evento?.publicado === 1
  );
}

function statusEvento(evento, turmas = []) {
  const hoje = ymd(new Date());
  const datas = getDatasEvento(evento, turmas);

  if (!datas.length) {
    return "sem_datas";
  }

  const inicio = datas[0];
  const fim = datas.at(-1);

  if (hoje < inicio) {
    return "programado";
  }
  if (hoje > fim) {
    return "encerrado";
  }

  return "andamento";
}

function statusUi(status) {
  if (status === "andamento") {
    return {
      label: "Em andamento",
      chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200",
      dot: "bg-amber-500",
    };
  }

  if (status === "encerrado") {
    return {
      label: "Encerrado",
      chip: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-200",
      dot: "bg-rose-500",
    };
  }

  if (status === "sem_datas") {
    return {
      label: "Sem datas completas",
      chip: "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200",
      dot: "bg-zinc-400",
    };
  }

  return {
    label: "Programado",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200",
    dot: "bg-emerald-500",
  };
}

function GhostButton({
  children,
  icon: Icon,
  onClick,
  disabled = false,
  loading = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-white/5"
    >
      {Icon ? (
        <Icon
          className={cx("h-4 w-4", loading ? "animate-spin" : "")}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone = "emerald" }) {
  const toneMap = {
    emerald: "from-emerald-600 via-teal-600 to-cyan-600",
    amber: "from-amber-500 via-orange-500 to-rose-500",
    rose: "from-rose-600 via-pink-600 to-orange-600",
    slate: "from-slate-700 via-slate-800 to-zinc-900",
  };

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div
        className={cx(
          "h-1.5 bg-gradient-to-r",
          toneMap[tone] || toneMap.emerald,
        )}
      />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-400">
              {label}
            </p>

            <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {value}
            </p>

            {hint ? (
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-zinc-400">
                {hint}
              </p>
            ) : null}
          </div>

          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  );
}

function MonthNavigator({
  ano,
  mesIndex,
  onAnterior,
  onProximo,
  onHoje,
  onAnoChange,
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            Competência mensal
          </p>

          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {getNomeMes(mesIndex)} de {ano}
          </h2>

          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
            Exibindo eventos que possuem pelo menos uma aula dentro deste mês.
          </p>
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <GhostButton icon={ChevronLeft} onClick={onAnterior}>
              Mês anterior
            </GhostButton>

            <GhostButton icon={CalendarDays} onClick={onHoje}>
              Mês atual
            </GhostButton>

            <GhostButton icon={ChevronRight} onClick={onProximo}>
              Próximo
            </GhostButton>
          </div>

          <label className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 xl:justify-start">
            Ano
            <input
              type="number"
              value={ano}
              min="2020"
              max="2100"
              onChange={(event) => onAnoChange(Number(event.target.value))}
              className="w-24 rounded-xl border border-slate-200 bg-white px-2 py-1 text-sm font-black text-slate-950 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            />
          </label>
        </div>
      </div>
    </section>
  );
}

function SearchPanel({ busca, setBusca, totalFiltrado, totalMes }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950 dark:text-white">
            Localizar evento
          </p>

          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            Busque por título, local, tipo ou público-alvo.
          </p>
        </div>

        <div className="relative w-full lg:max-w-lg">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />

          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar evento..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-10 pr-11 text-sm font-bold text-slate-950 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
          />

          <button
            type="button"
            onClick={() => setBusca("")}
            disabled={!busca}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-900"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs font-medium text-slate-500 dark:text-zinc-400">
        Mostrando{" "}
        <span className="font-black text-slate-800 dark:text-zinc-100">
          {totalFiltrado}
        </span>{" "}
        de{" "}
        <span className="font-black text-slate-800 dark:text-zinc-100">
          {totalMes}
        </span>{" "}
        evento(s) da competência selecionada.
      </div>
    </section>
  );
}

function EmptyState({ mesIndex, ano }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CalendarDays className="h-8 w-8" aria-hidden="true" />
      </div>

      <h3 className="mt-4 text-xl font-black text-slate-950 dark:text-white">
        Nenhum evento encontrado
      </h3>

      <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
        Não há eventos com aula em {getNomeMes(mesIndex)} de {ano}, ou a busca
        informada não encontrou resultados.
      </p>
    </div>
  );
}

function QuickAction({
  children,
  onClick,
  icon: Icon,
  tone = "evento",
  disabled = false,
  loading = false,
}) {
  const tones = {
    evento:
      "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200",
    inscricao:
      "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-200",
    qrcode:
      "border-pink-200 bg-pink-50 text-pink-800 hover:bg-pink-100 dark:border-pink-900/40 dark:bg-pink-950/25 dark:text-pink-200",
    presenca:
      "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200",
    avaliacao:
      "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-900/40 dark:bg-violet-950/25 dark:text-violet-200",
    certificado:
      "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:border-cyan-900/40 dark:bg-cyan-950/25 dark:text-cyan-200",
    publicar:
      "border-lime-200 bg-lime-50 text-lime-800 hover:bg-lime-100 dark:border-lime-900/40 dark:bg-lime-950/25 dark:text-lime-200",
    excluir:
      "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-200",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(
        "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-2 text-xs font-black shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60",
        tones[tone] || tones.evento,
      )}
    >
      {Icon ? (
        <Icon
          className={cx("h-5 w-5", loading ? "animate-spin" : "")}
          aria-hidden="true"
        />
      ) : null}

      <span className="leading-tight">{children}</span>
    </button>
  );
}

function ConfirmExcluirEventoModal({
  open,
  evento,
  loading = false,
  onClose,
  onConfirm,
}) {
  if (!open || !evento) {
    return null;
  }

  const titulo = getTituloEvento(evento);

  return (
    <div className="fixed inset-0 z-[9999]">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-0 grid place-items-center p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-excluir-evento-titulo"
          className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-white/10">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-rose-600 dark:text-rose-300">
                Exclusão de evento
              </p>

              <h2
                id="modal-excluir-evento-titulo"
                className="mt-1 text-xl font-black text-slate-950 dark:text-white"
              >
                Excluir evento?
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
              aria-label="Fechar confirmação"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="px-5 py-5">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-200">
              <p className="text-sm">
                <strong>Evento:</strong> {titulo}
              </p>

              <p className="mt-2 text-sm">Esta ação não poderá ser desfeita.</p>
            </div>
          </div>

          <footer className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 dark:border-white/10 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex justify-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex justify-center rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {loading ? "Excluindo..." : "Excluir evento"}
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}

function EventMetaCard({ label, value, compact = false }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-zinc-950">
      <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={cx(
          "mt-1 truncate font-black text-slate-950 dark:text-white",
          compact ? "text-xs sm:text-[13px]" : "text-lg",
        )}
        title={String(value || "")}
      >
        {value}
      </p>
    </div>
  );
}

function EventCard({
  evento,
  turmas,
  onAcao,
  onPublicar,
  onExcluir,
  acaoEventoId,
}) {
  const status = statusUi(statusEvento(evento, turmas));
  const titulo = getTituloEvento(evento);
  const periodo = getPeriodoEvento(evento, turmas);
  const dataInicio = getDataInicioEvento(evento, turmas);
  const folderUrl = getEventoFolderUrl(evento);
  const publicado = isEventoPublicado(evento);
  const publicando = acaoEventoId === `${evento.id}:publicar`;
  const excluindo = acaoEventoId === `${evento.id}:excluir`;

  const totalTurmas = Array.isArray(turmas) ? turmas.length : 0;
  const totalDatas = Array.isArray(turmas)
    ? turmas.reduce((total, turma) => total + getDatasTurma(turma).length, 0)
    : 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-zinc-900"
    >
      <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="bg-slate-100 dark:bg-zinc-950">
          <div className="aspect-[16/9] w-full overflow-hidden lg:aspect-auto lg:h-full lg:min-h-[260px]">
            {folderUrl ? (
              <img
                src={folderUrl}
                alt={`Folder do evento ${titulo}`}
                className="h-full w-full object-cover object-top"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="grid h-full min-h-[180px] place-items-center p-4 text-center text-slate-500 dark:text-zinc-400 lg:min-h-[260px]">
                <div>
                  <CalendarDays className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-xs font-black">Sem folder</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black",
                status.chip,
              )}
            >
              <span className={cx("h-2 w-2 rounded-full", status.dot)} />
              {status.label}
            </span>

            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700 dark:bg-white/10 dark:text-zinc-200">
              ID {evento.id}
            </span>

            {publicado ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                Publicado
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-black text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                Rascunho
              </span>
            )}
          </div>

          <h3 className="mt-3 break-words text-xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-2xl">
            {titulo}
          </h3>

          <p className="mt-1.5 max-h-11 overflow-hidden text-sm font-medium leading-relaxed text-slate-600 dark:text-zinc-300">
            {evento?.descricao ||
              "Evento cadastrado na Plataforma da Escola da Saúde."}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
            <EventMetaCard
              label="Início"
              value={formatarDataBR(dataInicio)}
              compact
            />
            <EventMetaCard label="Período" value={periodo} compact />
            <EventMetaCard label="Turmas" value={totalTurmas} />
            <EventMetaCard label="Aulas/datas" value={totalDatas || "—"} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <QuickAction
              tone="evento"
              onClick={() => onAcao(evento.id, "evento")}
              icon={LayoutDashboard}
              disabled={publicando || excluindo}
            >
              Evento
            </QuickAction>

            <QuickAction
              tone="inscricao"
              onClick={() => onAcao(evento.id, "inscricao")}
              icon={ClipboardList}
              disabled={publicando || excluindo}
            >
              Inscrição
            </QuickAction>

            <QuickAction
              tone="qrcode"
              onClick={() => onAcao(evento.id, "qrcode")}
              icon={Search}
              disabled={publicando || excluindo}
            >
              QR Code
            </QuickAction>

            <QuickAction
              tone="presenca"
              onClick={() => onAcao(evento.id, "presenca")}
              icon={GraduationCap}
              disabled={publicando || excluindo}
            >
              Presença
            </QuickAction>

            <QuickAction
              tone="avaliacao"
              onClick={() => onAcao(evento.id, "avaliacao")}
              icon={Sparkles}
              disabled={publicando || excluindo}
            >
              Avaliação
            </QuickAction>

            <QuickAction
              tone="certificado"
              onClick={() => onAcao(evento.id, "certificado")}
              icon={ShieldCheck}
              disabled={publicando || excluindo}
            >
              Certificado
            </QuickAction>

            <QuickAction
              tone="publicar"
              onClick={() => onPublicar(evento.id)}
              icon={CheckCircle2}
              disabled={publicado || publicando || excluindo}
              loading={publicando}
            >
              {publicado ? "Publicado" : "Publicar"}
            </QuickAction>

            <QuickAction
              tone="excluir"
              onClick={() => onExcluir(evento)}
              icon={Trash2}
              disabled={publicando || excluindo}
              loading={excluindo}
            >
              Excluir
            </QuickAction>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/* ─────────────────────────────────────────────────────────────
   Página
────────────────────────────────────────────────────────────── */

export default function DashboardAdministrador() {
  const { isDark } = useEscolaTheme();
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();

  const hoje = useMemo(() => new Date(), []);
  const [ano, setAno] = useState(() => hoje.getFullYear());
  const [mesIndex, setMesIndex] = useState(() => hoje.getMonth());

  const [eventos, setEventos] = useState([]);
  const [turmasPorEvento, setTurmasPorEvento] = useState({});
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [acaoEventoId, setAcaoEventoId] = useState(null);
  const [eventoParaExcluir, setEventoParaExcluir] = useState(null);

  const liveRef = useRef(null);
  const erroRef = useRef(null);
  const mountedRef = useRef(true);
  const abortRef = useRef(null);

  const setLive = useCallback((message) => {
    if (liveRef.current) {
      liveRef.current.textContent = message || "";
    }
  }, []);

  useEffect(() => {
    document.title = "Painel do Gestor — Escola da Saúde";
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort?.("unmount");
    };
  }, []);

  const carregarEventos = useCallback(async () => {
    try {
      abortRef.current?.abort?.("nova-requisicao");

      const controller = new AbortController();
      abortRef.current = controller;

      setCarregando(true);
      setErro("");
      setLive("Carregando eventos do painel do gestor...");

      const response = await apiEventoListarAdministrador({
        on403: "silent",
        signal: controller.signal,
      });

      const lista = toArrayPayload(response, "eventos");

      if (!mountedRef.current) {
        return;
      }

      setEventos(lista);

      const pares = await Promise.all(
        lista.map(async (evento) => {
          try {
            const turmaResponse = await apiTurmaListarPorEvento(evento.id, {
              on403: "silent",
            });

            return [evento.id, toArrayPayload(turmaResponse, "turmas")];
          } catch {
            return [evento.id, []];
          }
        }),
      );

      if (!mountedRef.current) {
        return;
      }

      setTurmasPorEvento(Object.fromEntries(pares));
      setLive("Eventos do painel do gestor atualizados.");
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }

      console.error("[PainelGestor] erro ao carregar eventos", {
        message: error?.message,
      });

      const message = getErrorMessage(error, "Erro ao carregar eventos.");

      setEventos([]);
      setTurmasPorEvento({});
      setErro(message);
      setLive("Falha ao carregar eventos do painel do gestor.");

      window.setTimeout(() => erroRef.current?.focus?.(), 0);
    } finally {
      if (mountedRef.current) {
        setCarregando(false);
      }
    }
  }, [setLive]);

  useEffect(() => {
    carregarEventos();
  }, [carregarEventos]);

  const eventosDoMes = useMemo(() => {
    return eventos
      .filter((evento) =>
        eventoTemAulaNoMes(
          evento,
          turmasPorEvento?.[evento.id] || [],
          ano,
          mesIndex,
        ),
      )
      .sort((a, b) => {
        const dataA = getDataInicioEvento(a, turmasPorEvento?.[a.id] || []);
        const dataB = getDataInicioEvento(b, turmasPorEvento?.[b.id] || []);

        if (dataA !== dataB) {
          return dataA.localeCompare(dataB);
        }

        return getTituloEvento(a).localeCompare(getTituloEvento(b), "pt-BR");
      });
  }, [ano, eventos, mesIndex, turmasPorEvento]);

  const buscaNormalizada = useMemo(() => normalizarBusca(busca), [busca]);

  const eventosFiltrados = useMemo(() => {
    if (!buscaNormalizada) {
      return eventosDoMes;
    }

    return eventosDoMes.filter((evento) => {
      const texto = normalizarBusca(
        [
          evento?.titulo,
          evento?.local,
          evento?.tipo,
          evento?.publico_alvo,
          evento?.descricao,
        ].join(" "),
      );

      return texto.includes(buscaNormalizada);
    });
  }, [buscaNormalizada, eventosDoMes]);

  const resumo = useMemo(() => {
    let programados = 0;
    let andamento = 0;
    let encerrados = 0;
    let turmas = 0;

    for (const evento of eventosDoMes) {
      const listaTurmas = turmasPorEvento?.[evento.id] || [];
      const status = statusEvento(evento, listaTurmas);

      if (status === "programado") {
        programados += 1;
      }
      if (status === "andamento") {
        andamento += 1;
      }
      if (status === "encerrado") {
        encerrados += 1;
      }

      turmas += listaTurmas.length;
    }

    return {
      total: eventosDoMes.length,
      programados,
      andamento,
      encerrados,
      turmas,
    };
  }, [eventosDoMes, turmasPorEvento]);

  const mesAnterior = useCallback(() => {
    setMesIndex((current) => {
      if (current > 0) {
        return current - 1;
      }

      setAno((anoAtual) => anoAtual - 1);
      return 11;
    });
  }, []);

  const mesProximo = useCallback(() => {
    setMesIndex((current) => {
      if (current < 11) {
        return current + 1;
      }

      setAno((anoAtual) => anoAtual + 1);
      return 0;
    });
  }, []);

  const voltarMesAtual = useCallback(() => {
    const agora = new Date();

    setAno(agora.getFullYear());
    setMesIndex(agora.getMonth());
  }, []);

  const irParaAcaoEvento = useCallback(
    (eventoId, acao) => {
      const id = Number(eventoId);

      if (!Number.isInteger(id) || id <= 0) {
        console.warn("[PainelGestor] evento_id inválido para navegação", {
          eventoId,
          acao,
        });
        return;
      }

      const rotas = {
        evento: `/gestao/evento?editar=${id}`,
        inscricao: `/gestao/cancelamento-inscricao?evento_id=${id}`,
        qrcode: `/gestao/qrcode?evento_id=${id}`,
        presenca: `/gestao/presenca?evento_id=${id}`,
        avaliacao: `/gestao/avaliacao?evento_id=${id}`,
        certificado: `/gestao/certificado?evento_id=${id}`,
      };

      navigate(rotas[acao] || rotas.evento);
    },
    [navigate],
  );

  const publicarEvento = useCallback(
    async (eventoId) => {
      const id = Number(eventoId);

      if (!Number.isInteger(id) || id <= 0) {
        console.warn("[PainelGestor] evento_id inválido para publicação", {
          eventoId,
        });
        return;
      }

      try {
        setAcaoEventoId(`${id}:publicar`);
        setLive("Publicando evento...");

        await apiEventoPublicar(id);

        if (!mountedRef.current) {
          return;
        }

        setEventos((listaAtual) =>
          listaAtual.map((evento) =>
            Number(evento.id) === id
              ? {
                  ...evento,
                  publicado: true,
                }
              : evento,
          ),
        );

        setLive("Evento publicado com sucesso.");
      } catch (error) {
        console.error("[PainelGestor] erro ao publicar evento", {
          eventoId: id,
          message: error?.message,
        });

        const message = getErrorMessage(error, "Erro ao publicar evento.");
        setErro(message);
        setLive(message);

        window.setTimeout(() => erroRef.current?.focus?.(), 0);
      } finally {
        if (mountedRef.current) {
          setAcaoEventoId(null);
        }
      }
    },
    [setLive],
  );

  const solicitarExcluirEvento = useCallback((evento) => {
    const id = Number(evento?.id);

    if (!Number.isInteger(id) || id <= 0) {
      console.warn("[PainelGestor] evento_id inválido para exclusão", {
        evento,
      });
      return;
    }

    setEventoParaExcluir(evento);
  }, []);

  const confirmarExcluirEvento = useCallback(async () => {
    const evento = eventoParaExcluir;
    const id = Number(evento?.id);

    if (!Number.isInteger(id) || id <= 0) {
      setEventoParaExcluir(null);
      return;
    }

    try {
      setAcaoEventoId(`${id}:excluir`);
      setLive("Excluindo evento...");

      await apiEventoExcluir(id);

      if (!mountedRef.current) {
        return;
      }

      setEventos((listaAtual) =>
        listaAtual.filter((item) => Number(item.id) !== id),
      );

      setTurmasPorEvento((atual) => {
        const proximo = { ...atual };
        delete proximo[id];
        return proximo;
      });

      setEventoParaExcluir(null);
      setLive("Evento excluído com sucesso.");
    } catch (error) {
      console.error("[PainelGestor] erro ao excluir evento", {
        eventoId: id,
        message: error?.message,
      });

      const message = getErrorMessage(error, "Erro ao excluir evento.");
      setErro(message);
      setLive(message);

      window.setTimeout(() => erroRef.current?.focus?.(), 0);
    } finally {
      if (mountedRef.current) {
        setAcaoEventoId(null);
      }
    }
  }, [eventoParaExcluir, setLive]);

  return (
    <>
      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <p
          ref={liveRef}
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
        />

        <HeaderHero
          titulo="Painel do Gestor"
          subtitulo="Central mensal de gestão dos eventos da Escola da Saúde, com acesso direto às ações administrativas de cada curso."
          icone={ShieldCheck}
          campanhaMes={mesIndex + 1}
          tamanho="lg"
          raio="xl"
          acoes={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={carregarEventos}
                disabled={carregando}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:bg-white/90 disabled:opacity-60"
              >
                <RefreshCw
                  className={cx("h-4 w-4", carregando && "animate-spin")}
                  aria-hidden="true"
                />
                Atualizar
              </button>
            </div>
          }
          isDark={isDark}
        />

        {carregando ? (
          <div
            className="sticky top-0 z-40 mt-4 h-1 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/30"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Carregando painel do gestor"
          >
            <div
              className={cx(
                "h-full w-1/3 rounded-full bg-emerald-600",
                reduceMotion ? "" : "animate-pulse",
              )}
            />
          </div>
        ) : null}

        <div className="mt-6 space-y-5">
          <MonthNavigator
            ano={ano}
            mesIndex={mesIndex}
            onAnterior={mesAnterior}
            onProximo={mesProximo}
            onHoje={voltarMesAtual}
            onAnoChange={(novoAno) => {
              if (
                Number.isInteger(novoAno) &&
                novoAno >= 2020 &&
                novoAno <= 2100
              ) {
                setAno(novoAno);
              }
            }}
          />

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={ClipboardList}
              label="Eventos no mês"
              value={resumo.total}
              hint="Com pelo menos uma aula na competência"
              tone="emerald"
            />

            <StatCard
              icon={GraduationCap}
              label="Turmas"
              value={resumo.turmas}
              hint="Turmas vinculadas aos eventos exibidos"
              tone="slate"
            />

            <StatCard
              icon={Sparkles}
              label="Em andamento"
              value={resumo.andamento}
              hint="Eventos ocorrendo no período atual"
              tone="amber"
            />

            <StatCard
              icon={CalendarDays}
              label="Programados"
              value={resumo.programados}
              hint="Eventos ainda não iniciados"
              tone="rose"
            />
          </section>

          <SearchPanel
            busca={busca}
            setBusca={setBusca}
            totalFiltrado={eventosFiltrados.length}
            totalMes={eventosDoMes.length}
          />

          {erro ? (
            <div
              ref={erroRef}
              tabIndex={-1}
              className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-rose-800 shadow-sm outline-none dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5" aria-hidden="true" />

                <div>
                  <p className="font-black">
                    Não foi possível carregar o painel.
                  </p>
                  <p className="mt-1 text-sm">{erro}</p>

                  <button
                    type="button"
                    onClick={carregarEventos}
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-rose-100 px-4 py-2 text-sm font-black text-rose-800 transition hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-100"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Tentar novamente
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section
            aria-label="Eventos da competência selecionada"
            className="space-y-4"
          >
            {carregando ? (
              <>
                <Skeleton height={190} className="rounded-[2rem]" />
                <Skeleton height={190} className="rounded-[2rem]" />
                <Skeleton height={190} className="rounded-[2rem]" />
              </>
            ) : null}

            {!carregando &&
              eventosFiltrados.map((evento) => (
                <EventCard
                  key={evento.id}
                  evento={evento}
                  turmas={turmasPorEvento?.[evento.id] || []}
                  onAcao={irParaAcaoEvento}
                  onPublicar={publicarEvento}
                  onExcluir={solicitarExcluirEvento}
                  acaoEventoId={acaoEventoId}
                />
              ))}

            {!carregando && eventosFiltrados.length === 0 ? (
              <EmptyState mesIndex={mesIndex} ano={ano} />
            ) : null}
          </section>
        </div>
      </main>

      <ConfirmExcluirEventoModal
        open={Boolean(eventoParaExcluir)}
        evento={eventoParaExcluir}
        loading={acaoEventoId === `${eventoParaExcluir?.id}:excluir`}
        onClose={() => {
          if (!acaoEventoId) {
            setEventoParaExcluir(null);
          }
        }}
        onConfirm={confirmarExcluirEvento}
      />

      <Footer />
    </>
  );
}
