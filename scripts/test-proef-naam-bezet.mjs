// Gebruikers-sweep 2026-11-20 18u (Sanne): /v2/proef nam de naam van een al beveiligde praktijk stil
// aan; de nieuwe gebruiker liep daarna in de app vast op "Deze praktijk is beveiligd. Log in". Nu zegt het
// proefformulier het meteen (409, melding bij het veld, focus erop) en bewaart het niets. Een andere naam,
// of het veld leeg, gaat gewoon door. Zonder browser (CI). `npm run test:proefnaambezet`
// (faalt zonder de fix: de aanmelding gaf 303 naar /v2/app)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-naambezet-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
const tokenA = randomBytes(24).toString("hex");
const adres = (n) => ["proef" + n, "voorbeeld.nl"].join("@");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  proefa0000000001: { id: "proefa0000000001", email: adres("a"), naam: "Anna Proef", tel: "+31612340010",
    gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, akkoord: "x", tokens: [sha(tokenA)] }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "",
    PROEF_VERPLICHT: "aan", EIGEN_LOGIN_VERPLICHT: "uit" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });

let ip = 0;
const aanmelden = (velden) => fetch(origin + "/v2/proef", { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", origin, "sec-fetch-site": "same-origin",
    "x-forwarded-for": "10.88." + (++ip) + ".1" },
  body: new URLSearchParams({ naam: "Sanne Proef", tel: "0612345679", akkoord: "1", vwo: "1", ...velden }).toString() });
const aantalProeven = async () => Object.keys(JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"))).length;

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // proef A beveiligt "Fysio Bezet"
  const claim = await fetch(origin + "/api/praktijk/claim", { method: "POST",
    headers: { "content-type": "application/json", cookie: "fpproef=" + tokenA, "x-forwarded-for": "10.77.1.1" },
    body: JSON.stringify({ praktijk: "Fysio Bezet", wachtwoord: "lang-genoeg-1", akkoord: true }) });
  assert.equal(claim.status, 200, "praktijk beveiligd");
  const voor = await aantalProeven();

  // een nieuwe proef met die naam (andere hoofdletters en spaties): meteen uitleg, niets bewaard
  const r = await aanmelden({ email: adres("sanne"), praktijk: "  fysio BEZET " });
  assert.equal(r.status, 409, "geweigerd met uitleg");
  assert.equal(r.headers.get("set-cookie"), null, "geen proefcookie");
  const html = await r.text();
  assert.match(html, /al een beveiligde praktijk met deze naam/);
  assert.match(html, /uitnodiging in Team/);
  assert.match(html, /id="praktijk"[^>]*autofocus aria-invalid="true" aria-describedby="fout-praktijk"/, "focus en melding aan het veld");
  assert.match(html, /id="fout-praktijk"/);
  assert.match(html, /value="Sanne Proef"/, "ingevulde velden blijven staan");
  assert.equal(await aantalProeven(), voor, "geen nieuwe aanmelding bewaard");

  // een herkenbare andere naam gaat door
  const r2 = await aanmelden({ email: adres("sanne"), praktijk: "Fysio Bezet Utrecht" });
  assert.equal(r2.status, 303, "andere naam aangenomen");
  assert.equal(r2.headers.get("location"), "/v2/app");
  // zonder praktijknaam ook
  const r3 = await aanmelden({ email: adres("tim"), praktijk: "" });
  assert.equal(r3.status, 303, "leeg veld aangenomen");
  assert.equal(await aantalProeven(), voor + 2);

  // wie de proef al heeft (zelfde e-mailadres), gaat de gewone weg ("Kijk in je mail"), geen naamfout
  const r4 = await aanmelden({ email: adres("a"), praktijk: "Fysio Bezet" });
  assert.equal(r4.status, 200);
  assert.match(await r4.text(), /Kijk in je mail|loopt al een proef/);

  console.log("Proef met de naam van een beveiligde praktijk: alle controles geslaagd.");
} catch (err) {
  console.error(uit);
  throw err;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
