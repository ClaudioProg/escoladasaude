/**
 * ✅ frontend/src/pages/PendenciasAdmin.jsx — v2.1
 * Atualizado em: 02/06/2026
 * Plataforma Escola da Saúde
 *
 * Página administrativa do Painel de Pendências.
 *
 * Responsabilidades:
 * - Exibir resumo consolidado das pendências administrativas.
 * - Listar pendências derivadas da view v_pendencias_administrativas.
 * - Filtrar por módulo, tipo, severidade, prioridade, status, entidade, usuário e período.
 * - Exibir detalhes técnicos controlados da pendência.
 * - Apoiar diagnóstico administrativo, Saúde da Plataforma e priorização operacional.
 *
 * Revisão premium v2.1:
 * - usa HeaderHero global oficial limpo;
 * - adiciona Footer oficial;
 * - remove hero local como cabeçalho principal;
 * - mantém resumo, gráficos e diagnóstico fora do HeaderHero;
 * - evita recarregamento automático a cada digitação nos filtros;
 * - filtros só são aplicados ao clicar em "Aplicar filtros";
 * - paginação executa nova busca de forma controlada;
 * - adiciona controle contra respostas antigas sobrescreverem dados recentes;
 * - fortalece extração de envelopes ok/data/meta;
 * - melhora responsividade, leitura mobile e estados de carregamento;
 * - mantém contrato oficial api.pendencia.*;
 * - sem aliases, sem montagem direta de /api e sem legado.
 *
 * Contratos aplicados:
 * - Service oficial: api.pendencia.*
 * - Backend oficial: /api/pendencia
 * - View oficial: v_pendencias_administrativas
 * - Status derivado inicial:
 *   - pendente
 * - Severidades oficiais:
 *   - info
 *   - aviso
 *   - erro
 *   - critico
 * - Prioridades oficiais:
 *   - baixa
 *   - normal
 *   - alta
 *   - urgente
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Filter,
  Info,
  Layers,
  ListChecks,
  Loader2,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

import api from "../services/api";
import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import Botao from "../components/ui/Botao";
import Modal from "../components/ui/Modal";
import CarregandoSkeleton from "../components/ui/CarregandoSkeleton";
import ErroCarregamento from "../components/ui/ErroCarregamento";
import NadaEncontrado from "../components/ui/NadaEncontrado";
import {
  notifyError,
  notifySuccess,
  notifyWarning,
} from "../components/ui/AppToast";

/* ─────────────────────────────────────────────
 * Contratos oficiais da tela
 * ───────────────────────────────────────────── */

const SEVERIDADES = [
  { value: "", label: "Todas" },
  { value: "info", label: "Info" },
  { value: "aviso", label: "Aviso" },
  { value: "erro", label: "Erro" },
  { value: "critico", label: "Crítico" },
];

const PRIORIDADES = [
  { value: "", label: "Todas" },
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

const STATUS = [
  { value: "", label: "Todos" },
  { value: "pendente", label: "Pendente" },
];

const SEVERIDADES_OFICIAIS = SEVERIDADES.map((item) => item.value).filter(Boolean);
const PRIORIDADES_OFICIAIS = PRIORIDADES.map((item) => item.value).filter(Boolean);
const STATUS_OFICIAIS = STATUS.map((item) => item.value).filter(Boolean);

const LIMITES = [25, 50, 100, 200];

const FILTROS_INICIAIS = {
  modulo: "",
  tipo: "",
  severidade: "",
  prioridade: "",
  status: "",
  entidade: "",
  entidade_id: "",
  origem: "",
  usuario_id: "",
  busca: "",
  data_inicio: "",
  data_fim: "",
  pagina: 1,
  limite: 50,
};

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validarFacade(nome, fn) {
  if (typeof fn !== "function") {
    throw new Error(`Facade ausente no api.js: ${nome}.`);
  }
}

function extrairData(response) {
  const base = response?.data ?? response ?? null;

  if (isObject(base) && Object.prototype.hasOwnProperty.call(base, "data")) {
    return base.data;
  }

  return base;
}

function extrairMeta(response) {
  const base = response?.data ?? response ?? {};

  return response?.meta || base?.meta || {};
}

function obterMensagemErro(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.erro ||
    error?.data?.message ||
    error?.data?.erro ||
    error?.message ||
    fallback
  );
}

