import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  QrCode,
  RefreshCw,
  Share2,
  ShieldAlert,
  UserRoundCheck,
  Users,
  XCircle,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import ListaTurmasEvento from "../components/eventos/ListaTurmasEvento";
import ModalPreTesteInscricao from "../components/eventos/ModalPreTesteInscricao";
import ModalConfirmacao from "../components/ui/ModalConfirmacao";
import {
  notifyError,
  notifySuccess,
  notifyWarning,
} from "../components/ui/AppToast";
import EventoService, {
  getEventoFolderUrl,
  hhmm,
  isAbortLike,
  ymd,
} from "../services/eventoService";
import {
  eventoCanonicalUrl,
  estadoInscricaoEvento,
  inscricoesDoEvento,
  mensagemElegibilidade,
  ocupacaoEvento,
} from "./eventosVitrineState";

const QR_CODE_PNG_SIZE = 512;

const nomeArquivoQrCode = (eventoId) =>
  `qrcode-evento-${String(eventoId).replace(/[^a-zA-Z0-9_-]/g, "-")}.png`;

const gerarQrCodePng = async (url) => {
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: QR_CODE_PNG_SIZE,
  });
  const resposta = await fetch(dataUrl);
  if (!resposta.ok) {
    throw new Error("Não foi possível gerar a imagem do QR Code.");
  }
  return resposta.blob();
};

const suportaCompartilhamentoQrCode = () => {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function" ||
    typeof File !== "function"
  ) {
    return false;
  }
  try {
    return navigator.canShare({
      files: [new File([""], "qrcode.png", { type: "image/png" })],
    });
  } catch {
    return false;
  }
};

