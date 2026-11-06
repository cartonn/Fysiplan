// Rechten van betrokkenen en einde van de verwerking (AVG art. 15, 17, 20, 28 lid 3 g):
// een beveiligde praktijk downloadt op /v2/gegevens alles wat Fysiplan voor haar
// bewaart, of wist het in één keer: kaarten met video's, eigen oefeningen met foto's,
// sjablonen, profiel met logo, account en logboek. Een andere praktijk blijft
// ongemoeid. Zonder browser (draait ook in CI). Onderdeel van `npm run test:privacy`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-gegevens-"));
const nu = Date.now();
const bestaat = (pad) => access(join(dataDir, pad)).then(() => true, () => false);

// ---- datamap: praktijk A (wordt gewist) en praktijk B (blijft) ----
await mkdir(join(dataDir, "uploads", "videos"), { recursive: true });
for (const f of ["uploads/videos/v-aa11.mp4", "uploads/videos/v-bb22.mp4", "uploads/oef-aaaaaaaaaaaa.jpg",
  "uploads/oef-bbbbbbbbbbbb.jpg", "uploads/logo-fysio-wis-1.png", "uploads/logo-fysio-blijf-1.png"]) {
  await writeFile(join(dataDir, f), "x");
}
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu }));
const kaart = (id, naam, vid) => ({ id, naam, ts: nu, chosen: [{ n: "Squat", i: 0 }], rows: {}, cells: {},
  vids: vid ? { Squat: vid } : {}, metingen: [{ t: nu, s: 4 }], client: { c_naam: naam } });
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio wis": { anna: kaart("aaaaaaaaaaa1", "Anna", "uploads/videos/v-aa11.mp4"), bob: kaart("aaaaaaaaaaa2", "Bob") },
  "fysio blijf": { cor: kaart("bbbbbbbbbbb1", "Cor", "uploads/videos/v-bb22.mp4") }
}));
await writeFile(join(dataDir, "praktijk-oefeningen.json"), JSON.stringify({
  "fysio wis": [{ id: "po_aaaaaaaaaaaa", naam: "Eigen brug", img: "uploads/oef-aaaaaaaaaaaa.jpg", uitleg: "Til je bekken op.", t: nu }],
  "fysio blijf": [{ id: "po_bbbbbbbbbbbb", naam: "Eigen plank", img: "uploads/oef-bbbbbbbbbbbb.jpg", uitleg: "", t: nu }]
}));
await writeFile(join(dataDir, "praktijk-sjablonen.json"), JSON.stringify({
  "fysio wis": [{ naam: "Knie week 1", oefeningen: [{ n: "Squat" }], t: nu }],
  "fysio blijf": [{ naam: "Rug", oefeningen: [{ n: "Squat" }], t: nu }]
}));
await writeFile(join(dataDir, "praktijken.json"), JSON.stringify({
  "fysio wis": { praktijk: "Fysio Wis", adres: "Straat 1", plaats: "Utrecht", logo: "uploads/logo-fysio-wis-1.png" },
  "fysio blijf": { praktijk: "Fysio Blijf", adres: "Straat 2", plaats: "Zeist", logo: "uploads/logo-fysio-blijf-1.png" }
}));

// ---- server ----
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const appPort = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${appPort}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let appOutput = "";
app.stdout.on("data", (c) => { appOutput += c; });
app.stderr.on("data", (c) => { appOutput += c; });