function montarParams(filtros) {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, valor]) => {
      return valor !== "" && valor !== null && valor !== undefined;
    })
  );
}

function montarParamsResumo(filtros) {
  return Object.fromEntries(
    Object.entries(filtros).filter(([chave, valor]) => {
      return (
        !["pagina", "limite"].includes(chave) &&
        valor !== "" &&
        valor !== null &&
        valor !== undefined
      );
    })
  );
}

function isYMD(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function toPositiveIntOrEmpty(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  const number = Number(text);

  return Number.isInteger(number) && number > 0 ? String(number) : "";
}

function formatarNumero(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) return "0";

  return new Intl.NumberFormat("pt-BR").format(numero);
}

function formatarDataHora(valor) {
  if (!valor) return "—";

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(data);
}

function formatarDataBR(valor) {
  const texto = String(valor || "").trim();

  if (!texto) return "—";

  const ymd = texto.slice(0, 10);

  if (!isYMD(ymd)) return texto;

  const [ano, mes, dia] = ymd.split("-");
  return `${dia}/${mes}/${ano}`;
}

function copiarTexto(texto, mensagem = "Conteúdo copiado.") {
  if (!texto) {
    notifyWarning("Não há conteúdo disponível para copiar.");
    return;
  }

  if (!navigator?.clipboard?.writeText) {
    notifyWarning("Cópia automática indisponível neste navegador.");
    return;
  }

  navigator.clipboard
    .writeText(String(texto))
    .then(() => notifySuccess(mensagem))
    .catch(() =>
      notifyError(
        "Não foi possível copiar automaticamente. Selecione o conteúdo manualmente."
      )
    );
}

function normalizarResumo(resumo) {
  const geral = resumo?.geral || {};

  return {
    total_pendencias: Number(geral.total_pendencias || 0),
    info: Number(geral.info || 0),
    aviso: Number(geral.aviso || 0),
    erro: Number(geral.erro || 0),
    critico: Number(geral.critico || 0),
    baixa: Number(geral.baixa || 0),
    normal: Number(geral.normal || 0),
    alta: Number(geral.alta || 0),
    urgente: Number(geral.urgente || 0),
    primeira_pendencia: geral.primeira_pendencia || null,
    ultima_atualizacao: geral.ultima_atualizacao || null,
    por_modulo: Array.isArray(resumo?.por_modulo) ? resumo.por_modulo : [],
    por_tipo: Array.isArray(resumo?.por_tipo) ? resumo.por_tipo : [],
    por_prioridade: Array.isArray(resumo?.por_prioridade)
      ? resumo.por_prioridade
      : [],
  };
}

function normalizarPendencia(pendencia) {
  return {
    pendencia_id: pendencia?.pendencia_id || pendencia?.id || "",
    modulo: pendencia?.modulo || "—",
    tipo: pendencia?.tipo || "—",
    titulo: pendencia?.titulo || "Pendência sem título",
    descricao: pendencia?.descricao || "Sem descrição registrada.",
    severidade: pendencia?.severidade || "info",
    prioridade: pendencia?.prioridade || "normal",
    status: pendencia?.status || "pendente",
    entidade: pendencia?.entidade || "",
    entidade_id: pendencia?.entidade_id || "",
    origem: pendencia?.origem || "",
    usuario_id: pendencia?.usuario_id || "",
    criado_em: pendencia?.criado_em || null,
    atualizado_em: pendencia?.atualizado_em || null,
    detalhes: pendencia?.detalhes ?? null,
    ...pendencia,
  };
}

function severidadeLabel(severidade) {
  const mapa = {
    info: "Info",
    aviso: "Aviso",
    erro: "Erro",
    critico: "Crítico",
  };

  return mapa[severidade] || severidade || "Info";
}

function prioridadeLabel(prioridade) {
  const mapa = {
    baixa: "Baixa",
    normal: "Normal",
    alta: "Alta",
    urgente: "Urgente",
  };

  return mapa[prioridade] || prioridade || "Normal";
}

function statusLabel(status) {
  const mapa = {
    pendente: "Pendente",
  };

  return mapa[status] || status || "Pendente";
}

