// Detecta incompatibilidade entre o build JavaScript carregado e /version.json.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildUpdateUrl,
  getBuildSignature,
  getSafeReturnPath,
  getUrlWithoutUpdateMarker,
  shouldAttemptAutomaticUpdate,
  shouldAttemptRequiredUpdate,
} from "../utils/platformVersion";

const STORAGE_KEY = "escola_build_version";
const ATTEMPT_KEY = "escola_version_update_attempt";
const CHUNK_ATTEMPT_KEY = "escola_chunk_update_attempt";
const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const IS_DEVELOPMENT = Boolean(import.meta.env.DEV);
const LOADED_BUILD_SIGNATURE = String(
  import.meta.env.VITE_BUILD_SIGNATURE || "",
).trim();

function limparMarcadorAtualizacao() {
  const urlAtual = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const urlLimpa = getUrlWithoutUpdateMarker(window.location);

  if (urlLimpa !== urlAtual) {
    window.history.replaceState(window.history.state, "", urlLimpa);
  }
}

async function buscarVersaoAtual() {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Falha ao consultar versão da plataforma: HTTP ${response.status}`,
    );
  }

  return response.json();
}

function registrarTentativa(assinatura) {
  sessionStorage.setItem(
    ATTEMPT_KEY,
    JSON.stringify({ signature: assinatura, attemptedAt: Date.now() }),
  );
}

function redirecionarParaAtualizacao(assinatura, origin = "versao") {
  const retorno = getSafeReturnPath(window.location);
  window.location.replace(
    buildUpdateUrl({
      returnPath: retorno,
      publishedSignature: assinatura,
      origin,
    }),
  );
}

export function usePlatformVersionCheck() {
  const [novaVersaoDisponivel, setNovaVersaoDisponivel] = useState(false);
  const [atualizandoAutomaticamente, setAtualizandoAutomaticamente] =
    useState(false);
  const [versaoAtual] = useState(() => ({
    assinatura: LOADED_BUILD_SIGNATURE,
  }));
  const [versaoNova, setVersaoNova] = useState(null);
  const verificandoRef = useRef(false);

  const iniciarAtualizacao = useCallback(
    (assinatura, { forcar = false, origem = "versao", minimoObrigatorio = false } = {}) => {
      if (!assinatura) {
        return false;
      }

      const deveAtualizar = minimoObrigatorio
        ? shouldAttemptRequiredUpdate({
            minimumBuild: assinatura,
            lastAttempt: sessionStorage.getItem(ATTEMPT_KEY),
          })
        : forcar ||
          shouldAttemptAutomaticUpdate({
            loadedSignature: LOADED_BUILD_SIGNATURE,
            publishedSignature: assinatura,
            lastAttempt: sessionStorage.getItem(ATTEMPT_KEY),
          });

      if (!deveAtualizar) {
        return false;
      }

      registrarTentativa(assinatura);
      setAtualizandoAutomaticamente(true);
      window.setTimeout(
        () => redirecionarParaAtualizacao(assinatura, origem),
        250,
      );
      return true;
    },
    [],
  );

  const verificarVersao = useCallback(async () => {
    if (IS_DEVELOPMENT || verificandoRef.current) {
      return;
    }

    verificandoRef.current = true;

    try {
      const payload = await buscarVersaoAtual();
      const assinaturaPublicada = getBuildSignature(payload);

      if (!assinaturaPublicada || !LOADED_BUILD_SIGNATURE) {
        return;
      }

      if (assinaturaPublicada === LOADED_BUILD_SIGNATURE) {
        localStorage.setItem(STORAGE_KEY, assinaturaPublicada);
        sessionStorage.removeItem(ATTEMPT_KEY);
        sessionStorage.removeItem(CHUNK_ATTEMPT_KEY);
        setNovaVersaoDisponivel(false);
        setAtualizandoAutomaticamente(false);
        setVersaoNova(null);
        limparMarcadorAtualizacao();
        return;
      }

      setVersaoNova(payload);
      setNovaVersaoDisponivel(true);
      iniciarAtualizacao(assinaturaPublicada);
    } catch (error) {
      console.warn(
        "[versao-plataforma] não foi possível verificar atualização",
        { message: error?.message },
      );
    } finally {
      verificandoRef.current = false;
    }
  }, [iniciarAtualizacao]);

  const atualizarPlataforma = useCallback(async () => {
    const assinatura = getBuildSignature(versaoNova);
    if (assinatura) {
      iniciarAtualizacao(assinatura, { forcar: true });
      return;
    }

    window.location.replace(
      `/atualizar.html?origem=manual&retorno=${encodeURIComponent(
        getSafeReturnPath(window.location),
      )}`,
    );
  }, [iniciarAtualizacao, versaoNova]);

  useEffect(() => {
    if (IS_DEVELOPMENT) {
      limparMarcadorAtualizacao();
      return undefined;
    }

    verificarVersao();

    const intervalId = window.setInterval(verificarVersao, CHECK_INTERVAL_MS);
    const onFocus = () => verificarVersao();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        verificarVersao();
      }
    };
    const onApiRouteNotFound = () => verificarVersao();
    const onAppUpdateRequired = (event) => {
      const minimumBuild = String(event?.detail?.minimumBuild || "").trim();
      const iniciou = iniciarAtualizacao(minimumBuild, {
        origem: "api-minima",
        minimoObrigatorio: true,
      });

      if (!iniciou) {
        setNovaVersaoDisponivel(true);
        setAtualizandoAutomaticamente(false);
        setVersaoNova({ signature: minimumBuild || null });
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("escola:api-route-not-found", onApiRouteNotFound);
    window.addEventListener("escola:app-update-required", onAppUpdateRequired);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(
        "escola:api-route-not-found",
        onApiRouteNotFound,
      );
      window.removeEventListener(
        "escola:app-update-required",
        onAppUpdateRequired,
      );
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [iniciarAtualizacao, verificarVersao]);

  return {
    novaVersaoDisponivel,
    atualizandoAutomaticamente,
    versaoAtual,
    versaoNova,
    verificarVersao,
    atualizarPlataforma,
  };
}
