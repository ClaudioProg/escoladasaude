// ✅ frontend/src/pages/GestaoUsuarios.jsx — v2.1
// Atualizado em: 01/06/2026
// Plataforma Escola da Saúde
// Gestão premium de usuários com paginação server-side, contrato único, filtros oficiais e UX mobile-first.

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "react-toastify";
import Skeleton from "react-loading-skeleton";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import HeaderHero from "../components/layout/HeaderHero";
import TabelaUsuarios from "../components/usuarios/TabelaUsuarios";

import {
  apiPerfilOpcao,
  apiUsuarioAtualizarBasico,
  apiUsuarioAtualizarDadosAdministrativos,
  apiUsuarioAtualizarPerfil,
  apiUsuarioEstatisticaDetalhada,
  apiUsuarioListar,
  apiUsuarioResumo,
} from "../services/api";

const ModalEditarUsuario = lazy(() =>
  import("../components/usuarios/ModalEditarUsuario")
);

/* ─────────────────────────────────────────────────────────────
   Contratos oficiais
────────────────────────────────────────────────────────────── */

const PERFIS_OFICIAIS = ["usuario", "organizador", "administrador"];

const PERFIL_LABEL = {
  todos: "Todos os perfis",
  usuario: "Usuários",
  organizador: "Organizadores",
  administrador: "Administradores",
};

const STORAGE_KEYS = {
  busca: "gestaoUsuarios:v2:busca",
  unidade: "gestaoUsuarios:v2:unidade",
  cargo: "gestaoUsuarios:v2:cargo",
  perfil: "gestaoUsuarios:v2:perfil",
  page: "gestaoUsuarios:v2:page",
  pageSize: "gestaoUsuarios:v2:pageSize",
};

/* ─────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function perfilOficial(value) {
  const perfil = String(value || "").trim();

  return PERFIS_OFICIAIS.includes(perfil) ? perfil : "";
}

function getStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function setStorage(key, value) {
  try {
    localStorage.setItem(key, String(value ?? ""));
  } catch {
    // noop
  }
}

function getStorageNumber(key, fallback) {
  const value = Number(getStorage(key, ""));

  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function idadeFromYmd(value) {
  const ymd = String(value || "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;

  const [anoRaw, mesRaw, diaRaw] = ymd.split("-");
  const ano = Number(anoRaw);
  const mes = Number(mesRaw);
  const dia = Number(diaRaw);

  if (
    !Number.isSafeInteger(ano) ||
    !Number.isSafeInteger(mes) ||
    !Number.isSafeInteger(dia)
  ) {
    return null;
  }

  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const diffMes = hoje.getMonth() + 1 - mes;

  if (diffMes < 0 || (diffMes === 0 && hoje.getDate() < dia)) {
    idade -= 1;
  }

  return Number.isFinite(idade) && idade >= 0 ? idade : null;
}

function maskCpf(cpf, revealed = false) {
  const digits = onlyDigits(cpf);

  if (digits.length !== 11) return "—";

  if (!revealed) {
    return digits.replace(/^(\d{3})\d{3}(\d{3})\d{2}$/, "$1.***.$2-**");
  }

  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function csvEscape(value) {
  const text = String(value ?? "");

  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function normalizeUsuario(row = {}, lookup = {}) {
  const unidadeId = Number(row.unidade_id) || null;
  const cargoId = Number(row.cargo_id) || null;

  const unidadeLookup = unidadeId ? lookup.unidadesMap.get(unidadeId) : null;
  const cargoLookup = cargoId ? lookup.cargosMap.get(cargoId) : null;

  return {
    ...row,
    perfil: perfilOficial(row.perfil),
    idade: idadeFromYmd(row.data_nascimento),
    cpf_masked: maskCpf(row.cpf),

    unidade_id: unidadeId,
    unidade_sigla: row.unidade_sigla || unidadeLookup?.sigla || null,
    unidade_nome: row.unidade_nome || unidadeLookup?.nome || null,

    cargo_nome: row.cargo_nome || cargoLookup?.nome || null,

    email: String(row.email || "").trim(),
    celular: String(row.celular || "").trim(),
  };
}

function getMensagemErro(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.erro ||
    error?.data?.message ||
    error?.data?.erro ||
    error?.message ||
    fallback
  );
}

/* ─────────────────────────────────────────────────────────────
   Componentes locais
────────────────────────────────────────────────────────────── */

