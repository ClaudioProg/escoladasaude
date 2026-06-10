// ✅ src/components/presencas/ControlePresencaInscritos.jsx — v2.2
// Atualizado em: 02/06/2026
// Plataforma Escola da Saúde
//
// Componente de controle de presença por inscrito e por data.
//
// Contratos aplicados:
// - Sem toast direto;
// - Sem apiPost direto;
// - Sem /api manual no frontend;
// - Sem /api/presencas/confirmar-organizador;
// - Confirmação oficial:
//   api.presenca.confirmarorganizador({ usuario_id, turma_id, data_presenca });
// - Payload oficial em snake_case;
// - Date-only oficial: YYYY-MM-DD;
// - Botao v2.0 em src/components/ui/Botao;
// - AppToast v2.0 em src/components/ui/AppToast;
// - Sem token depreciado;
// - Sem data ISO artificial T00:00:00;
// - Mobile-first, dark mode, acessível e date-only safe.
//
// Revisão v2.1:
// - mantém backend como fonte final da regra;
// - organizador mantém janela de 48h;
// - administrador passa a ter janela visual de 90 dias;
// - remove janela fixa única de 48h para todos;
// - recebe modoAdministrador por prop;
// - recebe prazos oficiais por prop com fallback seguro;
// - ajusta labels, hints, title e bloqueio visual conforme perfil.
//
// Revisão v2.2:
// - adiciona modoTabelaCompacta para a Gestão de Presenças;
// - no modo compacto, exibe Nome, Status e Ação;
// - reduz drasticamente a altura da página;
// - preserva o modo detalhado antigo para outros usos;
// - mantém janela 90 dias para administrador e 48h para organizador;
// - usa variant oficial "contorno" no Botao.

import PropTypes from "prop-types";
import { motion } from "framer-motion";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Accessibility,
  AlertCircle,
  Brain,
  User2,
  Mail,
  BadgeCheck,
  Clock3,
  ShieldAlert,
  XCircle,
  CalendarDays,
  Timer,
  Ear,
  Eye,
  Infinity,
  Sparkles,
} from "lucide-react";

import { api } from "../../services/api";
import Botao from "../ui/Botao";
import { notifyError, notifySuccess } from "../ui/AppToast";

/* ─────────────────────────────────────────────────────────────
 * Configuração
 * ───────────────────────────────────────────────────────────── */

const UNLOCK_MINUTES_AFTER_START = 60;

const CONFIRM_WINDOW_ORGANIZADOR_HOURS = 48;
const CONFIRM_WINDOW_ADMINISTRADOR_DAYS = 90;

const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

function toPositiveInt(value) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : null;
}

function isDateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function ymd(value) {
  const safe = String(value || "").trim();

  if (isDateOnly(safe)) return safe;
  if (/^\d{4}-\d{2}-\d{2}T/.test(safe)) return safe.slice(0, 10);

  return "";
}

