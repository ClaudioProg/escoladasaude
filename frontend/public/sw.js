/*
 * Migração controlada do PWA legado (FASE 1).
 *
 * Este arquivo ocupa deliberadamente o URL histórico gerado pelo
 * vite-plugin-pwa: /sw.js, com escopo /. Ele não recria o PWA nem atende
 * requisições: sua única função é retirar caches Workbox de bundles antigos e
 * levar as janelas controladas à página estática de atualização.
 *
 * FASE 2: o cliente atual passa a enviar X-Client-Build e recebe o contrato
 * APP_UPDATE_REQUIRED quando o backend ativar uma versão mínima.
 * FASE 3: depois de observada a migração, remover este arquivo e os dois
 * adaptadores HTTP legados em uma mudança de retirada explícita.
 */

const UPDATE_URL = "/atualizar.html?origem=legacy-pwa&retorno=%2Fpainel";

function isLegacyPlatformCache(cacheName) {
  const name = String(cacheName || "").toLowerCase();

  return (
    name.startsWith("workbox-precache-") ||
    name.startsWith("workbox-runtime") ||
    name === "api-cache" ||
    name === "google-fonts" ||
    name === "images" ||
    name.startsWith("escola-") ||
    name.startsWith("vite-")
  );
}

async function removeLegacyPlatformCaches() {
  const names = await caches.keys();

  await Promise.all(
    names
      .filter(isLegacyPlatformCache)
      .map((cacheName) => caches.delete(cacheName)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await removeLegacyPlatformCaches();
      await self.clients.claim();

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      await Promise.all(
        clients.map((client) => client.navigate(UPDATE_URL).catch(() => null)),
      );
    })(),
  );
});

// Sem handler de fetch: após a ativação, os recursos continuam sendo buscados
// na rede. A página /atualizar.html encerra este registro após a limpeza.
