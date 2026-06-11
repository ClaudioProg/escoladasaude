/**
 * ✅ frontend/src/pages/SaudePlataformaAdmin.jsx — v2.1
 * Atualizado em: 02/06/2026
 * Plataforma Escola da Saúde
 *
 * Página administrativa da Saúde da Plataforma.
 *
 * Responsabilidades:
 * - Exibir classificação geral da saúde operacional.
 * - Exibir indicadores críticos, alertas e saudáveis.
 * - Listar indicadores derivados da view v_saude_plataforma.
 * - Filtrar por módulo, status, severidade, janela e busca.
 * - Exibir detalhes técnicos controlados de cada indicador.
 * - Apoiar diagnóstico executivo, auditoria, pendências e operação administrativa.
 *
 * Revisão premium v2.1:
 * - usa HeaderHero global oficial limpo;
 * - adiciona Footer oficial;
 * - remove hero local como cabeçalho principal;
 * - mantém classificação, KPIs e diagnóstico fora do HeaderHero;
 * - evita recarregamento automático a cada digitação nos filtros;
 * - filtros só são aplicados ao clicar em "Aplicar filtros";
 * - paginação executa nova busca de forma controlada;
 * - adiciona controle contra respostas antigas sobrescreverem dados recentes;
 * - fortalece extração de envelopes ok/data/meta;
 * - melhora responsividade, leitura mobile e estados de carregamento;
 * - mantém contrato oficial api.saudePlataforma.*;
 * - sem aliases, sem montagem direta de /api e sem legado.
 *
 * Contratos aplicados:
 * - Service oficial: api.saudePlataforma.*
 * - Backend oficial: /api/saude-plataforma
 * - View oficial: v_saude_plataforma
 * - Status oficiais:
 *   - saudavel
 *   - alerta
 *   - critico
 * - Severidades oficiais:
 *   - info
 *   - aviso
 *   - erro
 *   - critico
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Filter,
  Gauge,
  HeartPulse,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
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

const STATUS = [
  { value: "", label: "Todos" },
  { value: "saudavel", label: "Saudável" },
  { value: "alerta", label: "Alerta" },
  { value: "critico", label: "Crítico" },
];

const SEVERIDADES = [
  { value: "", label: "Todas" },
  { value: "info", label: "Info" },
  { value: "aviso", label: "Aviso" },
  { value: "erro", label: "Erro" },
  { value: "critico", label: "Crítico" },
];

const STATUS_OFICIAIS = STATUS.map((item) => item.value).filter(Boolean);
const SEVERIDADES_OFICIAIS = SEVERIDADES.map((item) => item.value).filter(
  Boolean,
);

const LIMITES = [25, 50, 100, 200];

const FILTROS_INICIAIS = {
  indicador_id: "",
  modulo: "",
  status: "",
  severidade: "",
  janela: "",
  busca: "",
  pagina: 1,
  limite: 100,
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
    }),
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
    }),
  );
}

function formatarNumero(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return "0";
  }

  return new Intl.NumberFormat("pt-BR").format(numero);
}

function formatarDataHora(valor) {
  if (!valor) {
    return "—";
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(data);
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
        "Não foi possível copiar automaticamente. Selecione o conteúdo manualmente.",
      ),
    );
}

function normalizarResumo(resumo) {
  const geral = resumo?.geral || {};

  return {
    total_indicadores: Number(geral.total_indicadores || 0),
    saudaveis: Number(geral.saudaveis || 0),
    alertas: Number(geral.alertas || 0),
    criticos: Number(geral.criticos || 0),
    info: Number(geral.info || 0),
    aviso: Number(geral.aviso || 0),
    erro: Number(geral.erro || 0),
    severidade_critica: Number(geral.severidade_critica || 0),
    atualizado_em: geral.atualizado_em || null,
    status_geral: geral.status_geral || "saudavel",
    titulo: geral.titulo || "Saúde da Plataforma",
    descricao: geral.descricao || "Indicadores operacionais carregados.",
    por_modulo: Array.isArray(resumo?.por_modulo) ? resumo.por_modulo : [],
    por_status: Array.isArray(resumo?.por_status) ? resumo.por_status : [],
    por_severidade: Array.isArray(resumo?.por_severidade)
      ? resumo.por_severidade
      : [],
    destaques: Array.isArray(resumo?.destaques) ? resumo.destaques : [],
  };
}

function normalizarIndicador(indicador) {
  return {
    indicador_id: indicador?.indicador_id || "",
    modulo: indicador?.modulo || "—",
    titulo: indicador?.titulo || "Indicador sem título",
    descricao: indicador?.descricao || "Sem descrição registrada.",
    status: indicador?.status || "saudavel",
    severidade: indicador?.severidade || "info",
    janela: indicador?.janela || "",
    valor: Number(indicador?.valor || 0),
    atualizado_em: indicador?.atualizado_em || null,
    detalhes: indicador?.detalhes ?? null,
    ...indicador,
  };
}

function statusLabel(status) {
  const mapa = {
    saudavel: "Saudável",
    alerta: "Alerta",
    critico: "Crítico",
  };

  return mapa[status] || status || "—";
}

function severidadeLabel(severidade) {
  const mapa = {
    info: "Info",
    aviso: "Aviso",
    erro: "Erro",
    critico: "Crítico",
  };

  return mapa[severidade] || severidade || "—";
}

function statusClasses(status) {
  const mapa = {
    saudavel:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    alerta:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    critico:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
  };

  return mapa[status] || mapa.saudavel;
}

function severidadeClasses(severidade) {
  const mapa = {
    info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    aviso:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    erro: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
    critico:
      "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  };

  return mapa[severidade] || mapa.info;
}

function statusIcon(status) {
  const mapa = {
    saudavel: ShieldCheck,
    alerta: AlertTriangle,
    critico: ShieldAlert,
  };

  return mapa[status] || ShieldCheck;
}

/* ─────────────────────────────────────────────
 * Componentes locais
 * ───────────────────────────────────────────── */

