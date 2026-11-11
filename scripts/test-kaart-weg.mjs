// Legal 2026-11-06 (cookies en lokale opslag): een gewiste kaart verdwijnt ook van de
// telefoon van de patiënt. Voorheen bleef de offline-kopie (roepnaam, oefeningen,
// pijnscores) in de cache van de service worker staan nadat de server de kaart had
// gewist; offline toonde de telefoon hem nog. Draait zonder browser: de werker loopt in
// een vm met een nagebootste Cache API. `node scripts/test-kaart-weg.mjs`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://fysiplan.test";

// ---- nagebootste Cache API ----
class NepCache {
  constructor() { this.m = new Map(); }
  sleutel(r) { return new URL(typeof r === "string" ? r : r.url, ORIGIN).href; }
  async match(r) { return this.m.get(this.sleutel(r)); }
  async put(r, a) { this.m.set(this.sleutel(r), a); }
  async delete(r) { return this.m.delete(this.sleutel(r)); }
  async keys() { return [...this.m.keys()].map((url) => ({ url })); }
}
const opslag = new Map();
const caches = {
  async open(n) { if (!opslag.has(n)) opslag.set(n, new NepCache()); return opslag.get(n); },
  async keys() { return [...opslag.keys()]; },
  async match(r) { for (const c of opslag.values()) { const a = await c.match(r); if (a) return a; } }
};

const luisteraars = {};
let serverAntwoord = () => ({ status: 200 });
const self = {
  location: { origin: ORIGIN },
  addEventListener: (t, f) => { luisteraars[t] = f; },
  skipWaiting() {}, clients: { claim: async () => {} }
};
const nepAntwoord = (status) => ({ status, clone() { return nepAntwoord(status); } });
const ctx = vm.createContext({
  self, caches, URL, Promise, console,
  fetch: async (req) => nepAntwoord(serverAntwoord(new URL(typeof req === "string" ? req : req.url, ORIGIN)).status),
  Response: { error: () => nepAntwoord(0) }
});
vm.runInContext(await readFile(join(root, "public/kaart-sw.js"), "utf8"), ctx);
assert.equal(typeof luisteraars.fetch, "function", "werker luistert naar fetch");

async function haal(pad) {
  let antwoord, wacht = [];
  luisteraars.fetch({
    request: { method: "GET", url: ORIGIN + pad, mode: pad.startsWith("/k/") ? "navigate" : "cors" },
    respondWith(p) { antwoord = p; },
    waitUntil(p) { wacht.push(p); }
  });
  const a = await antwoord;
  await Promise.all(wacht);
  await new Promise((r) => setTimeout(r, 5));
  return a;
}

// ---- twee kaarten offline bewaard ----
const WEG = "aaaa1111bbbb", BLIJFT = "cccc2222dddd";
const c = await caches.open("fysiplan-kaart-v2");
for (const id of [WEG, BLIJFT]) {
  await c.put(`/k/${id}`, nepAntwoord(200));
  await c.put(`/api/kaart?id=${id}`, nepAntwoord(200));
  await c.put(`/api/kaart/vertaal?id=${id}&taal=en`, nepAntwoord(200));
  await c.put(`/api/kaart/manifest?id=${id}`, nepAntwoord(200));
}
await c.put("/v2/oefeningen.json", nepAntwoord(200));
const heeft = async (pad) => !!(await c.match(pad));

// server zegt: deze kaart bestaat niet meer
serverAntwoord = (u) => ({ status: u.searchParams.get("id") === WEG ? 404 : 200 });
const a = await haal(`/api/kaart?id=${WEG}`);
assert.equal(a.status, 404, "de patiënt ziet 'kaart niet gevonden', niet de oude kopie");
for (const pad of [`/k/${WEG}`, `/api/kaart?id=${WEG}`, `/api/kaart/vertaal?id=${WEG}&taal=en`, `/api/kaart/manifest?id=${WEG}`])
  assert.equal(await heeft(pad), false, `offline-kopie weg: ${pad}`);
for (const pad of [`/k/${BLIJFT}`, `/api/kaart?id=${BLIJFT}`, `/api/kaart/vertaal?id=${BLIJFT}&taal=en`, "/v2/oefeningen.json"])
  assert.equal(await heeft(pad), true, `andere kaart en gedeelde bestanden blijven: ${pad}`);

// offline daarna: geen oude kaart meer uit de cache
serverAntwoord = () => { throw new Error("offline"); };
const offline = await haal(`/api/kaart?id=${WEG}`);
assert.equal(offline.status, 0, "offline geeft geen gewiste kaart meer");
const offlineBlijft = await haal(`/api/kaart?id=${BLIJFT}`);
assert.equal(offlineBlijft.status, 200, "een bestaande kaart werkt offline nog");

// een 404 op iets anders dan een kaart wist niets
serverAntwoord = () => ({ status: 404 });
await haal("/bestaat-niet.png");
await haal("/api/kaart?id=xyz");
assert.equal(await heeft(`/k/${BLIJFT}`), true, "losse 404 of ongeldig id wist geen kaart");

// 429/5xx: nog steeds de laatst geladen versie (bestaand gedrag)
serverAntwoord = () => ({ status: 503 });
assert.equal((await haal(`/api/kaart?id=${BLIJFT}`)).status, 200, "storing: laatst geladen kaart");

