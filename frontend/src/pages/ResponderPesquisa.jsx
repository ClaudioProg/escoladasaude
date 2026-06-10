// ✅ frontend/src/pages/ResponderPesquisa.jsx — v1.0
/* eslint-disable no-console */
/**
 * Plataforma Escola da Saúde
 *
 * Página premium para resposta de pesquisa institucional.
 *
 * Função:
 * - Carregar pesquisa publicada por ID.
 * - Renderizar perguntas dinamicamente.
 * - Validar respostas obrigatórias.
 * - Enviar participação do usuário autenticado.
 *
 * Contrato esperado:
 * - apiPesquisaObterPublicada(id)       → GET /pesquisa/publicada/:id
 * - apiPesquisaResponder(id, payload)   → POST /pesquisa/:id/responder
 *
 * Padrão:
 * - HeaderHero + Footer.
 * - Sem botões, stats, badges ou breadcrumbs dentro do HeaderHero.
 * - Layout institucional, responsivo e premium.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";

import useEscolaTheme from "../hooks/useEscolaTheme";

import {
  apiPesquisaObter,
  apiPesquisaResponder,
} from "../services/api";

/* ─────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function unwrap(response) {
  return response?.data ?? response;
}

function getErrorMessage(error, fallback) {
  const data = error?.response?.data || error?.data || {};

  return data?.message || data?.erro || error?.message || fallback;
}

function normalizePerguntas(payload) {
  const pesquisa = payload?.pesquisa || payload?.item || payload || {};

  const perguntas = Array.isArray(payload?.perguntas)
    ? payload.perguntas
    : Array.isArray(pesquisa?.perguntas)
      ? pesquisa.perguntas
      : [];

  return {
    pesquisa,
    perguntas: perguntas
      .map((pergunta, index) => ({
        ...pergunta,
        id: pergunta?.id ?? pergunta?.pergunta_id ?? index + 1,
        ordem: pergunta?.ordem ?? pergunta?.display_order ?? index + 1,
        titulo:
          pergunta?.titulo ||
          pergunta?.pergunta ||
          pergunta?.enunciado ||
          `Pergunta ${index + 1}`,
        tipo: normalizeTipoPergunta(
  pergunta?.tipo || pergunta?.tipo_resposta || "texto"
),
        obrigatoria: Boolean(
          pergunta?.obrigatoria ??
            pergunta?.required ??
            pergunta?.is_required ??
            false
        ),
        opcoes: (
  Array.isArray(pergunta?.opcoes)
    ? pergunta.opcoes
    : Array.isArray(pergunta?.alternativas)
      ? pergunta.alternativas
      : []
).map((opcao, opcaoIndex) => {
  if (typeof opcao === "string") {
    return {
      id: opcao,
      texto: opcao,
      ordem: opcaoIndex + 1,
    };
  }

  return {
    ...opcao,
    id:
      opcao?.id ??
      opcao?.alternativa_id ??
      opcao?.opcao_id ??
      opcao?.value ??
      opcao?.valor ??
      opcaoIndex + 1,
    texto:
      opcao?.texto ??
      opcao?.label ??
      opcao?.nome ??
      opcao?.valor ??
      opcao?.descricao ??
      "",
    ordem: opcao?.ordem ?? opcao?.display_order ?? opcaoIndex + 1,
  };
}),
      }))
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)),
  };
}

function getOpcaoId(opcao, index) {
  const id =
    opcao?.id ??
    opcao?.opcao_id ??
    opcao?.alternativa_id ??
    opcao?.pesquisa_opcao_id ??
    opcao?.value ??
    index + 1;

  const number = Number(id);

  return Number.isInteger(number) && number > 0 ? number : id;
}

function getOpcaoTexto(opcao) {
  return String(opcao?.texto || opcao?.label || opcao?.nome || opcao?.valor || "");
}

function removerAcentos(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeTipoPergunta(value) {
  return removerAcentos(value)
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "_");
}

function isMultipleChoice(tipo) {
  const value = normalizeTipoPergunta(tipo);

  return [
    "multipla",
    "multipla_escolha",
    "multipla_escolhas",
    "checkbox",
    "caixa_selecao",
    "selecionar_multiplas",
    "selecao_multipla",
    "opcoes_multiplas",
  ].includes(value);
}

function isSingleChoice(tipo) {
  const value = normalizeTipoPergunta(tipo);

  return [
    "unica",
    "opcao_unica",
    "opcao",
    "escolha_unica",
    "alternativa_unica",
    "radio",
    "alternativa",
    "selecao",
    "select",
  ].includes(value);
}

function isLongText(tipo) {
  const value = normalizeTipoPergunta(tipo);

  return [
    "textarea",
    "texto_longo",
    "discursiva",
    "aberta_longa",
    "resposta_longa",
  ].includes(value);
}

function isScale(tipo) {
  const value = normalizeTipoPergunta(tipo);

  return [
    "nota",
    "escala",
    "escala_1_a_5",
    "escala_1_5",
    "avaliacao",
    "rating",
  ].includes(value);
}

function normalizeRespostaParaPayload(pergunta, resposta) {
  const tipo = pergunta?.tipo;
  const perguntaId = Number(pergunta?.pergunta_id ?? pergunta?.id);

  if (!Number.isInteger(perguntaId) || perguntaId <= 0) {
    return [];
  }

  if (isMultipleChoice(tipo)) {
    const valores = Array.isArray(resposta) ? resposta : [];

    return valores
      .map((opcaoId) => Number(opcaoId))
      .filter((opcaoId) => Number.isInteger(opcaoId) && opcaoId > 0)
      .map((opcaoId) => ({
        pergunta_id: perguntaId,
        opcao_id: opcaoId,
        resposta_texto: null,
        resposta_numero: null,
      }));
  }

  if (isSingleChoice(tipo)) {
    const opcaoId = Number(resposta);

    if (!Number.isInteger(opcaoId) || opcaoId <= 0) {
      return [];
    }

    return [
      {
        pergunta_id: perguntaId,
        opcao_id: opcaoId,
        resposta_texto: null,
        resposta_numero: null,
      },
    ];
  }

  if (isScale(tipo)) {
    const numero = Number(resposta);

    if (!Number.isInteger(numero) || numero < 1 || numero > 5) {
      return [];
    }

    return [
      {
        pergunta_id: perguntaId,
        opcao_id: null,
        resposta_texto: null,
        resposta_numero: numero,
      },
    ];
  }

  const texto = String(resposta || "").trim();

  if (!texto) {
    return [];
  }

  return [
    {
      pergunta_id: perguntaId,
      opcao_id: null,
      resposta_texto: texto,
      resposta_numero: null,
    },
  ];
}

function respostaVazia(pergunta, resposta) {
  const tipo = pergunta?.tipo;

  if (isMultipleChoice(tipo)) {
    return !Array.isArray(resposta) || resposta.length === 0;
  }

  if (isScale(tipo)) {
    return resposta === null || resposta === undefined || resposta === "";
  }

  return !String(resposta || "").trim();
}

/* ─────────────────────────────────────────────────────────────
   Componentes locais
────────────────────────────────────────────────────────────── */

