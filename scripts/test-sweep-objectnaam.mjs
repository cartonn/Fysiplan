// Regressietest gebruikers-sweep 2026-11-19 14u (Mark, API): een object als naam van een teamsjabloon of van een
// oefening in een sjabloon gaf 200 met "[object Object]" in de lijst van de hele praktijk; een object als uitleg van
// een eigen oefening werd ook "[object Object]". Nu: sjabloonnaam of oefeningnaam als object → nette 400, s/h/w
// alleen tekst of getal, uitleg alleen tekst. Alleen server, geen browser. `npm run test:objectnaam`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-objectnaam-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
const bewaar = (c) => { uit = (uit + c).slice(-4000); };
app.stdout.on("data", bewaar);
app.stderr.on("data", bewaar);
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.67.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: "Fysio Object", wachtwoord: "praktijk-wachtwoord", akkoord: true })).json()).sessie };
  const K = { "x-praktijk-sessie": (await (await post("/api/praktijk/team/eigen-login", { naam: "Mark Test", email: "mark@object.nl", wachtwoord: "mark-wachtwoord", regels: true }, G)).json()).sessie };
  assert.ok(K["x-praktijk-sessie"], "eigen login");

  let r = await post("/api/praktijk/sjablonen", { naam: { a: 1 }, oefeningen: [{ n: "Brug" }] }, K);
  assert.equal(r.status, 400, "object als sjabloonnaam geweigerd");
  r = await post("/api/praktijk/sjablonen", { naam: ["x"], oefeningen: [{ n: "Brug" }] }, K);
  assert.equal(r.status, 400, "lijst als sjabloonnaam geweigerd");
  r = await post("/api/praktijk/sjablonen", { naam: "Knie", oefeningen: [{ n: { a: 1 }, s: { b: 2 } }] }, K);
  assert.equal(r.status, 400, "alleen oefeningen met een object als naam: geen sjabloon");
  r = await post("/api/praktijk/sjablonen", { naam: "Knie", oefeningen: [{ n: "Brug", s: { b: 2 }, h: 10, w: "5 kg" }] }, K);
  assert.equal(r.status, 200, "gewoon sjabloon mag");
  const lijst = await (await get("/api/praktijk/sjablonen", K)).json();
  const tekst = JSON.stringify(lijst);
  assert.ok(!tekst.includes("[object"), "nergens [object Object] in de sjablonen: " + tekst.slice(0, 300));
  assert.match(tekst, /"h":"10"/, "getal als herhalingen blijft");

  r = await post("/api/praktijk/oefeningen", { naam: "Eigen brug", uitleg: { x: 1 }, img: PNG }, K);
  if (r.status === 200) {
    const oef = JSON.stringify(await (await get("/api/praktijk/oefeningen", K)).json());
    assert.ok(!oef.includes("[object"), "uitleg van een eigen oefening wordt geen [object Object]");
  } else {
    assert.ok(r.status >= 400 && r.status < 500, "eigen oefening met object-uitleg: nette weigering, geen 500 (" + r.status + ")");
  }
  console.log("test-sweep-objectnaam: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
