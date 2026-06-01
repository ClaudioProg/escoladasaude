// ✅ frontend/src/pages/CalendarioBloqueiosAdmin.jsx — v2.1
// Atualizado em: 01/06/2026
//
// Plataforma Escola da Saúde
// Calendário institucional de bloqueios.
// HeaderHero limpo: sem botões, stats, filtros, trilhas ou badges.
// Ações, stats e navegação ficam abaixo do HeaderHero.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Info,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { useNavigate } from "react-router-dom";

import api from "../services/api";
import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";

/* =========================================================================
   Constantes
=========================================================================== */

const NOMES_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const TIPOS_OFICIAIS = [
  { value: "feriado_nacional", label: "Feriado nacional" },
  { value: "feriado_municipal", label: "Feriado municipal" },
  { value: "ponto_facultativo", label: "Ponto facultativo" },
  { value: "bloqueio_interno", label: "Bloqueio interno" },
];

const TIPOS_PERMITIDOS = new Set(TIPOS_OFICIAIS.map((tipo) => tipo.value));

const TIPO_LABEL = TIPOS_OFICIAIS.reduce((acc, tipo) => {
  acc[tipo.value] = tipo.label;
  return acc;
}, {});

const TIPO_STYLE = {
  feriado_nacional: {
    border: "border-rose-200 dark:border-rose-900/60",
    bg: "bg-rose-50 dark:bg-rose-950/20",
    text: "text-rose-800 dark:text-rose-200",
    hover: "hover:bg-rose-100 dark:hover:bg-rose-950/40",
    dot: "bg-rose-500",
    gradient: "from-rose-600 via-red-500 to-orange-500",
    soft:
      "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/25 dark:text-rose-100",
  },
  feriado_municipal: {
    border: "border-amber-200 dark:border-amber-900/60",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    text: "text-amber-800 dark:text-amber-200",
    hover: "hover:bg-amber-100 dark:hover:bg-amber-950/40",
    dot: "bg-amber-500",
    gradient: "from-amber-500 via-orange-400 to-yellow-500",
    soft:
      "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100",
  },
  ponto_facultativo: {
    border: "border-sky-200 dark:border-sky-900/60",
    bg: "bg-sky-50 dark:bg-sky-950/20",
    text: "text-sky-800 dark:text-sky-200",
    hover: "hover:bg-sky-100 dark:hover:bg-sky-950/40",
    dot: "bg-sky-500",
    gradient: "from-sky-600 via-cyan-500 to-blue-500",
    soft:
      "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/25 dark:text-sky-100",
  },
  bloqueio_interno: {
    border: "border-emerald-200 dark:border-emerald-900/60",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-800 dark:text-emerald-200",
    hover: "hover:bg-emerald-100 dark:hover:bg-emerald-950/40",
    dot: "bg-emerald-500",
    gradient: "from-emerald-600 via-teal-500 to-cyan-500",
    soft:
      "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100",
  },
};