function ActionButton({
  children,
  icon: Icon,
  type = "button",
  onClick,
  disabled = false,
  loading = false,
  variant = "primary",
}) {
  const variants = {
    primary:
      "border-emerald-700 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-emerald-500/60",
    secondary:
      "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 focus-visible:ring-emerald-500/50 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-100 dark:hover:bg-white/5",
    danger:
      "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-500/50 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(
        "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-extrabold transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant] || variants.primary
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-4 w-4" aria-hidden="true" />
      ) : null}

      {children}
    </button>
  );
}

function StatusCard({ type = "info", title, message, action }) {
  const config = {
    info: {
      border: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
      icon: Sparkles,
    },
    warning: {
      border:
        "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
      icon: AlertTriangle,
    },
    success: {
      border:
        "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
      icon: CheckCircle2,
    },
  }[type];

  const Icon = config.icon;

  return (
    <div className={cx("rounded-[28px] border p-5 shadow-sm", config.border)}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-2xl bg-white/70 p-3 text-current dark:bg-white/5">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <p className="font-extrabold">{title}</p>

          {message ? (
            <p className="mt-1 text-sm leading-relaxed opacity-90">{message}</p>
          ) : null}

          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function PerguntaCard({ pergunta, numero, value, onChange, disabled }) {
  const tipo = pergunta?.tipo;
  const opcoes = Array.isArray(pergunta?.opcoes) ? pergunta.opcoes : [];

  const toggleMultipla = (opcaoId) => {
    const atual = Array.isArray(value) ? value : [];

    if (atual.includes(opcaoId)) {
      onChange(atual.filter((item) => item !== opcaoId));
      return;
    }

    onChange([...atual, opcaoId]);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900/60"
    >
      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-sm font-extrabold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
            {numero}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold leading-tight text-slate-900 dark:text-zinc-100">
                {pergunta.titulo}
              </h2>

              {pergunta.obrigatoria ? (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-extrabold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
                  obrigatória
                </span>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-extrabold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                  opcional
                </span>
              )}
            </div>

            {pergunta?.descricao || pergunta?.ajuda ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {pergunta.descricao || pergunta.ajuda}
              </p>
            ) : null}

            <div className="mt-4">
              {isMultipleChoice(tipo) ? (
                <div className="space-y-2">
                  {opcoes.length > 0 ? (
                    opcoes.map((opcao, index) => {
                      const opcaoId = getOpcaoId(opcao, index);
                      const checked = Array.isArray(value) && value.includes(opcaoId);

                      return (
                        <label
                          key={opcaoId}
                          className={cx(
                            "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition",
                            checked
                              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-400/10"
                              : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleMultipla(opcaoId)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                          />

                          <span className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                            {getOpcaoTexto(opcao)}
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <StatusCard
                      type="warning"
                      title="Pergunta sem alternativas"
                      message="Esta pergunta foi cadastrada como múltipla escolha, mas não possui alternativas disponíveis."
                    />
                  )}
                </div>
              ) : null}

              {isSingleChoice(tipo) ? (
                <div className="space-y-2">
                  {opcoes.length > 0 ? (
                    opcoes.map((opcao, index) => {
                      const opcaoId = getOpcaoId(opcao, index);
                      const checked = value === opcaoId;

                      return (
                        <label
                          key={opcaoId}
                          className={cx(
                            "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition",
                            checked
                              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-400/10"
                              : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                          )}
                        >
                          <input
                            type="radio"
                            name={`pergunta-${pergunta.id}`}
                            checked={checked}
                            disabled={disabled}
                            onChange={() => onChange(opcaoId)}
                            className="mt-1 h-4 w-4 border-slate-300 text-emerald-700 focus:ring-emerald-600"
                          />

                          <span className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                            {getOpcaoTexto(opcao)}
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <StatusCard
                      type="warning"
                      title="Pergunta sem alternativas"
                      message="Esta pergunta foi cadastrada como escolha única, mas não possui alternativas disponíveis."
                    />
                  )}
                </div>
              ) : null}

              {isScale(tipo) ? (
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: 5 }).map((_, index) => {
  const nota = index + 1;
                    const selected = Number(value) === nota;

                    return (
                      <button
                        key={nota}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(nota)}
                        className={cx(
                          "min-h-[42px] rounded-2xl border text-sm font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-60",
                          selected
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                        )}
                      >
                        {nota}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {!isMultipleChoice(tipo) &&
              !isSingleChoice(tipo) &&
              !isScale(tipo) &&
              isLongText(tipo) ? (
                <textarea
                  value={value || ""}
                  disabled={disabled}
                  onChange={(event) => onChange(event.target.value)}
                  rows={5}
                  placeholder="Digite sua resposta..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              ) : null}

              {!isMultipleChoice(tipo) &&
              !isSingleChoice(tipo) &&
              !isScale(tipo) &&
              !isLongText(tipo) ? (
                <input
                  type="text"
                  value={value || ""}
                  disabled={disabled}
                  onChange={(event) => onChange(event.target.value)}
                  placeholder="Digite sua resposta..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/* ─────────────────────────────────────────────────────────────
   Página
────────────────────────────────────────────────────────────── */

export default function ResponderPesquisa() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDark } = useEscolaTheme();

  const [pesquisa, setPesquisa] = useState(null);
  const [perguntas, setPerguntas] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    document.title = "Responder Pesquisa — Escola da Saúde";
  }, []);

  const carregarPesquisa = useCallback(async () => {
    if (!id) {
      setErro("Pesquisa inválida.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErro("");

      const response = await apiPesquisaObter(id);
      const payload = unwrap(response) || {};
      const normalized = normalizePerguntas(payload);

      setPesquisa(normalized.pesquisa);
      setPerguntas(normalized.perguntas);

      const respostasIniciais = {};

      normalized.perguntas.forEach((pergunta) => {
        respostasIniciais[pergunta.id] = isMultipleChoice(pergunta.tipo) ? [] : "";
      });

      setRespostas(respostasIniciais);
    } catch (error) {
      console.error("[ResponderPesquisa] erro ao carregar pesquisa", {
        pesquisaId: id,
        message: error?.message,
      });

      setPesquisa(null);
      setPerguntas([]);
      setErro(
        getErrorMessage(
          error,
          "Não foi possível carregar a pesquisa solicitada."
        )
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    carregarPesquisa();
  }, [carregarPesquisa]);

  const totalObrigatorias = useMemo(
    () => perguntas.filter((pergunta) => pergunta.obrigatoria).length,
    [perguntas]
  );

  const totalObrigatoriasRespondidas = useMemo(
    () =>
      perguntas.filter(
        (pergunta) =>
          pergunta.obrigatoria && !respostaVazia(pergunta, respostas[pergunta.id])
      ).length,
    [perguntas, respostas]
  );

  const atualizarResposta = useCallback((perguntaId, value) => {
    setRespostas((prev) => ({
      ...prev,
      [perguntaId]: value,
    }));
  }, []);

  const validarFormulario = useCallback(() => {
    const pendentes = perguntas.filter(
      (pergunta) =>
        pergunta.obrigatoria && respostaVazia(pergunta, respostas[pergunta.id])
    );

    if (pendentes.length > 0) {
      toast.warning("Responda todas as perguntas obrigatórias antes de enviar.");
      return false;
    }

    return true;
  }, [perguntas, respostas]);

  const enviarRespostas = useCallback(
    async (event) => {
      event.preventDefault();

      if (salvando || enviado) return;

      if (!validarFormulario()) return;

      try {
        setSalvando(true);

        const itens = perguntas.flatMap((pergunta) =>
  normalizeRespostaParaPayload(pergunta, respostas[pergunta.id])
);

const payload = {
  anonima: false,
  itens,
  metadata: {
    origem: "web",
  },
};

console.log("[ResponderPesquisa] payload envio", payload);

await apiPesquisaResponder(id, payload);

        setEnviado(true);
        toast.success("Pesquisa enviada com sucesso.");
      } catch (error) {
        console.error("[ResponderPesquisa] erro ao enviar respostas", {
          pesquisaId: id,
          message: error?.message,
        });

        toast.error(
          getErrorMessage(
            error,
            "Não foi possível enviar suas respostas. Tente novamente."
          )
        );
      } finally {
        setSalvando(false);
      }
    },
    [enviado, id, perguntas, respostas, salvando, validarFormulario]
  );

  return (
    <>
      <main className="mx-auto max-w-6xl p-4 md:p-6">
        <HeaderHero
          titulo="Responder Pesquisa"
          subtitulo="Participe das pesquisas institucionais da Escola da Saúde."
          badge="Escola da Saúde • Pesquisa Institucional • Ambiente Seguro"
          icon={ClipboardCheck}
          gradient="from-emerald-700 via-teal-600 to-sky-700"
          isDark={isDark}
        />

        <section className="mt-6 rounded-[30px] border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/55 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-2xl bg-emerald-600/10 p-3 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 dark:text-zinc-100">
                  Suas respostas serão registradas em ambiente autenticado.
                </p>

                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                  Revise as informações antes de enviar. Perguntas obrigatórias
                  precisam ser preenchidas para concluir a participação.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                variant="secondary"
                icon={ArrowLeft}
                onClick={() => navigate(-1)}
              >
                Voltar
              </ActionButton>

              <ActionButton
                variant="secondary"
                icon={RefreshCw}
                loading={loading}
                onClick={carregarPesquisa}
              >
                Recarregar
              </ActionButton>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="mt-6 rounded-[30px] border border-slate-200/80 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900/55">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-700 dark:text-emerald-300" />
            <p className="mt-4 text-sm font-bold text-slate-700 dark:text-zinc-300">
              Carregando pesquisa...
            </p>
          </section>
        ) : null}

        {!loading && erro ? (
          <section className="mt-6">
            <StatusCard
              type="warning"
              title="Não foi possível abrir a pesquisa"
              message={erro}
              action={
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="secondary"
                    icon={RefreshCw}
                    onClick={carregarPesquisa}
                  >
                    Tentar novamente
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    icon={ArrowLeft}
                    onClick={() => navigate("/painel")}
                  >
                    Ir ao dashboard
                  </ActionButton>
                </div>
              }
            />
          </section>
        ) : null}

        {!loading && !erro && enviado ? (
          <section className="mt-6">
            <StatusCard
              type="success"
              title="Pesquisa enviada com sucesso"
              message="Obrigado por participar. Sua resposta foi registrada pela plataforma."
              action={
                <ActionButton
                  variant="secondary"
                  icon={ArrowLeft}
                  onClick={() => navigate("/painel")}
                >
                  Retornar ao dashboard
                </ActionButton>
              }
            />
          </section>
        ) : null}

        {!loading && !erro && !enviado ? (
          <form onSubmit={enviarRespostas} className="mt-6 space-y-6">
            <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900/55">
              <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500" />

              <div className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                      <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                      Pesquisa aberta
                    </div>

                    <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-zinc-100">
                      {pesquisa?.titulo || "Pesquisa institucional"}
                    </h1>

                    {pesquisa?.descricao ? (
                      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                        {pesquisa.descricao}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
                    <p className="font-extrabold text-slate-900 dark:text-zinc-100">
                      {totalObrigatoriasRespondidas}/{totalObrigatorias}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                      obrigatórias respondidas
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {perguntas.length > 0 ? (
              <section className="space-y-4">
                {perguntas.map((pergunta, index) => (
                  <PerguntaCard
                    key={pergunta.id}
                    pergunta={pergunta}
                    numero={index + 1}
                    value={respostas[pergunta.id]}
                    disabled={salvando}
                    onChange={(value) => atualizarResposta(pergunta.id, value)}
                  />
                ))}
              </section>
            ) : (
              <StatusCard
                type="warning"
                title="Pesquisa sem perguntas cadastradas"
                message="A pesquisa está publicada, mas ainda não possui perguntas disponíveis para resposta."
              />
            )}

            <section className="sticky bottom-3 z-20 rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-950/90">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
                  Confira suas respostas antes de enviar.
                </p>

                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="secondary"
                    icon={ArrowLeft}
                    onClick={() => navigate(-1)}
                    disabled={salvando}
                  >
                    Voltar
                  </ActionButton>

                  <ActionButton
                    type="submit"
                    icon={Send}
                    loading={salvando}
                    disabled={perguntas.length === 0}
                  >
                    {salvando ? "Enviando..." : "Enviar respostas"}
                  </ActionButton>
                </div>
              </div>
            </section>
          </form>
        ) : null}
      </main>

      <Footer />
    </>
  );
}