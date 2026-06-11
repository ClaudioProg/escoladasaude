/**
 * ✅ frontend/src/pages/AuditoriaAdmin.jsx — v2.1
 * Atualizado em: 02/06/2026
 * Plataforma Escola da Saúde
 *
 * Página administrativa da Auditoria Premium Centralizada.
 *
 * Responsabilidades:
 * - Exibir resumo da auditoria.
 * - Listar eventos auditáveis com filtros.
 * - Permitir consulta detalhada de evento.
 * - Apoiar diagnóstico administrativo com requestId, módulo, ação, severidade e rota.
 *
 * Revisão premium v2.1:
 * - usa HeaderHero global oficial limpo;
 * - adiciona Footer oficial;
 * - remove hero local como cabeçalho principal;
 * - mantém resumo, gráficos, filtros e ações fora do HeaderHero;
 * - evita recarregamento automático a cada digitação nos filtros;
 * - filtros só são aplicados ao clicar em "Aplicar filtros";
 * - paginação executa nova busca de forma controlada;
 * - adiciona controle contra respostas antigas sobrescreverem dados recentes;
 * - fortalece extração de envelopes ok/data/meta;
 * - melhora responsividade, leitura mobile e estados de carregamento;
 * - mantém contrato oficial api.auditoria.*;
 * - sem aliases, sem montagem direta de /api e sem legado.
 *
 * Contratos aplicados:
 * - Service oficial: api.auditoria.*
 * - Backend oficial: /api/auditoria
 * - Tabela oficial: auditoria_eventos
 * - Perfis oficiais: usuario, organizador, administrador
 * - Severidades oficiais:
 *   - debug
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
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

import api from "../services/api";
import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import Botao from "../components/ui/Botao";
import CarregandoSkeleton from "../components/ui/CarregandoSkeleton";
import ErroCarregamento from "../components/ui/ErroCarregamento";
import NadaEncontrado from "../components/ui/NadaEncontrado";
import Modal from "../components/ui/Modal";
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
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "aviso", label: "Aviso" },
  { value: "erro", label: "Erro" },
  { value: "critico", label: "Crítico" },
];

const SUCESSO_OPCOES = [
  { value: "", label: "Todos" },
  { value: "true", label: "Sucesso" },
  { value: "false", label: "Falha" },
];

const SEVERIDADES_OFICIAIS = SEVERIDADES.map((item) => item.value).filter(
  Boolean,
);
const SUCESSO_OFICIAL = SUCESSO_OPCOES.map((item) => item.value).filter(
  Boolean,
);

const LIMITE_OPCOES = [25, 50, 100, 200];

const FILTROS_INICIAIS = {
  usuario_id: "",
  modulo: "",
  acao: "",
  entidade: "",
  entidade_id: "",
  sucesso: "",
  severidade: "",
  request_id: "",
  data_inicio: "",
  data_fim: "",
  limite: 50,
  pagina: 1,
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
  const params = {};

  if (filtros.data_inicio) {
    params.data_inicio = filtros.data_inicio;
  }
  if (filtros.data_fim) {
    params.data_fim = filtros.data_fim;
  }

  return params;
}

function isYMD(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function toPositiveIntOrEmpty(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const number = Number(text);

  return Number.isInteger(number) && number > 0 ? String(number) : "";
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
    total_eventos: Number(geral.total_eventos || 0),
    total_sucesso: Number(geral.total_sucesso || 0),
    total_falha: Number(geral.total_falha || 0),
    total_debug: Number(geral.total_debug || 0),
    total_info: Number(geral.total_info || 0),
    total_aviso: Number(geral.total_aviso || 0),
    total_erro: Number(geral.total_erro || 0),
    total_critico: Number(geral.total_critico || 0),
    primeiro_registro: geral.primeiro_registro || null,
    ultimo_registro: geral.ultimo_registro || null,
    por_modulo: Array.isArray(resumo?.por_modulo) ? resumo.por_modulo : [],
    por_acao: Array.isArray(resumo?.por_acao) ? resumo.por_acao : [],
  };
}

function normalizarEvento(evento) {
  return {
    id: evento?.id || "",
    usuario_id: evento?.usuario_id || "",
    perfil_usuario: evento?.perfil_usuario || "",
    modulo: evento?.modulo || "—",
    acao: evento?.acao || "—",
    entidade: evento?.entidade || "",
    entidade_id: evento?.entidade_id || "",
    sucesso: Boolean(evento?.sucesso),
    severidade: evento?.severidade || "info",
    request_id: evento?.request_id || "",
    rota: evento?.rota || "",
    metodo_http: evento?.metodo_http || "",
    ip: evento?.ip || "",
    user_agent: evento?.user_agent || "",
    mensagem: evento?.mensagem || "",
    admin_hint: evento?.admin_hint || "",
    dados_anteriores: evento?.dados_anteriores ?? null,
    dados_novos: evento?.dados_novos ?? null,
    detalhes: evento?.detalhes ?? null,
    criado_em: evento?.criado_em || null,
    ...evento,
  };
}

function severidadeLabel(severidade) {
  const mapa = {
    debug: "Debug",
    info: "Info",
    aviso: "Aviso",
    erro: "Erro",
    critico: "Crítico",
  };

  return mapa[severidade] || severidade || "Info";
}

function severidadeClasses(severidade) {
  const valor = severidade || "info";

  const mapa = {
    debug:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200",
    info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    aviso:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    erro: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
    critico:
      "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  };

  return mapa[valor] || mapa.info;
}

/* ─────────────────────────────────────────────
 * Componentes locais
 * ───────────────────────────────────────────── */

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

