// ✅ frontend/src/pages/QRCodesEventosAdmin.jsx — v2.1
// Atualizado em: 02/06/2026
// Plataforma Escola da Saúde
//
// Tela operacional contextual para geração de QR Codes de presença.
//
// Revisão premium v2.1:
// - tela acessada somente pelo Painel do Gestor;
// - evento_id obrigatório via URL;
// - sem modo geral;
// - sem busca/listagem geral;
// - sem conteúdo minimizado;
// - carrega somente o evento informado;
// - carrega automaticamente as turmas do evento;
// - carrega automaticamente as datas reais de cada turma quando necessário;
// - gera QR Code oficial por turma_id + data_presenca;
// - turma com mais de um dia gera QR diferente para cada data;
// - botão para gerar QR individual por data;
// - botão para gerar todos os QRs da turma;
// - botão para gerar todos os QRs do evento;
// - usa HeaderHero global oficial, limpo;
// - botões, contexto, badges e stats ficam abaixo do HeaderHero;
// - usa Footer oficial;
// - visual institucional premium;
// - mobile-first, acessível, moderno e operacional;
// - sem /api manual no frontend;
// - sem rota plural /presencas;
// - sem query antiga "turma";
// - sem QR apenas por turma_id.
//
// Contratos aplicados:
// - parâmetro contextual oficial: evento_id;
// - QR oficial: /presenca?turma_id=:turma_id&data_presenca=:data_presenca;
// - Eventos administrativos via listarEventosAdmin();
// - Turmas do evento via listarTurmasDoEvento(evento_id);
// - Datas da turma via apiTurmaDatas(turma_id), com fallback para datas já presentes na turma;
// - PDF via gerarQrCodePresencaPDF(turma, evento, organizador, { data_presenca }).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PropTypes from "prop-types";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileDown,
  Info,
  Layers,
  Loader2,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";

import {
  isAbortLike,
  listarEventosAdmin,
  listarTurmasDoEvento,
} from "../services/eventoService";

import { apiTurmaDatas } from "../services/api";
import { gerarQrCodePresencaPDF } from "../utils/gerarQrCodePresencaPDF";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
} from "../components/ui/AppToast";

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

function safeStr(value, max = 260) {
  return String(value ?? "")
    .slice(0, max)
    .trim();
}

function ymd(value) {
  if (typeof value !== "string") {
    return "";
  }

  const clean = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(clean)) {
    return clean.slice(0, 10);
  }

  return "";
}

function hhmm(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const clean = value.trim();

  if (/^\d{2}:\d{2}$/.test(clean)) {
    return clean;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) {
    return clean.slice(0, 5);
  }

  return fallback;
}

function formatarDataBR(value) {
  const data = ymd(value);

  if (!data) {
    return "—";
  }

  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataCurta(value) {
  const data = ymd(value);

  if (!data) {
    return "—";
  }

  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano.slice(2)}`;
}

function tituloEvento(evento) {
  return safeStr(evento?.titulo || `Evento #${evento?.id ?? "—"}`, 180);
}

