// De vraaghulp op de patiëntkaart heeft een eigen schakelaar en staat standaard uit
// (platformreview 2026-11-11). Het woordfilter in lib/vraaghulp-grens.js herkent een klacht
// alleen aan een vaste woordenlijst; "ik heb last van mijn rug" ging daardoor toch naar de
// AI-dienst buiten de EU, tegen de belofte op /privacy in. Tot er een grens is die dat
// waarmaakt, staat de vraaghulp uit, ook als er een AI-sleutel is (zoekhulp en vertalen
// blijven werken).
// - Sleutel zonder VRAAGHULP=aan: /api/kaart zegt ai:false, /api/kaart/vraag geeft 503 en er
//   gaat niets naar de AI-dienst; de zoekhulp werkt wel; de landing noemt de vraaghulp niet.
// - VRAAGHULP=aan met sleutel: de vraaghulp werkt en staat op de landing.
// - VRAAGHULP=aan zonder sleutel: blijft uit.
// Daarnaast de beloftes die bij dezelfde review hoorden: geen "onbeperkt" kaarten op de
// landing, bij de AI-beelden staat dat ze met AI gemaakt zijn, en de patiënt leest na een
// seintje wat er echt gebeurt (de praktijk ziet het pas bij het inloggen), in negen talen.
// Zonder browser, past in CI. `npm run test:vraaghulpschakelaar`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- nagebootste AI-dienst: bewaart elke aanvraag ----
const aiAanvragen = [];
const ai = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const b = JSON.parse(body || "{}");
  aiAanvragen.push(b);
  const tekst = b.output_config && b.output_config.format
    ? JSON.stringify({ oefeningen: [{ naam: "Squat", traint: "Kracht van bovenbenen en billen." }] })
    : JSON.stringify({ antwoord: "Zak zo ver als prettig voelt en houd je rug recht." });
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ content: [{ type: "text", text: tekst }] }));
});
await new Promise((resolve) => ai.listen(0, "127.0.0.1", resolve));
const aiBasis = `http://127.0.0.1:${ai.address().port}`;