/* =========================================================================
   Helpers
=========================================================================== */

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function hojeISOString() {
  const date = new Date();
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toISO(value) {
  return String(value || "").slice(0, 10);
}

function isYMD(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDataBR(value) {
  const iso = toISO(value);

  if (!isYMD(iso)) return "—";

  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function criarMatrixMes(ano, mesIndex) {
  const primeiroDia = new Date(ano, mesIndex, 1);
  const ultimoDia = new Date(ano, mesIndex + 1, 0);
  const primeiroDiaSemana = primeiroDia.getDay();
  const diasNoMes = ultimoDia.getDate();

  const semanas = [];
  let semanaAtual = new Array(7).fill(null);
  let dia = 1;

  for (let index = primeiroDiaSemana; index < 7; index += 1) {
    semanaAtual[index] = dia;
    dia += 1;
  }

  semanas.push(semanaAtual);

  while (dia <= diasNoMes) {
    semanaAtual = new Array(7).fill(null);

    for (let index = 0; index < 7 && dia <= diasNoMes; index += 1) {
      semanaAtual[index] = dia;
      dia += 1;
    }

    semanas.push(semanaAtual);
  }

  return semanas;
}

function normalizarTipo(value) {
  const tipo = String(value || "").trim().toLowerCase();

  return TIPOS_PERMITIDOS.has(tipo) ? tipo : null;
}

function normalizarDescricao(value) {
  const text = String(value ?? "").trim();

  return text ? text.slice(0, 2000) : null;
}

function unwrapArray(response) {
  if (Array.isArray(response)) return response;

  if (response?.data && typeof response.data === "object" && "ok" in response.data) {
    return Array.isArray(response.data.data) ? response.data.data : [];
  }

  if (response && typeof response === "object" && "ok" in response) {
    return Array.isArray(response.data) ? response.data : [];
  }

  if (Array.isArray(response?.data)) return response.data;

  return [];
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.erro ||
    error?.data?.message ||
    error?.message ||
    fallback
  );
}

function labelTipo(tipo) {
  return TIPO_LABEL[normalizarTipo(tipo)] || "Tipo inválido";
}

function styleTipo(tipo) {
  return TIPO_STYLE[normalizarTipo(tipo)] || TIPO_STYLE.bloqueio_interno;
}

function tipoValido(tipo) {
  return Boolean(normalizarTipo(tipo));
}

function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    error?.name === "CanceledError" ||
    error?.code === "ERR_CANCELED" ||
    String(error?.message || "").toLowerCase().includes("aborted") ||
    String(error?.message || "").toLowerCase().includes("canceled")
  );
}

/* =========================================================================
   Componentes locais
=========================================================================== */

