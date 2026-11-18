// Fysiplan draait op drie soorten plekken: productie (echte praktijken), een testomgeving
// (dezelfde code met nepgegevens, om een wijziging te proberen voor ze naar productie gaat) en
// lokaal (ontwikkelen en de tests). Dit bestand zegt welke het is, en wat een testomgeving
// niet mag: mailen naar echte adressen, echt geld innen, in de reservekopie van productie
// schrijven, video's bij de opslag van productie zetten en starten op gegevens van productie.
// server.js leest het bij het opstarten. Uitleg voor de eigenaar: docs/testomgeving.md.
//
// Waarom zo streng: een testomgeving maak je bij Railway het snelst door productie te
// kopiëren, en dan gaan alle variabelen mee, ook de sleutels van mail, betalen en de
// reservekopie. De reservekopie schrijft één vast bestand per weekdag (lib/backup-elders.js):
// een kopie die als productie start, overschrijft dus de reservekopie van productie.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const kort = (t, n = 60) => String(t == null ? "" : t).replace(/\s+/g, " ").trim().slice(0, n);

// ---- welke omgeving is dit? ----
// "productie", "test" of "lokaal". Gooit een fout met de reden als het niet te zeggen is: de
// server start dan niet, want gokken kan hier alleen verkeerd aflopen.
// - OMGEVING=test of OMGEVING=productie wint (voor een testomgeving in een eigen project, waar
//   de omgeving bij Railway ook "production" heet).
// - Op Railway zonder die variabele: de omgeving "production" is productie, "test" is test.
//   Elke andere naam start niet: zo wordt een kopie van productie nooit ongemerkt productie.
// - Elders: lokaal, of productie met NODE_ENV=production.
export function omgevingVan(env = process.env) {
  const gekozen = String(env.OMGEVING || "").trim().toLowerCase();
  if (gekozen === "test" || gekozen === "productie") return gekozen;
  if (gekozen) throw new Error('De variabele OMGEVING is "' + kort(env.OMGEVING, 40) + '". Kies "test" of "productie", of haal de variabele weg.');
  const opRailway = Object.keys(env).some((k) => k.startsWith("RAILWAY_") && env[k]);
  if (opRailway) {
    const naam = String(env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_ENVIRONMENT || "").trim().toLowerCase();
    if (!naam || naam === "production") return "productie";
    if (naam === "test") return "test";
    throw new Error('Deze omgeving heet bij Railway "' + kort(naam, 40) + '". Fysiplan start alleen in de omgeving "production" of "test": ' +
      "een kopie van productie onder een andere naam zou echte mail sturen en de reservekopie van productie overschrijven. " +
      'Noem de omgeving "test", of zet de variabele OMGEVING op "test".');
  }
  return env.NODE_ENV === "production" ? "productie" : "lokaal";
}

// ---- het merk in de datamap ----
// De datamap van een testomgeving draagt een merk (omgeving.json). Een testomgeving start
// alleen op een lege map of op een map met dat merk, dus nooit op gegevens van productie (een
// verkeerd gekoppeld volume, een gekopieerd volume, een teruggezette reservekopie). Productie
// en lokaal starten niet op een map met het merk, dus nooit op nepgegevens.
export const MERK_BESTAND = "omgeving.json";
// wat geen gegevens zijn: het merk zelf, de map die een leeg volume al heeft, verborgen bestanden
const telNiet = (naam) => naam === MERK_BESTAND || naam === "lost+found" || naam.startsWith(".");

