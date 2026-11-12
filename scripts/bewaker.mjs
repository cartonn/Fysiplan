#!/usr/bin/env node
// De bewaker van buitenaf.
//
// Vraagt Fysiplan op zoals een bezoeker dat doet en zegt in gewone taal wat er mis is. Hij draait
// buiten Railway (.github/workflows/bewaker.yml), zodat een server die omvalt zijn eigen alarm
// niet meeneemt. Bij een storing opent hij een issue in deze repository op naam van de eigenaar
// en, als er een adres voor is ingesteld, stuurt hij een bericht naar een telefoon. Is de
// storing voorbij, dan sluit hij het issue weer. Zie docs/bewaker.md.
//
//   node scripts/bewaker.mjs https://fysiplan.nl            # alleen nakijken en vertellen
//   node scripts/bewaker.mjs https://fysiplan.nl --meld     # ook melden (vanuit de workflow)
//   node scripts/bewaker.mjs https://fysiplan.nl --proef    # een proefmelding, om het alarm te testen
//
// Afsluitcode 0: alles goed, of een storing die al gemeld was. 1: een storing die nieuw is of
// veranderd. 2: de bewaker kon zijn werk niet doen.
//
// Eén mislukte poging is nog geen storing: een uitrol herstart de server en dat duurt even. Pas
// als een controle drie keer mislukt, met een pauze ertussen, telt ze.
import { fileURLToPath } from "node:url";

export const STANDAARD = {
  omgeving: "productie", // wat /health over dit adres hoort te zeggen, als het er iets over zegt
  pogingen: 3,           // een controle telt pas als storing na zoveel mislukte pogingen
  pauzeMs: 30000,        // tussen twee pogingen
  timeoutMs: 15000,      // per verzoek
  maxFoutenPerUur: 10,   // meer serverfouten (antwoord 500) in een uur is een storing
  maxBuitenPerUur: 20,   // meer mislukte verzoeken aan een dienst van buiten is een waarschuwing
  minOefeningen: 500,    // de bibliotheek hoort minstens zoveel oefeningen te hebben
  maxKopieUur: 36,       // de laatste volledige reservekopie mag niet ouder zijn
  heropenUur: 12,        // een storing binnen zoveel uur na de vorige gaat verder in hetzelfde issue
  maxNieuwPerDag: 6,     // nooit meer nieuwe issues per dag dan dit
};
export const AGENT = "fysiplan-bewaker"; // server.js telt verzoeken met deze naam niet als bezoek

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const kort = (t, n = 160) => String(t == null ? "" : t).replace(/\s+/g, " ").trim().slice(0, n);

// ---- nakijken ----
// één verzoek, met een grens aan de tijd. Geeft altijd een uitkomst, nooit een fout.
async function haal(basis, pad, o) {
  try {
    const r = await o.fetch(basis + pad, { headers: { "user-agent": AGENT, "cache-control": "no-cache" }, redirect: "manual", signal: AbortSignal.timeout(o.timeoutMs) });
    return { status: r.status, tekst: await r.text() };
  } catch (e) {
    const tijdOp = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return { status: 0, tekst: "", fout: tijdOp ? "geeft geen antwoord binnen " + Math.round(o.timeoutMs / 1000) + " seconden"
      : "is niet bereikbaar (" + kort((e && e.cause && (e.cause.code || e.cause.message)) || (e && e.message) || e, 80) + ")" };
  }
}
// wat er mis is met een antwoord dat niet goed is
const watMis = (a, anders) => a.fout ? a.fout : a.status !== 200 ? "geeft status " + a.status + " in plaats van 200" : anders;

// De controles naast /health: wat een therapeut en een patiënt als eerste nodig hebben.
function paginas(o) {
  return [
    { code: "landing", pad: "/v2", wat: "De landingspagina", goed: (a) => a.status === 200 && /Fysiplan/.test(a.tekst), anders: "toont niet wat er hoort te staan" },
    { code: "app", pad: "/v2/app", wat: "Het werkscherm van de therapeut", goed: (a) => a.status === 200 && /FYSIPLAN_V2/.test(a.tekst), anders: "toont niet wat er hoort te staan" },
    { code: "bibliotheek", pad: "/v2/oefeningen.json", wat: "De oefenbibliotheek", anders: "ontbreekt of heeft minder dan " + o.minOefeningen + " oefeningen",
      goed: (a) => { if (a.status !== 200) return false; try { const l = JSON.parse(a.tekst); return Array.isArray(l) && l.length >= o.minOefeningen; } catch { return false; } } },
  ];
}

