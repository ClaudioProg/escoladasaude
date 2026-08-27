export const PERFIS_SESSAO_OFICIAIS = new Set([
  "usuario",
  "organizador",
  "administrador",
]);

export function perfilSessaoOficial(perfil) {
  return typeof perfil === "string" && PERFIS_SESSAO_OFICIAIS.has(perfil)
    ? perfil
    : null;
}

export function usuarioSessaoValido(usuario) {
  return Boolean(
    usuario &&
      typeof usuario === "object" &&
      Number.isSafeInteger(Number(usuario.id)) &&
      Number(usuario.id) > 0 &&
      perfilSessaoOficial(usuario.perfil) === usuario.perfil,
  );
}

export function erroIndicaSessaoInvalida(error) {
  const status = Number(error?.status ?? error?.response?.status);

  return status === 401;
}

export function tokenMudouDuranteValidacao(tokenDaRequisicao, tokenAtual) {
  return tokenDaRequisicao !== tokenAtual;
}

export function persistAuthStorage(storage, token, usuario) {
  const normalizedToken = token
    ? String(token)
        .replace(/^Bearer\s+/i, "")
        .trim()
    : null;

  if (
    !normalizedToken ||
    !usuarioSessaoValido(usuario)
  ) {
    throw new Error("Dados de sessão ausentes.");
  }

  const perfil = usuario.perfil;

  const nextUsuario = JSON.stringify(usuario);
  const previousToken = storage.getItem("token");
  const previousUsuario = storage.getItem("usuario");
  const previousPerfil = storage.getItem("perfil");

  if (previousToken !== normalizedToken) {
    storage.setItem("token", normalizedToken);
  }

  if (previousUsuario !== nextUsuario) {
    storage.setItem("usuario", nextUsuario);
  }

  if (previousPerfil !== perfil) {
    storage.setItem("perfil", perfil);
  }

  if (
    storage.getItem("token") !== normalizedToken ||
    storage.getItem("usuario") !== nextUsuario ||
    storage.getItem("perfil") !== perfil
  ) {
    throw new Error("Dados de sessão não puderam ser confirmados.");
  }

  return {
    changed:
      previousToken !== normalizedToken ||
      previousUsuario !== nextUsuario ||
      previousPerfil !== perfil,
    normalizedToken,
    perfil,
  };
}
