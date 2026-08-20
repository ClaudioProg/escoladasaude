import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  LoaderCircle,
  Search,
  Users,
  X,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import {
  baixarRelatorioPreTeste,
  listarParticipantesPreTeste,
  listarRespostasDissertativasPreTeste,
  obterRespostasParticipantePreTeste,
  obterResultadosPreTeste,
} from "../services/preTesteResultadosService";

const RESPOSTAS_POR_LOTE = 10;

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatarDataHora(value) {
  if (!value) {
    return "Não disponível";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Não disponível";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function mensagemAmigavel(error, fallback) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.data?.code || "");

  if (status === 403 || code === "AUTH-403") {
    return "Seu perfil não possui permissão para consultar estes resultados.";
  }
  if (status === 404 || code.includes("NAO_ENCONTRAD")) {
    return "Os resultados solicitados não foram encontrados.";
  }
  if (status === 0) {
    return "Não foi possível acessar o servidor. Verifique sua conexão e tente novamente.";
  }

  return fallback;
}

function LoadingBlock({ label = "Carregando resultados..." }) {
  return (
    <div
      className="grid min-h-[280px] place-items-center rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900"
      role="status"
    >
      <div>
        <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-emerald-700" />
        <p className="mt-3 text-sm font-bold text-slate-600 dark:text-zinc-300">
          {label}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/15 dark:bg-zinc-900">
      <FileText className="mx-auto h-10 w-10 text-slate-400" />
      <h2 className="mt-4 text-lg font-black text-slate-950 dark:text-white">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
        {description}
      </p>
    </div>
  );
}

function SummaryCard({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
            {value}
          </p>
          {detail ? (
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-zinc-400">
              {detail}
            </p>
          ) : null}
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function ObjectiveQuestion({ pergunta }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Pergunta {pergunta.ordem} · Múltipla escolha
          </p>
          <h3 className="mt-1 break-words text-base font-black text-slate-950 dark:text-white sm:text-lg">
            {pergunta.enunciado}
          </h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-zinc-200">
          {pergunta.total_respostas} resposta(s)
        </span>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
          <thead className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            <tr>
              <th className="px-2 py-1">Alternativa</th>
              <th className="w-28 px-2 py-1 text-right">Quantidade</th>
              <th className="w-52 px-2 py-1">Percentual</th>
            </tr>
          </thead>
          <tbody>
            {pergunta.alternativas.map((alternativa) => (
              <tr key={alternativa.id} className="bg-slate-50 dark:bg-zinc-950">
                <td className="rounded-l-2xl px-3 py-3 font-bold text-slate-800 dark:text-zinc-100">
                  {alternativa.texto}
                </td>
                <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">
                  {alternativa.quantidade}
                </td>
                <td className="rounded-r-2xl px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 min-w-16 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{
                          width: `${Math.min(100, alternativa.percentual)}%`,
                        }}
                      />
                    </div>
                    <span className="w-14 text-right text-xs font-black text-slate-700 dark:text-zinc-200">
                      {Number(alternativa.percentual).toLocaleString("pt-BR", {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DiscursiveQuestion({ pergunta, state, onLoadMore }) {
  const respostas = state?.respostas || pergunta.respostas || [];
  const temMais = respostas.length < pergunta.total_respostas;

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">
            Pergunta {pergunta.ordem} · Dissertativa
          </p>
          <h3 className="mt-1 break-words text-base font-black text-slate-950 dark:text-white sm:text-lg">
            {pergunta.enunciado}
          </h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-zinc-200">
          {pergunta.total_respostas} resposta(s)
        </span>
      </div>

      {respostas.length ? (
        <div className="mt-5 space-y-3">
          {respostas.map((resposta) => (
            <div
              key={`${pergunta.id}-${resposta.submissao_id}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-black text-slate-800 dark:text-zinc-100">
                  {resposta.participante}
                </span>
                <span className="font-medium text-slate-500 dark:text-zinc-400">
                  {formatarDataHora(resposta.enviado_em)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-zinc-200">
                {resposta.resposta}
              </p>
            </div>
          ))}

          {state?.erro ? (
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
              {state.erro}
            </p>
          ) : null}

          {temMais ? (
            <button
              type="button"
              onClick={() => onLoadMore(pergunta)}
              disabled={state?.carregando}
              className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-black text-sky-800 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200"
            >
              {state?.carregando ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              Carregar mais respostas
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-600 dark:bg-zinc-950 dark:text-zinc-300">
          Nenhuma resposta registrada para esta pergunta.
        </p>
      )}
    </article>
  );
}

function ParticipantModal({ participante, loading, error, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="respostas-participante-titulo"
    >
      <section className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-t-[2rem] bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-[2rem]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-white/10">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Respostas individuais
            </p>
            <h2
              id="respostas-participante-titulo"
              className="mt-1 text-xl font-black text-slate-950 dark:text-white"
            >
              {participante?.nome || "Participante"}
            </h2>
            {participante?.enviado_em ? (
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-zinc-400">
                Enviado em {formatarDataHora(participante.enviado_em)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10"
            aria-label="Fechar respostas do participante"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[calc(92vh-104px)] overflow-y-auto p-5">
          {loading ? (
            <div className="grid min-h-52 place-items-center" role="status">
              <LoaderCircle className="h-8 w-8 animate-spin text-emerald-700" />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          {!loading && !error && participante ? (
            <ol className="space-y-3">
              {participante.respostas.map((resposta) => (
                <li
                  key={resposta.pergunta_id}
                  className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"
                >
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                    Pergunta {resposta.ordem} ·{" "}
                    {resposta.tipo === "multipla_escolha"
                      ? "Múltipla escolha"
                      : "Dissertativa"}
                  </p>
                  <p className="mt-1 font-black text-slate-950 dark:text-white">
                    {resposta.enunciado}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-zinc-950 dark:text-zinc-200">
                    {resposta.resposta || "Sem resposta"}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function ResultadosPreTeste() {
  const { evento_id: eventoId } = useParams();
  const navigate = useNavigate();
  const [resultados, setResultados] = useState(null);
  const [versaoId, setVersaoId] = useState("");
  const [aba, setAba] = useState("perguntas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pdfLoading, setPdfLoading] = useState("");
  const [respostasPorPergunta, setRespostasPorPergunta] = useState({});

  const [busca, setBusca] = useState("");
  const [paginaParticipantes, setPaginaParticipantes] = useState(1);
  const [participantes, setParticipantes] = useState(null);
  const [participantesLoading, setParticipantesLoading] = useState(false);
  const [participantesError, setParticipantesError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [participanteDetalhe, setParticipanteDetalhe] = useState(null);
  const [participanteLoading, setParticipanteLoading] = useState(false);
  const [participanteError, setParticipanteError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      setRespostasPorPergunta({});

      try {
        const data = await obterResultadosPreTeste(eventoId, versaoId || null);
        if (!active) {
          return;
        }

        setResultados(data);
        const selected = data?.versao_selecionada?.id;
        if (!versaoId && selected) {
          setVersaoId(String(selected));
        }
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(
          mensagemAmigavel(
            loadError,
            "Não foi possível carregar os resultados do pré-teste.",
          ),
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [eventoId, versaoId]);

  useEffect(() => {
    if (aba !== "participantes" || !versaoId) {
      return undefined;
    }

    let active = true;
    const timeoutId = window.setTimeout(
      async () => {
        setParticipantesLoading(true);
        setParticipantesError("");

        try {
          const data = await listarParticipantesPreTeste(eventoId, {
            versaoId,
            busca,
            pagina: paginaParticipantes,
            limite: 20,
          });
          if (active) {
            setParticipantes(data);
          }
        } catch (loadError) {
          if (active) {
            setParticipantesError(
              mensagemAmigavel(
                loadError,
                "Não foi possível carregar a lista de participantes.",
              ),
            );
          }
        } finally {
          if (active) {
            setParticipantesLoading(false);
          }
        }
      },
      busca ? 300 : 0,
    );

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [aba, busca, eventoId, paginaParticipantes, versaoId]);

  const carregarMaisRespostas = useCallback(
    async (pergunta) => {
      const current = respostasPorPergunta[pergunta.id];
      const pagina = (current?.pagina || 1) + 1;

      setRespostasPorPergunta((state) => ({
        ...state,
        [pergunta.id]: {
          ...(state[pergunta.id] || {}),
          respostas: state[pergunta.id]?.respostas || pergunta.respostas,
          pagina: state[pergunta.id]?.pagina || 1,
          carregando: true,
          erro: "",
        },
      }));

      try {
        const data = await listarRespostasDissertativasPreTeste(
          eventoId,
          pergunta.id,
          {
            versaoId,
            pagina,
            limite: RESPOSTAS_POR_LOTE,
          },
        );

        setRespostasPorPergunta((state) => {
          const anteriores =
            state[pergunta.id]?.respostas || pergunta.respostas;
          const todas = [...anteriores, ...(data?.respostas || [])];
          const unicas = [
            ...new Map(todas.map((item) => [item.submissao_id, item])).values(),
          ];

          return {
            ...state,
            [pergunta.id]: {
              respostas: unicas,
              pagina,
              carregando: false,
              erro: "",
            },
          };
        });
      } catch (loadError) {
        setRespostasPorPergunta((state) => ({
          ...state,
          [pergunta.id]: {
            ...(state[pergunta.id] || {}),
            respostas: state[pergunta.id]?.respostas || pergunta.respostas,
            carregando: false,
            erro: mensagemAmigavel(
              loadError,
              "Não foi possível carregar mais respostas.",
            ),
          },
        }));
      }
    },
    [eventoId, respostasPorPergunta, versaoId],
  );

  const abrirParticipante = useCallback(
    async (submissaoId) => {
      setModalOpen(true);
      setParticipanteDetalhe(null);
      setParticipanteError("");
      setParticipanteLoading(true);

      try {
        const data = await obterRespostasParticipantePreTeste(
          eventoId,
          submissaoId,
          versaoId,
        );
        setParticipanteDetalhe(data);
      } catch (loadError) {
        setParticipanteError(
          mensagemAmigavel(
            loadError,
            "Não foi possível carregar as respostas deste participante.",
          ),
        );
      } finally {
        setParticipanteLoading(false);
      }
    },
    [eventoId, versaoId],
  );

  const fecharParticipante = useCallback(() => {
    setModalOpen(false);
    setParticipanteDetalhe(null);
    setParticipanteError("");
  }, []);

  const baixarPdf = useCallback(
    async (tipo) => {
      setPdfLoading(tipo);
      setError("");
      try {
        await baixarRelatorioPreTeste(eventoId, { versaoId, tipo });
      } catch (downloadError) {
        setError(
          mensagemAmigavel(
            downloadError,
            "Não foi possível gerar o relatório em PDF.",
          ),
        );
      } finally {
        setPdfLoading("");
      }
    },
    [eventoId, versaoId],
  );

  const versaoSelecionada = resultados?.versao_selecionada;
  const totalRespostas = Number(resultados?.resumo?.total_submissoes || 0);
  const perguntas = useMemo(() => resultados?.perguntas || [], [resultados]);

  if (loading && !resultados) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <LoadingBlock />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        <button
          type="button"
          onClick={() => navigate("/administrador")}
          className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-black text-slate-600 transition hover:bg-white hover:text-slate-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao painel
        </button>

        <section className="mt-3 overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">
                Consulta administrativa
              </p>
              <h1 className="mt-2 break-words text-2xl font-black tracking-tight sm:text-3xl">
                Resultados do pré-teste
              </h1>
              <p className="mt-2 max-w-3xl break-words text-sm font-medium text-emerald-50 sm:text-base">
                {resultados?.evento?.titulo || `Evento ${eventoId}`}
              </p>
              {versaoSelecionada ? (
                <p className="mt-2 text-xs font-bold text-emerald-100">
                  Versão {versaoSelecionada.numero_versao} · Publicada em{" "}
                  {formatarDataHora(versaoSelecionada.publicado_em)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
              <label className="min-w-0">
                <span className="sr-only">Versão publicada</span>
                <select
                  value={versaoId}
                  onChange={(event) => {
                    setVersaoId(event.target.value);
                    setResultados(null);
                    setLoading(true);
                    setPaginaParticipantes(1);
                    setParticipantes(null);
                  }}
                  disabled={!resultados?.versoes?.length || loading}
                  className="h-11 w-full rounded-2xl border border-white/25 bg-white px-3 text-sm font-black text-emerald-950 outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60"
                >
                  {!resultados?.versoes?.length ? (
                    <option value="">Sem versão publicada</option>
                  ) : null}
                  {(resultados?.versoes || []).map((versao) => (
                    <option key={versao.id} value={versao.id}>
                      Versão {versao.numero_versao}
                      {versao.atual ? " · atual" : ""} (
                      {versao.total_submissoes} resposta(s))
                    </option>
                  ))}
                </select>
              </label>

              {[
                ["consolidado", "PDF consolidado"],
                ["detalhado", "PDF detalhado"],
              ].map(([tipo, label]) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => baixarPdf(tipo)}
                  disabled={!totalRespostas || Boolean(pdfLoading)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {pdfLoading === tipo ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error ? (
          <div
            className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {!error && !resultados?.configurado ? (
          <div className="mt-6">
            <EmptyState
              title="Pré-teste não configurado"
              description="Este evento ainda não possui um pré-teste configurado."
            />
          </div>
        ) : null}

        {!error && resultados?.configurado && !versaoSelecionada ? (
          <div className="mt-6">
            <EmptyState
              title="Nenhuma versão publicada"
              description="O pré-teste está configurado, mas ainda não possui uma versão publicada para consulta."
            />
          </div>
        ) : null}

        {versaoSelecionada ? (
          <>
            <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Respondentes únicos"
                value={resultados.resumo.respondentes_unicos}
                detail="Uma submissão por participante e versão"
                icon={Users}
              />
              <SummaryCard
                label="Perguntas"
                value={resultados.resumo.numero_perguntas}
                detail={`Versão ${versaoSelecionada.numero_versao}`}
                icon={BarChart3}
              />
              <SummaryCard
                label="Primeira resposta"
                value={
                  totalRespostas
                    ? formatarDataHora(resultados.resumo.primeira_resposta)
                    : "—"
                }
                icon={CheckCircle2}
              />
              <SummaryCard
                label="Resposta mais recente"
                value={
                  totalRespostas
                    ? formatarDataHora(resultados.resumo.ultima_resposta)
                    : "—"
                }
                icon={CheckCircle2}
              />
            </section>

            {!totalRespostas ? (
              <div className="mt-6">
                <EmptyState
                  title="Ainda não há respostas"
                  description="A versão selecionada está publicada, mas nenhum participante enviou o pré-teste. Os relatórios serão liberados após a primeira resposta."
                />
              </div>
            ) : (
              <>
                <div className="mt-6 inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                  <button
                    type="button"
                    onClick={() => setAba("perguntas")}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition",
                      aba === "perguntas"
                        ? "bg-emerald-700 text-white"
                        : "text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10",
                    )}
                  >
                    <BarChart3 className="h-4 w-4" />
                    Por pergunta
                  </button>
                  <button
                    type="button"
                    onClick={() => setAba("participantes")}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition",
                      aba === "participantes"
                        ? "bg-emerald-700 text-white"
                        : "text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10",
                    )}
                  >
                    <Users className="h-4 w-4" />
                    Por participante
                  </button>
                </div>

                {aba === "perguntas" ? (
                  <section
                    className="mt-4 space-y-4"
                    aria-label="Resultados por pergunta"
                  >
                    {perguntas.map((pergunta) =>
                      pergunta.tipo === "multipla_escolha" ? (
                        <ObjectiveQuestion
                          key={pergunta.id}
                          pergunta={pergunta}
                        />
                      ) : (
                        <DiscursiveQuestion
                          key={pergunta.id}
                          pergunta={pergunta}
                          state={respostasPorPergunta[pergunta.id]}
                          onLoadMore={carregarMaisRespostas}
                        />
                      ),
                    )}
                  </section>
                ) : (
                  <section
                    className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-5"
                    aria-label="Resultados por participante"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-black text-slate-950 dark:text-white">
                          Participantes
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-zinc-400">
                          Consulte uma submissão individual, sem exibir CPF.
                        </p>
                      </div>
                      <label className="relative block sm:w-80">
                        <span className="sr-only">Buscar por nome</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={busca}
                          onChange={(event) => {
                            setBusca(event.target.value);
                            setPaginaParticipantes(1);
                          }}
                          placeholder="Buscar por nome..."
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-zinc-950"
                        />
                      </label>
                    </div>

                    {participantesError ? (
                      <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                        {participantesError}
                      </p>
                    ) : null}

                    {participantesLoading ? (
                      <div
                        className="grid min-h-44 place-items-center"
                        role="status"
                      >
                        <LoaderCircle className="h-7 w-7 animate-spin text-emerald-700" />
                      </div>
                    ) : null}

                    {!participantesLoading && !participantesError ? (
                      <div className="mt-4 space-y-2">
                        {(participantes?.participantes || []).map(
                          (participante) => (
                            <div
                              key={participante.submissao_id}
                              className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-black text-slate-950 dark:text-white">
                                  {participante.nome}
                                </p>
                                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-zinc-400">
                                  Enviado em{" "}
                                  {formatarDataHora(participante.enviado_em)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  abrirParticipante(participante.submissao_id)
                                }
                                className="rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-800"
                              >
                                Ver respostas
                              </button>
                            </div>
                          ),
                        )}

                        {!participantes?.participantes?.length ? (
                          <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-medium text-slate-600 dark:bg-zinc-950 dark:text-zinc-300">
                            Nenhum participante encontrado para esta busca.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {participantes?.paginacao?.total_paginas > 1 ? (
                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
                        <button
                          type="button"
                          onClick={() =>
                            setPaginaParticipantes((page) =>
                              Math.max(1, page - 1),
                            )
                          }
                          disabled={
                            paginaParticipantes <= 1 || participantesLoading
                          }
                          className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/10"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </button>
                        <span className="text-xs font-black text-slate-500 dark:text-zinc-400">
                          Página {paginaParticipantes} de{" "}
                          {participantes.paginacao.total_paginas}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPaginaParticipantes((page) => page + 1)
                          }
                          disabled={
                            paginaParticipantes >=
                              participantes.paginacao.total_paginas ||
                            participantesLoading
                          }
                          className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/10"
                        >
                          Próxima
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </section>
                )}
              </>
            )}
          </>
        ) : null}
      </main>

      <Footer />

      {modalOpen ? (
        <ParticipantModal
          participante={participanteDetalhe}
          loading={participanteLoading}
          error={participanteError}
          onClose={fecharParticipante}
        />
      ) : null}
    </div>
  );
}