function BadgeSucesso({ sucesso }) {
  if (sucesso) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Sucesso
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-black text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Falha
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
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-relaxed text-slate-800 dark:bg-slate-950 dark:text-slate-100">
          {conteudo}
        </pre>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sem dados registrados.
        </p>
      )}
    </div>
  );
}

function PainelResumoAuditoria({ resumo, onAtualizar, onCopiar, atualizando }) {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85 dark:shadow-black/20 dark:ring-zinc-800 sm:p-6">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-100 blur-3xl dark:bg-blue-950/50" />
      <div className="absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-emerald-100 blur-3xl dark:bg-emerald-950/40" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Auditoria Premium Centralizada
          </div>

          <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Rastreabilidade administrativa
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Consulte ações sensíveis, alterações administrativas, falhas
            relevantes, módulos afetados, requestId, rotas e diagnósticos
            controlados da Escola da Saúde.
          </p>

          <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:grid-cols-2">
            <p>
              Primeiro registro:{" "}
              <strong>{formatarDataHora(resumo.primeiro_registro)}</strong>
            </p>

            <p>
              Último registro:{" "}
              <strong>{formatarDataHora(resumo.ultimo_registro)}</strong>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Botao
            type="button"
            onClick={onAtualizar}
            disabled={atualizando}
            className="inline-flex items-center justify-center gap-2"
          >
            <RefreshCw
              className={cx("h-4 w-4", atualizando && "animate-spin")}
              aria-hidden="true"
            />
            Atualizar
          </Botao>

          <button
            type="button"
            onClick={onCopiar}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar resumo
          </button>
        </div>
      </div>
    </section>
  );
}

