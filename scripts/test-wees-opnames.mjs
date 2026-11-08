// Legal 2026-11-08 (art. 5 lid 1 e AVG, privacyverklaring en VWO art. 10): een opname
// via /o die nooit op een kaart kwam, bleef na een herstart van de server (elke deploy)
// voor altijd op de schijf, omdat het token alleen in het geheugen stond. Deze test zet
// zo'n weesbestand klaar naast een opname die wél op een kaart staat en een eigen
// oefenvideo, start de server en controleert dat alleen het weesbestand verdwijnt.
// Zonder browser (draait ook in CI). Onderdeel van `npm run test:privacy`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wees-"));
const nu = Date.now();
const videos = join(dataDir, "uploads", "videos");
await mkdir(videos, { recursive: true });
const nep = Buffer.alloc(12 * 1024); nep.write("ftyp", 4, "latin1");
const WEES = "v-aaaaaaaaaaaa.mp4", OPKAART = "v-bbbbbbbbbbbb.mp4", OEFENING = "v-cccccccccccc.webm", ANDERS = "avatar-x-1.mp4";
for (const f of [WEES, OPKAART, OEFENING, ANDERS]) await writeFile(join(videos, f), nep);
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu }));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio wees": { truus: { id: "c0c0c0c0c0d1", praktijk: "Fysio Wees", naam: "Truus", ts: nu,
    chosen: [{ n: "Squat", i: 0 }], rows: {}, cells: {}, vids: { Squat: "uploads/videos/" + OPKAART }, client: { c_naam: "Truus" } } }
}));
await writeFile(join(dataDir, "videolinks.json"), JSON.stringify({ Squat: { eigen: "uploads/videos/" + OEFENING } }));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const bestaat = (f) => access(join(videos, f)).then(() => true, () => false);

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  // de opruimronde draait na de eerste reservekopie, net na het opstarten
  for (let i = 0; i < 100 && await bestaat(WEES); i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(await bestaat(WEES), false, "een opname die op geen enkele kaart staat, moet na een herstart weg zijn\n" + uit);
  assert.equal(await bestaat(OPKAART), true, "een opname op een kaart moet blijven");
  assert.equal(await bestaat(OEFENING), true, "een eigen oefenvideo moet blijven");
  assert.equal(await bestaat(ANDERS), true, "andere videobestanden raakt de opruimronde niet aan");
  assert.match(uit, /1 niet gebruikte opname\(s\) gewist/);
  console.log("ok: weesopnames verdwijnen na een herstart, gebruikte video's blijven");
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
