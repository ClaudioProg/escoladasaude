// ✅ frontend/src/pages/GestaoPresenca.jsx — v2.2
// Atualizado em: 02/06/2026
// Plataforma Escola da Saúde
//
// Tela operacional contextual para gestão de presenças.
//
// Revisão premium v2.2:
// - tela acessada somente pelo Painel do Gestor;
// - evento_id obrigatório via URL;
// - sem modo geral;
// - sem busca/listagem geral;
// - sem abas pessoa/data na página;
// - visão única operacional por turma e participantes;
// - carrega somente o evento informado;
// - carrega automaticamente inscritos, avaliações e detalhes de presença;
// - mantém listas abertas por padrão via ListaTurmasPresenca;
// - stats operacionais reais: turmas, dias/aulas, inscritos, presenças, ausências e percentual de presença;
// - usa HeaderHero global oficial limpo;
// - botões, contexto, badges e stats ficam abaixo do HeaderHero;
// - usa Footer oficial;
// - preserva integração com api.presenca.administrador();
// - preserva api.presenca.turmaDetalhe(turma_id);
// - preserva api.inscricao.listarPorTurma(turma_id);
// - preserva api.avaliacao.porTurma(turma_id);
// - preserva api.presenca.turmaPdf(turma_id);
// - sem /api manual no frontend;
// - sem /presencas;
// - mobile-first, acessível, institucional e operacional.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PropTypes from "prop-types";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileDown,
  Info,
  Layers,
  Percent,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserX,
  UsersRound,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import ListaTurmasPresenca from "../components/presencas/ListaTurmasPresenca";
import { api, downloadBlob } from "../services/api";
import { notifyError, notifySuccess } from "../components/ui/AppToast";

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nowBR() {
  return new Date();
}

function nowSPParts() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
}

function nowSPComparable() {
  const parts = nowSPParts();

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizeYMD(value) {
  const safe = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(safe)) return safe;
  if (/^\d{4}-\d{2}-\d{2}T/.test(safe)) return safe.slice(0, 10);

  return "";
}

function normalizeHHMM(value, fallback = "00:00") {
  const safe = String(value || "").trim();

  if (/^\d{2}:\d{2}$/.test(safe)) return safe;
  if (/^\d{2}:\d{2}:\d{2}$/.test(safe)) return safe.slice(0, 5);

  return fallback;
}

function formatarDataBR(value) {
  const data = normalizeYMD(value);

  if (!data) return "—";

  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function turmaStartComparable(turma) {
  const dataInicio = normalizeYMD(turma?.data_inicio);
  const horarioInicio = normalizeHHMM(turma?.horario_inicio, "00:00");

  return dataInicio ? `${dataInicio}T${horarioInicio}:00` : "";
}

function turmaEndComparable(turma) {
  const dataFim = normalizeYMD(turma?.data_fim || turma?.data_inicio);
  const horarioFim = normalizeHHMM(turma?.horario_fim, "23:59");

  return dataFim ? `${dataFim}T${horarioFim}:59` : "";
}

function getTurmaStatus(turma) {
  const start = turmaStartComparable(turma);
  const end = turmaEndComparable(turma);
  const now = nowSPComparable();

  if (!start || !end) return "programado";
  if (now < start) return "programado";
  if (now > end) return "encerrado";

  return "andamento";
}

function labelStatusTurma(status) {
  if (status === "andamento") return "Em andamento";
  if (status === "encerrado") return "Encerrada";
  return "Programada";
}

function statusChipClass(status) {
  if (status === "andamento") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200";
  }

  if (status === "encerrado") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200";
  }

  return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-200";
}

function sortTurmasAsc(turmas = []) {
  return [...turmas].sort((a, b) => {
    const dataA = turmaStartComparable(a);
    const dataB = turmaStartComparable(b);

    if (dataA !== dataB) return dataA.localeCompare(dataB);

    return String(a?.id || a?.turma_id || "").localeCompare(
      String(b?.id || b?.turma_id || "")
    );
  });
}

function isAbortLike(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "").trim().toLowerCase();

  return (
    name === "AbortError" ||
    message === "new-request" ||
    message === "nova-requisicao" ||
    message === "unmount" ||
    message.includes("abort") ||
    message.includes("aborted") ||
    message.includes("canceled") ||
    message.includes("cancelled")
  );
}

