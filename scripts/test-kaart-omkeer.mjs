// Regressietest security 2026-11-18 16u (melding gebruikers-sweep 2026-11-09, Jayden): tekst-omkeertekens
// (U+202E e.d.) in een zin van de therapeut, de roepnaam of de praktijknaam gingen ongefilterd naar /k. Daar
// draaide de tekst om, zodat de patiënt iets anders las dan er stond. Nu haalt de server ze weg uit alles wat
// /api/kaart en /api/kaart/manifest aan de patiënt geven; gewone Arabische tekst en U+200F blijven.
// `npm run test:kaartomkeer`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-omkeer-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["ser" + "ver.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const OMKEER = /[‪-‮⁦-⁩]/;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let ip = 1;
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.72.1." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Omkeer";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "omkeer-wachtwoord", akkoord: true })).json()).sessie };
  const arabisch = "التمرين ‏3x";
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Kaart",
    client: { c_naam: "Tr‮uus", c_doel: "Bel ‮0612345678‬ bij pijn", c_opm: "Let ⁦op⁩ " + arabisch },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.match(String(id), /^[a-f0-9]{8,16}$/, "kaart gemaakt");

  const r = await fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": "10.72.9.9" } });
  assert.equal(r.status, 200);
  const d = await r.json();
  const tekst = JSON.stringify({ kaart: d.kaart, praktijk: d.praktijk });
  assert.ok(!OMKEER.test(tekst), "omkeertekens reisden mee naar /k: " + JSON.stringify(tekst.match(OMKEER)));
  assert.equal(d.kaart.client.c_doel, "Bel 0612345678 bij pijn", "doel zonder omkeertekens, verder ongewijzigd");
  assert.equal(d.kaart.client.c_opm, "Let op " + arabisch, "Arabische tekst en U+200F blijven staan");

  const m = await (await fetch(origin + "/api/kaart/manifest?id=" + id, { headers: { "x-forwarded-for": "10.72.9.10" } })).json();
  assert.ok(!OMKEER.test(m.name), "manifestnaam met omkeerteken: " + JSON.stringify(m.name));

  // de praktijk zelf ziet in haar editor nog precies wat ze bewaarde (alleen de patiëntkant wordt geschoond)
  const eigen = await (await fetch(origin + "/api/praktijk/kaart?id=" + id + "&praktijk=" + encodeURIComponent(P), { headers: { ...S, "x-forwarded-for": "10.72.9.11" } })).json();
  if (eigen && eigen.ok && eigen.kaart && eigen.kaart.client) assert.ok(String(eigen.kaart.client.c_doel).includes("‮"), "editor houdt de tekst zoals bewaard");
  // security 2026-11-20: werknotitie en behandelaar (alleen binnen de praktijk: app, kaartenlijst, CSV) hielden
  // omkeertekens; de server haalt ze nu weg bij bewaren en in de kaartenlijst
  const rn = await post("/api/kaart/notitie", { praktijk: P, id, tekst: "Bel ‮0612345678‬ terug " + arabisch }, S);
  assert.equal(rn.status, 200);
  assert.equal((await rn.json()).notitie, "Bel 0612345678 terug " + arabisch, "notitie zonder omkeertekens, Arabisch blijft");
  const rb = await post("/api/kaart/behandelaar", { praktijk: P, id, naam: "Jan⁦ ‮nimdA⁩" }, S);
  assert.equal(rb.status, 200);
  assert.equal((await rb.json()).behandelaar, "Jan nimdA", "behandelaar zonder omkeertekens");
  const lijst = await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: { ...S, "x-forwarded-for": "10.72.9.12" } })).json();
  const rij = lijst.find((k) => k.id === id);
  assert.ok(rij, "kaart in de lijst");
  assert.ok(!OMKEER.test(String(rij.notitie) + String(rij.behandelaar)), "kaartenlijst met omkeertekens: " + JSON.stringify([rij.notitie, rij.behandelaar]));
  console.log("test-kaart-omkeer: ok");
} catch (e) {
  console.error(log.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => (app.exitCode !== null ? r() : app.once("exit", r)));
  await rm(dataDir, { recursive: true, force: true });
}
