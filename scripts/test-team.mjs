// Team en eigen login per therapeut (stap 2 van "rollen, dossier en opslag").
// - Wie met het praktijkwachtwoord is ingelogd, maakt een eigen beheerderslogin.
// - De beheerder nodigt een collega uit; die kiest op /v2/uitnodiging (scriptloos)
//   naam en wachtwoord en accepteert de werkregels.
// - Inloggen met e-mail + wachtwoord; het logboek noemt wie het was.
// - Een therapeut kan het team niet aanpassen; een verwijderde collega is meteen uitgelogd.
// - Het gedeelde praktijkwachtwoord uitzetten: oude sessies vervallen, inloggen op naam weigert.
// Zonder browser, past in CI. `npm run test:team`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-team-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.1." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Team", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json()); // sessie met het gedeelde praktijkwachtwoord

  // ---- team ophalen: nog leeg, gedeelde sessie is beheer ----
  let team = await (await get("/api/praktijk/team", G)).json();
  assert.equal(team.beheer, true);
  assert.equal(team.ik, null);
  assert.deepEqual(team.leden, []);
  assert.equal((await get("/api/praktijk/team")).status, 401, "zonder sessie geen team");

  // ---- gedeeld wachtwoord uitzetten kan pas met een eigen login ----
  assert.equal((await post("/api/praktijk/team/gedeeld-uit", {}, G)).status, 400);

  // ---- eigen login voor de eigenaar ----
  assert.equal((await post("/api/praktijk/team/eigen-login", { naam: "Sanne de Wit", email: "sanne@team.nl", wachtwoord: "sanne-wachtwoord" }, G)).status, 400, "werkregels verplicht");
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Sanne de Wit", email: "Sanne@Team.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200);
  const S = ses(await eigen.json());
  team = await (await get("/api/praktijk/team", S)).json();
  assert.equal(team.ik.email, "sanne@team.nl");
  assert.equal(team.ik.rol, "beheerder");

  // ---- collega uitnodigen ----
  const uitn = await post("/api/praktijk/team/uitnodigen", { email: "joris@team.nl", naam: "Joris", rol: "therapeut" }, S);
  assert.equal(uitn.status, 200);
  const { link, gemaild } = await uitn.json();
  assert.equal(gemaild, false, "zonder mail-instelling: link om te kopiëren");
  const token = new URL(link).searchParams.get("t");
  assert.match(token, /^[a-f0-9]{48}$/);
  const accs = JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
  assert.doesNotMatch(JSON.stringify(accs), new RegExp(token), "token staat niet leesbaar op schijf");

  // ---- uitnodigingspagina: scriptloos, werkregels verplicht ----
  const pagina = await fetch(origin + "/v2/uitnodiging?t=" + token);
  assert.equal(pagina.status, 200);
  const html = await pagina.text();
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /joris@team\.nl/);
  assert.match(html, /Werkregels/);
  assert.doesNotMatch(html, /__[A-Z_]+__/);
  assert.equal((await fetch(origin + "/v2/uitnodiging?t=" + "0".repeat(48))).status, 404);
  const zonderRegels = await formulier("/v2/uitnodiging", { t: token, naam: "Joris Bakker", wachtwoord: "joris-wachtwoord" });
  assert.equal(zonderRegels.status, 400);
  assert.match(await zonderRegels.text(), /werkregels/);
  const aangenomen = await formulier("/v2/uitnodiging", { t: token, naam: "Joris Bakker", wachtwoord: "joris-wachtwoord", regels: "1" });
  assert.equal(aangenomen.status, 200);
  assert.match(await aangenomen.text(), /Je eigen login staat klaar/);
  assert.equal((await fetch(origin + "/v2/uitnodiging?t=" + token)).status, 404, "link werkt maar één keer");

  // ---- inloggen met e-mail ----
  assert.equal((await post("/api/praktijk/login", { email: "joris@team.nl", wachtwoord: "fout-wachtwoord" })).status, 403);
  const lJ = await post("/api/praktijk/login", { email: "JORIS@team.nl", wachtwoord: "joris-wachtwoord" });
  assert.equal(lJ.status, 200);
  const dJ = await lJ.json();
  assert.equal(dJ.praktijk, "Fysio Team");
  const J = ses(dJ);

  // therapeut werkt met kaarten, maar past het team niet aan
  const kaart = await post("/api/kaarten", { praktijk: "Fysio Team", naam: "Anna", client: { c_naam: "Anna" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, J);
  assert.equal(kaart.status, 200, "therapeut deelt kaarten");
  assert.equal((await post("/api/praktijk/team/uitnodigen", { email: "x@team.nl" }, J)).status, 403);
  team = await (await get("/api/praktijk/team", J)).json();
  assert.equal(team.beheer, false);
  assert.equal(team.leden.length, 2);

  // logboek noemt wie het was
  const act = await (await get("/api/praktijk/activiteit?praktijk=Fysio%20Team", S)).json();
  assert.ok(act.activiteit.some((e) => e.actie === "ingelogd" && e.wie === "Joris Bakker"), "logboek per persoon");

  // ---- wachtwoord wijzigen met eigen login raakt alleen jezelf ----
  const ww = await post("/api/praktijk/wachtwoord", { praktijk: "Fysio Team", huidig: "joris-wachtwoord", nieuw: "joris-nieuw-ww" }, J);
  assert.equal(ww.status, 200);
  const J2 = ses(await ww.json());
  assert.equal((await get("/api/praktijk/team", S)).status, 200, "sessie van de beheerder blijft");
  assert.equal((await post("/api/praktijk/login", { email: "joris@team.nl", wachtwoord: "joris-nieuw-ww" })).status, 200);
  assert.equal((await post("/api/praktijk/login", { praktijk: "Fysio Team", wachtwoord: "praktijk-wachtwoord" })).status, 200, "gedeeld wachtwoord ongewijzigd");

  // ---- collega verwijderen: meteen uitgelogd ----
  const idJ = team.leden.find((l) => l.email === "joris@team.nl").id;
  assert.equal((await post("/api/praktijk/team/verwijder", { id: idJ }, S)).status, 200);
  assert.equal((await get("/api/praktijk/team", J2)).status, 401, "verwijderde collega is uitgelogd");
  assert.equal((await post("/api/praktijk/login", { email: "joris@team.nl", wachtwoord: "joris-nieuw-ww" })).status, 403);
  assert.equal((await get("/api/kaarten?praktijk=Fysio%20Team", S)).status, 200, "kaarten blijven bij de praktijk");
  assert.equal((await (await get("/api/kaarten?praktijk=Fysio%20Team", S)).json()).length, 1);

  // ---- gedeeld praktijkwachtwoord uit ----
  assert.equal((await post("/api/praktijk/team/gedeeld-uit", {}, S)).status, 200);
  assert.equal((await get("/api/praktijk/team", G)).status, 401, "sessie met het gedeelde wachtwoord vervalt");
  const opNaam = await post("/api/praktijk/login", { praktijk: "Fysio Team", wachtwoord: "praktijk-wachtwoord" });
  assert.equal(opNaam.status, 401);
  assert.equal((await opNaam.json()).perEmail, true);
  assert.equal((await get("/api/praktijk/team", S)).status, 200, "eigen login werkt door");
  // laatste beheerder kan zichzelf niet degraderen
  const idS = (await (await get("/api/praktijk/team", S)).json()).ik.id;
  assert.equal((await post("/api/praktijk/team/rol", { id: idS, rol: "therapeut" }, S)).status, 400);

  // ---- app (alleen waar Playwright staat; CI heeft het niet) ----
  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-team: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    const c2 = await post("/api/praktijk/claim", { praktijk: "Fysio Brug", wachtwoord: "brug-praktijkww", akkoord: true });
    const sessie = (await c2.json()).sessie;
    const browser = await pw.chromium.launch();
    const shot = async (page, naam) => { if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, naam) }); };
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.6.9.1" } });
      await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem("gezet")) { localStorage.setItem("fp_praksessie", t); sessionStorage.setItem("gezet", "1"); } } catch {} }, sessie);
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/v2/app");
      await page.waitForSelector("[data-add]", { timeout: 15000 });
      await page.evaluate(() => { const p = document.getElementById("praktijk"); p.value = "Fysio Brug"; p.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
      await page.click("#kaartenBtn");
      await page.waitForSelector("#ps_team", { state: "visible", timeout: 5000 });
      await page.click("#ps_team");
      await page.waitForSelector("#tm_edo", { state: "visible", timeout: 5000 });
      await page.fill("#tm_enaam", "Sanne de Wit");
      await page.fill("#tm_eemail", "sanne@brug.nl");
      await page.fill("#tm_eww", "sanne-brug-ww");
      await page.check("#tm_eregels");
      await shot(page, "team-1-eigen-login.png");
      await page.click("#tm_edo");
      // wacht tot het team opnieuw is getekend (anders wist die render de velden)
      await page.waitForFunction(() => /\(jij\)/.test(document.getElementById("tm_inhoud").textContent), null, { timeout: 5000 });
      await page.fill("#tm_unaam", "Joris Bakker");
      await page.fill("#tm_uemail", "joris@brug.nl");
      await page.click("#tm_udo");
      await page.waitForSelector("#tm_kopie", { state: "visible", timeout: 5000 });
      assert.match(await page.textContent("#tm_link"), /\/v2\/uitnodiging\?t=[a-f0-9]{48}/);
      assert.match(await page.textContent("#tm_inhoud"), /Joris Bakker[\s\S]*uitgenodigd/);
      await shot(page, "team-2-uitgenodigd.png");
      await page.click("#tm_sluit");
      await page.waitForFunction(() => /ingelogd als Sanne de Wit/.test(document.getElementById("ps_status").textContent), null, { timeout: 5000 });
      // uitloggen en weer inloggen met e-mail
      await page.click("#ps_uit");
      await page.waitForSelector("#ps_email", { state: "visible", timeout: 5000 });
      await page.fill("#ps_email", "sanne@brug.nl");
      await page.fill("#ps_ww", "sanne-brug-ww");
      await shot(page, "team-3-inloggen-email.png");
      await page.click("#ps_do");
      await page.waitForFunction(() => /ingelogd als Sanne de Wit/.test(document.getElementById("ps_status").textContent), null, { timeout: 5000 });
      assert.deepEqual(fouten, [], "geen scriptfouten");
    } finally { await browser.close(); }
  }

  console.log("test-team: OK");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
