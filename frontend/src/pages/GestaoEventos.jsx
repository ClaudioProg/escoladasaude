// eslint-disable no-console */
// ✅ frontend/src/pages/GestaoEventos.jsx — v2.0
// 02/06/2026
// Plataforma Escola da Saúde
//
// Página administrativa premium de criação/edição de evento.
// Layout refatorado para ser mais compacto e "singelo".

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Layers3,
  Lock,
  MapPin,
  Paperclip,
  Pencil,
  PlusCircle,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  UploadCloud,
  Users,
  X,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import ModalTurma from "../components/eventos/ModalTurma";
import ModalQuestionarioEvento from "../components/eventos/ModalQuestionarioEvento";
import EditorPreTesteEvento from "../components/eventos/EditorPreTesteEvento";

import EventoService, {
  EVENTO_RESTRITO_MODO,
  calcularCargaHorariaPorDatas,
  extractIds,
  getEventoFolderUrl,
  getEventoProgramacaoUrl,
  hhmm,
  normalizeDatasTurma,
  toPositiveIntOrNull,
  ymd,
} from "../services/eventoService";

import { apiGet, apiLookupCargo, apiLookupUnidade } from "../services/api";

/* ─────────────────────────────────────────────────────────────
   Config
────────────────────────────────────────────────────────────── */

const IS_DEV = Boolean(import.meta?.env?.DEV);

const TIPOS_EVENTO = [
  "Congresso",
  "Curso",
  "Oficina",
  "Palestra",
  "Seminário",
  "Simpósio",
  "Outros",
];

const ETAPAS_EVENTO = Object.freeze([
  "Informações básicas",
  "Inscrição e público",
  "Conteúdo e materiais",
  "Avaliações",
  "Revisão e publicação",
]);

const MAX_FOLDER_MB = 2;
const MAX_FOLDER_BYTES = MAX_FOLDER_MB * 1024 * 1024;

const MAX_PROGRAMACAO_MB = 15;
const MAX_PROGRAMACAO_BYTES = MAX_PROGRAMACAO_MB * 1024 * 1024;

const EVENTO_LIMITES = Object.freeze({
  titulo: 150,
  local: 100,
  descricao: 5000,
  publico_alvo: 200,
  conteudo_programatico: 6000,
  termo_titulo: 180,
  termo_conteudo_html: 30000,
});

const RESTRICAO_UI = Object.freeze({
  TODOS_SERVIDORES: "todos_servidores",
  LISTA_REGISTROS: "lista_registros",
  CARGOS: "cargos",
  UNIDADES: "unidades",
});

const TESTE_DEFAULT = {
  titulo: "",
  nota_minima: 7,
  tentativas: 1,
  tempo_minutos: 30,
  questionario_id: null,
  questoes_count: 0,
  peso_total: 0,
  publicado: false,
};

let cacheUnidades = null;
let cacheorganizadores = null;
let cacheCargos = null;

/* ─────────────────────────────────────────────────────────────
   Logger
────────────────────────────────────────────────────────────── */

function warnDev(...args) {
  if (IS_DEV) {
    console.warn("[GestaoEventos]", ...args);
  }
}

/* ─────────────────────────────────────────────────────────────
   Helpers gerais
────────────────────────────────────────────────────────────── */

function asArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.data)) {
    return value.data;
  }
  if (Array.isArray(value?.rows)) {
    return value.rows;
  }
  if (Array.isArray(value?.items)) {
    return value.items;
  }
  if (Array.isArray(value?.results)) {
    return value.results;
  }
  if (Array.isArray(value?.unidades)) {
    return value.unidades;
  }
  if (Array.isArray(value?.usuarios)) {
    return value.usuarios;
  }
  if (Array.isArray(value?.cargos)) {
    return value.cargos;
  }
  if (Array.isArray(value?.data?.rows)) {
    return value.data.rows;
  }
  if (Array.isArray(value?.data?.items)) {
    return value.data.items;
  }
  if (Array.isArray(value?.data?.results)) {
    return value.data.results;
  }
  return [];
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function parseRegistrosBulk(value) {
  const chunks = String(value || "").match(/\d+/g) || [];
  const registros = [];

  for (const chunk of chunks) {
    const clean = onlyDigits(chunk);

    if (clean.length === 6) {
      registros.push(clean);
      continue;
    }

    if (clean.length > 6) {
      for (let i = 0; i + 6 <= clean.length; i += 6) {
        const part = clean.slice(i, i + 6);
        if (/^\d{6}$/.test(part)) {
          registros.push(part);
        }
      }
    }
  }

  return [...new Set(registros)];
}

function formatDateBr(value) {
  const date = ymd(value);
  if (!date) {
    return "—";
  }

  const [, mes, dia] = date.split("-");
  const ano = date.slice(0, 4);

  return `${dia}/${mes}/${ano}`;
}

function minDate(datas = []) {
  return (datas || [])
    .map((item) => ymd(item?.data || item))
    .filter(Boolean)
    .sort()[0];
}

function maxDate(datas = []) {
  return (datas || [])
    .map((item) => ymd(item?.data || item))
    .filter(Boolean)
    .sort()
    .at(-1);
}

function fileIsImage(file) {
  return Boolean(file && ["image/png", "image/jpeg"].includes(file.type));
}

function fileIsPdf(file) {
  return Boolean(file && file.type === "application/pdf");
}

function eventoTemFolder(evento) {
  return Boolean(
    evento?.folder_kind === "blob" ||
    evento?.tem_folder ||
    evento?.folder_size ||
    evento?.folder_updated_at,
  );
}

function eventoTemProgramacao(evento) {
  return Boolean(
    evento?.programacao_kind === "blob" ||
    evento?.tem_programacao ||
    evento?.programacao_pdf_size ||
    evento?.programacao_pdf_updated_at,
  );
}

/* ─────────────────────────────────────────────────────────────
   Helpers de turma
────────────────────────────────────────────────────────────── */

const RAFAELLA_PITOL_ID = 17;
const FABIO_LOPEZ_ID = 2474;
const MAX_ASSINANTES_TURMA = 3;

function normalizarPalestrantesTurma(value = []) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { nome: String(item || "").trim(), usuario_id: null };
      }
      return {
        nome: String(item?.nome || "").trim(),
        usuario_id: toPositiveIntOrNull(item?.usuario_id),
      };
    })
    .filter((item) => item.nome || item.usuario_id);
}

function normalizarAssinantesTurma(value = []) {
  const ids = extractIds(value);
  const temFabio = ids.includes(FABIO_LOPEZ_ID);

  const extras = ids.filter(
    (id) => id !== RAFAELLA_PITOL_ID && id !== FABIO_LOPEZ_ID,
  );

  const base = extras.slice(0, temFabio ? 1 : 2);

  if (temFabio) {
    return [...base, RAFAELLA_PITOL_ID, FABIO_LOPEZ_ID];
  }

  return [...base, RAFAELLA_PITOL_ID];
}

function normalizarTurmaParaEstado(turma = {}) {
  const datas = normalizeDatasTurma(turma);
  const organizadores = extractIds(
    turma?.organizadores || turma?.organizador || [],
  );
  const palestrantes = normalizarPalestrantesTurma(turma?.palestrantes || []);
  const assinantes = normalizarAssinantesTurma(turma?.assinantes || []);

  const cargaRaw = Number(turma?.carga_horaria);
  const cargaHoraria =
    Number.isInteger(cargaRaw) && cargaRaw > 0
      ? cargaRaw
      : calcularCargaHorariaPorDatas(datas);

  const vagasRaw = Number(turma?.vagas_total ?? turma?.vagas);
  const vagasTotal = Number.isInteger(vagasRaw) && vagasRaw >= 0 ? vagasRaw : 0;

  return {
    ...(toPositiveIntOrNull(turma?.id) ? { id: Number(turma.id) } : {}),

    nome: String(turma?.nome || "Turma").trim(),
    vagas_total: vagasTotal,
    carga_horaria: cargaHoraria,
    datas,

    data_inicio: datas[0]?.data || ymd(turma?.data_inicio) || "",
    data_fim: datas.at(-1)?.data || ymd(turma?.data_fim) || "",
    horario_inicio:
      datas[0]?.horario_inicio ||
      hhmm(turma?.horario_inicio || "08:00", "08:00"),
    horario_fim:
      datas[0]?.horario_fim || hhmm(turma?.horario_fim || "17:00", "17:00"),

    organizadores,
    palestrantes,
    assinantes,
  };
}

function normalizarTurmasParaPayload(turmas = []) {
  return (Array.isArray(turmas) ? turmas : [])
    .map((turma) => {
      const normalizada = normalizarTurmaParaEstado(turma);

      return {
        ...(normalizada.id ? { id: normalizada.id } : {}),
        nome: normalizada.nome,
        vagas_total: Number(normalizada.vagas_total) || 0,
        carga_horaria: Number(normalizada.carga_horaria) || 0,

        datas: normalizada.datas.map((d) => ({
          data: d.data,
          horario_inicio: d.horario_inicio,
          horario_fim: d.horario_fim,
        })),

        organizadores: extractIds(normalizada.organizadores),
        palestrantes: normalizarPalestrantesTurma(normalizada.palestrantes),
        assinantes: normalizarAssinantesTurma(normalizada.assinantes),
      };
    })
    .filter((turma) => turma.nome && turma.datas.length);
}

/* ─────────────────────────────────────────────────────────────
   Helpers de restrição
────────────────────────────────────────────────────────────── */

function extractCargoIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            return item.id ?? item.cargo_id ?? item.value;
          }
          return item;
        })
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}

function cargoLabel(cargo) {
  if (!cargo) {
    return "";
  }
  if (typeof cargo === "string") {
    return cargo;
  }

  return String(
    cargo.nome || cargo.descricao || cargo.cargo || cargo.label || "",
  ).trim();
}

function normalizarCargosParaEstado(evento = {}) {
  const ids = extractCargoIds(
    evento?.cargos_permitidos_ids ||
      evento?.cargos_permitidos ||
      evento?.cargos ||
      [],
  );

  if (ids.length) {
    return ids;
  }

  return extractCargoIds(evento?.cargos_permitidos || []);
}

function normalizarUnidadesParaEstado(evento = {}) {
  return extractIds(
    evento?.unidades_permitidas_ids ||
      evento?.unidades_permitidas ||
      evento?.unidades ||
      [],
  );
}

function inferirModoRestricaoUi(evento = {}) {
  if (!evento?.restrito) {
    return "";
  }

  if (evento?.restrito_modo === EVENTO_RESTRITO_MODO.TODOS_SERVIDORES) {
    return RESTRICAO_UI.TODOS_SERVIDORES;
  }

  if (evento?.restrito_modo === EVENTO_RESTRITO_MODO.LISTA_REGISTROS) {
    return RESTRICAO_UI.LISTA_REGISTROS;
  }

  const cargoIds = normalizarCargosParaEstado(evento);
  if (cargoIds.length) {
    return RESTRICAO_UI.CARGOS;
  }

  const unidadeIds = normalizarUnidadesParaEstado(evento);
  if (unidadeIds.length) {
    return RESTRICAO_UI.UNIDADES;
  }

  return RESTRICAO_UI.TODOS_SERVIDORES;
}

/* ─────────────────────────────────────────────────────────────
   UI helpers (Ajustados para menor escala)
────────────────────────────────────────────────────────────── */

