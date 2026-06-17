// ✅ frontend/src/pages/CancelarInscricaoAdmin.jsx — v2.1
// Atualizado em: 02/06/2026
// Plataforma Escola da Saúde
//
// Página operacional contextual para cancelamento de inscrições.
//
// Revisão premium v2.1:
// - tela acessada somente pelo Painel do Gestor;
// - evento_id obrigatório via URL;
// - sem modo geral;
// - sem listagem de todos os eventos;
// - sem busca/filtro geral;
// - carrega apenas o evento informado;
// - carrega automaticamente todas as turmas do evento;
// - carrega automaticamente os inscritos de todas as turmas;
// - conteúdo já aparece aberto;
// - usa HeaderHero global oficial;
// - usa Footer oficial;
// - visual institucional premium;
// - preserva cancelamento individual;
// - preserva cancelamento em lote;
// - preserva seleção individual e seleção de todos;
// - preserva confirmação antes de ação destrutiva;
// - preserva rollback visual em caso de erro;
// - preserva CPF protegido;
// - preserva aria-live;
// - sem /api diretamente para domínio de eventos;
// - sem rotas antigas em tentativa múltipla;
// - sem status em_andamento;
// - Status oficial: programado | andamento | encerrado | sem_datas;
// - mobile-first, acessível, moderno e operacional.
//
// Contratos aplicados:
// - parâmetro contextual oficial: evento_id;
// - Eventos administrativos: /evento/administrador via eventoService;
// - Turmas do evento: /evento/:evento_id/turma via eventoService;
// - Inscritos da turma: /inscricao/turma/:turma_id via eventoService;
// - Cancelamento administrativo: api.inscricao.cancelarUsuarioNaTurma.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PropTypes from "prop-types";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Info,
  Layers,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";

import {
  isAbortLike,
  listarEventosAdmin,
  listarInscritosDaTurma,
  listarTurmasDoEvento,
} from "../services/eventoService";

import {
  notifyError,
  notifyInfo,
  notifySuccess,
} from "../components/ui/AppToast";

import api from "../services/api";

/* ─────────────────────────────────────────────────────────────
   Constantes
────────────────────────────────────────────────────────────── */

const STATUS_EVENTO = Object.freeze({
  PROGRAMADO: "programado",
  ANDAMENTO: "andamento",
  ENCERRADO: "encerrado",
  SEM_DATAS: "sem_datas",
});

