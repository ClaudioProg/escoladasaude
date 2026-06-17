// ✅ frontend/src/pages/AvaliacaoAdmin.jsx — v2.1
// Atualizado em: 02/06/2026
// Plataforma Escola da Saúde
//
// Tela operacional contextual para avaliações do evento.
//
// Revisão premium v2.1:
// - tela acessada somente pelo Painel do Gestor;
// - evento_id obrigatório via URL;
// - sem modo geral;
// - sem seletor/listagem geral de eventos;
// - carrega somente o evento informado;
// - HeaderHero global oficial limpo;
// - botões, contexto, badges e stats abaixo do HeaderHero;
// - preserva média oficial;
// - preserva distribuição de notas;
// - preserva ranking de melhores critérios e pontos de atenção;
// - preserva comentários qualitativos;
// - preserva busca em comentários;
// - preserva filtro entre critérios oficiais e todos os critérios;
// - preserva ordenação por maiores/menores médias;
// - preserva exportação CSV;
// - usa Footer oficial;
// - sem /api manual no frontend;
// - mobile-first, acessível, institucional e operacional.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PropTypes from "prop-types";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown01,
  ArrowLeft,
  ArrowUp01,
  BarChart3,
  ClipboardList,
  Download,
  Filter,
  Info,
  MessageSquare,
  Percent,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import CarregandoSkeleton from "../components/ui/CarregandoSkeleton";
import NadaEncontrado from "../components/ui/NadaEncontrado";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
} from "../components/ui/AppToast";
import { api } from "../services/api";

/* ─────────────────────────────────────────────
 * Contrato oficial de avaliação
 * ───────────────────────────────────────────── */

const NOTA_ENUM_OFICIAL = ["Ótimo", "Bom", "Regular", "Ruim", "Péssimo"];

const NOTA_PONTUACAO = {
  Ótimo: 10,
  Bom: 8,
  Regular: 6,
  Ruim: 4,
  Péssimo: 2,
};

const NOTA_STYLE = {
  Ótimo:
    "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800/60",
  Bom: "bg-lime-50 text-lime-800 ring-lime-200 dark:bg-lime-950/40 dark:text-lime-200 dark:ring-lime-800/60",
  Regular:
    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800/60",
  Ruim: "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-800/60",
  Péssimo:
    "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-800/60",
};

const CAMPOS_OFICIAIS_MEDIA = [
  "divulgacao_evento",
  "recepcao",
  "credenciamento",
  "material_apoio",
  "pontualidade",
  "sinalizacao_local",
  "conteudo_temas",
  "estrutura_local",
  "acessibilidade",
  "limpeza",
  "inscricao_online",
];

const CAMPOS_OBJETIVOS = [
  ...CAMPOS_OFICIAIS_MEDIA,
  "desempenho_organizador",
  "exposicao_trabalhos",
  "apresentacao_oral_mostra",
  "apresentacao_tcrs",
  "oficinas",
];

const CAMPOS_TEXTOS = [
  "gostou_mais",
  "sugestoes_melhoria",
  "comentarios_finais",
];

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function isNotaEnumOficial(value) {
  return NOTA_ENUM_OFICIAL.includes(value);
}

function criarDistribuicaoNotas() {
  return {
    Ótimo: 0,
    Bom: 0,
    Regular: 0,
    Ruim: 0,
    Péssimo: 0,
  };
}

function mediaFromDist(dist) {
  let total = 0;
  let soma = 0;

  for (const nota of NOTA_ENUM_OFICIAL) {
    const quantidade = Number(dist?.[nota] || 0);
    total += quantidade;
    soma += quantidade * NOTA_PONTUACAO[nota];
  }

  return total ? Number((soma / total).toFixed(2)) : null;
}

function extrairData(response) {
  return response?.data ?? response ?? null;
}

function limparCSV(value) {
  return String(value ?? "")
    .replaceAll(/[\r\n]+/g, " ")
    .replaceAll(/;/g, ",");
}