// Wat een geldig antwoord van /health zegt: storingen (iemand moet nu kijken) en waarschuwingen
// (het kan tot morgen). Een /health dat niet antwoordt, geeft { health: null }.
export function beoordeelHealth(a, opties = {}) {
  const o = { ...STANDAARD, ...opties };
  const nu = o.nu || Date.now();
  const storingen = [], waarschuwingen = [];
  let h = null;
  if (!a.fout && a.status === 200) { try { h = JSON.parse(a.tekst); } catch {} }
  if (!h || typeof h !== "object" || h.ok !== true || h.service !== "Fysiplan")
    return { health: null, storingen: [{ code: "health", tekst: "De server (/health) " + watMis(a, "geeft geen geldig antwoord van Fysiplan") + "." }], waarschuwingen };
  // het adres van productie mag nooit de testomgeving zijn, en omgekeerd
  if (h.omgeving && h.omgeving !== o.omgeving)
    storingen.push({ code: "omgeving", tekst: "Dit adres hoort " + o.omgeving + " te zijn, maar de server zegt: " + kort(h.omgeving, 20) + "." });
  if (o.omgeving === "productie") {
    if (h.volumeActief === false)
      storingen.push({ code: "volume", tekst: "De gegevens staan niet op het blijvende volume: na een herstart zijn ze weg." });
    if (h.backupElders === "fout") storingen.push({ code: "kopie", tekst: "De reservekopie buiten Railway is mislukt." });
    else if (h.backupElders === "deels") waarschuwingen.push({ code: "kopie-deels", tekst: "De reservekopie buiten Railway is niet volledig: er ontbreken bestanden." });
    else if (h.backupElders === "uit") waarschuwingen.push({ code: "kopie-uit", tekst: "De reservekopie buiten Railway staat uit." });
    const kopieOp = h.backupEldersOp ? Date.parse(h.backupEldersOp) : NaN;
    if (h.backupElders === "ok" && Number.isFinite(kopieOp) && (nu - kopieOp) / 3600e3 > o.maxKopieUur)
      storingen.push({ code: "kopie-oud", tekst: "De laatste volledige reservekopie is " + Math.round((nu - kopieOp) / 3600e3) + " uur oud." });
    if (h.backupRuimte === "krap") waarschuwingen.push({ code: "kopie-krap", tekst: "De gegevens zijn over de helft van wat in de reservekopie past." });
  }
  const f = h.fouten && typeof h.fouten === "object" ? h.fouten : {};
  if (Number(f.uur) > o.maxFoutenPerUur)
    storingen.push({ code: "fouten", tekst: "De server gaf het afgelopen uur " + Number(f.uur) + " keer een serverfout." });
  if (Number(f.buiten) > o.maxBuitenPerUur)
    waarschuwingen.push({ code: "buiten", tekst: "Het afgelopen uur mislukte " + Number(f.buiten) + " keer een verzoek aan een dienst van buiten (mail, video, betalen of de taalhulp)." });
  return { health: h, storingen, waarschuwingen };
}

