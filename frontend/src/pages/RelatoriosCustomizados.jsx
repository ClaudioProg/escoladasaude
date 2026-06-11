// ✅ frontend/src/pages/RelatoriosCustomizados.jsx — v3.0
// Atualizado em: 11/06/2026
// Plataforma Escola da Saúde
//
// Dashboard institucional de alto nível.
//
// Revisão v3.0:
// - transforma a tela em painel institucional único;
// - consome GET /api/relatorio/institucional;
// - separa indicadores gerais da plataforma e indicadores filtrados;
// - mantém HeaderHero limpo;
// - filtros oficiais aplicados somente ao clicar em "Aplicar filtros";
// - cards gerais não mudam com filtro;
// - cards filtrados, gráficos e tabelas mudam conforme filtro;
// - exportação XLSX institucional;
// - exportação PDF institucional visual;
// - sem abas antigas por tipo de relatório;
// - sem endpoint legado;
// - mobile-first, institucional, acessível e premium.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileBadge2,
  FileSpreadsheet,
  Filter,
  Gauge,
  HeartPulse,
  Loader2,
  PieChart,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import CarregandoSkeleton from "../components/ui/CarregandoSkeleton";
import ErroCarregamento from "../components/ui/ErroCarregamento";
import NadaEncontrado from "../components/ui/NadaEncontrado";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from "../components/ui/AppToast";
import { api } from "../services/api";

/* ─────────────────────────────────────────────
 * Contrato esperado no api.js
 * ─────────────────────────────────────────────
 *
 * api.relatorio.institucional(params?)
 * api.relatorio.exportarXlsx("institucional", params?)
 * api.relatorio.exportarPdf("institucional", params?)
 *
 * Rotas backend:
 * GET /api/relatorio/institucional
 * GET /api/relatorio/exportar/institucional.xlsx
 * GET /api/relatorio/exportar/institucional.pdf
 */

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isYMD(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function hojeYMD() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function primeiroDiaAnoYMD() {
  return `${new Date().getFullYear()}-01-01`;
}

function toPositiveIntOrEmpty(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const number = Number(text);

  return Number.isInteger(number) && number > 0 ? String(number) : "";
}

function normalizarBusca(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarNumero(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return new Intl.NumberFormat("pt-BR").format(number);
}

function formatarPercentual(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number)}%`;
}

function formatarDataBR(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "—";
  }

  const ymd = text.slice(0, 10);

  if (!isYMD(ymd)) {
    return text;
  }

  const [ano, mes, dia] = ymd.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHoraBR(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "—";
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleString("pt-BR");
}

function extrairPayload(response) {
  const base = response?.data ?? response ?? null;

  if (isObject(base) && Object.prototype.hasOwnProperty.call(base, "data")) {
    return base.data;
  }

  return base;
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

function validarFacade(nome, fn) {
  if (typeof fn !== "function") {
    throw new Error(`Facade ausente no api.js: ${nome}.`);
  }
}

function montarParamsOficiais(filtros) {
  const params = {};

  if (isYMD(filtros.data_inicio)) {
    params.data_inicio = filtros.data_inicio;
  }
  if (isYMD(filtros.data_fim)) {
    params.data_fim = filtros.data_fim;
  }

  const eventoId = toPositiveIntOrEmpty(filtros.evento_id);
  const turmaId = toPositiveIntOrEmpty(filtros.turma_id);
  const organizadorId = toPositiveIntOrEmpty(filtros.organizador_id);
  const usuarioId = toPositiveIntOrEmpty(filtros.usuario_id);
  const unidadeId = toPositiveIntOrEmpty(filtros.unidade_id);

  if (eventoId) {
    params.evento_id = eventoId;
  }
  if (turmaId) {
    params.turma_id = turmaId;
  }
  if (organizadorId) {
    params.organizador_id = organizadorId;
  }
  if (usuarioId) {
    params.usuario_id = usuarioId;
  }
  if (unidadeId) {
    params.unidade_id = unidadeId;
  }

  if (filtros.status) {
    params.status = filtros.status;
  }

  return params;
}

function downloadBlob(filename, blob) {
  if (!(blob instanceof Blob)) {
    throw new Error("Arquivo de exportação inválido.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename || "relatorio";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function inferirNomeArquivo(result, fallback) {
  return result?.filename || result?.nome_arquivo || fallback;
}

function filtrarEventosPorBusca(eventos, busca) {
  const q = normalizarBusca(busca);

  if (!q) {
    return eventos;
  }

  return eventos.filter((row) => {
    return Object.values(row || {}).some((value) => {
      if (value === null || value === undefined) {
        return false;
      }

      return normalizarBusca(value).includes(q);
    });
  });
}

function limitarTexto(value, max = 72) {
  const text = String(value || "—");

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max - 1)}…`;
}

