// Gebruikers-sweep 2026-11-22/23 (Karin, desktop + iPad): twee collega's met precies dezelfde naam
// ("Tom Jansen", ander e-mailadres) waren één behandelaar. "Alleen mijn patiënten" bij Tom A toonde ook
// de patiënten van Tom B, en na het verwijderen van Tom B ook diens kaarten. De kaart bewaarde alleen
// een naam. Nu bewaart de server ook het lid en geven inbox en kaartenoverzicht per kaart `mijn` mee
// voor wie er kijkt; de app gebruikt dat vóór de naam. Zonder browser, past in CI. `npm run test:naamgenoten`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
// de app: kaartIsMijn gebruikt `mijn` van de server, anders de naam
const bron = (appHtml.match(/\n  function behIsMijn\(beh,wie\)\{[\s\S]*?\n  \}\n/) || [""])[0] +
  (appHtml.match(/\n  function kaartIsMijn\(c,wie\)\{[\s\S]*?\n  \}\n/) || [""])[0];
assert.match(bron, /function kaartIsMijn/, "kaartIsMijn gevonden");
const kaartIsMijn = new Function(bron + "; return kaartIsMijn;")();
assert.equal(kaartIsMijn({ behandelaar: "Tom Jansen", mijn: false }, "Tom Jansen"), false, "server zegt niet mijn: niet mijn, ook bij dezelfde naam");
assert.equal(kaartIsMijn({ behandelaar: "Tom Jansen", mijn: true }, "Tom Jansen"), true);
assert.equal(kaartIsMijn({ behandelaar: "Tom Jansen" }, "Tom Jansen"), true, "oude kaart zonder lid: op naam");
assert.equal(kaartIsMijn({ behandelaar: null }, "Tom Jansen"), true, "zonder behandelaar blijft zichtbaar");
assert.match(appHtml, /if\(INBOX_ALLEEN_MIJN&&mijn&&!kaartIsMijn\(c,PRAKSLOT\.wie\)\)return false;/, "Vandaag (niet geoefend) via kaartIsMijn");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-naamgenoten-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.9." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.10." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Naamgenoten";
const Q = "?praktijk=" + encodeURIComponent(P);

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true })).json());
  const K = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@naamgenoot.test", wachtwoord: "karin-wachtwoord", regels: true }, G)).json());
  assert.ok(K["x-praktijk-sessie"], "eigen login beheerder");
  const neem = async (email, wachtwoord) => {
    const u = await (await post("/api/praktijk/team/uitnodigen", { email, naam: "Tom Jansen", rol: "therapeut" }, K)).json();
    const token = String(u.link || u.url || "").match(/t=([a-f0-9]{48})/)?.[1] || u.token;
    assert.ok(token, "uitnodiging: " + JSON.stringify(u));
    const klaar = await formulier("/v2/uitnodiging", { t: token, naam: "Tom Jansen", wachtwoord, regels: "1" });
    assert.ok(klaar.status < 400, "uitnodiging aangenomen");
    const s = ses(await (await post("/api/praktijk/login", { email, wachtwoord })).json());
    assert.ok(s["x-praktijk-sessie"], "Tom logt in");
    return s;
  };
  const A = await neem("tom.a@naamgenoot.test", "tom-a-wachtwoord");
  const B = await neem("tom.b@naamgenoot.test", "tom-b-wachtwoord");

  const maak = async (naam, s) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, s)).json()).id;
  const idA = await maak("Patient Van A", A);
  const idB = await maak("Patient Van B", B);
  const idK = await maak("Patient Van K", K);
  assert.ok(idA && idB && idK, "kaarten gedeeld");
  for (const id of [idA, idB, idK]) assert.equal((await post("/api/kaart/seintje", { id, soort: "vraag" })).status, 200);

  const mijnIn = async (s, pad) => {
    const d = await (await get(pad + Q, s)).json();
    const lijst = d.kaarten || d.lijst || d;
    return Object.fromEntries(lijst.map((k) => [k.id, k.mijn]));
  };
  const ibA = await mijnIn(A, "/api/praktijk/inbox");
  assert.equal(ibA[idA], true, "inbox: Tom A ziet zijn eigen kaart als mijn");
  assert.equal(ibA[idB], false, "inbox: de kaart van de andere Tom Jansen is niet van Tom A");
  const ovB = await mijnIn(B, "/api/kaarten");
  assert.equal(ovB[idB], true, "overzicht: Tom B eigen kaart");
  assert.equal(ovB[idA], false, "overzicht: kaart van Tom A niet van Tom B");
  const lijstA = (await (await get("/api/praktijk/inbox" + Q, A)).json()).kaarten;
  assert.deepEqual(lijstA.filter((k) => kaartIsMijn(k, "Tom Jansen")).map((k) => k.id), [idA],
    "Alleen mijn bij Tom A: alleen zijn eigen kaart, niet die van Tom B of Karin");
  // het lid zelf gaat nooit mee naar de app
  assert.ok(!JSON.stringify(lijstA).includes("behandelaarLid"), "geen lid-id in de inbox");

  // met de hand een behandelaar kiezen: je eigen naam is jezelf
  assert.equal((await post("/api/kaart/behandelaar", { praktijk: P, id: idK, naam: "Tom Jansen" }, B)).status, 200);
  const naB = await mijnIn(B, "/api/kaarten");
  assert.equal(naB[idK], true, "Tom B zet zichzelf op de kaart: mijn bij Tom B");
  assert.equal((await mijnIn(A, "/api/kaarten"))[idK], false, "en niet bij Tom A");
  // de beheerder kiest "Tom Jansen": niet te zeggen welke, dan op naam zoals voorheen (geen `mijn`)
  assert.equal((await post("/api/kaart/behandelaar", { praktijk: P, id: idK, naam: "Tom Jansen" }, K)).status, 200);
  assert.equal((await mijnIn(A, "/api/kaarten"))[idK], undefined, "dubbelzinnige naam: geen lid, de app beslist op naam");
  // een unieke naam van een collega: dat lid
  assert.equal((await post("/api/kaart/behandelaar", { praktijk: P, id: idK, naam: "Karin Beheer" }, A)).status, 200);
  assert.equal((await mijnIn(K, "/api/kaarten"))[idK], true, "unieke naam: het lid met die naam");
  assert.equal((await mijnIn(A, "/api/kaarten"))[idK], false);

  // Tom B weg: zijn kaart is niet ineens van Tom A
  const team = await (await get("/api/praktijk/team" + Q, K)).json();
  const tomB = team.leden.find((l) => String(l.email || "").startsWith("tom.b"));
  assert.ok(tomB && tomB.id, "Tom B in het team");
  const weg = await post("/api/praktijk/team/verwijder", { praktijk: P, id: tomB.id, gedeeld: "laten" }, K);
  assert.equal(weg.status, 200, "Tom B verwijderd");
  const naWeg = await mijnIn(A, "/api/praktijk/inbox");
  assert.equal(naWeg[idB], false, "na verwijderen: de kaart van Tom B is niet van Tom A");
  assert.equal(naWeg[idA], true);
  console.log("naamgenoten: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (app.exitCode === null && app.signalCode === null) {
    const weg = new Promise((r) => app.once("exit", r));
    app.kill();
    await Promise.race([weg, new Promise((r) => setTimeout(r, 5000))]);
  }
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