// Het adres nakijken. Wat niet antwoordt, krijgt na een pauze een herkansing; wat een geldig
// /health over de toestand zegt (reservekopie, volume, fouten), geldt meteen.
export async function bewaak(adres, opties = {}) {
  const o = { ...STANDAARD, fetch: globalThis.fetch, wacht, ...opties };
  const basis = String(adres || "").replace(/\/+$/, "");
  const begin = Date.now();
  const alle = paginas(o);
  let open = new Set(["health", ...alle.map((c) => c.code)]); // wat (nog) nagekeken moet worden
  let health = null, vast = [], waarschuwingen = [], vluchtig = [], pogingen = 0;
  while (open.size && pogingen < o.pogingen) {
    if (pogingen++) await o.wacht(o.pauzeMs);
    const mis = [], taken = [];
    if (open.has("health")) taken.push(haal(basis, "/health", o).then((a) => {
      const b = beoordeelHealth(a, o);
      if (!b.health) { mis.push(...b.storingen); return; }
      health = b.health; vast = b.storingen; waarschuwingen = b.waarschuwingen;
    }));
    for (const c of alle) if (open.has(c.code)) taken.push(haal(basis, c.pad, o).then((a) => {
      if (!c.goed(a)) mis.push({ code: c.code, tekst: c.wat + " (" + c.pad + ") " + watMis(a, c.anders) + "." });
    }));
    await Promise.all(taken);
    vluchtig = mis;
    open = new Set(mis.map((s) => s.code));
  }
  const opCode = (a, b) => a.code.localeCompare(b.code);
  const storingen = [...vast, ...vluchtig].sort(opCode);
  return { adres: basis, ok: storingen.length === 0, storingen, waarschuwingen: [...waarschuwingen].sort(opCode), pogingen,
    commit: health ? kort(health.commit, 12) : "", omgeving: health ? kort(health.omgeving, 20) : "", duurMs: Date.now() - begin };
}

// ---- melden ----
// Het merk waaraan de bewaker zijn eigen issue herkent. Het staat onzichtbaar onderaan de tekst
// en onthoudt welke storingen er gemeld zijn en of de laatste ronde goed was. Zo schrijft de
// bewaker alleen iets als er iets verandert, en niet elke vijf minuten hetzelfde.
const MERK = /<!-- bewaker (\{[^\n]*\}) -->/;
const merk = (adres, codes, gezien, goed) => "<!-- bewaker " + JSON.stringify({ adres, codes, gezien, ...(goed ? { goed } : {}) }) + " -->";
export function merkVan(tekst, adres) {
  const m = MERK.exec(String(tekst || ""));
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    if (!d || d.adres !== adres || !Array.isArray(d.codes)) return null;
    return { ...d, gezien: Array.isArray(d.gezien) ? d.gezien : d.codes };
  } catch { return null; }
}
const tijd = (ms) => new Date(ms).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" });
const gastheer = (adres) => { try { return new URL(adres).host; } catch { return adres; } };
const lijstje = (regels) => regels.map((r) => "- " + r.tekst).join("\n");

// `gezien`: alles wat in deze storing al gemeld is (zie meld)
export function meldingTekst(uitkomst, nu = Date.now(), o = STANDAARD, gezien = null) {
  const codes = uitkomst.storingen.map((s) => s.code);
  const regels = ["De bewaker heeft " + uitkomst.adres + " nagekeken op " + tijd(nu) + " (Nederlandse tijd) en vond dit:", "", lijstje(uitkomst.storingen)];
  if (uitkomst.waarschuwingen.length) regels.push("", "Verder, minder dringend:", "", lijstje(uitkomst.waarschuwingen));
  regels.push("", "**Wat je kunt doen.** Open Railway, kies de service en kijk bij Deployments en bij Logs. Open daarna " + uitkomst.adres + "/health in je browser.",
    "", "Wat niet antwoordde, is " + o.pogingen + " keer geprobeerd met een halve minuut ertussen. De bewaker blijft kijken. Dit issue sluit vanzelf als alles twee rondes achter elkaar goed is.",
    "", uitkomst.commit ? "Versie op de server: `" + uitkomst.commit + "`." : "De server gaf geen versie terug.",
    "", merk(uitkomst.adres, codes, gezien || codes));
  return regels.join("\n");
}