function statusLabel(value) {
  const status = String(value || "").toLowerCase();

  const labels = {
    programado: "Programado",
    andamento: "Em andamento",
    encerrado: "Encerrado",
  };

  return labels[status] || value || "—";
}

function statusTone(value) {
  const status = String(value || "").toLowerCase();

  if (status === "programado") {
    return "emerald";
  }
  if (status === "andamento") {
    return "amber";
  }
  if (status === "encerrado") {
    return "rose";
  }

  return "slate";
}

function getSeveridadeTone(value) {
  const severidade = String(value || "").toLowerCase();

  if (severidade === "critico") {
    return "rose";
  }
  if (severidade === "alerta") {
    return "amber";
  }
  if (severidade === "info") {
    return "cyan";
  }

  return "emerald";
}

/* ─────────────────────────────────────────────
 * UI base
 * ───────────────────────────────────────────── */

function Badge({ tone = "slate", children }) {
  const tones = {
    slate:
      "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700",
    emerald:
      "bg-emerald-50 text-emerald-800 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800/60",
    amber:
      "bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800/60",
    rose: "bg-rose-50 text-rose-800 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-800/60",
    cyan: "bg-cyan-50 text-cyan-800 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-100 dark:ring-cyan-800/60",
    violet:
      "bg-violet-50 text-violet-800 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-100 dark:ring-violet-800/60",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ring-1",
        tones[tone] || tones.slate,
      )}
    >
      {children}
    </span>
  );
}

function ActionButton({
  type = "button",
  children,
  onClick,
  disabled,
  tone = "primary",
  title,
}) {
  const tones = {
    primary:
      "bg-slate-950 text-white hover:bg-slate-800 focus-visible:ring-slate-500 dark:bg-white dark:text-slate-950 dark:hover:bg-zinc-200",
    violet:
      "bg-violet-700 text-white hover:bg-violet-800 focus-visible:ring-violet-500",
    emerald:
      "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-500",
    rose: "bg-rose-700 text-white hover:bg-rose-800 focus-visible:ring-rose-500",
    ghost:
      "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 focus-visible:ring-violet-500 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800 dark:hover:bg-zinc-800",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-black shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-zinc-950",
        tones[tone] || tones.primary,
      )}
    >
      {children}
    </button>
  );
}