function severidadeClasses(severidade) {
  const mapa = {
    info:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    aviso:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    erro:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
    critico:
      "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  };

  return mapa[severidade] || mapa.info;
}

function prioridadeClasses(prioridade) {
  const mapa = {
    baixa:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200",
    normal:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    alta:
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    urgente:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
  };

  return mapa[prioridade] || mapa.normal;
}

/* ─────────────────────────────────────────────
 * Componentes locais
 * ───────────────────────────────────────────── */

function BadgeSeveridade({ severidade }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black",
        severidadeClasses(severidade)
      )}
    >
      {severidadeLabel(severidade)}
    </span>
  );
}

function BadgePrioridade({ prioridade }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black",
        prioridadeClasses(prioridade)
      )}
    >
      {prioridadeLabel(prioridade)}
    </span>
  );
}

function BadgeStatus({ status }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
      {statusLabel(status)}
    </span>
  );
}

function BadgeTecnico({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
      {children}
    </span>
  );
}

function CardResumo({ icone: Icone, titulo, valor, detalhe, destaque }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {titulo}
          </p>

          <p
            className={cx(
              "mt-2 text-3xl font-black tracking-tight",
              destaque || "text-slate-950 dark:text-white"
            )}
          >
            {formatarNumero(valor)}
          </p>

          {detalhe ? (
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {detalhe}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <Icone className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

function JsonPreview({ titulo, valor }) {
  const conteudo = useMemo(() => {
    if (valor === null || valor === undefined) return "";

    try {
      return JSON.stringify(valor, null, 2);
    } catch {
      return String(valor);
    }
  }, [valor]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-slate-950 dark:text-white">
          {titulo}
        </h4>

        <button
          type="button"
          onClick={() => copiarTexto(conteudo, `${titulo} copiado.`)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Copiar
        </button>
      </div>

      {conteudo ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-relaxed text-slate-800 dark:bg-slate-950 dark:text-slate-100">
          {conteudo}
        </pre>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sem detalhes registrados.
        </p>
      )}
    </div>
  );
}

function PainelResumoOperacional({ resumo }) {
  const temPendencias = Number(resumo.total_pendencias || 0) > 0;

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85 dark:shadow-black/20 dark:ring-zinc-800 sm:p-6">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-red-100 blur-3xl dark:bg-red-950/40" />
      <div className="absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-blue-100 blur-3xl dark:bg-blue-950/40" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div
            className={cx(
              "mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide",
              temPendencias
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            )}
          >
            {temPendencias ? (
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {temPendencias ? "Pendências ativas" : "Sem pendências ativas"}
          </div>

          <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Diagnóstico administrativo operacional
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Este painel consolida pendências derivadas dos módulos da plataforma.
            A correção deve ser feita na entidade de origem; quando a condição
            deixar de existir, a pendência desaparece automaticamente da view.
          </p>

          <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:grid-cols-2">
            <p>
              Primeira pendência:{" "}
              <strong>{formatarDataHora(resumo.primeira_pendencia)}</strong>
            </p>

            <p>
              Última atualização:{" "}
              <strong>{formatarDataHora(resumo.ultima_atualizacao)}</strong>
            </p>
          </div>
        </div>

        <div className="grid min-w-full grid-cols-2 gap-3 sm:min-w-[360px]">
          <MiniResumo
            label="Baixa"
            value={resumo.baixa}
            className="bg-slate-50 text-slate-900 ring-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800"
          />
          <MiniResumo
            label="Normal"
            value={resumo.normal}
            className="bg-blue-50 text-blue-900 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-100 dark:ring-blue-800/60"
          />
          <MiniResumo
            label="Alta"
            value={resumo.alta}
            className="bg-orange-50 text-orange-900 ring-orange-100 dark:bg-orange-950/30 dark:text-orange-100 dark:ring-orange-800/60"
          />
          <MiniResumo
            label="Urgente"
            value={resumo.urgente}
            className="bg-red-50 text-red-900 ring-red-100 dark:bg-red-950/30 dark:text-red-100 dark:ring-red-800/60"
          />
        </div>
      </div>
    </section>
  );
}

function MiniResumo({ label, value, className }) {
  return (
    <div className={cx("rounded-2xl p-3 text-center ring-1", className)}>
      <p className="text-[11px] font-black uppercase tracking-wide opacity-70">
        {label}
      </p>

      <p className="mt-1 text-2xl font-black">{formatarNumero(value)}</p>
    </div>
  );
}

function PendenciasPorModulo({ resumo }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        <h2 className="text-base font-black text-slate-950 dark:text-white">
          Pendências por módulo
        </h2>
      </div>

      {resumo.por_modulo.length > 0 ? (
        <div className="space-y-3">
          {resumo.por_modulo.map((item) => {
            const total = Number(item.total || 0);
            const percentual =
              resumo.total_pendencias > 0
                ? Math.round((total / resumo.total_pendencias) * 100)
                : 0;

            return (
              <div key={item.modulo || "sem-modulo"} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {item.modulo || "Sem módulo"}
                  </span>

                  <span className="text-slate-500 dark:text-slate-400">
                    {formatarNumero(total)}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-slate-800 transition-all dark:bg-slate-200"
                    style={{ width: `${Math.max(percentual, total > 0 ? 3 : 0)}%` }}
                  />
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatarNumero(item.urgentes || 0)} urgente(s) ·{" "}
                  {formatarNumero(item.criticas || 0)} crítica(s)
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nenhuma pendência por módulo neste momento.
        </p>
      )}
    </section>
  );
}

function TiposRecorrentes({ resumo }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        <h2 className="text-base font-black text-slate-950 dark:text-white">
          Tipos mais recorrentes
        </h2>
      </div>

      {resumo.por_tipo.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {resumo.por_tipo.slice(0, 10).map((item) => (
            <div
              key={`${item.modulo}-${item.tipo}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50"
            >
              <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                {item.tipo || "Sem tipo"}
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {item.modulo || "Sem módulo"} · {formatarNumero(item.total)}{" "}
                registro(s)
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formatarNumero(item.urgentes || 0)} urgente(s) ·{" "}
                {formatarNumero(item.criticas || 0)} crítica(s)
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nenhum tipo recorrente neste momento.
        </p>
      )}
    </section>
  );
}

function PendenciaCard({ pendencia, onAbrir }) {
  const item = normalizarPendencia(pendencia);

  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/70">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <BadgePrioridade prioridade={item.prioridade} />
            <BadgeSeveridade severidade={item.severidade} />
            <BadgeStatus status={item.status} />
          </div>

          <h3 className="break-words text-base font-black text-slate-950 dark:text-white">
            {item.titulo}
          </h3>

          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {item.descricao}
          </p>

          <div className="mt-3 grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2 xl:grid-cols-4">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              {item.modulo}
            </span>

            <span className="inline-flex items-center gap-1">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              {item.tipo}
            </span>

            <span className="inline-flex items-center gap-1">
              <Route className="h-3.5 w-3.5" aria-hidden="true" />
              {item.entidade || "sem entidade"}
            </span>

            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {formatarDataHora(item.atualizado_em || item.criado_em)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onAbrir(item)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Ver detalhes
        </button>
      </div>
    </article>
  );
}

function PainelFiltros({
  filtros,
  setFiltros,
  carregando,
  atualizando,
  onAplicar,
  onLimpar,
}) {
  const atualizarFiltro = useCallback(
    (campo, valor) => {
      setFiltros((anterior) => ({
        ...anterior,
        [campo]: valor,
        pagina: 1,
      }));
    },
    [setFiltros]
  );

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/90 p-4 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85 dark:shadow-black/20 dark:ring-zinc-800 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filtros administrativos
          </div>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Localize pendências por módulo, severidade, prioridade, origem,
            entidade ou período. A busca só será executada ao aplicar.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Botao
            type="button"
            variant="secondary"
            onClick={onLimpar}
            disabled={carregando || atualizando}
          >
            <span className="inline-flex items-center gap-2">
              <X className="h-4 w-4" aria-hidden="true" />
              Limpar filtros
            </span>
          </Botao>

          <Botao
            type="button"
            variant="secondary"
            onClick={onAplicar}
            disabled={carregando || atualizando}
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw
                className={cx("h-4 w-4", atualizando && "animate-spin")}
                aria-hidden="true"
              />
              Atualizar
            </span>
          </Botao>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CampoTexto
          label="Busca"
          value={filtros.busca}
          onChange={(value) => atualizarFiltro("busca", value)}
          placeholder="Título, descrição, módulo..."
          icon={Search}
        />

        <CampoTexto
          label="Módulo"
          value={filtros.modulo}
          onChange={(value) => atualizarFiltro("modulo", value)}
          placeholder="Ex.: mensagem"
          icon={Layers}
        />

        <CampoTexto
          label="Tipo"
          value={filtros.tipo}
          onChange={(value) => atualizarFiltro("tipo", value)}
          placeholder="Ex.: mensagem_urgente"
          icon={Info}
        />

        <CampoSelect
          label="Severidade"
          value={filtros.severidade}
          onChange={(value) => atualizarFiltro("severidade", value)}
          options={SEVERIDADES}
        />

        <CampoSelect
          label="Prioridade"
          value={filtros.prioridade}
          onChange={(value) => atualizarFiltro("prioridade", value)}
          options={PRIORIDADES}
        />

        <CampoSelect
          label="Status"
          value={filtros.status}
          onChange={(value) => atualizarFiltro("status", value)}
          options={STATUS}
        />

        <CampoTexto
          label="Entidade"
          value={filtros.entidade}
          onChange={(value) => atualizarFiltro("entidade", value)}
          placeholder="Ex.: mensagem_conversa"
          icon={Route}
        />

        <CampoTexto
          label="Entidade ID"
          value={filtros.entidade_id}
          onChange={(value) => atualizarFiltro("entidade_id", value)}
          placeholder="Ex.: 15"
          icon={Info}
        />

        <CampoTexto
          label="Origem"
          value={filtros.origem}
          onChange={(value) => atualizarFiltro("origem", value)}
          placeholder="Ex.: auditoria_eventos"
          icon={Sparkles}
        />

        <CampoTexto
          label="Usuário ID"
          value={filtros.usuario_id}
          onChange={(value) => atualizarFiltro("usuario_id", value)}
          placeholder="Ex.: 4049"
          type="number"
          min="1"
          icon={UserRound}
        />

        <CampoData
          label="Data inicial"
          value={filtros.data_inicio}
          onChange={(value) => atualizarFiltro("data_inicio", value)}
        />

        <CampoData
          label="Data final"
          value={filtros.data_fim}
          onChange={(value) => atualizarFiltro("data_fim", value)}
        />

        <CampoSelect
          label="Itens por página"
          value={filtros.limite}
          onChange={(value) => atualizarFiltro("limite", Number(value))}
          options={LIMITES.map((limite) => ({
            value: limite,
            label: String(limite),
          }))}
        />

        <div className="flex items-end sm:col-span-2 xl:col-span-3">
          <Botao
            type="button"
            onClick={onAplicar}
            disabled={carregando || atualizando}
            className="w-full justify-center gap-2 xl:max-w-xs"
          >
            {atualizando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            Aplicar filtros
          </Botao>
        </div>
      </div>
    </section>
  );
}

function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  icon: Icon,
  type = "text",
  min,
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>

      <div className="relative">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        ) : null}

        <input
          type={type}
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cx(
            "w-full rounded-xl border border-slate-200 bg-white py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950",
            Icon ? "pl-9 pr-3" : "px-3"
          )}
        />
      </div>
    </label>
  );
}

function CampoData({ label, value, onChange }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>

      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950"
      />
    </label>
  );
}

function CampoSelect({ label, value, onChange, options }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950"
      >
        {options.map((opcao) => (
          <option key={opcao.value} value={opcao.value}>
            {opcao.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ListaPendencias({
  pendencias,
  meta,
  atualizando,
  onAbrir,
  onMudarPagina,
}) {
  const paginaAtual = Number(meta.pagina || 1);
  const totalPaginas = Math.max(Number(meta.total_paginas || 1), 1);

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Pendências encontradas
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatarNumero(meta.total)} pendência(s) encontrada(s).
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {atualizando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Página {paginaAtual} de {totalPaginas}
        </div>
      </div>

      {pendencias.length === 0 ? (
        <div className="p-6">
          <NadaEncontrado
            titulo="Nenhuma pendência encontrada"
            mensagem="A view não identificou pendências administrativas para os filtros atuais."
          />
        </div>
      ) : (
        <div className="grid gap-3 p-4">
          {pendencias.map((pendencia) => (
            <PendenciaCard
              key={pendencia.pendencia_id}
              pendencia={pendencia}
              onAbrir={onAbrir}
            />
          ))}
        </div>
      )}

      {pendencias.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mostrando até {formatarNumero(meta.limite)} por página.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={paginaAtual <= 1 || atualizando}
              onClick={() => onMudarPagina(paginaAtual - 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Anterior
            </button>

            <button
              type="button"
              disabled={paginaAtual >= totalPaginas || atualizando}
              onClick={() => onMudarPagina(paginaAtual + 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Próxima
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ModalPendencia({
  pendenciaSelecionada,
  carregandoDetalhe,
  onFechar,
}) {
  const pendencia = pendenciaSelecionada
    ? normalizarPendencia(pendenciaSelecionada)
    : null;

  return (
    <Modal
      aberto={Boolean(pendenciaSelecionada)}
      onFechar={onFechar}
      titulo="Detalhes da pendência"
      tamanho="xl"
    >
      {carregandoDetalhe ? (
        <CarregandoSkeleton
          linhas={6}
          titulo="Carregando pendência"
          subtitulo="Buscando detalhes da pendência administrativa."
        />
      ) : pendencia ? (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-2">
                  <BadgePrioridade prioridade={pendencia.prioridade} />
                  <BadgeSeveridade severidade={pendencia.severidade} />
                  <BadgeStatus status={pendencia.status} />
                </div>

                <h3 className="break-words text-xl font-black text-slate-950 dark:text-white">
                  {pendencia.titulo}
                </h3>

                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {pendencia.descricao}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  copiarTexto(pendencia.pendencia_id, "ID da pendência copiado.")
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar ID
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetalheResumo label="Módulo" value={pendencia.modulo || "—"} />
              <DetalheResumo label="Tipo" value={pendencia.tipo || "—"} />
              <DetalheResumo label="Origem" value={pendencia.origem || "—"} />
              <DetalheResumo
                label="Usuário"
                value={pendencia.usuario_id || "—"}
              />
              <DetalheResumo
                label="Entidade"
                value={pendencia.entidade || "—"}
              />

              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Entidade ID
                </div>

                <button
                  type="button"
                  onClick={() =>
                    copiarTexto(pendencia.entidade_id, "Entidade ID copiado.")
                  }
                  className="max-w-full truncate text-left font-mono text-sm font-black text-blue-700 hover:underline dark:text-blue-300"
                >
                  {pendencia.entidade_id || "—"}
                </button>
              </div>

              <DetalheResumo
                label="Criada em"
                value={formatarDataHora(pendencia.criado_em)}
              />

              <DetalheResumo
                label="Atualizada em"
                value={formatarDataHora(pendencia.atualizado_em)}
              />
            </div>
          </section>

          <JsonPreview
            titulo="Detalhes técnicos controlados"
            valor={pendencia.detalhes}
          />

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
            <p className="font-black">Orientação operacional</p>
            <p className="mt-1">
              Esta pendência é derivada da view oficial. Para resolvê-la,
              corrija a entidade de origem indicada. Quando a condição deixar de
              existir, a pendência desaparecerá automaticamente da listagem.
            </p>
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

function DetalheResumo({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>

      <p className="break-words text-sm font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Página principal
 * ───────────────────────────────────────────── */

export default function PendenciasAdmin() {
  const [pendencias, setPendencias] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [meta, setMeta] = useState({
    total: 0,
    pagina: 1,
    limite: 50,
    total_paginas: 1,
  });

  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIAIS);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");

  const [pendenciaSelecionada, setPendenciaSelecionada] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const mountedRef = useRef(false);
  const requestSeqRef = useRef(0);

  const resumoNormalizado = useMemo(() => normalizarResumo(resumo), [resumo]);

  const validarFiltros = useCallback((valores) => {
    if (valores.severidade && !SEVERIDADES_OFICIAIS.includes(valores.severidade)) {
      notifyWarning("Severidade inválida para o contrato oficial.");
      return false;
    }

    if (valores.prioridade && !PRIORIDADES_OFICIAIS.includes(valores.prioridade)) {
      notifyWarning("Prioridade inválida para o contrato oficial.");
      return false;
    }

    if (valores.status && !STATUS_OFICIAIS.includes(valores.status)) {
      notifyWarning("Status inválido para o contrato oficial.");
      return false;
    }

    if (!LIMITES.includes(Number(valores.limite))) {
      notifyWarning("Limite inválido para paginação.");
      return false;
    }

    const pagina = Number(valores.pagina || 1);

    if (!Number.isInteger(pagina) || pagina < 1) {
      notifyWarning("Página inválida.");
      return false;
    }

    if (valores.usuario_id && !toPositiveIntOrEmpty(valores.usuario_id)) {
      notifyWarning("Usuário ID inválido.");
      return false;
    }

    if (valores.data_inicio && !isYMD(valores.data_inicio)) {
      notifyWarning("Data inicial inválida.");
      return false;
    }

    if (valores.data_fim && !isYMD(valores.data_fim)) {
      notifyWarning("Data final inválida.");
      return false;
    }

    if (
      valores.data_inicio &&
      valores.data_fim &&
      valores.data_inicio > valores.data_fim
    ) {
      notifyWarning("A data inicial não pode ser maior que a data final.");
      return false;
    }

    return true;
  }, []);

  const carregarResumo = useCallback(async (proximosFiltros) => {
    validarFacade("api.pendencia.resumo", api?.pendencia?.resumo);

    const resposta = await api.pendencia.resumo(montarParamsResumo(proximosFiltros));

    return extrairData(resposta);
  }, []);

  const carregarPendencias = useCallback(
    async ({ proximosFiltros = filtrosAplicados, silencioso = false } = {}) => {
      if (!validarFiltros(proximosFiltros)) return;

      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;

      try {
        if (silencioso) {
          setAtualizando(true);
        } else {
          setCarregando(true);
        }

        setErro("");

        validarFacade("api.pendencia.listar", api?.pendencia?.listar);

        const respostaPendencias = await api.pendencia.listar(
          montarParams(proximosFiltros)
        );

        const resumoPayload = await carregarResumo(proximosFiltros);

        if (!mountedRef.current || requestSeqRef.current !== requestId) return;

        const dataPendencias = extrairData(respostaPendencias);
        const metaPendencias = extrairMeta(respostaPendencias);

        setPendencias(
          Array.isArray(dataPendencias)
            ? dataPendencias.map(normalizarPendencia)
            : []
        );

        setMeta({
          total: Number(metaPendencias?.total || 0),
          pagina: Number(metaPendencias?.pagina || proximosFiltros.pagina || 1),
          limite: Number(metaPendencias?.limite || proximosFiltros.limite || 50),
          total_paginas: Number(metaPendencias?.total_paginas || 1),
        });

        setResumo(resumoPayload || null);
        setFiltrosAplicados(proximosFiltros);
      } catch (error) {
        console.error("[PendenciasAdmin] Falha ao carregar pendências:", error);

        if (!mountedRef.current || requestSeqRef.current !== requestId) return;

        setErro(
          obterMensagemErro(
            error,
            "Não foi possível carregar as pendências administrativas."
          )
        );
      } finally {
        if (mountedRef.current && requestSeqRef.current === requestId) {
          setCarregando(false);
          setAtualizando(false);
        }
      }
    },
    [carregarResumo, filtrosAplicados, validarFiltros]
  );

  useEffect(() => {
    mountedRef.current = true;
    document.title = "Pendências Administrativas | Escola da Saúde";

    carregarPendencias({
      proximosFiltros: FILTROS_INICIAIS,
      silencioso: false,
    });

    return () => {
      mountedRef.current = false;
    };
    // Busca inicial única. Alteração em filtros não dispara nova requisição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicarFiltros = useCallback(() => {
    const proximosFiltros = {
      ...filtros,
      pagina: 1,
    };

    setFiltros(proximosFiltros);

    carregarPendencias({
      proximosFiltros,
      silencioso: true,
    });
  }, [carregarPendencias, filtros]);

  const limparFiltros = useCallback(() => {
    setFiltros(FILTROS_INICIAIS);

    carregarPendencias({
      proximosFiltros: FILTROS_INICIAIS,
      silencioso: true,
    });
  }, [carregarPendencias]);

  const mudarPagina = useCallback(
    (pagina) => {
      const proximaPagina = Math.max(Number(pagina || 1), 1);

      const proximosFiltros = {
        ...filtrosAplicados,
        pagina: proximaPagina,
      };

      setFiltros((anterior) => ({
        ...anterior,
        pagina: proximaPagina,
      }));

      carregarPendencias({
        proximosFiltros,
        silencioso: true,
      });
    },
    [carregarPendencias, filtrosAplicados]
  );

  const abrirDetalhe = useCallback(async (pendencia) => {
    try {
      const item = normalizarPendencia(pendencia);

      setCarregandoDetalhe(true);
      setPendenciaSelecionada(item);

      validarFacade("api.pendencia.obterPorId", api?.pendencia?.obterPorId);

      const resposta = await api.pendencia.obterPorId(item.pendencia_id);

      if (!mountedRef.current) return;

      setPendenciaSelecionada(normalizarPendencia(extrairData(resposta) || item));
    } catch (error) {
      console.error("[PendenciasAdmin] Falha ao carregar detalhe:", error);

      notifyError(
        obterMensagemErro(
          error,
          "Não foi possível carregar os detalhes da pendência."
        )
      );
    } finally {
      if (mountedRef.current) setCarregandoDetalhe(false);
    }
  }, []);

  if (carregando) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <CarregandoSkeleton
            linhas={8}
            titulo="Carregando pendências administrativas"
            subtitulo="Buscando pendências derivadas dos módulos operacionais e diagnósticos."
          />
        </main>

        <Footer />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <ErroCarregamento
            titulo="Não foi possível carregar as pendências"
            mensagem={erro}
            onTentarNovamente={() =>
              carregarPendencias({
                proximosFiltros: filtrosAplicados,
                silencioso: false,
              })
            }
          />
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-white text-slate-950 dark:from-zinc-950 dark:via-zinc-950 dark:to-black dark:text-white">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-slate-950 focus:shadow-lg"
      >
        Ir para o conteúdo
      </a>

      <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <HeaderHero
          titulo="Pendências administrativas"
          subtitulo="Acompanhe pendências derivadas dos módulos operacionais, priorize correções e apoie a Saúde da Plataforma com rastreabilidade institucional."
          icone={ListChecks}
          campanhaMes="junho"
          tamanho="md"
          raio="xl"
        />
      </div>

      {atualizando ? (
        <div
          className="sticky top-0 z-50 h-1 w-full bg-violet-100 dark:bg-violet-950"
          role="progressbar"
          aria-label="Atualizando pendências administrativas"
        >
          <div className="h-full w-1/3 animate-pulse bg-violet-700" />
        </div>
      ) : null}

      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      >
        <PainelResumoOperacional resumo={resumoNormalizado} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardResumo
            icone={ListChecks}
            titulo="Total"
            valor={resumoNormalizado.total_pendencias}
            detalhe="Pendências derivadas"
          />

          <CardResumo
            icone={AlertTriangle}
            titulo="Urgentes"
            valor={resumoNormalizado.urgente}
            detalhe="Prioridade máxima"
            destaque="text-red-700 dark:text-red-300"
          />

          <CardResumo
            icone={XCircle}
            titulo="Erros"
            valor={resumoNormalizado.erro}
            detalhe="Falhas ou erros operacionais"
            destaque="text-red-700 dark:text-red-300"
          />

          <CardResumo
            icone={ShieldAlert}
            titulo="Críticas"
            valor={resumoNormalizado.critico}
            detalhe="Exigem atenção imediata"
            destaque="text-purple-700 dark:text-purple-300"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <PendenciasPorModulo resumo={resumoNormalizado} />
          <TiposRecorrentes resumo={resumoNormalizado} />
        </section>

        <PainelFiltros
          filtros={filtros}
          setFiltros={setFiltros}
          carregando={carregando}
          atualizando={atualizando}
          onAplicar={aplicarFiltros}
          onLimpar={limparFiltros}
        />

        <ListaPendencias
          pendencias={pendencias}
          meta={meta}
          atualizando={atualizando}
          onAbrir={abrirDetalhe}
          onMudarPagina={mudarPagina}
        />
      </main>

      <ModalPendencia
        pendenciaSelecionada={pendenciaSelecionada}
        carregandoDetalhe={carregandoDetalhe}
        onFechar={() => setPendenciaSelecionada(null)}
      />

      <Footer />
    </div>
  );
}