function AlertBox({ type = "info", title, message, onClose }) {
  const config = {
    info: {
      icon: Info,
      className:
        "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100",
    },
    success: {
      icon: CheckCircle2,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100",
    },
    error: {
      icon: AlertCircle,
      className:
        "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-100",
    },
  };

  const item = config[type] || config.info;
  const Icon = item.icon;

  return (
    <div className={cx("rounded-2xl border px-4 py-3 text-sm", item.className)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          {title ? <p className="font-black">{title}</p> : null}
          <p className={title ? "mt-1" : ""}>{message}</p>
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1 transition hover:bg-white/40"
            aria-label="Fechar mensagem"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone = "bloqueio_interno" }) {
  const style = TIPO_STYLE[tone] || TIPO_STYLE.bloqueio_interno;

  return (
    <div className={cx("overflow-hidden rounded-2xl border shadow-sm", style.soft)}>
      <div className={`h-1.5 bg-gradient-to-r ${style.gradient}`} />

      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide opacity-75">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black">{value}</p>
        </div>

        {Icon ? (
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/70 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PainelOperacionalBloqueios({
  ano,
  mesIndex,
  statsMes,
  loading,
  onMesAnterior,
  onProximoMes,
  onHoje,
  onAtualizar,
  onVoltarAgenda,
  anosDisponiveis,
  setAno,
  setMesIndex,
}) {
  return (
    <section
      aria-label="Painel operacional do calendário de bloqueios"
      className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
              <Sparkles className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              Painel operacional
            </p>

            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              Mês visível:{" "}
              <strong className="text-slate-800 dark:text-zinc-100">
                {NOMES_MESES[mesIndex]} de {ano}
              </strong>{" "}
              • {statsMes.total} bloqueio(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onVoltarAgenda}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
            >
              Voltar para agenda
            </button>

            <button
              type="button"
              onClick={onHoje}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-white/5"
            >
              Hoje
            </button>

            <button
              type="button"
              onClick={onAtualizar}
              disabled={loading}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              <RefreshCcw
                className={cx("h-4 w-4", loading ? "animate-spin" : "")}
                aria-hidden="true"
              />
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/25 dark:text-indigo-100">
            <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600" />
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide opacity-75">
                  Total no mês
                </p>
                <p className="mt-1 text-2xl font-black">{statsMes.total}</p>
              </div>

              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/70 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </div>

          <KpiCard
            label="Nacionais"
            value={statsMes.feriado_nacional}
            icon={ShieldCheck}
            tone="feriado_nacional"
          />

          <KpiCard
            label="Municipais"
            value={statsMes.feriado_municipal}
            icon={ShieldCheck}
            tone="feriado_municipal"
          />

          <KpiCard
            label="Pontos facultativos"
            value={statsMes.ponto_facultativo}
            icon={Info}
            tone="ponto_facultativo"
          />

          <KpiCard
            label="Bloqueios internos"
            value={statsMes.bloqueio_interno}
            icon={Sparkles}
            tone="bloqueio_interno"
          />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={onMesAnterior}
                title="Mês anterior (←)"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="min-w-[170px] text-center">
                <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  Mês
                </p>
                <p className="text-base font-extrabold text-slate-900 dark:text-white sm:text-lg">
                  {NOMES_MESES[mesIndex]} {ano}
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={onProximoMes}
                title="Próximo mês (→)"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
              Todas as datas cadastradas aqui bloqueiam a agenda de salas nos
              períodos operacionais configurados.
            </p>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <select
                aria-label="Selecionar mês"
                className="min-h-[40px] rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                value={mesIndex}
                onChange={(event) => setMesIndex(Number(event.target.value))}
              >
                {NOMES_MESES.map((mes, index) => (
                  <option key={mes} value={index}>
                    {mes}
                  </option>
                ))}
              </select>

              <select
                aria-label="Selecionar ano"
                className="min-h-[40px] rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                value={ano}
                onChange={(event) => setAno(Number(event.target.value))}
              >
                {anosDisponiveis.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConfirmDeleteModal({ open, item, loading, onClose, onConfirm }) {
  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-0 grid place-items-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="excluir-bloqueio-title"
          className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
            <div>
              <h3
                id="excluir-bloqueio-title"
                className="text-lg font-extrabold text-slate-900 dark:text-white"
              >
                Excluir data?
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                Esta data deixará de bloquear a agenda de salas.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full border border-slate-200 p-2 transition hover:bg-slate-50 disabled:opacity-60 dark:border-zinc-800 dark:hover:bg-zinc-900"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="px-5 py-5">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/20">
              <p className="text-sm text-rose-800 dark:text-rose-200">
                <span className="font-extrabold">Data:</span>{" "}
                {formatDataBR(item.data)}
              </p>

              <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
                <span className="font-semibold">Tipo:</span> {labelTipo(item.tipo)}
              </p>

              {item.descricao ? (
                <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
                  <span className="font-semibold">Descrição:</span>{" "}
                  {String(item.descricao).trim()}
                </p>
              ) : null}
            </div>

            <p className="mt-4 text-sm text-slate-600 dark:text-zinc-300">
              Confirme apenas se realmente deseja liberar essa data no calendário institucional.
            </p>
          </div>

          <div className="flex justify-end gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold transition hover:bg-slate-50 disabled:opacity-60 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              Voltar
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              {loading ? "Excluindo..." : "Excluir data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Página
=========================================================================== */

export default function CalendarioBloqueiosAdmin() {
  const navigate = useNavigate();

  const hojeISO = useRef(hojeISOString()).current;
  const hoje = new Date();

  const [ano, setAno] = useState(hoje.getFullYear());
  const [mesIndex, setMesIndex] = useState(hoje.getMonth());

  const [loading, setLoading] = useState(false);
  const [calendario, setCalendario] = useState([]);

  const [formData, setFormData] = useState({
    id: null,
    data: "",
    tipo: "feriado_nacional",
    descricao: "",
  });

  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState({
    open: false,
    item: null,
  });
  const [deletingId, setDeletingId] = useState(null);

  const semanas = useMemo(() => criarMatrixMes(ano, mesIndex), [ano, mesIndex]);

  const anosDisponiveis = useMemo(() => {
    const year = new Date().getFullYear();

    return Array.from({ length: 9 }, (_, index) => year - 3 + index);
  }, []);

  const tipoRef = useRef(null);
  const liveRef = useRef(null);

  function setLive(texto) {
    if (liveRef.current) {
      liveRef.current.textContent = texto;
    }
  }

  function showMessage(payload) {
    setMensagem(payload);
    setLive(`${payload.title || ""} ${payload.message || ""}`.trim());
  }

  const carregar = useCallback(async (signal) => {
    setLoading(true);
    setLive("Carregando calendário de bloqueios.");

    try {
      const response = await api.get("/calendario", { signal });
      const lista = unwrapArray(response);

      setCalendario(
        lista
          .map((item) => ({
            ...item,
            data: toISO(item.data),
            tipo: normalizarTipo(item.tipo) || "bloqueio_interno",
            descricao: item.descricao || "",
          }))
          .filter((item) => item.data && item.tipo)
      );

      setLive("Calendário de bloqueios carregado.");
    } catch (error) {
      if (isAbortError(error)) return;

      console.error("[CalendarioBloqueiosAdmin][carregar]", error);

      showMessage({
        type: "error",
        title: "Erro ao carregar calendário",
        message: getErrorMessage(
          error,
          "Não foi possível carregar o calendário de bloqueios."
        ),
      });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    document.title = "Calendário de Bloqueios — Escola da Saúde";
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    carregar(controller.signal);

    return () => controller.abort();
  }, [carregar]);

  const mudarMes = useCallback(
    (delta) => {
      let novoMes = mesIndex + delta;
      let novoAno = ano;

      if (novoMes < 0) {
        novoMes = 11;
        novoAno -= 1;
      } else if (novoMes > 11) {
        novoMes = 0;
        novoAno += 1;
      }

      setMesIndex(novoMes);
      setAno(novoAno);
    },
    [ano, mesIndex]
  );

  useEffect(() => {
    function onKeyDown(event) {
      const tag = String(event?.target?.tagName || "").toLowerCase();

      if (["input", "select", "textarea"].includes(tag)) return;

      if (event.key === "ArrowLeft") mudarMes(-1);
      if (event.key === "ArrowRight") mudarMes(1);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mudarMes]);

  function irParaHoje() {
    const date = new Date();

    setAno(date.getFullYear());
    setMesIndex(date.getMonth());
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((old) => ({
      ...old,
      [name]: value,
    }));
  }

  function limparForm() {
    setFormData({
      id: null,
      data: "",
      tipo: "feriado_nacional",
      descricao: "",
    });

    setLive("Formulário limpo.");
  }

  function editarRegistro(registro) {
    const tipo = normalizarTipo(registro.tipo);

    setFormData({
      id: registro.id,
      data: toISO(registro.data),
      tipo: tipo || "bloqueio_interno",
      descricao: registro.descricao || "",
    });

    queueMicrotask(() => {
      tipoRef.current?.focus?.();
    });

    setLive("Registro carregado para edição.");
  }

  const existeDataTipo = useCallback(
    (dataISO, tipo, ignoreId = null) => {
      const normalized = normalizarTipo(tipo);

      return calendario.some(
        (item) =>
          item.data === dataISO &&
          normalizarTipo(item.tipo) === normalized &&
          String(item.id) !== String(ignoreId || "")
      );
    },
    [calendario]
  );

  async function onSubmit(event) {
    event.preventDefault();

    const payload = {
      data: toISO(formData.data),
      tipo: normalizarTipo(formData.tipo),
      descricao: normalizarDescricao(formData.descricao),
    };

    if (!isYMD(payload.data)) {
      showMessage({
        type: "error",
        title: "Data inválida",
        message: "Informe uma data válida no formato YYYY-MM-DD.",
      });
      return;
    }

    if (!tipoValido(payload.tipo)) {
      showMessage({
        type: "error",
        title: "Tipo inválido",
        message: "Selecione um dos tipos oficiais do calendário.",
      });
      return;
    }

    if (existeDataTipo(payload.data, payload.tipo, formData.id)) {
      showMessage({
        type: "info",
        title: "Registro já existente",
        message: "Já existe um registro com essa data e esse tipo.",
      });
      return;
    }

    setSalvando(true);
    setMensagem(null);
    setLive(formData.id ? "Atualizando data." : "Cadastrando data.");

    try {
      if (formData.id) {
        await api.put(`/calendario/${formData.id}`, payload);

        showMessage({
          type: "success",
          title: "Data atualizada",
          message: "O bloqueio foi atualizado com sucesso.",
        });
      } else {
        await api.post("/calendario", payload);

        showMessage({
          type: "success",
          title: "Data cadastrada",
          message: "O bloqueio foi cadastrado com sucesso.",
        });
      }

      await carregar();
      limparForm();
    } catch (error) {
      console.error("[CalendarioBloqueiosAdmin][salvar]", error);

      showMessage({
        type: "error",
        title: "Erro ao salvar data",
        message: getErrorMessage(error, "Não foi possível salvar a data."),
      });
    } finally {
      setSalvando(false);
    }
  }

  function solicitarExcluirRegistro(item) {
    if (!item?.id || deletingId) return;

    setConfirmDelete({
      open: true,
      item,
    });
  }

  function fecharExclusao() {
    if (deletingId) return;

    setConfirmDelete({
      open: false,
      item: null,
    });
  }

  async function executarExcluirRegistro() {
    const item = confirmDelete?.item;

    if (!item?.id) {
      fecharExclusao();
      return;
    }

    setDeletingId(item.id);
    setMensagem(null);
    setLive("Excluindo data do calendário.");

    try {
      await api.delete(`/calendario/${item.id}`);

      showMessage({
        type: "success",
        title: "Data excluída",
        message: "A data foi removida do calendário de bloqueios.",
      });

      await carregar();
      fecharExclusao();
    } catch (error) {
      console.error("[CalendarioBloqueiosAdmin][excluir]", error);

      showMessage({
        type: "error",
        title: "Erro ao excluir data",
        message: getErrorMessage(error, "Não foi possível excluir a data."),
      });
    } finally {
      setDeletingId(null);
    }
  }

  const calendarioPorData = useMemo(() => {
    const map = {};

    for (const item of calendario) {
      const key = toISO(item.data);

      if (!map[key]) map[key] = [];
      map[key].push(item);
    }

    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) =>
        String(a.tipo || "").localeCompare(String(b.tipo || ""), "pt-BR")
      );
    });

    return map;
  }, [calendario]);

  const statsMes = useMemo(() => {
    const month = pad2(mesIndex + 1);
    const prefix = `${ano}-${month}-`;

    const itens = calendario.filter((item) =>
      String(item.data || "").startsWith(prefix)
    );

    const byTipo = {
      feriado_nacional: 0,
      feriado_municipal: 0,
      ponto_facultativo: 0,
      bloqueio_interno: 0,
    };

    for (const item of itens) {
      const tipo = normalizarTipo(item.tipo);

      if (tipo && byTipo[tipo] != null) {
        byTipo[tipo] += 1;
      }
    }

    return {
      total: itens.length,
      ...byTipo,
    };
  }, [calendario, ano, mesIndex]);

  function prefillDia(dateISO) {
    setFormData((current) => ({
      ...current,
      data: dateISO,
    }));

    queueMicrotask(() => {
      tipoRef.current?.focus?.();
    });

    setLive(`Data ${formatDataBR(dateISO)} preenchida no formulário.`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-zinc-100">
      <p ref={liveRef} className="sr-only" aria-live="polite" />

      <HeaderHero
        titulo="Feriados e Bloqueios da Agenda"
        subtitulo="Gerencie datas que deixam Auditório e Sala de Reunião indisponíveis na agenda institucional."
        icone={CalendarDays}
      />

      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:py-8"
      >
        <PainelOperacionalBloqueios
          ano={ano}
          mesIndex={mesIndex}
          statsMes={statsMes}
          loading={loading}
          onMesAnterior={() => mudarMes(-1)}
          onProximoMes={() => mudarMes(1)}
          onHoje={irParaHoje}
          onAtualizar={() => carregar()}
          onVoltarAgenda={() => navigate("/admin/agenda-salas")}
          anosDisponiveis={anosDisponiveis}
          setAno={setAno}
          setMesIndex={setMesIndex}
        />

        {mensagem ? (
          <AlertBox
            type={mensagem.type}
            title={mensagem.title}
            message={mensagem.message}
            onClose={() => setMensagem(null)}
          />
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
            Carregando calendário de bloqueios...
          </div>
        ) : null}

        <section
          aria-label="Orientações do calendário de bloqueios"
          className="rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200"
        >
          <div className="flex items-start gap-2">
            <Info
              className="mt-0.5 h-4 w-4 flex-none text-emerald-700 dark:text-emerald-300"
              aria-hidden="true"
            />

            <p>
              Todas as datas cadastradas aqui são consideradas{" "}
              <strong>indisponíveis</strong> na Agenda de Salas para Auditório
              e Sala de Reunião, nos períodos da manhã e da tarde.
            </p>
          </div>
        </section>

        <section
          aria-label="Legenda dos tipos de bloqueio"
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="mb-3">
            <p className="text-sm font-black text-slate-950 dark:text-white">
              Tipos oficiais
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Contrato único aceito pelo banco e pelo backend.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {TIPOS_OFICIAIS.map((tipo) => (
              <span
                key={tipo.value}
                className={cx(
                  "inline-flex items-center gap-2 rounded-full border bg-white px-2.5 py-1 text-slate-700 dark:bg-zinc-900 dark:text-zinc-200",
                  TIPO_STYLE[tipo.value]?.border
                )}
                title={tipo.label}
              >
                <span
                  className={cx("h-2 w-2 rounded-full", TIPO_STYLE[tipo.value]?.dot)}
                  aria-hidden="true"
                />
                {tipo.label}
              </span>
            ))}
          </div>
        </section>

        <section
          aria-label="Formulário de cadastro e edição"
          className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {formData.id ? "Editar data do calendário" : "Cadastrar nova data"}
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                Use apenas os tipos oficiais aceitos pelo banco e pelo backend v2.0.
              </p>
            </div>

            {formData.id ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-200">
                Editando #{formData.id}
              </span>
            ) : null}
          </div>

          <form
            onSubmit={onSubmit}
            className="grid grid-cols-1 gap-3 lg:grid-cols-[170px_1fr] lg:items-end"
          >
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                Data
              </span>

              <input
                type="date"
                name="data"
                value={formData.data}
                onChange={handleChange}
                className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                required
                aria-required="true"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                Tipo
              </span>

              <select
                ref={tipoRef}
                name="tipo"
                value={formData.tipo}
                onChange={handleChange}
                className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                required
                aria-required="true"
              >
                {TIPOS_OFICIAIS.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block lg:col-span-2">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                Descrição
              </span>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  name="descricao"
                  value={formData.descricao}
                  onChange={handleChange}
                  placeholder="Ex.: Véspera de Natal, recesso administrativo, manutenção interna..."
                  className="h-11 flex-1 rounded-2xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={salvando}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    aria-busy={salvando ? "true" : "false"}
                  >
                    {salvando ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {salvando ? "Salvando..." : formData.id ? "Atualizar" : "Cadastrar"}
                  </button>

                  <button
                    type="button"
                    onClick={limparForm}
                    className="h-11 rounded-2xl border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    title="Limpar formulário"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            </label>
          </form>
        </section>

        <section
          aria-label="Calendário com bloqueios"
          className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs dark:border-zinc-800 dark:bg-zinc-800/50 sm:text-sm">
            {DIAS_SEMANA.map((dia) => (
              <div
                key={dia}
                className="py-2.5 text-center font-bold uppercase tracking-wide text-slate-600 dark:text-zinc-300"
              >
                {dia}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="p-4">
              <Skeleton height={120} count={3} />
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {semanas.map((semana, idxSemana) => (
                <div key={idxSemana} className="grid grid-cols-7">
                  {semana.map((dia, idxDia) => {
                    if (!dia) {
                      return (
                        <div
                          key={`${idxSemana}-${idxDia}`}
                          className="min-h-[100px] border-r border-slate-100 bg-slate-50/40 dark:border-zinc-800 dark:bg-zinc-900/30"
                        />
                      );
                    }

                    const dataISO = `${ano}-${pad2(mesIndex + 1)}-${pad2(dia)}`;
                    const eventosDia = calendarioPorData[dataISO] || [];
                    const eHoje = dataISO === hojeISO;

                    return (
                      <div
                        key={`${idxSemana}-${idxDia}`}
                        className="flex min-h-[115px] flex-col border-r border-slate-100 p-1.5 focus-within:ring-2 focus-within:ring-emerald-500/60 dark:border-zinc-800 sm:min-h-[140px] sm:p-2"
                      >
                        <div className="mb-1 flex items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={() => prefillDia(dataISO)}
                            className={cx(
                              "rounded px-1 py-0.5 text-left text-xs font-black sm:text-sm",
                              eHoje
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                                : "text-slate-700 dark:text-zinc-200"
                            )}
                            title="Preencher data no formulário"
                          >
                            {dia}
                          </button>

                          {eventosDia.length > 0 ? (
                            <span
                              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-700 dark:bg-zinc-800 dark:text-zinc-200"
                              title={`${eventosDia.length} registro(s) neste dia`}
                            >
                              {eventosDia.length}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 flex flex-col gap-1">
                          {eventosDia.map((evento) => {
                            const style = styleTipo(evento.tipo);
                            const disabledDelete = deletingId === evento.id;

                            return (
                              <div
                                key={evento.id}
                                className={cx(
                                  "group rounded-xl border px-2 py-1.5 text-[11px] sm:text-xs",
                                  style.border,
                                  style.bg
                                )}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <button
                                    type="button"
                                    onClick={() => editarRegistro(evento)}
                                    className={cx("text-left font-black", style.text)}
                                    title="Editar registro"
                                  >
                                    {labelTipo(evento.tipo)}
                                  </button>

                                  <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() => editarRegistro(evento)}
                                      className={cx("rounded p-0.5", style.hover)}
                                      title="Editar"
                                      aria-label="Editar registro"
                                    >
                                      <Edit2 className={cx("h-3 w-3", style.text)} />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => solicitarExcluirRegistro(evento)}
                                      disabled={disabledDelete}
                                      className="rounded p-0.5 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-red-900/30"
                                      title="Excluir"
                                      aria-label="Excluir registro"
                                    >
                                      {disabledDelete ? (
                                        <Loader2
                                          className="h-3 w-3 animate-spin text-red-600 dark:text-red-400"
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Trash2
                                          className="h-3 w-3 text-red-600 dark:text-red-400"
                                          aria-hidden="true"
                                        />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {evento.descricao ? (
                                  <p
                                    className={cx(
                                      "mt-1 text-[10px] leading-snug",
                                      style.text
                                    )}
                                  >
                                    {String(evento.descricao)}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />

      <ConfirmDeleteModal
        open={confirmDelete.open}
        item={confirmDelete.item}
        loading={Boolean(deletingId)}
        onClose={fecharExclusao}
        onConfirm={executarExcluirRegistro}
      />
    </div>
  );
}