function tituloTurma(turma) {
  return safeStr(
    turma?.nome ||
      turma?.turma_nome ||
      `Turma #${turma?.id ?? turma?.turma_id ?? "—"}`,
    180,
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

function getOrganizadoresNomes(evento, turma) {
  const fontes = [
    Array.isArray(turma?.organizadores) ? turma.organizadores : [],
    Array.isArray(turma?.organizador) ? turma.organizador : [],
    Array.isArray(evento?.organizadores) ? evento.organizadores : [],
    Array.isArray(evento?.organizador) ? evento.organizador : [],
  ];

  const nomes = fontes
    .flat()
    .map((item) => item?.nome || item?.nome_completo || item?.usuario_nome)
    .filter(Boolean);

  return nomes.length ? [...new Set(nomes)].join(", ") : "organizador";
}

function normalizarDataItem(item, turma = {}) {
  if (typeof item === "string") {
    const data = ymd(item);

    if (!data) {
      return null;
    }

    return {
      data,
      data_presenca: data,
      horario_inicio: hhmm(turma?.horario_inicio, ""),
      horario_fim: hhmm(turma?.horario_fim, ""),
    };
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const data = ymd(
    item.data ||
      item.data_presenca ||
      item.data_inicio ||
      item.dia ||
      item.date,
  );

  if (!data) {
    return null;
  }

  return {
    ...item,
    data,
    data_presenca: data,
    horario_inicio: hhmm(
      item.horario_inicio || item.inicio || turma?.horario_inicio,
      "",
    ),
    horario_fim: hhmm(item.horario_fim || item.fim || turma?.horario_fim, ""),
  };
}

function extrairDatasDaTurmaLocal(turma) {
  const fontes = [
    turma?.datas,
    turma?.datas_turma,
    turma?.datasTurma,
    turma?.encontros,
    turma?.ocorrencias,
  ];

  const itens = fontes.find((fonte) => Array.isArray(fonte) && fonte.length);

  if (Array.isArray(itens) && itens.length) {
    return itens
      .map((item) => normalizarDataItem(item, turma))
      .filter(Boolean)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }

  const dataInicio = ymd(turma?.data_inicio || turma?.data);
  const dataFim = ymd(turma?.data_fim || turma?.data_inicio || turma?.data);

  if (!dataInicio) {
    return [];
  }

  if (!dataFim || dataFim === dataInicio) {
    return [
      {
        data: dataInicio,
        data_presenca: dataInicio,
        horario_inicio: hhmm(turma?.horario_inicio, ""),
        horario_fim: hhmm(turma?.horario_fim, ""),
      },
    ];
  }

  return [
    {
      data: dataInicio,
      data_presenca: dataInicio,
      horario_inicio: hhmm(turma?.horario_inicio, ""),
      horario_fim: hhmm(turma?.horario_fim, ""),
    },
  ];
}

function normalizarRespostaDatas(response, turma) {
  const raw = Array.isArray(response)
    ? response
    : Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.data?.datas)
        ? response.data.datas
        : Array.isArray(response?.datas)
          ? response.datas
          : [];

  return raw
    .map((item) => normalizarDataItem(item, turma))
    .filter(Boolean)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

function montarTurmaParaQr(turma, dataPresenca) {
  const turma_id = toPositiveInt(turma?.turma_id || turma?.id);

  return {
    ...turma,
    id: turma_id,
    turma_id,
    data_presenca: dataPresenca,
    qr_payload: {
      turma_id,
      data_presenca: dataPresenca,
    },
  };
}

function nomeArquivoQr({ evento, turma, dataPresenca }) {
  const eventoId = toPositiveInt(evento?.id) || "evento";
  const turmaId = toPositiveInt(turma?.turma_id || turma?.id) || "turma";

  return `qr_presenca_evento_${eventoId}_turma_${turmaId}_${dataPresenca}.pdf`;
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
    indigo:
      "border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800 dark:border-indigo-600",
    sky: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-200",
    rose: "border-rose-700 bg-rose-700 text-white hover:bg-rose-800 dark:border-rose-600",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60",
        tones[tone] || tones.neutral,
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
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100",
    indigo:
      "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/25 dark:text-indigo-100",
    sky: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-100",
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100",
    slate:
      "border-slate-200 bg-white text-slate-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
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
            carregar as turmas e gerar QR Codes do evento específico.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton onClick={onVoltar} tone="indigo">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar ao Painel do Gestor
            </ActionButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function LoadingPanel({ label = "Carregando dados..." }) {
  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-center gap-2 p-10 text-sm font-black text-indigo-700 dark:text-indigo-300">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        {label}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Página
 * ───────────────────────────────────────────────────────────── */

export default function QRCodesEventosAdmin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const eventoIdParam = useMemo(
    () => toPositiveInt(searchParams.get("evento_id")),
    [searchParams],
  );

  const [evento, setEvento] = useState(null);
  const [turmas, setTurmas] = useState([]);
  const [datasPorTurma, setDatasPorTurma] = useState({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState("");

  const liveRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  const setLive = useCallback((message) => {
    if (liveRef.current) {
      liveRef.current.textContent = message || "";
    }
  }, []);

  const voltarPainelGestor = useCallback(() => {
    navigate("/administrador");
  }, [navigate]);

  useEffect(() => {
    document.title = "QR Codes do evento — Escola da Saúde";
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

  const carregarDatasDaTurma = useCallback(async (turma) => {
    const turmaId = toPositiveInt(turma?.turma_id || turma?.id);

    if (!turmaId) {
      return [];
    }

    const datasLocais = extrairDatasDaTurmaLocal(turma);

    if (datasLocais.length > 1) {
      return datasLocais;
    }

    try {
      const response = await apiTurmaDatas(turmaId, {
        on401: "redirect",
        on403: "silent",
      });

      const datasApi = normalizarRespostaDatas(response, turma);

      return datasApi.length ? datasApi : datasLocais;
    } catch {
      return datasLocais;
    }
  }, []);

  const carregarPagina = useCallback(async () => {
    try {
      abortRef.current?.abort?.("nova-requisicao");
    } catch {
      // noop
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setErro("");
    setEvento(null);
    setTurmas([]);
    setDatasPorTurma({});
    setGerando("");
    setLive("Carregando evento, turmas e datas.");

    if (!eventoIdParam) {
      setLoading(false);
      setLive("Contexto ausente.");
      return;
    }

    try {
      const listaEventos = await listarEventosAdmin({
        signal: controller.signal,
      });

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      const eventos = Array.isArray(listaEventos) ? listaEventos : [];
      const eventoEncontrado =
        eventos.find((item) => Number(item?.id) === eventoIdParam) || null;

      if (!eventoEncontrado) {
        setErro("O evento informado no link não foi encontrado.");
        setLive("Evento não encontrado.");
        return;
      }

      setEvento(eventoEncontrado);
      setLive("Evento localizado. Carregando turmas.");

      const listaTurmas = await listarTurmasDoEvento(eventoIdParam, {
        signal: controller.signal,
      });

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      const turmasValidas = (Array.isArray(listaTurmas) ? listaTurmas : [])
        .map((turma) => {
          const turmaId = toPositiveInt(turma?.turma_id || turma?.id);

          return {
            ...turma,
            id: turmaId,
            turma_id: turmaId,
          };
        })
        .filter((turma) => Boolean(turma.turma_id));

      setTurmas(turmasValidas);
      setLive(
        `${turmasValidas.length} turma(s) carregada(s). Carregando datas.`,
      );

      const pares = await Promise.all(
        turmasValidas.map(async (turma) => {
          const datas = await carregarDatasDaTurma(turma);

          return [turma.turma_id, datas];
        }),
      );

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      const mapaDatas = pares.reduce((acc, [turmaId, datas]) => {
        acc[turmaId] = Array.isArray(datas) ? datas : [];
        return acc;
      }, {});

      setDatasPorTurma(mapaDatas);
      setLive("Evento, turmas e datas carregados.");
    } catch (error) {
      if (isAbortLike(error)) {
        return;
      }
      if (!mountedRef.current) {
        return;
      }

      const message = getErrorMessage(
        error,
        "Não foi possível carregar os dados para geração de QR Codes.",
      );

      setErro(message);
      setEvento(null);
      setTurmas([]);
      setDatasPorTurma({});
      notifyError(message);
      setLive("Falha ao carregar dados.");
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [carregarDatasDaTurma, eventoIdParam, setLive]);

  useEffect(() => {
    carregarPagina();
  }, [carregarPagina]);

  const totalDatas = useMemo(() => {
    return Object.values(datasPorTurma).reduce(
      (acc, datas) => acc + (Array.isArray(datas) ? datas.length : 0),
      0,
    );
  }, [datasPorTurma]);

  const turmasComMaisDeUmDia = useMemo(() => {
    return turmas.filter((turma) => {
      const datas = datasPorTurma[turma.turma_id] || [];
      return datas.length > 1;
    }).length;
  }, [datasPorTurma, turmas]);

  const eventoTitulo = evento ? tituloEvento(evento) : "";
  const anyLoading = loading || Boolean(gerando);

  const gerarQrIndividual = useCallback(
    async ({ turma, dataItem }) => {
      const turmaId = toPositiveInt(turma?.turma_id || turma?.id);
      const dataPresenca = ymd(dataItem?.data_presenca || dataItem?.data);

      if (!turmaId) {
        notifyError("turma_id inválido para geração do QR Code.");
        return false;
      }

      if (!dataPresenca) {
        notifyError("data_presenca inválida para geração do QR Code.");
        return false;
      }

      const key = `${turmaId}|${dataPresenca}`;

      if (gerando) {
        return false;
      }

      setGerando(key);
      setLive(
        `Gerando QR da turma ${turmaId} para ${formatarDataBR(dataPresenca)}.`,
      );

      try {
        await gerarQrCodePresencaPDF(
          montarTurmaParaQr(turma, dataPresenca),
          eventoTitulo || "Evento",
          getOrganizadoresNomes(evento, turma),
          {
            data_presenca: dataPresenca,
            nomeArquivo: nomeArquivoQr({
              evento,
              turma,
              dataPresenca,
            }),
          },
        );

        notifySuccess("PDF do QR Code gerado com sucesso.");
        setLive("PDF do QR Code gerado com sucesso.");

        return true;
      } catch (error) {
        notifyError(getErrorMessage(error, "Erro ao gerar PDF do QR Code."));
        setLive("Falha ao gerar PDF do QR Code.");

        return false;
      } finally {
        setGerando("");
      }
    },
    [evento, eventoTitulo, gerando, setLive],
  );

  const gerarTodosDaTurma = useCallback(
    async (turma) => {
      const turmaId = toPositiveInt(turma?.turma_id || turma?.id);
      const datas = datasPorTurma[turmaId] || [];

      if (!turmaId) {
        notifyError("turma_id inválido para geração dos QR Codes.");
        return;
      }

      if (!datas.length) {
        notifyError(
          "Esta turma não possui datas válidas para geração de QR Code.",
        );
        return;
      }

      if (gerando) {
        return;
      }

      setGerando(`turma|${turmaId}`);
      setLive(`Gerando todos os QRs da turma ${turmaId}.`);

      try {
        for (const dataItem of datas) {
          const dataPresenca = ymd(dataItem?.data_presenca || dataItem?.data);

          if (!dataPresenca) {
            continue;
          }

          await gerarQrCodePresencaPDF(
            montarTurmaParaQr(turma, dataPresenca),
            eventoTitulo || "Evento",
            getOrganizadoresNomes(evento, turma),
            {
              data_presenca: dataPresenca,
              nomeArquivo: nomeArquivoQr({
                evento,
                turma,
                dataPresenca,
              }),
            },
          );
        }

        notifySuccess("QR Codes da turma gerados com sucesso.");
        setLive("QR Codes da turma gerados com sucesso.");
      } catch (error) {
        notifyError(getErrorMessage(error, "Erro ao gerar QR Codes da turma."));
        setLive("Falha ao gerar QR Codes da turma.");
      } finally {
        setGerando("");
      }
    },
    [datasPorTurma, evento, eventoTitulo, gerando, setLive],
  );

  const gerarTodosDoEvento = useCallback(async () => {
    if (!turmas.length) {
      notifyInfo("Nenhuma turma disponível para geração de QR Code.");
      return;
    }

    if (gerando) {
      return;
    }

    setGerando("evento");
    setLive("Gerando todos os QR Codes do evento.");

    try {
      for (const turma of turmas) {
        const turmaId = toPositiveInt(turma?.turma_id || turma?.id);
        const datas = datasPorTurma[turmaId] || [];

        for (const dataItem of datas) {
          const dataPresenca = ymd(dataItem?.data_presenca || dataItem?.data);

          if (!turmaId || !dataPresenca) {
            continue;
          }

          await gerarQrCodePresencaPDF(
            montarTurmaParaQr(turma, dataPresenca),
            eventoTitulo || "Evento",
            getOrganizadoresNomes(evento, turma),
            {
              data_presenca: dataPresenca,
              nomeArquivo: nomeArquivoQr({
                evento,
                turma,
                dataPresenca,
              }),
            },
          );
        }
      }

      notifySuccess("Todos os QR Codes do evento foram gerados.");
      setLive("Todos os QR Codes do evento foram gerados.");
    } catch (error) {
      notifyError(getErrorMessage(error, "Erro ao gerar todos os QR Codes."));
      setLive("Falha ao gerar todos os QR Codes do evento.");
    } finally {
      setGerando("");
    }
  }, [datasPorTurma, evento, eventoTitulo, gerando, setLive, turmas]);

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
          titulo="QR Codes de presença"
          subtitulo="Tela operacional contextual do Painel do Gestor para gerar QR Codes oficiais por turma e por data de aula, evitando reutilização indevida de QR Code antigo."
          icone={QrCode}
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
                  <Pill className="border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/40 dark:bg-indigo-950/25 dark:text-indigo-200">
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
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
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
                onClick={carregarPagina}
                disabled={anyLoading || !eventoIdParam}
                tone="indigo"
              >
                <RefreshCcw
                  className={classNames("h-4 w-4", loading && "animate-spin")}
                  aria-hidden="true"
                />
                Atualizar dados
              </ActionButton>

              <ActionButton
                onClick={gerarTodosDoEvento}
                disabled={
                  anyLoading || !evento || !turmas.length || totalDatas <= 0
                }
                tone="emerald"
              >
                {gerando === "evento" ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                )}
                Gerar todos do evento
              </ActionButton>
            </div>
          </div>
        </section>

        {anyLoading && (
          <div
            className="sticky top-0 z-40 mt-4 h-1 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950/30"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Carregando ou gerando QR Codes"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-700 dark:bg-indigo-400" />
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
                value={loading ? "…" : evento ? 1 : 0}
                hint="Contexto recebido pelo Painel do Gestor"
                tone="indigo"
              />

              <MetricCard
                icon={Layers}
                label="Turmas"
                value={loading ? "…" : turmas.length}
                hint="Turmas vinculadas ao evento"
                tone="sky"
              />

              <MetricCard
                icon={CalendarClock}
                label="Datas"
                value={loading ? "…" : totalDatas}
                hint="Cada data gera um QR próprio"
                tone="amber"
              />

              <MetricCard
                icon={ShieldCheck}
                label="Turmas multi-dia"
                value={loading ? "…" : turmasComMaisDeUmDia}
                hint="Proteção contra QR antigo"
                tone="emerald"
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

            {loading ? (
              <LoadingPanel label="Carregando evento, turmas e datas..." />
            ) : evento ? (
              <>
                <section className="mt-5 rounded-[2rem] border border-indigo-200 bg-indigo-50/80 p-4 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/20 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-800 dark:text-indigo-200">
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
                          <Sparkles className="h-4 w-4" aria-hidden="true" />
                          QR seguro por data da aula
                        </span>
                      </div>
                    </div>

                    <Pill className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200">
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Contrato turma_id + data_presenca
                    </Pill>
                  </div>
                </section>

                <section className="mt-5" aria-label="Turmas e QR Codes">
                  {!turmas.length ? (
                    <section className="overflow-hidden rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-zinc-900 dark:text-zinc-300">
                        <Info className="h-7 w-7" aria-hidden="true" />
                      </div>

                      <p className="mt-4 text-base font-black text-slate-950 dark:text-white">
                        Nenhuma turma encontrada
                      </p>

                      <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                        Este evento não possui turmas disponíveis para geração
                        de QR Code.
                      </p>
                    </section>
                  ) : (
                    <div className="grid gap-5">
                      {turmas.map((turma) => {
                        const turmaId = toPositiveInt(
                          turma?.turma_id || turma?.id,
                        );
                        const datas = datasPorTurma[turmaId] || [];
                        const turmaTitulo = tituloTurma(turma);
                        const organizadores = getOrganizadoresNomes(
                          evento,
                          turma,
                        );
                        const loadingTurma = gerando === `turma|${turmaId}`;

                        return (
                          <article
                            key={turmaId}
                            className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-500" />

                            <div className="p-4 sm:p-5">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
                                    Turma
                                  </p>

                                  <h3 className="mt-1 break-words text-xl font-black text-slate-950 dark:text-white">
                                    {turmaTitulo}
                                  </h3>

                                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-zinc-300">
                                    <span>
                                      Organizador:{" "}
                                      <strong>{organizadores}</strong>
                                    </span>

                                    <span>
                                      Datas válidas:{" "}
                                      <strong>{datas.length}</strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <Pill className="border-slate-200 bg-slate-50 text-slate-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                                    <QrCode
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                    turma_id {turmaId}
                                  </Pill>

                                  {datas.length > 1 ? (
                                    <Pill className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200">
                                      <ShieldCheck
                                        className="h-3.5 w-3.5"
                                        aria-hidden="true"
                                      />
                                      QR por dia
                                    </Pill>
                                  ) : null}

                                  <ActionButton
                                    onClick={() => gerarTodosDaTurma(turma)}
                                    disabled={anyLoading || !datas.length}
                                    tone="indigo"
                                  >
                                    {loadingTurma ? (
                                      <Loader2
                                        className="h-4 w-4 animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <FileDown
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                    )}
                                    Gerar todos da turma
                                  </ActionButton>
                                </div>
                              </div>
                            </div>

                            <div className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
                              {!datas.length ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                                  Nenhuma data válida encontrada para esta
                                  turma.
                                </div>
                              ) : (
                                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {datas.map((dataItem) => {
                                    const dataPresenca = ymd(
                                      dataItem.data_presenca || dataItem.data,
                                    );

                                    const key = `${turmaId}|${dataPresenca}`;
                                    const isLoading = gerando === key;

                                    return (
                                      <li
                                        key={key}
                                        className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-400">
                                              Data da presença
                                            </p>

                                            <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                                              {formatarDataBR(dataPresenca)}
                                            </p>

                                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                                              {dataItem.horario_inicio ||
                                                "Horário a definir"}
                                              {dataItem.horario_fim
                                                ? ` às ${dataItem.horario_fim}`
                                                : ""}
                                            </p>
                                          </div>

                                          <Pill className="border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/40 dark:bg-indigo-950/25 dark:text-indigo-200">
                                            {formatarDataCurta(dataPresenca)}
                                          </Pill>
                                        </div>

                                        <div className="mt-4">
                                          <ActionButton
                                            onClick={() =>
                                              gerarQrIndividual({
                                                turma,
                                                dataItem,
                                              })
                                            }
                                            disabled={
                                              anyLoading || !dataPresenca
                                            }
                                            tone="emerald"
                                          >
                                            {isLoading ? (
                                              <Loader2
                                                className="h-4 w-4 animate-spin"
                                                aria-hidden="true"
                                              />
                                            ) : (
                                              <FileDown
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                              />
                                            )}
                                            Gerar QR desta data
                                          </ActionButton>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
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
  tone: PropTypes.oneOf(["neutral", "emerald", "indigo", "sky", "rose"]),
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
  tone: PropTypes.oneOf(["emerald", "indigo", "sky", "amber", "slate"]),
};

ContextoAusente.propTypes = {
  onVoltar: PropTypes.func.isRequired,
};

LoadingPanel.propTypes = {
  label: PropTypes.string,
};
