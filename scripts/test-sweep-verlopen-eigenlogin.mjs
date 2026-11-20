// Gebruikers-sweep 2026-11-19 10u (Mark desktop + iPad, Karin): met een verplichte eigen login
// (EIGEN_LOGIN_VERPLICHT=aan, standaard in productie) zeiden de verlopen-pagina en /v2/gegevens nog
// "met het wachtwoord van je praktijk", "Je e-mail (alleen als je met een eigen login werkt)" en
// "Wachtwoord (van de praktijk, of je eigen)": een praktijkwachtwoord bestaat dan niet. Het e-mailveld
// van de verlopen-pagina was ook leeg op het apparaat van de aanmelding zelf.
// Nu: bij eigen login alleen "Je e-mail" (verplicht) en "Wachtwoord", e-mail van de proef ingevuld op
// het eigen apparaat; zonder de schakelaar blijven de oude teksten. Alleen de server, zonder browser.
// `npm run test:verlopeneigenlogin`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const sha = (t) => createHash("sha256").update(t).digest("hex");
const hash = (ww) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(ww, s, 32).toString("hex"); };
const dag = 86400000;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

async function metServer(eigenLogin, fn) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-verlopeneigen-"));
  const token = randomBytes(24).toString("hex");
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
    verl000000000001: { id: "verl000000000001", email: "proef@example.test", naam: "Proef Gebruiker", tel: "+31612340008",
      praktijk: "Fysio Verlopen", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(token)], tokenT: { [sha(token)]: Date.now() - dag } }
  }));
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
    "fysio verlopen": { hash: hash("verlopen-wachtwoord-1"), gemaakt: Date.now() - 14 * dag, proef: { id: "verl000000000001", verloopt: Date.now() - dag } }
  }));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      EIGEN_LOGIN_VERPLICHT: eigenLogin ? "aan" : "uit" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let uit = "";
  app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
  app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    await fn(origin, "fpproef=" + token);
  } catch (e) { console.error(uit); throw e; } finally {
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
const kop = (extra = {}) => ({ "x-forwarded-for": "10.74.0." + Math.floor(Math.random() * 250), ...extra });
const veld = (html, id) => (html.match(new RegExp('<input id="' + id + '"[^>]*>')) || [""])[0];
const label = (html, id) => (html.match(new RegExp('<label for="' + id + '">([\\s\\S]*?)</label>')) || ["", ""])[1];

await metServer(true, async (origin, cookie) => {
  const verlopen = await (await fetch(origin + "/v2/app", { headers: kop({ cookie }), redirect: "manual" })).text();
  assert.match(verlopen, /voorbij/i, "verlopen-pagina");
  assert.doesNotMatch(verlopen, /wachtwoord van (je|de) praktijk|van de praktijk, of je eigen|alleen als je met een eigen login werkt/,
    "eigen login: geen praktijkwachtwoord op de verlopen-pagina");
  assert.match(verlopen, /met je eigen login\./, "uitleg noemt de eigen login");
  // sweep 20-11: de proef liep t/m de einddatum, dus niet "Sinds <einddatum> kun je geen kaarten meer maken"
  assert.doesNotMatch(verlopen, /Sinds <b>/, "verlopen-pagina zegt niet 'Sinds <einddatum>'");
  assert.match(verlopen, /Je proef liep tot en met <b>[^<]+<\/b>/, "verlopen-pagina: proef liep t/m de einddatum");
  assert.match(veld(verlopen, "ov_email"), /value="proef@example\.test"/, "e-mail van de proef ingevuld op het eigen apparaat");
  assert.match(veld(verlopen, "ov_email"), /\brequired\b/, "e-mail verplicht bij eigen login");
  assert.equal(label(verlopen, "ov_ww").trim(), "Wachtwoord", "wachtwoordlabel zonder praktijkwachtwoord");
  // een ander apparaat (zonder proefcookie) krijgt geen e-mailadres van de proef te zien
  const gegevens = await (await fetch(origin + "/v2/gegevens", { headers: kop() })).text();
  assert.doesNotMatch(gegevens, /wachtwoord van de praktijk|van de praktijk, of je eigen|alleen als je met een eigen login werkt/,
    "eigen login: /v2/gegevens noemt geen praktijkwachtwoord");
  assert.match(gegevens, /je moet beheerder van de praktijk zijn/, "uitleg /v2/gegevens");
  for (const id of ["dl_email", "ws_email"]) {
    assert.match(veld(gegevens, id), /\brequired\b/, id + " verplicht");
    assert.doesNotMatch(veld(gegevens, id), /example\.test/, id + " lekt geen e-mailadres");
  }
  for (const id of ["dl_ww", "ws_ww"]) assert.equal(label(gegevens, id).trim(), "Wachtwoord", id + " label");
});

await metServer(false, async (origin, cookie) => {
  const verlopen = await (await fetch(origin + "/v2/app", { headers: kop({ cookie }), redirect: "manual" })).text();
  assert.match(verlopen, /met het wachtwoord van je praktijk of je eigen login/, "zonder schakelaar: oude uitleg");
  assert.doesNotMatch(veld(verlopen, "ov_email"), /\brequired\b/, "zonder schakelaar: e-mail niet verplicht");
  const gegevens = await (await fetch(origin + "/v2/gegevens", { headers: kop() })).text();
  assert.match(gegevens, /Je hebt het wachtwoord van de praktijk nodig/, "zonder schakelaar: oude uitleg /v2/gegevens");
  assert.doesNotMatch(gegevens, /__[A-Z_]+__/, "geen open plekhouders");
});
console.log("verlopeneigenlogin: ok (eigen login: geen praktijkwachtwoord op de verlopen-pagina en /v2/gegevens, e-mail ingevuld en verplicht)");
