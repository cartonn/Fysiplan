// Regressietest gebruikers-sweep 2026-11-22 06u (Mark, desktop): bij drie uitnodigingen na elkaar stond in Team
// alleen de laatste link, zonder naam; eerdere links waren weg, en opnieuw uitnodigen maakte de oude link stil
// dood. Nu staat bij elke link voor wie hij is, blijven eerdere links van deze sessie te kopiëren, en zegt de server
// `vervangen` als er voor die collega nog een geldige link was. Browserdeel: test-team.mjs.
// Zonder browser, past in CI. `npm run test:uitnodiglinks`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const idx = await readFile(join(root, "public/index.html"), "utf8");
assert.match(idx, /var TEAM_LINKS=\[\];/, "de links van deze sessie worden bewaard");
assert.match(idx, /"Stuur <b style='color:var\(--ink\)'>"\+wieVan\(eerste\)/, "de link noemt naam en e-mail");
assert.match(idx, /tekenTeamLinks\(null\);\n\s*var uDo=document\.getElementById\('tm_udo'\)/, "Team opnieuw openen toont de links van deze sessie weer");
assert.match(idx, /r\.vervangen\?"<div id='tm_vervangen'/, "opnieuw uitnodigen zegt dat de vorige link niet meer werkt");
assert.match(idx, /function prakUitgelogd\(\)\{\s*TEAM_LINKS=\[\];/, "uitloggen wist de links");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-uitnodiglinks-"));
const s = createServer();
await new Promise((r) => s.listen(0, "127.0.0.1", r));
const port = s.address().port;
await new Promise((r) => s.close(r));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" };
for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS)/.test(k) || k === "NODE_ENV" || k === "EIGEN_LOGIN_VERPLICHT" || k === "PROEF_VERPLICHT") delete env[k];
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.94.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const adres = (wie) => wie + "@links.invalid";
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let r = await post("/api/praktijk/claim", { praktijk: "Fysio Links", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const G = { "x-praktijk-sessie": (await r.json()).sessie };
  r = await post("/api/praktijk/team/eigen-login", { naam: "Houder", email: adres("houder"), wachtwoord: "houder-wachtwoord", regels: true }, G);
  assert.equal(r.status, 200, await r.clone().text());
  const M = { "x-praktijk-sessie": (await r.json()).sessie };
  const nodig = async (naam, email) => {
    const x = await post("/api/praktijk/team/uitnodigen", { naam, email, rol: "therapeut" }, M);
    assert.equal(x.status, 200, await x.clone().text());
    return x.json();
  };
  const a = await nodig("Collega Een", adres("een"));
  assert.ok(!a.vervangen, "eerste uitnodiging vervangt niets");
  assert.equal(a.lid.naam, "Collega Een");
  assert.equal(a.lid.email, adres("een"));
  const b = await nodig("Collega Twee", adres("twee"));
  assert.ok(!b.vervangen, "een andere collega vervangt niets");
  const a2 = await nodig("Collega Een", adres("een"));
  assert.equal(a2.vervangen, true, "opnieuw uitnodigen zegt dat de vorige link vervalt");
  const oud = await fetch(a.link.replace(/^https?:\/\/[^/]+/, origin), { headers: { "x-forwarded-for": "10.94.1.1" } });
  assert.match(await oud.text(), /werkt niet meer/, "de vorige link werkt echt niet meer");
  assert.doesNotMatch(log, /TypeError|ReferenceError/);
  console.log("test-sweep-uitnodiglinks: ok");
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
