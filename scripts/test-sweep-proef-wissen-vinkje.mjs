// Gebruikers-sweep 2026-11-09 (Mark, iPad): op de verlopen-pagina wiste "Nu meteen wissen" met één
// tik alles (verborgen zeker=1, knop 30 px, ±70 px onder "Ja, ik wil doorgaan").
// Nu een verplicht vinkje zoals het andere wisformulier, knop 44 px, en de server wist alleen
// met zeker=1. Zonder browser, past in CI. `npm run test:proefwissen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const html = await readFile(join(process.cwd(), "public/proef.html"), "utf8");
const forms = html.match(/<form method="post" action="\/v2\/proef\/wissen"[\s\S]*?<\/form>/g) || [];
assert.ok(forms.length >= 2, "twee wisformulieren");
for (const f of forms) {
  assert.doesNotMatch(f, /type="hidden" name="zeker"/, "geen verborgen zeker=1");
  assert.match(f, /type="checkbox" name="zeker" value="1" required/, "verplicht vinkje");
}

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefwissen-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
const token = randomBytes(24).toString("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud0000000000002: { id: "oud0000000000002", email: "wis@praktijk.nl", naam: "Mark Wis", tel: "+31612340002",
    praktijk: "Fysio Wis", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(token)] }
}));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = "fpproef=" + token;
const wis = (body) => fetch(origin + "/v2/proef/wissen", { method: "POST", redirect: "manual",
  headers: { cookie, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.8.1" }, body });
const bestaat = async () => {
  for (let i = 0; i < 40; i++) { await wacht(50); }
  return JSON.stringify(JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"))).includes("wis@praktijk.nl");
};
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const pagina = await (await fetch(origin + "/v2/proef", { headers: { cookie, "x-forwarded-for": "10.9.8.2" } })).text();
  assert.match(pagina, /Nu meteen wissen/, "verlopen-pagina met wisknop");
  assert.match(pagina, /Ja, wis mijn gegevens nu meteen\./, "vinkje op de verlopen-pagina");

  const zonder = await wis("");
  assert.equal(zonder.status, 303, "zonder vinkje: terug naar de proefpagina");
  assert.equal(zonder.headers.get("location"), "/v2/proef");
  assert.ok(await bestaat(), "zonder vinkje niets gewist");

  const met = await wis("zeker=1");
  assert.equal(met.status, 200);
  assert.match(await met.text(), /Je gegevens zijn gewist\./);
  assert.ok(!(await bestaat()), "met vinkje gewist");
  console.log("proef wissen met vinkje: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