function SectionCard({ title, subtitle, icon: Icon, badge, children }) {
  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85 dark:shadow-black/20 dark:ring-zinc-800 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon ? (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            ) : null}

            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-950 dark:text-white">
                {title}
              </h2>

              {subtitle ? (
                <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>

      {children}
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  description,
  tone = "violet",
  emphasis = false,
}) {
  const tones = {
    violet:
      "border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/25 dark:text-violet-100",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100",
    amber:
      "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100",
    rose: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/25 dark:text-rose-100",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-900/50 dark:bg-cyan-950/25 dark:text-cyan-100",
    slate:
      "border-slate-200 bg-slate-50 text-slate-950 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100",
  };

  return (
    <article
      className={cx(
        "rounded-[1.75rem] border p-4 shadow-sm ring-1 ring-black/5 transition dark:ring-white/10",
        "hover:-translate-y-0.5 hover:shadow-lg",
        tones[tone] || tones.violet,
        emphasis && "outline outline-2 outline-offset-2 outline-violet-400",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/75 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] opacity-70">
            {label}
          </p>

          <p className="mt-1 text-3xl font-black leading-none tracking-tight">
            {value}
          </p>

          {description ? (
            <p className="mt-1 text-xs font-semibold opacity-75">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────
 * Filtros
 * ───────────────────────────────────────────── */

function CampoData({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-700 dark:text-zinc-200">
        {label}
      </span>

      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-700 focus:ring-4 focus:ring-violet-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:ring-violet-950"
      />
    </label>
  );
}

function CampoNumero({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-700 dark:text-zinc-200">
        {label}
      </span>

      <input
        type="text"
        inputMode="numeric"
        value={value}
        placeholder={placeholder || "Opcional"}
        onChange={(event) => onChange(toPositiveIntOrEmpty(event.target.value))}
        className="min-h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-700 focus:ring-4 focus:ring-violet-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:ring-violet-950"
      />
    </label>
  );
}

function CampoStatus({ value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-700 dark:text-zinc-200">
        Status da turma
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-700 focus:ring-4 focus:ring-violet-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:ring-violet-950"
      >
        <option value="">Todos</option>
        <option value="programado">Programado</option>
        <option value="andamento">Em andamento</option>
        <option value="encerrado">Encerrado</option>
      </select>
    </label>
  );
}

function FiltrosInstitucionais({
  filtros,
  setFiltros,
  busca,
  setBusca,
  carregando,
  exportando,
  onAplicar,
  onLimpar,
  onExportarXlsx,
  onExportarPdf,
}) {
  return (
    <SectionCard
      title="Filtros institucionais"
      subtitle="Os indicadores filtrados, gráficos e tabelas mudam somente após aplicar os filtros."
      icon={Filter}
      badge={
        <Badge tone="violet">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Contrato v3.0
        </Badge>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-8">
        <div className="xl:col-span-2">
          <CampoData
            label="Data início"
            value={filtros.data_inicio}
            onChange={(value) =>
              setFiltros((prev) => ({ ...prev, data_inicio: value }))
            }
          />
        </div>

        <div className="xl:col-span-2">
          <CampoData
            label="Data fim"
            value={filtros.data_fim}
            onChange={(value) =>
              setFiltros((prev) => ({ ...prev, data_fim: value }))
            }
          />
        </div>

        <CampoNumero
          label="Evento ID"
          value={filtros.evento_id}
          onChange={(value) =>
            setFiltros((prev) => ({ ...prev, evento_id: value }))
          }
        />

        <CampoNumero
          label="Turma ID"
          value={filtros.turma_id}
          onChange={(value) =>
            setFiltros((prev) => ({ ...prev, turma_id: value }))
          }
        />

        <CampoNumero
          label="Organizador ID"
          value={filtros.organizador_id}
          onChange={(value) =>
            setFiltros((prev) => ({ ...prev, organizador_id: value }))
          }
        />

        <CampoNumero
          label="Usuário ID"
          value={filtros.usuario_id}
          onChange={(value) =>
            setFiltros((prev) => ({ ...prev, usuario_id: value }))
          }
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[180px_1fr]">
        <CampoStatus
          value={filtros.status}
          onChange={(value) =>
            setFiltros((prev) => ({ ...prev, status: value }))
          }
        />

        <div className="relative">
          <span className="mb-1 block text-xs font-black text-slate-700 dark:text-zinc-200">
            Buscar na tabela carregada
          </span>

          <Search
            className="pointer-events-none absolute left-3 top-[35px] h-4 w-4 text-slate-400"
            aria-hidden="true"
          />

          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por evento, ID, data ou qualquer campo da tabela..."
            className="min-h-11 w-full rounded-2xl border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-700 focus:ring-4 focus:ring-violet-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:ring-violet-950"
          />

          {busca ? (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="absolute right-2 top-[31px] grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            tone="violet"
            onClick={onAplicar}
            disabled={carregando || exportando}
          >
            {carregando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            )}
            Aplicar filtros
          </ActionButton>

          <ActionButton
            tone="ghost"
            onClick={onLimpar}
            disabled={carregando || exportando}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Limpar
          </ActionButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            tone="emerald"
            onClick={onExportarXlsx}
            disabled={carregando || exportando}
          >
            {exportando === "xlsx" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            )}
            Exportar XLSX
          </ActionButton>

          <ActionButton
            tone="primary"
            onClick={onExportarPdf}
            disabled={carregando || exportando}
          >
            {exportando === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Exportar PDF institucional
          </ActionButton>
        </div>
      </div>
    </SectionCard>
  );
}

/* ─────────────────────────────────────────────
 * Blocos institucionais
 * ───────────────────────────────────────────── */

function CardsGerais({ geral, carregando }) {
  return (
    <SectionCard
      title="1. Visão geral da plataforma"
      subtitle="Totais históricos da plataforma. Este bloco não muda com os filtros."
      icon={BarChart3}
      badge={
        <Badge tone="slate">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Geral
        </Badge>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label="Eventos"
          value={carregando ? "..." : formatarNumero(geral.eventos_total)}
          description="eventos cadastrados"
          tone="cyan"
        />

        <StatCard
          icon={UsersRound}
          label="Inscrições"
          value={carregando ? "..." : formatarNumero(geral.inscricoes_total)}
          description="inscrições totais"
          tone="violet"
        />

        <StatCard
          icon={CheckCircle2}
          label="Presenças"
          value={carregando ? "..." : formatarNumero(geral.presencas_total)}
          description="presenças confirmadas"
          tone="emerald"
        />

        <StatCard
          icon={ClipboardCheck}
          label="Avaliações"
          value={carregando ? "..." : formatarNumero(geral.avaliacoes_total)}
          description="avaliações realizadas"
          tone="amber"
        />

        <StatCard
          icon={FileBadge2}
          label="Certificados"
          value={
            carregando
              ? "..."
              : formatarNumero(geral.certificados_validos_total)
          }
          description="regulares emitidos/enviados"
          tone="emerald"
        />

        <StatCard
          icon={FileBadge2}
          label="Certificados avulsos"
          value={
            carregando
              ? "..."
              : formatarNumero(geral.certificados_avulsos_validos_total)
          }
          description="avulsos emitidos/enviados"
          tone="cyan"
        />

        <StatCard
          icon={UsersRound}
          label="Usuários"
          value={carregando ? "..." : formatarNumero(geral.usuarios_total)}
          description="usuários cadastrados"
          tone="rose"
        />

        <StatCard
          icon={Activity}
          label="Reservas"
          value={carregando ? "..." : formatarNumero(geral.reservas_total)}
          description="reservas de sala"
          tone="slate"
        />
      </div>
    </SectionCard>
  );
}

function CardsFiltrados({ filtrado, carregando, periodo }) {
  return (
    <SectionCard
      title="2. Indicadores filtrados"
      subtitle="Este bloco muda conforme período, evento, turma, organizador, usuário e status."
      icon={Gauge}
      badge={
        <Badge tone="violet">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {periodo || "Período aplicado"}
        </Badge>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label="Eventos"
          value={carregando ? "..." : formatarNumero(filtrado.eventos)}
          description="eventos no filtro"
          tone="cyan"
        />

        <StatCard
          icon={BarChart3}
          label="Turmas"
          value={carregando ? "..." : formatarNumero(filtrado.turmas)}
          description="turmas no filtro"
          tone="slate"
        />

        <StatCard
          icon={UsersRound}
          label="Inscrições"
          value={carregando ? "..." : formatarNumero(filtrado.inscricoes)}
          description="inscrições no filtro"
          tone="violet"
          emphasis
        />

        <StatCard
          icon={CheckCircle2}
          label="Presenças"
          value={carregando ? "..." : formatarNumero(filtrado.presencas)}
          description={formatarPercentual(filtrado.taxa_presenca)}
          tone="emerald"
        />

        <StatCard
          icon={ClipboardCheck}
          label="Avaliações"
          value={carregando ? "..." : formatarNumero(filtrado.avaliacoes)}
          description={formatarPercentual(filtrado.taxa_avaliacao)}
          tone="amber"
        />

        <StatCard
          icon={FileBadge2}
          label="Certificados"
          value={carregando ? "..." : formatarNumero(filtrado.certificados)}
          description={formatarPercentual(filtrado.taxa_certificacao)}
          tone="emerald"
        />

        <StatCard
          icon={UsersRound}
          label="Usuários envolvidos"
          value={
            carregando ? "..." : formatarNumero(filtrado.usuarios_envolvidos)
          }
          description="participantes únicos"
          tone="rose"
        />

        <StatCard
          icon={AlertTriangle}
          label="Ausências registradas"
          value={
            carregando ? "..." : formatarNumero(filtrado.ausencias_registradas)
          }
          description="faltas registradas"
          tone="rose"
        />
      </div>
    </SectionCard>
  );
}

/* ─────────────────────────────────────────────
 * Gráficos sem dependência externa
 * ───────────────────────────────────────────── */

function BarraHorizontal({ label, value, max, tone = "violet", extra }) {
  const safeMax = Math.max(Number(max || 0), 1);
  const safeValue = Math.max(Number(value || 0), 0);
  const percent = Math.min(100, Math.round((safeValue / safeMax) * 100));

  const tones = {
    violet: "bg-violet-600",
    emerald: "bg-emerald-600",
    amber: "bg-amber-500",
    rose: "bg-rose-600",
    cyan: "bg-cyan-600",
    slate: "bg-slate-600",
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-black text-slate-700 dark:text-zinc-200">
          {label}
        </p>

        <p className="shrink-0 text-xs font-black text-slate-500 dark:text-zinc-400">
          {formatarNumero(value)}
        </p>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-zinc-700">
        <div
          className={cx(
            "h-full rounded-full transition-all duration-500",
            tones[tone] || tones.violet,
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {extra ? (
        <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
          {extra}
        </p>
      ) : null}
    </div>
  );
}

function GraficoEvolucaoMensal({ dados }) {
  const rows = Array.isArray(dados) ? dados : [];
  const max = Math.max(...rows.map((item) => Number(item.inscricoes || 0)), 1);

  return (
    <SectionCard
      title="3. Evolução mensal"
      subtitle="Comparativo por mês dentro do período filtrado."
      icon={TrendingUp}
    >
      {rows.length ? (
        <div className="space-y-4">
          {rows.slice(0, 12).map((item) => (
            <BarraHorizontal
              key={item.mes}
              label={item.mes}
              value={item.inscricoes}
              max={max}
              tone="violet"
              extra={`Eventos: ${formatarNumero(
                item.eventos,
              )} • Presenças: ${formatarNumero(
                item.presencas,
              )} • Avaliações: ${formatarNumero(
                item.avaliacoes,
              )} • Certificados: ${formatarNumero(item.certificados)}`}
            />
          ))}
        </div>
      ) : (
        <NadaEncontrado
          titulo="Sem evolução mensal"
          subtitulo="Não há dados mensais para os filtros aplicados."
        />
      )}
    </SectionCard>
  );
}

function DistribuicaoStatus({ dados }) {
  const rows = Array.isArray(dados) ? dados : [];
  const total = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const max = Math.max(...rows.map((item) => Number(item.total || 0)), 1);

  return (
    <SectionCard
      title="4. Distribuição por status"
      subtitle="Situação das turmas no filtro aplicado."
      icon={PieChart}
    >
      {rows.length ? (
        <div className="space-y-4">
          {rows.map((item) => (
            <BarraHorizontal
              key={item.status}
              label={statusLabel(item.status)}
              value={item.total}
              max={max}
              tone={statusTone(item.status)}
              extra={`${formatarPercentual(
                total > 0 ? (Number(item.total || 0) / total) * 100 : 0,
              )} do total filtrado`}
            />
          ))}
        </div>
      ) : (
        <NadaEncontrado
          titulo="Sem distribuição por status"
          subtitulo="Não há turmas para distribuir nos filtros aplicados."
        />
      )}
    </SectionCard>
  );
}

function TopEventos({ dados }) {
  const rows = Array.isArray(dados) ? dados : [];
  const max = Math.max(...rows.map((item) => Number(item.inscricoes || 0)), 1);

  return (
    <SectionCard
      title="5. Top eventos"
      subtitle="Eventos com maior volume de inscrições no filtro aplicado."
      icon={BarChart3}
    >
      {rows.length ? (
        <div className="space-y-4">
          {rows.slice(0, 10).map((item) => (
            <BarraHorizontal
              key={item.evento_id || item.evento}
              label={limitarTexto(item.evento, 80)}
              value={item.inscricoes}
              max={max}
              tone="emerald"
              extra={`Turmas: ${formatarNumero(
                item.turmas,
              )} • Presenças: ${formatarNumero(
                item.presencas,
              )} • Avaliações: ${formatarNumero(
                item.avaliacoes,
              )} • Certificados: ${formatarNumero(item.certificados)}`}
            />
          ))}
        </div>
      ) : (
        <NadaEncontrado
          titulo="Sem ranking de eventos"
          subtitulo="Nenhum evento foi encontrado para os filtros aplicados."
        />
      )}
    </SectionCard>
  );
}

/* ─────────────────────────────────────────────
 * Tabelas
 * ───────────────────────────────────────────── */

function TabelaEventosResumo({ eventos, busca }) {
  const rows = useMemo(
    () => filtrarEventosPorBusca(Array.isArray(eventos) ? eventos : [], busca),
    [busca, eventos],
  );

  return (
    <SectionCard
      title="6. Tabela-resumo de eventos"
      subtitle="Resumo operacional dos eventos dentro do filtro aplicado."
      icon={FileSpreadsheet}
      badge={
        <Badge tone="slate">
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          {formatarNumero(rows.length)} registro(s)
        </Badge>
      }
    >
      {rows.length ? (
        <>
          <div className="hidden overflow-hidden rounded-3xl border border-slate-200 dark:border-zinc-800 lg:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-zinc-800">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-zinc-950 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3 text-right">Turmas</th>
                  <th className="px-4 py-3 text-right">Inscrições</th>
                  <th className="px-4 py-3 text-right">Presenças</th>
                  <th className="px-4 py-3 text-right">Avaliações</th>
                  <th className="px-4 py-3 text-right">Certificados</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                {rows.map((row) => (
                  <tr
                    key={row.evento_id || row.evento}
                    className="transition hover:bg-slate-50 dark:hover:bg-zinc-800/70"
                  >
                    <td className="max-w-md px-4 py-3">
                      <p className="font-black text-slate-950 dark:text-white">
                        {row.evento || "—"}
                      </p>
                      <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                        ID: {row.evento_id || "—"}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-slate-600 dark:text-zinc-300">
                      {formatarDataBR(row.primeira_data)} até{" "}
                      {formatarDataBR(row.ultima_data)}
                    </td>

                    <td className="px-4 py-3 text-right font-black">
                      {formatarNumero(row.turmas)}
                    </td>

                    <td className="px-4 py-3 text-right font-black">
                      {formatarNumero(row.inscricoes)}
                    </td>

                    <td className="px-4 py-3 text-right font-black text-emerald-700 dark:text-emerald-300">
                      {formatarNumero(row.presencas)}
                    </td>

                    <td className="px-4 py-3 text-right font-black text-amber-700 dark:text-amber-300">
                      {formatarNumero(row.avaliacoes)}
                    </td>

                    <td className="px-4 py-3 text-right font-black text-violet-700 dark:text-violet-300">
                      {formatarNumero(row.certificados)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {rows.map((row) => (
              <article
                key={row.evento_id || row.evento}
                className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-black text-slate-950 dark:text-white">
                      {row.evento || "—"}
                    </p>

                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                      ID: {row.evento_id || "—"} •{" "}
                      {formatarDataBR(row.primeira_data)} até{" "}
                      {formatarDataBR(row.ultima_data)}
                    </p>
                  </div>

                  <Badge tone="cyan">
                    {formatarNumero(row.turmas)} turma(s)
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MiniIndicador label="Inscrições" value={row.inscricoes} />
                  <MiniIndicador label="Presenças" value={row.presencas} />
                  <MiniIndicador label="Avaliações" value={row.avaliacoes} />
                  <MiniIndicador
                    label="Certificados"
                    value={row.certificados}
                  />
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <NadaEncontrado
          titulo="Nenhum evento encontrado"
          subtitulo={
            busca
              ? "Nenhum registro carregado corresponde à busca informada."
              : "Aplique outros filtros para visualizar eventos."
          }
        />
      )}
    </SectionCard>
  );
}

function MiniIndicador({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-zinc-400">
        {label}
      </p>

      <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
        {formatarNumero(value)}
      </p>
    </div>
  );
}

function PainelSaude({ dados }) {
  const rows = Array.isArray(dados) ? dados : [];
  const alertas = rows.filter((row) =>
    ["critico", "alerta"].includes(String(row?.severidade || "").toLowerCase()),
  );

  return (
    <SectionCard
      title="7. Saúde institucional da plataforma"
      subtitle="Diagnósticos administrativos relevantes para acompanhamento."
      icon={HeartPulse}
      badge={
        <Badge tone={alertas.length > 0 ? "rose" : "emerald"}>
          <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
          {alertas.length > 0
            ? `${formatarNumero(alertas.length)} alerta(s)`
            : "Sem alertas críticos"}
        </Badge>
      }
    >
      {rows.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <article
              key={`${row.categoria}-${row.item}`}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950 dark:text-white">
                    {row.item || "Diagnóstico"}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    {row.categoria || "—"}
                  </p>
                </div>

                <Badge tone={getSeveridadeTone(row.severidade)}>
                  {row.severidade || "ok"}
                </Badge>
              </div>

              <p className="mt-4 text-2xl font-black text-slate-950 dark:text-white">
                {formatarNumero(row.total)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <NadaEncontrado
          titulo="Sem dados de saúde"
          subtitulo="Não há diagnósticos disponíveis no momento."
        />
      )}
    </SectionCard>
  );
}

/* ─────────────────────────────────────────────
 * Página
 * ───────────────────────────────────────────── */

export default function RelatoriosCustomizados() {
  const prefersReducedMotion = useReducedMotion();

  const [dashboard, setDashboard] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [exportando, setExportando] = useState("");

  const [filtros, setFiltros] = useState(() => ({
    data_inicio: primeiroDiaAnoYMD(),
    data_fim: hojeYMD(),
    evento_id: "",
    turma_id: "",
    organizador_id: "",
    usuario_id: "",
    unidade_id: "",
    status: "",
  }));

  const [filtrosAplicados, setFiltrosAplicados] = useState(() => ({
    data_inicio: primeiroDiaAnoYMD(),
    data_fim: hojeYMD(),
    evento_id: "",
    turma_id: "",
    organizador_id: "",
    usuario_id: "",
    unidade_id: "",
    status: "",
  }));

  const [busca, setBusca] = useState("");

  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  const liveRef = useRef(null);

  const setLive = useCallback((message) => {
    if (liveRef.current) {
      liveRef.current.textContent = message || "";
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    document.title = "Relatórios Institucionais — Escola da Saúde";
  }, []);

  const paramsAplicados = useMemo(
    () => montarParamsOficiais(filtrosAplicados),
    [filtrosAplicados],
  );

  const carregarDashboard = useCallback(
    async (params = paramsAplicados) => {
      const reqId = ++requestSeqRef.current;

      try {
        validarFacade(
          "api.relatorio.institucional",
          api?.relatorio?.institucional,
        );

        setCarregando(true);
        setErro("");
        setLive("Carregando relatório institucional...");

        const response = await api.relatorio.institucional(params);
        const payload = extrairPayload(response);

        if (!mountedRef.current || reqId !== requestSeqRef.current) {
          return;
        }

        setDashboard(isObject(payload) ? payload : null);
        setLive("Relatório institucional carregado.");
      } catch (error) {
        if (!mountedRef.current || reqId !== requestSeqRef.current) {
          return;
        }

        const message = obterMensagemErro(
          error,
          "Não foi possível carregar o relatório institucional.",
        );

        setDashboard(null);
        setErro(message);
        setLive("Falha ao carregar relatório institucional.");
        notifyError(message);
      } finally {
        if (mountedRef.current && reqId === requestSeqRef.current) {
          setCarregando(false);
        }
      }
    },
    [paramsAplicados, setLive],
  );

  useEffect(() => {
    carregarDashboard(paramsAplicados);
  }, [carregarDashboard, paramsAplicados]);

  const aplicarFiltros = useCallback(() => {
    if (
      filtros.data_inicio &&
      filtros.data_fim &&
      filtros.data_inicio > filtros.data_fim
    ) {
      notifyWarning(
        "A data inicial é maior que a data final. Inverta o período antes de aplicar.",
      );
      return;
    }

    setBusca("");
    setFiltrosAplicados({ ...filtros });
    notifyInfo("Filtros aplicados ao relatório institucional.");
  }, [filtros]);

  const limparFiltros = useCallback(() => {
    const reset = {
      data_inicio: primeiroDiaAnoYMD(),
      data_fim: hojeYMD(),
      evento_id: "",
      turma_id: "",
      organizador_id: "",
      usuario_id: "",
      unidade_id: "",
      status: "",
    };

    setBusca("");
    setFiltros(reset);
    setFiltrosAplicados(reset);
    notifyInfo("Filtros redefinidos.");
  }, []);

  const exportarXlsx = useCallback(async () => {
    try {
      validarFacade("api.relatorio.exportarXlsx", api?.relatorio?.exportarXlsx);

      setExportando("xlsx");

      const result = await api.relatorio.exportarXlsx(
        "institucional",
        paramsAplicados,
      );

      const filename = inferirNomeArquivo(
        result,
        `relatorio_institucional_${hojeYMD()}.xlsx`,
      );

      downloadBlob(filename, result.blob);

      notifySuccess("XLSX institucional exportado com sucesso.");
    } catch (error) {
      const message = obterMensagemErro(
        error,
        "Não foi possível exportar o XLSX institucional.",
      );

      notifyError(message);
    } finally {
      setExportando("");
    }
  }, [paramsAplicados]);

  const exportarPdf = useCallback(async () => {
    try {
      validarFacade("api.relatorio.exportarPdf", api?.relatorio?.exportarPdf);

      setExportando("pdf");

      const result = await api.relatorio.exportarPdf(
        "institucional",
        paramsAplicados,
      );

      const filename = inferirNomeArquivo(
        result,
        `relatorio_institucional_${hojeYMD()}.pdf`,
      );

      downloadBlob(filename, result.blob);

      notifySuccess("PDF institucional exportado com sucesso.");
    } catch (error) {
      const message = obterMensagemErro(
        error,
        "Não foi possível exportar o PDF institucional.",
      );

      notifyError(message);
    } finally {
      setExportando("");
    }
  }, [paramsAplicados]);

  const geral = dashboard?.geral || {};
  const filtrado = dashboard?.filtrado || {};
  const series = dashboard?.series || {};
  const tabelas = dashboard?.tabelas || {};
  const periodo = dashboard?.periodo || "Período aplicado";

  const totalEventosTabela = Array.isArray(tabelas.eventos)
    ? tabelas.eventos.length
    : 0;

  const pageMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.22 },
      };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-950 dark:from-zinc-950 dark:via-zinc-950 dark:to-black dark:text-white">
      <p
        ref={liveRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />

      <HeaderHero
        titulo="Relatórios Institucionais"
        subtitulo="Dashboard executivo da Plataforma Escola da Saúde com indicadores gerais, filtros oficiais, gráficos, tabelas e exportações."
        icone={BarChart3}
      />

      {carregando ? (
        <div
          className="sticky top-0 z-40 h-1 w-full bg-violet-100 dark:bg-violet-950"
          role="progressbar"
          aria-label="Carregando relatório institucional"
        >
          <div className="h-full w-1/3 animate-pulse bg-violet-700 dark:bg-violet-500" />
        </div>
      ) : null}

      <main
        id="conteudo"
        className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4"
      >
        <motion.div {...pageMotion} className="space-y-6">
          <section className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85 dark:shadow-black/20 dark:ring-zinc-800 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="violet">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Painel institucional
                  </Badge>

                  <Badge tone="emerald">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Endpoint único
                  </Badge>

                  <Badge tone="slate">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatarDataBR(filtrosAplicados.data_inicio)} até{" "}
                    {formatarDataBR(filtrosAplicados.data_fim)}
                  </Badge>
                </div>

                <h1 className="mt-3 text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                  Visão executiva da Plataforma Escola da Saúde
                </h1>

                <p className="mt-1 max-w-4xl text-sm font-medium leading-6 text-slate-600 dark:text-zinc-300">
                  O primeiro bloco apresenta os totais gerais da plataforma. O
                  segundo bloco, os gráficos e as tabelas respondem aos filtros
                  aplicados, permitindo análise institucional por período,
                  evento, turma, organizador, usuário e status.
                </p>

                {dashboard?.gerado_em ? (
                  <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    Última geração: {formatarDataHoraBR(dashboard.gerado_em)}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <Badge tone="cyan">
                  <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                  XLSX
                </Badge>

                <Badge tone="violet">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  PDF visual
                </Badge>

                <Badge tone={totalEventosTabela > 0 ? "emerald" : "amber"}>
                  <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatarNumero(totalEventosTabela)} evento(s)
                </Badge>
              </div>
            </div>
          </section>

          <FiltrosInstitucionais
            filtros={filtros}
            setFiltros={setFiltros}
            busca={busca}
            setBusca={setBusca}
            carregando={carregando}
            exportando={exportando}
            onAplicar={aplicarFiltros}
            onLimpar={limparFiltros}
            onExportarXlsx={exportarXlsx}
            onExportarPdf={exportarPdf}
          />

          {erro ? (
            <ErroCarregamento
              titulo="Erro ao carregar relatório institucional"
              mensagem={erro}
              onTentarNovamente={() => carregarDashboard(paramsAplicados)}
            />
          ) : null}

          {carregando && !dashboard ? (
            <div className="space-y-4" aria-busy="true">
              <CarregandoSkeleton linhas={4} />
              <CarregandoSkeleton linhas={6} />
              <CarregandoSkeleton linhas={5} />
            </div>
          ) : dashboard ? (
            <>
              <CardsGerais geral={geral} carregando={carregando} />

              <CardsFiltrados
                filtrado={filtrado}
                carregando={carregando}
                periodo={periodo}
              />

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <GraficoEvolucaoMensal dados={series.por_mes} />
                <DistribuicaoStatus dados={series.por_status} />
              </div>

              <TopEventos dados={series.top_eventos} />

              <TabelaEventosResumo eventos={tabelas.eventos} busca={busca} />

              <PainelSaude dados={tabelas.saude} />
            </>
          ) : !carregando ? (
            <NadaEncontrado
              titulo="Nenhum dado institucional encontrado"
              subtitulo="Aplique outros filtros ou atualize o relatório."
            />
          ) : null}
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