// ---- de kaartpagina ruimt bij 'niet gevonden' ook haar eigen geheugen op ----
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /status===404\)\{toonNietGevonden\(\);vergeetKaartWeg\(\);\}/);
const fn = kaart.match(/function vergeetKaartHier\(\)\{[^\n]*\}/);
assert.ok(fn, "vergeetKaartHier staat in kaart.html");
for (const sleutel of ["fp_oefdaan_", "fp_zwaar_", "fp_priv_", "fp_beelden_"]) assert.ok(fn[0].includes(`'${sleutel}'`), sleutel);
const ls = new Map([[`fp_oefdaan_${WEG}`, "1"], [`fp_zwaar_${WEG}`, "1"], [`fp_priv_${WEG}`, "1"], [`fp_beelden_${WEG}`, "[]"], [`fp_priv_${BLIJFT}`, "1"], ["fp_taal", "en"]]);
vm.runInNewContext("var KAART_GEWIST=false;" + fn[0] + ";vergeetKaartHier();", {
  id: WEG, localStorage: { removeItem: (k) => ls.delete(k) }
});
assert.deepEqual([...ls.keys()].sort(), [`fp_priv_${BLIJFT}`, "fp_taal"].sort(), "alleen deze kaart vergeten, taal blijft");

// ---- Legal 2026-11-11: bij 'niet gevonden' gaan ook de oefenbeelden van die kaart weg ----
// Voorheen bleven fp_beelden_<id> (kaart-id + lijst van oefenbeelden) en de beelden zelf in de
// offline-cache staan nadat de praktijk de kaart had gewist; /privacy#opslag belooft dat ze weggaan.
// Beelden die een andere kaart op dezelfde telefoon nog gebruikt, blijven.
{
  const stuk = (van, tot) => { const a = kaart.indexOf(van), b = kaart.indexOf(tot, a); assert.ok(a > -1 && b > a, van); return kaart.slice(a, b); };
  const fnWeg = kaart.match(/function vergeetKaartWeg\(\)\{[\s\S]*?\n  \}/);
  assert.ok(fnWeg, "vergeetKaartWeg staat in kaart.html");
  const code = "var KAART_GEWIST=false;" + fn[0] + "\n" + fnWeg[0] + "\n" + stuk("function kaartIdUitCache(", "function wisVanTelefoon(){");
  const A = "1111aaaa2222", B = "3333bbbb4444";
  const winkel = new Map();
  const ls2 = new Map([
    [`fp_beelden_${A}`, JSON.stringify(["/images/v2/alleen-a.webp", "/images/v2/gedeeld.webp"])],
    [`fp_beelden_${B}`, JSON.stringify(["/images/v2/gedeeld.webp", "/images/v2/alleen-b.webp"])],
    [`fp_oefdaan_${A}`, "{}"]
  ]);
  const localStorage = { getItem: (k) => (ls2.has(k) ? ls2.get(k) : null), setItem: (k, v) => ls2.set(k, String(v)), removeItem: (k) => ls2.delete(k) };
  const nc = new NepCache();
  winkel.set("fysiplan-kaart-v2", nc);
  // de service worker heeft /k/A en /api/kaart?id=A al weggehaald (404); B staat er nog
  for (const pad of [`/k/${B}`, `/api/kaart?id=${B}`, "/images/v2/alleen-a.webp", "/images/v2/gedeeld.webp", "/images/v2/alleen-b.webp", "/v2/oefeningen.json"])
    await nc.put(pad, nepAntwoord(200));
  const cachesNep = {
    async open(n) { return winkel.get(n); }, async keys() { return [...winkel.keys()]; },
    async delete(n) { return winkel.delete(n); }
  };
  const ctx2 = vm.createContext({
    id: A, localStorage, caches: cachesNep, URL, Promise, JSON, Array, Object,
    location: { href: ORIGIN + "/k/" + A }, window: { caches: cachesNep },
    performance: { getEntriesByType: () => [] }, document: { querySelectorAll: () => [] }
  });
  vm.runInContext(code + ";var KLAAR=vergeetKaartWeg();", ctx2);
  await ctx2.KLAAR;
  const over = (await nc.keys()).map((r) => new URL(r.url).pathname);
  assert.ok(!over.includes("/images/v2/alleen-a.webp"), "beeld van de gewiste kaart weg uit de offline-cache");
  assert.ok(over.includes("/images/v2/gedeeld.webp"), "beeld dat kaart B nog gebruikt blijft");
  assert.ok(over.includes("/images/v2/alleen-b.webp") && over.includes(`/k/${B}`), "kaart B blijft offline werken");
  assert.equal(ls2.has(`fp_beelden_${A}`), false, "fp_beelden_<id> van de gewiste kaart weg");
  assert.equal(ls2.has(`fp_oefdaan_${A}`), false);
  assert.equal(ls2.has(`fp_beelden_${B}`), true, "lijst van kaart B blijft");
  // daarna schrijft de pagina de lijst niet opnieuw (pagehide/load)
  vm.runInContext("bewaarBeeldenLijst();", ctx2);
  assert.equal(ls2.has(`fp_beelden_${A}`), false, "pagehide schrijft het kaart-id niet terug");

  // alleen deze kaart op de telefoon: de hele offline-cache van /k gaat weg
  winkel.set("fysiplan-kaart-v2", new NepCache());
  await winkel.get("fysiplan-kaart-v2").put("/images/v2/alleen-a.webp", nepAntwoord(200));
  ls2.set(`fp_beelden_${A}`, JSON.stringify(["/images/v2/alleen-a.webp"]));
  ls2.delete(`fp_beelden_${B}`);
  vm.runInContext("KLAAR=vergeetKaartWeg();", ctx2);
  await ctx2.KLAAR;
  assert.equal(winkel.size, 0, "geen andere kaart: offline-cache helemaal leeg");
}

console.log("test-kaart-weg: gewiste kaart verdwijnt ook offline van de telefoon, met haar oefenbeelden");