// Mag de server op deze datamap starten? Gooit een fout met de reden als het niet mag. In een
// testomgeving op een lege map komt het merk er eerst op te staan, vóór er iets anders is
// geschreven. Buiten de testomgeving weigert dit alleen als het merk er leesbaar staat: een
// map die niet te lezen is, houdt productie nooit tegen.
export async function keurDatamap(dataDir, omgeving, nu = Date.now()) {
  let merk = null;
  try { merk = JSON.parse(await readFile(join(dataDir, MERK_BESTAND), "utf8")); } catch {}
  const vanTest = !!merk && typeof merk === "object" && merk.omgeving === "test";
  if (omgeving !== "test") {
    if (vanTest) throw new Error("De datamap " + dataDir + " is van een testomgeving (er staat een " + MERK_BESTAND + " in). " +
      (omgeving === "productie" ? "Productie start niet op nepgegevens: koppel het volume van productie." : "Zet OMGEVING=test, of kies een andere map met DATA_DIR."));
    return { gemerkt: false, nieuw: false };
  }
  if (vanTest) return { gemerkt: true, nieuw: false };
  let namen = [];
  try { namen = await readdir(dataDir); }
  catch (e) { if (!e || e.code !== "ENOENT") throw new Error("De datamap " + dataDir + " is niet te lezen (" + kort(e && (e.code || e.message), 40) + ")."); }
  const gegevens = namen.filter((n) => !telNiet(n)).sort();
  if (gegevens.length) throw new Error("In de datamap " + dataDir + " staan al gegevens zonder het merk van een testomgeving (" + gegevens.length +
    (gegevens.length === 1 ? " bestand" : " bestanden") + ", bijvoorbeeld " + kort(gegevens[0], 40) + "). Dat kunnen gegevens van productie zijn. " +
    "Een testomgeving begint op een lege map: koppel een nieuw, leeg volume.");
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, MERK_BESTAND), JSON.stringify({ omgeving: "test", sinds: new Date(nu).toISOString(),
    uitleg: "Deze map is van een testomgeving van Fysiplan. Alles hierin is nep. Productie start niet op deze map." }, null, 2) + "\n");
  return { gemerkt: true, nieuw: true };
}

// ---- het eigen adres van een testomgeving ----
const PRODUCTIE_HOSTS = new Set(["fysiplan.nl", "www.fysiplan.nl"]);
// Elke link naar productie in een tekst wijst daarna naar `basis`. Zo stuurt een testomgeving
// niemand ongemerkt naar productie, ook niet via een link die letterlijk in een tekst staat.
export function naarEigenAdres(tekst, basis) {
  // niet als de naam nog doorloopt (fysiplan.nl.voorbeeld.com, fysiplan.nl-nep.com); een punt aan
  // het eind van een zin hoort er niet bij
  return String(tekst == null ? "" : tekst).replace(/https?:\/\/(?:www\.)?fysiplan\.nl(?![\w-]|\.[\w-])/gi, basis);
}

// Wat een testomgeving anders doet dan productie, in één keer uitgerekend uit de variabelen.
//   basis:    het adres waar links naartoe wijzen (nooit dat van productie)
//   host:     de host daarvan, voor links die de server uit het verzoek opbouwt
//   mailAan:  de adressen waar echt mail naartoe mag (TEST_MAIL_AAN)
//   mollie:   de sleutel van Mollie als het een testsleutel is, anders ""
//   genegeerd: wat er wel is ingesteld maar in een testomgeving niet wordt gebruikt
export function testRegels(env = process.env, poort = 3000) {
  const genegeerd = [];
  let basis = "";
  const eigen = String(env.FYSIPLAN_BASIS_URL || "").trim().replace(/\/+$/, "");
  if (eigen) {
    let u = null;
    try { u = new URL(eigen); } catch {}
    if (u && /^https?:$/.test(u.protocol) && !PRODUCTIE_HOSTS.has(u.hostname.toLowerCase())) basis = u.origin;
    else genegeerd.push("FYSIPLAN_BASIS_URL (wijst naar productie of is geen webadres)");
  }
  const domein = String(env.RAILWAY_PUBLIC_DOMAIN || "").trim().toLowerCase();
  if (!basis && /^[a-z0-9.-]+$/.test(domein) && !PRODUCTIE_HOSTS.has(domein)) basis = "https://" + domein;
  if (!basis) basis = "http://localhost:" + poort;

  const mailAan = [...new Set(String(env.TEST_MAIL_AAN || "").split(/[,;\s]+/).map((a) => a.trim().toLowerCase()).filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)))];

  const sleutel = String(env.MOLLIE_API_KEY || "");
  const mollie = /^test_/.test(sleutel) ? sleutel : "";
  if (sleutel && !mollie) genegeerd.push("MOLLIE_API_KEY (geen testsleutel: betalen staat uit)");

  if (Object.keys(env).some((k) => k.startsWith("BACKUP_") && env[k])) genegeerd.push("BACKUP_… (de reservekopie buiten Railway staat uit)");
  if (env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_STREAM_TOKEN) genegeerd.push("CLOUDFLARE_… (video's blijven op het eigen volume)");
  return { basis, host: new URL(basis).host.toLowerCase(), mailAan, mollie, genegeerd };
}

