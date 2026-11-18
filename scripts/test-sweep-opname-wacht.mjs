// Regressietest gebruikers-sweep 2026-11-13 10u (Mark): een eigen opname via /o die nog op geen bewaarde kaart
// stond, (1) was voor de eigen praktijk niet te bekijken (404) en (2) werd stil weggegooid zodra het uploadtoken
// na een kwartier verliep. De editor bewaart de kaart pas als er een roepnaam staat: wie vroeg in het consult
// opnam en later de naam invulde, verloor de video zonder melding (de kaart kwam terug met vids:{}).
// Nu: de eigen praktijk ziet de opname meteen (een andere praktijk en anoniem niet), en een binnengekomen
// opname blijft OPNAME_BEWAAR_MS (standaard 4 uur) wachten op een kaart. Een token zonder upload verloopt nog
// steeds na OPNAME_TTL_MS. Zonder browser (draait ook in CI). `npm run test:opnamewacht`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opname-wacht-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const TTL = 1500;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    OPNAME_TTL_MS: String(TTL), OPNAME_BEWAAR_MS: "60000" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.3." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const bestaat = (pad) => access(join(dataDir, pad)).then(() => true, () => false);
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = async (praktijk) => {
    const r = await post("/api/praktijk/claim", { praktijk, wachtwoord: "wachtwoord-" + praktijk.length + "-test", akkoord: true });
    assert.equal(r.status, 200, "claim " + praktijk);
    return (await r.json()).sessie;
  };
  const sA = await sessie("Fysio Wacht"), sB = await sessie("Fysio Anders");
  const video = Buffer.alloc(12 * 1024); video.write("ftypisom", 4, "latin1");
  const start = async () => (await (await post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": sA })).json()).token;
  const upload = (token) => fetch(origin + "/api/opname/upload?token=" + token, {
    method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.7.4." + (ip++) }, body: video });

  const token = await start();
  const up = await upload(token);
  assert.equal(up.status, 200, "upload lukt");
  const pad = (await up.json()).video;
  assert.match(pad, /^uploads\/videos\/v-[a-f0-9]+\.mp4$/);

  // (1) bekijken vóór het bewaren van de kaart
  const kijk = (extra) => fetch(origin + "/" + pad, { headers: { "x-forwarded-for": "10.7.5." + (ip++), ...extra } });
  assert.equal((await kijk({ "x-praktijk-sessie": sA })).status, 200, "eigen praktijk ziet haar nieuwe opname al vóór het bewaren");
  assert.equal((await kijk({ "x-praktijk-sessie": sB })).status, 404, "een andere praktijk ziet hem niet");
  assert.equal((await kijk({})).status, 404, "anoniem ziet hem niet");

  // (2) het uploadtoken verloopt, de opname blijft wachten op een kaart
  const leeg = await start(); // token zonder upload
  await wacht(TTL + 600);
  await start(); // stoot de opschoning aan
  await wacht(300);
  assert.equal((await upload(leeg)).status, 404, "een token zonder upload verloopt nog steeds na OPNAME_TTL_MS");
  assert.equal((await upload(token)).status, 404, "met het token kan maar één keer worden geüpload");
  assert.ok(await bestaat(pad), "de binnengekomen opname staat na het verlopen van het token nog op schijf");
  const rA = await post("/api/kaarten", { praktijk: "Fysio Wacht", naam: "Anna", kaartId: "", client: { c_naam: "Anna" },
    chosen: [{ n: "Squat", i: 0 }], vids: { squat: pad } }, { "x-praktijk-sessie": sA });
  assert.equal(rA.status, 200);
  const idA = (await rA.json()).id;
  const pub = await (await fetch(origin + "/api/kaart?id=" + idA, { headers: { "x-forwarded-for": "10.7.6.1" } })).text();
  assert.ok(pub.includes(pad.split("/").pop()), "de opname komt na het verlopen van het token nog mee op de kaart");
  // een andere praktijk kan hem nog steeds niet op haar kaart zetten
  const rB = await post("/api/kaarten", { praktijk: "Fysio Anders", naam: "Piet", kaartId: "", client: { c_naam: "Piet" },
    chosen: [{ n: "Squat", i: 0 }], vids: { squat: pad } }, { "x-praktijk-sessie": sB });
  const pubB = await (await fetch(origin + "/api/kaart?id=" + (await rB.json()).id, { headers: { "x-forwarded-for": "10.7.6.2" } })).text();
  assert.ok(!pubB.includes(pad.split("/").pop()), "vreemde opname niet op de kaart van een andere praktijk");
  console.log("test-sweep-opname-wacht: eigen opname direct te zien en wacht op de kaart, ook na het verlopen van het token");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