/* ─────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function ymd(value) {
  if (typeof value !== "string") {
    return "";
  }

  const valueSafe = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(valueSafe)) {
    return valueSafe;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(valueSafe)) {
    return valueSafe.slice(0, 10);
  }

  return "";
}

function hhmm(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const valueSafe = value.trim();

  if (!valueSafe) {
    return fallback;
  }
  if (/^\d{2}:\d{2}$/.test(valueSafe)) {
    return valueSafe;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(valueSafe)) {
    return valueSafe.slice(0, 5);
  }

  return fallback;
}

function toLocalDateTime(dateOnly, time = "00:00") {
  const data = ymd(dateOnly);
  const hora = hhmm(time, "00:00");

  if (!data || !hora) {
    return null;
  }

  const [year, month, day] = data.split("-").map(Number);
  const [hour, minute] = hora.split(":").map(Number);

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatarDataBR(value) {
  const data = ymd(value);

  if (!data) {
    return "";
  }

  const [year, month, day] = data.split("-");
  return `${day}/${month}/${year}`;
}

function formatarCelular(value) {
  const celular = String(value || "").replace(/\D/g, "");
  if (celular.length === 11) {
    return celular.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (celular.length === 10) {
    return celular.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return value || "—";
}

function deduzStatusEvento(evento) {
  const raw = String(evento?.status || "")
    .trim()
    .toLowerCase();

  if (raw === STATUS_EVENTO.PROGRAMADO) {
    return STATUS_EVENTO.PROGRAMADO;
  }
  if (raw === STATUS_EVENTO.ANDAMENTO) {
    return STATUS_EVENTO.ANDAMENTO;
  }
  if (raw === STATUS_EVENTO.ENCERRADO) {
    return STATUS_EVENTO.ENCERRADO;
  }
  if (raw === STATUS_EVENTO.SEM_DATAS) {
    return STATUS_EVENTO.SEM_DATAS;
  }

  const dataInicio = ymd(
    evento?.data_inicio_geral || evento?.data_inicio || evento?.data,
  );

  const dataFim = ymd(
    evento?.data_fim_geral || evento?.data_fim || evento?.data,
  );

  if (!dataInicio || !dataFim) {
    return STATUS_EVENTO.SEM_DATAS;
  }

  const inicio = toLocalDateTime(
    dataInicio,
    evento?.horario_inicio_geral || evento?.horario_inicio || "00:00",
  );

  const fim = toLocalDateTime(
    dataFim,
    evento?.horario_fim_geral || evento?.horario_fim || "23:59",
  );

  if (!inicio || !fim) {
    return STATUS_EVENTO.SEM_DATAS;
  }

  const agora = new Date();

  if (agora < inicio) {
    return STATUS_EVENTO.PROGRAMADO;
  }
  if (agora > fim) {
    return STATUS_EVENTO.ENCERRADO;
  }

  return STATUS_EVENTO.ANDAMENTO;
}

function labelStatus(status) {
  if (status === STATUS_EVENTO.ANDAMENTO) {
    return "Em andamento";
  }
  if (status === STATUS_EVENTO.ENCERRADO) {
    return "Encerrado";
  }
  if (status === STATUS_EVENTO.SEM_DATAS) {
    return "Sem datas";
  }

  return "Programado";
}

function statusChipClass(status) {
  if (status === STATUS_EVENTO.ANDAMENTO) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200";
  }

  if (status === STATUS_EVENTO.ENCERRADO) {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-200";
  }

  if (status === STATUS_EVENTO.SEM_DATAS) {
    return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200";
}

function statusDotClass(status) {
  if (status === STATUS_EVENTO.ANDAMENTO) {
    return "bg-amber-500";
  }
  if (status === STATUS_EVENTO.ENCERRADO) {
    return "bg-rose-500";
  }
  if (status === STATUS_EVENTO.SEM_DATAS) {
    return "bg-zinc-400";
  }

  return "bg-emerald-500";
}

function eventoPeriodoTexto(evento) {
  const inicio = ymd(
    evento?.data_inicio_geral || evento?.data_inicio || evento?.data,
  );

  const fim = ymd(
    evento?.data_fim_geral || evento?.data_fim || evento?.data || inicio,
  );

  if (!inicio && !fim) {
    return "Período não informado";
  }
  if (inicio && (!fim || inicio === fim)) {
    return formatarDataBR(inicio);
  }

  return `${formatarDataBR(inicio)} a ${formatarDataBR(fim)}`;
}

function turmaPeriodoTexto(turma) {
  const inicio = ymd(turma?.data_inicio || turma?.data);
  const fim = ymd(turma?.data_fim || turma?.data_inicio || turma?.data);

  const horaInicio = hhmm(turma?.horario_inicio);
  const horaFim = hhmm(turma?.horario_fim);

  const dataTexto =
    inicio && fim && inicio !== fim
      ? `${formatarDataBR(inicio)} a ${formatarDataBR(fim)}`
      : inicio
        ? formatarDataBR(inicio)
        : "Datas a definir";

  const horarioTexto =
    horaInicio && horaFim
      ? ` • ${horaInicio} às ${horaFim}`
      : horaInicio
        ? ` • a partir de ${horaInicio}`
        : "";

  return `${dataTexto}${horarioTexto}`;
}

function getErrorMessage(error, fallback) {
  return error?.data?.message || error?.message || fallback;
}

/* ─────────────────────────────────────────────────────────────
   Componentes locais
────────────────────────────────────────────────────────────── */

function LoadingInline({ pequeno = false, label = "Carregando..." }) {
  return (
    <div
      className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
      role="status"
      aria-live="polite"
    >
      <RefreshCw
        className={pequeno ? "h-4 w-4 animate-spin" : "h-5 w-5 animate-spin"}
        aria-hidden="true"
      />

      <span>{label}</span>
    </div>
  );
}

