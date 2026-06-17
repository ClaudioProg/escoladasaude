// ✅ frontend/src/pages/GestaoCertificados.jsx — v2.1
// Atualizado em: 02/06/2026
// Plataforma Escola da Saúde
//
// Tela operacional contextual para gestão de certificados.
//
// Revisão premium v2.1:
// - tela acessada pelo Painel do Gestor;
// - evento_id obrigatório via URL;
// - sem tela geral quando acessada pelo painel;
// - carrega somente o evento informado;
// - HeaderHero global oficial limpo;
// - botões, contexto, badges e stats abaixo do HeaderHero;
// - sem guias/blocos recolhidos no modo contextual;
// - todas as turmas e participantes já aparecem abertas;
// - corrige erro fatal: formatarParaISO inexistente;
// - corrige Botao variant inválido: sem variant="secondary";
// - preserva filtros, busca, processamento de pendentes e download;
// - preserva certificados emitidos como documentos oficiais;
// - sem /api manual no frontend;
// - usa contrato oficial api.certificado.adminArvore;
// - usa contrato oficial api.certificado.processarPendentesPorTurma;
// - usa contrato oficial api.certificado.download;
// - mobile-first, acessível, institucional e operacional.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  FilePlus2,
  Info,
  Loader2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import CarregandoSkeleton from "../components/ui/CarregandoSkeleton";
import ErroCarregamento from "../components/ui/ErroCarregamento";
import NadaEncontrado from "../components/ui/NadaEncontrado";
import {
  notifyError,
  notifySuccess,
  notifyWarning,
} from "../components/ui/AppToast";
import { api } from "../services/api";
import { downloadBlob } from "../utils/downloadArquivo";
import { extractYmd, formatDateBr } from "../utils/dateTime";

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

function extrairData(response) {
  return response?.data ?? response ?? null;
}

function obterMensagemErro(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.data?.message ||
    error?.message ||
    fallback
  );
}