// Het korte bericht voor een telefoon. Een adres van Slack krijgt JSON; elk ander adres krijgt
// platte tekst met de koppen die ntfy begrijpt (titel, hoogste voorrang). Geeft terug hoe het ging.
export async function meldTelefoon(webhook, titel, tekst, opties = {}) {
  const o = { ...STANDAARD, fetch: globalThis.fetch, ...opties };
  if (!webhook) return "geen adres ingesteld";
  let u;
  try { u = new URL(webhook); } catch { return "het adres is geen geldig webadres"; }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return "het adres moet met https beginnen";
  const slack = /(^|\.)slack\.com$/.test(u.hostname);
  const kaal = (t) => kort(t, 120).replace(/[^\x20-\x7e]/g, "?"); // een kop mag alleen gewone tekens bevatten
  try {
    const r = await o.fetch(webhook, slack
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: titel + "\n" + tekst }), signal: AbortSignal.timeout(o.timeoutMs) }
      : { method: "POST", headers: { "content-type": "text/plain; charset=utf-8", title: kaal(titel), priority: "urgent", tags: "rotating_light" }, body: String(tekst).slice(0, 3000), signal: AbortSignal.timeout(o.timeoutMs) });
    return r.ok ? "verstuurd" : "geweigerd met status " + r.status;
  } catch (e) { return "niet gelukt (" + kort(e && e.message, 60) + ")"; }
}