function Pill({ children, className = "" }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black",
        className,
      )}
    >
      {children}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone = "emerald" }) {
  const tones = {
    emerald:
      "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-900/40",
    sky: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/25 dark:text-sky-200 dark:border-sky-900/40",
    amber:
      "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/25 dark:text-amber-200 dark:border-amber-900/40",
    rose: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/25 dark:text-rose-200 dark:border-rose-900/40",
    slate:
      "bg-slate-50 text-slate-800 border-slate-200 dark:bg-zinc-900/40 dark:text-zinc-100 dark:border-zinc-800",
  };

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span
            className={classNames(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border",
              tones[tone] || tones.emerald,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-400">
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
    emerald:
      "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 dark:border-emerald-600",
    rose: "border-rose-700 bg-rose-700 text-white hover:bg-rose-800 dark:border-rose-600",
    sky: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-200",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60",
        tones[tone] || tones.neutral,
      )}
    >
      {children}
    </button>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "Confirmar",
  danger = false,
  loading = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      window.setTimeout(() => ref.current?.focus(), 30);
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKey = (event) => {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onCancel?.();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [loading, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        onClick={loading ? undefined : onCancel}
        aria-label="Fechar confirmação"
      />

      <div
        ref={ref}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-3xl bg-white text-slate-950 shadow-2xl ring-1 ring-black/10 outline-none dark:bg-zinc-900 dark:text-white"
      >
        <div className="p-5">
          <div className="mb-3 flex items-start gap-3">
            <span
              className={classNames(
                "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                danger
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
              )}
            >
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>

            <div>
              <h2 id="confirm-title" className="text-lg font-black">
                {title}
              </h2>

              <p
                id="confirm-message"
                className="mt-1 text-sm text-slate-600 dark:text-zinc-300"
              >
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <ActionButton onClick={onCancel} disabled={loading}>
            Cancelar
          </ActionButton>

          <ActionButton
            onClick={onConfirm}
            disabled={loading}
            tone={danger ? "rose" : "emerald"}
          >
            {loading && (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function ContextoAusente({ onVoltar }) {
  return (
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
            Esta tela é operacional e deve ser acessada pelo Painel do Gestor. O
            endereço precisa conter um <strong>evento_id</strong> válido para
            carregar as turmas e inscrições do evento específico.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton onClick={onVoltar} tone="emerald">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar ao Painel do Gestor
            </ActionButton>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Página
────────────────────────────────────────────────────────────── */

export default function CancelarInscricaoAdmin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const eventoIdParam = useMemo(
    () => toPositiveInt(searchParams.get("evento_id")),
    [searchParams],
  );

  const [evento, setEvento] = useState(null);
  const [turmas, setTurmas] = useState([]);
  const [loadingEvento, setLoadingEvento] = useState(true);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingInscritos, setLoadingInscritos] = useState({});

  const [inscritosPorTurma, setInscritosPorTurma] = useState({});
  const [selecionados, setSelecionados] = useState({});

  const [modal, setModal] = useState({
    open: false,
    turma_id: null,
    usuario_ids: [],
  });

  const [erro, setErro] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const liveRef = useRef(null);
  const mountedRef = useRef(true);
  const abortRef = useRef(null);

  const setLive = useCallback((message) => {
    if (liveRef.current) {
      liveRef.current.textContent = message || "";
    }
  }, []);

  const voltarPainelGestor = useCallback(() => {
    navigate("/administrador");
  }, [navigate]);

  useEffect(() => {
    document.title = "Cancelar inscrições do evento — Escola da Saúde";
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort?.("unmount");
    };
  }, []);

  const carregarInscritos = useCallback(
    async (turma_id) => {
      const turmaId = toPositiveInt(turma_id);

      if (!turmaId) {
        return [];
      }

      setLoadingInscritos((prev) => ({ ...prev, [turmaId]: true }));
      setLive(`Carregando inscritos da turma ${turmaId}.`);

      try {
        const inscritos = await listarInscritosDaTurma(turmaId);
        const lista = Array.isArray(inscritos) ? inscritos : [];

        if (!mountedRef.current) {
          return [];
        }

        setInscritosPorTurma((prev) => ({
          ...prev,
          [turmaId]: lista,
        }));

        setSelecionados((prev) => ({ ...prev, [turmaId]: new Set() }));
        setLive(`${lista.length} inscrito(s) carregado(s).`);

        return lista;
      } catch (error) {
        if (!mountedRef.current) {
          return [];
        }

        notifyError(
          getErrorMessage(error, "Falha ao carregar inscritos da turma."),
        );

        setInscritosPorTurma((prev) => ({ ...prev, [turmaId]: [] }));
        setLive("Falha ao carregar inscritos.");

        return [];
      } finally {
        if (mountedRef.current) {
          setLoadingInscritos((prev) => ({ ...prev, [turmaId]: false }));
        }
      }
    },
    [setLive],
  );

  const carregarPagina = useCallback(async () => {
    abortRef.current?.abort?.("nova-requisicao");

    const controller = new AbortController();
    abortRef.current = controller;

    setErro("");
    setEvento(null);
    setTurmas([]);
    setInscritosPorTurma({});
    setSelecionados({});
    setLoadingEvento(true);
    setLoadingTurmas(false);
    setLoadingInscritos({});
    setLive("Carregando contexto do evento.");

    if (!eventoIdParam) {
      setLoadingEvento(false);
      setLive("Contexto ausente.");
      return;
    }

    try {
      const eventos = await listarEventosAdmin({ signal: controller.signal });

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      const listaEventos = Array.isArray(eventos) ? eventos : [];
      const eventoEncontrado =
        listaEventos.find((item) => Number(item?.id) === eventoIdParam) || null;

      if (!eventoEncontrado) {
        setErro("O evento informado no link não foi encontrado.");
        setEvento(null);
        setTurmas([]);
        setLive("Evento não encontrado.");
        return;
      }

      setEvento(eventoEncontrado);
      setLive(`Evento ${eventoIdParam} localizado. Carregando turmas.`);

      setLoadingTurmas(true);

      const turmasEvento = await listarTurmasDoEvento(eventoIdParam);

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      const listaTurmas = Array.isArray(turmasEvento) ? turmasEvento : [];

      setTurmas(listaTurmas);
      setLive(`${listaTurmas.length} turma(s) carregada(s).`);

      await Promise.all(
        listaTurmas
          .map((turma) => toPositiveInt(turma?.id))
          .filter(Boolean)
          .map((turmaId) => carregarInscritos(turmaId)),
      );

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      setLive("Evento, turmas e inscritos carregados.");
    } catch (error) {
      if (isAbortLike(error)) {
        return;
      }

      if (!mountedRef.current) {
        return;
      }

      const message = getErrorMessage(
        error,
        "Não foi possível carregar os dados do evento.",
      );

      setErro(message);
      setEvento(null);
      setTurmas([]);
      setInscritosPorTurma({});
      setSelecionados({});
      setLive("Falha ao carregar dados do evento.");

      notifyError(message);
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoadingEvento(false);
        setLoadingTurmas(false);
      }
    }
  }, [carregarInscritos, eventoIdParam, setLive]);

  useEffect(() => {
    carregarPagina();
  }, [carregarPagina]);

  const totalInscritos = useMemo(() => {
    return Object.values(inscritosPorTurma).reduce(
      (acc, lista) => acc + (Array.isArray(lista) ? lista.length : 0),
      0,
    );
  }, [inscritosPorTurma]);

  const totalSelecionados = useMemo(() => {
    return Object.values(selecionados).reduce(
      (acc, setValue) => acc + (setValue?.size || 0),
      0,
    );
  }, [selecionados]);

  const anyLoading = useMemo(() => {
    return (
      loadingEvento ||
      loadingTurmas ||
      Object.values(loadingInscritos).some(Boolean)
    );
  }, [loadingEvento, loadingInscritos, loadingTurmas]);

  const status = useMemo(() => {
    return evento ? deduzStatusEvento(evento) : STATUS_EVENTO.SEM_DATAS;
  }, [evento]);

  function toggleSelecionado(turma_id, usuario_id) {
    const turmaId = toPositiveInt(turma_id);
    const usuarioId = toPositiveInt(usuario_id);

    if (!turmaId || !usuarioId) {
      return;
    }

    setSelecionados((prev) => {
      const atual = new Set(prev[turmaId] || []);

      if (atual.has(usuarioId)) {
        atual.delete(usuarioId);
      } else {
        atual.add(usuarioId);
      }

      return {
        ...prev,
        [turmaId]: atual,
      };
    });
  }

  function selecionarTodos(turma_id) {
    const turmaId = toPositiveInt(turma_id);

    if (!turmaId) {
      return;
    }

    const lista = inscritosPorTurma[turmaId] || [];

    setSelecionados((prev) => ({
      ...prev,
      [turmaId]: new Set(
        lista
          .map((inscrito) => toPositiveInt(inscrito?.usuario_id))
          .filter(Boolean),
      ),
    }));
  }

  function limparSelecao(turma_id) {
    const turmaId = toPositiveInt(turma_id);

    if (!turmaId) {
      return;
    }

    setSelecionados((prev) => ({
      ...prev,
      [turmaId]: new Set(),
    }));
  }

  function confirmarCancelarIndividual(turma_id, usuario_id) {
    const turmaId = toPositiveInt(turma_id);
    const usuarioId = toPositiveInt(usuario_id);

    if (!turmaId || !usuarioId) {
      return;
    }

    setModal({
      open: true,
      turma_id: turmaId,
      usuario_ids: [usuarioId],
    });
  }

  function confirmarCancelarLote(turma_id) {
    const turmaId = toPositiveInt(turma_id);

    if (!turmaId) {
      return;
    }

    const setSelecionado = selecionados[turmaId] || new Set();

    if (setSelecionado.size === 0) {
      notifyInfo("Selecione pelo menos um participante.");
      return;
    }

    setModal({
      open: true,
      turma_id: turmaId,
      usuario_ids: Array.from(setSelecionado),
    });
  }

  const fecharModal = useCallback(() => {
    if (cancelando) {
      return;
    }

    setModal({
      open: false,
      turma_id: null,
      usuario_ids: [],
    });
  }, [cancelando]);

  async function efetivarCancelamento() {
    const turmaId = toPositiveInt(modal.turma_id);
    const usuarioIds = Array.isArray(modal.usuario_ids)
      ? modal.usuario_ids.map(toPositiveInt).filter(Boolean)
      : [];

    if (!turmaId || usuarioIds.length === 0) {
      fecharModal();
      return;
    }

    const snapshotInscritos = inscritosPorTurma[turmaId] || [];
    const snapshotSelecionados = selecionados[turmaId] || new Set();

    setCancelando(true);
    setLive(`Cancelando ${usuarioIds.length} inscrição(ões).`);

    setInscritosPorTurma((prev) => {
      const atuais = prev[turmaId] || [];

      return {
        ...prev,
        [turmaId]: atuais.filter(
          (inscrito) => !usuarioIds.includes(Number(inscrito?.usuario_id)),
        ),
      };
    });

    setSelecionados((prev) => ({
      ...prev,
      [turmaId]: new Set(),
    }));

    try {
      for (const usuarioId of usuarioIds) {
        await api.inscricao.cancelarUsuarioNaTurma(turmaId, usuarioId);
      }

      notifySuccess(
        usuarioIds.length > 1
          ? "Inscrições canceladas com sucesso."
          : "Inscrição cancelada com sucesso.",
      );

      setLive("Cancelamento concluído.");

      setModal({
        open: false,
        turma_id: null,
        usuario_ids: [],
      });
    } catch (error) {
      setInscritosPorTurma((prev) => ({
        ...prev,
        [turmaId]: snapshotInscritos,
      }));

      setSelecionados((prev) => ({
        ...prev,
        [turmaId]: new Set(snapshotSelecionados),
      }));

      const message = getErrorMessage(error, "Erro ao cancelar inscrição.");

      notifyError(message);
      setLive("Falha ao cancelar. Lista restaurada.");

      await carregarInscritos(turmaId);
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <p
        ref={liveRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <HeaderHero
          titulo="Cancelamento de inscrições"
          subtitulo="Tela operacional contextual do Painel do Gestor para cancelar inscrições de um evento específico, com confirmação explícita, CPF protegido e rastreabilidade operacional."
          icone={XCircle}
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
                  <Pill className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Evento ID {eventoIdParam}
                  </Pill>
                ) : (
                  <Pill className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200">
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    Evento não informado
                  </Pill>
                )}

                {evento?.titulo ? (
                  <Pill className="max-w-full border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-200">
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="truncate">{evento.titulo}</span>
                  </Pill>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ActionButton onClick={voltarPainelGestor}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Painel do Gestor
              </ActionButton>

              <ActionButton
                onClick={carregarPagina}
                disabled={anyLoading || !eventoIdParam}
                tone="emerald"
              >
                <RefreshCw
                  className={classNames(
                    "h-4 w-4",
                    anyLoading && "animate-spin",
                  )}
                  aria-hidden="true"
                />
                Atualizar dados
              </ActionButton>
            </div>
          </div>
        </section>

        {anyLoading && (
          <div
            className="sticky top-0 z-40 mt-4 h-1 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/30"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Carregando dados"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-700" />
          </div>
        )}

        {!eventoIdParam ? (
          <ContextoAusente onVoltar={voltarPainelGestor} />
        ) : (
          <>
            <section
              className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
              aria-label="Resumo operacional"
            >
              <MetricCard
                icon={ClipboardList}
                label="Evento"
                value={loadingEvento ? "…" : evento ? 1 : 0}
                hint="Contexto recebido pelo Painel do Gestor"
                tone="emerald"
              />

              <MetricCard
                icon={Layers}
                label="Turmas"
                value={loadingTurmas ? "…" : turmas.length}
                hint="Turmas vinculadas ao evento"
                tone="sky"
              />

              <MetricCard
                icon={Users}
                label="Inscritos"
                value={totalInscritos}
                hint="Participantes carregados nas turmas"
                tone="amber"
              />

              <MetricCard
                icon={UserCheck}
                label="Selecionados"
                value={totalSelecionados}
                hint="Prontos para cancelamento em lote"
                tone={totalSelecionados > 0 ? "rose" : "slate"}
              />
            </section>

            {erro ? (
              <section
                className="mt-5 rounded-[2rem] border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/20"
                role="alert"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-black text-slate-950 dark:text-white">
                      Não foi possível carregar o evento
                    </h2>

                    <p className="mt-2 text-sm leading-relaxed text-rose-800 dark:text-rose-200">
                      {erro}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton onClick={carregarPagina} tone="rose">
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Tentar novamente
                      </ActionButton>

                      <ActionButton onClick={voltarPainelGestor}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Voltar ao Painel
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {loadingEvento ? (
              <section className="mt-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-center p-10">
                  <LoadingInline label="Carregando evento..." />
                </div>
              </section>
            ) : evento ? (
              <>
                <section className="mt-5 rounded-[2rem] border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-200">
                        Evento em foco
                      </p>

                      <h2 className="mt-1 break-words text-2xl font-black text-slate-950 dark:text-white">
                        {evento.titulo || `Evento #${eventoIdParam}`}
                      </h2>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-700 dark:text-zinc-300">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-4 w-4" aria-hidden="true" />
                          {evento.local || "Local não informado"}
                        </span>

                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          {eventoPeriodoTexto(evento)}
                        </span>
                      </div>
                    </div>

                    <Pill className={statusChipClass(status)}>
                      <span
                        className={classNames(
                          "h-2 w-2 rounded-full",
                          statusDotClass(status),
                        )}
                        aria-hidden="true"
                      />
                      {labelStatus(status)}
                    </Pill>
                  </div>
                </section>

                <section className="mt-5" aria-label="Turmas e inscrições">
                  {loadingTurmas ? (
                    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="flex items-center justify-center p-10">
                        <LoadingInline label="Carregando turmas..." />
                      </div>
                    </section>
                  ) : turmas.length === 0 ? (
                    <section className="overflow-hidden rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-zinc-900 dark:text-zinc-300">
                        <Info className="h-7 w-7" aria-hidden="true" />
                      </div>

                      <p className="mt-4 text-base font-black text-slate-950 dark:text-white">
                        Nenhuma turma encontrada
                      </p>

                      <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                        Este evento não possui turmas disponíveis para
                        cancelamento de inscrições.
                      </p>
                    </section>
                  ) : (
                    <div className="grid gap-5">
                      {turmas.map((turma) => {
                        const turmaId = toPositiveInt(turma?.id);
                        const inscritos = inscritosPorTurma[turmaId] || [];
                        const carregandoInscritos = !!loadingInscritos[turmaId];
                        const setSelecionado =
                          selecionados[turmaId] || new Set();
                        const allSelected =
                          inscritos.length > 0 &&
                          setSelecionado.size === inscritos.length;

                        return (
                          <article
                            key={turmaId}
                            className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <div className="h-1.5 bg-gradient-to-r from-sky-600 via-cyan-500 to-emerald-500" />

                            <div className="p-4 sm:p-5">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                                    Turma
                                  </p>

                                  <h3 className="mt-1 break-words text-xl font-black text-slate-950 dark:text-white">
                                    {turma?.nome || `Turma #${turmaId}`}
                                  </h3>

                                  <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
                                    {turmaPeriodoTexto(turma)} •{" "}
                                    {turma?.carga_horaria ?? "—"}h
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <Pill className="border-slate-200 bg-slate-50 text-slate-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                                    <Users
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                    {inscritos.length} inscrito(s)
                                  </Pill>

                                  <ActionButton
                                    onClick={() =>
                                      allSelected
                                        ? limparSelecao(turmaId)
                                        : selecionarTodos(turmaId)
                                    }
                                    tone="sky"
                                    disabled={
                                      carregandoInscritos ||
                                      inscritos.length === 0
                                    }
                                  >
                                    {allSelected ? (
                                      <Square
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <CheckSquare
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                    )}
                                    {allSelected
                                      ? "Limpar seleção"
                                      : "Selecionar todos"}
                                  </ActionButton>

                                  <ActionButton
                                    onClick={() =>
                                      confirmarCancelarLote(turmaId)
                                    }
                                    tone="rose"
                                    disabled={setSelecionado.size === 0}
                                  >
                                    <Trash2
                                      className="h-4 w-4"
                                      aria-hidden="true"
                                    />
                                    Cancelar ({setSelecionado.size})
                                  </ActionButton>
                                </div>
                              </div>
                            </div>

                            <div className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
                              {carregandoInscritos ? (
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                                  <LoadingInline
                                    pequeno
                                    label="Carregando inscritos..."
                                  />
                                </div>
                              ) : inscritos.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                                  Nenhum inscrito nesta turma.
                                </div>
                              ) : (
                                <>
                                  <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:block">
                                    <table className="min-w-full text-sm">
                                      <thead className="bg-slate-100 dark:bg-zinc-900">
                                        <tr className="text-left">
                                          <th className="w-12 px-3 py-3 font-black">
                                            <span className="sr-only">
                                              Selecionar
                                            </span>
                                          </th>
                                          <th className="px-3 py-3 font-black">
                                            Participante
                                          </th>
                                          <th className="px-3 py-3 font-black">
                                            Celular
                                          </th>
                                          <th className="px-3 py-3 font-black">
                                            Frequência
                                          </th>
                                          <th className="px-3 py-3 text-right font-black">
                                            Ações
                                          </th>
                                        </tr>
                                      </thead>

                                      <tbody>
                                        {inscritos.map((inscrito) => {
                                          const usuarioId = toPositiveInt(
                                            inscrito?.usuario_id,
                                          );
                                          const marcado =
                                            setSelecionado.has(usuarioId);

                                          return (
                                            <tr
                                              key={`${turmaId}-${usuarioId}`}
                                              className="border-t border-slate-200 dark:border-zinc-800"
                                            >
                                              <td className="px-3 py-3 align-middle">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    toggleSelecionado(
                                                      turmaId,
                                                      usuarioId,
                                                    )
                                                  }
                                                  aria-pressed={marcado}
                                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-300 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                                  title={
                                                    marcado
                                                      ? "Remover da seleção"
                                                      : "Selecionar para cancelamento"
                                                  }
                                                >
                                                  {marcado ? (
                                                    <CheckSquare
                                                      className="h-4 w-4"
                                                      aria-hidden="true"
                                                    />
                                                  ) : (
                                                    <Square
                                                      className="h-4 w-4"
                                                      aria-hidden="true"
                                                    />
                                                  )}
                                                </button>
                                              </td>

                                              <td className="break-words px-3 py-3 font-semibold">
                                                {inscrito?.nome || "—"}
                                              </td>

                                              <td className="px-3 py-3 font-mono text-xs">
                                                {formatarCelular(
                                                  inscrito?.celular,
                                                )}
                                              </td>

                                              <td className="px-3 py-3">
                                                {inscrito?.frequencia || "—"}
                                              </td>

                                              <td className="px-3 py-3">
                                                <div className="flex justify-end">
                                                  <ActionButton
                                                    onClick={() =>
                                                      confirmarCancelarIndividual(
                                                        turmaId,
                                                        usuarioId,
                                                      )
                                                    }
                                                    tone="rose"
                                                  >
                                                    <Trash2
                                                      className="h-4 w-4"
                                                      aria-hidden="true"
                                                    />
                                                    Cancelar
                                                  </ActionButton>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  <ul className="space-y-3 md:hidden">
                                    {inscritos.map((inscrito) => {
                                      const usuarioId = toPositiveInt(
                                        inscrito?.usuario_id,
                                      );
                                      const marcado =
                                        setSelecionado.has(usuarioId);

                                      return (
                                        <li
                                          key={`${turmaId}-${usuarioId}`}
                                          className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                                        >
                                          <div className="flex items-start gap-3">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                toggleSelecionado(
                                                  turmaId,
                                                  usuarioId,
                                                )
                                              }
                                              aria-pressed={marcado}
                                              className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-300 transition hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                              title={
                                                marcado
                                                  ? "Remover da seleção"
                                                  : "Selecionar para cancelamento"
                                              }
                                            >
                                              {marcado ? (
                                                <CheckSquare
                                                  className="h-4 w-4"
                                                  aria-hidden="true"
                                                />
                                              ) : (
                                                <Square
                                                  className="h-4 w-4"
                                                  aria-hidden="true"
                                                />
                                              )}
                                            </button>

                                            <div className="min-w-0 flex-1">
                                              <p className="break-words font-black text-slate-950 dark:text-white">
                                                {inscrito?.nome || "—"}
                                              </p>

                                              <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                                                Celular:{" "}
                                                {formatarCelular(
                                                  inscrito?.celular,
                                                )}
                                              </p>

                                              <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                                                Frequência:{" "}
                                                {inscrito?.frequencia || "—"}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="mt-3 flex justify-end">
                                            <ActionButton
                                              onClick={() =>
                                                confirmarCancelarIndividual(
                                                  turmaId,
                                                  usuarioId,
                                                )
                                              }
                                              tone="rose"
                                            >
                                              <Trash2
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                              />
                                              Cancelar
                                            </ActionButton>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </main>

      {totalSelecionados > 0 && (
        <div className="sticky bottom-0 z-30">
          <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-emerald-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-emerald-900 dark:bg-zinc-900/95">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-sm font-black text-emerald-900 dark:text-emerald-200">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  {totalSelecionados} participante(s) selecionado(s)
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {Object.entries(selecionados).map(
                    ([turmaIdRaw, setValue]) => {
                      const turmaId = toPositiveInt(turmaIdRaw);
                      const quantidade = setValue?.size || 0;

                      if (!turmaId || quantidade <= 0) {
                        return null;
                      }

                      return (
                        <ActionButton
                          key={turmaId}
                          onClick={() => confirmarCancelarLote(turmaId)}
                          tone="rose"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Cancelar {quantidade} • Turma {turmaId}
                        </ActionButton>
                      );
                    },
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={modal.open}
        title={
          modal.usuario_ids.length > 1
            ? "Cancelar inscrições selecionadas"
            : "Cancelar inscrição"
        }
        message={
          modal.usuario_ids.length > 1
            ? `Você está prestes a cancelar ${modal.usuario_ids.length} inscrição(ões). Esta ação removerá a inscrição e os registros de presença vinculados. Deseja continuar?`
            : "Você está prestes a cancelar esta inscrição. Esta ação removerá a inscrição e os registros de presença vinculados. Deseja continuar?"
        }
        onCancel={fecharModal}
        onConfirm={efetivarCancelamento}
        confirmLabel="Confirmar cancelamento"
        danger
        loading={cancelando}
      />

      <Footer />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PropTypes
────────────────────────────────────────────────────────────── */

LoadingInline.propTypes = {
  pequeno: PropTypes.bool,
  label: PropTypes.string,
};

Pill.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

MetricCard.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  hint: PropTypes.string,
  tone: PropTypes.oneOf(["emerald", "sky", "amber", "rose", "slate"]),
};

ActionButton.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  tone: PropTypes.oneOf(["neutral", "emerald", "rose", "sky"]),
  type: PropTypes.oneOf(["button", "submit", "reset"]),
};

ConfirmModal.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  confirmLabel: PropTypes.string,
  danger: PropTypes.bool,
  loading: PropTypes.bool,
};

ContextoAusente.propTypes = {
  onVoltar: PropTypes.func.isRequired,
};