function Chip({ tone = "zinc", children, title }) {
  const map = {
    zinc: "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-200 dark:border-zinc-700",
    emerald:
      "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800",
    indigo:
      "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-800",
    amber:
      "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800",
    rose: "bg-rose-100 text-rose-900 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800",
    sky: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800",
    violet:
      "bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-800",
  };

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        map[tone] || map.zinc
      }`}
    >
      {children}
    </span>
  );
}

function ActionButton({
  children,
  type = "button",
  tone = "neutral",
  size = "md",
  className = "",
  disabled = false,
  ...props
}) {
  const toneMap = {
    neutral:
      "bg-slate-200 hover:bg-slate-300 text-slate-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-100 focus:ring-slate-400/60",
    success:
      "bg-emerald-700 hover:bg-emerald-600 text-white focus:ring-emerald-500/60",
    info: "bg-indigo-700 hover:bg-indigo-600 text-white focus:ring-indigo-500/60",
    warning:
      "bg-amber-600 hover:bg-amber-500 text-white focus:ring-amber-400/60",
    danger: "bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-400/60",
  };

  // Ajustado o padding para deixar os botões mais compactos
  const sizeMap = {
    xs: "rounded-lg px-2.5 py-1.5 text-[11px]",
    sm: "rounded-xl px-3 py-1.5 text-xs",
    md: "rounded-xl px-3.5 py-2 text-sm",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-1.5 font-bold shadow-sm transition active:scale-[0.99]",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
        "disabled:cursor-not-allowed disabled:opacity-60",
        toneMap[tone] || toneMap.neutral,
        sizeMap[size] || sizeMap.md,
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

// SectionCard agora usa paddings menores (p-3 sm:p-4) e arredondamentos menores
function SectionCard({ id, icon: Icon, title, subtitle, children, show = true }) {
  if (!show) {
    return null;
  }

  return (
    <section
      id={id}
      className="scroll-mt-3 rounded-2xl border border-black/10 bg-white/75 p-3 shadow-sm dark:border-white/10 dark:bg-zinc-900/45 sm:p-4"
    >
      <div className="mb-3 flex items-start gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/5">
          <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        </span>

        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white sm:text-base">
            {title}
          </h3>

          {subtitle && (
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}

function FieldLabel({ htmlFor, children, required = false }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-bold text-zinc-800 dark:text-zinc-200"
    >
      {children} {required && <span className="text-rose-600">*</span>}
    </label>
  );
}

function CampoContador({ value, max }) {
  const atual = String(value || "").length;
  const percentual = max > 0 ? atual / max : 0;

  const cor =
    atual >= max
      ? "text-rose-600 dark:text-rose-400"
      : percentual >= 0.85
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-500 dark:text-zinc-500";

  return (
    <p className={`mt-1 text-right text-[10px] font-black ${cor}`}>
      {atual}/{max}
    </p>
  );
}

function limitarTexto(value, max) {
  return String(value || "").slice(0, max);
}

function SelectInput(props) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-xl border border-black/10 bg-white px-2.5 py-2 text-sm shadow-sm outline-none",
        "focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white",
        props.className || "",
      ].join(" ")}
    />
  );
}

function TextInput({ icon: Icon, className = "", ...props }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        />
      )}

      <input
        {...props}
        className={[
          "w-full rounded-xl border border-black/10 bg-white py-2 pr-3 text-sm shadow-sm outline-none",
          "focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white",
          Icon ? "pl-9" : "pl-3",
          className,
        ].join(" ")}
      />
    </div>
  );
}

function TextArea({ icon: Icon, className = "", ...props }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-zinc-400"
          aria-hidden="true"
        />
      )}

      <textarea
        {...props}
        className={[
          "min-h-20 w-full rounded-xl border border-black/10 bg-white py-2 pr-3 text-sm shadow-sm outline-none",
          "focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white",
          Icon ? "pl-9" : "pl-3",
          className,
        ].join(" ")}
      />
    </div>
  );
}

function ConfirmacaoViewport({
  open,
  titulo,
  descricao,
  confirmarTexto = "Confirmar",
  cancelarTexto = "Cancelar",
  danger = false,
  onClose,
  onConfirm,
}) {
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gestao-eventos-confirmacao-titulo"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar confirmação"
        onClick={onClose}
      />

      <section className="relative w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div
          className={[
            "h-1.5",
            danger
              ? "bg-gradient-to-r from-rose-600 via-red-500 to-orange-500"
              : "bg-gradient-to-r from-emerald-600 via-teal-500 to-indigo-500",
          ].join(" ")}
          aria-hidden="true"
        />

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span
              className={[
                "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                danger
                  ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900/60"
                  : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900/60",
              ].join(" ")}
              aria-hidden="true"
            >
              <Trash2 className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              <h2
                id="gestao-eventos-confirmacao-titulo"
                className="text-lg font-black text-slate-950 dark:text-white"
              >
                {titulo}
              </h2>

              {descricao ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                  {descricao}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/70 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {cancelarTexto}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={[
              "inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-sm font-black text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2",
              danger
                ? "bg-rose-700 hover:bg-rose-800 focus-visible:ring-rose-500"
                : "bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-500",
            ].join(" ")}
          >
            {confirmarTexto}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/* ─────────────────────────────────────────────────────────────
   Componente Principal
────────────────────────────────────────────────────────────── */

export default function GestaoEventos() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const eventoIdParam = toPositiveIntOrNull(
    searchParams.get("editar") ||
      searchParams.get("evento_id") ||
      searchParams.get("id"),
  );

  const effectiveOpen = true;

  const [evento, setEvento] = useState(null);
  const [carregandoEvento, setCarregandoEvento] = useState(
    Boolean(eventoIdParam),
  );
  const [erroEvento, setErroEvento] = useState("");
  const [salvando, setSalvando] = useState(false);

  const onClose = useCallback(() => {
    navigate("/administrador");
  }, [navigate]);

  const onTurmaRemovida = useCallback(() => {
    // A remoção operacional é validada no backend ao salvar.
  }, []);

  const uid = useId();
  const titleId = `modal-evento-titulo-${uid}`;
  const descId = `modal-evento-desc-${uid}`;
  const formId = `form-evento-${uid}`;

  const closeBlocked = Boolean(salvando);

  const [isPending, startTransition] = useTransition();

  const folderInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const prevEventoKeyRef = useRef(null);
  const proximaEtapaAposSalvarRef = useRef(null);

  const etapaParam = Number(searchParams.get("etapa"));
  const [etapaAtual, setEtapaAtual] = useState(
    Number.isInteger(etapaParam) && etapaParam >= 1 && etapaParam <= 5
      ? etapaParam
      : 1,
  );
  const [preTesteResumo, setPreTesteResumo] = useState(null);
  const [carregandoPreTesteResumo, setCarregandoPreTesteResumo] =
    useState(false);
  const [preTesteResumoErro, setPreTesteResumoErro] = useState("");
  const handlePreTesteChange = useCallback((configuracao) => {
    setPreTesteResumo(configuracao);
    setPreTesteResumoErro("");
  }, []);

  useEffect(() => {
    const eventoId = toPositiveIntOrNull(eventoIdParam);
    if (!eventoId) {
      setPreTesteResumo(null);
      setPreTesteResumoErro("");
      setCarregandoPreTesteResumo(false);
      return undefined;
    }

    let ativo = true;
    setCarregandoPreTesteResumo(true);
    setPreTesteResumoErro("");

    EventoService.preTeste.admin
      .carregar(eventoId)
      .then((configuracao) => {
        if (ativo) {
          setPreTesteResumo({
            ...configuracao,
            selecionado: Boolean(
              configuracao?.ativo || configuracao?.rascunho,
            ),
          });
        }
      })
      .catch(() => {
        if (ativo) {
          setPreTesteResumo(null);
          setPreTesteResumoErro(
            "Não foi possível confirmar a configuração do pré-teste.",
          );
        }
      })
      .finally(() => {
        if (ativo) {
          setCarregandoPreTesteResumo(false);
        }
      });

    return () => {
      ativo = false;
    };
  }, [eventoIdParam]);

  const recarregarEvento = useCallback(async () => {
    if (!eventoIdParam) {
      setEvento(null);
      setCarregandoEvento(false);
      setErroEvento("");
      return null;
    }

    try {
      setCarregandoEvento(true);
      setErroEvento("");

      const completo = await EventoService.admin.buscarCompleto(eventoIdParam, {
        on401: "redirect",
        on403: "silent",
      });

      if (!completo?.id) {
        throw new Error("Evento não encontrado.");
      }

      setEvento(completo);
      return completo;
    } catch (error) {
      const message =
        error?.data?.message ||
        error?.response?.data?.message ||
        error?.message ||
        "Não foi possível carregar o evento para edição.";

      setErroEvento(message);
      toast.error(message);
      return null;
    } finally {
      setCarregandoEvento(false);
    }
  }, [eventoIdParam]);

  useEffect(() => {
    recarregarEvento();
  }, [recarregarEvento]);

  const handleSalvarEvento = useCallback(
    async (payload, { publicar = false } = {}) => {
      if (salvando) {
        return;
      }

      try {
        setSalvando(true);
        const id = toPositiveIntOrNull(payload?.id || eventoIdParam);
        const etapaAposSalvar = proximaEtapaAposSalvarRef.current;
        let response = null;

        let eventoIdSalvo = id;

        if (id) {
          response = await EventoService.admin.atualizar(
            id,
            { ...payload, baseServidor: evento },
            {},
            { on401: "redirect", on403: "silent" },
          );
        } else {
          response = await EventoService.admin.criar(
            payload,
            {},
            { on401: "redirect", on403: "silent" },
          );

          eventoIdSalvo = toPositiveIntOrNull(
            response?.data?.id || response?.id || response?.evento_id,
          );
        }

        if (!eventoIdSalvo) {
          throw new Error("Não foi possível identificar o evento salvo.");
        }

        if (publicar) {
          await EventoService.admin.publicar(
            eventoIdSalvo,
            {
              pre_teste: {
                habilitado: Boolean(preTesteResumo?.selecionado),
              },
            },
            { on401: "redirect", on403: "silent" },
          );
          toast.success("Evento publicado com sucesso.");
        } else {
          toast.success("Rascunho salvo com sucesso.");
        }

        if (id) {
          await recarregarEvento();
          if (etapaAposSalvar) {
            setEtapaAtual(etapaAposSalvar);
          }
        } else {
          const etapaDestino = etapaAposSalvar || etapaAtual;
          setEtapaAtual(etapaDestino);
          navigate(
            `/gestao/evento?editar=${eventoIdSalvo}&etapa=${etapaDestino}`,
            { replace: true },
          );
        }
        return response;
      } catch (error) {
        const message =
          error?.data?.message ||
          error?.response?.data?.message ||
          error?.message ||
          "Não foi possível salvar o evento.";

        toast.error(message);
        return null;
      } finally {
        proximaEtapaAposSalvarRef.current = null;
        setSalvando(false);
      }
    },
    [
      etapaAtual,
      evento,
      eventoIdParam,
      navigate,
      preTesteResumo?.selecionado,
      recarregarEvento,
      salvando,
    ],
  );

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [local, setLocal] = useState("");
  const [tipo, setTipo] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [publicoAlvo, setPublicoAlvo] = useState("");
  const [conteudoProgramatico, setConteudoProgramatico] = useState("");
  const [termoAtivo, setTermoAtivo] = useState(false);
  const [termoTitulo, setTermoTitulo] = useState("");
  const [termoConteudoHtml, setTermoConteudoHtml] = useState("");

  const termoBloqueado = Boolean(evento?.termo_bloqueado);

  const [unidades, setUnidades] = useState([]);
  const [organizadoresDisponiveis, setorganizadoresDisponiveis] = useState([]);
  const [cargosDisponiveis, setCargosDisponiveis] = useState([]);

  const [carregandoAuxiliares, setCarregandoAuxiliares] = useState(false);

  const [turmas, setTurmas] = useState([]);
  const [editandoTurmaIndex, setEditandoTurmaIndex] = useState(null);
  const [modalTurmaAberto, setModalTurmaAberto] = useState(false);

  const [confirmTurma, setConfirmTurma] = useState({
    open: false,
    idx: null,
    turma: null,
  });

  const [restrito, setRestrito] = useState(false);
  const [restricaoUi, setRestricaoUi] = useState("");

  const [registroInput, setRegistroInput] = useState("");
  const [registrosPermitidos, setRegistrosPermitidos] = useState([]);

  const [cargoAddId, setCargoAddId] = useState("");
  const [cargosPermitidos, setCargosPermitidos] = useState([]);

  const [unidadeAddId, setUnidadeAddId] = useState("");
  const [unidadesPermitidas, setUnidadesPermitidas] = useState([]);

  const [folderFile, setFolderFile] = useState(null);
  const [folderPreview, setFolderPreview] = useState("");
  const [removerFolderExistente, setRemoverFolderExistente] = useState(false);

  const [programacaoFile, setProgramacaoFile] = useState(null);
  const [removerProgramacaoExistente, setRemoverProgramacaoExistente] =
    useState(false);

  const [testeObrigatorio, setTesteObrigatorio] = useState(false);
  const [testeConfig, setTesteConfig] = useState(TESTE_DEFAULT);
  const [modalQuestionarioAberto, setModalQuestionarioAberto] = useState(false);

  const folderExistenteUrl = useMemo(() => {
    if (!evento?.id || removerFolderExistente || folderFile) {
      return "";
    }
    if (!eventoTemFolder(evento)) {
      return "";
    }
    return getEventoFolderUrl(evento);
  }, [evento, folderFile, removerFolderExistente]);

  const programacaoExistenteUrl = useMemo(() => {
    if (!evento?.id || removerProgramacaoExistente || programacaoFile) {
      return "";
    }
    if (!eventoTemProgramacao(evento)) {
      return "";
    }
    return getEventoProgramacaoUrl(evento);
  }, [evento, programacaoFile, removerProgramacaoExistente]);

  const unidadeNome = useMemo(() => {
    const id = Number(unidadeId);
    return (
      unidades.find((u) => Number(u.id) === id)?.nome ||
      unidades.find((u) => String(u.id) === String(unidadeId))?.nome ||
      ""
    );
  }, [unidadeId, unidades]);

  const organizadoresById = useMemo(() => {
    const map = new Map();
    for (const organizador of organizadoresDisponiveis) {
      const id = Number(organizador?.id);
      if (Number.isInteger(id)) {
        map.set(
          id,
          String(organizador?.nome || "").trim() || `organizador ${id}`,
        );
      }
    }
    return map;
  }, [organizadoresDisponiveis]);

  const nomeorganizador = useCallback(
    (id) => {
      const n = Number(id);
      if (!Number.isInteger(n)) {
        return "—";
      }
      return organizadoresById.get(n) || `organizador ${n}`;
    },
    [organizadoresById],
  );

  const cargosById = useMemo(() => {
    const map = new Map();
    for (const cargo of cargosDisponiveis) {
      const id = Number(cargo?.id);
      if (Number.isInteger(id)) {
        map.set(id, cargo);
      }
    }
    return map;
  }, [cargosDisponiveis]);

  const unidadesById = useMemo(() => {
    const map = new Map();
    for (const unidade of unidades) {
      const id = Number(unidade?.id);
      if (Number.isInteger(id)) {
        map.set(id, unidade);
      }
    }
    return map;
  }, [unidades]);

  useEffect(() => {
    if (!effectiveOpen) {
      return;
    }
    let alive = true;

    async function carregarAuxiliares() {
      try {
        setCarregandoAuxiliares(true);

        if (cacheUnidades) {
          setUnidades(cacheUnidades);
        }
        if (cacheorganizadores) {
          setorganizadoresDisponiveis(cacheorganizadores);
        }
        if (cacheCargos) {
          setCargosDisponiveis(cacheCargos);
        }

        const promises = [];

        if (!cacheUnidades) {
          promises.push(
            apiLookupUnidade({
              query: { limit: 300, offset: 0 },
              on401: "silent",
              on403: "silent",
            })
              .then((res) => ({ key: "unidades", value: asArray(res) }))
              .catch(() => ({ key: "unidades", value: [] })),
          );
        }

        if (!cacheorganizadores) {
          promises.push(
            apiGet("/evento/organizador/disponivel", {
              on401: "redirect",
              on403: "silent",
            })
              .then((res) => ({ key: "organizadores", value: asArray(res) }))
              .catch(() => ({ key: "organizadores", value: [] })),
          );
        }

        if (!cacheCargos) {
          promises.push(
            apiLookupCargo({
              query: { limit: 500, offset: 0 },
              on401: "silent",
              on403: "silent",
            })
              .then((res) => ({ key: "cargos", value: asArray(res) }))
              .catch(() => ({ key: "cargos", value: [] })),
          );
        }

        const results = promises.length ? await Promise.all(promises) : [];
        if (!alive) {
          return;
        }

        for (const result of results) {
          if (result.key === "unidades") {
            const lista = result.value
              .filter(Boolean)
              .sort((a, b) =>
                String(a.nome || "").localeCompare(
                  String(b.nome || ""),
                  "pt-BR",
                ),
              );
            cacheUnidades = lista;
            setUnidades(lista);
          }
          if (result.key === "organizadores") {
            const lista = result.value
              .filter(Boolean)
              .sort((a, b) =>
                String(a.nome || "").localeCompare(
                  String(b.nome || ""),
                  "pt-BR",
                ),
              );
            cacheorganizadores = lista;
            setorganizadoresDisponiveis(lista);
          }
          if (result.key === "cargos") {
            const lista = result.value
              .filter(Boolean)
              .sort((a, b) =>
                cargoLabel(a).localeCompare(cargoLabel(b), "pt-BR"),
              );
            cacheCargos = lista;
            setCargosDisponiveis(lista);
          }
        }
      } finally {
        if (alive) {
          setCarregandoAuxiliares(false);
        }
      }
    }

    carregarAuxiliares();
    return () => {
      alive = false;
    };
  }, [effectiveOpen]);

  useEffect(() => {
    if (!effectiveOpen) {
      return;
    }

    const key = evento?.id ? Number(evento.id) : "novo";
    if (prevEventoKeyRef.current === key) {
      return;
    }

    startTransition(() => {
      setTitulo(evento?.titulo || "");
      setDescricao(evento?.descricao || "");
      setLocal(evento?.local || "");
      setTipo(evento?.tipo || "");
      setUnidadeId(evento?.unidade_id ? String(evento.unidade_id) : "");
      setPublicoAlvo(evento?.publico_alvo || "");
      setConteudoProgramatico(evento?.conteudo_programatico || "");
      setTermoAtivo(evento?.termo_ativo === true);
      setTermoTitulo(evento?.termo_titulo || "");
      setTermoConteudoHtml(evento?.termo_conteudo_html || "");

      setFolderFile(null);
      setFolderPreview("");
      setProgramacaoFile(null);

      setRemoverFolderExistente(false);
      setRemoverProgramacaoExistente(false);

      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }

      const turmasBase = Array.isArray(evento?.turmas) ? evento.turmas : [];
      setTurmas(turmasBase.map(normalizarTurmaParaEstado));

      const isRestrito = Boolean(evento?.restrito);
      const modoUi = inferirModoRestricaoUi(evento);

      setRestrito(isRestrito);
      setRestricaoUi(isRestrito ? modoUi : "");

      const regs = Array.isArray(evento?.registros_permitidos)
        ? evento.registros_permitidos
        : Array.isArray(evento?.registros)
          ? evento.registros
          : [];

      setRegistrosPermitidos([
        ...new Set(regs.map(onlyDigits).filter((r) => /^\d{6}$/.test(r))),
      ]);

      setCargosPermitidos(normalizarCargosParaEstado(evento));
      setUnidadesPermitidas(normalizarUnidadesParaEstado(evento));

      const posCurso = evento?.pos_curso || null;
      const temTeste = Boolean(posCurso?.questionario_id);

      setTesteObrigatorio(temTeste);

      setTesteConfig({
        titulo: posCurso?.titulo || "",
        nota_minima:
          Number.isFinite(Number(posCurso?.min_nota)) &&
          Number(posCurso.min_nota) > 10
            ? Number(posCurso.min_nota) / 10
            : Number(posCurso?.min_nota || 7),
        tentativas: Number(posCurso?.tentativas_max || 1),
        tempo_minutos: Number(posCurso?.tempo_minutos || 30),
        questionario_id: posCurso?.questionario_id || null,
        questoes_count: Number(posCurso?.questoes_count || 0),
        peso_total: Number(posCurso?.peso_total || 0),
        publicado: String(posCurso?.status || "").toLowerCase() === "publicado",
      });

      setEditandoTurmaIndex(null);
      setModalTurmaAberto(false);
      setModalQuestionarioAberto(false);
      setConfirmTurma({ open: false, idx: null, turma: null });
      setRegistroInput("");
      setCargoAddId("");
      setUnidadeAddId("");
    });

    prevEventoKeyRef.current = key;
  }, [effectiveOpen, evento]);

  useEffect(() => {
    if (!effectiveOpen || !evento?.id) {
      return;
    }
    let alive = true;

    async function carregarDetalhe() {
      try {
        const completo = await EventoService.admin.buscarCompleto(evento.id);
        if (!alive || !completo?.id) {
          return;
        }

        if (
          Object.prototype.hasOwnProperty.call(
            completo,
            "conteudo_programatico",
          )
        ) {
          setConteudoProgramatico(completo?.conteudo_programatico || "");
        }

        if (Object.prototype.hasOwnProperty.call(completo, "termo_ativo")) {
          setTermoAtivo(completo?.termo_ativo === true);
          setTermoTitulo(completo?.termo_titulo || "");
          setTermoConteudoHtml(completo?.termo_conteudo_html || "");
        }

        setTurmas(
          Array.isArray(completo.turmas)
            ? completo.turmas.map(normalizarTurmaParaEstado)
            : [],
        );

        setRegistrosPermitidos([
          ...new Set(
            (completo.registros_permitidos || [])
              .map(onlyDigits)
              .filter((r) => /^\d{6}$/.test(r)),
          ),
        ]);

        setCargosPermitidos(normalizarCargosParaEstado(completo));
        setUnidadesPermitidas(normalizarUnidadesParaEstado(completo));

        const posCurso = completo?.pos_curso || null;

        if (posCurso?.questionario_id) {
          setTesteObrigatorio(true);
          setTesteConfig((prev) => ({
            ...prev,
            titulo: posCurso?.titulo || prev.titulo,
            nota_minima:
              Number.isFinite(Number(posCurso?.min_nota)) &&
              Number(posCurso.min_nota) > 10
                ? Number(posCurso.min_nota) / 10
                : Number(posCurso?.min_nota || prev.nota_minima),
            tentativas: Number(posCurso?.tentativas_max || prev.tentativas),
            tempo_minutos: Number(
              posCurso?.tempo_minutos || prev.tempo_minutos,
            ),
            questionario_id: posCurso?.questionario_id || prev.questionario_id,
            publicado:
              String(posCurso?.status || "").toLowerCase() === "publicado" ||
              prev.publicado,
          }));
        }
      } catch (error) {
        warnDev("Falha ao carregar detalhe do evento no modal", error);
      }
    }

    carregarDetalhe();
    return () => {
      alive = false;
    };
  }, [effectiveOpen, evento?.id]);

  useEffect(() => {
    if (!effectiveOpen || !evento?.id) {
      return;
    }

    const questionarioIdExistente =
      evento?.pos_curso?.questionario_id || evento?.questionario_id || null;

    if (!questionarioIdExistente) {
      setTesteObrigatorio(false);
      setTesteConfig(TESTE_DEFAULT);
      return;
    }

    let alive = true;

    async function carregarQuestionario() {
      try {
        const response = await apiGet(
          `/questionario/evento/${Number(evento.id)}`,
          {
            on404: "silent",
            on401: "redirect",
            on403: "silent",
            suppressGlobalError: true,
          },
        );

        if (!alive) {
          return;
        }
        const qz = response?.data ?? response;

        if (!qz?.id) {
          setTesteObrigatorio(false);
          setTesteConfig(TESTE_DEFAULT);
          return;
        }

        setTesteObrigatorio(true);
        setTesteConfig((prev) => ({
          ...prev,
          titulo: qz.titulo || prev.titulo,
          nota_minima:
            Number.isFinite(Number(qz.min_nota)) && Number(qz.min_nota) > 10
              ? Number(qz.min_nota) / 10
              : Number(qz.min_nota || prev.nota_minima),
          tentativas: Number(qz.tentativas_max || prev.tentativas),
          tempo_minutos: Number(qz.tempo_minutos || prev.tempo_minutos),
          questionario_id: qz.id || prev.questionario_id,
          questoes_count: Array.isArray(qz.questoes)
            ? qz.questoes.length
            : Number(qz.questoes_count || prev.questoes_count || 0),
          peso_total: Number(qz.peso_total || prev.peso_total || 0),
          publicado: Boolean(qz.publicado),
        }));
      } catch (_error) {
        // Alterado para _error
        if (!alive) {
          return;
        }
        // Opcional: Se quiser manter o log de desenvolvimento, pode usar o _error aqui
        // warnDev("Falha ao carregar questionário", _error);
        setTesteObrigatorio(false);
        setTesteConfig(TESTE_DEFAULT);
      }
    }

    carregarQuestionario();
    return () => {
      alive = false;
    };
  }, [
    effectiveOpen,
    evento?.id,
    evento?.pos_curso?.questionario_id,
    evento?.questionario_id,
  ]);

  const addRegistros = useCallback(() => {
    const novos = parseRegistrosBulk(registroInput);
    if (!novos.length) {
      toast.info("Informe ou cole ao menos um registro de 6 dígitos.");
      return;
    }
    setRegistrosPermitidos((prev) => [...new Set([...prev, ...novos])]);
    setRegistroInput("");
  }, [registroInput]);

  const removeRegistro = useCallback((registro) => {
    setRegistrosPermitidos((prev) => prev.filter((item) => item !== registro));
  }, []);

  const addCargo = useCallback(() => {
    const id = Number(cargoAddId);
    if (!Number.isInteger(id) || id <= 0) {
      toast.info("Selecione um cargo.");
      return;
    }
    setCargosPermitidos((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCargoAddId("");
  }, [cargoAddId]);

  const removeCargo = useCallback((id) => {
    setCargosPermitidos((prev) =>
      prev.filter((item) => Number(item) !== Number(id)),
    );
  }, []);

  const addUnidade = useCallback(() => {
    const id = Number(unidadeAddId);
    if (!Number.isInteger(id) || id <= 0) {
      toast.info("Selecione uma unidade.");
      return;
    }
    setUnidadesPermitidas((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setUnidadeAddId("");
  }, [unidadeAddId]);

  const removeUnidade = useCallback((id) => {
    setUnidadesPermitidas((prev) =>
      prev.filter((item) => Number(item) !== Number(id)),
    );
  }, []);

  const onChangeFolder = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!fileIsImage(file)) {
      toast.error("Envie uma imagem PNG ou JPG.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FOLDER_BYTES) {
      toast.error(
        `Folder muito grande. Máximo permitido: ${MAX_FOLDER_MB} MB.`,
      );
      event.target.value = "";
      return;
    }

    setFolderFile(file);
    setRemoverFolderExistente(false);

    const reader = new FileReader();
    reader.onload = () => {
      setFolderPreview(String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  }, []);

  const onChangeProgramacao = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!fileIsPdf(file)) {
      toast.error("Envie um PDF válido.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PROGRAMACAO_BYTES) {
      toast.error(
        `Programação muito grande. Máximo permitido: ${MAX_PROGRAMACAO_MB} MB.`,
      );
      event.target.value = "";
      return;
    }

    setProgramacaoFile(file);
    setRemoverProgramacaoExistente(false);
  }, []);

  const limparFolder = useCallback(() => {
    setFolderFile(null);
    setFolderPreview("");
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
    if (eventoTemFolder(evento)) {
      setRemoverFolderExistente(true);
    }
  }, [evento]);

  const limparProgramacao = useCallback(() => {
    setProgramacaoFile(null);
    if (pdfInputRef.current) {
      pdfInputRef.current.value = "";
    }
    if (eventoTemProgramacao(evento)) {
      setRemoverProgramacaoExistente(true);
    }
  }, [evento]);

  const abrirCriarTurma = useCallback(() => {
    setEditandoTurmaIndex(null);
    setModalTurmaAberto(true);
  }, []);

  const abrirEditarTurma = useCallback((idx) => {
    setEditandoTurmaIndex(idx);
    setModalTurmaAberto(true);
  }, []);

  const salvarTurma = useCallback(
    (turmaPayload) => {
      const normalizada = normalizarTurmaParaEstado(turmaPayload);

      if (!normalizada.nome) {
        toast.error("Informe o nome da turma.");
        return;
      }
      if (!normalizada.datas.length) {
        toast.error("A turma precisa ter ao menos uma data.");
        return;
      }
      const organizadores = extractIds(normalizada.organizadores);
      if (!organizadores.length) {
        toast.error("A turma precisa ter ao menos um organizador.");
        return;
      }
      const assinantes = normalizarAssinantesTurma(normalizada.assinantes);
      if (!assinantes.includes(RAFAELLA_PITOL_ID)) {
        toast.error("A assinatura da Rafaella Pitol é obrigatória.");
        return;
      }
      if (assinantes.length < 1 || assinantes.length > MAX_ASSINANTES_TURMA) {
        toast.error("A turma deve ter de 1 a 3 assinantes.");
        return;
      }

      const turmaFinal = {
        ...normalizada,
        organizadores,
        palestrantes: normalizarPalestrantesTurma(normalizada.palestrantes),
        assinantes,
      };

      setTurmas((prev) => {
        if (editandoTurmaIndex === null || editandoTurmaIndex === undefined) {
          return [...prev, turmaFinal];
        }
        return prev.map((item, index) =>
          index === editandoTurmaIndex ? turmaFinal : item,
        );
      });

      setModalTurmaAberto(false);
      setEditandoTurmaIndex(null);
    },
    [editandoTurmaIndex],
  );

  const solicitarRemoverTurma = useCallback((turma, idx) => {
    setConfirmTurma({ open: true, idx, turma });
  }, []);

  const confirmarRemoverTurma = useCallback(() => {
    const idx = confirmTurma.idx;
    const turma = confirmTurma.turma;

    if (idx === null || idx === undefined) {
      setConfirmTurma({ open: false, idx: null, turma: null });
      return;
    }

    setTurmas((prev) => prev.filter((_, index) => index !== idx));

    if (turma?.id) {
      toast.info(
        "Turma removida da edição. Se houver inscrições, presenças ou certificados, o backend bloqueará a alteração ao salvar.",
      );
      onTurmaRemovida?.(turma.id);
    } else {
      toast.info("Turma removida do rascunho.");
    }

    setConfirmTurma({ open: false, idx: null, turma: null });
  }, [confirmTurma, onTurmaRemovida]);

  const validarFormulario = useCallback(() => {
    const tituloLimpo = String(titulo || "").trim();
    const localLimpo = String(local || "").trim();
    const descricaoLimpa = String(descricao || "").trim();
    const publicoAlvoLimpo = String(publicoAlvo || "").trim();
    const conteudoProgramaticoLimpo = String(conteudoProgramatico || "").trim();
    const termoTituloLimpo = String(termoTitulo || "").trim();
    const termoConteudoLimpo = String(termoConteudoHtml || "").trim();

    if (!tituloLimpo) {
      return "Informe o título do evento.";
    }
    if (tituloLimpo.length > EVENTO_LIMITES.titulo) {
      return `O título ultrapassou o limite de ${EVENTO_LIMITES.titulo} caracteres.`;
    }
    if (!String(tipo || "").trim()) {
      return "Selecione o tipo do evento.";
    }
    if (!TIPOS_EVENTO.includes(tipo)) {
      return "Tipo de evento inválido.";
    }
    if (!localLimpo) {
      return "Informe o local do evento.";
    }
    if (localLimpo.length > EVENTO_LIMITES.local) {
      return `O local ultrapassou o limite de ${EVENTO_LIMITES.local} caracteres.`;
    }
    if (descricaoLimpa.length > EVENTO_LIMITES.descricao) {
      return `A descrição ultrapassou o limite de ${EVENTO_LIMITES.descricao} caracteres.`;
    }
    if (publicoAlvoLimpo.length > EVENTO_LIMITES.publico_alvo) {
      return `O público-alvo ultrapassou o limite de ${EVENTO_LIMITES.publico_alvo} caracteres.`;
    }
    if (
      conteudoProgramaticoLimpo.length > EVENTO_LIMITES.conteudo_programatico
    ) {
      return `O conteúdo programático ultrapassou o limite de ${EVENTO_LIMITES.conteudo_programatico} caracteres.`;
    }
    if (termoTituloLimpo.length > EVENTO_LIMITES.termo_titulo) {
      return `O título do termo ultrapassou o limite de ${EVENTO_LIMITES.termo_titulo} caracteres.`;
    }
    if (termoConteudoLimpo.length > EVENTO_LIMITES.termo_conteudo_html) {
      return `O termo/regulamento ultrapassou o limite de ${EVENTO_LIMITES.termo_conteudo_html} caracteres.`;
    }
    if (termoAtivo && !termoConteudoLimpo) {
      return "Informe o conteúdo do termo/regulamento ou desative essa opção.";
    }
    if (!toPositiveIntOrNull(unidadeId)) {
      return "Selecione a unidade.";
    }
    if (!Array.isArray(turmas) || !turmas.length) {
      return "Adicione ao menos uma turma.";
    }

    for (const turma of turmas) {
      if (!String(turma?.nome || "").trim()) {
        return "Todas as turmas precisam ter nome.";
      }
      if (!Array.isArray(turma?.datas) || !turma.datas.length) {
        return `A turma "${turma?.nome || "Turma"}" precisa ter ao menos uma data.`;
      }

      const organizadores = extractIds(turma?.organizadores);
      if (!organizadores.length) {
        return `A turma "${turma?.nome || "Turma"}" precisa ter ao menos um organizador.`;
      }

      const assinantes = normalizarAssinantesTurma(turma?.assinantes || []);
      if (!assinantes.includes(RAFAELLA_PITOL_ID)) {
        return `A turma "${turma?.nome}" precisa ter a assinatura obrigatória da Rafaella Pitol.`;
      }
      if (assinantes.length < 1 || assinantes.length > MAX_ASSINANTES_TURMA) {
        return `A turma "${turma?.nome}" deve ter de 1 a 3 assinantes.`;
      }

      for (const data of turma.datas) {
        if (!data?.data || !data?.horario_inicio || !data?.horario_fim) {
          return `A turma "${turma?.nome}" possui encontro incompleto.`;
        }
      }
    }

    if (restrito) {
      if (!restricaoUi) {
        return "Defina o tipo de restrição do evento.";
      }
      if (
        restricaoUi === RESTRICAO_UI.LISTA_REGISTROS &&
        !registrosPermitidos.length
      ) {
        return "Inclua ao menos um registro autorizado.";
      }
      if (restricaoUi === RESTRICAO_UI.CARGOS && !cargosPermitidos.length) {
        return "Inclua ao menos um cargo permitido.";
      }
      if (restricaoUi === RESTRICAO_UI.UNIDADES && !unidadesPermitidas.length) {
        return "Inclua ao menos uma unidade permitida.";
      }
    }

    return "";
  }, [
    cargosPermitidos.length,
    conteudoProgramatico,
    descricao,
    local,
    publicoAlvo,
    registrosPermitidos.length,
    restricaoUi,
    restrito,
    tipo,
    termoAtivo,
    termoConteudoHtml,
    termoTitulo,
    titulo,
    turmas,
    unidadeId,
    unidadesPermitidas.length,
  ]);

  const montarPayloadEvento = useCallback(() => {
      const turmasPayload = normalizarTurmasParaPayload(turmas);
      const registros = [
        ...new Set(registrosPermitidos.filter((r) => /^\d{6}$/.test(r))),
      ];

      let restritoModo = null;
      if (restrito) {
        if (restricaoUi === RESTRICAO_UI.TODOS_SERVIDORES) {
          restritoModo = "todos_servidores";
        } else if (restricaoUi === RESTRICAO_UI.LISTA_REGISTROS) {
          restritoModo = "lista_registros";
        } else if (restricaoUi === RESTRICAO_UI.CARGOS) {
          restritoModo = "cargos";
        } else if (restricaoUi === RESTRICAO_UI.UNIDADES) {
          restritoModo = "unidades";
        }
      }

      const payload = {
        ...(evento?.id ? { id: Number(evento.id) } : {}),

        titulo: String(titulo).trim(),
        descricao: String(descricao || "").trim(),
        local: String(local).trim(),
        tipo,
        unidade_id: Number(unidadeId),
        publico_alvo: String(publicoAlvo || "").trim(),
        conteudo_programatico:
          String(conteudoProgramatico || "").trim() || null,
        salvar_como_rascunho: true,

        ...(!termoBloqueado
          ? {
              termo_ativo: Boolean(termoAtivo),
              termo_titulo: termoAtivo ? String(termoTitulo || "").trim() : "",
              termo_conteudo_html: termoAtivo
                ? String(termoConteudoHtml || "").trim()
                : "",
            }
          : {}),

        turmas: turmasPayload,

        restrito: Boolean(restrito),
        restrito_modo: restrito ? restritoModo : null,

        ...(restrito &&
        restricaoUi === RESTRICAO_UI.LISTA_REGISTROS &&
        registros.length
          ? { registros_permitidos: registros }
          : {}),
        ...(restrito && restricaoUi === RESTRICAO_UI.CARGOS
          ? { cargos_permitidos: cargosPermitidos }
          : {}),
        ...(restrito && restricaoUi === RESTRICAO_UI.UNIDADES
          ? { unidades_permitidas: unidadesPermitidas }
          : {}),

        ...(removerFolderExistente ? { remover_folder: true } : {}),
        ...(removerProgramacaoExistente ? { remover_programacao: true } : {}),

        ...(folderFile instanceof File ? { folderFile } : {}),
        ...(programacaoFile instanceof File ? { programacaoFile } : {}),
      };

      return payload;
    },
    [
      cargosPermitidos,
      conteudoProgramatico,
      descricao,
      evento?.id,
      folderFile,
      local,
      programacaoFile,
      publicoAlvo,
      registrosPermitidos,
      removerFolderExistente,
      removerProgramacaoExistente,
      restricaoUi,
      restrito,
      tipo,
      titulo,
      termoAtivo,
      termoBloqueado,
      termoConteudoHtml,
      termoTitulo,
      turmas,
      unidadeId,
      unidadesPermitidas,
    ],
  );

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      if (salvando) {
        return;
      }

      const erro = validarFormulario();
      if (erro) {
        toast.error(erro);
        return;
      }

      handleSalvarEvento(montarPayloadEvento(), { publicar: true });
    },
    [handleSalvarEvento, montarPayloadEvento, salvando, validarFormulario],
  );

  const validarEtapa = useCallback(
    (etapa) => {
      if (etapa === 1) {
        if (!String(titulo || "").trim()) {
          return "Informe o título do evento.";
        }
        if (!String(tipo || "").trim()) {
          return "Selecione o tipo do evento.";
        }
        if (!String(local || "").trim()) {
          return "Informe o local do evento.";
        }
        if (!toPositiveIntOrNull(unidadeId)) {
          return "Selecione a unidade.";
        }
        if (String(titulo).trim().length > EVENTO_LIMITES.titulo) {
          return "O título do evento ultrapassou o limite permitido.";
        }
        if (String(descricao || "").trim().length > EVENTO_LIMITES.descricao) {
          return "A descrição do evento ultrapassou o limite permitido.";
        }
      }

      if (etapa === 2) {
        if (String(publicoAlvo || "").trim().length > EVENTO_LIMITES.publico_alvo) {
          return "O público-alvo ultrapassou o limite permitido.";
        }
        if (termoAtivo && !String(termoConteudoHtml || "").trim()) {
          return "Informe o conteúdo do termo ou desative essa opção.";
        }
        if (!Array.isArray(turmas) || !turmas.length) {
          return "Adicione ao menos uma turma.";
        }
        for (const turma of turmas) {
          if (!String(turma?.nome || "").trim()) {
            return "Todas as turmas precisam ter nome.";
          }
          if (!Array.isArray(turma?.datas) || !turma.datas.length) {
            return `A turma "${turma?.nome || "Turma"}" precisa ter ao menos uma data.`;
          }
          if (!extractIds(turma?.organizadores).length) {
            return `A turma "${turma?.nome || "Turma"}" precisa ter ao menos um organizador.`;
          }
        }
        if (restrito && !restricaoUi) {
          return "Defina o tipo de restrição do evento.";
        }
        if (
          restrito &&
          restricaoUi === RESTRICAO_UI.LISTA_REGISTROS &&
          !registrosPermitidos.length
        ) {
          return "Inclua ao menos um registro autorizado.";
        }
        if (
          restrito &&
          restricaoUi === RESTRICAO_UI.CARGOS &&
          !cargosPermitidos.length
        ) {
          return "Inclua ao menos um cargo permitido.";
        }
        if (
          restrito &&
          restricaoUi === RESTRICAO_UI.UNIDADES &&
          !unidadesPermitidas.length
        ) {
          return "Inclua ao menos uma unidade permitida.";
        }
      }

      if (
        etapa === 3 &&
        String(conteudoProgramatico || "").trim().length >
          EVENTO_LIMITES.conteudo_programatico
      ) {
        return "O conteúdo programático ultrapassou o limite permitido.";
      }

      return "";
    },
    [
      cargosPermitidos.length,
      conteudoProgramatico,
      descricao,
      local,
      publicoAlvo,
      registrosPermitidos.length,
      restricaoUi,
      restrito,
      termoAtivo,
      termoConteudoHtml,
      tipo,
      titulo,
      turmas,
      unidadeId,
      unidadesPermitidas.length,
    ],
  );

  const avancarEtapa = useCallback(() => {
    const erro = validarEtapa(etapaAtual);
    if (erro) {
      toast.error(erro);
      return;
    }

    proximaEtapaAposSalvarRef.current = Math.min(5, etapaAtual + 1);
    handleSalvarEvento(montarPayloadEvento());
  }, [
    etapaAtual,
    handleSalvarEvento,
    montarPayloadEvento,
    validarEtapa,
  ]);

  const voltarEtapa = useCallback(() => {
    if (etapaAtual === 1) {
      onClose();
      return;
    }
    setEtapaAtual((atual) => Math.max(1, atual - 1));
  }, [etapaAtual, onClose]);

  const pendenciasRevisao = useMemo(() => {
    const pendencias = [];
    const formulario = validarFormulario();
    if (formulario) {
      pendencias.push(formulario);
    }
    if (preTesteResumoErro) {
      pendencias.push(preTesteResumoErro);
    }
    return pendencias;
  }, [preTesteResumoErro, validarFormulario]);

  const turmasRender = useMemo(() => {
    return (turmas || []).map((turma, index) => {
      const datas = Array.isArray(turma.datas) ? turma.datas : [];
      const dataInicio = minDate(datas) || turma.data_inicio;
      const dataFim = maxDate(datas) || turma.data_fim;
      const primeira = datas[0] || null;
      const horarioInicio =
        primeira?.horario_inicio || turma.horario_inicio || "";
      const horarioFim = primeira?.horario_fim || turma.horario_fim || "";

      const organizadores = extractIds(turma.organizadores);
      const palestrantes = normalizarPalestrantesTurma(
        turma.palestrantes || [],
      );
      const assinantes = normalizarAssinantesTurma(turma.assinantes || []);

      return (
        <div
          key={turma.id || `turma-${index}`}
          className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

          <div className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-black leading-tight text-zinc-950 dark:text-white">
                  {turma.nome}
                </p>

                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Chip tone="indigo">{datas.length} encontro(s)</Chip>
                  <Chip tone="emerald">
                    {Number(turma.vagas_total) || 0} vagas
                  </Chip>
                  <Chip tone="sky">{Number(turma.carga_horaria) || 0}h</Chip>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <ActionButton
                  type="button"
                  tone="info"
                  size="xs"
                  onClick={() => abrirEditarTurma(index)}
                  aria-label={`Editar turma ${turma.nome}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Editar
                </ActionButton>

                <ActionButton
                  type="button"
                  tone="danger"
                  size="xs"
                  onClick={() => solicitarRemoverTurma(turma, index)}
                  aria-label={`Remover turma ${turma.nome}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remover
                </ActionButton>
              </div>
            </div>

            <div className="mt-2 grid gap-2 text-xs text-zinc-700 dark:text-zinc-200 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex items-start gap-2">
                  <CalendarDays
                    size={14}
                    className="mt-[2px] text-indigo-700 dark:text-indigo-300"
                    aria-hidden="true"
                  />
                  <span>
                    {formatDateBr(dataInicio)} a {formatDateBr(dataFim)}
                  </span>
                </div>
              </div>

              {horarioInicio && horarioFim && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="flex items-start gap-2">
                    <Clock
                      size={14}
                      className="mt-[2px] text-indigo-700 dark:text-indigo-300"
                      aria-hidden="true"
                    />
                    <span>
                      {hhmm(horarioInicio)} às {hhmm(horarioFim)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {!!datas.length && (
              <details className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                <summary className="cursor-pointer text-xs font-black text-zinc-800 dark:text-zinc-100">
                  Ver encontros
                </summary>
                <ul className="mt-2 list-inside list-disc text-xs text-zinc-600 dark:text-zinc-300">
                  {datas.map((item, idx) => (
                    <li
                      key={`${turma.id || index}-data-${idx}`}
                      className="break-words"
                    >
                      {formatDateBr(item.data)} — {hhmm(item.horario_inicio)} às{" "}
                      {hhmm(item.horario_fim)}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {(organizadores.length > 0 ||
              palestrantes.length > 0 ||
              assinantes.length > 0) && (
              <div className="mt-2 space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                {organizadores.length > 0 && (
                  <div className="text-[11px]">
                    <span className="font-black">Org: </span>
                    {organizadores.map((id, idx) => (
                      <span key={id}>
                        {nomeorganizador(id)}
                        {idx < organizadores.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                )}

                {palestrantes.length > 0 && (
                  <div className="text-[11px]">
                    <span className="font-black">Pal: </span>
                    {palestrantes.map((palestrante, idx) => (
                      <span key={`${palestrante.nome}-${idx}`}>
                        {palestrante.nome}
                        {idx < palestrantes.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                )}

                {assinantes.length > 0 && (
                  <div className="text-[11px]">
                    <span className="font-black">Ass: </span>
                    {assinantes.map((id, idx) => (
                      <span key={id}>
                        {nomeorganizador(id)}
                        {idx < assinantes.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    });
  }, [abrirEditarTurma, nomeorganizador, solicitarRemoverTurma, turmas]);

  if (carregandoEvento) {
    return (
      <div className="min-h-screen bg-zinc-50/80 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <HeaderHero
            titulo="Gestão de eventos"
            subtitulo="Carregando dados administrativos do evento."
            icone={ShieldCheck}
            campanhaMes={new Date().getMonth() + 1}
            tamanho="lg"
            raio="xl"
          />
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">
              Carregando evento…
            </p>
          </section>
        </div>
        <Footer />
      </div>
    );
  }

  if (erroEvento && eventoIdParam && !evento?.id) {
    return (
      <div className="min-h-screen bg-zinc-50/80 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <HeaderHero
            titulo="Gestão de eventos"
            subtitulo="Não foi possível carregar o evento solicitado."
            icone={ShieldCheck}
            campanhaMes={new Date().getMonth() + 1}
            tamanho="lg"
            raio="xl"
          />
          <section className="mt-4 rounded-2xl border border-rose-200 bg-white p-4 shadow-sm dark:border-rose-900/40 dark:bg-zinc-950">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
              {erroEvento}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 inline-flex min-h-9 items-center justify-center rounded-xl bg-emerald-700 px-3 py-1.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800"
            >
              Voltar ao painel
            </button>
          </section>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-zinc-50/80 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <HeaderHero
            titulo={evento?.id ? "Editar evento" : "Novo evento"}
            subtitulo="Página administrativa contextual para configurar dados, turmas, anexos, restrições, conteúdo programático e teste do evento."
            icone={ShieldCheck}
            campanhaMes={new Date().getMonth() + 1}
            tamanho="lg"
            raio="xl"
          />

          <div className="mt-4 overflow-visible rounded-2xl border border-black/5 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-950">
            <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />

            <header className="relative border-b border-zinc-200 bg-white/90 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 sm:px-5 sm:py-3">
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-24 -top-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
              </div>

              <div className="relative">
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-300">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <div className="min-w-0">
                      <h2
                        id={titleId}
                        className="break-words text-lg font-black tracking-tight text-zinc-950 dark:text-white sm:text-xl"
                      >
                        {evento?.id ? "Editar evento" : "Novo evento"}
                      </h2>

                      <p
                        id={descId}
                        className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300"
                      >
                        Configure dados institucionais, turmas, anexos,
                        restrições e teste obrigatório.
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {tipo ? (
                      <Chip tone="indigo" title="Tipo do evento">
                        <Layers3 className="h-3 w-3" aria-hidden="true" />
                        {tipo}
                      </Chip>
                    ) : (
                      <Chip tone="zinc" title="Tipo pendente">
                        <HelpCircle className="h-3 w-3" aria-hidden="true" />
                        Tipo pendente
                      </Chip>
                    )}

                    {unidadeNome ? (
                      <Chip tone="emerald" title="Unidade responsável">
                        <Building2 className="h-3 w-3" aria-hidden="true" />
                        {unidadeNome}
                      </Chip>
                    ) : (
                      <Chip tone="zinc" title="Unidade pendente">
                        <HelpCircle className="h-3 w-3" aria-hidden="true" />
                        Unidade pendente
                      </Chip>
                    )}

                    <Chip tone={restrito ? "amber" : "zinc"}>
                      {restrito ? (
                        <Lock className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Unlock className="h-3 w-3" aria-hidden="true" />
                      )}
                      {restrito ? "Restrito" : "Padrão"}
                    </Chip>

                    <Chip tone={testeObrigatorio ? "violet" : "zinc"}>
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      {testeObrigatorio ? "Pós-teste configurado" : "Sem pós-teste"}
                    </Chip>
                  </div>
                </div>
              </div>
            </header>

            <nav
              aria-label="Etapas do cadastro do evento"
              className="border-b border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:px-5"
            >
              <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                {ETAPAS_EVENTO.map((etapa, index) => {
                  const numero = index + 1;
                  const ativa = etapaAtual === numero;
                  const concluida = etapaAtual > numero;
                  return (
                    <li key={etapa}>
                      <button
                        type="button"
                        onClick={() => {
                          if (numero < etapaAtual) {
                            setEtapaAtual(numero);
                          }
                        }}
                        disabled={numero > etapaAtual}
                        aria-current={ativa ? "step" : undefined}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-extrabold transition ${
                          ativa
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                            : concluida
                              ? "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-950 dark:text-emerald-200"
                              : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50"
                        }`}
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-current/10">
                          {numero}
                        </span>
                        <span className="leading-tight">{etapa}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <main className="bg-zinc-50/70 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-zinc-950/70 sm:p-4">
              <section
                className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5"
                aria-label="Resumo do cadastro do evento"
              >
                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                  <div className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                    Turmas
                  </div>
                  <div className="mt-1 text-base font-black text-zinc-950 dark:text-white">
                    {turmas.length}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                  <div className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                    Encontros
                  </div>
                  <div className="mt-1 text-base font-black text-zinc-950 dark:text-white">
                    {turmas.reduce(
                      (total, turma) =>
                        total +
                        (Array.isArray(turma.datas) ? turma.datas.length : 0),
                      0,
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                  <div className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                    Folder
                  </div>
                  <div className="mt-1 text-xs font-black text-zinc-950 dark:text-white">
                    {folderFile || folderExistenteUrl
                      ? "Configurado"
                      : removerFolderExistente
                        ? "Remover"
                        : "Pendente"}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                  <div className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                    PDF
                  </div>
                  <div className="mt-1 text-xs font-black text-zinc-950 dark:text-white">
                    {programacaoFile || programacaoExistenteUrl
                      ? "Configurado"
                      : removerProgramacaoExistente
                        ? "Remover"
                        : "Opcional"}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                  <div className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                    Conteúdo
                  </div>
                  <div className="mt-1 text-xs font-black text-zinc-950 dark:text-white">
                    {String(conteudoProgramatico || "").trim()
                      ? "Configurado"
                      : "Opcional"}
                  </div>
                </div>
              </section>

              {isPending ? (
                <p
                  className="rounded-xl border border-zinc-200 bg-white p-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
                  role="status"
                  aria-live="polite"
                >
                  Carregando dados do evento…
                </p>
              ) : (
                <form
                  id={formId}
                  onSubmit={handleSubmit}
                  className="grid min-w-0 grid-cols-1 gap-4"
                  noValidate
                >
                  <div className="space-y-4">
                    <SectionCard
                      id={`sec-dados-${uid}`}
                      icon={FileText}
                      title={
                        etapaAtual === 1
                          ? "Informações básicas"
                          : etapaAtual === 2
                            ? "Inscrição, público e termo"
                            : "Conteúdo programático"
                      }
                      subtitle={
                        etapaAtual === 1
                          ? "Informações principais usadas na divulgação e certificados."
                          : etapaAtual === 2
                            ? "Defina o público e preserve a finalidade do termo de presença."
                            : "Conteúdo que poderá constar nos materiais e certificados."
                      }
                      show={[1, 2, 3].includes(etapaAtual)}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div
                          className={`grid gap-1 sm:col-span-2 ${
                            etapaAtual === 1 ? "" : "hidden"
                          }`}
                        >
                          <FieldLabel htmlFor={`evento-titulo-${uid}`} required>
                            Título
                          </FieldLabel>
                          <TextInput
                            id={`evento-titulo-${uid}`}
                            icon={FileText}
                            value={titulo}
                            maxLength={EVENTO_LIMITES.titulo}
                            onChange={(e) =>
                              setTitulo(
                                limitarTexto(
                                  e.target.value,
                                  EVENTO_LIMITES.titulo,
                                ),
                              )
                            }
                            placeholder="Ex.: Curso de Atualização em Urgência"
                            required
                          />
                          <CampoContador
                            value={titulo}
                            max={EVENTO_LIMITES.titulo}
                          />
                        </div>

                        <div
                          className={`grid gap-1 sm:col-span-2 ${
                            etapaAtual === 1 ? "" : "hidden"
                          }`}
                        >
                          <FieldLabel htmlFor={`evento-descricao-${uid}`}>
                            Descrição
                          </FieldLabel>
                          <TextArea
                            id={`evento-descricao-${uid}`}
                            icon={FileText}
                            value={descricao}
                            maxLength={EVENTO_LIMITES.descricao}
                            onChange={(e) =>
                              setDescricao(
                                limitarTexto(
                                  e.target.value,
                                  EVENTO_LIMITES.descricao,
                                ),
                              )
                            }
                            placeholder="Contexto, objetivos, orientações e observações do evento."
                          />
                          <CampoContador
                            value={descricao}
                            max={EVENTO_LIMITES.descricao}
                          />
                        </div>

                        <div
                          className={`grid gap-1 sm:col-span-2 ${
                            etapaAtual === 3 ? "" : "hidden"
                          }`}
                        >
                          <FieldLabel
                            htmlFor={`evento-conteudo-programatico-${uid}`}
                          >
                            Conteúdo programático
                          </FieldLabel>
                          <TextArea
                            id={`evento-conteudo-programatico-${uid}`}
                            icon={ClipboardList}
                            value={conteudoProgramatico}
                            maxLength={EVENTO_LIMITES.conteudo_programatico}
                            onChange={(e) =>
                              setConteudoProgramatico(
                                limitarTexto(
                                  e.target.value,
                                  EVENTO_LIMITES.conteudo_programatico,
                                ),
                              )
                            }
                            placeholder="Informe os tópicos que serão impressos no verso do certificado."
                            rows={4}
                          />
                          <CampoContador
                            value={conteudoProgramatico}
                            max={EVENTO_LIMITES.conteudo_programatico}
                          />
                          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                            Campo opcional. Impresso no verso do certificado,
                            preservando as quebras de linha.
                          </p>
                        </div>

                        <div
                          className={`grid gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20 sm:col-span-2 ${
                            etapaAtual === 2 ? "" : "hidden"
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-black text-emerald-950 dark:text-emerald-100">
                                Termo/regulamento para confirmação de presença
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-emerald-900/75 dark:text-emerald-200/75">
                                Opcional. Quando ativo, o participante verá este
                                conteúdo ao escanear o QR Code de presença e
                                precisará confirmar ciência antes do registro.
                              </p>
                            </div>

                            {termoBloqueado ? (
                              <Chip tone="amber">Bloqueado após início</Chip>
                            ) : null}
                          </div>

                          <label className="inline-flex items-start gap-2 text-xs font-bold text-zinc-800 dark:text-zinc-100">
                            <input
                              type="checkbox"
                              checked={termoAtivo}
                              disabled={termoBloqueado}
                              onChange={(e) => setTermoAtivo(e.target.checked)}
                              className="mt-0.5"
                            />
                            <span>
                              Exigir ciência do termo/regulamento na confirmação
                              de presença por QR Code.
                            </span>
                          </label>

                          {termoBloqueado ? (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                              Este termo não pode mais ser alterado porque o
                              evento já iniciou.
                            </p>
                          ) : null}

                          {termoAtivo ? (
                            <div className="grid gap-2">
                              <div className="grid gap-1">
                                <FieldLabel
                                  htmlFor={`evento-termo-titulo-${uid}`}
                                >
                                  Título do termo
                                </FieldLabel>
                                <TextInput
                                  id={`evento-termo-titulo-${uid}`}
                                  icon={ShieldCheck}
                                  value={termoTitulo}
                                  disabled={termoBloqueado}
                                  maxLength={EVENTO_LIMITES.termo_titulo}
                                  onChange={(e) =>
                                    setTermoTitulo(
                                      limitarTexto(
                                        e.target.value,
                                        EVENTO_LIMITES.termo_titulo,
                                      ),
                                    )
                                  }
                                  placeholder="Ex.: Termo de ciência e responsabilidade"
                                />
                                <CampoContador
                                  value={termoTitulo}
                                  max={EVENTO_LIMITES.termo_titulo}
                                />
                              </div>

                              <div className="grid gap-1">
                                <FieldLabel
                                  htmlFor={`evento-termo-conteudo-${uid}`}
                                  required
                                >
                                  Conteúdo do termo/regulamento
                                </FieldLabel>
                                <TextArea
                                  id={`evento-termo-conteudo-${uid}`}
                                  icon={ClipboardList}
                                  value={termoConteudoHtml}
                                  disabled={termoBloqueado}
                                  maxLength={EVENTO_LIMITES.termo_conteudo_html}
                                  onChange={(e) =>
                                    setTermoConteudoHtml(
                                      limitarTexto(
                                        e.target.value,
                                        EVENTO_LIMITES.termo_conteudo_html,
                                      ),
                                    )
                                  }
                                  placeholder="Digite aqui o termo/regulamento. Quebras de linha serão preservadas; HTML básico também pode ser usado, se necessário."
                                  rows={8}
                                />
                                <CampoContador
                                  value={termoConteudoHtml}
                                  max={EVENTO_LIMITES.termo_conteudo_html}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={`grid gap-1 sm:col-span-2 ${
                            etapaAtual === 2 ? "" : "hidden"
                          }`}
                        >
                          <FieldLabel htmlFor={`evento-publico-${uid}`}>
                            Público-alvo
                          </FieldLabel>
                          <TextInput
                            id={`evento-publico-${uid}`}
                            icon={Info}
                            value={publicoAlvo}
                            maxLength={EVENTO_LIMITES.publico_alvo}
                            onChange={(e) =>
                              setPublicoAlvo(
                                limitarTexto(
                                  e.target.value,
                                  EVENTO_LIMITES.publico_alvo,
                                ),
                              )
                            }
                            placeholder="Ex.: Profissionais da APS, enfermeiros, médicos"
                          />
                          <CampoContador
                            value={publicoAlvo}
                            max={EVENTO_LIMITES.publico_alvo}
                          />
                        </div>

                        <div
                          className={`grid gap-1 ${
                            etapaAtual === 1 ? "" : "hidden"
                          }`}
                        >
                          <FieldLabel htmlFor={`evento-local-${uid}`} required>
                            Local
                          </FieldLabel>
                          <TextInput
                            id={`evento-local-${uid}`}
                            icon={MapPin}
                            value={local}
                            maxLength={EVENTO_LIMITES.local}
                            onChange={(e) =>
                              setLocal(
                                limitarTexto(
                                  e.target.value,
                                  EVENTO_LIMITES.local,
                                ),
                              )
                            }
                            placeholder="Ex.: Auditório da Escola da Saúde"
                            required
                          />
                          <CampoContador
                            value={local}
                            max={EVENTO_LIMITES.local}
                          />
                        </div>

                        <div
                          className={`grid gap-1 ${
                            etapaAtual === 1 ? "" : "hidden"
                          }`}
                        >
                          <FieldLabel htmlFor={`evento-tipo-${uid}`} required>
                            Tipo
                          </FieldLabel>
                          <SelectInput
                            id={`evento-tipo-${uid}`}
                            value={tipo}
                            onChange={(e) => setTipo(e.target.value)}
                            required
                          >
                            <option value="">Selecione o tipo</option>
                            {TIPOS_EVENTO.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </SelectInput>
                        </div>

                        <div
                          className={`grid gap-1 sm:col-span-2 ${
                            etapaAtual === 1 ? "" : "hidden"
                          }`}
                        >
                          <FieldLabel
                            htmlFor={`evento-unidade-${uid}`}
                            required
                          >
                            Unidade responsável
                          </FieldLabel>
                          <SelectInput
                            id={`evento-unidade-${uid}`}
                            value={unidadeId}
                            onChange={(e) => setUnidadeId(e.target.value)}
                            required
                          >
                            <option value="">
                              {carregandoAuxiliares
                                ? "Carregando unidades..."
                                : "Selecione a unidade"}
                            </option>
                            {unidades.map((unidade) => (
                              <option
                                key={unidade.id}
                                value={String(unidade.id)}
                              >
                                {unidade.nome}
                              </option>
                            ))}
                          </SelectInput>
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard
                      id={`sec-turmas-${uid}`}
                      icon={Users}
                      title="Turmas"
                      subtitle="Gerencie os encontros, horários e organizadores de cada turma."
                      show={etapaAtual === 2}
                    >
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                          <Chip tone="indigo">{turmas.length} turma(s)</Chip>
                          <Chip tone="emerald">
                            {turmas.reduce(
                              (total, turma) =>
                                total +
                                (Array.isArray(turma.datas)
                                  ? turma.datas.length
                                  : 0),
                              0,
                            )}{" "}
                            encontro(s)
                          </Chip>
                        </div>

                        <ActionButton
                          type="button"
                          tone="success"
                          onClick={abrirCriarTurma}
                        >
                          <PlusCircle
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          Adicionar turma
                        </ActionButton>
                      </div>

                      {turmas.length ? (
                        <div className="grid gap-2">{turmasRender}</div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                          Nenhuma turma cadastrada. Adicione ao menos uma turma
                          para salvar o evento.
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard
                      id={`sec-pre-teste-${uid}`}
                      icon={ClipboardList}
                      title="Pré-teste antes da inscrição"
                      subtitle="Configure o instrumento diagnóstico separado do pós-teste."
                      show={etapaAtual === 4}
                    >
                      {evento?.id ? (
                        <EditorPreTesteEvento
                          eventoId={evento.id}
                          onChange={handlePreTesteChange}
                        />
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                          O rascunho do evento será salvo antes desta etapa para
                          permitir a configuração das avaliações.
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard
                      id={`sec-revisao-${uid}`}
                      icon={CheckCircle2}
                      title="Revisão e publicação"
                      subtitle="Confira o conjunto completo. O evento só ficará disponível após a publicação explícita abaixo."
                      show={etapaAtual === 5}
                    >
                      <dl className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                          <dt className="text-xs font-black uppercase text-zinc-500">Informações básicas</dt>
                          <dd className="mt-1 text-sm font-bold">{titulo || "Título pendente"}</dd>
                          <dd className="mt-1 text-xs text-zinc-500">{tipo || "Tipo pendente"} · {local || "Local pendente"}</dd>
                          <dd className="mt-1 text-xs text-zinc-500">
                            Unidade: {unidades.find((item) => Number(item.id) === Number(unidadeId))?.nome || "Pendente"}
                          </dd>
                          {String(descricao || "").trim() && (
                            <dd className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                              {descricao}
                            </dd>
                          )}
                        </div>
                        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                          <dt className="text-xs font-black uppercase text-zinc-500">Inscrição e público</dt>
                          <dd className="mt-1 text-sm font-bold">
                            {publicoAlvo || "Público-alvo não informado"}
                          </dd>
                          <dd className="mt-1 text-xs text-zinc-500">
                            {restrito ? "Evento restrito" : "Acesso padrão"} · Termo {termoAtivo ? "ativo" : "inativo"}
                          </dd>
                        </div>
                        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800 lg:col-span-2">
                          <dt className="text-xs font-black uppercase text-zinc-500">Turmas, datas, horários e vagas</dt>
                          <dd className="mt-1 text-sm font-bold">
                            {turmas.length} turma(s) · {turmas.reduce((total, turma) => total + (Number(turma?.vagas_total) || 0), 0)} vaga(s)
                          </dd>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {turmas.map((turma, turmaIndex) => (
                              <div key={turma.id || `revisao-turma-${turmaIndex}`} className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-900/60">
                                <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">
                                  {turma.nome || `Turma ${turmaIndex + 1}`} · {Number(turma?.vagas_total) || 0} vagas
                                </p>
                                <ul className="mt-1 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  {(turma.datas || []).map((encontro, encontroIndex) => (
                                    <li key={`${encontro.data}-${encontroIndex}`}>
                                      {formatDateBr(encontro.data)} · {hhmm(encontro.horario_inicio)} às {hhmm(encontro.horario_fim)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                          <dt className="text-xs font-black uppercase text-zinc-500">Conteúdo e materiais</dt>
                          <dd className="mt-1 text-sm font-bold">{String(conteudoProgramatico || "").trim() ? "Conteúdo configurado" : "Conteúdo opcional"}</dd>
                          <dd className="mt-1 text-xs text-zinc-500">Folder {folderFile || folderExistenteUrl ? "configurado" : "não informado"} · PDF {programacaoFile || programacaoExistenteUrl ? "configurado" : "não informado"}</dd>
                        </div>
                        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                          <dt className="text-xs font-black uppercase text-zinc-500">Avaliações</dt>
                          <dd className="mt-1 text-sm font-bold">
                            {preTesteResumo?.selecionado
                              ? `${Number(preTesteResumo?.rascunho?.perguntas?.length ?? preTesteResumo?.versao_publicada?.perguntas?.length ?? 0)} pergunta(s) no pré-teste`
                              : "Pré-teste não utilizado"}
                          </dd>
                          <dd className="mt-1 text-xs text-zinc-500">
                            {testeObrigatorio
                              ? `Pós-teste configurado${testeConfig?.questoes_count ? ` · ${testeConfig.questoes_count} questão(ões)` : ""}`
                              : "Sem pós-teste"}
                          </dd>
                        </div>
                      </dl>

                      {pendenciasRevisao.length ? (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                          <p className="font-black">Pendências antes de publicar:</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            {pendenciasRevisao.map((pendencia) => (
                              <li key={pendencia}>{pendencia}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
                          Dados do evento prontos para validação final. Ele
                          permanece invisível até o clique em Publicar evento.
                        </div>
                      )}
                    </SectionCard>
                  </div>

                  <aside
                    className={`min-w-0 space-y-4 ${
                      [2, 3, 4].includes(etapaAtual) ? "" : "hidden"
                    }`}
                  >
                    <SectionCard
                      id={`sec-arquivos-${uid}`}
                      icon={Paperclip}
                      title="Folder e programação"
                      subtitle="Arquivos persistidos no banco."
                      show={etapaAtual === 3}
                    >
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/45">
                          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
                            <div>
                              <h4 className="font-black text-zinc-950 dark:text-white text-xs">
                                Folder do evento
                              </h4>
                              <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                                PNG/JPG até 2 MB.
                              </p>
                            </div>
                            <ImageIcon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                          </div>

                          <div className="mt-3 flex justify-center">
                            {folderPreview ? (
                              <div className="relative aspect-[3/4] w-full max-w-[120px] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                                <img
                                  src={folderPreview}
                                  alt="Pré-visualização do novo folder"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : folderExistenteUrl ? (
                              <div className="relative aspect-[3/4] w-full max-w-[120px] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                                <img
                                  src={folderExistenteUrl}
                                  alt="Folder atual"
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="flex aspect-[3/4] w-full max-w-[120px] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white text-[10px] font-bold text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/40">
                                <div className="flex flex-col items-center gap-1 text-center">
                                  <ImageIcon
                                    className="h-4 w-4 opacity-60"
                                    aria-hidden="true"
                                  />
                                  <span>Sem folder</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <input
                              ref={folderInputRef}
                              id={`evento-folder-${uid}`}
                              type="file"
                              accept="image/png,image/jpeg"
                              onChange={onChangeFolder}
                              className="sr-only"
                            />
                            <ActionButton
                              type="button"
                              tone="info"
                              size="sm"
                              onClick={() => folderInputRef.current?.click()}
                            >
                              <UploadCloud className="h-3.5 w-3.5" /> Selecionar
                            </ActionButton>
                            {(folderFile ||
                              folderExistenteUrl ||
                              removerFolderExistente) && (
                              <ActionButton
                                type="button"
                                tone="danger"
                                size="sm"
                                onClick={limparFolder}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Remover
                              </ActionButton>
                            )}
                          </div>

                          {removerFolderExistente && (
                            <p className="mt-1 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                              Folder será removido.
                            </p>
                          )}
                          {folderFile && (
                            <p className="mt-1 break-words text-[10px] text-zinc-600 dark:text-zinc-300">
                              Novo: <strong>{folderFile.name}</strong>
                            </p>
                          )}
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/45">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h4 className="text-xs font-black text-zinc-950 dark:text-white">
                                Programação PDF
                              </h4>
                              <p className="mt-0.5 text-[10px] text-zinc-600 dark:text-zinc-300">
                                PDF até {MAX_PROGRAMACAO_MB} MB.
                              </p>
                            </div>
                            <FileText className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                          </div>

                          <div className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
                            {programacaoFile ? (
                              <div className="flex items-start gap-2">
                                <FileText className="mt-0.5 h-4 w-4 text-sky-700 dark:text-sky-300" />
                                <div className="min-w-0">
                                  <p className="break-words text-[11px] font-black text-zinc-950 dark:text-white">
                                    {programacaoFile.name}
                                  </p>
                                </div>
                              </div>
                            ) : programacaoExistenteUrl ? (
                              <div className="flex items-start gap-2">
                                <FileText className="mt-0.5 h-4 w-4 text-sky-700 dark:text-sky-300" />
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black text-zinc-950 dark:text-white">
                                    Programação atual
                                  </p>
                                  <a
                                    href={programacaoExistenteUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-0.5 inline-flex text-[10px] font-bold text-sky-700 underline dark:text-sky-300"
                                  >
                                    Abrir PDF
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                Nenhuma programação.
                              </p>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <input
                              ref={pdfInputRef}
                              id={`evento-programacao-${uid}`}
                              type="file"
                              accept="application/pdf"
                              onChange={onChangeProgramacao}
                              className="sr-only"
                            />
                            <ActionButton
                              type="button"
                              tone="info"
                              size="sm"
                              onClick={() => pdfInputRef.current?.click()}
                            >
                              <UploadCloud className="h-3.5 w-3.5" /> Selecionar
                            </ActionButton>
                            {(programacaoFile ||
                              programacaoExistenteUrl ||
                              removerProgramacaoExistente) && (
                              <ActionButton
                                type="button"
                                tone="danger"
                                size="sm"
                                onClick={limparProgramacao}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Remover
                              </ActionButton>
                            )}
                          </div>
                          {removerProgramacaoExistente && (
                            <p className="mt-1 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                              PDF será removido.
                            </p>
                          )}
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard
                      id={`sec-restricao-${uid}`}
                      icon={Lock}
                      title="Restrição de inscrição"
                      subtitle="O evento pode ficar com inscrição bloqueada para não elegíveis."
                      show={etapaAtual === 2}
                    >
                      <label className="inline-flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={restrito}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRestrito(checked);
                            if (!checked) {
                              setRestricaoUi("");
                            } else if (!restricaoUi) {
                              setRestricaoUi(RESTRICAO_UI.TODOS_SERVIDORES);
                            }
                          }}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-sm font-black text-zinc-950 dark:text-white">
                            {restrito ? "Evento restrito" : "Evento padrão"}
                          </span>
                        </span>
                      </label>

                      {restrito && (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-1.5 text-xs text-zinc-800 dark:text-zinc-100">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`restricao-${uid}`}
                                checked={
                                  restricaoUi === RESTRICAO_UI.TODOS_SERVIDORES
                                }
                                onChange={() =>
                                  setRestricaoUi(RESTRICAO_UI.TODOS_SERVIDORES)
                                }
                              />
                              <span>Todos com registro funcional</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`restricao-${uid}`}
                                checked={
                                  restricaoUi === RESTRICAO_UI.LISTA_REGISTROS
                                }
                                onChange={() =>
                                  setRestricaoUi(RESTRICAO_UI.LISTA_REGISTROS)
                                }
                              />
                              <span>Lista específica de registros</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`restricao-${uid}`}
                                checked={restricaoUi === RESTRICAO_UI.CARGOS}
                                onChange={() =>
                                  setRestricaoUi(RESTRICAO_UI.CARGOS)
                                }
                              />
                              <span>Cargos permitidos</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`restricao-${uid}`}
                                checked={restricaoUi === RESTRICAO_UI.UNIDADES}
                                onChange={() =>
                                  setRestricaoUi(RESTRICAO_UI.UNIDADES)
                                }
                              />
                              <span>Unidades permitidas</span>
                            </label>
                          </div>

                          {restricaoUi === RESTRICAO_UI.LISTA_REGISTROS && (
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/45">
                              <FieldLabel htmlFor={`registros-${uid}`}>
                                Registros autorizados
                              </FieldLabel>
                              <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
                                <TextInput
                                  id={`registros-${uid}`}
                                  value={registroInput}
                                  onChange={(e) =>
                                    setRegistroInput(e.target.value)
                                  }
                                  onPaste={(e) => {
                                    const text =
                                      e.clipboardData?.getData("text") || "";
                                    const regs = parseRegistrosBulk(text);
                                    if (regs.length > 1) {
                                      e.preventDefault();
                                      setRegistrosPermitidos((prev) => [
                                        ...new Set([...prev, ...regs]),
                                      ]);
                                      setRegistroInput("");
                                    }
                                  }}
                                  placeholder="Registros de 6 dígitos"
                                />
                                <ActionButton
                                  type="button"
                                  tone="info"
                                  onClick={addRegistros}
                                >
                                  Adicionar
                                </ActionButton>
                              </div>
                              {!!registrosPermitidos.length && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {registrosPermitidos.map((registro) => (
                                    <Chip key={registro} tone="amber">
                                      {registro}
                                      <button
                                        type="button"
                                        onClick={() => removeRegistro(registro)}
                                        className="ml-1 rounded-full hover:bg-black/10"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Chip>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {restricaoUi === RESTRICAO_UI.CARGOS && (
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/45">
                              <FieldLabel htmlFor={`cargo-${uid}`}>
                                Cargo permitido
                              </FieldLabel>
                              <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
                                <SelectInput
                                  id={`cargo-${uid}`}
                                  value={cargoAddId}
                                  onChange={(e) =>
                                    setCargoAddId(e.target.value)
                                  }
                                >
                                  <option value="">Selecione um cargo</option>
                                  {cargosDisponiveis.map((cargo) => (
                                    <option
                                      key={cargo.id}
                                      value={String(cargo.id)}
                                    >
                                      {cargoLabel(cargo)}
                                    </option>
                                  ))}
                                </SelectInput>
                                <ActionButton
                                  type="button"
                                  tone="info"
                                  onClick={addCargo}
                                >
                                  Adicionar
                                </ActionButton>
                              </div>
                              {!!cargosPermitidos.length && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {cargosPermitidos.map((id) => (
                                    <Chip key={id} tone="amber">
                                      {cargoLabel(cargosById.get(Number(id))) ||
                                        `Cargo ${id}`}
                                      <button
                                        type="button"
                                        onClick={() => removeCargo(id)}
                                        className="ml-1 rounded-full hover:bg-black/10"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Chip>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {restricaoUi === RESTRICAO_UI.UNIDADES && (
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/45">
                              <FieldLabel htmlFor={`unidade-permitida-${uid}`}>
                                Unidade permitida
                              </FieldLabel>
                              <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
                                <SelectInput
                                  id={`unidade-permitida-${uid}`}
                                  value={unidadeAddId}
                                  onChange={(e) =>
                                    setUnidadeAddId(e.target.value)
                                  }
                                >
                                  <option value="">
                                    Selecione uma unidade
                                  </option>
                                  {unidades.map((unidade) => (
                                    <option
                                      key={unidade.id}
                                      value={String(unidade.id)}
                                    >
                                      {unidade.nome}
                                    </option>
                                  ))}
                                </SelectInput>
                                <ActionButton
                                  type="button"
                                  tone="info"
                                  onClick={addUnidade}
                                >
                                  Adicionar
                                </ActionButton>
                              </div>
                              {!!unidadesPermitidas.length && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {unidadesPermitidas.map((id) => (
                                    <Chip key={id} tone="amber">
                                      {unidadesById.get(Number(id))?.nome ||
                                        `Unidade ${id}`}
                                      <button
                                        type="button"
                                        onClick={() => removeUnidade(id)}
                                        className="ml-1 rounded-full hover:bg-black/10"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Chip>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard
                      id={`sec-pos-${uid}`}
                      icon={CheckCircle2}
                      title="Pós-teste / avaliação após o evento"
                      subtitle="Defina se haverá teste avaliativo para emissão do certificado."
                      show={etapaAtual === 4}
                    >
                      <label className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/45">
                        <input
                          type="checkbox"
                          checked={testeObrigatorio}
                          onChange={(e) =>
                            setTesteObrigatorio(e.target.checked)
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-zinc-950 dark:text-white">
                            Exigir teste
                          </span>
                        </span>
                      </label>

                      {testeObrigatorio && (
                        <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/45">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-[11px] text-zinc-700 dark:text-zinc-200">
                              <strong>Config:</strong>{" "}
                              {testeConfig.questionario_id ? (
                                <>
                                  {testeConfig.titulo || "Questionário"} •{" "}
                                  {Number(testeConfig.questoes_count || 0)} q. •
                                  mín. {Number(testeConfig.nota_minima || 0)}
                                </>
                              ) : (
                                <>Nenhum teste configurado</>
                              )}
                            </div>

                            <ActionButton
                              type="button"
                              tone="info"
                              size="sm"
                              onClick={() => {
                                if (!evento?.id) {
                                  toast.info(
                                    "Salve o evento para configurar o teste depois.",
                                  );
                                  return;
                                }
                                setModalQuestionarioAberto(true);
                              }}
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              {evento?.id ? "Configurar" : "Salve o evento"}
                            </ActionButton>
                          </div>
                        </div>
                      )}
                    </SectionCard>
                  </aside>
                </form>
              )}
            </main>

            <footer className="border-t border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Campos obrigatórios: título, tipo, local, unidade e ao menos
                  uma turma válida.
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <ActionButton
                    type="button"
                    tone="neutral"
                    disabled={closeBlocked}
                    onClick={closeBlocked ? undefined : voltarEtapa}
                  >
                    Voltar
                  </ActionButton>
                  {etapaAtual < 5 ? (
                    <ActionButton
                      type="button"
                      tone="success"
                      disabled={salvando}
                      onClick={avancarEtapa}
                    >
                      {salvando
                        ? "Salvando rascunho..."
                        : "Salvar rascunho e continuar"}
                    </ActionButton>
                  ) : (
                    <ActionButton
                      type="submit"
                      form={formId}
                      tone="success"
                      disabled={
                        salvando ||
                        carregandoPreTesteResumo ||
                        pendenciasRevisao.length > 0
                      }
                    >
                      <Save className="h-4 w-4" aria-hidden="true" />
                      {salvando
                        ? "Publicando..."
                        : carregandoPreTesteResumo
                          ? "Carregando avaliações..."
                          : "PUBLICAR EVENTO"}
                    </ActionButton>
                  )}
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>

      <Footer />

      {modalTurmaAberto && (
        <ModalTurma
          open={modalTurmaAberto}
          onClose={() => {
            setModalTurmaAberto(false);
            setEditandoTurmaIndex(null);
          }}
          onSalvar={salvarTurma}
          turma={
            editandoTurmaIndex === null || editandoTurmaIndex === undefined
              ? null
              : turmas[editandoTurmaIndex]
          }
          organizadores={organizadoresDisponiveis}
        />
      )}

      {modalQuestionarioAberto && evento?.id && (
        <ModalQuestionarioEvento
          open={modalQuestionarioAberto}
          isOpen={modalQuestionarioAberto}
          eventoId={evento.id}
          onClose={() => setModalQuestionarioAberto(false)}
          onConfigSaved={(questionario) => {
            if (questionario?.id) {
              setTesteObrigatorio(true);
              setTesteConfig((prev) => ({
                ...prev,
                titulo: questionario?.titulo || prev.titulo,
                questionario_id: questionario.id,
                questoes_count: Array.isArray(questionario?.questoes)
                  ? questionario.questoes.length
                  : Number(
                      questionario?.questoes_count || prev.questoes_count || 0,
                    ),
                peso_total: Number(
                  questionario?.peso_total || prev.peso_total || 0,
                ),
                publicado: Boolean(questionario?.publicado),
              }));
            }
            setModalQuestionarioAberto(false);
          }}
        />
      )}

      <ConfirmacaoViewport
        open={!!confirmTurma.open}
        onClose={() => setConfirmTurma({ open: false, idx: null, turma: null })}
        onConfirm={confirmarRemoverTurma}
        titulo="Remover turma?"
        descricao={
          confirmTurma?.turma?.id
            ? `A turma "${confirmTurma.turma.nome}" será removida do payload de edição.

Se ela possuir inscrições, presenças ou certificados, o backend bloqueará a alteração ao salvar.`
            : `Remover a turma "${confirmTurma?.turma?.nome || "Turma"}" do rascunho?`
        }
        confirmarTexto="Remover"
        cancelarTexto="Cancelar"
        danger
      />
    </>
  );
}