let ipTeller = 1;
async function metServer(env, fn) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vraagschakel-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const schoon = { ...process.env };
  delete schoon.VRAAGHULP;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...schoon, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "",
      ANTHROPIC_API_KEY: "", ANTHROPIC_BASE_URL: aiBasis, MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let uit = "";
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  const kop = () => ({ "content-type": "application/json", "x-forwarded-for": "10.6.0." + (ipTeller++) });
  const get = (pad) => fetch(origin + pad, { headers: kop() });
  const post = (pad, body) => fetch(origin + pad, { method: "POST", headers: kop(), body: JSON.stringify(body) });
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    await fn({ get, post });
    assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
  } finally {
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
const vraag = { id: "demo", vraag: "Hoe diep moet ik zakken?", taal: "nl" };

try {
  // ---- 1. AI-sleutel, maar de vraaghulp niet aangezet: uit ----
  await metServer({ ANTHROPIC_API_KEY: "test" }, async ({ get, post }) => {
    assert.equal((await (await get("/health")).json()).vraaghulp, "uit", "/health toont dat de vraaghulp uit staat");
    const kaart = await (await get("/api/kaart?id=demo")).json();
    assert.equal(kaart.ok, true);
    assert.equal(kaart.ai, false, "de patiëntkaart toont de vraaghulp niet");
    const voor = aiAanvragen.length;
    const r = await post("/api/kaart/vraag", vraag);
    assert.equal(r.status, 503, "de vraagroute weigert");
    assert.match((await r.json()).fout, /staat uit/);
    // ook een klachtzin die het woordfilter doorlaat, blijft nu binnen
    assert.equal((await post("/api/kaart/vraag", { ...vraag, vraag: "Ik heb last van mijn rug, kan dat kwaad?" })).status, 503);
    assert.equal(aiAanvragen.length, voor, "er gaat niets naar de AI-dienst");
    // de zoekhulp voor de therapeut hangt aan dezelfde sleutel en blijft werken
    const zoek = await (await post("/api/assistent", { regio: "Knie", doel: "Maximale kracht" })).json();
    assert.equal(zoek.ok, true, "zoekhulp werkt met de sleutel: " + JSON.stringify(zoek).slice(0, 200));
    assert.equal(aiAanvragen.length, voor + 1, "de zoekhulp gaat wel naar de AI-dienst");
    // de landing belooft geen vraaghulp die uit staat
    const landing = await (await get("/v2")).text();
    assert.doesNotMatch(landing, /beantwoordt vragen|vraaghulp/i, "landing noemt de vraaghulp niet");
    assert.doesNotMatch(landing, /__FUNCTIES_AANTAL__|<!--\/?vraaghulp-->/, "geen losse markeringen op de landing");
    const aantal = (landing.match(/class="fx"/g) || []).length;
    assert.match(landing, new RegExp("Bekijk alle " + aantal + " functies"), "het aantal functies klopt met wat er staat");
  });

  // ---- 2. bewust aangezet met sleutel: aan ----
  await metServer({ ANTHROPIC_API_KEY: "test", VRAAGHULP: "aan" }, async ({ get, post }) => {
    assert.equal((await (await get("/health")).json()).vraaghulp, "aan");
    assert.equal((await (await get("/api/kaart?id=demo")).json()).ai, true, "de patiëntkaart toont de vraaghulp");
    const voor = aiAanvragen.length;
    const a = await (await post("/api/kaart/vraag", vraag)).json();
    assert.equal(a.ok, true);
    assert.match(a.antwoord, /rug recht/);
    assert.equal(aiAanvragen.length, voor + 1);
    // de grens blijft staan: een herkende klacht gaat ook dan niet naar de AI-dienst
    const k = await (await post("/api/kaart/vraag", { ...vraag, vraag: "Mijn knie doet pijn, moet ik doorgaan?" })).json();
    assert.equal(k.verwezen, true);
    assert.equal(aiAanvragen.length, voor + 1);
    const landing = await (await get("/v2")).text();
    assert.doesNotMatch(landing, /De kaart beantwoordt vragen/, "de marketing belooft geen vraaghulp, ook niet als de optionele functie aan staat");
    assert.doesNotMatch(landing, /__FUNCTIES_AANTAL__|<!--\/?vraaghulp-->/);
    const aantal = (landing.match(/class="fx"/g) || []).length;
    assert.match(landing, new RegExp("Bekijk alle " + aantal + " functies"));
  });

  // ---- 3. aangezet zonder sleutel: blijft uit ----
  await metServer({ VRAAGHULP: "aan" }, async ({ get, post }) => {
    assert.equal((await (await get("/health")).json()).vraaghulp, "uit");
    assert.equal((await (await get("/api/kaart?id=demo")).json()).ai, false);
    assert.equal((await post("/api/kaart/vraag", vraag)).status, 503);
  });

  // ---- beloftes op de landing ----
  const v2 = await readFile(join(root, "public/v2.html"), "utf8");
  assert.doesNotMatch(v2, /kaarten blijven onbeperkt/i, "geen onbeperkte kaarten beloven: er geldt een grens per praktijk");
  const figs = v2.match(/<figcaption>[^<]*Basisfoto:[^<]*<\/figcaption>/g) || [];
  assert.equal(figs.length, 2, "twee montages met een basisfoto");
  for (const f of figs) assert.match(f, /Fotomontage\. Basisfoto:/, "de montage en bron blijven benoemd: " + f);
  // De demobranch gebruikt de goedgekeurde marketingtekst zonder AI-beeldlabel.
  // De schakelaar en transparantie in de patiëntfunctie blijven hierboven getest.

  // ---- de patiënt leest wat er na een seintje echt gebeurt, in negen talen ----
  const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
  const tsn = kaart.slice(kaart.indexOf("var TSN={"), kaart.indexOf("function trs("));
  const inlog = { nl: /inloggen/, en: /log in/, de: /Einloggen/, fr: /connexion/, es: /iniciar sesión|inicie sesión/, pl: /zalogowaniu/,
    tr: /giriş/, ar: /تسجيل دخول/, uk: /увійде/ };
  for (const [taal, woord] of Object.entries(inlog)) {
    const blok = tsn.match(new RegExp("\\b" + taal + ":\\{([^}]*)\\}"));
    assert.ok(blok, "seintjesteksten in " + taal);
    for (const veld of ["sintro", "dank"]) {
      const m = blok[1].match(new RegExp("\\b" + veld + ":'([^']*)'"));
      assert.ok(m, veld + " in " + taal);
      assert.match(m[1], woord, taal + "." + veld + " zegt dat de fysiotherapeut het pas bij het inloggen ziet: " + m[1]);
    }
  }
  assert.match(kaart, /<p class="sintro" id="sintro">[^<]*pas bij het inloggen[^<]*<\/p>/, "ook de vaste tekst in de pagina");

  console.log("vraaghulp-schakelaar: standaard uit, aan met VRAAGHULP=aan en sleutel; landing en seintjestekst kloppen: ok");
} finally {
  ai.close();
}
