// Regressietest gebruikers-sweep 2026-11-21 22u en 2026-11-22 06u (Sanne, desktop): wie het instellen van de
// tweede stap onderbrak en later opnieuw inlogde, kreeg (terecht) een nieuwe QR-code, maar het venster zei dat
// nergens. Een code van de eerder gescande regel in de code-app gaf "Kijk of je telefoon de tijd automatisch
// instelt" en telde als misser; het slot beloofde "dan ga je verder waar je was".
// Nu: de server zegt `hervat` als er voor deze login al een QR was, het venster zegt dat dit een nieuwe QR is en
// dat de oude regel niet meer werkt, en een foute code bij een hervatte instelling noemt de oude QR.
// Zonder browser, past in CI. `npm run test:staphervat`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- 1. de app: het venster gebruikt `hervat`, het slot belooft niets wat niet klopt ----
const idx = await readFile(join(root, "public/index.html"), "utf8");
assert.match(idx, /teken\(d,d\.hervat\?'Dit is een nieuwe QR-code\.[^']*werkt niet meer[^']*':''\)/, "het venster zegt bij hervatten dat de QR nieuw is");
assert.doesNotMatch(idx, /verder waar je was/, "het slot belooft niet dat je verdergaat met dezelfde QR");

// ---- 2. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-stathervat-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const s = createServer();
await new Promise((r) => s.listen(0, "127.0.0.1", r));
const port = s.address().port;
await new Promise((r) => s.close(r));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
  PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "aan", ACCOUNT_BEHEER_EMAILS: "", MAIL_API_SLEUTEL: "" };
for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|MAIL_)/.test(k) || k === "NODE_ENV") delete env[k];
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
let ip = 1;
const post = (pad, body) => fetch(origin + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.93.0." + (ip++) }, body: JSON.stringify(body) });

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const N = "Fysio Hervat";
  const em = "sanne@hervat.invalid", ww = "sanne-wachtwoord";
  let r = await post("/api/praktijk/claim", { praktijk: N, naam: "Sanne de Vries", email: em, wachtwoord: ww, akkoord: true, regels: true });
  assert.equal(r.status, 200, await r.clone().text());
  let d = await r.json();
  assert.equal(d.stapInstellen, true);
  assert.ok(!d.hervat, "de eerste QR is niet hervat");
  const g1 = d.geheim;

  // Sanne scant de QR (g1), sluit het venster en logt later opnieuw in: een nieuwe QR, en dat staat erbij
  r = await post("/api/praktijk/login", { praktijk: N, email: em, wachtwoord: ww });
  assert.equal(r.status, 401);
  d = await r.json();
  assert.equal(d.stapInstellen, true);
  assert.equal(d.hervat, true, "de server zegt dat er al een QR was: " + JSON.stringify(d));
  const g2 = d.geheim;
  assert.notEqual(g2, g1, "een nieuw geheim");

  // ze vult (twaalf keer) de code in van de oude regel in haar code-app: de uitleg noemt de oude QR, en het
  // telt niet als misser (na tien missers zat de login een kwartier op slot, ook voor de goede code)
  for (let i = 0; i < 12; i++) {
    r = await post("/api/praktijk/login", { praktijk: N, email: em, wachtwoord: ww, geheim: g2, code: codeVoor(g1, stapVan(Date.now())) });
    assert.equal(r.status, 403, "poging " + i);
    d = await r.json();
    assert.equal(d.oudeQr, true);
    assert.match(d.fout, /hoort bij een eerdere QR-code van Fysiplan; die werkt niet meer/, "de fout noemt de oude QR: " + d.fout);
    assert.ok(!d.geheim, "een foute code krijgt geen geheim terug");
  }
  // een code die bij geen enkele QR hoort: de uitleg noemt de oude QR als mogelijke oorzaak
  r = await post("/api/praktijk/login", { praktijk: N, email: em, wachtwoord: ww, geheim: g2, code: "000000" });
  assert.equal(r.status, 403);
  d = await r.json();
  assert.match(d.fout, /eerder al een QR-code van Fysiplan gescand\? Die werkt niet meer/, d.fout);

  // met de nieuwe QR lukt het
  r = await post("/api/praktijk/login", { praktijk: N, email: em, wachtwoord: ww, geheim: g2, code: codeVoor(g2, stapVan(Date.now())) });
  assert.equal(r.status, 200, await r.clone().text());
  d = await r.json();
  assert.ok(d.sessie && d.reservecodes.length, "ingelogd met reservecodes");

  // een tweede praktijk die nog nooit een QR kreeg: geen 'hervat', en een foute code houdt de gewone uitleg
  const N2 = "Fysio Eerste Keer";
  r = await post("/api/praktijk/claim", { praktijk: N2, naam: "Bram", email: "bram@hervat.invalid", wachtwoord: ww, akkoord: true, regels: true });
  d = await r.json();
  assert.ok(!d.hervat);
  r = await post("/api/praktijk/login", { praktijk: N2, email: "bram@hervat.invalid", wachtwoord: ww, geheim: d.geheim, code: "000000" });
  d = await r.json();
  assert.equal(r.status, 403);
  assert.doesNotMatch(d.fout, /eerder al een QR-code/, "zonder eerdere QR de gewone uitleg");
  assert.match(d.fout, /tijd automatisch/);
  assert.doesNotMatch(log, /TypeError|ReferenceError/, "geen fout in de serverlog");
  console.log("test-sweep-stap-hervat: ok");
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
