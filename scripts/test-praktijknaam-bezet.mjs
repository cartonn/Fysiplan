// Security (2026-11-12, gebruikers-sweep 02u, Karin): een beheerder kon de praktijk stil hernoemen
// naar de naam van een ándere beveiligde praktijk (POST /api/praktijken → 200). Patiënten zagen
// daarna op /k de naam van die andere praktijk, en inloggen op die naam kwam ook hier uit, zonder
// vraag en zonder regel in Activiteit. Dubbele namen mogen (zoals bij het beveiligen met "Andere
// praktijk met deze naam"), maar niet stil: nu eerst een 409 met een vraag, pas met zelfdeNaam: true
// gaat het door, en "praktijknaam gewijzigd" (met oud → nieuw) staat in Activiteit.
// Zonder browser, past in CI. `npm run test:praktijknaambezet`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-naambezet-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.63.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  const A = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Alfa", wachtwoord: "alfa-wachtwoord", akkoord: true })).json());
  const B = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Bravo", wachtwoord: "bravo-wachtwoord", akkoord: true })).json());
  const profiel = { praktijk: "Fysio Alfa", adres: "Straat 1", plaats: "Utrecht", tel: "030-1234567", email: "info@alfa.nl", website: "" };
  assert.equal((await post("/api/praktijken", profiel, A)).status, 200);
  assert.equal((await post("/api/praktijken", { ...profiel, praktijk: "Fysio Bravo", email: "info@bravo.nl" }, B)).status, 200);

  // 1. hernoemen naar de naam van praktijk B (ook met andere hoofdletters): eerst een vraag, niets veranderd
  let r = await post("/api/praktijken", { ...profiel, praktijk: "fysio BRAVO" }, A);
  assert.equal(r.status, 409, "naam van een andere praktijk moet eerst een vraag geven (was " + r.status + ")");
  const d = await r.json();
  assert.equal(d.bezet, true);
  assert.match(d.fout, /andere praktijk/);
  let namen = Object.values(await accounts()).map((x) => x.naam);
  assert.ok(namen.includes("Fysio Alfa") && namen.includes("Fysio Bravo"), "beide namen ongewijzigd: " + namen);
  const lijstA = await (await get("/api/praktijken", A)).json();
  assert.ok(lijstA.every((p) => p.praktijk !== "fysio BRAVO"), "profiel niet stil hernoemd");

  // 2. een gewone nieuwe naam die niemand heeft: gewoon 200, en Activiteit noemt oud → nieuw
  r = await post("/api/praktijken", { ...profiel, praktijk: "Fysio Alfa Centrum" }, A);
  assert.equal(r.status, 200);
  let act = (await (await get("/api/praktijk/activiteit", A)).json()).activiteit;
  const regel = act.find((e) => e.actie === "praktijknaam-gewijzigd");
  assert.ok(regel, "naamwijziging staat in Activiteit");
  assert.match(regel.wie, /Fysio Alfa → Fysio Alfa Centrum/);

  // 3. bewust dezelfde naam als B (bevestigd in de app): mag, maar staat in Activiteit
  r = await post("/api/praktijken", { ...profiel, praktijk: "Fysio Bravo", zelfdeNaam: true }, A);
  assert.equal(r.status, 200, "na bevestiging mag een dubbele naam");
  act = (await (await get("/api/praktijk/activiteit", A)).json()).activiteit;
  assert.ok(act.some((e) => e.actie === "praktijknaam-gewijzigd" && /andere praktijk/.test(e.wie)), "dubbele naam staat met uitleg in Activiteit");

  // 4. B is onaangetast en ziet niets van A
  const actB = (await (await get("/api/praktijk/activiteit", B)).json()).activiteit;
  assert.ok(!actB.some((e) => e.actie === "praktijknaam-gewijzigd"), "B heeft geen naamwijziging");
  namen = Object.values(await accounts()).map((x) => x.naam);
  assert.equal(namen.filter((n) => n === "Fysio Bravo").length, 2, "B houdt zijn naam, A heet nu ook zo");

  // 5. hetzelfde profiel nog eens sturen (de app doet dat bij elk verlaten van een veld): geen vraag meer
  r = await post("/api/praktijken", { ...profiel, praktijk: "Fysio Bravo" }, A);
  assert.equal(r.status, 200, "ongewijzigde naam geeft geen 409");

  // 6. de app kent de vraag
  const html = await readFile(join(root, "public/index.html"), "utf8");
  assert.match(html, /d\.bezet&&!p\.zelfdeNaam&&window\.confirm/, "app vraagt bevestiging bij een bezette naam");

  assert.doesNotMatch(uit, /TypeError|ReferenceError|SyntaxError/, "geen fout in het serverlog");
  console.log("test-praktijknaam-bezet: ok (naam van een andere praktijk niet stil; Activiteit noemt oud → nieuw)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