// ---- mail ----
// Echt mailen mag alleen naar een adres uit TEST_MAIL_AAN. Een adres met een plus (naam+iets@…)
// telt als het adres zonder: zo test één postbus meerdere accounts.
export function magEchtMailen(naar, lijst) {
  const a = String(naar || "").trim().toLowerCase();
  return !!a && Array.isArray(lijst) && (lijst.includes(a) || lijst.includes(a.replace(/\+[^@]*@/, "@")));
}
// zo ziet een bericht uit een testomgeving eruit: herkenbaar, en zonder link naar productie
export function testBericht(naar, onderwerp, tekst, basis) {
  return { naar: String(naar || ""), onderwerp: "[TEST] " + String(onderwerp || ""),
    tekst: "(Dit bericht komt uit de testomgeving van Fysiplan. Niets hierin is echt.)\n\n" + naarEigenAdres(tekst, basis) };
}

// De testpostbak: wat de testomgeving had willen mailen. Nieuwste eerst, hooguit `max`
// berichten, op schijf zodat een uitrol een verstuurde link niet wegveegt. Beheer leest hem.
export class TestPostbak {
  constructor(pad, bewaar, max = 200) { this.pad = pad; this.bewaar = bewaar; this.max = max; this.berichten = []; }
  async laad() {
    try { const d = JSON.parse(await readFile(this.pad, "utf8")); if (Array.isArray(d)) this.berichten = d.filter((b) => b && typeof b === "object").slice(0, this.max); } catch {}
  }
  // `echt`: het bericht is ook echt verstuurd (het adres staat in TEST_MAIL_AAN)
  leg(bericht, echt = false, nu = Date.now()) {
    this.berichten.unshift({ t: new Date(nu).toISOString(), naar: kort(bericht.naar, 200), onderwerp: kort(bericht.onderwerp, 300),
      tekst: String(bericht.tekst || "").slice(0, 20000), echt: !!echt });
    if (this.berichten.length > this.max) this.berichten.length = this.max;
    return this.bewaar(this.pad, this.berichten);
  }
  lijst() { return this.berichten.map((b) => ({ ...b })); }
}

// ---- zichtbaar en onvindbaar ----
// Elke pagina van een testomgeving draagt een lint en "[TEST]" in de titel van het tabblad,
// zodat niemand haar voor productie aanziet. Het lint ligt over de pagina heen en vangt geen
// klikken: de pagina eronder is dezelfde als in productie. Het is een stijlblok en geen
// script, dus het past binnen het beleid (CSP) van elke pagina. Het staat ook op een afdruk.
export const LINT_ID = "fp-testlint";
const LINT = "<style>#" + LINT_ID + "{position:fixed;left:0;top:50%;z-index:2147483647;transform:translateY(-50%);writing-mode:vertical-rl;" +
  'background:#b42318;color:#fff;font:700 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.08em;' +
  "padding:10px 5px;border-radius:0 6px 6px 0;pointer-events:none;opacity:.94;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>" +
  '<div id="' + LINT_ID + '" role="note" aria-label="Dit is de testomgeving met nepgegevens">TESTOMGEVING · nepgegevens</div>';
export function testPagina(html, basis) {
  const s = naarEigenAdres(Buffer.isBuffer(html) ? html.toString("utf8") : html, basis);
  if (s.includes('id="' + LINT_ID + '"')) return s;
  const body = /<body\b[^>]*>/i.exec(s);
  if (!body) return s; // geen hele pagina (een los stuk tekst): niets toevoegen
  const na = body.index + body[0].length;
  return (s.slice(0, na) + LINT + s.slice(na)).replace(/<title>(?!\[TEST\])/i, "<title>[TEST] ");
}

// robots.txt van een testomgeving: niets is voor een zoekmachine. Alleen /health mag worden
// opgevraagd, zodat een controle van buitenaf kan zien welke versie er draait.
export const ROBOTS_TEST = "User-agent: *\nAllow: /health\nDisallow: /\n";
