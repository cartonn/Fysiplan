// Wie in V2 een praktijknaam beveiligt waaronder al iets op de server staat zonder account, krijgt
// een eigen praktijk met een eigen code. Wat er onder de kale naam stond, gaat niet mee.
// Zulke gegevens bestaan: een v1-sessie en beheer delen kaarten onder de naam in kleine letters,
// en er zijn kaarten van vóór de wachtwoordplicht. Was: de eerste die zo'n naam beveiligde, kreeg
// alle kaarten eronder (lezen en verwijderen) en sloot de v1-praktijk buiten. De standaardnaam
// van v1 ("FysioTotaal", ook de voorbeeldnaam op de landingspagina) is altijd zo'n naam, ook als
// er nog niets onder staat. Hetzelfde geldt voor een praktijkprofiel (telefoon, website, logo: ze
// staan op elke patiëntkaart) dat al onder de naam stond. Een verse naam houdt de naam als sleutel,
// zoals altijd.
// Zonder browser, past in CI. `npm run test:naamerftniets`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-naamerft-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
// een v1-account: v1 werkt met een eigen accountlaag en deelt kaarten zonder praktijkaccount
const salt = randomBytes(16);
await writeFile(join(dataDir, "v1-accounts.json"), JSON.stringify({
  "demo@v1.invalid": { email: "demo@v1.invalid", praktijk: "FysioTotaal", gemaakt: Date.now(),
    hash: "scrypt$" + salt.toString("hex") + "$" + scryptSync("demo-wachtwoord", salt, 32).toString("hex") }
}));
// een profiel van vóór de vaste sleutels: de sleutel is niet de naam in kleine letters
await writeFile(join(dataDir, "praktijken.json"), JSON.stringify({
  "fysio-erfgoed": { praktijk: "Fysio Erfgoed", adres: "Oude weg 1", plaats: "Zeist", tel: "030-2222222" }
}));

