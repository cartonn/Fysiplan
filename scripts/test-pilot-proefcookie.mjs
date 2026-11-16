// Security 2026-11-16: de proefcookie van een V2-pilot van een bestaande praktijk
// (V2_BESTAANDE_PILOT) gaf ook naast een beheerder met eigen login de abonnementskant:
// Mijn proef met e-mail en telefoon van de aanmelder, en in /api/praktijk/status het
// `voorstel` met naam en e-mail. Een gewone proef doet dat sinds 2026-11-15 niet meer
// (proefAlleenBeheer); de pilot hangt niet als `proef` op het account en viel erbuiten.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync, createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wacht } from "node:timers/promises";

const dir = await mkdtemp(join(tmpdir(), "pilot-proefcookie-"));
const schrijf = (n, v) => writeFile(join(dir, n + ".json"), JSON.stringify(v));
const pk = "pilotpraktijk", id = "pilotproef01", gemaakt = Date.now() - 86400000;
const hashVan = (w) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(w, s, 32).toString("hex"); };
const aanmelder = ["aanmelder", "example.invalid"].join("@");
const beheerder = ["beheer", "example.invalid"].join("@");
const token = randomBytes(24).toString("hex");
const verloopt = Date.now() + 7 * 86400000;
const poort = createServer(); await new Promise((r) => poort.listen(0, "127.0.0.1", r));
const port = poort.address().port; await new Promise((r) => poort.close(r));
const url = "http://127.0.0.1:" + port;
const cookie = { cookie: "fpproef=" + token };
let app, exit;
try {
  await schrijf("praktijk-accounts", { [pk]: { naam: "Pilotpraktijk", hash: hashVan("x-" + randomBytes(8).toString("hex")), gemaakt, gedeeldUit: true,
    leden: [{ id: "l1", naam: "Beheer", email: beheerder, rol: "beheerder", hash: hashVan("alleen-lokaal-" + randomBytes(4).toString("hex")) }] } });
  await schrijf("proef-aanmeldingen", { [id]: { id, email: aanmelder, naam: "Aanmelder Test", tel: "0612345678", praktijk: "Pilotpraktijk",
    gestart: gemaakt - 86400000, verloopt, tokens: [createHash("sha256").update(token).digest("hex")] } });
  app = spawn(process.execPath, ["server.js"], { env: { PATH: process.env.PATH, HOME: dir, DATA_DIR: dir, PORT: String(port), HOST: "127.0.0.1",
    V2_BESTAANDE_PILOT: JSON.stringify({ pk, id, gemaakt, verloopt }) }, stdio: "ignore" });
  exit = new Promise((r) => app.once("exit", r));
  for (let i = 0; i < 150; i++) { if (await fetch(url + "/health").then((r) => r.ok, () => false)) break; await wacht(100); }

  const mijn = await fetch(url + "/v2/proef?mijn=1", { headers: cookie, redirect: "manual" });
  const html = await mijn.text();
  assert.ok(!html.includes(aanmelder), "Mijn proef toont het e-mailadres van de aanmelder aan wie alleen de pilotcookie heeft");
  assert.ok(!html.includes("612345678"), "Mijn proef toont het telefoonnummer van de aanmelder");
  assert.match(html, /regelt een beheerder/, "verwacht de verwijzing naar een beheerder");

  const status = await (await fetch(url + "/api/praktijk/status?praktijk=Pilotpraktijk", { headers: cookie })).json();
  assert.equal(status.voorstel, undefined, "status geeft naam en e-mail van de aanmelder");

  const doorgaan = await fetch(url + "/v2/proef/doorgaan", { method: "POST", redirect: "manual",
    headers: { ...cookie, "content-type": "application/x-www-form-urlencoded", origin: url, "sec-fetch-site": "same-origin" }, body: "" });
  assert.equal(doorgaan.status, 303, "doorgaan met alleen de pilotcookie");
  console.log("OK: pilotcookie geeft naast een beheerder met eigen login geen Mijn proef, voorstel of doorgaan.");
} finally {
  if (app) { app.kill(); await exit; }
  await rm(dir, { recursive: true, force: true });
}