function BadgeStatus({ status }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black",
        statusClasses(status),
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function BadgeSeveridade({ severidade }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black",
        severidadeClasses(severidade),
      )}
    >
      {severidadeLabel(severidade)}
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

function ClassificacaoOperacional({ resumo }) {
  const Icone = statusIcon(resumo.status_geral);

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85 dark:shadow-black/20 dark:ring-zinc-800 sm:p-6">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-100 blur-3xl dark:bg-violet-950/40" />
      <div className="absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-blue-100 blur-3xl dark:bg-blue-950/40" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div
            className={cx(
              "mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide",
              statusClasses(resumo.status_geral),
            )}
          >
            <Icone className="h-3.5 w-3.5" aria-hidden="true" />
            {statusLabel(resumo.status_geral)}
          </div>

          <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            {resumo.titulo}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {resumo.descricao}
          </p>

          <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Última atualização: {formatarDataHora(resumo.atualizado_em)}
          </p>
        </div>

        <div className="grid min-w-full grid-cols-2 gap-3 sm:min-w-[360px]">
          <MiniResumo
            label="Info"
            value={resumo.info}
            className="bg-blue-50 text-blue-900 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-100 dark:ring-blue-800/60"
          />
          <MiniResumo
            label="Avisos"
            value={resumo.aviso}
            className="bg-amber-50 text-amber-900 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-800/60"
          />
          <MiniResumo
            label="Erros"
            value={resumo.erro}
            className="bg-red-50 text-red-900 ring-red-100 dark:bg-red-950/30 dark:text-red-100 dark:ring-red-800/60"
          />
          <MiniResumo
            label="Críticos"
            value={resumo.severidade_critica}
            className="bg-purple-50 text-purple-900 ring-purple-100 dark:bg-purple-950/30 dark:text-purple-100 dark:ring-purple-800/60"
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
              destaque || "text-slate-950 dark:text-white",
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
    if (valor === null || valor === undefined) {
      return "";
    }

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

function IndicadorCard({ indicador, onAbrir }) {
  const item = normalizarIndicador(indicador);

  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/70">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <BadgeStatus status={item.status} />
            <BadgeSeveridade severidade={item.severidade} />
            <BadgeTecnico>{item.janela || "sem janela"}</BadgeTecnico>
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
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
              Valor: {formatarNumero(item.valor)}
            </span>

            <span className="inline-flex min-w-0 items-center gap-1">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.indicador_id || "—"}</span>
            </span>

            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {formatarDataHora(item.atualizado_em)}
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

function SaudePorModulo({ resumo }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        <h2 className="text-base font-black text-slate-950 dark:text-white">
          Saúde por módulo
        </h2>
      </div>

      {resumo.por_modulo.length > 0 ? (
        <div className="space-y-3">
          {resumo.por_modulo.map((item) => {
            const total = Number(item.total || 0);
            const criticos = Number(item.criticos || 0);
            const alertas = Number(item.alertas || 0);
            const percentualRisco =
              total > 0 ? Math.round(((criticos + alertas) / total) * 100) : 0;

            return (
              <div key={item.modulo} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {item.modulo || "Sem módulo"}
                  </span>

                  <span className="text-slate-500 dark:text-slate-400">
                    {formatarNumero(total)} indicador(es)
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={cx(
                      "h-full rounded-full transition-all",
                      criticos > 0
                        ? "bg-red-600"
                        : alertas > 0
                          ? "bg-amber-500"
                          : "bg-emerald-600",
                    )}
                    style={{
                      width: `${Math.max(percentualRisco, total > 0 ? 5 : 0)}%`,
                    }}
                  />
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatarNumero(criticos)} crítico(s) ·{" "}
                  {formatarNumero(alertas)} alerta(s) · soma de valores:{" "}
                  {formatarNumero(item.soma_valores || 0)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nenhum agrupamento por módulo disponível.
        </p>
      )}
    </section>
  );
}

function DiagnosticoExecutivo({ diagnostico, onAbrir }) {
  const criticos = Array.isArray(diagnostico?.criticos)
    ? diagnostico.criticos.slice(0, 4)
    : [];
  const alertas = Array.isArray(diagnostico?.alertas)
    ? diagnostico.alertas.slice(0, 4)
    : [];

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        <h2 className="text-base font-black text-slate-950 dark:text-white">
          Diagnóstico executivo
        </h2>
      </div>

      {criticos.length > 0 || alertas.length > 0 ? (
        <div className="space-y-3">
          {criticos.map((item) => (
            <BotaoDiagnostico
              key={item.indicador_id}
              item={item}
              tone="critico"
              onAbrir={onAbrir}
            />
          ))}

          {alertas.map((item) => (
            <BotaoDiagnostico
              key={item.indicador_id}
              item={item}
              tone="alerta"
              onAbrir={onAbrir}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p className="font-black">Sem alertas relevantes</p>
          <p className="mt-1">
            Não há indicadores críticos ou em alerta para exibir no diagnóstico
            executivo.
          </p>
        </div>
      )}
    </section>
  );
}

function BotaoDiagnostico({ item, tone, onAbrir }) {
  const classes = {
    critico:
      "border-red-200 bg-red-50 hover:bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/60",
    alerta:
      "border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60",
  };

  return (
    <button
      type="button"
      onClick={() => onAbrir(item)}
      className={cx(
        "w-full rounded-2xl border p-3 text-left transition",
        classes[tone],
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-black">{item.titulo}</p>
        <span className="text-sm font-black">{formatarNumero(item.valor)}</span>
      </div>

      <p className="mt-1 text-xs opacity-80">
        {item.modulo} · {item.janela || "sem janela"}
      </p>
    </button>
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
    [setFiltros],
  );

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/90 p-4 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85 dark:shadow-black/20 dark:ring-zinc-800 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filtros da Saúde da Plataforma
          </div>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Os filtros seguem o contrato oficial. A busca só será executada ao
            clicar em aplicar.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Botao
            type="button"
            variant="contorno"
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
            variant="contorno"
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
          label="Indicador ID"
          value={filtros.indicador_id}
          onChange={(value) => atualizarFiltro("indicador_id", value)}
          placeholder="Ex.: pendencias_total_atual"
          icon={Info}
        />

        <CampoTexto
          label="Módulo"
          value={filtros.modulo}
          onChange={(value) => atualizarFiltro("modulo", value)}
          placeholder="Ex.: reserva"
          icon={Layers}
        />

        <CampoTexto
          label="Janela"
          value={filtros.janela}
          onChange={(value) => atualizarFiltro("janela", value)}
          placeholder="Ex.: atual"
          icon={Clock3}
        />

        <CampoSelect
          label="Status"
          value={filtros.status}
          onChange={(value) => atualizarFiltro("status", value)}
          options={STATUS}
        />

        <CampoSelect
          label="Severidade"
          value={filtros.severidade}
          onChange={(value) => atualizarFiltro("severidade", value)}
          options={SEVERIDADES}
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

        <div className="flex items-end">
          <Botao
            type="button"
            onClick={onAplicar}
            disabled={carregando || atualizando}
            className="w-full justify-center gap-2"
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

function CampoTexto({ label, value, onChange, placeholder, icon: Icon }) {
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
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cx(
            "w-full rounded-xl border border-slate-200 bg-white py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950",
            Icon ? "pl-9 pr-3" : "px-3",
          )}
        />
      </div>
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

function ListaIndicadores({
  indicadores,
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
            Indicadores monitorados
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatarNumero(meta.total)} indicador(es) encontrado(s).
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

      {indicadores.length === 0 ? (
        <div className="p-6">
          <NadaEncontrado
            titulo="Nenhum indicador encontrado"
            mensagem="Ajuste os filtros para visualizar outros indicadores da Saúde da Plataforma."
          />
        </div>
      ) : (
        <div className="grid gap-3 p-4">
          {indicadores.map((indicador) => (
            <IndicadorCard
              key={indicador.indicador_id}
              indicador={indicador}
              onAbrir={onAbrir}
            />
          ))}
        </div>
      )}

      {indicadores.length > 0 ? (
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

function ModalIndicador({ indicadorSelecionado, carregandoDetalhe, onFechar }) {
  if (!indicadorSelecionado && !carregandoDetalhe) {
    return null;
  }

  const indicador = indicadorSelecionado
    ? normalizarIndicador(indicadorSelecionado)
    : null;

  return (
    <Modal
      aberto={Boolean(indicadorSelecionado || carregandoDetalhe)}
      onFechar={onFechar}
      titulo="Detalhes do indicador"
      tamanho="xl"
    >
      {carregandoDetalhe ? (
        <CarregandoSkeleton
          linhas={6}
          titulo="Carregando indicador"
          subtitulo="Buscando detalhes da Saúde da Plataforma."
        />
      ) : indicador ? (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-2">
                  <BadgeStatus status={indicador.status} />
                  <BadgeSeveridade severidade={indicador.severidade} />
                  <BadgeTecnico>
                    {indicador.janela || "sem janela"}
                  </BadgeTecnico>
                </div>

                <h3 className="break-words text-xl font-black text-slate-950 dark:text-white">
                  {indicador.titulo}
                </h3>

                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {indicador.descricao}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  copiarTexto(
                    indicador.indicador_id,
                    "ID do indicador copiado.",
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar ID
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetalheResumo
                label="Valor"
                value={formatarNumero(indicador.valor)}
              />
              <DetalheResumo label="Módulo" value={indicador.modulo || "—"} />
              <DetalheResumo label="Janela" value={indicador.janela || "—"} />
              <DetalheResumo
                label="Atualizado em"
                value={formatarDataHora(indicador.atualizado_em)}
              />
            </div>
          </section>

          <JsonPreview
            titulo="Critérios e detalhes técnicos"
            valor={indicador.detalhes}
          />

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
            <p className="font-black">Orientação operacional</p>
            <p className="mt-1">
              Este indicador é derivado da view oficial da Saúde da Plataforma.
              Para resolver alertas ou críticos, corrija a causa nos módulos de
              origem, especialmente quando o indicador apontar pendências,
              certificados, reservas, notificações ou auditoria.
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

export default function SaudePlataformaAdmin() {
  const [indicadores, setIndicadores] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null);
  const [meta, setMeta] = useState({
    total: 0,
    pagina: 1,
    limite: 100,
    total_paginas: 1,
  });

  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIAIS);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");

  const [indicadorSelecionado, setIndicadorSelecionado] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const mountedRef = useRef(false);
  const requestSeqRef = useRef(0);

  const resumoNormalizado = useMemo(() => normalizarResumo(resumo), [resumo]);

  const validarFiltros = useCallback((valores) => {
    if (valores.status && !STATUS_OFICIAIS.includes(valores.status)) {
      notifyWarning("Status inválido para o contrato oficial.");
      return false;
    }

    if (
      valores.severidade &&
      !SEVERIDADES_OFICIAIS.includes(valores.severidade)
    ) {
      notifyWarning("Severidade inválida para o contrato oficial.");
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

    return true;
  }, []);

  const carregarResumo = useCallback(async (proximosFiltros) => {
    validarFacade("api.saudePlataforma.resumo", api?.saudePlataforma?.resumo);

    const resposta = await api.saudePlataforma.resumo(
      montarParamsResumo(proximosFiltros),
    );

    return extrairData(resposta);
  }, []);

  const carregarDiagnostico = useCallback(async () => {
    validarFacade(
      "api.saudePlataforma.diagnostico",
      api?.saudePlataforma?.diagnostico,
    );

    const resposta = await api.saudePlataforma.diagnostico();

    return extrairData(resposta);
  }, []);

  const carregarIndicadores = useCallback(
    async ({ proximosFiltros = filtrosAplicados, silencioso = false } = {}) => {
      if (!validarFiltros(proximosFiltros)) {
        return;
      }

      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;

      try {
        if (silencioso) {
          setAtualizando(true);
        } else {
          setCarregando(true);
        }

        setErro("");

        validarFacade(
          "api.saudePlataforma.listar",
          api?.saudePlataforma?.listar,
        );

        const respostaIndicadores = await api.saudePlataforma.listar(
          montarParams(proximosFiltros),
        );

        const [resumoPayload, diagnosticoPayload] = await Promise.all([
          carregarResumo(proximosFiltros),
          carregarDiagnostico(),
        ]);

        if (!mountedRef.current || requestSeqRef.current !== requestId) {
          return;
        }

        const dataIndicadores = extrairData(respostaIndicadores);
        const metaIndicadores = extrairMeta(respostaIndicadores);

        setIndicadores(
          Array.isArray(dataIndicadores)
            ? dataIndicadores.map(normalizarIndicador)
            : [],
        );

        setMeta({
          total: Number(metaIndicadores?.total || 0),
          pagina: Number(
            metaIndicadores?.pagina || proximosFiltros.pagina || 1,
          ),
          limite: Number(
            metaIndicadores?.limite || proximosFiltros.limite || 100,
          ),
          total_paginas: Number(metaIndicadores?.total_paginas || 1),
        });

        setResumo(resumoPayload || null);
        setDiagnostico(diagnosticoPayload || null);
        setFiltrosAplicados(proximosFiltros);
      } catch (error) {
        console.error("[SaudePlataformaAdmin] Falha ao carregar saúde:", error);

        if (!mountedRef.current || requestSeqRef.current !== requestId) {
          return;
        }

        setErro(
          obterMensagemErro(
            error,
            "Não foi possível carregar a Saúde da Plataforma.",
          ),
        );
      } finally {
        if (mountedRef.current && requestSeqRef.current === requestId) {
          setCarregando(false);
          setAtualizando(false);
        }
      }
    },
    [carregarDiagnostico, carregarResumo, filtrosAplicados, validarFiltros],
  );

  useEffect(() => {
    mountedRef.current = true;
    document.title = "Saúde da Plataforma | Escola da Saúde";

    carregarIndicadores({
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

    carregarIndicadores({
      proximosFiltros,
      silencioso: true,
    });
  }, [carregarIndicadores, filtros]);

  const limparFiltros = useCallback(() => {
    setFiltros(FILTROS_INICIAIS);

    carregarIndicadores({
      proximosFiltros: FILTROS_INICIAIS,
      silencioso: true,
    });
  }, [carregarIndicadores]);

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

      carregarIndicadores({
        proximosFiltros,
        silencioso: true,
      });
    },
    [carregarIndicadores, filtrosAplicados],
  );

  const abrirDetalhe = useCallback(async (indicador) => {
    const indicadorBase = normalizarIndicador(indicador);

    // Abre o modal imediatamente com o que já veio da listagem.
    setIndicadorSelecionado(indicadorBase);

    // Se não houver ID, não tenta buscar detalhe remoto.
    if (!indicadorBase.indicador_id) {
      setCarregandoDetalhe(false);
      notifyWarning("Indicador sem ID técnico para consulta detalhada.");
      return;
    }

    // Se a facade de detalhe não existir, mantém o modal aberto com os dados atuais.
    if (typeof api?.saudePlataforma?.obterPorId !== "function") {
      setCarregandoDetalhe(false);
      notifyWarning(
        "Detalhe remoto indisponível. Exibindo os dados carregados na listagem.",
      );
      return;
    }

    try {
      setCarregandoDetalhe(true);

      const resposta = await api.saudePlataforma.obterPorId(
        indicadorBase.indicador_id,
      );

      if (!mountedRef.current) {
        return;
      }

      const detalhe = extrairData(resposta);

      setIndicadorSelecionado(
        normalizarIndicador({
          ...indicadorBase,
          ...(detalhe || {}),
        }),
      );
    } catch (error) {
      console.error(
        "[SaudePlataformaAdmin] Falha ao carregar indicador:",
        error,
      );

      notifyWarning(
        obterMensagemErro(
          error,
          "Não foi possível carregar o detalhe remoto. Exibindo os dados da listagem.",
        ),
      );
    } finally {
      if (mountedRef.current) {
        setCarregandoDetalhe(false);
      }
    }
  }, []);

  if (carregando) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <CarregandoSkeleton
            linhas={8}
            titulo="Carregando Saúde da Plataforma"
            subtitulo="Buscando indicadores, alertas, críticos e diagnóstico executivo."
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
            titulo="Não foi possível carregar a Saúde da Plataforma"
            mensagem={erro}
            onTentarNovamente={() =>
              carregarIndicadores({
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
          titulo="Saúde da plataforma"
          subtitulo="Monitore indicadores operacionais, alertas, pendências e inconsistências críticas da Escola da Saúde com dados rastreáveis e visão executiva."
          icone={HeartPulse}
          campanhaMes="junho"
          tamanho="md"
          raio="xl"
        />
      </div>

      {atualizando ? (
        <div
          className="sticky top-0 z-50 h-1 w-full bg-violet-100 dark:bg-violet-950"
          role="progressbar"
          aria-label="Atualizando Saúde da Plataforma"
        >
          <div className="h-full w-1/3 animate-pulse bg-violet-700" />
        </div>
      ) : null}

      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      >
        <ClassificacaoOperacional resumo={resumoNormalizado} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardResumo
            icone={Activity}
            titulo="Indicadores"
            valor={resumoNormalizado.total_indicadores}
            detalhe="Total monitorado"
          />

          <CardResumo
            icone={CheckCircle2}
            titulo="Saudáveis"
            valor={resumoNormalizado.saudaveis}
            detalhe="Sem ação imediata"
            destaque="text-emerald-700 dark:text-emerald-300"
          />

          <CardResumo
            icone={AlertTriangle}
            titulo="Alertas"
            valor={resumoNormalizado.alertas}
            detalhe="Requerem acompanhamento"
            destaque="text-amber-700 dark:text-amber-300"
          />

          <CardResumo
            icone={ShieldAlert}
            titulo="Críticos"
            valor={resumoNormalizado.criticos}
            detalhe="Exigem atenção imediata"
            destaque="text-red-700 dark:text-red-300"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <SaudePorModulo resumo={resumoNormalizado} />

          <DiagnosticoExecutivo
            diagnostico={diagnostico}
            onAbrir={abrirDetalhe}
          />
        </section>

        <PainelFiltros
          filtros={filtros}
          setFiltros={setFiltros}
          carregando={carregando}
          atualizando={atualizando}
          onAplicar={aplicarFiltros}
          onLimpar={limparFiltros}
        />

        <ListaIndicadores
          indicadores={indicadores}
          meta={meta}
          atualizando={atualizando}
          onAbrir={abrirDetalhe}
          onMudarPagina={mudarPagina}
        />
      </main>

      <ModalIndicador
        indicadorSelecionado={indicadorSelecionado}
        carregandoDetalhe={carregandoDetalhe}
        onFechar={() => {
          setIndicadorSelecionado(null);
          setCarregandoDetalhe(false);
        }}
      />

      <Footer />
    </div>
  );
}