// praten met GitHub, als de repository waarin de workflow draait
function github(env, o) {
  const api = String(env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const repo = String(env.GITHUB_REPOSITORY || "");
  if (!env.GITHUB_TOKEN || !/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error("GITHUB_TOKEN en GITHUB_REPOSITORY ontbreken: melden kan alleen vanuit de workflow.");
  const gh = async (methode, pad, lijf) => {
    const r = await o.fetch(api + "/repos/" + repo + pad, { method: methode, signal: AbortSignal.timeout(o.timeoutMs),
      headers: { authorization: "Bearer " + env.GITHUB_TOKEN, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": AGENT, ...(lijf ? { "content-type": "application/json" } : {}) },
      ...(lijf ? { body: JSON.stringify(lijf) } : {}) });
    let d = null;
    try { d = await r.json(); } catch {}
    return { status: r.status, d };
  };
  // doet het verzoek en eist de status die erbij hoort
  gh.eis = async (status, wat, methode, pad, lijf) => {
    const r = await gh(methode, pad, lijf);
    if (r.status !== status) throw new Error(wat + " lukte niet (GitHub gaf status " + r.status + ").");
    return r.d;
  };
  gh.eigenaar = repo.split("/")[0];
  return gh;
}
// De issues waar de bewaker op mag vertrouwen: geopend door de workflow zelf of door de eigenaar
// van de repository, en geen pull request. In een openbare repository kan iedereen een issue
// openen en er een nagemaakt merk in zetten; zo'n issue mag een echte storing niet verbergen.
// `zoek` is "state=open" of "state=closed&since=…"; hooguit driehonderd per keer.
async function eigenIssues(gh, zoek) {
  const uit = [];
  for (let pagina = 1; pagina <= 3; pagina++) {
    const d = await gh.eis(200, "De issues lezen", "GET", "/issues?" + zoek + "&per_page=100&page=" + pagina);
    if (!Array.isArray(d)) throw new Error("De issues lezen lukte niet (onverwacht antwoord).");
    uit.push(...d.filter((i) => !i.pull_request && i.user && (i.user.login === "github-actions[bot]" || i.user.login === gh.eigenaar)));
    if (d.length < 100) break;
  }
  return uit;
}
// een issue openen op naam van de eigenaar; is die niet toe te wijzen (een organisatie), dan zonder
async function nieuwIssue(gh, titel, tekst) {
  // het label is er voor het overzicht; bestaat het al, dan antwoordt GitHub 422 en is het goed
  await gh("POST", "/labels", { name: "bewaker", color: "b42318", description: "Gemeld door de bewaker van buitenaf" });
  let r = await gh("POST", "/issues", { title: titel, body: tekst, labels: ["bewaker"], assignees: [gh.eigenaar] });
  if (r.status === 422) r = await gh("POST", "/issues", { title: titel, body: tekst, labels: ["bewaker"] });
  if (r.status === 422) r = await gh("POST", "/issues", { title: titel, body: tekst });
  if (r.status !== 201 || !r.d || !r.d.number) throw new Error("Het issue openen lukte niet (GitHub gaf status " + r.status + ").");
  return r.d.number;
}

// De storing bijhouden in een issue van de repository.
//   env: GITHUB_TOKEN, GITHUB_REPOSITORY (eigenaar/naam), GITHUB_API_URL, BEWAKER_WEBHOOK
// Geeft { gedaan, nieuw } terug: wat er is gedaan, en of er deze ronde iets nieuws te melden was.
export async function meld(uitkomst, env, opties = {}) {
  const o = { ...STANDAARD, fetch: globalThis.fetch, ...opties };
  const nu = o.nu || Date.now();
  const gh = github(env, o);
  const host = gastheer(uitkomst.adres);
  const titel = "Storing: " + host + " werkt niet goed";
  const codes = uitkomst.storingen.map((s) => s.code);
  const open = (await eigenIssues(gh, "state=open")).find((i) => merkVan(i.body, uitkomst.adres)) || null;
  const stand = open ? merkVan(open.body, uitkomst.adres) : null;
  const telefoon = async (kop, tekst) => "telefoon: " + await meldTelefoon(env.BEWAKER_WEBHOOK, kop, tekst, o);

  if (uitkomst.ok) {
    if (!open) return { gedaan: [], nieuw: false };
    // Eén goede ronde is nog geen einde: een server die hapert, antwoordt de ene keer wel en de
    // andere keer niet. De eerste goede ronde wordt onthouden, de tweede sluit het issue.
    if (!stand.goed) {
      await gh.eis(200, "Het issue bijwerken", "PATCH", "/issues/" + open.number, { body: open.body.replace(MERK, () => merk(uitkomst.adres, stand.codes, stand.gezien, new Date(nu).toISOString())) });
      return { gedaan: ["issue #" + open.number + ": deze ronde was goed, bij de volgende goede ronde gaat het dicht"], nieuw: false };
    }
    const sinds = Date.parse(open.created_at), goedOp = Date.parse(stand.goed);
    const duur = Number.isFinite(sinds) && Number.isFinite(goedOp) ? Math.max(1, Math.round((goedOp - sinds) / 60000)) : null;
    await gh.eis(201, "Het bericht bij het issue", "POST", "/issues/" + open.number + "/comments", { body: "Voorbij: sinds " + tijd(Number.isFinite(goedOp) ? goedOp : nu) + " zijn alle controles weer goed." + (duur ? " De storing stond ongeveer " + duur + " minuten open." : "") });
    await gh.eis(200, "Het issue sluiten", "PATCH", "/issues/" + open.number, { state: "closed", state_reason: "completed" });
    return { gedaan: ["issue #" + open.number + " gesloten", await telefoon("Voorbij: " + host, "Alle controles zijn weer goed." + (duur ? " De storing duurde ongeveer " + duur + " minuten." : ""))], nieuw: false };
  }

  const kortBericht = uitkomst.storingen.map((s) => s.tekst).join(" ");
  if (open) {
    // dezelfde storing loopt door: niets schrijven
    if (stand.codes.join(",") === codes.join(",") && !stand.goed) return { gedaan: ["issue #" + open.number + " staat al open, niets veranderd"], nieuw: false };
    // De tekst van het issue zegt altijd wat er nu mis is. Een nieuw bericht komt er alleen als
    // er iets misgaat dat in deze storing nog niet gemeld was: een storing die heen en weer
    // gaat tussen dezelfde klachten, geeft zo geen stroom berichten.
    const erbij = uitkomst.storingen.filter((s) => !stand.gezien.includes(s.code));
    const gezien = [...new Set([...stand.gezien, ...codes])].sort();
    await gh.eis(200, "Het issue bijwerken", "PATCH", "/issues/" + open.number, { body: meldingTekst(uitkomst, nu, o, gezien) });
    if (!erbij.length) return { gedaan: ["issue #" + open.number + " bijgewerkt, zonder nieuw bericht"], nieuw: false };
    await gh.eis(201, "Het bericht bij het issue", "POST", "/issues/" + open.number + "/comments", { body: "Er is iets bijgekomen (" + tijd(nu) + "):\n\n" + lijstje(erbij) });
    return { gedaan: ["issue #" + open.number + " bijgewerkt met een nieuw bericht", await telefoon(titel, kortBericht)], nieuw: true };
  }
  const tekst = meldingTekst(uitkomst, nu, o);

  // geen open issue. Was er kort geleden al een storing, dan gaat die verder in hetzelfde issue.
  const sinds = new Date(nu - 24 * 3600e3).toISOString();
  const eerder = (await eigenIssues(gh, "state=closed&since=" + encodeURIComponent(sinds) + "&sort=updated&direction=desc")).filter((i) => merkVan(i.body, uitkomst.adres));
  const vorige = eerder.find((i) => nu - Date.parse(i.closed_at) < o.heropenUur * 3600e3);
  if (vorige) {
    await gh.eis(200, "Het issue heropenen", "PATCH", "/issues/" + vorige.number, { state: "open", body: tekst });
    await gh.eis(201, "Het bericht bij het issue", "POST", "/issues/" + vorige.number + "/comments", { body: "Opnieuw een storing (" + tijd(nu) + "):\n\n" + lijstje(uitkomst.storingen) });
    return { gedaan: ["issue #" + vorige.number + " heropend", await telefoon(titel, kortBericht)], nieuw: true };
  }
  // een rem voor het geval er iets misgaat met terugvinden: nooit een stroom nieuwe issues
  const vandaag = eerder.filter((i) => nu - Date.parse(i.created_at) < 24 * 3600e3).length;
  if (vandaag >= o.maxNieuwPerDag) throw new Error("Er zijn vandaag al " + vandaag + " issues voor een storing geopend. De bewaker opent er geen meer; kijk in de lijst met issues.");
  const nummer = await nieuwIssue(gh, titel, tekst);
  return { gedaan: ["issue #" + nummer + " geopend", await telefoon(titel, kortBericht)], nieuw: true };
}

// Een proefmelding: hetzelfde pad als een echte storing, zodat je één keer ziet of het alarm
// je bereikt. Opent een issue op naam van de eigenaar, stuurt het telefoonbericht en sluit het
// issue meteen weer.
export async function proefmelding(adres, env, opties = {}) {
  const o = { ...STANDAARD, fetch: globalThis.fetch, ...opties };
  const nu = o.nu || Date.now();
  const gh = github(env, o);
  const nummer = await nieuwIssue(gh, "Proefmelding van de bewaker", [
    "Dit is een proef, er is niets aan de hand. Zo ziet een melding eruit als " + gastheer(adres) + " niet goed werkt.",
    "", "Kreeg je hierover een mail of een melding van GitHub? Dan bereikt het alarm je. Zo niet, kijk dan bij GitHub onder Settings, Notifications (zie docs/bewaker.md).",
    "", "Verstuurd op " + tijd(nu) + " (Nederlandse tijd). Dit issue is meteen weer gesloten.", "", "<!-- bewaker-proef -->"].join("\n"));
  const hoe = await meldTelefoon(env.BEWAKER_WEBHOOK, "Proefmelding van de bewaker", "Dit is een proef, er is niets aan de hand. Zo komt een storing van " + gastheer(adres) + " binnen.", o);
  await gh.eis(200, "Het issue sluiten", "PATCH", "/issues/" + nummer, { state: "closed", state_reason: "completed" });
  return { gedaan: ["issue #" + nummer + " geopend en weer gesloten", "telefoon: " + hoe] };
}

// Is de repository besloten, dan gaat elke ronde van het tegoed bij GitHub af. Zolang niemand
// daar bewust voor kiest (de variabele BEWAKER), zet de bewaker zichzelf uit en zegt hij dat in
// een issue. In een openbare repository is de bewaker gratis en doet deze functie niets.
const UIT_MERK = "<!-- bewaker-uit -->";
export async function zuinigheid(env, opties = {}) {
  const o = { ...STANDAARD, fetch: globalThis.fetch, ...opties };
  if (String(env.BEWAKER || "").trim()) return { door: true };
  const gh = github(env, o);
  const r = await gh("GET", "");
  if (r.status !== 200 || !r.d || r.d.private !== true) return { door: true };
  let nummer = ((await eigenIssues(gh, "state=open")).find((i) => String(i.body || "").includes(UIT_MERK)) || {}).number;
  if (!nummer) nummer = await nieuwIssue(gh, "De bewaker staat uit: de repository is besloten", [
    "De repository is besloten. Elke ronde van de bewaker gaat dan van het tegoed bij GitHub af, en om de vijf minuten zijn dat ruim 8.600 rondes per maand. Daarom heeft de bewaker zichzelf uitgezet.",
    "", "**Er is nu geen bewaking van buitenaf.**",
    "", "Wat je kunt kiezen, staat in docs/bewaker.md: een dienst van buiten die elke minuut kijkt, of de bewaker hier weer aanzetten met de variabele `BEWAKER` (`snel` of `zuinig`).", "", UIT_MERK].join("\n"));
  const uit = await gh("PUT", "/actions/workflows/bewaker.yml/disable");
  return { door: false, uitgezet: uit.status === 204, issue: nummer };
}

// ---- vanaf de opdrachtregel ----
async function hoofd(argv, env, log = console.log) {
  const adressen = [];
  let omgeving = STANDAARD.omgeving, melden = false, proef = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--meld") melden = true;
    else if (argv[i] === "--proef") proef = true;
    else if (argv[i] === "--omgeving") omgeving = String(argv[++i] || "");
    else adressen.push(argv[i]);
  }
  if (adressen.length !== 1 || !/^https?:\/\/[^\s/]+/.test(adressen[0]) || !["productie", "test", "lokaal"].includes(omgeving)) {
    console.error("Gebruik: node scripts/bewaker.mjs <adres> [--omgeving productie|test|lokaal] [--meld] [--proef]");
    return 2;
  }
  const inActions = !!env.GITHUB_ACTIONS;
  // de tijden zijn in te stellen voor de test (scripts/test-bewaker.mjs)
  const tijden = {};
  const seconden = (naam) => env[naam] !== undefined && env[naam] !== "" && Number.isFinite(Number(env[naam])) ? Math.max(0, Number(env[naam])) * 1000 : null;
  if (seconden("BEWAKER_PAUZE_S") !== null) tijden.pauzeMs = seconden("BEWAKER_PAUZE_S");
  if (seconden("BEWAKER_TIMEOUT_S") !== null) tijden.timeoutMs = seconden("BEWAKER_TIMEOUT_S");
  if (proef) {
    for (const g of (await proefmelding(adressen[0], env, tijden)).gedaan) log("Proefmelding: " + g + ".");
    return 0;
  }
  if (melden) {
    const z = await zuinigheid(env, tijden);
    if (!z.door) {
      log("De repository is besloten en de variabele BEWAKER is niet gekozen (issue #" + z.issue + ").");
      if (z.uitgezet) { log("De bewaker heeft zichzelf uitgezet."); return 0; }
      throw new Error("De bewaker kon zichzelf niet uitzetten. Zet de workflow uit onder Actions, of kies de variabele BEWAKER.");
    }
  }
  const uitkomst = await bewaak(adressen[0], { omgeving, ...tijden });
  log(uitkomst.ok ? "Goed: " + uitkomst.adres + (uitkomst.omgeving ? " (" + uitkomst.omgeving + ")" : "") + ", versie " + (uitkomst.commit || "onbekend") + ", in " + uitkomst.duurMs + " ms."
    : "STORING op " + uitkomst.adres + ":");
  // binnen GitHub Actions als opmerking bij de ronde; daar zijn % en regeleinden bijzondere tekens
  const veilig = (t) => String(t).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  for (const s of uitkomst.storingen) log(inActions ? "::error title=Storing::" + veilig(s.tekst) : "  - " + s.tekst);
  for (const w of uitkomst.waarschuwingen) log(inActions ? "::warning title=Let op::" + veilig(w.tekst) : "  let op: " + w.tekst);
  if (!melden) return uitkomst.ok ? 0 : 1;
  const m = await meld(uitkomst, env, tijden);
  for (const g of m.gedaan) log("  " + g);
  return m.nieuw ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (typeof fetch !== "function" || typeof AbortSignal.timeout !== "function") { console.error("De bewaker heeft Node 18 of nieuwer nodig."); process.exit(2); }
  hoofd(process.argv.slice(2), process.env).then((code) => { process.exitCode = code; },
    (e) => { console.error((process.env.GITHUB_ACTIONS ? "::error title=De bewaker kon zijn werk niet doen::" : "De bewaker kon zijn werk niet doen: ") + kort(e && e.message ? e.message : e, 400).replace(/%/g, "%25")); process.exitCode = 2; });
}
