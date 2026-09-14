import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import NadaEncontrado from "../components/ui/NadaEncontrado";
import EventoService, {
  deduzStatusEvento,
  getEventoFolderUrl,
  isAbortLike,
  normalizeTitleSort,
  sortEventosPublicos,
  ymd,
} from "../services/eventoService";
import {
  eventoPath,
  filtrarEventosVitrine,
  ocupacaoEvento,
} from "./eventosVitrineState";

const STATUS = {
  programado: {
    label: "Programado",
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  andamento: {
    label: "Em andamento",
    classes: "border-amber-200 bg-amber-50 text-amber-800",
  },
  sem_datas: {
    label: "Datas a definir",
    classes: "border-slate-200 bg-slate-50 text-slate-700",
  },
};

function formatarData(value) {
  const data = ymd(value);
  if (!data) {
    return "";
  }
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function periodoEvento(evento) {
  const inicio = formatarData(evento?.data_inicio_geral);
  const fim = formatarData(evento?.data_fim_geral);
  if (inicio && fim && inicio !== fim) {
    return `${inicio} a ${fim}`;
  }
  return inicio || fim || "Datas a definir";
}

function correspondeBusca(evento, busca) {
  const termo = normalizeTitleSort(busca);
  if (!termo) {
    return true;
  }
  return [
    evento?.titulo,
    evento?.tipo,
    evento?.local,
    evento?.publico_alvo_label,
  ]
    .map(normalizeTitleSort)
    .join(" ")
    .includes(termo);
}

function EventoCard({ evento }) {
  const ocupacao = ocupacaoEvento(evento);
  const status = STATUS[deduzStatusEvento(evento)] || STATUS.programado;
  const publico =
    evento.publico_alvo_label || evento.publico_alvo || "Público geral";
  const capa = getEventoFolderUrl(evento);

  return (
    <article className="group flex h-full min-h-[540px] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-[0_18px_50px_-36px_rgba(15,23,42,.55)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-34px_rgba(15,23,42,.65)] dark:border-slate-800 dark:bg-slate-950">
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-emerald-950 via-teal-800 to-cyan-700">
        {capa ? (
          <img
            src={capa}
            alt={`Capa do evento ${evento.titulo}`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center px-8 text-center text-white/90">
            <CalendarDays className="h-12 w-12" aria-hidden="true" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/70 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${status.classes}`}
          >
            {status.label}
          </span>
          {ocupacao.esgotadas && (
            <span className="rounded-full border border-rose-200 bg-rose-600 px-2.5 py-1 text-[11px] font-black text-white">
              Vagas esgotadas
            </span>
          )}
          {evento.ja_inscrito && (
            <span className="rounded-full border border-sky-200 bg-sky-600 px-2.5 py-1 text-[11px] font-black text-white">
              Você está inscrito
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-extrabold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200">
            {evento.tipo || "Evento"}
          </span>
          {evento.restrito && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-extrabold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Restrito
            </span>
          )}
        </div>

        <h2 className="mt-3 line-clamp-2 min-h-[3.5rem] break-words text-xl font-black leading-7 text-slate-950 dark:text-white">
          {evento.titulo}
        </h2>

        <dl className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
          <div className="flex min-w-0 items-start gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <dd className="line-clamp-1">{periodoEvento(evento)}</dd>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <dd className="line-clamp-1">
              {evento.local || "Local a definir"}
            </dd>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            <dd className="line-clamp-2 min-h-10">{publico}</dd>
          </div>
        </dl>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-end justify-between gap-3 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {ocupacao.vagasPreenchidas} de {ocupacao.vagasTotal} vagas
              ocupadas
            </span>
            <span className="text-lg font-black text-slate-950 dark:text-white">
              {ocupacao.percentual}%
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ocupacao.percentual}
          >
            <div
              className={`h-full rounded-full ${
                ocupacao.esgotadas
                  ? "bg-rose-600"
                  : "bg-gradient-to-r from-emerald-600 to-cyan-600"
              }`}
              style={{ width: `${ocupacao.percentual}%` }}
            />
          </div>
        </div>

        <Link
          to={eventoPath(evento.id)}
          className="mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 px-5 py-3 font-black text-white shadow-lg shadow-emerald-950/10 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          Abrir <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

EventoCard.propTypes = {
  evento: PropTypes.object.isRequired,
};

export default function Eventos() {
  const [eventos, setEventos] = useState([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const lista = await EventoService.publico.listarParaMim();
      const eventosVisiveis = filtrarEventosVitrine(lista || []);
      setEventos(eventosVisiveis.sort(sortEventosPublicos));
    } catch (error) {
      if (!isAbortLike(error)) {
        setErro(error?.message || "Não foi possível carregar os eventos.");
      }
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(
    () => eventos.filter((evento) => correspondeBusca(evento, busca)),
    [busca, eventos],
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-gelo dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
        <HeaderHero
          titulo="Eventos para você"
          subtitulo="Descubra formações atuais, consulte vagas e abra a página completa antes de se inscrever."
          icone={CalendarDays}
          tamanho="lg"
          raio="xl"
        />
      </div>

      <main id="conteudo" className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <section className="mb-6 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-black text-slate-950 dark:text-white">
              Cursos e eventos com inscrição atual
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {filtrados.length} evento(s) encontrado(s)
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block min-w-0 sm:w-72">
              <span className="sr-only">Buscar eventos</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por nome, local ou público"
                className="min-h-11 w-full rounded-2xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <RefreshCw
                className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`}
              />
              Atualizar
            </button>
          </div>
        </section>

        {carregando ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} height={540} borderRadius={28} />
            ))}
          </div>
        ) : erro ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center font-bold text-rose-800">
            {erro}
          </div>
        ) : filtrados.length ? (
          <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filtrados.map((evento) => (
              <EventoCard key={evento.id} evento={evento} />
            ))}
          </div>
        ) : (
          <NadaEncontrado
            mensagem="Nenhum evento atual encontrado."
            sugestao="Tente outro termo ou volte em breve para novas turmas."
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
