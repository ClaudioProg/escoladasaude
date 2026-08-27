// ✅ src/components/layout/PrivateRoute.jsx — v2.0
// Plataforma Escola da Saúde
//
// Rota privada oficial.
//
// Função:
// - proteger rotas privadas do frontend;
// - validar sessão oficial via apiPerfilMe();
// - redirecionar usuário sem sessão para /login?next=...;
// - controlar acesso por perfil quando a rota exigir.
//
// Contrato oficial único:
// - localStorage.token
// - localStorage.perfil
// - API: apiPerfilMe()
//
// Perfil:
// - perfil.perfil deve ser string oficial exata;
// - administrador é o perfil oficial com acesso total;
// - não aceitar aliases;
// - não aceitar roles;
// - não aceitar perfis;
// - não aceitar arrays vindos do backend;
// - não aceitar lista separada por vírgula;
// - não normalizar para tentar corrigir contrato quebrado;
// - se o backend entregar formato incorreto, a sessão é considerada inválida.
//
// Uso oficial:
// <PrivateRoute permitido={["administrador"]}>
//   <PaginaAdministrativa />
// </PrivateRoute>
//
// <PrivateRoute>
//   <ShellPrivado />
// </PrivateRoute>

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Navigate, useLocation } from "react-router-dom";

import {
  apiPerfilMe,
  clearAuthSession,
  getToken,
  persistAuthSession,
} from "../../services/api";
import {
  erroIndicaSessaoInvalida,
  tokenMudouDuranteValidacao,
  usuarioSessaoValido,
} from "../../auth/authSessionStorage";

const STORAGE_TOKEN_KEY = "token";
const STORAGE_USUARIO_KEY = "usuario";
const STORAGE_PERFIL_KEY = "perfil";

const PERFIL = {
  usuario: "usuario",
  organizador: "organizador",
  administrador: "administrador",
};

const STATUS = {
  verificando: "verificando",
  autenticado: "autenticado",
  nao_autenticado: "nao_autenticado",
  indisponivel: "indisponivel",
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getStoredToken() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return getToken();
  } catch {
    return null;
  }
}

function limparSessaoLocal() {
  if (!isBrowser()) {
    return;
  }

  try {
    clearAuthSession();
  } catch {
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_USUARIO_KEY);
      localStorage.removeItem(STORAGE_PERFIL_KEY);
      window.dispatchEvent(new CustomEvent("auth:changed"));
    } catch {
      // Não bloquear redirecionamento por falha de storage.
    }
  }
}

function getPerfilData(response) {
  if (response?.data && typeof response.data === "object") {
    return response.data;
  }

  if (response && typeof response === "object") {
    return response;
  }

  return null;
}

function permitidoValido(permitido) {
  if (permitido == null) {
    return true;
  }

  if (!Array.isArray(permitido)) {
    return false;
  }

  return permitido.every(
    (perfil) =>
      typeof perfil === "string" &&
      perfil.trim() === perfil &&
      Object.values(PERFIL).includes(perfil),
  );
}

function perfilTemAcesso(perfil, permitido) {
  if (!permitido || permitido.length === 0) {
    return true;
  }

  const perfilAtual = perfil?.perfil;

  if (perfilAtual === PERFIL.administrador) {
    return true;
  }

  return permitido.includes(perfilAtual);
}

function hasCelularObrigatorio(perfil) {
  return Boolean(String(perfil?.celular || "").replace(/\D/g, ""));
}

function perfilEstaIncompleto(perfil) {
  return Boolean(perfil?.perfil_incompleto) || !hasCelularObrigatorio(perfil);
}

function buildNextFromLocation(location) {
  const pathname = location?.pathname || "/painel";
  const search = location?.search || "";
  const hash = location?.hash || "";

  return `${pathname}${search}${hash}`;
}

function errorDev(...args) {
  if (import.meta.env.DEV) {
    console.error("[PrivateRoute]", ...args);
  }
}

function SessaoTemporariamenteIndisponivel({ onRetry }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6 dark:bg-zinc-950">
      <section className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-xl dark:border-amber-900/50 dark:bg-zinc-900">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          Não foi possível confirmar sua sessão agora
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">
          Sua sessão foi mantida. Verifique a conexão e tente novamente.
        </p>
        <button
          type="button"
          className="mt-5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          onClick={onRetry}
        >
          Tentar novamente
        </button>
      </section>
    </main>
  );
}

SessaoTemporariamenteIndisponivel.propTypes = {
  onRetry: PropTypes.func.isRequired,
};

