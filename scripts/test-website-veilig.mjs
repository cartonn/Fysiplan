// Security (2026-11-13, doorgezet door de gebruikers-sweep): het webadres van de praktijk nam alles aan
// (`cleanName(b.website)`), ook `javascript:alert(1)`. Het staat bij de praktijknaam op elke patiëntkaart
// (/k) en op de A4; nu als tekst, maar wordt het ooit een link, dan voert het code uit namens de praktijk.
// Nu: POST /api/praktijken bewaart alleen https://…, http://… of een kale domeinnaam (lib/website.js),
// anders 400 met `website: true`; een oud, ongeldig adres dat al op schijf staat gaat niet meer mee in
// /api/kaart of /api/praktijken.
// Zonder browser. `npm run test:websiteveilig`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { veiligeWebsite } from "../lib/website.js";

// ---- 1. de regel ----
for (const goed of ["https://profiel.nl", "http://profiel.nl", "www.fysio-x.nl", "fysio.nl/contact?a=1", "https://fysio.nl:8080/x", "HTTPS://Fysio.NL"])
  assert.equal(veiligeWebsite(goed), goed, goed);
assert.equal(veiligeWebsite("  https://a.nl  "), "https://a.nl", "bijgesneden");
assert.equal(veiligeWebsite(""), ""); assert.equal(veiligeWebsite(undefined), "");
for (const fout of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x",
  "//evil.example", "ftp://x.nl", "https://x", "http://a.nl<script>", "https://a.nl/\"onmouseover=x", "mailto:a@b.nl", "file:///etc/passwd", "a".repeat(195) + ".nl/xx"])
  assert.equal(veiligeWebsite(fout), null, fout);

// ---- 2. de echte server ----
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-website-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
let app, uit = "";
const start = async () => {
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", MOLLIE_API_KEY: "" };
  for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE_URL$)/.test(k)) delete env[k];
  app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  throw new Error("server start niet");
};
const stop = async () => { if (app && app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); } };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.62.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });

try {
  await start();
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Web", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const basis = { praktijk: "Fysio Web", adres: "Webstraat 1", plaats: "Utrecht", tel: "030-1234567", email: "info@web.nl" };
  let r = await post("/api/praktijken", { ...basis, website: "https://web.nl" }, G);
  assert.equal(r.status, 200, "een gewoon webadres: " + uit.slice(-300));

  for (const fout of ["javascript:alert(document.domain)", "data:text/html,<script>alert(1)</script>", "//evil.example/phish"]) {
    r = await post("/api/praktijken", { ...basis, website: fout }, G);
    assert.equal(r.status, 400, "geweigerd: " + fout);
    const d = await r.json();
    assert.equal(d.website, true, "de app herkent de melding");
    assert.match(d.fout, /webadres/);
  }
  let prof = (await (await get("/api/praktijken", G)).json())[0];
  assert.equal(prof.website, "https://web.nl", "het oude, goede adres blijft staan");

  r = await post("/api/praktijken", { ...basis, website: "www.web.nl" }, G);
  assert.equal(r.status, 200, "een kale domeinnaam mag");
  r = await post("/api/praktijken", { ...basis, website: "" }, G);
  assert.equal(r.status, 200, "leeg mag");
  r = await post("/api/praktijken", basis, G);
  assert.equal(r.status, 200, "zonder website-veld (oudere app) verandert er niets");

  r = await post("/api/kaarten", { praktijk: "Fysio Web", naam: "Dirk", client: { c_naam: "Dirk" }, kaartId: "", chosen: [{ n: "Squat", i: 0 }] }, G);
  assert.equal(r.status, 200);
  const kaartId = (await r.json()).id;
  await stop();

  // een adres van vóór deze controle staat al op schijf
  const pad = join(dataDir, "praktijken.json");
  const alle = JSON.parse(await readFile(pad, "utf8"));
  const pk = Object.keys(alle).find((k) => alle[k].praktijk === "Fysio Web");
  alle[pk].website = "javascript:alert(document.cookie)";
  await writeFile(pad, JSON.stringify(alle));
  await start();
  const kaart = await (await get("/api/kaart?id=" + kaartId)).json();
  assert.ok(kaart.praktijk, "testopzet: /api/kaart geeft het profiel");
  assert.ok(!JSON.stringify(kaart).includes("javascript:"), "de patiëntkaart krijgt het oude adres niet");
  prof = (await (await get("/api/praktijken", G)).json())[0];
  assert.equal(prof.website, "", "de app ook niet");
  r = await post("/api/praktijken", { ...basis, website: "javascript:alert(document.cookie)" }, G);
  assert.equal(r.status, 400, "en terugsturen wordt geweigerd");

  console.log("test-website-veilig: ok (alleen https://, http:// of een domeinnaam; javascript:, data: en //host geweigerd; een oud ongeldig adres gaat niet meer naar buiten)");
} catch (e) {
  e.message += "\n--- server ---\n" + uit.slice(-1500);
  throw e;
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}