function baixarArquivo(nome, conteudo, mime) {
  const blob = new Blob(["\uFEFF" + conteudo], {
    type: mime || "text/plain;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = nome;
  link.rel = "noopener";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function getErrorMessage(error, fallback) {
  return (
    error?.data?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function labelDoCampo(campo) {
  return (
    {
      divulgacao_evento: "Divulgação do evento",
      recepcao: "Recepção",
      credenciamento: "Credenciamento",
      material_apoio: "Material de apoio",
      pontualidade: "Pontualidade",
      sinalizacao_local: "Sinalização do local",
      conteudo_temas: "Conteúdo e temas",
      desempenho_organizador: "Desempenho do organizador",
      estrutura_local: "Estrutura do local",
      acessibilidade: "Acessibilidade",
      limpeza: "Limpeza",
      inscricao_online: "Inscrição on-line",
      exposicao_trabalhos: "Exposição de trabalhos",
      apresentacao_oral_mostra: "Apresentação oral/mostra",
      apresentacao_tcrs: "Apresentação TCRs",
      oficinas: "Oficinas",
      gostou_mais: "O que mais gostou",
      sugestoes_melhoria: "Sugestões de melhoria",
      comentarios_finais: "Comentários finais",
    }[campo] ||
    campo.replace(/_/g, " ").replace(/\b\w/g, (letra) => letra.toUpperCase())
  );
}

function normalizarEventos(response) {
  const lista = Array.isArray(response) ? response : [];

  return lista.map((evento) => ({
    id: toPositiveInt(evento.id),
    titulo: evento.titulo || "Evento",
    data_inicio: evento.data_inicio || evento.di || null,
    data_fim: evento.data_fim || evento.df || null,
    total_respostas: Number(evento.total_respostas || 0),
  }));
}

function normalizarPayloadEvento(payload) {
  const respostas = Array.isArray(payload?.respostas) ? payload.respostas : [];
  const turmas = Array.isArray(payload?.turmas) ? payload.turmas : [];

  if (payload?.agregados) {
    return {
      respostas,
      turmas,
      agregados: normalizarAgregados(payload.agregados, respostas),
    };
  }

  return {
    respostas,
    turmas,
    agregados: agregarRespostas(respostas),
  };
}

function normalizarAgregados(agregados, respostas) {
  const dist = {};
  const medias = {};
  const textos = {};

  for (const campo of CAMPOS_OBJETIVOS) {
    const distOriginal = agregados?.dist?.[campo];

    if (
      distOriginal &&
      NOTA_ENUM_OFICIAL.some((nota) => nota in distOriginal)
    ) {
      dist[campo] = {
        Ótimo: Number(distOriginal["Ótimo"] || 0),
        Bom: Number(distOriginal.Bom || 0),
        Regular: Number(distOriginal.Regular || 0),
        Ruim: Number(distOriginal.Ruim || 0),
        Péssimo: Number(distOriginal["Péssimo"] || 0),
      };
    } else {
      dist[campo] = criarDistribuicaoNotas();

      for (const resposta of respostas) {
        const nota = resposta?.[campo];

        if (isNotaEnumOficial(nota)) {
          dist[campo][nota] += 1;
        }
      }
    }

    const mediaBackend = agregados?.medias?.[campo];

    medias[campo] =
      mediaBackend != null && Number.isFinite(Number(mediaBackend))
        ? Number(mediaBackend)
        : mediaFromDist(dist[campo]);
  }

  for (const campo of CAMPOS_TEXTOS) {
    const textosBackend = agregados?.textos?.[campo];

    textos[campo] = Array.isArray(textosBackend)
      ? textosBackend.filter(
          (texto) => typeof texto === "string" && texto.trim(),
        )
      : respostas
          .map((resposta) => resposta?.[campo])
          .filter((texto) => typeof texto === "string" && texto.trim())
          .map((texto) => texto.trim());
  }

  const mediaOficial =
    agregados?.mediaOficial != null &&
    Number.isFinite(Number(agregados.mediaOficial))
      ? Number(agregados.mediaOficial)
      : calcularMediaOficial(medias);

  return {
    total: Number(agregados?.total ?? respostas.length),
    dist,
    medias,
    textos,
    mediaOficial,
  };
}

function agregarRespostas(respostas) {
  const dist = {};
  const medias = {};
  const textos = {};

  for (const campo of CAMPOS_OBJETIVOS) {
    dist[campo] = criarDistribuicaoNotas();
  }

  for (const resposta of respostas) {
    for (const campo of CAMPOS_OBJETIVOS) {
      const nota = resposta?.[campo];

      if (isNotaEnumOficial(nota)) {
        dist[campo][nota] += 1;
      }
    }
  }

  for (const campo of CAMPOS_OBJETIVOS) {
    medias[campo] = mediaFromDist(dist[campo]);
  }

  for (const campo of CAMPOS_TEXTOS) {
    textos[campo] = respostas
      .map((resposta) => resposta?.[campo])
      .filter((texto) => typeof texto === "string" && texto.trim().length > 0)
      .map((texto) => texto.trim());
  }

  return {
    total: respostas.length,
    dist,
    medias,
    textos,
    mediaOficial: calcularMediaOficial(medias),
  };
}

function calcularMediaOficial(medias) {
  const valores = CAMPOS_OFICIAIS_MEDIA.map((campo) => medias?.[campo]).filter(
    (value) => Number.isFinite(value),
  );

  return valores.length
    ? Number(
        (
          valores.reduce((acc, value) => acc + value, 0) / valores.length
        ).toFixed(2),
      )
    : null;
}

function classificarMedia(media) {
  if (media == null) {
    return "Sem dados";
  }
  if (media >= 9) {
    return "Excelente";
  }
  if (media >= 8) {
    return "Muito bom";
  }
  if (media >= 6) {
    return "Regular";
  }
  if (media >= 4) {
    return "Atenção";
  }
  return "Crítico";
}

function ordenarCampos(campos, medias, ordem) {
  return campos
    .map((campo) => ({
      campo,
      nome: labelDoCampo(campo),
      media: medias?.[campo] ?? null,
    }))
    .sort((a, b) => {
      if (a.media == null && b.media == null) {
        return 0;
      }
      if (a.media == null) {
        return 1;
      }
      if (b.media == null) {
        return -1;
      }

      return ordem === "desc" ? b.media - a.media : a.media - b.media;
    });
}

function obterTopCriterios(campos, medias, modo = "melhores") {
  return campos
    .map((campo) => ({
      campo,
      nome: labelDoCampo(campo),
      media: medias?.[campo] ?? null,
    }))
    .filter((item) => item.media != null)
    .sort((a, b) =>
      modo === "melhores" ? b.media - a.media : a.media - b.media,
    )
    .slice(0, 4);
}

function sanitizeFileName(value) {
  return String(value || "evento")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

/* ─────────────────────────────────────────────
 * Componentes locais
 * ───────────────────────────────────────────── */

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
    violet:
      "border-violet-700 bg-violet-700 text-white hover:bg-violet-800 dark:border-violet-600",
    slate:
      "border-slate-900 bg-slate-950 text-white hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-950 dark:hover:bg-zinc-200",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60",
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

function MetricCard({ icon: Icon, label, value, hint, tone = "violet" }) {
  const tones = {
    violet:
      "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/25 dark:text-violet-100",
    fuchsia:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/25 dark:text-fuchsia-100",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100",
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100",
    sky: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-100",
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
              tones[tone] || tones.violet,
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
            carregar as avaliações do evento específico.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton onClick={onVoltar} tone="violet">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar ao Painel do Gestor
            </ActionButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function ControlePainel({
  somenteOficiais,
  setSomenteOficiais,
  ordenar,
  setOrdenar,
  onExportar,
  exportDisabled,
}) {
  return (
    <section
      className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5"
      aria-label="Controles da avaliação"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-zinc-400">
            Critérios e exportação
          </p>

          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
            Ajuste a visualização dos critérios avaliativos e exporte os dados
            consolidados.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ActionButton onClick={() => setSomenteOficiais((value) => !value)}>
            <Filter className="h-4 w-4" aria-hidden="true" />
            {somenteOficiais ? "Só oficiais" : "Todos critérios"}
          </ActionButton>

          <ActionButton
            onClick={() =>
              setOrdenar((value) => (value === "desc" ? "asc" : "desc"))
            }
          >
            {ordenar === "desc" ? (
              <ArrowDown01 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowUp01 className="h-4 w-4" aria-hidden="true" />
            )}
            {ordenar === "desc" ? "Maiores médias" : "Menores médias"}
          </ActionButton>

          <ActionButton
            onClick={onExportar}
            disabled={exportDisabled}
            tone="slate"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar CSV
          </ActionButton>
        </div>
      </div>
    </section>
  );
}

function RankingCriterios({ titulo, itens, icon: Icon }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-900">
          {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
        </div>

        <h3 className="text-sm font-black text-slate-950 dark:text-white">
          {titulo}
        </h3>
      </div>

      {itens.length ? (
        <ol className="space-y-3">
          {itens.map((item, index) => (
            <li
              key={item.campo}
              className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  #{index + 1}
                </p>
                <p className="truncate text-sm font-bold text-slate-950 dark:text-white">
                  {item.nome}
                </p>
              </div>

              <span className="rounded-xl bg-white px-2.5 py-1 text-sm font-black text-violet-800 ring-1 ring-violet-100 dark:bg-zinc-900 dark:text-violet-200 dark:ring-violet-900">
                {item.media.toFixed(2)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          Ainda não há dados suficientes.
        </p>
      )}
    </div>
  );
}

function CampoBarra({ nome, media, dist, oficial = false }) {
  const percentual = media != null ? Math.min(100, Math.max(0, media * 10)) : 0;
  const linha = dist || criarDistribuicaoNotas();
  const classificacao = classificarMedia(media);

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold text-slate-950 dark:text-white">
              {nome}
            </p>

            {oficial ? (
              <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-800 ring-1 ring-fuchsia-100 dark:bg-fuchsia-950/40 dark:text-fuchsia-200 dark:ring-fuchsia-800/60">
                Oficial
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            Classificação: {classificacao}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right ring-1 ring-slate-100 dark:bg-zinc-800 dark:ring-zinc-700">
          <p className="text-xl font-black text-slate-950 dark:text-white">
            {media != null ? media.toFixed(2) : "—"}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            de 10
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-zinc-700"
          role="img"
          aria-label={`Média ${nome}: ${
            media != null ? media.toFixed(2) : "não disponível"
          } de 10`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-emerald-500"
            style={{ width: `${percentual}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {NOTA_ENUM_OFICIAL.map((nota) => (
          <div
            key={nota}
            className={`rounded-2xl px-2 py-2 text-center text-[11px] font-bold ring-1 ${NOTA_STYLE[nota]}`}
          >
            <p>{nota}</p>
            <p className="mt-0.5 text-sm">{linha[nota] || 0}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuadroComentarios({ titulo, itens }) {
  const lista = Array.isArray(itens) ? itens : [];

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
          <MessageSquare
            className="h-4 w-4 text-violet-600"
            aria-hidden="true"
          />
          {titulo}
        </h3>

        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
          {lista.length}
        </span>
      </div>

      {lista.length ? (
        <ul className="max-h-[420px] space-y-3 overflow-y-auto pr-1 text-sm">
          {lista.map((texto, index) => (
            <li
              key={`${titulo}-${index}`}
              className="rounded-2xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-100 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700"
            >
              “{texto}”
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500 ring-1 ring-slate-100 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700">
          Sem comentários encontrados.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Página
 * ───────────────────────────────────────────── */

export default function AvaliacaoAdmin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const liveRef = useRef(null);

  const eventoIdParam = useMemo(
    () => toPositiveInt(searchParams.get("evento_id")),
    [searchParams],
  );

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [eventoAtual, setEventoAtual] = useState(null);
  const [payload, setPayload] = useState(null);
  const [somenteOficiais, setSomenteOficiais] = useState(true);
  const [ordenar, setOrdenar] = useState("desc");
  const [buscaComentario, setBuscaComentario] = useState("");

  const camposVisiveis = useMemo(() => {
    return somenteOficiais ? CAMPOS_OFICIAIS_MEDIA : CAMPOS_OBJETIVOS;
  }, [somenteOficiais]);

  const mediasOrdenadas = useMemo(() => {
    return ordenarCampos(camposVisiveis, payload?.agregados?.medias, ordenar);
  }, [payload, camposVisiveis, ordenar]);

  const melhoresCriterios = useMemo(() => {
    return obterTopCriterios(
      camposVisiveis,
      payload?.agregados?.medias,
      "melhores",
    );
  }, [camposVisiveis, payload]);

  const pontosAtencao = useMemo(() => {
    return obterTopCriterios(
      camposVisiveis,
      payload?.agregados?.medias,
      "piores",
    );
  }, [camposVisiveis, payload]);

  const textosFiltrados = useMemo(() => {
    const filtro = buscaComentario.trim().toLowerCase();

    const filtrar = (campo) => {
      const lista = payload?.agregados?.textos?.[campo] || [];

      if (!filtro) {
        return lista;
      }

      return lista.filter((texto) => texto.toLowerCase().includes(filtro));
    };

    return {
      gostou_mais: filtrar("gostou_mais"),
      sugestoes_melhoria: filtrar("sugestoes_melhoria"),
      comentarios_finais: filtrar("comentarios_finais"),
    };
  }, [payload, buscaComentario]);

  const totalComentarios = useMemo(() => {
    return CAMPOS_TEXTOS.reduce((acc, campo) => {
      return acc + Number(payload?.agregados?.textos?.[campo]?.length || 0);
    }, 0);
  }, [payload]);

  function setLive(message) {
    if (liveRef.current) {
      liveRef.current.textContent = message;
    }
  }

  const voltarPainelGestor = useCallback(() => {
    navigate("/administrador");
  }, [navigate]);

  const carregarPagina = useCallback(async () => {
    setCarregando(true);
    setErro("");
    setPayload(null);
    setEventoAtual(null);
    setLive("Carregando avaliações do evento.");

    if (!eventoIdParam) {
      setCarregando(false);
      setLive("Contexto de evento ausente.");
      return;
    }

    try {
      if (typeof api?.avaliacao?.adminEventos !== "function") {
        throw new Error(
          "Facade api.avaliacao.adminEventos não encontrada em frontend/src/services/api.js.",
        );
      }

      if (typeof api?.avaliacao?.adminEvento !== "function") {
        throw new Error(
          "Facade api.avaliacao.adminEvento não encontrada em frontend/src/services/api.js.",
        );
      }

      const eventosResponse = await api.avaliacao.adminEventos();
      const lista = normalizarEventos(extrairData(eventosResponse)).filter(
        Boolean,
      );

      const eventoEncontrado =
        lista.find((evento) => Number(evento.id) === eventoIdParam) || null;

      if (!eventoEncontrado) {
        setErro(
          "O evento informado no link não foi encontrado entre os eventos com avaliação.",
        );
        setLive("Evento não encontrado entre os eventos avaliados.");
        return;
      }

      setEventoAtual(eventoEncontrado);

      const eventoResponse = await api.avaliacao.adminEvento(eventoIdParam);
      const dados = normalizarPayloadEvento(extrairData(eventoResponse));

      setPayload(dados);
      setLive("Avaliações do evento carregadas.");
    } catch (error) {
      console.error("[AvaliacaoAdmin] erro ao carregar página:", error);

      const message = getErrorMessage(
        error,
        "Erro ao carregar avaliações do evento.",
      );

      setErro(message);
      setPayload(null);
      setEventoAtual(null);

      notifyError(
        "Não foi possível carregar as avaliações do evento. Tente novamente ou acione o suporte se o problema continuar.",
      );

      setLive("Falha ao carregar avaliações do evento.");
    } finally {
      setCarregando(false);
    }
  }, [eventoIdParam]);

  useEffect(() => {
    document.title = "Avaliações do evento — Escola da Saúde";
    carregarPagina();
  }, [carregarPagina]);

  function exportarCSV() {
    if (!payload) {
      notifyInfo("Não há avaliações carregadas para exportar.");
      return;
    }

    try {
      const linhas = [];

      linhas.push(["Evento", "Total respostas", "Média oficial"].join(";"));
      linhas.push(
        [
          limparCSV(eventoAtual?.titulo || "Evento"),
          payload?.agregados?.total ?? 0,
          payload?.agregados?.mediaOficial ?? "",
        ].join(";"),
      );

      linhas.push("");
      linhas.push(
        [
          "Critério",
          "Média (0..10)",
          "Ótimo",
          "Bom",
          "Regular",
          "Ruim",
          "Péssimo",
        ].join(";"),
      );

      for (const campo of camposVisiveis) {
        const dist =
          payload?.agregados?.dist?.[campo] || criarDistribuicaoNotas();
        const media = payload?.agregados?.medias?.[campo];

        linhas.push(
          [
            limparCSV(labelDoCampo(campo)),
            media ?? "",
            dist["Ótimo"] || 0,
            dist.Bom || 0,
            dist.Regular || 0,
            dist.Ruim || 0,
            dist["Péssimo"] || 0,
          ].join(";"),
        );
      }

      linhas.push("");
      linhas.push(["Comentários — O que mais gostou"].join(";"));
      for (const texto of payload?.agregados?.textos?.gostou_mais || []) {
        linhas.push([limparCSV(texto)].join(";"));
      }

      linhas.push("");
      linhas.push(["Comentários — Sugestões de melhoria"].join(";"));
      for (const texto of payload?.agregados?.textos?.sugestoes_melhoria ||
        []) {
        linhas.push([limparCSV(texto)].join(";"));
      }

      linhas.push("");
      linhas.push(["Comentários — Comentários finais"].join(";"));
      for (const texto of payload?.agregados?.textos?.comentarios_finais ||
        []) {
        linhas.push([limparCSV(texto)].join(";"));
      }

      baixarArquivo(
        `avaliacao_${sanitizeFileName(eventoAtual?.titulo || "evento")}.csv`,
        linhas.join("\r\n"),
        "text/csv;charset=utf-8",
      );

      notifySuccess("CSV gerado com sucesso.");
    } catch (error) {
      console.error("[AvaliacaoAdmin] erro ao exportar CSV:", error);
      notifyError("Não foi possível exportar o CSV.");
    }
  }

  const mediaOficialTexto =
    payload?.agregados?.mediaOficial != null
      ? `${Number(payload.agregados.mediaOficial).toFixed(2)} / 10`
      : "—";

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <p ref={liveRef} className="sr-only" aria-live="polite" />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <HeaderHero
          titulo="Avaliações do evento"
          subtitulo="Tela operacional contextual do Painel do Gestor para analisar respostas, médias oficiais, critérios avaliativos e comentários do evento selecionado."
          icone={BarChart3}
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
                  <Pill className="border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/40 dark:bg-violet-950/25 dark:text-violet-200">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Evento ID {eventoIdParam}
                  </Pill>
                ) : (
                  <Pill className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200">
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    Evento não informado
                  </Pill>
                )}

                {eventoAtual?.titulo ? (
                  <Pill className="max-w-full border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/25 dark:text-fuchsia-200">
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="truncate">{eventoAtual.titulo}</span>
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
                disabled={carregando || !eventoIdParam}
                tone="violet"
              >
                <RefreshCw
                  className={classNames(
                    "h-4 w-4",
                    carregando && "animate-spin",
                  )}
                  aria-hidden="true"
                />
                Atualizar dados
              </ActionButton>
            </div>
          </div>
        </section>

        {carregando ? (
          <div
            className="sticky top-0 z-40 mt-4 h-1 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950/30"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Carregando avaliações"
          >
            <div
              className={classNames(
                "h-full w-1/3 rounded-full bg-violet-700 dark:bg-violet-400",
                reduceMotion ? "" : "animate-pulse",
              )}
            />
          </div>
        ) : null}

        {!eventoIdParam ? (
          <ContextoAusente onVoltar={voltarPainelGestor} />
        ) : (
          <>
            <section
              className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Resumo operacional das avaliações"
            >
              <MetricCard
                icon={ClipboardList}
                label="Respostas"
                value={carregando ? "…" : payload?.agregados?.total || 0}
                hint="Respostas registradas"
                tone="violet"
              />

              <MetricCard
                icon={Star}
                label="Média oficial"
                value={carregando ? "…" : mediaOficialTexto}
                hint="Critérios oficiais"
                tone="fuchsia"
              />

              <MetricCard
                icon={Users}
                label="Turmas"
                value={
                  carregando
                    ? "…"
                    : Array.isArray(payload?.turmas)
                      ? payload.turmas.length
                      : 0
                }
                hint="Turmas com respostas"
                tone="sky"
              />

              <MetricCard
                icon={TrendingUp}
                label="Classificação"
                value={
                  carregando
                    ? "…"
                    : classificarMedia(payload?.agregados?.mediaOficial)
                }
                hint="Resultado consolidado"
                tone="emerald"
              />

              <MetricCard
                icon={MessageSquare}
                label="Comentários"
                value={carregando ? "…" : totalComentarios}
                hint="Textos qualitativos"
                tone="amber"
              />

              <MetricCard
                icon={Percent}
                label="Critérios"
                value={carregando ? "…" : camposVisiveis.length}
                hint={somenteOficiais ? "Somente oficiais" : "Todos visíveis"}
                tone="slate"
              />
            </section>

            <ControlePainel
              somenteOficiais={somenteOficiais}
              setSomenteOficiais={setSomenteOficiais}
              ordenar={ordenar}
              setOrdenar={setOrdenar}
              onExportar={exportarCSV}
              exportDisabled={!payload}
            />

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
                      Não foi possível carregar as avaliações
                    </h2>

                    <p className="mt-2 text-sm leading-relaxed text-rose-800 dark:text-rose-200">
                      {erro}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton onClick={carregarPagina} tone="violet">
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
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
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <CarregandoSkeleton height={130} />
                  <CarregandoSkeleton height={130} />
                  <CarregandoSkeleton height={130} />
                </div>

                <CarregandoSkeleton height={340} />
                <CarregandoSkeleton height={260} />
              </div>
            ) : !eventoAtual ? (
              <div className="mt-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <NadaEncontrado mensagem="Nenhum evento encontrado." />
              </div>
            ) : !payload ? (
              <div className="mt-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <NadaEncontrado mensagem="Sem avaliações para este evento até o momento." />
              </div>
            ) : (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-5 space-y-8"
              >
                {Array.isArray(payload.turmas) && payload.turmas.length ? (
                  <section aria-label="Turmas do evento">
                    <div className="mb-3 flex items-center gap-2">
                      <Users
                        className="h-4 w-4 text-violet-600"
                        aria-hidden="true"
                      />
                      <h2 className="text-sm font-black text-slate-950 dark:text-white">
                        Turmas com respostas
                      </h2>
                    </div>

                    <ul className="flex flex-wrap gap-2">
                      {payload.turmas.map((turma) => (
                        <li
                          key={turma.id}
                          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800"
                          title={`${turma.nome} — ${turma.total_respostas ?? 0} respostas`}
                        >
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-fuchsia-600 px-2 text-xs font-black text-white">
                            {turma.total_respostas ?? 0}
                          </span>
                          {turma.nome || `Turma ${turma.id}`}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <RankingCriterios
                    titulo="Melhores critérios"
                    itens={melhoresCriterios}
                    icon={Sparkles}
                  />

                  <RankingCriterios
                    titulo="Pontos de atenção"
                    itens={pontosAtencao}
                    icon={Info}
                  />
                </section>

                <section aria-labelledby="medias-criterio-titulo">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2
                        id="medias-criterio-titulo"
                        className="text-xl font-black text-slate-950 dark:text-white"
                      >
                        Médias por critério
                      </h2>

                      <p className="text-sm text-slate-500 dark:text-zinc-400">
                        Escala oficial convertida para pontuação de 0 a 10.
                      </p>
                    </div>

                    <span className="inline-flex w-fit rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-100 dark:ring-violet-800/50">
                      Ótimo 10 • Bom 8 • Regular 6 • Ruim 4 • Péssimo 2
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {mediasOrdenadas.map(({ campo, nome, media }) => (
                      <CampoBarra
                        key={campo}
                        nome={nome}
                        media={media}
                        dist={payload?.agregados?.dist?.[campo]}
                        oficial={CAMPOS_OFICIAIS_MEDIA.includes(campo)}
                      />
                    ))}
                  </div>
                </section>

                <section
                  className="space-y-4"
                  aria-labelledby="comentarios-titulo"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2
                        id="comentarios-titulo"
                        className="text-xl font-black text-slate-950 dark:text-white"
                      >
                        Comentários qualitativos
                      </h2>

                      <p className="text-sm text-slate-500 dark:text-zinc-400">
                        Busque rapidamente termos citados pelos participantes.
                      </p>
                    </div>

                    <div className="relative w-full sm:max-w-md">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />

                      <input
                        type="search"
                        value={buscaComentario}
                        onChange={(event) =>
                          setBuscaComentario(event.target.value)
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-9 pr-3 text-sm font-medium text-slate-950 outline-none transition focus:border-violet-700 focus:ring-4 focus:ring-violet-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-violet-950"
                        placeholder="Buscar nos comentários..."
                        aria-label="Buscar nos comentários"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <QuadroComentarios
                      titulo="O que mais gostaram"
                      itens={textosFiltrados.gostou_mais}
                    />

                    <QuadroComentarios
                      titulo="Sugestões de melhoria"
                      itens={textosFiltrados.sugestoes_melhoria}
                    />

                    <QuadroComentarios
                      titulo="Comentários finais"
                      itens={textosFiltrados.comentarios_finais}
                    />
                  </div>
                </section>
              </motion.div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ─────────────────────────────────────────────
 * PropTypes
 * ───────────────────────────────────────────── */

ActionButton.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  tone: PropTypes.oneOf(["neutral", "violet", "slate"]),
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
  tone: PropTypes.oneOf([
    "violet",
    "fuchsia",
    "emerald",
    "amber",
    "sky",
    "slate",
  ]),
};

ContextoAusente.propTypes = {
  onVoltar: PropTypes.func.isRequired,
};

ControlePainel.propTypes = {
  somenteOficiais: PropTypes.bool.isRequired,
  setSomenteOficiais: PropTypes.func.isRequired,
  ordenar: PropTypes.oneOf(["asc", "desc"]).isRequired,
  setOrdenar: PropTypes.func.isRequired,
  onExportar: PropTypes.func.isRequired,
  exportDisabled: PropTypes.bool,
};

RankingCriterios.propTypes = {
  titulo: PropTypes.string.isRequired,
  itens: PropTypes.arrayOf(
    PropTypes.shape({
      campo: PropTypes.string.isRequired,
      nome: PropTypes.string.isRequired,
      media: PropTypes.number.isRequired,
    }),
  ),
  icon: PropTypes.elementType,
};

CampoBarra.propTypes = {
  nome: PropTypes.string.isRequired,
  media: PropTypes.number,
  dist: PropTypes.object,
  oficial: PropTypes.bool,
};

QuadroComentarios.propTypes = {
  titulo: PropTypes.string.isRequired,
  itens: PropTypes.arrayOf(PropTypes.string),
};