function validarFacade(nome, fn) {
  if (typeof fn !== "function") {
    throw new Error(`Facade ausente no api.js: ${nome}.`);
  }
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function ymd(value) {
  const iso = extractYmd(value);
  return iso || "";
}

function dataBR(value) {
  const iso = ymd(value);
  return iso ? formatDateBr(iso) : "—";
}

function hojeYMD() {
  const date = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function normalizarBusca(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function nomeArquivoSeguro(value) {
  const nome = String(value || "certificado")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 120);

  return nome || "certificado";
}

function getEventoId(evento) {
  return toPositiveInt(evento?.evento_id || evento?.id);
}

function getTurmaId(turma) {
  return toPositiveInt(turma?.turma_id || turma?.id);
}

function getEventoTitulo(evento) {
  return evento?.evento_titulo || evento?.titulo || "Evento";
}

function getTurmaTitulo(turma) {
  return (
    turma?.turma_nome || turma?.nome || `Turma #${getTurmaId(turma) || "—"}`
  );
}

function getNumeroCertificado(participante) {
  return participante?.numero_certificado || participante?.numero || "";
}

function getNumeroCertificadoLabel(participante) {
  return getNumeroCertificado(participante) || "Número não informado";
}

function participanteTemCertificado(participante) {
  return Boolean(
    participante?.emitido &&
    participante?.certificado_id &&
    (!participante?.status ||
      ["emitido", "enviado"].includes(
        String(participante.status).toLowerCase(),
      )),
  );
}

function inferirStatusTurma(turma) {
  const status = String(
    turma?.status || turma?.status_calculado || "",
  ).toLowerCase();

  if (["programado", "andamento", "encerrado"].includes(status)) {
    return status;
  }

  const inicio = ymd(turma?.data_inicio);
  const fim = ymd(turma?.data_fim || turma?.data_inicio);
  const hoje = hojeYMD();

  if (inicio && hoje < inicio) {
    return "programado";
  }
  if (inicio && fim && hoje >= inicio && hoje <= fim) {
    return "andamento";
  }
  if (fim && hoje > fim) {
    return "encerrado";
  }

  return "programado";
}

function statusLabel(status) {
  if (status === "programado") {
    return "Programado";
  }
  if (status === "andamento") {
    return "Em andamento";
  }
  if (status === "encerrado") {
    return "Encerrado";
  }
  return "Indefinido";
}

function statusTone(status) {
  if (status === "programado") {
    return "emerald";
  }
  if (status === "andamento") {
    return "amber";
  }
  if (status === "encerrado") {
    return "rose";
  }
  return "slate";
}

function periodoTurma(turma) {
  const inicio = dataBR(turma?.data_inicio);
  const fim = dataBR(turma?.data_fim || turma?.data_inicio);

  if (inicio === "—" && fim === "—") {
    return "Período não informado";
  }
  if (inicio === fim) {
    return inicio;
  }

  return `${inicio} até ${fim}`;
}

function normalizarEventoCertificado(evento) {
  const eventoId = getEventoId(evento);

  if (!eventoId) {
    return null;
  }

  const turmas = Array.isArray(evento?.turmas)
    ? evento.turmas
        .map((turma) => {
          const turmaId = getTurmaId(turma);
          if (!turmaId) {
            return null;
          }

          return {
            ...turma,
            id: turmaId,
            turma_id: turmaId,
            nome: getTurmaTitulo(turma),
            participantes: Array.isArray(turma?.participantes)
              ? turma.participantes
              : [],
            totais: {
              presentes: Number(turma?.totais?.presentes || 0),
              emitidos: Number(turma?.totais?.emitidos || 0),
              pendentes: Number(turma?.totais?.pendentes || 0),
              ...turma?.totais,
            },
          };
        })
        .filter(Boolean)
    : [];

  return {
    ...evento,
    id: eventoId,
    evento_id: eventoId,
    titulo: getEventoTitulo(evento),
    turmas,
  };
}

function calcularKpis(evento) {
  let turmas = 0;
  let presentes = 0;
  let emitidos = 0;
  let pendentes = 0;
  let participantes = 0;

  for (const turma of evento?.turmas || []) {
    turmas += 1;

    const participantesTurma = Array.isArray(turma?.participantes)
      ? turma.participantes
      : [];

    participantes += participantesTurma.length;

    const totais = turma?.totais || {};

    const presentesTurma =
      Number(totais.presentes || 0) ||
      participantesTurma.filter((item) => item?.presente === true).length;

    const emitidosTurma =
      Number(totais.emitidos || 0) ||
      participantesTurma.filter((item) => participanteTemCertificado(item))
        .length;

    const pendentesTurma =
      Number(totais.pendentes || 0) ||
      Math.max(0, presentesTurma - emitidosTurma);

    presentes += presentesTurma;
    emitidos += emitidosTurma;
    pendentes += pendentesTurma;
  }

  const percentualEmitido =
    presentes > 0 ? Math.round((emitidos / presentes) * 100) : 0;

  return {
    turmas,
    participantes,
    presentes,
    emitidos,
    pendentes,
    percentual_emitido: percentualEmitido,
  };
}

function filtrarEvento(evento, busca, filtroStatus, filtroPendencia) {
  if (!evento) {
    return null;
  }

  const termo = normalizarBusca(busca);
  const eventoTitulo = getEventoTitulo(evento);

  const turmas = [];

  for (const turma of evento?.turmas || []) {
    const statusTurma = inferirStatusTurma(turma);
    const pendentes = Number(turma?.totais?.pendentes || 0);
    const emitidos = Number(turma?.totais?.emitidos || 0);
    const presentes = Number(turma?.totais?.presentes || 0);

    if (filtroStatus !== "todos" && statusTurma !== filtroStatus) {
      continue;
    }

    if (filtroPendencia === "pendentes" && pendentes <= 0) {
      continue;
    }

    if (
      filtroPendencia === "emitidos" &&
      !(presentes > 0 && emitidos >= presentes)
    ) {
      continue;
    }

    const participantes = Array.isArray(turma?.participantes)
      ? turma.participantes
      : [];

    const textoTurma = normalizarBusca(
      `${eventoTitulo} ${getTurmaTitulo(turma)} ${getTurmaId(turma) || ""}`,
    );

    const participantesFiltrados = termo
      ? participantes.filter((participante) => {
          const textoParticipante = normalizarBusca(
            [
              participante?.nome,
              participante?.email,
              participante?.numero_certificado,
              participante?.numero,
              participante?.codigo_validacao,
            ].join(" "),
          );

          return textoParticipante.includes(termo);
        })
      : participantes;

    const turmaCombina = !termo || textoTurma.includes(termo);

    if (!turmaCombina && participantesFiltrados.length === 0) {
      continue;
    }

    turmas.push({
      ...turma,
      status_calculado: statusTurma,
      participantes: turmaCombina ? participantes : participantesFiltrados,
    });
  }

  return {
    ...evento,
    turmas,
  };
}

/* ─────────────────────────────────────────────
 * Componentes locais
 * ───────────────────────────────────────────── */

function ActionButton({
  children,
  onClick,
  disabled = false,
  tone = "neutral",
  type = "button",
}) {
  const tones = {
    neutral:
      "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900",
    amber:
      "border-amber-700 bg-amber-700 text-white hover:bg-amber-800 dark:border-amber-600",
    emerald:
      "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 dark:border-emerald-600",
    rose: "border-rose-700 bg-rose-700 text-white hover:bg-rose-800 dark:border-rose-600",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60",
        tones[tone] || tones.neutral,
      )}
    >
      {children}
    </button>
  );
}