function formatarData(value) {
  const data = ymd(value);
  if (!data) {
    return "Data a definir";
  }
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function periodoDasTurmas(turmas) {
  const datas = (turmas || [])
    .flatMap((turma) => [ymd(turma.data_inicio), ymd(turma.data_fim)])
    .filter(Boolean)
    .sort();
  if (!datas.length) {
    return "Datas a definir";
  }
  const inicio = formatarData(datas[0]);
  const fim = formatarData(datas.at(-1));
  return inicio === fim ? inicio : `${inicio} a ${fim}`;
}

function horasDasTurmas(turmas) {
  const valores = (turmas || [])
    .map((turma) => Number(turma.carga_horaria))
    .filter((valor) => Number.isFinite(valor) && valor > 0);
  if (!valores.length) {
    return "A definir";
  }
  const unicas = [...new Set(valores)];
  return unicas.length === 1
    ? `${unicas[0]}h`
    : `${Math.min(...unicas)}h a ${Math.max(...unicas)}h`;
}

function situacaoEvento(evento) {
  if (evento?.evento_encerrado) {
    return "Encerrado";
  }
  if (
    (evento?.turmas || []).some(
      (turma) => Number(turma.encontros_iniciados) > 0,
    )
  ) {
    return "Em andamento";
  }
  return "Programado";
}

function normalizarErro(error, fallback) {
  return error?.data?.message || error?.message || fallback;
}

export default function EventoDetalhe() {
  const { id } = useParams();
  const eventoId = Number(id);
  const [evento, setEvento] = useState(null);
  const [inscricoes, setInscricoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [inscrevendo, setInscrevendo] = useState(null);
  const [cancelamento, setCancelamento] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [preTeste, setPreTeste] = useState(null);
  const [baixandoPrograma, setBaixandoPrograma] = useState(false);

  const carregar = useCallback(async () => {
    if (!Number.isInteger(eventoId) || eventoId <= 0) {
      setErro("Evento inválido.");
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro("");
    try {
      const [eventoAtual, inscricoesAtuais] = await Promise.all([
        EventoService.publico.buscar(eventoId),
        EventoService.inscricao.minhas(),
      ]);
      setEvento(eventoAtual);
      setInscricoes(inscricoesAtuais || []);
    } catch (error) {
      if (!isAbortLike(error)) {
        setErro(normalizarErro(error, "Não foi possível carregar o evento."));
      }
    } finally {
      setCarregando(false);
    }
  }, [eventoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!evento?.titulo) {
      return undefined;
    }
    const tituloAnterior = document.title;
    document.title = `${evento.titulo} | Escola da Saúde`;
    return () => {
      document.title = tituloAnterior;
    };
  }, [evento?.titulo]);

  const minhasInscricoes = useMemo(
    () => inscricoesDoEvento(inscricoes, eventoId),
    [eventoId, inscricoes],
  );
  const turmaIdsInscritas = useMemo(
    () => minhasInscricoes.map((inscricao) => Number(inscricao.turma_id)),
    [minhasInscricoes],
  );
  const ocupacao = useMemo(() => ocupacaoEvento(evento || {}), [evento]);
  const urlCanonica = useMemo(
    () =>
      typeof window === "undefined"
        ? `/eventos/${eventoId}`
        : eventoCanonicalUrl(window.location.origin, eventoId),
    [eventoId],
  );
  const estadoInscricao = estadoInscricaoEvento(evento || {}, minhasInscricoes);

  const concluirInscricao = useCallback(
    async (turmaId, respostaPreTeste = null, propagarErro = false) => {
      if (inscrevendo) {
        return;
      }
      if (evento?.pode_se_inscrever === false) {
        notifyWarning(mensagemElegibilidade(evento));
        return;
      }

      setInscrevendo(turmaId);
      try {
        const conflito =
          await EventoService.inscricao.verificarConflitoTurma(turmaId);
        if (conflito?.conflito) {
          throw new Error(
            "Esta turma possui conflito de horário com outra inscrição.",
          );
        }
        await EventoService.inscricao.inscrever(turmaId, respostaPreTeste);
        notifySuccess("Inscrição realizada com sucesso.");
        await carregar();
      } catch (error) {
        const mensagem = normalizarErro(
          error,
          "Não foi possível realizar a inscrição.",
        );
        if (propagarErro) {
          throw new Error(mensagem);
        }
        notifyError(mensagem);
      } finally {
        setInscrevendo(null);
      }
    },
    [carregar, evento, inscrevendo],
  );

  const iniciarInscricao = useCallback(
    async (turmaId) => {
      if (!evento?.tem_pre_teste) {
        await concluirInscricao(turmaId);
        return;
      }
      if (inscrevendo) {
        return;
      }
      setInscrevendo(turmaId);
      try {
        const dados =
          await EventoService.preTeste.participante.carregar(eventoId);
        if (!dados?.tem_pre_teste || dados?.ja_concluido) {
          setInscrevendo(null);
          await concluirInscricao(turmaId);
          return;
        }
        setPreTeste({ turmaId: Number(turmaId), dados });
      } catch (error) {
        notifyError(
          normalizarErro(error, "Não foi possível carregar o pré-teste."),
        );
      } finally {
        setInscrevendo(null);
      }
    },
    [concluirInscricao, evento?.tem_pre_teste, eventoId, inscrevendo],
  );

  const enviarPreTeste = useCallback(
    async (payload) => {
      await concluirInscricao(preTeste?.turmaId, payload, true);
      setPreTeste(null);
    },
    [concluirInscricao, preTeste?.turmaId],
  );

  const confirmarCancelamento = useCallback(async () => {
    if (!cancelamento?.inscricao_id) {
      return;
    }
    setCancelando(true);
    try {
      await EventoService.inscricao.cancelar(cancelamento.inscricao_id);
      notifySuccess("Inscrição cancelada com sucesso.");
      setCancelamento(null);
      await carregar();
    } catch (error) {
      notifyError(
        normalizarErro(error, "Não foi possível cancelar a inscrição."),
      );
      throw error;
    } finally {
      setCancelando(false);
    }
  }, [cancelamento?.inscricao_id, carregar]);

  const copiarLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(urlCanonica);
      notifySuccess("Link do evento copiado.");
    } catch {
      notifyError("Não foi possível copiar o link automaticamente.");
    }
  }, [urlCanonica]);

  const compartilhar = useCallback(async () => {
    if (typeof navigator.share !== "function") {
      await copiarLink();
      return;
    }
    try {
      await navigator.share({
        title: evento?.titulo || "Evento da Escola da Saúde",
        text: "Confira este evento da Escola da Saúde.",
        url: urlCanonica,
      });
    } catch (error) {
      if (error?.name !== "AbortError") {
        await copiarLink();
      }
    }
  }, [copiarLink, evento?.titulo, urlCanonica]);

  const compartilharOuBaixarQrCode = useCallback(async () => {
    try {
      const blob = await gerarQrCodePng(urlCanonica);
      const filename = nomeArquivoQrCode(eventoId);
      const podeCompartilhar = suportaCompartilhamentoQrCode();

      if (podeCompartilhar) {
        const file = new File([blob], filename, { type: "image/png" });
        try {
          await navigator.share({
            files: [file],
            title: evento?.titulo || "QR Code do evento",
            text: urlCanonica,
          });
          notifySuccess("QR Code compartilhado.");
        } catch (error) {
          if (error?.name !== "AbortError") {
            const href = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = href;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(href);
            notifySuccess("QR Code baixado.");
          }
        }
        return;
      }

      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(href);
      notifySuccess("QR Code baixado.");
    } catch (error) {
      notifyError(
        normalizarErro(error, "Não foi possível gerar o QR Code."),
      );
    }
  }, [evento?.titulo, eventoId, urlCanonica]);

  const qrCodeAcaoLabel = suportaCompartilhamentoQrCode()
    ? "Compartilhar QR Code"
    : "Baixar QR Code";

  const baixarProgramacao = useCallback(async () => {
    setBaixandoPrograma(true);
    try {
      const { blob, filename } =
        await EventoService.publico.baixarProgramacao(eventoId);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      notifyError(
        normalizarErro(error, "Não foi possível baixar a programação."),
      );
    } finally {
      setBaixandoPrograma(false);
    }
  }, [eventoId]);

  if (carregando) {
    return (
      <div className="grid min-h-[70vh] place-items-center bg-gelo dark:bg-zinc-900">
        <div className="flex items-center gap-3 font-bold text-slate-700 dark:text-slate-200">
          <RefreshCw className="h-5 w-5 animate-spin" /> Carregando evento...
        </div>
      </div>
    );
  }

  if (erro || !evento) {
    return (
      <div className="min-h-screen bg-gelo px-4 py-12 dark:bg-zinc-900">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-lg dark:border-rose-900 dark:bg-slate-950">
          <XCircle className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">
            Evento indisponível
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{erro}</p>
          <Link
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white"
            to="/evento"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar aos eventos
          </Link>
        </div>
      </div>
    );
  }

  const capa = getEventoFolderUrl(evento);
  const turmas = Array.isArray(evento.turmas) ? evento.turmas : [];
  const organizadores = (evento.organizadores || [])
    .map((organizador) => organizador.nome)
    .filter(Boolean)
    .join(", ");
  const bloqueio = mensagemElegibilidade(evento);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gelo dark:bg-zinc-900">
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-8">
        <Link
          to="/evento"
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-bold text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Eventos
        </Link>

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-800 text-white shadow-2xl">
          <div className="grid items-start lg:grid-cols-[1.15fr_.85fr]">
            <div className="flex min-w-0 flex-col justify-center p-6 sm:p-9 lg:p-12">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black">
                  {evento.tipo || "Evento"}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black">
                  {situacaoEvento(evento)}
                </span>
                {ocupacao.esgotadas && (
                  <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-black">
                    Vagas esgotadas
                  </span>
                )}
              </div>
              <h1 className="mt-4 min-w-0 max-w-full break-words text-[clamp(1.875rem,2.5vw_+_1.25rem,3rem)] font-black leading-[1.08]">
                {evento.titulo}
              </h1>
              {/*
                {evento.descricao ||
                  "Informações completas deste evento e de suas turmas."}
              */}
              <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                <span className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                  {periodoDasTurmas(turmas)}
                </span>
                <span className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  {evento.local || "Local a definir"}
                </span>
              </div>
            </div>
            <div className="relative aspect-[4/3] min-h-64 bg-emerald-900/50 lg:min-h-0">
              {capa ? (
                <img
                  src={capa}
                  alt={`Capa do evento ${evento.titulo}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center">
                  <CalendarDays className="h-20 w-20 text-white/60" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent" />
            </div>
          </div>
        </section>

        {minhasInscricoes.length > 0 && (
          <section className="relative z-10 mx-2 -mt-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-xl dark:border-sky-900 dark:bg-sky-950 sm:mx-6 sm:p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-sky-700" />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black text-sky-950 dark:text-sky-100">
                  Você está inscrito
                </h2>
                <div className="mt-3 grid gap-3">
                  {minhasInscricoes.map((inscricao) => (
                    <div
                      key={inscricao.inscricao_id}
                      className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-black text-slate-950 dark:text-white">
                          {inscricao.turma_nome || "Turma"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {formatarData(inscricao.data_inicio)} ·{" "}
                          {hhmm(inscricao.horario_inicio, "Horário a definir")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCancelamento(inscricao)}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-300 px-4 text-sm font-black text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200"
                      >
                        <XCircle className="h-4 w-4" /> Cancelar inscrição
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-7">
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                Sobre o evento
              </h2>
              {evento.descricao && (
                <p className="mt-4 whitespace-pre-wrap break-words text-base leading-7 text-slate-600 dark:text-slate-300">
                  {evento.descricao}
                </p>
              )}
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <Info
                  icon={Users}
                  label="Público-alvo"
                  value={
                    evento.publico_alvo_label ||
                    evento.publico_alvo ||
                    "Público geral"
                  }
                />
                <Info
                  icon={UserRoundCheck}
                  label="Organização"
                  value={organizadores || "Escola da Saúde"}
                />
                <Info
                  icon={Clock3}
                  label="Carga horária"
                  value={horasDasTurmas(turmas)}
                />
                <Info
                  icon={MapPin}
                  label="Local"
                  value={evento.local || "A definir"}
                />
              </dl>

              {evento.conteudo_programatico && (
                <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
                  <h3 className="flex items-center gap-2 font-black text-slate-950 dark:text-white">
                    <FileText className="h-5 w-5" /> Conteúdo programático
                  </h3>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 dark:text-slate-300">
                    {evento.conteudo_programatico}
                  </p>
                </div>
              )}

              {evento.tem_programacao && (
                <button
                  type="button"
                  onClick={baixarProgramacao}
                  disabled={baixandoPrograma}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-black text-indigo-800 disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />{" "}
                  {baixandoPrograma ? "Baixando..." : "Baixar programação"}
                </button>
              )}
            </section>

            {estadoInscricao !== "disponivel" &&
              estadoInscricao !== "inscrito" && (
                <section className="flex items-start gap-3 rounded-3xl border border-violet-200 bg-violet-50 p-5 text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
                  <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0" />
                  <div>
                    <h2 className="font-black">
                      {estadoInscricao === "lotado"
                        ? "Vagas esgotadas"
                        : "Inscrição indisponível"}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed">
                      {bloqueio ||
                        (estadoInscricao === "lotado"
                          ? "Todas as vagas das turmas disponíveis já foram ocupadas."
                          : "O período de inscrição deste evento terminou.")}
                    </p>
                  </div>
                </section>
              )}

            <section aria-labelledby="turmas-title">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-widest text-emerald-700">
                    Escolha sua turma
                  </p>
                  <h2
                    id="turmas-title"
                    className="mt-1 text-3xl font-black text-slate-950 dark:text-white"
                  >
                    Turmas e vagas
                  </h2>
                </div>
                <p className="text-sm font-bold text-slate-500">
                  {ocupacao.vagasPreenchidas} de {ocupacao.vagasTotal} vagas
                  ocupadas
                </p>
              </div>
              <ListaTurmasEvento
                turmas={turmas}
                eventoId={evento.id}
                eventoTipo={evento.tipo}
                inscricaoConfirmadas={turmaIdsInscritas}
                inscrever={iniciarInscricao}
                inscrevendo={inscrevendo}
                jaInscritoNoEvento={minhasInscricoes.length > 0}
                jaorganizadorDoEvento={Boolean(evento.ja_organizador)}
                exibirRealizadosTotal
                podeSeInscreverNoEvento={evento.pode_se_inscrever !== false}
                motivoBloqueioEvento={bloqueio}
              />
            </section>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-lg dark:border-slate-800 dark:bg-slate-950 sm:p-6">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                <QrCode className="h-4 w-4" /> QR Code do evento
              </div>
              <div className="mx-auto mt-5 w-full max-w-[240px] rounded-3xl border border-slate-200 bg-white p-4 shadow-inner">
                <QRCodeSVG
                  value={urlCanonica}
                  size={220}
                  level="M"
                  className="h-auto w-full"
                  title={`QR Code para ${evento.titulo}`}
                />
              </div>
              <p className="mt-4 break-all text-xs leading-relaxed text-slate-500">
                {urlCanonica}
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={compartilhar}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 font-black text-white hover:bg-emerald-800"
                >
                  <Share2 className="h-4 w-4" /> Compartilhar
                </button>
                <button
                  type="button"
                  onClick={copiarLink}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-300 px-4 font-black text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-white"
                >
                  <Clipboard className="h-4 w-4" /> Copiar link
                </button>
                <button
                  type="button"
                  onClick={compartilharOuBaixarQrCode}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-200 px-4 font-black text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                >
                  <Download className="h-4 w-4" /> {qrCodeAcaoLabel}
                </button>
              </div>
              <a
                href={urlCanonica}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Link permanente e
                compartilhável
              </a>
            </section>
          </aside>
        </div>
      </main>

      <Footer />

      <ModalPreTesteInscricao
        open={Boolean(preTeste)}
        preTeste={preTeste?.dados}
        eventoTitulo={evento.titulo}
        enviando={Boolean(inscrevendo)}
        onClose={() => setPreTeste(null)}
        onSubmit={enviarPreTeste}
      />
      <ModalConfirmacao
        open={Boolean(cancelamento)}
        titulo="Cancelar inscrição?"
        mensagem={`Tem certeza que deseja cancelar sua inscrição na turma “${cancelamento?.turma_nome || "selecionada"}”?`}
        textoConfirmar="Sim, cancelar"
        textoCancelar="Manter inscrição"
        variant="danger"
        loading={cancelando}
        onClose={() => setCancelamento(null)}
        onConfirm={confirmarCancelamento}
      />
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm dark:bg-slate-800">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
          {label}
        </dt>
        <dd className="mt-1 break-words text-sm font-bold text-slate-900 dark:text-white">
          {value}
        </dd>
      </div>
    </div>
  );
}

Info.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};