function toLocalDateOnly(value) {
  const data = ymd(value);

  if (!data) return null;

  const [year, month, day] = data.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function ymdLocalString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatBRDateOnly(value) {
  const data = ymd(value);

  if (!data) return "—";

  const [year, month, day] = data.split("-");
  return `${day}/${month}/${year}`;
}

function hhmm(value, fallback = "") {
  const safe = String(value || "").trim();

  if (/^\d{2}:\d{2}$/.test(safe)) return safe;
  if (/^\d{2}:\d{2}:\d{2}$/.test(safe)) return safe.slice(0, 5);

  return fallback;
}

function combineDateAndTimeLocal(dateOnly, timeHHmm, endOfDay = false) {
  const base = toLocalDateOnly(dateOnly);

  if (!base) return null;

  const hora = hhmm(timeHHmm);
  const [hour, minute] = hora.split(":").map(Number);

  base.setHours(
    Number.isFinite(hour) ? hour : endOfDay ? 23 : 0,
    Number.isFinite(minute) ? minute : endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );

  return base;
}

function generateDateRangeLocal(startDateOnly, endDateOnly) {
  const start = toLocalDateOnly(startDateOnly);
  const end = toLocalDateOnly(endDateOnly);

  if (!start || !end) return [];

  const out = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    out.push(ymdLocalString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function somenteDigitos(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function cpfProtegido(value) {
  const digits = somenteDigitos(value);

  if (digits.length !== 11) {
    return value ? String(value) : "—";
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.***-**`;
}

function getErrorMessage(error, fallback) {
  return (
    error?.data?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function getUsuarioId(inscrito) {
  return toPositiveInt(inscrito?.usuario_id);
}

function getTurmaId(turma) {
  return toPositiveInt(turma?.turma_id || turma?.id);
}

function normalizarPrazoHoras(value, fallback) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizarPrazoDias(value, fallback) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function obterRegraPrazoConfirmacao({
  modoAdministrador,
  prazoConfirmacaoOrganizadorHoras,
  prazoConfirmacaoAdministradorDias,
}) {
  const horasOrganizador = normalizarPrazoHoras(
    prazoConfirmacaoOrganizadorHoras,
    CONFIRM_WINDOW_ORGANIZADOR_HOURS
  );

  const diasAdministrador = normalizarPrazoDias(
    prazoConfirmacaoAdministradorDias,
    CONFIRM_WINDOW_ADMINISTRADOR_DAYS
  );

  if (modoAdministrador) {
    return {
      perfil: "administrador",
      label: `${diasAdministrador} dias`,
      prazoMs: diasAdministrador * MS_DAY,
      hintForaPrazo: `Fora do prazo de ${diasAdministrador} dias após o fim do encontro.`,
      hintExpirou: `Prazo expirou (${diasAdministrador} dias após o fim do encontro).`,
    };
  }

  return {
    perfil: "organizador",
    label: `${horasOrganizador}h`,
    prazoMs: horasOrganizador * MS_HOUR,
    hintForaPrazo: `Fora do prazo de ${horasOrganizador}h após o fim do encontro.`,
    hintExpirou: `Prazo expirou (${horasOrganizador}h após o fim do encontro).`,
  };
}

function normalizarTextoBusca(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obterDeficienciaUsuario(usuario = {}) {
  const candidatos = [
    usuario?.deficiencia_nome,
    usuario?.deficiencia,
    usuario?.tipo_deficiencia,
    usuario?.deficiencia_tipo,
    usuario?.pcd_tipo,
    usuario?.necessidade_especial,
  ];

  for (const candidato of candidatos) {
    const texto = String(candidato || "").trim();

    if (texto) return texto;
  }

  return "";
}

function obterConfigDeficiencia(deficiencia) {
  const textoOriginal = String(deficiencia || "").trim();
  const texto = normalizarTextoBusca(textoOriginal);

  if (
    !texto ||
    [
      "nao possui",
      "nao informado",
      "nenhuma",
      "sem deficiencia",
      "nao",
    ].includes(texto)
  ) {
    return null;
  }

  if (texto.includes("fisica") || texto.includes("motora")) {
    return {
      label: "Deficiência física",
      Icon: Accessibility,
      className:
        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    };
  }

  if (texto.includes("visual") || texto.includes("visao")) {
    return {
      label: "Deficiência visual",
      Icon: Eye,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    };
  }

  if (
    texto.includes("auditiva") ||
    texto.includes("surdez") ||
    texto.includes("surdo")
  ) {
    return {
      label: "Deficiência auditiva",
      Icon: Ear,
      className:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
    };
  }

  if (texto.includes("intelectual")) {
    return {
      label: "Deficiência intelectual",
      Icon: Brain,
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    };
  }

  if (
    texto.includes("autismo") ||
    texto.includes("autista") ||
    texto.includes("tea") ||
    texto.includes("espectro")
  ) {
    return {
      label: "Transtorno do Espectro Autista",
      Icon: Infinity,
      className:
        "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200",
    };
  }

  if (texto.includes("multipla")) {
    return {
      label: "Deficiência múltipla",
      Icon: Sparkles,
      className:
        "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-200",
    };
  }

  return {
    label: textoOriginal,
    Icon: AlertCircle,
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  };
}

function IconeDeficienciaUsuario({ usuario }) {
  const config = obterConfigDeficiencia(obterDeficienciaUsuario(usuario));

  if (!config) return null;

  const Icon = config.Icon;

  return (
    <span
      className={classNames(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
        config.className
      )}
      title={config.label}
      aria-label={config.label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
 * UI local
 * ───────────────────────────────────────────────────────────── */

function Pill({ tone = "slate", icon: Icon, children }) {
  const tones = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-200",
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200",
    rose:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200",
    indigo:
      "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200",
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/25 dark:text-slate-200",
  };

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold",
        tones[tone] || tones.slate
      )}
    >
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

IconeDeficienciaUsuario.propTypes = {
  usuario: PropTypes.object,
};

Pill.propTypes = {
  tone: PropTypes.oneOf(["emerald", "amber", "rose", "indigo", "slate"]),
  icon: PropTypes.elementType,
  children: PropTypes.node.isRequired,
};

/* ─────────────────────────────────────────────────────────────
 * Componente
 * ───────────────────────────────────────────────────────────── */

export default function ControlePresencaInscritos({
  inscritos = [],
  turma,
  presencas = [],
  carregarPresencas,
  datas = [],
  modoAdministrador = false,
  prazoConfirmacaoOrganizadorHoras = CONFIRM_WINDOW_ORGANIZADOR_HOURS,
  prazoConfirmacaoAdministradorDias = CONFIRM_WINDOW_ADMINISTRADOR_DAYS,
  modoTabelaCompacta = false,
}) {
  const [confirmandoKey, setConfirmandoKey] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const turma_id = getTurmaId(turma);

  const regraPrazoConfirmacao = useMemo(
    () =>
      obterRegraPrazoConfirmacao({
        modoAdministrador,
        prazoConfirmacaoOrganizadorHoras,
        prazoConfirmacaoAdministradorDias,
      }),
    [
      modoAdministrador,
      prazoConfirmacaoAdministradorDias,
      prazoConfirmacaoOrganizadorHoras,
    ]
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), MS_MIN);

    return () => window.clearInterval(id);
  }, []);

  const linhasDatas = useMemo(() => {
    if (Array.isArray(datas) && datas.length > 0) {
      return datas
        .map((item) => ({
          data: ymd(item?.data),
          horario_inicio: hhmm(item?.horario_inicio || turma?.horario_inicio),
          horario_fim: hhmm(item?.horario_fim || turma?.horario_fim),
        }))
        .filter((item) => item.data)
        .sort((a, b) => a.data.localeCompare(b.data));
    }

    return generateDateRangeLocal(turma?.data_inicio, turma?.data_fim).map(
      (data) => ({
        data,
        horario_inicio: hhmm(turma?.horario_inicio),
        horario_fim: hhmm(turma?.horario_fim),
      })
    );
  }, [
    datas,
    turma?.data_inicio,
    turma?.data_fim,
    turma?.horario_inicio,
    turma?.horario_fim,
  ]);

  const presencasMap = useMemo(() => {
    const map = new Map();

    for (const presenca of Array.isArray(presencas) ? presencas : []) {
      const usuario_id = toPositiveInt(presenca?.usuario_id);
      const data_presenca = ymd(presenca?.data_presenca || presenca?.data);

      if (usuario_id && data_presenca) {
        map.set(`${usuario_id}#${data_presenca}`, presenca?.presente === true);
      }
    }

    return map;
  }, [presencas]);

  const dentroDoPrazoDeConfirmacao = useCallback(
    (data_presenca, horarioFimDoDia, horarioFimTurma) => {
      const fimDia = combineDateAndTimeLocal(
        data_presenca,
        horarioFimDoDia || horarioFimTurma,
        true
      );

      if (!fimDia) return false;

      const limite = new Date(
        fimDia.getTime() + regraPrazoConfirmacao.prazoMs
      );

      return now <= limite;
    },
    [now, regraPrazoConfirmacao]
  );

  const liberouPosInicio = useCallback(
    (data_presenca, horarioInicio, minutos = UNLOCK_MINUTES_AFTER_START) => {
      const inicioDia = combineDateAndTimeLocal(data_presenca, horarioInicio);

      if (!inicioDia) return false;

      const unlockAt = new Date(inicioDia.getTime() + minutos * MS_MIN);

      return now >= unlockAt;
    },
    [now]
  );

  const confirmarPresenca = useCallback(
    async (usuario_id, data_presenca) => {
      const usuarioIdSeguro = toPositiveInt(usuario_id);
      const dataSegura = ymd(data_presenca);

      if (!usuarioIdSeguro || !turma_id || !dataSegura) {
        notifyError("Dados insuficientes para confirmar presença.");
        return;
      }

      const key = `${usuarioIdSeguro}#${dataSegura}`;

      try {
        setConfirmandoKey(key);

        await api.presenca.confirmarorganizador({
          usuario_id: usuarioIdSeguro,
          turma_id,
          data_presenca: dataSegura,
        });

        notifySuccess("Presença confirmada com sucesso.");

        await carregarPresencas?.();
      } catch (error) {
        const status = Number(error?.status || error?.response?.status || 0);

        if (status === 409 || status === 208) {
          notifySuccess("Presença já estava confirmada.");
          await carregarPresencas?.();
          return;
        }

        notifyError(getErrorMessage(error, "Erro ao confirmar presença."));
      } finally {
        setConfirmandoKey(null);
      }
    },
    [carregarPresencas, turma_id]
  );

  const getLinhaPresenca = useCallback(
    (usuario_id, data, horario_inicio, horario_fim) => {
      const presente = !!presencasMap.get(`${usuario_id}#${data}`);

      const liberado = liberouPosInicio(data, horario_inicio);

      const noPrazo = dentroDoPrazoDeConfirmacao(
        data,
        horario_fim,
        turma?.horario_fim
      );

      const podeConfirmar = Boolean(
        usuario_id && !presente && liberado && noPrazo
      );

      const foraPrazo = liberado && !noPrazo;
      const aguardando = !liberado;
      const isLoading = confirmandoKey === `${usuario_id}#${data}`;

      const statusNode = presente ? (
        <Pill tone="emerald" icon={BadgeCheck}>
          Presente
        </Pill>
      ) : aguardando ? (
        <Pill tone="amber" icon={Clock3}>
          Aguardando
        </Pill>
      ) : foraPrazo ? (
        <Pill tone="rose" icon={ShieldAlert}>
          Fora do prazo
        </Pill>
      ) : (
        <Pill tone="rose" icon={XCircle}>
          Faltou
        </Pill>
      );

      const titleButton = presente
        ? "Presença já confirmada."
        : aguardando
          ? `Libera ${UNLOCK_MINUTES_AFTER_START} min após o início.`
          : foraPrazo
            ? regraPrazoConfirmacao.hintForaPrazo
            : "Confirmar presença deste dia";

      const hint = presente
        ? "Presença já confirmada."
        : aguardando
          ? `Libera ${UNLOCK_MINUTES_AFTER_START} min após o início.`
          : foraPrazo
            ? regraPrazoConfirmacao.hintExpirou
            : "Pode confirmar agora.";

      return {
        presente,
        liberado,
        noPrazo,
        podeConfirmar,
        foraPrazo,
        aguardando,
        isLoading,
        statusNode,
        titleButton,
        hint,
      };
    },
    [
      confirmandoKey,
      dentroDoPrazoDeConfirmacao,
      liberouPosInicio,
      presencasMap,
      regraPrazoConfirmacao.hintExpirou,
      regraPrazoConfirmacao.hintForaPrazo,
      turma?.horario_fim,
    ]
  );

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-4 overflow-hidden"
      role="region"
      aria-label="Lista de inscritos por data"
    >
      {inscritos.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
            <CalendarDays
              className="text-slate-700 dark:text-slate-200"
              size={22}
              aria-hidden="true"
            />
          </div>

          <p className="mt-3 font-semibold text-slate-900 dark:text-white">
            Nenhum inscrito nesta turma.
          </p>

          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Quando houver inscrições, elas aparecerão aqui com o controle por
            data.
          </p>
        </div>
      ) : modoTabelaCompacta ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/45">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="indigo" icon={Timer}>
                Libera em {UNLOCK_MINUTES_AFTER_START}min
              </Pill>

              <Pill tone="amber" icon={Clock3}>
                Janela {regraPrazoConfirmacao.label}
              </Pill>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">
                Controle compacto de presenças por inscrito
              </caption>

              <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/40 dark:text-slate-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-black">
                    Nome
                  </th>

                  <th scope="col" className="px-4 py-3 text-center font-black">
                    Status
                  </th>

                  <th scope="col" className="px-4 py-3 text-right font-black">
                    Ação
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {inscritos.flatMap((inscrito) => {
                  const usuario_id = getUsuarioId(inscrito);
                  const nome = inscrito?.nome || "Participante";
                  const email = inscrito?.email || "—";
                  const cpf = cpfProtegido(inscrito?.cpf);

                  return linhasDatas.map(
                    ({ data, horario_inicio, horario_fim }) => {
                      const linha = getLinhaPresenca(
                        usuario_id,
                        data,
                        horario_inicio,
                        horario_fim
                      );

                      const key = `${usuario_id || email || cpf}#${data}`;

                      return (
                        <tr
                          key={key}
                          className="bg-white transition hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-900/50"
                        >
                          <td className="px-4 py-3 align-middle">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 break-words font-black text-slate-950 dark:text-white">
  <span>{nome}</span>
  <IconeDeficienciaUsuario usuario={inscrito} />
</p>

                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                <span>{email}</span>
                                <span>CPF: {cpf}</span>

                                {linhasDatas.length > 1 ? (
                                  <span>{formatBRDateOnly(data)}</span>
                                ) : null}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-center align-middle">
                            {linha.statusNode}
                          </td>

                          <td className="px-4 py-3 text-right align-middle">
                            {linha.podeConfirmar ? (
                              <Botao
                                type="button"
                                variant="contorno"
                                size="sm"
                                onClick={() =>
                                  confirmarPresenca(usuario_id, data)
                                }
                                disabled={linha.isLoading}
                                loading={linha.isLoading}
                                aria-label={`Confirmar presença em ${formatBRDateOnly(
                                  data
                                )} para ${nome}`}
                                title={linha.titleButton}
                                className="rounded-xl"
                              >
                                Confirmar
                              </Botao>
                            ) : (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {linha.titleButton}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ul className="space-y-4">
          {inscritos.map((inscrito) => {
            const usuario_id = getUsuarioId(inscrito);
            const keyInscrito = usuario_id || inscrito?.email || inscrito?.cpf;
            const nome = inscrito?.nome || "Participante";
            const email = inscrito?.email || "—";
            const cpf = cpfProtegido(inscrito?.cpf);

            return (
              <li
                key={keyInscrito}
                className={classNames(
                  "relative rounded-2xl border border-slate-200 bg-white/85 shadow-sm backdrop-blur transition-shadow hover:shadow-md",
                  "dark:border-slate-800 dark:bg-slate-950/45"
                )}
              >
                <div className="h-1.5 w-full rounded-t-2xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400 opacity-80" />

                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-start gap-2">
                        <span
                          className={classNames(
                            "mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-700",
                            "dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                          )}
                          aria-hidden="true"
                        >
                          <User2 size={18} />
                        </span>

                        <div className="min-w-0">
                          <p className="flex items-center gap-2 break-words font-semibold text-slate-900 dark:text-white">
  <span>{nome}</span>
  <IconeDeficienciaUsuario usuario={inscrito} />
</p>

                          <p className="inline-flex break-all text-sm text-slate-600 dark:text-slate-300">
                            <Mail
                              size={14}
                              className="mr-2 mt-0.5 shrink-0"
                              aria-hidden="true"
                            />
                            {email}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="slate">
                        CPF: <span className="font-bold">{cpf}</span>
                      </Pill>

                      <Pill tone="indigo" icon={Timer}>
                        Libera em {UNLOCK_MINUTES_AFTER_START}min
                      </Pill>

                      <Pill tone="amber" icon={Clock3}>
                        Janela {regraPrazoConfirmacao.label}
                      </Pill>
                    </div>
                  </div>

                  <div
                    className="mt-4 grid gap-2 md:hidden"
                    aria-label={`Datas e presenças de ${nome}`}
                  >
                    {linhasDatas.map(({ data, horario_inicio, horario_fim }) => {
                      const linha = getLinhaPresenca(
                        usuario_id,
                        data,
                        horario_inicio,
                        horario_fim
                      );

                      const horarioStr =
                        horario_inicio || horario_fim
                          ? `${horario_inicio || ""}${
                              horario_inicio && horario_fim ? " – " : ""
                            }${horario_fim || ""}`
                          : "—";

                      return (
                        <div
                          key={data}
                          className={classNames(
                            "rounded-2xl border border-slate-200 bg-white p-3",
                            "dark:border-slate-800 dark:bg-slate-950/40"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {formatBRDateOnly(data)}
                              </p>

                              <p className="text-xs text-slate-600 dark:text-slate-300">
                                {horarioStr}
                              </p>
                            </div>

                            <div aria-live="polite">{linha.statusNode}</div>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {linha.hint}
                            </p>

                            {linha.podeConfirmar ? (
                              <Botao
                                type="button"
                                variant="contorno"
                                size="sm"
                                onClick={() =>
                                  confirmarPresenca(usuario_id, data)
                                }
                                disabled={linha.isLoading}
                                loading={linha.isLoading}
                                aria-label={`Confirmar presença em ${formatBRDateOnly(
                                  data
                                )} para ${nome}`}
                                title="Confirmar presença deste dia"
                                className="rounded-xl"
                              >
                                Confirmar
                              </Botao>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 hidden md:block">
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table
                        className="min-w-full text-sm"
                        aria-label={`Datas e presenças de ${nome}`}
                      >
                        <caption className="sr-only">
                          Controle de presenças por data
                        </caption>

                        <thead className="bg-slate-50 dark:bg-slate-900/40">
                          <tr className="text-slate-600 dark:text-slate-200">
                            <th scope="col" className="p-3 text-left font-semibold">
                              Data
                            </th>
                            <th scope="col" className="p-3 text-left font-semibold">
                              Horário
                            </th>
                            <th
                              scope="col"
                              className="p-3 text-center font-semibold"
                            >
                              Status
                            </th>
                            <th scope="col" className="p-3 text-right font-semibold">
                              Ação
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {linhasDatas.map(
                            ({ data, horario_inicio, horario_fim }) => {
                              const linha = getLinhaPresenca(
                                usuario_id,
                                data,
                                horario_inicio,
                                horario_fim
                              );

                              const horarioStr =
                                horario_inicio || horario_fim
                                  ? `${horario_inicio || ""}${
                                      horario_inicio && horario_fim ? " – " : ""
                                    }${horario_fim || ""}`
                                  : "—";

                              return (
                                <tr
                                  key={data}
                                  className="bg-white dark:bg-transparent"
                                >
                                  <td className="p-3 text-left font-medium text-slate-900 dark:text-white">
                                    {formatBRDateOnly(data)}
                                  </td>

                                  <td className="p-3 text-left text-slate-700 dark:text-slate-200">
                                    {horarioStr}
                                  </td>

                                  <td className="p-3 text-center">
                                    {linha.statusNode}
                                  </td>

                                  <td className="p-3">
                                    <div className="flex justify-end">
                                      {linha.podeConfirmar ? (
                                        <Botao
                                          type="button"
                                          variant="contorno"
                                          size="sm"
                                          onClick={() =>
                                            confirmarPresenca(usuario_id, data)
                                          }
                                          disabled={linha.isLoading}
                                          loading={linha.isLoading}
                                          aria-label={`Confirmar presença em ${formatBRDateOnly(
                                            data
                                          )} para ${nome}`}
                                          title={linha.titleButton}
                                          className="rounded-xl"
                                        >
                                          Confirmar presença
                                        </Botao>
                                      ) : (
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                          {linha.titleButton}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * PropTypes
 * ───────────────────────────────────────────────────────────── */

ControlePresencaInscritos.propTypes = {
inscritos: PropTypes.arrayOf(
  PropTypes.shape({
    usuario_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
      .isRequired,
    nome: PropTypes.string,
    email: PropTypes.string,
    cpf: PropTypes.string,
    deficiencia_nome: PropTypes.string,
    deficiencia: PropTypes.string,
    tipo_deficiencia: PropTypes.string,
    deficiencia_tipo: PropTypes.string,
    pcd_tipo: PropTypes.string,
    necessidade_especial: PropTypes.string,
  })
),
  turma: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    turma_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    data_inicio: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(Date),
    ]),
    data_fim: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(Date),
    ]),
    horario_inicio: PropTypes.string,
    horario_fim: PropTypes.string,
  }).isRequired,
  presencas: PropTypes.arrayOf(
    PropTypes.shape({
      usuario_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
        .isRequired,
      data_presenca: PropTypes.string,
      presente: PropTypes.bool,
    })
  ),
  carregarPresencas: PropTypes.func,
  datas: PropTypes.arrayOf(
    PropTypes.shape({
      data: PropTypes.string.isRequired,
      horario_inicio: PropTypes.string,
      horario_fim: PropTypes.string,
    })
  ),
  modoAdministrador: PropTypes.bool,
  prazoConfirmacaoOrganizadorHoras: PropTypes.number,
  prazoConfirmacaoAdministradorDias: PropTypes.number,
  modoTabelaCompacta: PropTypes.bool,
};