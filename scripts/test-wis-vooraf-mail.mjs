// Een week voor het automatisch wissen (proef zonder abonnement, of gestopt abonnement) krijgt
// de praktijk één mail: aanmelder en beheerders. En: een gestopt abonnement dat 30 dagen later
// gewist wordt, houdt de betaling en het factuurnummer (fiscale bewaarplicht, 7 jaar); dat ging
// mis als het abonnement eerst "gestopt" was en pas een ronde later gewist werd.
// Zonder browser. `npm run test:wisvooraf`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dag = 86400000, nu = Date.now();
const hash = (ww) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(ww, s, 32).toString("hex"); };
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wisvooraf-"));
const basis = (id, extra) => ({ id, email: id + "@praktijk.nl", naam: "Piet " + id, tel: "+31612340000", praktijk: "Fysio " + id, akkoord: "x", tokens: [], ...extra });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  // proef 24 dagen voorbij, geen klant: over 6 dagen wissen, dus nu de mail
  bijna: basis("bijna", { gestart: nu - 38 * dag, verloopt: nu - 24 * dag }),
  // proef 10 dagen voorbij: nog geen mail
  vroeg: basis("vroeg", { gestart: nu - 24 * dag, verloopt: nu - 10 * dag }),
  // proef 25 dagen voorbij maar geen praktijk beveiligd: niets te redden, geen mail
  leeg: basis("leeg", { gestart: nu - 39 * dag, verloopt: nu - 25 * dag }),
  // abonnement 31 dagen geleden gestopt (was al "beeindigd"): nu wissen, betaling blijft
  gestopt: basis("gestopt", { gestart: nu - 120 * dag, verloopt: nu - 31 * dag, klant: false,
    betaling: { id: "tr_gestopt", klant: "cst_gestopt", aantal: 1, status: "paid", gemaakt: nu - 100 * dag },
    abonnement: { status: "beeindigd", beeindigd: nu - 31 * dag, aantal: 1, bedrag: "9.99", sinds: nu - 100 * dag,
      betaaldTot: nu - 31 * dag, eersteBetaling: "tr_gestopt", factuurNr: "FP-2026-0007" } }),
  // proef zonder betaling, 31 dagen voorbij: helemaal weg
  weg: basis("weg", { gestart: nu - 45 * dag, verloopt: nu - 31 * dag })
}));
const acc = (id, verloopt, leden) => ({ naam: "Fysio " + id, hash: hash("wachtwoord-" + id), gemaakt: nu - 30 * dag, proef: { id, verloopt }, leden });
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
  "fysio bijna": acc("bijna", nu - 24 * dag, [
    { id: "l1", naam: "Bea Beheer", email: "bea@praktijk.nl", rol: "beheerder", hash: hash("x-wachtwoord-1") },
    { id: "l2", naam: "Theo Therapeut", email: "theo@praktijk.nl", rol: "therapeut", hash: hash("x-wachtwoord-2") }]),
  "fysio vroeg": acc("vroeg", nu - 10 * dag),
  "fysio gestopt": acc("gestopt", nu - 31 * dag),
  "fysio weg": acc("weg", nu - 31 * dag)
}));
const kaart = (id) => ({ id, naam: "Jan", ts: nu - 2 * dag, chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} });
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio bijna": { jan: kaart("0ad0ad0ad0a1"), kees: kaart("0ad0ad0ad0a2") },
  "fysio gestopt": { jan: kaart("0ad0ad0ad0a3") }
}));
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 200 * dag }));

const mails = [];
const nep = createServer((req, res) => {
  let d = ""; req.on("data", (c) => { d += c; });
  req.on("end", () => { if (req.url === "/emails") mails.push(JSON.parse(d)); res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"m"}'); });
});
await new Promise((r) => nep.listen(0, "127.0.0.1", r));
const nepUrl = "http://127.0.0.1:" + nep.address().port;

async function ronde() {
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "",
      MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" },
    stdio: ["ignore", "pipe", "pipe"] });
  for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:" + port + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  // de eerste proefronde draait 5 seconden na de start
  for (let i = 0; i < 120; i++) {
    const p = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
    if (!p.weg && p.bijna && p.bijna.wisGemeld) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => { app.on("exit", r); app.kill(); });
}
const lees = async (naam) => JSON.parse(await readFile(join(dataDir, naam), "utf8"));

try {
  await ronde();
  const proeven = await lees("proef-aanmeldingen.json");
  const wisMails = mails.filter((m) => /wissen we je Fysiplan-gegevens/.test(m.subject));
  const aan = wisMails.map((m) => [].concat(m.to).join(",")).sort();
  assert.deepEqual(aan, ["bea@praktijk.nl", "bijna@praktijk.nl"], "één mail aan de aanmelder en één aan de beheerder; niet aan de therapeut, niet te vroeg, niet zonder praktijk");
  const tekst = wisMails.find((m) => [].concat(m.to).includes("bijna@praktijk.nl")).text;
  assert.match(tekst, /de 2 gedeelde kaarten/);
  assert.match(tekst, /Kopieer voor dossier/);
  assert.match(tekst, /fysiplan\.nl\/v2\/gegevens/);
  assert.ok(proeven.bijna.wisGemeld && !proeven.vroeg.wisGemeld && !proeven.leeg.wisGemeld);
  // de kaarten van "bijna" staan er nog: de mail komt vóór het wissen
  assert.ok((await lees("kaarten.json"))["fysio bijna"].jan);

  // gestopt abonnement: praktijk en kaarten weg, betaling en factuurnummer blijven 7 jaar
  const accs = await lees("praktijk-accounts.json");
  assert.ok(!("fysio gestopt" in accs), "account van het gestopte abonnement gewist");
  assert.ok(!(await lees("kaarten.json"))["fysio gestopt"], "kaarten van het gestopte abonnement gewist");
  assert.ok(proeven.gestopt && proeven.gestopt.gewist, "aanmelding teruggebracht tot de fiscale bewaarplicht");
  assert.equal(proeven.gestopt.betaling.id, "tr_gestopt", "betaling blijft");
  assert.equal(proeven.gestopt.abonnement.factuurNr, "FP-2026-0007", "factuurnummer blijft");
  assert.equal(proeven.gestopt.tel, undefined, "telefoon weg");
  assert.ok(proeven.gestopt.bewaarTot > nu + 6.9 * 365 * dag, "7 jaar");
  // proef zonder betaling: helemaal weg, met de praktijk
  assert.ok(!proeven.weg && !("fysio weg" in accs));

  // een tweede ronde stuurt geen tweede mail en laat de fiscale gegevens staan
  const eerder = wisMails.length;
  await ronde();
  assert.equal(mails.filter((m) => /wissen we je Fysiplan-gegevens/.test(m.subject)).length, eerder, "geen tweede mail");
  assert.equal((await lees("proef-aanmeldingen.json")).gestopt.betaling.id, "tr_gestopt");
  console.log("Mail een week voor het wissen, en de betaling van een gestopt abonnement blijft 7 jaar: ok.");
} finally {
  nep.close();
  await rm(dataDir, { recursive: true, force: true });
}