function getErrorMessage(error, fallback) {
  return (
    error?.data?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function unwrapData(response) {
  return response?.data !== undefined ? response.data : response;
}

function unwrapEventosAdministrativos(response) {
  const data = unwrapData(response);

  if (Array.isArray(data?.eventos)) return data.eventos;
  if (Array.isArray(data)) return data;

  return [];
}

function unwrapArray(response) {
  const data = unwrapData(response);

  return Array.isArray(data) ? data : [];
}

function sanitizeFileName(value) {
  return String(value || "lista-presenca")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 70)
    .toLowerCase();
}

function tituloEvento(evento) {
  return String(evento?.titulo || `Evento #${evento?.evento_id || evento?.id || "—"}`)
    .trim()
    .slice(0, 220);
}

function normalizarEventoPresenca(evento) {
  const eventoId = toPositiveInt(evento?.evento_id || evento?.id);

  if (!eventoId) return null;

  const turmas = sortTurmasAsc(
    (Array.isArray(evento?.turmas) ? evento.turmas : [])
      .map((turma) => {
        const turmaId = toPositiveInt(turma?.turma_id || turma?.id);

        if (!turmaId) return null;

        return {
          ...turma,
          id: turmaId,
          turma_id: turmaId,
          nome: turma?.nome || turma?.turma_nome || `Turma #${turmaId}`,
          data_inicio: normalizeYMD(turma?.data_inicio),
          data_fim: normalizeYMD(turma?.data_fim || turma?.data_inicio),
          horario_inicio: normalizeHHMM(turma?.horario_inicio, ""),
          horario_fim: normalizeHHMM(turma?.horario_fim, ""),
        };
      })
      .filter(Boolean)
  );

  return {
    ...evento,
    id: eventoId,
    evento_id: eventoId,
    titulo: tituloEvento(evento),
    turmas,
  };
}

function periodoEventoTexto(evento) {
  const turmas = Array.isArray(evento?.turmas) ? evento.turmas : [];

  const datas = turmas
    .flatMap((turma) => [
      normalizeYMD(turma?.data_inicio),
      normalizeYMD(turma?.data_fim),
    ])
    .filter(Boolean)
    .sort();

  if (!datas.length) return "Período não informado";

  const inicio = datas[0];
  const fim = datas[datas.length - 1];

  if (!fim || inicio === fim) return formatarDataBR(inicio);

  return `${formatarDataBR(inicio)} a ${formatarDataBR(fim)}`;
}

function getTurmaId(turma) {
  return toPositiveInt(turma?.turma_id || turma?.id);
}

function normalizeDetalhePresenca(response, turma) {
  const data = unwrapData(response);

  const datasBrutas = Array.isArray(data?.datas)
    ? data.datas
    : Array.isArray(turma?.datas)
      ? turma.datas
      : Array.isArray(turma?.encontros)
        ? turma.encontros
        : [];

  const datas = datasBrutas
    .map((item) => ({
      data: normalizeYMD(item?.data || item),
      horario_inicio: normalizeHHMM(
        item?.horario_inicio || item?.inicio || turma?.horario_inicio,
        ""
      ),
      horario_fim: normalizeHHMM(
        item?.horario_fim || item?.fim || turma?.horario_fim,
        ""
      ),
    }))
    .filter((item) => item.data)
    .sort((a, b) => a.data.localeCompare(b.data));

  const usuarios = Array.isArray(data?.usuarios) ? data.usuarios : [];
  const presencas = [];

  for (const usuario of usuarios) {
    const usuarioId = toPositiveInt(usuario?.usuario_id || usuario?.id);

    if (!usuarioId) continue;

    for (const presenca of usuario?.presencas || []) {
      const dataPresenca = normalizeYMD(
        presenca?.data_presenca || presenca?.data
      );

      if (!dataPresenca) continue;

      presencas.push({
        usuario_id: usuarioId,
        data_presenca: dataPresenca,
        presente: presenca?.presente === true,
        confirmado_em: presenca?.confirmado_em || null,
      });
    }
  }

  return {
    datas,
    usuarios,
    presencas,
  };
}

function getParticipanteId(item) {
  return toPositiveInt(item?.usuario_id || item?.id);
}

function calcularResumoPresenca({ evento, inscritosPorTurma, detalhesPorTurma }) {
  const turmas = Array.isArray(evento?.turmas) ? evento.turmas : [];

  const usuarioGlobalSet = new Set();

  let totalTurmas = turmas.length;
  let totalDias = 0;
  let totalInscritosPorTurma = 0;
  let totalPossivel = 0;
  let presentes = 0;

  for (const turma of turmas) {
    const turmaId = getTurmaId(turma);

    if (!turmaId) continue;

    const inscritos = Array.isArray(inscritosPorTurma?.[turmaId])
      ? inscritosPorTurma[turmaId]
      : [];

    const detalhe = detalhesPorTurma?.[turmaId] || {
      datas: [],
      usuarios: [],
      presencas: [],
    };

    const usuariosDetalhe = Array.isArray(detalhe.usuarios)
      ? detalhe.usuarios
      : [];

    const participantesBase = inscritos.length ? inscritos : usuariosDetalhe;

    const participantesValidos = participantesBase
      .map((participante) => getParticipanteId(participante))
      .filter(Boolean);

    for (const usuarioId of participantesValidos) {
      usuarioGlobalSet.add(String(usuarioId));
    }

    const datas = Array.isArray(detalhe.datas) ? detalhe.datas : [];
    const totalDatasTurma = datas.length;

    totalDias += totalDatasTurma;
    totalInscritosPorTurma += participantesValidos.length;
    totalPossivel += participantesValidos.length * totalDatasTurma;

    const permitidoUsuarios = new Set(participantesValidos.map(String));
    const presencasValidasSet = new Set();

    for (const presenca of detalhe.presencas || []) {
      const usuarioId = getParticipanteId(presenca);
      const dataPresenca = normalizeYMD(presenca?.data_presenca || presenca?.data);

      if (!usuarioId || !dataPresenca) continue;

      if (permitidoUsuarios.size && !permitidoUsuarios.has(String(usuarioId))) {
        continue;
      }

      if (presenca?.presente === true) {
        presencasValidasSet.add(`${usuarioId}#${dataPresenca}`);
      }
    }

    presentes += presencasValidasSet.size;
  }

  const ausentes = Math.max(0, totalPossivel - presentes);
  const percentualPresenca =
    totalPossivel > 0 ? Math.round((presentes / totalPossivel) * 100) : 0;

  return {
    turmas: totalTurmas,
    dias: totalDias,
    inscritos: totalInscritosPorTurma,
    participantes_unicos: usuarioGlobalSet.size,
    total_possivel: totalPossivel,
    presentes,
    ausentes,
    percentual_presenca: percentualPresenca,
  };
}

/* ─────────────────────────────────────────────────────────────
 * Componentes locais
 * ───────────────────────────────────────────────────────────── */

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
    teal: "border-teal-700 bg-teal-700 text-white hover:bg-teal-800 dark:border-teal-600",
    rose: "border-rose-700 bg-rose-700 text-white hover:bg-rose-800 dark:border-rose-600",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60",
        tones[tone] || tones.neutral
      )}
    >
      {children}
    </button>
  );
}

