// Praktijk-routine (2026-11-20, gebruikers-sweep 2026-11-19 22u, Karin): `betaaldTot` is het begin
// van de volgende maand (exclusief). De factuur zei daarom "t/m 28 november", maar Mijn abonnement,
// de opzegpagina en de mails zeiden "tot en met zondag 29 november": een dag later dan de factuur.
// Nu noemen ze allemaal de laatste betaalde dag, zoals de factuur. Zonder browser.
// `npm run test:abonnementeinddatum`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-einddatum-"));
const nu = Date.now(), dag = 86400000;
const betaaldTot = nu + 10 * dag;
const token = "d".repeat(48);
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  ein: { id: "ein", email: "eigenaar@einddatum.test", naam: "Eva", tel: "+31612345678", praktijk: "Fysio Einddatum",
    gestart: nu - 40 * dag, verloopt: nu - 26 * dag, akkoord: nu - 40 * dag, tokens: [createHash("sha256").update(token).digest("hex")], klant: true,
    betaling: { id: "tr_ein", klant: "cst_ein", aantal: 1, status: "paid", gemaakt: nu - 20 * dag },
    abonnement: { status: "actief", aantal: 1, bedrag: "9.99", sinds: betaaldTot - 30 * dag, betaaldTot, eersteBetaling: "tr_ein", factuurNr: "FP-2026-0042" } }
}));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MOLLIE_API_KEY: "", MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const cookie = "fpproef=" + token;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const datumNl = (ms) => new Date(ms).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });
const laatste = datumNl(betaaldTot - dag), eenTeLaat = datumNl(betaaldTot);
const ontsnapt = (s) => s.replace(/&/g, "&amp;");

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // 1. Mijn abonnement noemt de laatste betaalde dag, niet de dag erna
  const mijn = await (await fetch(origin + "/v2/proef?mijn=1", { headers: { cookie, "x-forwarded-for": "10.71.0." + (ip++) } })).text();
  assert.ok(mijn.includes("betaald tot en met " + ontsnapt(laatste)), "Mijn abonnement: betaald tot en met de laatste dag");
  assert.ok(!mijn.includes("tot en met " + eenTeLaat), "Mijn abonnement noemt geen dag later dan de factuur");
  assert.ok(mijn.includes("Het loopt dan nog tot en met " + ontsnapt(laatste)), "opzegvinkje noemt de laatste dag");

  // 2. de factuur noemt dezelfde laatste dag (dag en maand)
  const factuur = await (await fetch(origin + "/v2/proef/factuur", { headers: { cookie, "x-forwarded-for": "10.71.0." + (ip++) } })).text();
  const d = new Date(betaaldTot - dag);
  const dagMaand = d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });
  assert.ok(factuur.includes("t/m " + dagMaand), "factuur: t/m " + dagMaand);

  // 3. opzeggen: de bevestiging noemt ook de laatste dag
  const opz = await fetch(origin + "/v2/proef/opzeggen", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie, "x-forwarded-for": "10.71.1." + (ip++) },
    body: new URLSearchParams({ actie: "opzeggen", zeker: "1" }).toString() });
  assert.equal(opz.status, 200);
  const opzTekst = await opz.text();
  assert.ok(opzTekst.includes("tot en met " + ontsnapt(laatste)), "opzegbevestiging: tot en met de laatste dag");
  assert.ok(!opzTekst.includes(eenTeLaat), "opzegbevestiging noemt geen dag later");

  // 4. na opzeggen: Mijn abonnement idem
  const na = await (await fetch(origin + "/v2/proef?mijn=1", { headers: { cookie, "x-forwarded-for": "10.71.0." + (ip++) } })).text();
  assert.ok(na.includes("nog gebruiken tot en met <b>" + ontsnapt(laatste) + "</b>"), "opgezegd: tot en met de laatste dag");
  console.log("abonnement-einddatum: app, opzeggen en factuur noemen dezelfde laatste dag");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