function Badge({ tone = "slate", children }) {
  const tones = {
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200",
    amber:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200",
    rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-200",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/40 dark:bg-cyan-950/25 dark:text-cyan-200",
    violet:
      "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/40 dark:bg-violet-950/25 dark:text-violet-200",
  };

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black",
        tones[tone] || tones.slate,
      )}
    >
      {children}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone = "amber" }) {
  const tones = {
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100",
    rose: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-100",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900/40 dark:bg-cyan-950/25 dark:text-cyan-100",
    slate:
      "border-slate-200 bg-white text-slate-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
    violet:
      "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/25 dark:text-violet-100",
  };

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <span
            className={classNames(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border",
              tones[tone] || tones.amber,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-400">
              {label}
            </p>

            <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
              {value}
            </p>

            {hint ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                {hint}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function Toolbar({
  busca,
  setBusca,
  filtroStatus,
  setFiltroStatus,
  filtroPendencia,
  setFiltroPendencia,
  loading,
  onRefresh,
}) {
  return (
    <section
      aria-label="Filtros de gestão de certificados"
      className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-zinc-400">
            Filtros operacionais
          </p>

          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
            Pesquise por participante, turma, número de certificado ou código de
            validação.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 xl:max-w-4xl xl:flex-row xl:items-center xl:justify-end">
          <div className="relative w-full xl:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />

            <input
              type="search"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar certificados..."
              className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-950 outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:ring-amber-950"
              aria-label="Buscar certificados"
            />

            {busca ? (
              <button
                type="button"
                onClick={() => setBusca("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <select
            value={filtroStatus}
            onChange={(event) => setFiltroStatus(event.target.value)}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:ring-amber-950"
            aria-label="Filtrar por status da turma"
          >
            <option value="todos">Todos os status</option>
            <option value="programado">Programados</option>
            <option value="andamento">Em andamento</option>
            <option value="encerrado">Encerrados</option>
          </select>

          <select
            value={filtroPendencia}
            onChange={(event) => setFiltroPendencia(event.target.value)}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:ring-amber-950"
            aria-label="Filtrar pendências"
          >
            <option value="todos">Todos</option>
            <option value="pendentes">Com pendências</option>
            <option value="emitidos">Tudo emitido</option>
          </select>

          <ActionButton onClick={onRefresh} disabled={loading}>
            <RefreshCcw
              className={classNames("h-4 w-4", loading && "animate-spin")}
              aria-hidden="true"
            />
            Recarregar
          </ActionButton>
        </div>
      </div>
    </section>
  );
}

function ConfirmacaoProcessamentoModal({
  confirmProcessar,
  executando,
  onClose,
  onConfirm,
}) {
  if (!confirmProcessar) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-processar-certificados-titulo"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-zinc-950 dark:ring-zinc-800">
        <div className="border-b border-slate-200 p-5 dark:border-zinc-800">
          <h2
            id="modal-processar-certificados-titulo"
            className="text-xl font-black text-slate-950 dark:text-white"
          >
            Processar certificados pendentes
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
            Esta ação emitirá apenas certificados ainda pendentes desta turma.
            Certificados já emitidos/enviados serão preservados e não serão
            resetados, sobrescritos ou apagados.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100">
            <p className="font-black">
              {confirmProcessar?.turma_nome ||
                `Turma #${confirmProcessar?.turma_id || "—"}`}
            </p>

            {confirmProcessar?.totais ? (
              <p className="mt-1 text-xs font-semibold">
                Emitidos: {confirmProcessar.totais.emitidos || 0} • Pendentes:{" "}
                {confirmProcessar.totais.pendentes || 0}
              </p>
            ) : null}
          </div>

          {executando ? (
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Processando pendentes...
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 dark:border-zinc-800 sm:flex-row sm:justify-end">
          <ActionButton onClick={onClose} disabled={executando}>
            Cancelar
          </ActionButton>

          <ActionButton onClick={onConfirm} disabled={executando} tone="amber">
            {executando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            )}
            {executando ? "Processando..." : "Processar pendentes"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function ParticipanteCard({ participante, onDownload, baixando }) {
  const hasCertificado = participanteTemCertificado(participante);
  const numeroCertificado = getNumeroCertificado(participante);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-black text-slate-950 dark:text-white">
            {participante?.nome || "Participante"}
          </p>

          <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-zinc-400">
            {participante?.email || "E-mail não informado"}
          </p>

          {hasCertificado ? (
            <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-100 dark:ring-emerald-800/60">
              Certificado nº:{" "}
              <span className="font-black">
                {numeroCertificado || getNumeroCertificadoLabel(participante)}
              </span>
            </p>
          ) : null}

          {participante?.codigo_validacao ? (
            <p className="mt-2 break-words rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
              Código:{" "}
              <span className="font-black">
                {participante.codigo_validacao}
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Badge tone={hasCertificado ? "emerald" : "amber"}>
            {hasCertificado ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {hasCertificado ? "Emitido" : "Pendente"}
          </Badge>

          {hasCertificado ? (
            <ActionButton
              onClick={() => onDownload(participante)}
              disabled={baixando}
            >
              {baixando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {baixando ? "Baixando..." : "Baixar"}
            </ActionButton>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────
 * Página
 * ───────────────────────────────────────────── */

export default function GestaoCertificados() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const eventoIdParam = useMemo(
    () => toPositiveInt(searchParams.get("evento_id")),
    [searchParams],
  );

  const [evento, setEvento] = useState(null);
  const [data, setData] = useState([]);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroPendencia, setFiltroPendencia] = useState("todos");

  const [confirmProcessar, setConfirmProcessar] = useState(null);
  const [executandoProcessamento, setExecutandoProcessamento] = useState(false);
  const [baixandoId, setBaixandoId] = useState(null);

  const liveRef = useRef(null);
  const mountedRef = useRef(true);

  const setLive = useCallback((message) => {
    if (liveRef.current) {
      liveRef.current.textContent = message || "";
    }
  }, []);

  const voltarPainelGestor = useCallback(() => {
    navigate("/administrador");
  }, [navigate]);

  const carregarArvore = useCallback(async () => {
    try {
      validarFacade(
        "api.certificado.adminArvore",
        api?.certificado?.adminArvore,
      );

      setLoading(true);
      setErro("");
      setEvento(null);
      setData([]);
      setLive("Carregando certificados do evento.");

      if (!eventoIdParam) {
        setLive("Contexto de evento ausente.");
        return;
      }

      const response = await api.certificado.adminArvore();
      const payload = extrairData(response);
      const lista = Array.isArray(payload) ? payload : [];

      const normalizada = lista
        .map(normalizarEventoCertificado)
        .filter(Boolean);

      const eventoEncontrado =
        normalizada.find((item) => Number(item.evento_id) === eventoIdParam) ||
        null;

      if (!mountedRef.current) {
        return;
      }

      if (!eventoEncontrado) {
        setErro(
          "O evento informado no link não foi encontrado na gestão de certificados.",
        );
        setEvento(null);
        setData([]);
        setLive("Evento não encontrado na gestão de certificados.");
        return;
      }

      setEvento(eventoEncontrado);
      setData([eventoEncontrado]);
      setLive("Certificados do evento carregados.");
    } catch (error) {
      console.error("[GestaoCertificados] erro ao carregar árvore:", error);

      if (!mountedRef.current) {
        return;
      }

      const message = obterMensagemErro(
        error,
        "Não foi possível carregar a gestão de certificados.",
      );

      setErro(message);
      setEvento(null);
      setData([]);
      notifyError(message);
      setLive("Erro ao carregar gestão de certificados.");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [eventoIdParam, setLive]);

  useEffect(() => {
    mountedRef.current = true;
    document.title = "Gestão de certificados do evento — Escola da Saúde";
    carregarArvore();

    return () => {
      mountedRef.current = false;
    };
  }, [carregarArvore]);

  const kpis = useMemo(() => {
    return calcularKpis(evento);
  }, [evento]);

  const eventoFiltrado = useMemo(() => {
    return filtrarEvento(evento, busca, filtroStatus, filtroPendencia);
  }, [busca, evento, filtroPendencia, filtroStatus]);

  const pedirProcessamentoPendentes = useCallback((turma) => {
    const turmaId = getTurmaId(turma);

    if (!turmaId) {
      notifyWarning("Turma inválida para processamento.");
      return;
    }

    const pendentes = Number(turma?.totais?.pendentes || 0);

    if (pendentes <= 0) {
      notifyWarning(
        "Esta turma não possui certificados pendentes para processar.",
      );
      return;
    }

    setConfirmProcessar({
      turma_id: turmaId,
      turma_nome: getTurmaTitulo(turma),
      totais: turma?.totais || null,
    });
  }, []);

  const confirmarProcessamentoPendentes = useCallback(async () => {
    if (!confirmProcessar?.turma_id) {
      return;
    }

    try {
      validarFacade(
        "api.certificado.processarPendentesPorTurma",
        api?.certificado?.processarPendentesPorTurma,
      );

      const turmaId = Number(confirmProcessar.turma_id);

      setExecutandoProcessamento(true);
      setLive(`Processando certificados pendentes da turma ${turmaId}.`);

      await api.certificado.processarPendentesPorTurma(turmaId);

      notifySuccess("Certificados pendentes processados com sucesso.");
      setConfirmProcessar(null);
      await carregarArvore();
      setLive("Processamento de pendentes concluído.");
    } catch (error) {
      console.error("[GestaoCertificados] erro ao processar pendentes:", error);

      notifyError(
        obterMensagemErro(
          error,
          "Não foi possível processar os certificados pendentes da turma.",
        ),
      );
      setLive("Erro ao processar certificados pendentes.");
    } finally {
      setExecutandoProcessamento(false);
    }
  }, [confirmProcessar, carregarArvore, setLive]);

  const baixarCertificado = useCallback(
    async (participante) => {
      const certificadoId = Number(participante?.certificado_id);

      if (!Number.isInteger(certificadoId) || certificadoId <= 0) {
        notifyWarning("Certificado sem ID para download.");
        return;
      }

      try {
        validarFacade("api.certificado.download", api?.certificado?.download);

        setBaixandoId(certificadoId);
        setLive("Baixando certificado.");

        const result = await api.certificado.download(certificadoId);
        const blob = result?.blob || result?.data || result;
        const filename =
          result?.filename ||
          `${nomeArquivoSeguro(
            getNumeroCertificado(participante) ||
              `certificado_${participante?.nome || certificadoId}_${certificadoId}`,
          )}.pdf`;

        downloadBlob(filename, blob);
        notifySuccess("Download iniciado.");
      } catch (error) {
        console.error("[GestaoCertificados] erro ao baixar:", error);

        notifyError(
          obterMensagemErro(error, "Não foi possível baixar o certificado."),
        );
        setLive("Erro ao baixar certificado.");
      } finally {
        setBaixandoId(null);
      }
    },
    [setLive],
  );

  const eventoTitulo = evento ? getEventoTitulo(evento) : "";
  const turmasFiltradas = Array.isArray(eventoFiltrado?.turmas)
    ? eventoFiltrado.turmas
    : [];

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <p ref={liveRef} className="sr-only" aria-live="polite" />

      <ConfirmacaoProcessamentoModal
        confirmProcessar={confirmProcessar}
        executando={executandoProcessamento}
        onClose={() => {
          if (!executandoProcessamento) {
            setConfirmProcessar(null);
          }
        }}
        onConfirm={confirmarProcessamentoPendentes}
      />

      <main
        id="conteudo"
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8"
      >
        <HeaderHero
          titulo="Gestão de certificados"
          subtitulo="Tela operacional contextual do Painel do Gestor para acompanhar certificados por turma, baixar documentos emitidos e processar apenas pendências sem sobrescrever certificados oficiais."
          icone={Award}
          campanhaMes={new Date().getMonth() + 1}
          tamanho="lg"
          raio="xl"
        />

        <section
          className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5"
          aria-label="Contexto operacional do evento"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-zinc-400">
                Contexto operacional
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {eventoIdParam ? (
                  <Badge tone="amber">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Evento ID {eventoIdParam}
                  </Badge>
                ) : (
                  <Badge tone="rose">
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    Evento não informado
                  </Badge>
                )}

                {eventoTitulo ? (
                  <Badge tone="violet">
                    <Award className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="max-w-[18rem] truncate sm:max-w-xl">
                      {eventoTitulo}
                    </span>
                  </Badge>
                ) : null}

                <Badge tone="emerald">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Certificado oficial preservado
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ActionButton onClick={voltarPainelGestor}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Painel do Gestor
              </ActionButton>

              <ActionButton
                onClick={carregarArvore}
                disabled={loading || !eventoIdParam}
                tone="amber"
              >
                <RefreshCcw
                  className={classNames("h-4 w-4", loading && "animate-spin")}
                  aria-hidden="true"
                />
                Atualizar dados
              </ActionButton>
            </div>
          </div>
        </section>

        {loading ? (
          <div
            className="sticky top-0 z-50 mt-4 h-1 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950/30"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Carregando gestão de certificados"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-amber-700 dark:bg-amber-400" />
          </div>
        ) : null}

        {!eventoIdParam ? (
          <section className="mt-5 overflow-hidden rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <Info className="h-6 w-6" aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black text-slate-950 dark:text-white">
                  Contexto do evento não informado
                </h2>

                <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
                  Esta tela deve ser acessada pelo Painel do Gestor. O endereço
                  precisa conter um <strong>evento_id</strong> válido para
                  carregar certificados do evento específico.
                </p>

                <div className="mt-4">
                  <ActionButton onClick={voltarPainelGestor} tone="amber">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Voltar ao Painel do Gestor
                  </ActionButton>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section
              className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Resumo operacional dos certificados"
            >
              <MetricCard
                icon={Users}
                label="Presentes"
                value={loading ? "…" : kpis.presentes}
                hint="Participantes elegíveis"
                tone="cyan"
              />

              <MetricCard
                icon={FileCheck2}
                label="Emitidos"
                value={loading ? "…" : kpis.emitidos}
                hint="Certificados oficiais"
                tone="emerald"
              />

              <MetricCard
                icon={Sparkles}
                label="Pendentes"
                value={loading ? "…" : kpis.pendentes}
                hint="Aguardam processamento"
                tone="amber"
              />

              <MetricCard
                icon={CalendarDays}
                label="Turmas"
                value={loading ? "…" : kpis.turmas}
                hint="Turmas vinculadas"
                tone="slate"
              />

              <MetricCard
                icon={UserCheck}
                label="Participantes"
                value={loading ? "…" : kpis.participantes}
                hint="Registros carregados"
                tone="violet"
              />

              <MetricCard
                icon={Award}
                label="% emitido"
                value={loading ? "…" : `${kpis.percentual_emitido}%`}
                hint={`${kpis.emitidos}/${kpis.presentes || 0} elegíveis`}
                tone="rose"
              />
            </section>

            <section className="mt-5 rounded-[2rem] border border-amber-200 bg-amber-50/80 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20 sm:p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-800 dark:text-amber-200" />
                <p className="text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                  Certificados já emitidos são documentos eletrônicos oficiais:
                  possuem número, código de validação e histórico. O
                  processamento desta tela deve emitir apenas pendências, sem
                  resetar, sobrescrever ou apagar certificados existentes.
                </p>
              </div>
            </section>

            <section className="mt-5">
              <Toolbar
                busca={busca}
                setBusca={setBusca}
                filtroStatus={filtroStatus}
                setFiltroStatus={setFiltroStatus}
                filtroPendencia={filtroPendencia}
                setFiltroPendencia={setFiltroPendencia}
                loading={loading}
                onRefresh={carregarArvore}
              />
            </section>

            {loading ? (
              <section
                className="mt-5 grid gap-4"
                aria-label="Carregando certificados"
              >
                <CarregandoSkeleton height={160} />
                <CarregandoSkeleton height={160} />
                <CarregandoSkeleton height={160} />
              </section>
            ) : erro ? (
              <section className="mt-5">
                <ErroCarregamento mensagem={erro} onRetry={carregarArvore} />
              </section>
            ) : data.length === 0 ? (
              <section className="mt-5">
                <NadaEncontrado
                  titulo="Nenhum evento encontrado"
                  descricao="Quando houver eventos com certificados disponíveis para gestão, eles aparecerão aqui."
                />
              </section>
            ) : !eventoFiltrado || turmasFiltradas.length === 0 ? (
              <section className="mt-5">
                <NadaEncontrado
                  titulo="Nenhum resultado encontrado"
                  descricao="Altere os filtros ou limpe a busca para visualizar mais certificados."
                />
              </section>
            ) : (
              <section
                className="mt-5"
                aria-labelledby="titulo-arvore-certificados"
              >
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2
                      id="titulo-arvore-certificados"
                      className="text-xl font-black text-slate-950 dark:text-white"
                    >
                      Certificados por turma
                    </h2>

                    <p className="text-sm text-slate-500 dark:text-zinc-400">
                      Exibindo {turmasFiltradas.length} turma(s) do evento
                      selecionado.
                    </p>
                  </div>

                  <Badge tone="amber">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Gestão documental v2.1
                  </Badge>
                </div>

                <div className="grid gap-5">
                  {turmasFiltradas.map((turma) => {
                    const turmaId = getTurmaId(turma);
                    const turmaKey = `${eventoFiltrado.evento_id}:${turmaId}`;
                    const status =
                      turma.status_calculado || inferirStatusTurma(turma);
                    const totais = turma?.totais || {};
                    const pendentes = Number(totais.pendentes || 0);
                    const emitidos = Number(totais.emitidos || 0);
                    const presentes = Number(totais.presentes || 0);
                    const participantes = Array.isArray(turma?.participantes)
                      ? turma.participantes
                      : [];

                    return (
                      <article
                        key={turmaKey}
                        className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <div className="h-1.5 bg-gradient-to-r from-amber-600 via-orange-500 to-rose-500" />

                        <div className="p-4 sm:p-5">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="break-words text-lg font-black text-slate-950 dark:text-white">
                                  {getTurmaTitulo(turma)}
                                </h3>

                                <Badge tone={statusTone(status)}>
                                  {statusLabel(status)}
                                </Badge>
                              </div>

                              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-zinc-300">
                                <CalendarDays
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                {periodoTurma(turma)}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <Badge tone="cyan">
                                  Presentes: {presentes}
                                </Badge>
                                <Badge tone="emerald">
                                  Emitidos: {emitidos}
                                </Badge>
                                <Badge tone="amber">
                                  Pendentes: {pendentes}
                                </Badge>
                                <Badge tone="slate">
                                  Participantes: {participantes.length}
                                </Badge>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <ActionButton
                                onClick={() =>
                                  pedirProcessamentoPendentes(turma)
                                }
                                disabled={
                                  pendentes <= 0 || executandoProcessamento
                                }
                                tone="amber"
                              >
                                <FilePlus2
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                Processar pendentes
                              </ActionButton>
                            </div>
                          </div>

                          <div className="mt-5">
                            {!participantes.length ? (
                              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                                Nenhum participante encontrado para esta turma.
                              </div>
                            ) : (
                              <>
                                <div className="grid gap-3 md:hidden">
                                  {participantes.map((participante) => {
                                    const certificadoId = Number(
                                      participante?.certificado_id,
                                    );

                                    return (
                                      <ParticipanteCard
                                        key={`${turmaKey}-${participante.usuario_id || participante.email}`}
                                        participante={participante}
                                        onDownload={baixarCertificado}
                                        baixando={baixandoId === certificadoId}
                                      />
                                    );
                                  })}
                                </div>

                                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 md:block">
                                  <table className="min-w-full text-sm">
                                    <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-zinc-900 dark:text-zinc-400">
                                      <tr>
                                        <th className="px-3 py-3">
                                          Participante
                                        </th>
                                        <th className="px-3 py-3">E-mail</th>
                                        <th className="px-3 py-3">Status</th>
                                        <th className="px-3 py-3">Número</th>
                                        <th className="px-3 py-3">Código</th>
                                        <th className="px-3 py-3 text-right">
                                          Ação
                                        </th>
                                      </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                      {participantes.map((participante) => {
                                        const hasCertificado =
                                          participanteTemCertificado(
                                            participante,
                                          );
                                        const certificadoId = Number(
                                          participante?.certificado_id,
                                        );
                                        const baixando =
                                          baixandoId === certificadoId;

                                        return (
                                          <tr
                                            key={`${turmaKey}-${participante.usuario_id || participante.email}`}
                                            className="bg-white dark:bg-zinc-950"
                                          >
                                            <td className="px-3 py-3 font-semibold text-slate-950 dark:text-white">
                                              {participante?.nome || "—"}
                                            </td>

                                            <td className="px-3 py-3 text-slate-600 dark:text-zinc-300">
                                              {participante?.email || "—"}
                                            </td>

                                            <td className="px-3 py-3">
                                              <Badge
                                                tone={
                                                  hasCertificado
                                                    ? "emerald"
                                                    : "amber"
                                                }
                                              >
                                                {hasCertificado ? (
                                                  <CheckCircle2
                                                    className="h-3.5 w-3.5"
                                                    aria-hidden="true"
                                                  />
                                                ) : (
                                                  <AlertTriangle
                                                    className="h-3.5 w-3.5"
                                                    aria-hidden="true"
                                                  />
                                                )}
                                                {hasCertificado
                                                  ? "Emitido"
                                                  : "Pendente"}
                                              </Badge>
                                            </td>

                                            <td className="px-3 py-3 text-xs font-bold text-slate-600 dark:text-zinc-300">
                                              {hasCertificado
                                                ? getNumeroCertificadoLabel(
                                                    participante,
                                                  )
                                                : "—"}
                                            </td>

                                            <td className="px-3 py-3 text-xs font-bold text-slate-500 dark:text-zinc-400">
                                              {participante?.codigo_validacao ||
                                                "—"}
                                            </td>

                                            <td className="px-3 py-3 text-right">
                                              {hasCertificado ? (
                                                <ActionButton
                                                  onClick={() =>
                                                    baixarCertificado(
                                                      participante,
                                                    )
                                                  }
                                                  disabled={baixando}
                                                >
                                                  {baixando ? (
                                                    <Loader2
                                                      className="h-4 w-4 animate-spin"
                                                      aria-hidden="true"
                                                    />
                                                  ) : (
                                                    <Download
                                                      className="h-4 w-4"
                                                      aria-hidden="true"
                                                    />
                                                  )}
                                                  {baixando
                                                    ? "Baixando..."
                                                    : "Baixar"}
                                                </ActionButton>
                                              ) : (
                                                <span className="text-xs font-bold text-slate-400">
                                                  —
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
