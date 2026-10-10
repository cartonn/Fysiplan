// Offline-vangnet voor de digitale kaart (/k): netwerk eerst, cache alleen als
// terugval. Online gedrag verandert dus nooit (de verse respons wint altijd en
// ververst de cache); zonder bereik opent de kaart uit de laatste geslaagde
// lading — oefeningen, beelden en de kaartgegevens. Schrijfacties (POST) gaan
// bewust niet door de cache: zonder bereik melden ze gewoon dat het even niet
// lukte, precies zoals nu.
const CACHE = "fysiplan-kaart-v1";
const cachebaar = (url) => {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  return p.startsWith("/k/") || p === "/api/kaart" || p === "/api/kaart/manifest" || p.startsWith("/images/");
};
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url; try { url = new URL(req.url); } catch { return; }
  if (!cachebaar(url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const vers = await fetch(req);
      if (vers && vers.ok) cache.put(req, vers.clone()).catch(() => {});
      return vers;
    } catch (fout) {
      const hit = await cache.match(req);
      if (hit) return hit;
      throw fout;
    }
  })());
});