function ModulosAuditados({ resumo }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        <h2 className="text-base font-black text-slate-950 dark:text-white">
          Módulos mais auditados
        </h2>
      </div>

      {resumo.por_modulo.length > 0 ? (
        <div className="space-y-3">
          {resumo.por_modulo.slice(0, 8).map((item) => {
            const total = Number(item.total || 0);
            const percentual =
              resumo.total_eventos > 0
                ? Math.round((total / resumo.total_eventos) * 100)
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
                    style={{
                      width: `${Math.max(percentual, total > 0 ? 3 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ainda não há módulos auditados.
        </p>
      )}
    </section>
  );
}

function AcoesRegistradas({ resumo }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        <h2 className="text-base font-black text-slate-950 dark:text-white">
          Ações mais registradas
        </h2>
      </div>

      {resumo.por_acao.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {resumo.por_acao.slice(0, 10).map((item) => (
            <div
              key={item.acao || "sem-acao"}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50"
            >
              <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                {item.acao || "Sem ação"}
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formatarNumero(item.total)} registro(s)
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ainda não há ações auditadas.
        </p>
      )}
    </section>
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
            Filtros de auditoria
          </div>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Use filtros objetivos para investigar módulos, ações, falhas e
            requestId. A busca só será executada ao aplicar.
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
          label="Módulo"
          value={filtros.modulo}
          onChange={(value) => atualizarFiltro("modulo", value)}
          placeholder="Ex.: certificado"
          icon={Layers}
        />

        <CampoTexto
          label="Ação"
          value={filtros.acao}
          onChange={(value) => atualizarFiltro("acao", value)}
          placeholder="Ex.: emitir"
          icon={Activity}
        />

        <CampoSelect
          label="Severidade"
          value={filtros.severidade}
          onChange={(value) => atualizarFiltro("severidade", value)}
          options={SEVERIDADES}
        />

        <CampoSelect
          label="Resultado"
          value={filtros.sucesso}
          onChange={(value) => atualizarFiltro("sucesso", value)}
          options={SUCESSO_OPCOES}
        />

        <CampoTexto
          label="Usuário ID"
          value={filtros.usuario_id}
          onChange={(value) => atualizarFiltro("usuario_id", value)}
          placeholder="Ex.: 17"
          type="number"
          min="1"
          icon={UserRound}
        />

        <CampoTexto
          label="Entidade"
          value={filtros.entidade}
          onChange={(value) => atualizarFiltro("entidade", value)}
          placeholder="Ex.: turma"
          icon={Layers}
        />

        <CampoTexto
          label="Entidade ID"
          value={filtros.entidade_id}
          onChange={(value) => atualizarFiltro("entidade_id", value)}
          placeholder="Ex.: 165"
          icon={Info}
        />

        <CampoTexto
          label="Request ID"
          value={filtros.request_id}
          onChange={(value) => atualizarFiltro("request_id", value)}
          placeholder="Buscar requestId"
          icon={Route}
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
          options={LIMITE_OPCOES.map((limite) => ({
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
            Icon ? "pl-9 pr-3" : "px-3",
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

function ListaEventos({ eventos, meta, atualizando, onAbrir, onMudarPagina }) {
  const paginaAtual = Number(meta.pagina || 1);
  const totalPaginas = Math.max(Number(meta.total_paginas || 1), 1);

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Eventos registrados
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatarNumero(meta.total)} evento(s) encontrado(s).
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

      {eventos.length === 0 ? (
        <div className="p-6">
          <NadaEncontrado
            titulo="Nenhum evento de auditoria encontrado"
            mensagem="Ajuste os filtros ou aguarde os módulos começarem a registrar ações auditáveis."
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Módulo / Ação
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Entidade
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Resultado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Request
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {eventos.map((evento) => (
                  <EventoLinha
                    key={evento.id}
                    evento={evento}
                    onAbrir={onAbrir}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 lg:hidden">
            {eventos.map((evento) => (
              <EventoCardMobile
                key={evento.id}
                evento={evento}
                onAbrir={onAbrir}
              />
            ))}
          </div>
        </>
      )}

      {eventos.length > 0 ? (
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

function EventoLinha({ evento, onAbrir }) {
  const item = normalizarEvento(evento);

  return (
    <tr className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
      <td className="px-4 py-4 align-top text-sm text-slate-700 dark:text-slate-200">
        <div className="font-semibold">{formatarDataHora(item.criado_em)}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          #{item.id}
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="font-black text-slate-950 dark:text-white">
          {item.modulo}
        </div>

        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {item.acao}
        </div>

        <div className="mt-2">
          <BadgeSeveridade severidade={item.severidade} />
        </div>
      </td>

      <td className="px-4 py-4 align-top text-sm text-slate-700 dark:text-slate-200">
        <div>{item.entidade || "—"}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {item.entidade_id || "Sem ID"}
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <BadgeSucesso sucesso={item.sucesso} />
      </td>

      <td className="max-w-xs px-4 py-4 align-top text-sm text-slate-700 dark:text-slate-200">
        <button
          type="button"
          onClick={() => copiarTexto(item.request_id, "Request ID copiado.")}
          className="block max-w-[240px] truncate text-left font-mono text-xs text-blue-700 hover:underline dark:text-blue-300"
          title={item.request_id || ""}
        >
          {item.request_id || "—"}
        </button>

        <div className="mt-1 max-w-[240px] truncate text-xs text-slate-500 dark:text-slate-400">
          {item.rota || "Sem rota"}
        </div>
      </td>

      <td className="px-4 py-4 text-right align-top">
        <button
          type="button"
          onClick={() => onAbrir(item)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Ver
        </button>
      </td>
    </tr>
  );
}

function EventoCardMobile({ evento, onAbrir }) {
  const item = normalizarEvento(evento);

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            #{item.id} · {formatarDataHora(item.criado_em)}
          </p>

          <h3 className="mt-1 text-base font-black text-slate-950 dark:text-white">
            {item.modulo}
          </h3>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            {item.acao}
          </p>
        </div>

        <BadgeSeveridade severidade={item.severidade} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <BadgeSucesso sucesso={item.sucesso} />

        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          {item.entidade || "sem entidade"}
        </span>
      </div>

      <div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <Route className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="truncate">{item.rota || "Sem rota"}</span>
        </div>

        <button
          type="button"
          onClick={() => copiarTexto(item.request_id, "Request ID copiado.")}
          className="mt-2 block max-w-full truncate font-mono text-blue-700 hover:underline dark:text-blue-300"
        >
          {item.request_id || "Sem requestId"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => onAbrir(item)}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        Ver detalhes
      </button>
    </article>
  );
}

function ModalEvento({ eventoSelecionado, carregandoDetalhe, onFechar }) {
  if (!eventoSelecionado && !carregandoDetalhe) {
    return null;
  }

  const evento = eventoSelecionado ? normalizarEvento(eventoSelecionado) : null;

  return (
    <Modal
      aberto={Boolean(eventoSelecionado || carregandoDetalhe)}
      onFechar={onFechar}
      titulo="Detalhes do evento de auditoria"
      tamanho="xl"
    >
      {carregandoDetalhe ? (
        <CarregandoSkeleton
          linhas={6}
          titulo="Carregando detalhe"
          subtitulo="Buscando informações completas do evento."
        />
      ) : evento ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Evento #{evento.id}
                </p>

                <h3 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                  {evento.modulo} · {evento.acao}
                </h3>

                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {evento.mensagem || "Sem mensagem institucional registrada."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <BadgeSucesso sucesso={evento.sucesso} />
                <BadgeSeveridade severidade={evento.severidade} />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <DetalheResumo
                icon={Clock3}
                label="Data/hora"
                value={formatarDataHora(evento.criado_em)}
              />

              <DetalheResumo
                icon={UserRound}
                label="Usuário"
                value={`${evento.usuario_id || "—"} · ${
                  evento.perfil_usuario || "sem perfil"
                }`}
              />

              <DetalheResumo
                icon={Layers}
                label="Entidade"
                value={`${evento.entidade || "—"} · ${
                  evento.entidade_id || "sem ID"
                }`}
              />

              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  Request ID
                </div>

                <button
                  type="button"
                  onClick={() =>
                    copiarTexto(evento.request_id, "Request ID copiado.")
                  }
                  className="max-w-full truncate text-left font-mono text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300"
                >
                  {evento.request_id || "—"}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Route className="h-3.5 w-3.5" aria-hidden="true" />
                Requisição
              </div>

              <p className="break-words text-sm font-semibold text-slate-900 dark:text-white">
                {evento.metodo_http || "—"} {evento.rota || ""}
              </p>

              <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                IP: {evento.ip || "—"}
              </p>

              <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                User-Agent: {evento.user_agent || "—"}
              </p>
            </div>

            {evento.admin_hint ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <strong>Diagnóstico administrativo:</strong> {evento.admin_hint}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <JsonPreview
              titulo="Dados anteriores"
              valor={evento.dados_anteriores}
            />
            <JsonPreview titulo="Dados novos" valor={evento.dados_novos} />
            <JsonPreview titulo="Detalhes" valor={evento.detalhes} />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function DetalheResumo({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
      <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>

      <p className="break-words text-sm font-semibold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Página principal
 * ───────────────────────────────────────────── */

export default function AuditoriaAdmin() {
  const [eventos, setEventos] = useState([]);
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
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [eventoSelecionado, setEventoSelecionado] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const mountedRef = useRef(false);
  const requestSeqRef = useRef(0);

  const resumoNormalizado = useMemo(() => normalizarResumo(resumo), [resumo]);

  const validarFiltros = useCallback((valores) => {
    if (
      valores.severidade &&
      !SEVERIDADES_OFICIAIS.includes(valores.severidade)
    ) {
      notifyWarning("Severidade inválida para o contrato oficial.");
      return false;
    }

    if (valores.sucesso && !SUCESSO_OFICIAL.includes(valores.sucesso)) {
      notifyWarning("Resultado inválido para o contrato oficial.");
      return false;
    }

    if (!LIMITE_OPCOES.includes(Number(valores.limite))) {
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
    validarFacade("api.auditoria.resumo", api?.auditoria?.resumo);

    const resposta = await api.auditoria.resumo(
      montarParamsResumo(proximosFiltros),
    );

    return extrairData(resposta);
  }, []);

  const carregarEventos = useCallback(
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

        validarFacade("api.auditoria.listar", api?.auditoria?.listar);

        const respostaEventos = await api.auditoria.listar(
          montarParams(proximosFiltros),
        );

        const resumoPayload = await carregarResumo(proximosFiltros);

        if (!mountedRef.current || requestSeqRef.current !== requestId) {
          return;
        }

        const dataEventos = extrairData(respostaEventos);
        const metaEventos = extrairMeta(respostaEventos);

        setEventos(
          Array.isArray(dataEventos) ? dataEventos.map(normalizarEvento) : [],
        );

        setMeta({
          total: Number(metaEventos?.total || 0),
          pagina: Number(metaEventos?.pagina || proximosFiltros.pagina || 1),
          limite: Number(metaEventos?.limite || proximosFiltros.limite || 50),
          total_paginas: Number(metaEventos?.total_paginas || 1),
        });

        setResumo(resumoPayload || null);
        setFiltrosAplicados(proximosFiltros);
      } catch (error) {
        console.error("[AuditoriaAdmin] Falha ao carregar auditoria:", error);

        if (!mountedRef.current || requestSeqRef.current !== requestId) {
          return;
        }

        setErro(
          obterMensagemErro(
            error,
            "Não foi possível carregar os eventos de auditoria.",
          ),
        );
      } finally {
        if (mountedRef.current && requestSeqRef.current === requestId) {
          setCarregando(false);
          setAtualizando(false);
        }
      }
    },
    [carregarResumo, filtrosAplicados, validarFiltros],
  );

  useEffect(() => {
    mountedRef.current = true;
    document.title = "Auditoria da Plataforma | Escola da Saúde";

    carregarEventos({
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

    carregarEventos({
      proximosFiltros,
      silencioso: true,
    });
  }, [carregarEventos, filtros]);

  const limparFiltros = useCallback(() => {
    setFiltros(FILTROS_INICIAIS);

    carregarEventos({
      proximosFiltros: FILTROS_INICIAIS,
      silencioso: true,
    });
  }, [carregarEventos]);

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

      carregarEventos({
        proximosFiltros,
        silencioso: true,
      });
    },
    [carregarEventos, filtrosAplicados],
  );

  const abrirDetalhe = useCallback(async (evento) => {
    try {
      const item = normalizarEvento(evento);

      setCarregandoDetalhe(true);
      setEventoSelecionado(item);

      validarFacade("api.auditoria.obterPorId", api?.auditoria?.obterPorId);

      const resposta = await api.auditoria.obterPorId(item.id);

      if (!mountedRef.current) {
        return;
      }

      setEventoSelecionado(normalizarEvento(extrairData(resposta) || item));
    } catch (error) {
      console.error("[AuditoriaAdmin] Falha ao carregar detalhe:", error);

      notifyError(
        obterMensagemErro(
          error,
          "Não foi possível carregar os detalhes da auditoria.",
        ),
      );
    } finally {
      if (mountedRef.current) {
        setCarregandoDetalhe(false);
      }
    }
  }, []);

  const copiarResumo = useCallback(() => {
    copiarTexto(
      `Total: ${resumoNormalizado.total_eventos} | Sucessos: ${resumoNormalizado.total_sucesso} | Falhas: ${resumoNormalizado.total_falha} | Críticos: ${resumoNormalizado.total_critico}`,
      "Resumo da auditoria copiado.",
    );
  }, [resumoNormalizado]);

  if (carregando) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <CarregandoSkeleton
            linhas={8}
            titulo="Carregando auditoria da plataforma"
            subtitulo="Buscando eventos, indicadores e rastreabilidade administrativa."
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
            titulo="Não foi possível carregar a auditoria"
            mensagem={erro}
            onTentarNovamente={() =>
              carregarEventos({
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
          titulo="Auditoria da plataforma"
          subtitulo="Consulte ações sensíveis, alterações administrativas, falhas relevantes, módulos afetados, requestId, rotas e diagnósticos controlados da Escola da Saúde."
          icone={ShieldCheck}
          campanhaMes="junho"
          tamanho="md"
          raio="xl"
        />
      </div>

      {atualizando ? (
        <div
          className="sticky top-0 z-50 h-1 w-full bg-violet-100 dark:bg-violet-950"
          role="progressbar"
          aria-label="Atualizando auditoria"
        >
          <div className="h-full w-1/3 animate-pulse bg-violet-700" />
        </div>
      ) : null}

      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      >
        <PainelResumoAuditoria
          resumo={resumoNormalizado}
          atualizando={atualizando}
          onAtualizar={() =>
            carregarEventos({
              proximosFiltros: filtrosAplicados,
              silencioso: true,
            })
          }
          onCopiar={copiarResumo}
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardResumo
            icone={Activity}
            titulo="Eventos auditados"
            valor={resumoNormalizado.total_eventos}
            detalhe={
              resumoNormalizado.ultimo_registro
                ? `Último: ${formatarDataHora(resumoNormalizado.ultimo_registro)}`
                : "Nenhum evento registrado ainda"
            }
          />

          <CardResumo
            icone={CheckCircle2}
            titulo="Sucessos"
            valor={resumoNormalizado.total_sucesso}
            detalhe="Ações concluídas com sucesso"
            destaque="text-emerald-700 dark:text-emerald-300"
          />

          <CardResumo
            icone={ShieldAlert}
            titulo="Falhas"
            valor={resumoNormalizado.total_falha}
            detalhe="Eventos registrados como falha"
            destaque="text-red-700 dark:text-red-300"
          />

          <CardResumo
            icone={AlertTriangle}
            titulo="Críticos"
            valor={resumoNormalizado.total_critico}
            detalhe="Exigem atenção administrativa"
            destaque="text-purple-700 dark:text-purple-300"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <ModulosAuditados resumo={resumoNormalizado} />
          <AcoesRegistradas resumo={resumoNormalizado} />
        </section>

        <PainelFiltros
          filtros={filtros}
          setFiltros={setFiltros}
          carregando={carregando}
          atualizando={atualizando}
          onAplicar={aplicarFiltros}
          onLimpar={limparFiltros}
        />

        <ListaEventos
          eventos={eventos}
          meta={meta}
          atualizando={atualizando}
          onAbrir={abrirDetalhe}
          onMudarPagina={mudarPagina}
        />
      </main>

      <ModalEvento
        eventoSelecionado={eventoSelecionado}
        carregandoDetalhe={carregandoDetalhe}
        onFechar={() => setEventoSelecionado(null)}
      />

      <Footer />
    </div>
  );
}
