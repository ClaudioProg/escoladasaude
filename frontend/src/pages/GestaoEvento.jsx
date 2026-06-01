// ✅ frontend/src/pages/GestaoEvento.jsx — v2.0
// Central institucional de gestão de evento.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Edit3,
  FileBadge,
  IdCard,
  Loader2,
  QrCode,
  ShieldCheck,
  Star,
  UserMinus,
  Users,
} from "lucide-react";

import HeaderHero from "../components/layout/HeaderHero";
import Footer from "../components/layout/Footer";
import EventoService, {
  deduzStatusEvento,
  getEventoFolderUrl,
} from "../services/eventoService";
import { notifyApiError } from "../components/ui/AppToast";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function ymd(value) {
  return String(value || "").slice(0, 10);
}

function formatarDataBR(value) {
  const data = ymd(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "—";

  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function getPeriodo(evento) {
  const inicio = evento?.data_inicio_geral || evento?.data_inicio;
  const fim = evento?.data_fim_geral || evento?.data_fim || inicio;

  if (!inicio) return "Período não informado";
  if (!fim || ymd(inicio) === ymd(fim)) return formatarDataBR(inicio);

  return `${formatarDataBR(inicio)} a ${formatarDataBR(fim)}`;
}

function statusLabel(status) {
  if (status === "andamento") return "Em andamento";
  if (status === "encerrado") return "Encerrado";
  if (status === "sem_datas") return "Sem datas completas";
  return "Programado";
}

function ActionCard({ icon: Icon, title, description, badge, onClick, tone = "emerald" }) {
  const tones = {
    emerald: "from-emerald-700 via-teal-700 to-cyan-700",
    rose: "from-rose-700 via-pink-700 to-orange-600",
    amber: "from-amber-600 via-orange-600 to-rose-600",
    sky: "from-sky-700 via-cyan-700 to-teal-700",
    violet: "from-violet-700 via-indigo-700 to-sky-700",
    slate: "from-slate-900 via-slate-800 to-emerald-900",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-[2rem] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-zinc-900"
    >
      <div className={classNames("h-2 bg-gradient-to-r", tones[tone] || tones.emerald)} />

      <div className="p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-slate-100 text-slate-900 transition group-hover:scale-105 dark:bg-white/10 dark:text-white">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                {title}
              </h2>

              {badge ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {badge}
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
              {description}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>

        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            {label}
          </p>
          <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GestaoEvento() {
  const { eventoId } = useParams();
  const navigate = useNavigate();

  const [evento, setEvento] = useState(null);
  const [loading, setLoading] = useState(true);

  const id = Number(eventoId);
  const folderUrl = useMemo(() => getEventoFolderUrl(evento), [evento]);
  const status = useMemo(() => deduzStatusEvento(evento), [evento]);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        setLoading(true);

        const data = await EventoService.admin.buscarCompleto(id);

        if (ativo) {
          setEvento(data);
        }
      } catch (error) {
        notifyApiError(error, {
          titulo: "Não foi possível carregar o evento.",
          acao: "Volte ao dashboard e tente acessar novamente.",
        });
      } finally {
        if (ativo) setLoading(false);
      }
    }

    if (id) carregar();

    return () => {
      ativo = false;
    };
  }, [id]);

  const ir = (path) => navigate(path);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col">
        <HeaderHero
          title="Gestão do Evento"
          subtitle="Carregando informações administrativas do evento."
          badge="Administrador • Evento"
          icon={ShieldCheck}
          gradient="from-emerald-900 via-teal-800 to-cyan-700"
        />

        <main className="grid flex-1 place-items-center p-6">
          <div className="inline-flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando central do evento...
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  if (!evento) {
    return (
      <div className="flex min-h-dvh flex-col">
        <HeaderHero
          title="Evento não encontrado"
          subtitle="Não foi possível localizar os dados deste evento."
          badge="Administrador • Evento"
          icon={ShieldCheck}
          gradient="from-rose-900 via-pink-800 to-orange-700"
        />

        <main className="mx-auto w-full max-w-5xl flex-1 p-4">
          <button
            type="button"
            onClick={() => navigate("/administrador")}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-black text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao dashboard
          </button>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <HeaderHero
        title="Gestão do Evento"
        subtitle="Central administrativa para editar, acompanhar inscrições, presenças, QR Codes, avaliações e certificados."
        badge="Administrador • Central do Evento"
        icon={ShieldCheck}
        gradient="from-emerald-900 via-teal-800 to-cyan-700"
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <button
          type="button"
          onClick={() => navigate("/administrador")}
          className="mb-5 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao dashboard
        </button>

        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="bg-slate-100 dark:bg-zinc-950">
              {folderUrl ? (
                <img
                  src={folderUrl}
                  alt={`Folder do evento ${evento.titulo}`}
                  className="h-full min-h-[260px] w-full object-cover"
                />
              ) : (
                <div className="grid min-h-[260px] place-items-center p-6 text-center text-slate-500">
                  <CalendarDays className="mx-auto h-10 w-10" />
                  <p className="mt-2 text-sm font-bold">Evento sem folder</p>
                </div>
              )}
            </div>

            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {statusLabel(status)}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-zinc-200">
                  ID {evento.id}
                </span>
              </div>

              <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                {evento.titulo}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                {evento.descricao || "Evento cadastrado na Plataforma da Escola da Saúde."}
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard icon={CalendarDays} label="Período" value={getPeriodo(evento)} />
                <StatCard icon={Users} label="Turmas" value={evento?.turmas?.length || 0} />
                <StatCard icon={BadgeCheck} label="Publicação" value={evento?.publicado ? "Publicado" : "Rascunho"} />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Ações administrativas
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                O que deseja gerenciar neste evento?
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                Cada opção abre a página oficial do módulo já filtrada para este evento.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ActionCard
              icon={Edit3}
              title="Editar evento"
              badge="Cadastro"
              tone="slate"
              description="Atualize dados gerais, folder, programação, turmas e configuração institucional do evento."
              onClick={() => ir(`/gestao/evento?editar=${id}`)}
            />

            <ActionCard
              icon={UserMinus}
              title="Cancelar inscrições"
              badge="Inscritos"
              tone="rose"
              description="Localize participantes inscritos neste evento e realize cancelamentos administrativos quando necessário."
              onClick={() => ir(`/gestao/cancelamento-inscricao?evento_id=${id}`)}
            />

            <ActionCard
              icon={QrCode}
              title="QR Codes"
              badge="Presença"
              tone="sky"
              description="Visualize, gere e imprima os QR Codes oficiais das turmas vinculadas ao evento."
              onClick={() => ir(`/gestao/qrcode?evento_id=${id}`)}
            />

            <ActionCard
              icon={ClipboardCheck}
              title="Confirmar presença"
              badge="Chamada"
              tone="amber"
              description="Confirme presença de participantes e acompanhe registros por turma e data."
              onClick={() => ir(`/gestao/presenca?evento_id=${id}`)}
            />

            <ActionCard
              icon={Star}
              title="Avaliações"
              badge="Feedback"
              tone="violet"
              description="Consulte as avaliações realizadas pelos participantes deste evento."
              onClick={() => ir(`/gestao/avaliacao?evento_id=${id}`)}
            />

            <ActionCard
              icon={FileBadge}
              title="Certificados"
              badge="Numeração"
              tone="emerald"
              description="Verifique quem emitiu certificado, códigos, numeração e situação de emissão."
              onClick={() => ir(`/gestao/certificado?evento_id=${id}`)}
            />
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100">
          <div className="flex items-start gap-3">
            <IdCard className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">Fluxo institucional recomendado</p>
              <p className="mt-1 text-sm leading-relaxed">
                Use esta central como ponto único de gestão do evento. A página de criação permanece em “Gerenciar eventos”, enquanto as ações operacionais passam a ser acessadas a partir do evento selecionado.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}