let origin = "", uit = "";
async function start(extra = {}) {
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "uit", ...extra };
  delete env.NODE_ENV;
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  return app;
}
const stop = async (app) => { app.kill(); await new Promise((r) => app.once("exit", r)); };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.71." + ((ip >> 8) & 255) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const lijst = async (naam, extra) => {
  const r = await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(naam), { headers: kop(extra) });
  return { status: r.status, namen: r.status === 200 ? (await r.json()).map((k) => k.naam) : [] };
};
const profielen = async (extra) => {
  const r = await fetch(origin + "/api/praktijken", { headers: kop(extra) });
  return r.status === 200 ? (await r.json()).map((p) => p.praktijk + " " + (p.tel || "")) : r.status;
};
const kaart = (praktijk, naam) => ({ praktijk, naam, chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const sleutelVan = async (naam) => Object.entries(await accounts()).filter(([, a]) => a.naam === naam).map(([k]) => k);
const v1Login = async () => {
  const r = await post("/api/v1/login", { email: "demo@v1.invalid", wachtwoord: "demo-wachtwoord" });
  assert.equal(r.status, 200, "v1 logt in");
  return { cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
};

let app = await start();
try {
  let v1 = await v1Login();

  // ---- 1. de standaardnaam van v1, nog zonder kaarten: beveiligen in V2 sluit v1 niet buiten ----
  const V1 = "FysioTotaal";
  let r = await post("/api/praktijk/claim", { praktijk: V1, wachtwoord: "vreemd-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const vreemd = ses(await r.json());
  let sleutels = await sleutelVan(V1);
  assert.equal(sleutels.length, 1);
  assert.match(sleutels[0], /^p-[a-f0-9]{16}$/, "de naam van v1 wordt nooit de sleutel van een V2-praktijk");
  assert.equal(Object.hasOwn(await accounts(), "fysiototaal"), false);
  r = await post("/api/kaarten", kaart(V1, "Jan K."), v1);
  assert.equal(r.status, 200, "v1 deelt daarna gewoon een kaart onder de eigen naam: " + await r.clone().text());
  assert.deepEqual((await lijst(V1, v1)).namen, ["Jan K."], "en ziet hem in het overzicht");
  let l = await lijst(V1, vreemd);
  assert.equal(l.status, 200);
  assert.deepEqual(l.namen, [], "de V2-praktijk met dezelfde naam ziet de kaart van v1 niet");
  r = await post("/api/kaarten/verwijder", { praktijk: V1, naam: "Jan K." }, vreemd);
  assert.equal(r.status, 404, "en kan hem niet weghalen");
  assert.deepEqual((await lijst(V1, v1)).namen, ["Jan K."]);
  // de V2-praktijk werkt verder gewoon, los van v1
  r = await post("/api/kaarten", kaart(V1, "Piet B."), vreemd);
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual((await lijst(V1, vreemd)).namen, ["Piet B."]);
  assert.deepEqual((await lijst(V1, v1)).namen, ["Jan K."], "v1 ziet de kaart van de V2-praktijk niet");
  // zonder sessie: de naam is beveiligd, dus inloggen; het wachtwoord van de V2-praktijk werkt op de naam
  assert.equal((await lijst(V1)).status, 401, "zonder sessie geen overzicht");
  r = await post("/api/praktijk/login", { praktijk: V1, wachtwoord: "vreemd-wachtwoord" });
  assert.equal(r.status, 200, "inloggen op de naam werkt voor de V2-praktijk");
  assert.deepEqual((await lijst(V1, ses(await r.json()))).namen, ["Piet B."]);
  // een tweede praktijk met die naam kiest dat nog steeds bewust
  r = await post("/api/praktijk/claim", { praktijk: V1, wachtwoord: "nog-een-wachtwoord", akkoord: true });
  assert.equal(r.status, 409, "de naam hoort nu bij een account: eerst kiezen");
  assert.equal((await r.json()).bezet, true);

  // ---- 2. een andere naam waaronder v1 al een kaart deelde ----
  const D = "Fysio Demo";
  r = await post("/api/kaarten", kaart(D, "Anna V."), v1);
  assert.equal(r.status, 200, await r.clone().text());
  r = await post("/api/praktijk/claim", { praktijk: D, wachtwoord: "ander-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const ander = ses(await r.json());
  sleutels = await sleutelVan(D);
  assert.match(sleutels[0], /^p-[a-f0-9]{16}$/, "onder de kale naam stond al een kaart: eigen code");
  assert.deepEqual((await lijst(D, ander)).namen, [], "wie de naam beveiligt, erft de kaart niet");
  assert.equal((await post("/api/kaarten/verwijder", { praktijk: D, naam: "Anna V." }, ander)).status, 404);
  assert.deepEqual((await lijst(D, v1)).namen, ["Anna V."], "v1 houdt de kaart en de toegang");

  // ---- 2b. een naam waaronder v1 alleen een profiel bewaarde (telefoon en logo staan op de patiëntkaart) ----
  const P = "Fysio Profiel";
  r = await post("/api/praktijken", { praktijk: P, adres: "Laan 1", plaats: "Utrecht", tel: "030-1111111" }, v1);
  assert.equal(r.status, 200, await r.clone().text());
  r = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "profiel-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const metProfiel = ses(await r.json());
  assert.match((await sleutelVan(P))[0], /^p-[a-f0-9]{16}$/, "onder de kale naam stond al een profiel: eigen code");
  assert.deepEqual(await profielen(metProfiel), [], "wie de naam beveiligt, krijgt het profiel niet");
  r = await post("/api/praktijken", { praktijk: P, adres: "Vals 9", tel: "0900-0000000" }, metProfiel);
  assert.equal(r.status, 200, "de V2-praktijk bewaart een eigen profiel: " + await r.clone().text());
  assert.deepEqual(await profielen(metProfiel), [P + " 0900-0000000"]);
  assert.ok((await profielen(v1)).includes(P + " 030-1111111"), "het profiel van v1 staat er nog, ongewijzigd");

  // ---- 2c. een oud profiel met deze naam onder een andere sleutel: telt bij een kale sleutel als eigen ----
  const E = "Fysio Erfgoed";
  r = await post("/api/praktijk/claim", { praktijk: E, wachtwoord: "erfgoed-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const metErfgoed = ses(await r.json());
  assert.match((await sleutelVan(E))[0], /^p-[a-f0-9]{16}$/, "een profiel met deze naam zonder account: eigen code");
  assert.deepEqual(await profielen(metErfgoed), [], "en het oude profiel gaat niet mee");
  assert.ok((await profielen(v1)).includes(E + " 030-2222222"));

  // ---- 3. een verse naam: de naam blijft de sleutel, zoals altijd ----
  r = await post("/api/praktijk/claim", { praktijk: "Fysio Vers", wachtwoord: "vers-wachtwoord", akkoord: true });
  assert.equal(r.status, 200);
  assert.deepEqual(await sleutelVan("Fysio Vers"), ["fysio vers"], "zonder gegevens onder de naam verandert er niets");

  // ---- 4. dezelfde regel als een praktijk start met een eigen login (EIGEN_LOGIN_VERPLICHT) ----
  await stop(app);
  app = await start({ EIGEN_LOGIN_VERPLICHT: "aan" });
  v1 = await v1Login();
  const L = "Fysio Later";
  r = await post("/api/kaarten", kaart(L, "Kees D."), v1);
  assert.equal(r.status, 200, await r.clone().text());
  r = await post("/api/praktijk/claim", { praktijk: L, naam: "Lot Visser", email: "lot@later.invalid", wachtwoord: "lot-wachtwoord", akkoord: true, regels: true });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).stapInstellen, true);
  assert.match((await sleutelVan(L))[0], /^p-[a-f0-9]{16}$/, "ook met een eigen login: eigen code");
  assert.deepEqual((await lijst(L, v1)).namen, ["Kees D."], "v1 houdt de kaart en de toegang");

  assert.doesNotMatch(uit, /TypeError|ReferenceError/, "geen serverfout");
  console.log("test-naam-erft-niets: ok (naam met kaarten of een profiel zonder account geeft een eigen code, niets gaat mee, v1 blijft erbij kunnen, verse naam ongewijzigd)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await wacht(200);
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