function PerfilChip({ active, value, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      aria-pressed={active ? "true" : "false"}
      className={cx(
        "inline-flex min-h-[36px] items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
        active
          ? "bg-violet-700 text-white"
          : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      )}
    >
      {active ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {PERFIL_LABEL[value] || value}
    </button>
  );
}

function KpiCard({ label, value = "—", icon: Icon, tone = "violet" }) {
  const tones = {
    violet:
      "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-100",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100",
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100",
    indigo:
      "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-100",
  };

  return (
    <div className={cx("rounded-2xl border p-4 shadow-sm", tones[tone] || tones.violet)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-75">
            {label}
          </p>
          <p className="mt-1 text-2xl font-extrabold">{value}</p>
        </div>

        {Icon ? (
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/60 dark:bg-white/10">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PainelOperacionalUsuarios({
  atualizando,
  total,
  kpis,
  onAtualizar,
  onExportCsv,
  exportando,
}) {
  return (
    <section
      aria-label="Resumo e ações da gestão de usuários"
      className="mb-5 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              Painel operacional
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {typeof total === "number"
                ? `${total} usuário${total === 1 ? "" : "s"} encontrado${
                    total === 1 ? "" : "s"
                  } nos filtros atuais.`
                : "Acompanhe os usuários cadastrados e suas vinculações."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAtualizar}
              disabled={atualizando}
              className={cx(
                "inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600",
                atualizando
                  ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              )}
              aria-label="Atualizar lista de usuários"
              aria-busy={atualizando ? "true" : "false"}
            >
              <RefreshCcw
                className={cx("h-4 w-4", atualizando ? "animate-spin" : "")}
                aria-hidden="true"
              />
              {atualizando ? "Atualizando…" : "Atualizar"}
            </button>

            <button
              type="button"
              onClick={onExportCsv}
              disabled={exportando || Number(total || 0) === 0}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
              title="Exportar CSV do resultado filtrado"
            >
              <Download
                className={cx("h-4 w-4", exportando ? "animate-pulse" : "")}
                aria-hidden="true"
              />
              {exportando ? "Exportando…" : "Exportar CSV"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total" value={kpis.total} icon={Users} tone="indigo" />
          <KpiCard label="Usuários" value={kpis.usuario} icon={Users} tone="emerald" />
          <KpiCard
            label="Organizadores"
            value={kpis.organizador}
            icon={Sparkles}
            tone="amber"
          />
          <KpiCard
            label="Administradores"
            value={kpis.administrador}
            icon={ShieldCheck}
            tone="violet"
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Página
────────────────────────────────────────────────────────────── */

export default function GestaoUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    pageSize: 25,
    pages: 1,
  });

  const [lookup, setLookup] = useState({
    unidades: [],
    cargos: [],
    unidadesMap: new Map(),
    cargosMap: new Map(),
  });

  const [estatistica, setEstatistica] = useState(null);

  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [carregandoLookup, setCarregandoLookup] = useState(true);
  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState(() => getStorage(STORAGE_KEYS.busca, ""));
  const [perfilFiltro, setPerfilFiltro] = useState(() => {
    const stored = getStorage(STORAGE_KEYS.perfil, "todos");

    return stored === "todos" || PERFIS_OFICIAIS.includes(stored)
      ? stored
      : "todos";
  });
  const [unidadeFiltro, setUnidadeFiltro] = useState(() =>
    getStorage(STORAGE_KEYS.unidade, "todas")
  );
  const [cargoFiltro, setCargoFiltro] = useState(() =>
    getStorage(STORAGE_KEYS.cargo, "todos")
  );

  const [page, setPage] = useState(() => getStorageNumber(STORAGE_KEYS.page, 1));
  const [pageSize, setPageSize] = useState(() =>
    getStorageNumber(STORAGE_KEYS.pageSize, 25)
  );

  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null);
  const [modalEditOpen, setModalEditOpen] = useState(false);

  const [revealCpfIds, setRevealCpfIds] = useState(() => new Set());
  const [resumoCache, setResumoCache] = useState(() => new Map());
  const [loadingResumo, setLoadingResumo] = useState(() => new Set());
  const [exportando, setExportando] = useState(false);

  const searchRef = useRef(null);
  const liveRef = useRef(null);
  const erroRef = useRef(null);
  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);

  const setLive = useCallback((message) => {
    if (liveRef.current) liveRef.current.textContent = message || "";
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    document.title = "Gestão de Usuários — Escola da Saúde";
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setStorage(STORAGE_KEYS.busca, busca), [busca]);
  useEffect(() => setStorage(STORAGE_KEYS.perfil, perfilFiltro), [perfilFiltro]);
  useEffect(() => setStorage(STORAGE_KEYS.unidade, unidadeFiltro), [unidadeFiltro]);
  useEffect(() => setStorage(STORAGE_KEYS.cargo, cargoFiltro), [cargoFiltro]);
  useEffect(() => setStorage(STORAGE_KEYS.page, page), [page]);
  useEffect(() => setStorage(STORAGE_KEYS.pageSize, pageSize), [pageSize]);

  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(busca.trim()), 250);

    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, perfilFiltro, unidadeFiltro, cargoFiltro, pageSize]);

  const carregarLookup = useCallback(async () => {
    try {
      setCarregandoLookup(true);

      const data = await apiPerfilOpcao();

      const unidades = Array.isArray(data?.unidades) ? data.unidades : [];
      const cargos = Array.isArray(data?.cargos) ? data.cargos : [];

      const unidadesOrdenadas = [...unidades].sort((a, b) =>
        String(a.sigla || a.nome || "").localeCompare(
          String(b.sigla || b.nome || ""),
          "pt-BR",
          { sensitivity: "base" }
        )
      );

      const cargosOrdenados = [...cargos].sort((a, b) =>
        String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
          sensitivity: "base",
        })
      );

      const unidadesMap = new Map();
      const cargosMap = new Map();

      unidadesOrdenadas.forEach((unidade) => {
        unidadesMap.set(Number(unidade.id), {
          id: Number(unidade.id),
          sigla: String(unidade.sigla || "").trim().toUpperCase(),
          nome: String(unidade.nome || "").trim(),
        });
      });

      cargosOrdenados.forEach((cargo) => {
        cargosMap.set(Number(cargo.id), {
          id: Number(cargo.id),
          nome: String(cargo.nome || "").trim(),
        });
      });

      if (!mountedRef.current) return;

      setLookup({
        unidades: unidadesOrdenadas,
        cargos: cargosOrdenados,
        unidadesMap,
        cargosMap,
      });
    } catch (error) {
      console.error("[GestaoUsuarios] falha ao carregar opções", error);

      if (!mountedRef.current) return;

      toast.error(
        "Não foi possível carregar os filtros de unidade e cargo. Tente atualizar a página."
      );

      setLookup({
        unidades: [],
        cargos: [],
        unidadesMap: new Map(),
        cargosMap: new Map(),
      });
    } finally {
      if (mountedRef.current) setCarregandoLookup(false);
    }
  }, []);

  const carregarEstatisticas = useCallback(async () => {
    try {
      const response = await apiUsuarioEstatisticaDetalhada();
      const data = response?.data ?? response;

      if (!mountedRef.current) return;

      setEstatistica(data || null);
    } catch (error) {
      console.error("[GestaoUsuarios] falha ao carregar estatísticas", error);

      if (!mountedRef.current) return;

      setEstatistica(null);
    }
  }, []);

  const paramsUsuarios = useMemo(() => {
    const params = {
      page,
      pageSize,
    };

    if (debouncedQ) params.q = debouncedQ;
    if (perfilFiltro !== "todos") params.perfil = perfilFiltro;
    if (unidadeFiltro !== "todas") params.unidade_id = Number(unidadeFiltro);
    if (cargoFiltro !== "todos") params.cargo_id = Number(cargoFiltro);

    return params;
  }, [cargoFiltro, debouncedQ, page, pageSize, perfilFiltro, unidadeFiltro]);

  const carregarUsuarios = useCallback(async () => {
    const reqId = ++requestSeqRef.current;

    try {
      setCarregandoUsuarios(true);
      setErro("");
      setLive("Carregando usuários…");

      const response = await apiUsuarioListar(paramsUsuarios);

      if (!mountedRef.current || reqId !== requestSeqRef.current) return;

      const data = Array.isArray(response?.data) ? response.data : [];
      const metaResponse = response?.meta || {
        total: data.length,
        page,
        pageSize,
        pages: 1,
      };

      const normalizados = data.map((usuario) =>
        normalizeUsuario(usuario, lookup)
      );

      setUsuarios(normalizados);
      setMeta({
        total: Number(metaResponse.total || 0),
        page: Number(metaResponse.page || page),
        pageSize: Number(metaResponse.pageSize || pageSize),
        pages: Number(metaResponse.pages || 1),
      });
      setLive(`Usuários carregados: ${normalizados.length}.`);
    } catch (error) {
      console.error("[GestaoUsuarios] falha ao carregar usuários", error);

      if (!mountedRef.current || reqId !== requestSeqRef.current) return;

      const message = getMensagemErro(
        error,
        "Erro ao carregar usuários. Verifique sua conexão ou tente novamente."
      );

      setErro(message);
      setUsuarios([]);
      setMeta({ total: 0, page, pageSize, pages: 1 });
      setLive("Falha ao carregar usuários.");
      toast.error(message);

      window.setTimeout(() => erroRef.current?.focus?.(), 0);
    } finally {
      if (mountedRef.current && reqId === requestSeqRef.current) {
        setCarregandoUsuarios(false);
      }
    }
  }, [lookup, page, pageSize, paramsUsuarios, setLive]);

  useEffect(() => {
    carregarLookup();
    carregarEstatisticas();
  }, [carregarEstatisticas, carregarLookup]);

  useEffect(() => {
    if (carregandoLookup) return;

    carregarUsuarios();
  }, [carregandoLookup, carregarUsuarios]);

  const kpis = useMemo(() => {
    const porPerfil = Array.isArray(estatistica?.por_perfil)
      ? estatistica.por_perfil
      : [];

    const map = new Map(
      porPerfil.map((item) => [
        String(item.label || "").trim(),
        Number(item.value || 0),
      ])
    );

    return {
      total: String(estatistica?.total_usuarios ?? meta.total ?? 0),
      usuario: String(map.get("usuario") ?? 0),
      organizador: String(map.get("organizador") ?? 0),
      administrador: String(map.get("administrador") ?? 0),
    };
  }, [estatistica, meta.total]);

  const abrirEdicao = useCallback((usuario) => {
    setUsuarioSelecionado(usuario);
    setModalEditOpen(true);
  }, []);

  const fecharEdicao = useCallback(() => {
    setModalEditOpen(false);
    setUsuarioSelecionado(null);
  }, []);

  async function carregarResumoUsuario(id) {
    if (!id) return;
    if (resumoCache.has(id) || loadingResumo.has(id)) return;

    setLoadingResumo((prev) => new Set(prev).add(id));

    try {
      const response = await apiUsuarioResumo(id);
      const payload = response?.data ?? response;

      const resumo = {
        cursos_concluidos_75: Number(payload?.cursos_concluidos_75 ?? 0),
        certificados_emitidos: Number(payload?.certificados_emitidos ?? 0),
      };

      setResumoCache((prev) => {
        const next = new Map(prev);
        next.set(id, resumo);
        return next;
      });

      setUsuarios((prev) =>
        prev.map((usuario) =>
          usuario.id === id ? { ...usuario, ...resumo } : usuario
        )
      );
    } catch (error) {
      console.error("[GestaoUsuarios] falha ao carregar resumo", {
        usuarioId: id,
        message: error?.message,
      });

      toast.error("Não foi possível carregar os detalhes do usuário.");
    } finally {
      setLoadingResumo((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function salvarUsuarioEditado(id, payload = {}) {
  const perfilNovo = perfilOficial(payload.perfil);
  const nomeNovo = String(payload.nome || "").trim();
  const emailNovo = String(payload.email || "").trim();
  const celularNovo = onlyDigits(payload.celular);
  const unidadeIdNovo = Number(payload.unidade_id) || null;

  if (!nomeNovo) {
    toast.error("Informe o nome completo do usuário.");
    throw new Error("Nome obrigatório.");
  }

  if (!emailNovo) {
    toast.error("Informe um e-mail válido para o usuário.");
    throw new Error("E-mail obrigatório.");
  }

  if (!unidadeIdNovo) {
    toast.error("Selecione a unidade do usuário.");
    throw new Error("Unidade obrigatória.");
  }

  if (!perfilNovo) {
    toast.error("Perfil inválido. Use apenas usuário, organizador ou administrador.");
    throw new Error("Perfil inválido.");
  }

  try {
    await apiUsuarioAtualizarBasico(id, {
      nome: nomeNovo,
      email: emailNovo,
      celular: celularNovo,
    });

   await apiUsuarioAtualizarDadosAdministrativos(id, {
  unidade_id: unidadeIdNovo,
});

    await apiUsuarioAtualizarPerfil(id, {
      perfil: perfilNovo,
    });

    await carregarUsuarios();
    await carregarEstatisticas();
  } catch (error) {
    console.error("[GestaoUsuarios] falha ao atualizar usuário", {
      usuarioId: id,
      message: error?.message,
    });

    const message = getMensagemErro(
      error,
      "Não foi possível atualizar os dados do usuário. Verifique as permissões e tente novamente."
    );

    toast.error(message);
    throw error;
  }
}

  function onToggleCpf(id) {
    setRevealCpfIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  async function onExportCsv() {
    const hardLimit = 20000;
    const total = Number(meta.total || 0);

    if (!total) {
      toast.info("Nada para exportar com os filtros atuais.");
      return;
    }

    if (total > hardLimit) {
      toast.error(
        `Exportação muito grande (${total}). Refine os filtros antes de exportar.`
      );
      return;
    }

    try {
      setExportando(true);

      const headers = [
        "id",
        "nome",
        "email",
        "celular",
        "perfil",
        "unidade_sigla",
        "cargo",
        "idade",
      ];

      const rows = [];
      const exportPageSize = 200;
      const totalPages = Math.max(1, Math.ceil(total / exportPageSize));

      for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
        const response = await apiUsuarioListar({
          ...paramsUsuarios,
          page: currentPage,
          pageSize: exportPageSize,
        });

        const data = Array.isArray(response?.data) ? response.data : [];

        for (const usuario of data) {
          const normalizado = normalizeUsuario(usuario, lookup);

          rows.push([
            normalizado.id ?? "",
            normalizado.nome ?? "",
            normalizado.email ?? "",
            normalizado.celular ?? "",
            normalizado.perfil ?? "",
            normalizado.unidade_sigla ?? "",
            normalizado.cargo_nome ?? "",
            Number.isFinite(normalizado.idade) ? normalizado.idade : "",
          ]);
        }
      }

      const content = [headers, ...rows]
        .map((row) => row.map(csvEscape).join(";"))
        .join("\n");

      const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
      const filename = `usuarios_${new Date().toISOString().slice(0, 10)}.csv`;

      downloadBlob(filename, blob);
      toast.success("CSV exportado com o resultado filtrado.");
    } catch (error) {
      console.error("[GestaoUsuarios] falha ao exportar CSV", error);
      toast.error("Não foi possível exportar o CSV.");
    } finally {
      setExportando(false);
    }
  }

  const anyLoading = carregandoUsuarios || carregandoLookup;
  const totalItems = Number(meta.total || 0);
  const totalPages = Math.max(1, Number(meta.pages || 1));
  const pageClamped = Math.min(Math.max(1, Number(meta.page || page)), totalPages);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <p ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" />

      <HeaderHero
        titulo="Gestão de Usuários"
        subtitulo="Busque, visualize e atualize usuários com segurança, rastreabilidade operacional e contrato único."
        icone={Users}
      />

      {anyLoading ? (
        <div
          className="sticky top-0 z-40 h-1 w-full bg-fuchsia-100 dark:bg-fuchsia-950"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Carregando dados"
        >
          <div className="h-full w-1/3 animate-pulse bg-fuchsia-700 dark:bg-fuchsia-600" />
        </div>
      ) : null}

      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-4">
        <PainelOperacionalUsuarios
          atualizando={anyLoading}
          total={totalItems}
          kpis={kpis}
          onAtualizar={() => {
            carregarUsuarios();
            carregarEstatisticas();
          }}
          onExportCsv={onExportCsv}
          exportando={exportando}
        />

        {erro && !anyLoading ? (
          <div
            ref={erroRef}
            tabIndex={-1}
            className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 outline-none dark:border-rose-900/40 dark:bg-rose-950/25"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 text-rose-600 dark:text-rose-300"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="font-semibold text-rose-800 dark:text-rose-200">
                  Não foi possível carregar usuários
                </p>
                <p className="break-words text-sm text-rose-800/90 dark:text-rose-200/90">
                  {erro}
                </p>
                <button
                  type="button"
                  onClick={carregarUsuarios}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold hover:bg-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:bg-rose-900/40 dark:hover:bg-rose-900/60"
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section
          aria-label="Ferramentas de busca e filtros"
          className="sticky top-1 z-30 mb-5 rounded-2xl border border-zinc-200 bg-white/85 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85"
        >
          <div className="flex flex-col gap-3">
            <div className="relative w-full">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                id="busca-usuarios"
                type="text"
                autoComplete="off"
                placeholder="Buscar por nome, e-mail, CPF, celular ou registro… (/)"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="w-full rounded-xl border px-9 py-2 text-sm ring-offset-2 focus:outline-none focus:ring-2 focus:ring-violet-700 dark:border-zinc-700 dark:bg-zinc-800"
                aria-describedby="resultados-count"
              />
              <p id="resultados-count" className="sr-only" aria-live="polite">
                {totalItems} resultado(s).
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" /> Perfil:
                </span>

                {["todos", ...PERFIS_OFICIAIS].map((perfil) => (
                  <PerfilChip
                    key={perfil}
                    value={perfil}
                    active={perfilFiltro === perfil}
                    onClick={setPerfilFiltro}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={unidadeFiltro}
                  onChange={(event) => setUnidadeFiltro(event.target.value)}
                  className="min-h-[36px] rounded-xl border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-700 dark:border-zinc-700 dark:bg-zinc-800"
                  aria-label="Filtrar por unidade"
                  title="Filtrar por unidade"
                >
                  <option value="todas">Todas as unidades</option>
                  {lookup.unidades.map((unidade) => (
                    <option key={unidade.id} value={String(unidade.id)}>
                      {unidade.sigla || unidade.nome}
                    </option>
                  ))}
                </select>

                <select
                  value={cargoFiltro}
                  onChange={(event) => setCargoFiltro(event.target.value)}
                  className="min-h-[36px] rounded-xl border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-700 dark:border-zinc-700 dark:bg-zinc-800"
                  aria-label="Filtrar por cargo"
                  title="Filtrar por cargo"
                >
                  <option value="todos">Todos os cargos</option>
                  {lookup.cargos.map((cargo) => (
                    <option key={cargo.id} value={String(cargo.id)}>
                      {cargo.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {anyLoading ? (
          <div className="space-y-4" aria-busy="true" aria-live="polite">
            {[...Array(6)].map((_, index) => (
              <Skeleton key={index} height={96} className="rounded-2xl" />
            ))}
          </div>
        ) : erro ? (
          <p className="text-center text-rose-600 dark:text-rose-300" role="alert">
            {erro}
          </p>
        ) : (
          <>
            <TabelaUsuarios
              usuarios={Array.isArray(usuarios) ? usuarios : []}
              onEditar={abrirEdicao}
              onToggleCpf={onToggleCpf}
              isCpfRevealed={(id) => revealCpfIds.has(id)}
              maskCpfFn={maskCpf}
              onCarregarResumo={carregarResumoUsuario}
              isResumoLoading={(id) => loadingResumo.has(id)}
              hasResumo={(id) => resumoCache.has(id)}
            />

            <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                Mostrando <strong>{usuarios.length}</strong> de{" "}
                <strong>{totalItems}</strong> resultado(s) — página{" "}
                <strong>{pageClamped}</strong> de <strong>{totalPages}</strong>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <label className="text-xs text-zinc-600 dark:text-zinc-400">
                  Por página:
                </label>

                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value) || 25)}
                  className="min-h-[34px] rounded-xl border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-700 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {[10, 25, 50, 100, 200].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pageClamped <= 1}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border px-2 py-1.5 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Anterior
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={pageClamped >= totalPages}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border px-2 py-1.5 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        )}

        <Suspense
          fallback={
            <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/40 backdrop-blur-sm">
              <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm font-extrabold dark:border-zinc-800 dark:bg-zinc-900">
                Carregando editor…
              </div>
            </div>
          }
        >
          {usuarioSelecionado ? (
            <ModalEditarUsuario
              usuario={usuarioSelecionado}
              isOpen={modalEditOpen}
              unidades={lookup.unidades}
              onClose={fecharEdicao}
              onSalvar={salvarUsuarioEditado}
            />
          ) : null}
        </Suspense>

        <div className="mt-8 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>
            CPFs ficam ocultos por padrão. Revele apenas quando houver necessidade
            operacional real.
          </span>
        </div>
      </main>

      <Footer />
    </div>
  );
}