// Welkomstlink is geen blijvend apparaattoken (security, 2026-11-11).
// De link in de welkomstmail (/v2/proef/terug?code=) was hetzelfde token als de proefcookie
// van het eerste apparaat en bleef geldig zolang de aanmelding bestond. Wie de mail later las
// (gedeelde mailbox, doorgestuurd bericht) kreeg zo de proef en het abonnementsbeheer.
// Nu: een eigen token in de mail, 7 dagen geldig, op hooguit 3 apparaten; een cookietoken
// opent /v2/proef/terug niet meer. Zonder browser, past in CI. `npm run test:welkomlink`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-welkomlink-"));
const mail = [];
const mailServer = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  if (request.method === "POST" && request.url === "/emails") { mail.push(JSON.parse(body)); response.writeHead(200).end("{}"); return; }
  response.writeHead(404).end();
});
await new Promise((r) => mailServer.listen(0, "127.0.0.1", r));

// vooraf: een aanmelding waarvan de welkomstlink al verlopen is
const sha = (t) => createHash("sha256").update(t).digest("hex");
const verlopenCode = randomBytes(24).toString("hex");
const dag = 86400000;
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud0000000000002: { id: "oud0000000000002", email: "oud@praktijk.nl", naam: "Piet", tel: "+31612340000", praktijk: "Fysio Oud",
    gestart: Date.now() - 9 * dag, verloopt: Date.now() + 5 * dag, akkoord: "x", tokens: [],
    welkomLink: { h: sha(verlopenCode), verloopt: Date.now() - 2 * dag, over: 3 } }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    PROEF_MELDING_AAN: "", MAIL_API_SLEUTEL: "test", MAIL_AFZENDER: "Fysiplan <proef@fysiplan.nl>",
    MAIL_API_BASIS: `http://127.0.0.1:${mailServer.address().port}` },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const xff = () => "10.9." + (ip >> 8) + "." + (ip++ & 255);
const terug = (code) => fetch(origin + "/v2/proef/terug", { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", "x-forwarded-for": xff() },
  body: "code=" + code });
const cookieUit = (r) => (r.headers.get("set-cookie") || "").split(";")[0];

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  const aanmeld = await fetch(origin + "/v2/proef", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": xff() },
    body: new URLSearchParams({ email: "sanne@praktijk-zuid.nl", naam: "Sanne de Vries", tel: "0612345679", praktijk: "Fysio Zuid", akkoord: "1", vwo: "1" }).toString() });
  assert.equal(aanmeld.status, 303);
  const cookieToken = cookieUit(aanmeld).replace(/^fpproef=/, "");
  assert.match(cookieToken, /^[a-f0-9]{48}$/);
  for (let i = 0; i < 100 && !mail.some((m) => m.to[0] === "sanne@praktijk-zuid.nl"); i++) await wacht(30);
  const welkom = mail.find((m) => m.to[0] === "sanne@praktijk-zuid.nl");
  assert.ok(welkom, "welkomstmail verstuurd");
  const code = welkom.text.match(/\/v2\/proef\/terug\?code=([a-f0-9]{48})/)[1];

  // de link in de mail is niet het cookietoken van het eerste apparaat
  assert.notEqual(code, cookieToken, "welkomstlink is een eigen token");
  assert.match(welkom.text, /7 dagen geldig/);
  // en een cookietoken opent /v2/proef/terug niet (zou anders een blijvende sleutel zijn)
  assert.equal((await terug(cookieToken)).status, 404, "cookietoken is geen maillink");

  // de welkomstlink werkt op 3 apparaten, elk met een eigen nieuw cookietoken
  const gezien = new Set([cookieToken]);
  for (let i = 0; i < 3; i++) {
    const r = await terug(code);
    assert.equal(r.status, 303, "gebruik " + (i + 1));
    const t = cookieUit(r).replace(/^fpproef=/, "");
    assert.match(t, /^[a-f0-9]{48}$/);
    assert.ok(!gezien.has(t), "elk apparaat een eigen token");
    gezien.add(t);
    // dat nieuwe token opent de app, maar is zelf ook geen maillink
    assert.equal((await terug(t)).status, 404);
  }
  assert.equal((await terug(code)).status, 404, "na 3 apparaten werkt de link niet meer");

  // verlopen welkomstlink (ouder dan 7 dagen) werkt niet
  assert.equal((await terug(verlopenCode)).status, 404, "verlopen welkomstlink");

  // de download van de eigen aanmelding bevat geen welkomstlink
  const opSchijf = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
  const p = Object.values(opSchijf).find((x) => x.email === "sanne@praktijk-zuid.nl");
  assert.equal(p.welkomLink, undefined, "opgebruikte welkomstlink is weg");
  assert.ok(!JSON.stringify(opSchijf).includes(code), "de code zelf staat nergens op schijf");

  assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled/);
  console.log("welkomstlink: eigen token, 7 dagen, hooguit 3 apparaten; cookietoken geen maillink.");
} finally {
  app.kill();
  mailServer.close();
  await rm(dataDir, { recursive: true, force: true });
}
