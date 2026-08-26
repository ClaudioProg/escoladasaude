export function persistAuthStorage(storage, token, usuario) {
  const normalizedToken = token
    ? String(token)
        .replace(/^Bearer\s+/i, "")
        .trim()
    : null;

  if (
    !normalizedToken ||
    !usuario ||
    typeof usuario !== "object" ||
    !Number.isFinite(Number(usuario.id))
  ) {
    throw new Error("Dados de sessão ausentes.");
  }

  if (
    typeof usuario.perfil !== "string" ||
    !usuario.perfil ||
    usuario.perfil.trim() !== usuario.perfil
  ) {
    throw new Error("Perfil de sessão ausente.");
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