function Pill({ children, className = "" }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black",
        className
      )}
    >
      {children}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone = "emerald" }) {
  const tones = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100",
    teal:
      "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900/40 dark:bg-teal-950/25 dark:text-teal-100",
    sky:
      "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-100",
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100",
    rose:
      "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-100",
    slate:
      "border-slate-200 bg-white text-slate-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
  };

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="p-4 sm:p-5">
  <div className="flex items-start gap-4">
          <span
            className={classNames(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border",
              tones[tone] || tones.emerald
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

function LoadingPanel({ label = "Carregando dados..." }) {
  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-center gap-2 p-10 text-sm font-black text-emerald-700 dark:text-emerald-300">
        <RefreshCcw className="h-5 w-5 animate-spin" aria-hidden="true" />
        {label}
      </div>
    </section>
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
            Esta tela é operacional e deve ser acessada pelo Painel do Gestor.
            O endereço precisa conter um <strong>evento_id</strong> válido para
            carregar as turmas, inscritos, presenças e relatórios do evento
            específico.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton onClick={onVoltar} tone="teal">
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
 * Página
 * ───────────────────────────────────────────────────────────── */

export default function PaginaGestaoPresencas() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const eventoIdParam = useMemo(
    () => toPositiveInt(searchParams.get("evento_id")),
    [searchParams]
  );

  const [evento, setEvento] = useState(null);
  const [eventosProcessados, setEventosProcessados] = useState([]);
  const [inscritosPorTurma, setInscritosPorTurma] = useState({});
  const [avaliacaoPorTurma, setAvaliacaoPorTurma] = useState({});
  const [detalhesPresencaPorTurma, setDetalhesPresencaPorTurma] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const liveRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const dadosAutomaticosRef = useRef(new Set());

  const agrupamento = "pessoa";
  const agora = nowBR();

  const setLive = useCallback((message) => {
    if (liveRef.current) {
      liveRef.current.textContent = message || "";
    }
  }, []);

  const voltarPainelGestor = useCallback(() => {
    navigate("/administrador");
  }, [navigate]);

  useEffect(() => {
    document.title = "Gestão de presenças do evento — Escola da Saúde";
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      try {
        abortRef.current?.abort?.("unmount");
      } catch {
        // noop
      }
    };
  }, []);

  const carregarEventos = useCallback(async () => {
    try {
      abortRef.current?.abort?.("nova-requisicao");
    } catch {
      // noop
    }

    const controller = new AbortController();
    abortRef.current = controller;

    dadosAutomaticosRef.current = new Set();

    setCarregando(true);
    setErro("");
    setEvento(null);
    setEventosProcessados([]);
    setInscritosPorTurma({});
    setAvaliacaoPorTurma({});
    setDetalhesPresencaPorTurma({});
    setLive("Carregando gestão de presenças do evento.");

    if (!eventoIdParam) {
      setCarregando(false);
      setLive("Contexto ausente.");
      return;
    }

    try {
      const response = await api.presenca.administrador({
        signal: controller.signal,
      });

      if (!mountedRef.current || controller.signal.aborted) return;

      const listaEventos = unwrapEventosAdministrativos(response)
        .map(normalizarEventoPresenca)
        .filter(Boolean);

      const eventoEncontrado =
        listaEventos.find(
          (item) => Number(item?.evento_id || item?.id) === eventoIdParam
        ) || null;

      if (!eventoEncontrado) {
        setErro("O evento informado no link não foi encontrado na gestão de presenças.");
        setLive("Evento não encontrado.");
        return;
      }

      const eventoFinal = {
        ...eventoEncontrado,
        turmas: sortTurmasAsc(eventoEncontrado.turmas || []),
      };

      setEvento(eventoFinal);
      setEventosProcessados([eventoFinal]);
      setLive(
        `Evento carregado com ${eventoFinal.turmas.length} turma(s) para gestão de presenças.`
      );
      if (!mountedRef.current) return;

      const message = getErrorMessage(
        error,
        "Erro ao carregar gestão de presenças do evento."
      );

      setErro(message);
      setEvento(null);
      setEventosProcessados([]);
      notifyError(message);
      setLive("Falha ao carregar gestão de presenças.");
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setCarregando(false);
      }
    }
  }, [eventoIdParam, setLive]);

  useEffect(() => {
    carregarEventos();
  }, [carregarEventos]);

  const carregarInscritos = useCallback(
    async (turma_id) => {
      const turmaId = toPositiveInt(turma_id);

      if (!turmaId) {
        notifyError("turma_id inválido para carregar inscritos.");
        return [];
      }

      try {
        setLive(`Carregando inscritos da turma ${turmaId}.`);

        const response = await api.inscricao.listarPorTurma(turmaId, {
          on403: "silent",
        });

        const lista = unwrapArray(response);

        if (!mountedRef.current) return [];

        setInscritosPorTurma((prev) => ({
          ...prev,
          [turmaId]: lista,
        }));

        setLive(`Inscritos da turma ${turmaId} carregados.`);

        return lista;
      } catch (error) {
        notifyError(getErrorMessage(error, "Erro ao carregar inscritos."));
        setLive("Falha ao carregar inscritos.");
        return [];
      }
    },
    [setLive]
  );

  const carregarAvaliacao = useCallback(
    async (turma_id) => {
      const turmaId = toPositiveInt(turma_id);

      if (!turmaId) {
        notifyError("turma_id inválido para carregar avaliações.");
        return [];
      }

      try {
        if (typeof api.avaliacao?.porTurma !== "function") {
          setAvaliacaoPorTurma((prev) => ({
            ...prev,
            [turmaId]: [],
          }));
          return [];
        }

        setLive(`Carregando avaliações da turma ${turmaId}.`);

        const response = await api.avaliacao.porTurma(turmaId, {
          on403: "silent",
        });

        const lista = unwrapArray(response);

        if (!mountedRef.current) return [];

        setAvaliacaoPorTurma((prev) => ({
          ...prev,
          [turmaId]: lista,
        }));

        setLive("Avaliações carregadas.");

        return lista;
      } catch (error) {
        notifyError(getErrorMessage(error, "Erro ao carregar avaliações."));
        setLive("Falha ao carregar avaliações.");
        return [];
      }
    },
    [setLive]
  );

  const carregarDetalhePresenca = useCallback(
    async (turma) => {
      const turmaId = getTurmaId(turma);

      if (!turmaId) {
        notifyError("turma_id inválido para carregar detalhes de presença.");
        return null;
      }

      try {
        setLive(`Carregando presenças da turma ${turmaId}.`);

        const response = await api.presenca.turmaDetalhe(turmaId, {
          on403: "silent",
        });

        const detalhe = normalizeDetalhePresenca(response, turma);

        if (!mountedRef.current) return null;

        setDetalhesPresencaPorTurma((prev) => ({
          ...prev,
          [turmaId]: detalhe,
        }));

        setLive(`Presenças da turma ${turmaId} carregadas.`);

        return detalhe;
      } catch (error) {
        notifyError(
          getErrorMessage(error, "Erro ao carregar presenças da turma.")
        );

        const vazio = {
          datas: [],
          usuarios: [],
          presencas: [],
        };

        if (mountedRef.current) {
          setDetalhesPresencaPorTurma((prev) => ({
            ...prev,
            [turmaId]: vazio,
          }));
        }

        setLive("Falha ao carregar presenças da turma.");

        return vazio;
      }
    },
    [setLive]
  );

  useEffect(() => {
    if (carregando) return;
    if (!evento?.turmas?.length) return;

    let cancelado = false;

    async function carregarDadosOperacionais() {
      for (const turma of evento.turmas) {
        if (cancelado) return;

        const turmaId = getTurmaId(turma);

        if (!turmaId) continue;

        const chave = String(turmaId);

        if (dadosAutomaticosRef.current.has(chave)) continue;

        dadosAutomaticosRef.current.add(chave);

        await Promise.allSettled([
          carregarInscritos(turmaId),
          carregarAvaliacao(turmaId),
          carregarDetalhePresenca(turma),
        ]);
      }
    }

    carregarDadosOperacionais();

    return () => {
      cancelado = true;
    };
  }, [
    carregando,
    carregarAvaliacao,
    carregarDetalhePresenca,
    carregarInscritos,
    evento,
  ]);

  const gerarRelatorioPDF = useCallback(
    async (turma_id, turmaNome = "lista-presenca") => {
      const turmaId = toPositiveInt(turma_id);

      if (!turmaId) {
        notifyError("turma_id inválido para gerar relatório.");
        return;
      }

      try {
        setLive(`Gerando PDF da turma ${turmaId}.`);

        const { blob, filename } = await api.presenca.turmaPdf(turmaId);

        downloadBlob(
          filename ||
            `lista_presenca_${sanitizeFileName(turmaNome)}_${turmaId}.pdf`,
          blob
        );

        notifySuccess("PDF gerado com sucesso.");
        setLive("PDF gerado com sucesso.");
      } catch (error) {
        notifyError(getErrorMessage(error, "Não foi possível gerar o PDF."));
        setLive("Falha ao gerar PDF.");
      }
    },
    [setLive]
  );

  const kpis = useMemo(() => {
    return calcularResumoPresenca({
      evento,
      inscritosPorTurma,
      detalhesPorTurma: detalhesPresencaPorTurma,
    });
  }, [detalhesPresencaPorTurma, evento, inscritosPorTurma]);

  const eventoTitulo = evento ? tituloEvento(evento) : "";
  const turmas = Array.isArray(evento?.turmas) ? evento.turmas : [];
  const anyLoading = carregando;

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <p
        ref={liveRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <HeaderHero
          titulo="Gestão de presenças"
          subtitulo="Tela operacional contextual do Painel do Gestor para acompanhar turmas, participantes, presença, frequência e relatórios do evento selecionado."
          icone={ClipboardCheck}
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
                  <Pill className="border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900/40 dark:bg-teal-950/25 dark:text-teal-200">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Evento ID {eventoIdParam}
                  </Pill>
                ) : (
                  <Pill className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200">
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    Evento não informado
                  </Pill>
                )}

                {eventoTitulo ? (
                  <Pill className="max-w-full border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-200">
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="truncate">{eventoTitulo}</span>
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
                onClick={carregarEventos}
                disabled={anyLoading || !eventoIdParam}
                tone="teal"
              >
                <RefreshCcw
                  className={classNames("h-4 w-4", carregando && "animate-spin")}
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
            aria-label="Carregando dados de presença"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-700 dark:bg-emerald-400" />
          </div>
        )}

        {!eventoIdParam ? (
          <ContextoAusente onVoltar={voltarPainelGestor} />
        ) : (
          <>
            <section
  className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
  aria-label="Resumo operacional de presenças"
>
              <MetricCard
                icon={Layers}
                label="Turmas"
                value={carregando ? "…" : kpis.turmas}
                hint="Turmas vinculadas"
                tone="teal"
              />

              <MetricCard
                icon={CalendarDays}
                label="Dias/aulas"
                value={carregando ? "…" : kpis.dias}
                hint="Datas válidas"
                tone="sky"
              />

              <MetricCard
                icon={UsersRound}
                label="Inscritos"
                value={carregando ? "…" : kpis.inscritos}
                hint="Por turma"
                tone="slate"
              />

              <MetricCard
                icon={UserCheck}
                label="Presenças"
                value={carregando ? "…" : kpis.presentes}
                hint="Registros confirmados"
                tone="emerald"
              />

              <MetricCard
                icon={UserX}
                label="Ausências"
                value={carregando ? "…" : kpis.ausentes}
                hint="Inscritos sem presença"
                tone="rose"
              />

              <MetricCard
                icon={Percent}
                label="% presença"
                value={carregando ? "…" : `${kpis.percentual_presenca}%`}
                hint={`${kpis.presentes}/${kpis.total_possivel || 0} possíveis`}
                tone="amber"
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
                      Não foi possível carregar a gestão de presenças
                    </h2>

                    <p className="mt-2 text-sm leading-relaxed text-rose-800 dark:text-rose-200">
                      {erro}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton onClick={carregarEventos} tone="rose">
                        <RefreshCcw className="h-4 w-4" aria-hidden="true" />
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

            {carregando ? (
              <LoadingPanel label="Carregando evento, turmas e presenças..." />
            ) : evento ? (
              <>
                <section className="mt-5 rounded-[2rem] border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-200">
                        Evento em foco
                      </p>

                      <h2 className="mt-1 break-words text-2xl font-black text-slate-950 dark:text-white">
                        {eventoTitulo}
                      </h2>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-700 dark:text-zinc-300">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-4 w-4" aria-hidden="true" />
                          {evento.local || "Local não informado"}
                        </span>

                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-4 w-4" aria-hidden="true" />
                          {periodoEventoTexto(evento)}
                        </span>

                        <span className="inline-flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4" aria-hidden="true" />
                          Presença consolidada por aluno e por data
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {turmas.slice(0, 3).map((turma) => {
                        const status = getTurmaStatus(turma);

                        return (
                          <Pill key={turma.turma_id} className={statusChipClass(status)}>
                            {turma.nome}: {labelStatusTurma(status)}
                          </Pill>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="mt-5" aria-label="Lista operacional de presenças">
                  {!turmas.length ? (
                    <section className="overflow-hidden rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-zinc-900 dark:text-zinc-300">
                        <Info className="h-7 w-7" aria-hidden="true" />
                      </div>

                      <p className="mt-4 text-base font-black text-slate-950 dark:text-white">
                        Nenhuma turma encontrada
                      </p>

                      <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                        Este evento não possui turmas disponíveis para gestão de presença.
                      </p>
                    </section>
                  ) : (
                    <ListaTurmasPresenca
                      eventos={eventosProcessados}
                      hoje={agora}
                      carregarInscritos={carregarInscritos}
                      carregarAvaliacao={carregarAvaliacao}
                      gerarRelatorioPDF={gerarRelatorioPDF}
                      inscritosPorTurma={inscritosPorTurma}
                      avaliacaoPorTurma={avaliacaoPorTurma}
                      navigate={navigate}
                      modoadministradorPresencas
                      agrupamento={agrupamento}
                      modoContextualEvento
                      abrirTudo
                      carregarListasAutomaticamente
                    />
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * PropTypes
 * ───────────────────────────────────────────────────────────── */

ActionButton.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  tone: PropTypes.oneOf(["neutral", "emerald", "teal", "rose"]),
  type: PropTypes.oneOf(["button", "submit", "reset"]),
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
  tone: PropTypes.oneOf(["emerald", "teal", "sky", "amber", "rose", "slate"]),
};

LoadingPanel.propTypes = {
  label: PropTypes.string,
};

ContextoAusente.propTypes = {
  onVoltar: PropTypes.func.isRequired,
};