let ipTeller = 1;
const nieuwIp = () => "10.1.0." + (ipTeller++);
const claim = (praktijk, wachtwoord) => fetch(origin + "/api/praktijk/claim", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": nieuwIp() },
  body: JSON.stringify({ praktijk, wachtwoord, akkoord: true })
});
const formulier = (pad, velden, kop = {}) => fetch(origin + pad, {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": nieuwIp(), ...kop },
  body: new URLSearchParams(velden).toString()
});
const leesJson = async (pad) => JSON.parse(await readFile(join(dataDir, pad), "utf8"));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  assert.equal((await claim("Fysio Wis", "wis-wachtwoord-1")).status, 200);
  const claimB = await claim("Fysio Blijf", "blijf-wachtwoord-1");
  assert.equal(claimB.status, 200);
  const sessieB = (await claimB.json()).sessie;

  // ---- de pagina: scriptloos, formulieren naar zichzelf, gelinkt vanuit de juridische teksten ----
  const pagina = await fetch(origin + "/v2/gegevens");
  assert.equal(pagina.status, 200);
  const html = await pagina.text();
  assert.match(pagina.headers.get("content-security-policy"), /form-action 'self'/);
  assert.doesNotMatch(pagina.headers.get("content-security-policy"), /script-src/);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /action="\/v2\/gegevens\/download"/);
  assert.match(html, /action="\/v2\/gegevens\/wissen"/);
  assert.doesNotMatch(html, /__[A-Z_]+__/, "geen open plekken in de pagina");
  for (const pad of ["/privacy", "/verwerkersovereenkomst", "/voorwaarden"]) {
    assert.match(await (await fetch(origin + pad)).text(), /href="\/v2\/gegevens"/, pad + " linkt naar de gegevenspagina");
  }

  // ---- fout wachtwoord: niets, en geen hint of de praktijk bestaat ----
  const fout = await formulier("/v2/gegevens/download", { praktijk: "Fysio Wis", wachtwoord: "verkeerd-wachtwoord" });
  assert.equal(fout.status, 403);
  assert.match(await fout.text(), /horen niet bij elkaar/);
  const onbekend = await formulier("/v2/gegevens/download", { praktijk: "Bestaat Niet", wachtwoord: "wat-dan-ook-1" });
  assert.equal(onbekend.status, 403);
  const proto = await formulier("/v2/gegevens/wissen", { praktijk: "__proto__", wachtwoord: "x", zeker: "WISSEN" });
  assert.equal(proto.status, 403);
  const kruis = await formulier("/v2/gegevens/wissen", { praktijk: "Fysio Wis", wachtwoord: "wis-wachtwoord-1", zeker: "WISSEN" },
    { "sec-fetch-site": "cross-site" });
  assert.equal(kruis.status, 403, "een andere website kan niet laten wissen");

  // ---- downloaden: alles van de eigen praktijk, niets van een ander, geen hashes ----
  const dl = await formulier("/v2/gegevens/download", { praktijk: "fysio wis", wachtwoord: "wis-wachtwoord-1" });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get("content-disposition"), /attachment; filename="fysiplan-fysio-wis-\d{4}-\d{2}-\d{2}\.json"/);
  assert.equal(dl.headers.get("cache-control"), "no-store");
  const tekst = await dl.text();
  const pakket = JSON.parse(tekst);
  assert.deepEqual(pakket.kaarten.map((k) => k.naam).sort(), ["Anna", "Bob"]);
  assert.equal(pakket.kaarten[0].metingen[0].s, 4, "ook wat de patiënt aantikte");
  assert.ok(pakket.kaarten.every((k) => typeof k.verlooptOp === "string"));
  assert.equal(pakket.eigenOefeningen[0].naam, "Eigen brug");
  assert.equal(pakket.sjablonen[0].naam, "Knie week 1");
  assert.equal(pakket.profiel[0].plaats, "Utrecht");
  assert.match(pakket.account.verwerkersovereenkomst.versie, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(pakket.logboek.some((a) => a.actie === "alles-gedownload"));
  assert.doesNotMatch(tekst, /Cor|Eigen plank|Zeist|scrypt\$/, "geen andere praktijk en geen wachtwoordhash");

  // ---- wissen vraagt een getypte bevestiging ----
  const zonderZeker = await formulier("/v2/gegevens/wissen", { praktijk: "Fysio Wis", wachtwoord: "wis-wachtwoord-1", zeker: "ja" });
  assert.equal(zonderZeker.status, 400);
  assert.match(await zonderZeker.text(), /Typ WISSEN/);
  assert.ok((await leesJson("kaarten.json"))["fysio wis"], "zonder bevestiging blijft alles staan");
  const verkeerdWw = await formulier("/v2/gegevens/wissen", { praktijk: "Fysio Wis", wachtwoord: "verkeerd-wachtwoord", zeker: "WISSEN" });
  assert.equal(verkeerdWw.status, 403);

  // ---- alles wissen ----
  const wis = await formulier("/v2/gegevens/wissen", { praktijk: "Fysio Wis", wachtwoord: "wis-wachtwoord-1", zeker: "wissen" });
  assert.equal(wis.status, 200);
  assert.match(await wis.text(), /Alles van je praktijk is gewist[\s\S]*2 kaarten/);
  assert.equal((await leesJson("kaarten.json"))["fysio wis"], undefined, "kaarten weg");
  assert.equal((await fetch(origin + "/api/kaart?id=aaaaaaaaaaa1", { headers: { "x-forwarded-for": nieuwIp() } })).status, 404, "patiëntlink werkt niet meer");
  assert.equal((await leesJson("praktijk-oefeningen.json"))["fysio wis"], undefined, "eigen oefeningen weg");
  assert.equal((await leesJson("praktijk-sjablonen.json"))["fysio wis"], undefined, "sjablonen weg");
  assert.equal((await leesJson("praktijken.json"))["fysio wis"], undefined, "profiel weg");
  assert.equal((await leesJson("praktijk-accounts.json"))["fysio wis"], undefined, "account weg");
  assert.ok(!(await leesJson("praktijk-audit.json")).some((a) => a.praktijk === "fysio wis"), "logboek noemt de praktijk niet meer");
  assert.ok((await leesJson("praktijk-audit.json")).some((a) => a.actie === "praktijk-alles-gewist"), "het wissen zelf is gelogd, zonder naam");
  for (const f of ["uploads/videos/v-aa11.mp4", "uploads/oef-aaaaaaaaaaaa.jpg", "uploads/logo-fysio-wis-1.png"]) {
    assert.equal(await bestaat(f), false, f + " is van de schijf");
  }

  // ---- de andere praktijk blijft ongemoeid en blijft ingelogd ----
  assert.ok((await leesJson("kaarten.json"))["fysio blijf"].cor);
  assert.equal((await leesJson("praktijk-oefeningen.json"))["fysio blijf"].length, 1);
  assert.equal((await leesJson("praktijk-sjablonen.json"))["fysio blijf"].length, 1);
  assert.ok((await leesJson("praktijken.json"))["fysio blijf"]);
  for (const f of ["uploads/videos/v-bb22.mp4", "uploads/oef-bbbbbbbbbbbb.jpg", "uploads/logo-fysio-blijf-1.png"]) {
    assert.equal(await bestaat(f), true, f + " blijft");
  }
  const lijstB = await fetch(origin + "/api/kaarten?praktijk=fysio%20blijf", { headers: { "x-praktijk-sessie": sessieB, "x-forwarded-for": nieuwIp() } });
  assert.equal(lijstB.status, 200);

  // ---- de naam is weer vrij en het oude wachtwoord werkt niet meer ----
  const oudWw = await formulier("/v2/gegevens/download", { praktijk: "Fysio Wis", wachtwoord: "wis-wachtwoord-1" });
  assert.equal(oudWw.status, 403);
  assert.equal((await claim("Fysio Wis", "nieuw-wachtwoord-1")).status, 200, "praktijknaam opnieuw te beveiligen");

  console.log("Gegevens van je praktijk: downloaden en alles wissen werken.");
} catch (e) {
  console.error(appOutput.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