export default function PrivateRoute({
  children,
  permitido = null,
  fallback = null,
  rotaLogin = "/login",
  rotaSemPermissao = "/painel",
}) {
  const location = useLocation();

  const [status, setStatus] = useState(STATUS.verificando);
  const [perfil, setPerfil] = useState(null);

  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const requestEmAndamentoRef = useRef(false);
  const tokenVerificadoRef = useRef(null);
  const authTimerRef = useRef(null);

  const permitidoFinal = useMemo(() => {
    if (permitido == null) {
      return [];
    }

    if (!permitidoValido(permitido)) {
      return null;
    }

    return permitido;
  }, [permitido]);

  const aplicarSessaoInvalida = useCallback((_origem, _extra = {}) => {
    if (!mountedRef.current) {
      return;
    }

    limparSessaoLocal();
    tokenVerificadoRef.current = null;

    setPerfil(null);
    setStatus(STATUS.nao_autenticado);
  }, []);

  const aplicarSessaoValida = useCallback(
    (perfilRecebido, _origem, _extra = {}) => {
      if (!mountedRef.current) {
        return;
      }

      persistAuthSession(_extra.token, perfilRecebido);

      setPerfil((perfilAtual) => {
        if (
          perfilAtual?.id === perfilRecebido.id &&
          perfilAtual?.perfil === perfilRecebido.perfil
        ) {
          return perfilAtual;
        }

        return perfilRecebido;
      });

      setStatus((statusAtual) => {
        if (statusAtual === STATUS.autenticado) {
          return statusAtual;
        }

        return STATUS.autenticado;
      });
    },
    [],
  );

  const aplicarSessaoIndisponivel = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    tokenVerificadoRef.current = null;
    setStatus((statusAtual) =>
      statusAtual === STATUS.autenticado ? statusAtual : STATUS.indisponivel,
    );
  }, []);

  const verificarSessao = useCallback(
    async (origem = "manual", options = {}) => {
      if (!mountedRef.current) {
        return;
      }

      const token = getStoredToken();
      const forcar = Boolean(options?.forcar);

      if (!token) {
        aplicarSessaoInvalida(origem, {
          motivo: "sem_token",
        });
        return;
      }

      if (!forcar && tokenVerificadoRef.current === token) {
        return;
      }

      if (requestEmAndamentoRef.current) {
        return;
      }

      setStatus((statusAtual) =>
        statusAtual === STATUS.autenticado ? statusAtual : STATUS.verificando,
      );

      const requestId = requestIdRef.current + 1;

      requestIdRef.current = requestId;
      requestEmAndamentoRef.current = true;

      try {
        const response = await apiPerfilMe({
          on401: "silent",
          on403: "silent",
        });

        if (!mountedRef.current) {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (tokenMudouDuranteValidacao(token, getStoredToken())) {
          window.setTimeout(() => {
            verificarSessao("token_atualizado", { forcar: true });
          }, 0);
          return;
        }

        const perfilRecebido = getPerfilData(response);

        if (!usuarioSessaoValido(perfilRecebido)) {
          aplicarSessaoIndisponivel();
          return;
        }

        tokenVerificadoRef.current = token;

        aplicarSessaoValida(perfilRecebido, origem, {
          request_id: requestId,
          token,
        });
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        errorDev("falha ao verificar sessão", {
          origem,
          request_id: requestId,
          mensagem: error?.message,
          status: error?.status || error?.response?.status || null,
        });

        if (erroIndicaSessaoInvalida(error)) {
          aplicarSessaoInvalida(origem, {
            request_id: requestId,
            motivo: "perfil_me_401",
          });
        } else {
          aplicarSessaoIndisponivel();
        }
      } finally {
        if (requestId === requestIdRef.current) {
          requestEmAndamentoRef.current = false;
        }
      }
    },
    [
      aplicarSessaoIndisponivel,
      aplicarSessaoInvalida,
      aplicarSessaoValida,
    ],
  );

  useEffect(() => {
    mountedRef.current = true;

    verificarSessao("mount", {
      forcar: true,
    });

    function handleAuthChanged() {
      if (!mountedRef.current) {
        return;
      }

      if (authTimerRef.current) {
        window.clearTimeout(authTimerRef.current);
      }

      authTimerRef.current = window.setTimeout(() => {
        verificarSessao("auth:changed", {
          forcar: true,
        });
      }, 80);
    }

    function handleStorageChanged(event) {
      if (!mountedRef.current) {
        return;
      }
      if (event.key !== STORAGE_TOKEN_KEY) {
        return;
      }

      verificarSessao("storage:token", {
        forcar: true,
      });
    }

    window.addEventListener("auth:changed", handleAuthChanged);
    window.addEventListener("storage", handleStorageChanged);

    return () => {
      mountedRef.current = false;

      if (authTimerRef.current) {
        window.clearTimeout(authTimerRef.current);
      }

      window.removeEventListener("auth:changed", handleAuthChanged);
      window.removeEventListener("storage", handleStorageChanged);
    };
  }, [verificarSessao]);

  if (status === STATUS.verificando) {
    return fallback;
  }

  if (status === STATUS.nao_autenticado) {
    const next = encodeURIComponent(buildNextFromLocation(location));

    return (
      <Navigate
        to={`${rotaLogin}?next=${next}`}
        replace
        state={{ from: location }}
      />
    );
  }

  if (status === STATUS.indisponivel) {
    return (
      <SessaoTemporariamenteIndisponivel
        onRetry={() => verificarSessao("retry", { forcar: true })}
      />
    );
  }

  if (perfilEstaIncompleto(perfil) && location.pathname !== "/perfil") {
    return (
      <Navigate
        to="/perfil"
        replace
        state={{ from: location, motivo: "perfil_incompleto" }}
      />
    );
  }

  if (permitidoFinal === null) {
    errorDev("Prop permitido inválida: use array com perfis oficiais.", {
      permitido,
    });

    return <Navigate to={rotaSemPermissao} replace />;
  }

  if (!perfilTemAcesso(perfil, permitidoFinal)) {
    return <Navigate to={rotaSemPermissao} replace />;
  }

  return children;
}

PrivateRoute.propTypes = {
  children: PropTypes.node.isRequired,
  permitido: PropTypes.arrayOf(
    PropTypes.oneOf([PERFIL.usuario, PERFIL.organizador, PERFIL.administrador]),
  ),
  fallback: PropTypes.node,
  rotaLogin: PropTypes.string,
  rotaSemPermissao: PropTypes.string,
};
