import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-ahmed-notities-"));
const mail = [];
const aiCalls = [];

const mailServer = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  if (request.method === "POST" && request.url === "/emails") {
    mail.push(JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "test-mail-id" }));
    return;
  }
  if (request.method === "POST" && request.url === "/v1/messages") {
    aiCalls.push({
      body: JSON.parse(body),
      workspaceId: request.headers["anthropic-workspace-id"]
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ content: [{ text: JSON.stringify({
      trainingsdoel: "Werp-ABC",
      frequentie: "2× per week",
      trainingsnotitie: "Evalueer de techniek na twee weken.",
      opmerking: "Evalueer pijn en techniek na twee weken.",
      casus: "Schouder bij werpbelasting",
      toelichting: "Voorstel ter beoordeling door de fysiotherapeut.",
      waarschuwing: "Controleer de belastbaarheid voor de eerste sessie.",
      oefeningen: [
        { naam: "Abdominal (apparaat)", series: "3", herhalingen: "8", gewicht: "licht",
          borg: "4", xrm: "12RM", rust: "60 sec", tempo: "2-1-2", waarom: "Rustige startdosering." },
        { naam: "Abroller", series: "2", herhalingen: "6", gewicht: "lichaamsgewicht",
          borg: "3", xrm: "", rust: "60 sec", tempo: "3-1-3", waarom: "Gecontroleerde rompopbouw." },
        { naam: "Alternate heel touchers", series: "2", herhalingen: "8 per zijde", gewicht: "lichaamsgewicht",
          borg: "3", xrm: "", rust: "45 sec", tempo: "rustig", waarom: "Gedoseerde laterale rompcontrole." },
        { naam: "Anteflexie armen", series: "2", herhalingen: "8", gewicht: "zonder weerstand",
          borg: "2", xrm: "", rust: "45 sec", tempo: "2-1-2", waarom: "Rustige schouderactivatie." }
      ]
    }) }] }));
    return;
  }
  response.writeHead(404).end();
});
await new Promise((resolve) => mailServer.listen(0, "127.0.0.1", resolve));
const mailPort = mailServer.address().port;

const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const appPort = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${appPort}`;

const app = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(appPort),
    DATA_DIR: dataDir,
    ADMIN_KEY: "test-admin-key",
    ACCOUNT_BEHEER_EMAILS: "beheerder@example.nl",
    V1_REGISTRATIE_CODE: "test-registratiecode",
    MAIL_API_SLEUTEL: "test-mail-key",
    MAIL_AFZENDER: "Fysiplan <account@fysiplan.nl>",
    MAIL_API_BASIS: `http://127.0.0.1:${mailPort}`,
    ANTHROPIC_API_KEY: "test-ai-key",
    ANTHROPIC_WORKSPACE_ID: "test-workspace-id",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${mailPort}`
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let appOutput = "";
app.stdout.on("data", (chunk) => { appOutput += chunk; });
app.stderr.on("data", (chunk) => { appOutput += chunk; });

async function wachtOpServer() {
  for (let poging = 0; poging < 100; poging++) {
    try {
      const response = await fetch(origin + "/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Testserver startte niet.\n" + appOutput);
}

async function json(path, init = {}) {
  const response = await fetch(origin + path, init);
  const body = await response.json();
  return { response, body };
}

async function post(path, body, headers = {}) {
  return json(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

try {
  await wachtOpServer();

  const afgeschermd = await fetch(origin + "/");
  assert.equal(afgeschermd.status, 200);
  assert.match(await afgeschermd.text(), /Inloggen bij Fysiplan/);

  const v2Vrij = await fetch(origin + "/v2/app");
  assert.equal(v2Vrij.status, 200);
  assert.match(await v2Vrij.text(), /Fysiplan/);

  const status = await json("/api/v1/status");
  assert.equal(status.body.registratieOpen, true);
  assert.equal(status.body.ingelogd, false);

  const foutCode = await post("/api/v1/registreer", { email: "therapeut@example.nl", code: "fout" });
  assert.equal(foutCode.response.status, 403);
  assert.match(foutCode.body.fout, /praktijkcode klopt niet/i);
  assert.doesNotMatch(foutCode.body.fout, /beheer/i);
  assert.equal(mail.length, 0);

  const registratie = await post("/api/v1/registreer", {
    email: "therapeut@example.nl",
    code: "  TEST–REGISTRATIE–CODE  "
  });
  assert.equal(registratie.response.status, 200);
  assert.equal(registratie.body.gestuurd, true);
  assert.equal(mail.length, 1);
  assert.deepEqual(mail[0].to, ["therapeut@example.nl"]);
  assert.equal(mail[0].from, "Fysiplan <account@fysiplan.nl>");
  const token = mail[0].text.match(/token=([a-f0-9]{48})/i)?.[1];
  assert.ok(token, "instelmail bevat een wachtwoordtoken");

  const teKort = await post("/api/v1/wachtwoord-zetten", { token, wachtwoord: "kort" });
  assert.equal(teKort.response.status, 400);

  const ingesteld = await post("/api/v1/wachtwoord-zetten", {
    token,
    wachtwoord: "Veilig testwachtwoord 2026"
  });
  assert.equal(ingesteld.response.status, 200);
  const sessieCookie = ingesteld.response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(sessieCookie || "", /^fp1=[a-f0-9]{48}$/);

  const tokenEenmalig = await post("/api/v1/wachtwoord-zetten", {
    token,
    wachtwoord: "Nog een veilig wachtwoord"
  });
  assert.equal(tokenEenmalig.response.status, 410);

  const appPagina = await fetch(origin + "/", { headers: { cookie: sessieCookie } });
  const appHtml = await appPagina.text();
  assert.match(appHtml, /id="fp1uit"/);
  assert.match(appHtml, /therapeut@example\.nl/);
  assert.doesNotMatch(appHtml, /id="fp1uit"[^>]*position:fixed/);
  assert.match(appHtml, /id="fp1uitknop"[^>]*background:#1f6feb;color:#fff/);
  assert.ok(appHtml.indexOf('id="menuHelp"') < appHtml.indexOf('id="fp1uit"'));
  assert.ok(appHtml.indexOf('id="fp1uit"') < appHtml.indexOf('class="spacer"'));

  const uitgelogd = await fetch(origin + "/api/v1/logout", {
    method: "POST",
    headers: { cookie: sessieCookie }
  });
  assert.equal(uitgelogd.status, 200);
  assert.match(uitgelogd.headers.get("set-cookie") || "", /Max-Age=0/);

  const verkeerdeLogin = await post("/api/v1/login", {
    email: "therapeut@example.nl",
    wachtwoord: "verkeerd"
  });
  assert.equal(verkeerdeLogin.response.status, 403);

  const login = await post("/api/v1/login", {
    email: "therapeut@example.nl",
    wachtwoord: "Veilig testwachtwoord 2026"
  });
  assert.equal(login.response.status, 200);
  assert.match(login.response.headers.get("set-cookie") || "", /fp1=[a-f0-9]{48}/);

  const onbekendHerstel = await post("/api/v1/wachtwoord-vergeten", { email: "onbekend@example.nl" });
  assert.equal(onbekendHerstel.response.status, 200);
  assert.equal(mail.length, 1, "onbekend adres lekt geen account en krijgt geen mail");

  const herstel = await post("/api/v1/wachtwoord-vergeten", { email: "therapeut@example.nl" });
  assert.equal(herstel.response.status, 200);
  assert.equal(mail.length, 2);

  const beginCategorieen = await json("/api/oefeningen/categorieen");
  assert.equal(beginCategorieen.response.status, 200);
  assert.ok(beginCategorieen.body.categorieen.includes("Core"));

  const onbevoegd = await post("/api/oefeningen/categorieen", { naam: "Werp-ABC" });
  assert.equal(onbevoegd.response.status, 403);

  const headers = { "x-admin-sleutel": "test-admin-key" };
  const slashNaam = await post("/api/oefeningen/categorieen", { naam: "Werp/ABC" }, headers);
  assert.equal(slashNaam.response.status, 400);
  const toegevoegd = await post("/api/oefeningen/categorieen", { naam: "Werp-ABC" }, headers);
  assert.equal(toegevoegd.response.status, 200);
  assert.ok(toegevoegd.body.categorieen.includes("Werp-ABC"));

  const dubbel = await post("/api/oefeningen/categorieen", { naam: "werp-abc" }, headers);
  assert.equal(dubbel.response.status, 409);

  const v1Manifest = await (await fetch(origin + "/oefeningen.json")).json();
  const manifestResponse = await fetch(origin + "/v2/oefeningen.json");
  const manifest = await manifestResponse.json();
  const v1Images = new Map(v1Manifest.map((entry) => [entry.naam, entry.img]));
  assert.equal(manifest.length, v1Manifest.length);
  assert.ok(manifest.every((entry) => entry.img.replace(/^\/v2\//, "") === v1Images.get(entry.naam)));
  const oefening = manifest.find((entry) => entry.groep && entry.groep !== "Werp-ABC");
  assert.ok(oefening);
  const tweedeCategorie = await post("/api/oefeningen/categorie", {
    naam: oefening.naam,
    groep: oefening.groep,
    ook: ["Werp-ABC"]
  }, headers);
  assert.equal(tweedeCategorie.response.status, 200);
  const bijgewerktManifest = await (await fetch(origin + "/v2/oefeningen.json", { cache: "no-store" })).json();
  const bijgewerkt = bijgewerktManifest.find((entry) => entry.naam === oefening.naam);
  assert.ok(bijgewerkt.ook.includes("Werp-ABC"));

  const opgeslagenCategorieen = JSON.parse(await readFile(join(dataDir, "categorie-toevoegingen.json"), "utf8"));
  assert.deepEqual(opgeslagenCategorieen, ["Werp-ABC"]);

  const geenDoel = await post("/api/assistent", { klacht: "schouderklacht" });
  assert.equal(geenDoel.response.status, 400);
  assert.equal(aiCalls.length, 0);

  const assistent = await post("/api/assistent", {
    doel: "Werp-ABC",
    klacht: "opbouw werpbelasting na een schouderklacht"
  });
  assert.equal(assistent.response.status, 200);
  assert.equal(assistent.body.trainingsdoel, "Werp-ABC");
  assert.equal(assistent.body.frequentie, "2× per week");
  assert.equal(assistent.body.opmerking, "Evalueer pijn en techniek na twee weken.");
  assert.equal(assistent.body.casus, "Schouder bij werpbelasting");
  assert.equal(assistent.body.waarschuwing, "Controleer de belastbaarheid voor de eerste sessie.");
  assert.deepEqual(assistent.body.oefeningen[0], {
    naam: "Abdominal (apparaat)", series: "3", herhalingen: "8", gewicht: "licht",
    borg: "4", xrm: "12RM", rust: "60 sec", tempo: "2-1-2", waarom: "Rustige startdosering."
  });
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].workspaceId, "test-workspace-id");
  assert.equal(aiCalls[0].body.max_tokens, 2400);
  assert.equal(aiCalls[0].body.output_config.effort, "low");
  assert.equal(aiCalls[0].body.output_config.format.type, "json_schema");
  assert.match(aiCalls[0].body.output_config.format.schema.properties.opmerking.description, /kaartvak Opm/);
  assert.match(aiCalls[0].body.output_config.format.schema.properties.casus.description, /kernwoorden/);
  assert.match(aiCalls[0].body.output_config.format.schema.properties.oefeningen.description, /4 tot 6/);
  assert.equal(aiCalls[0].body.system[0].cache_control.type, "ephemeral");
  assert.match(aiCalls[0].body.system[0].text, /BORG, XRM, rust en tempo/);
  assert.equal(aiCalls[0].body.messages[0].content,
    "<trainingsdoel>Werp-ABC</trainingsdoel>\n<klacht>opbouw werpbelasting na een schouderklacht</klacht>");

  // Persoonlijke accountbeheerrechten: de openbare beheerheader volstaat niet.
  assert.equal((await json('/api/medewerkers', { headers })).response.status, 403);
  const therapeutCookie = login.response.headers.get('set-cookie').split(';', 1)[0];
  assert.equal((await json('/api/medewerkers', { headers: { cookie: therapeutCookie } })).response.status, 403);
  await post('/api/v1/registreer', { email: 'beheerder@example.nl', code: 'test-registratiecode' });
  const beheerToken = mail.at(-1).text.match(/token=([a-f0-9]{48})/)[1];
  const beheerLogin = await post('/api/v1/wachtwoord-zetten', { token: beheerToken, wachtwoord: 'Veilig beheerwachtwoord 2026' });
  const beheerHeaders = { cookie: beheerLogin.response.headers.get('set-cookie').split(';', 1)[0] };
  const lijst = await json('/api/medewerkers', { headers: beheerHeaders });
  assert.equal(lijst.response.status, 200);
  const beheerPagina = await fetch(origin + '/medewerkers', { headers: beheerHeaders });
  assert.equal(beheerPagina.status, 200);
  assert.match(await beheerPagina.text(), /Toegang intrekken/);
  assert.match(await readFile('public/index.html', 'utf8'), /_medewerkers\.href='\/medewerkers'/);
  assert.equal(lijst.body.medewerkers.length, 2);
  assert.ok(lijst.body.medewerkers.every(m => !('hash' in m)));
  const wijzig = { email: 'therapeut@example.nl', geblokkeerd: true };
  assert.equal((await post('/api/medewerkers', wijzig, { ...beheerHeaders, origin: 'https://evil.example' })).response.status, 403);
  assert.equal((await post('/api/medewerkers', { email: 'beheerder@example.nl', geblokkeerd: true }, beheerHeaders)).response.status, 400);
  assert.equal((await post('/api/medewerkers', wijzig, beheerHeaders)).response.status, 200);
  assert.equal((await json('/api/v1/status', { headers: { cookie: therapeutCookie } })).body.ingelogd, false);
  assert.equal((await post('/api/v1/login', { email: wijzig.email, wachtwoord: 'Veilig testwachtwoord 2026' })).response.status, 403);
  const mailAantal = mail.length;
  await post('/api/v1/registreer', { email: wijzig.email, code: 'test-registratiecode' });
  await post('/api/v1/wachtwoord-vergeten', { email: wijzig.email });
  assert.equal(mail.length, mailAantal, 'Een blokkade kan niet via mail worden omzeild');
  const oudHerstelToken = mail[1].text.match(/token=([a-f0-9]{48})/)[1];
  assert.equal((await post('/api/v1/wachtwoord-zetten', { token: oudHerstelToken, wachtwoord: 'Nieuw wachtwoord 2026' })).response.status, 410);
  assert.equal(JSON.parse(await readFile(join(dataDir, 'v1-accounts.json'), 'utf8'))[wijzig.email].geblokkeerd, true);
  assert.equal((await post('/api/medewerkers', { ...wijzig, geblokkeerd: false }, beheerHeaders)).response.status, 200);
  assert.equal((await post('/api/v1/login', { email: wijzig.email, wachtwoord: 'Veilig testwachtwoord 2026' })).response.status, 200);
  assert.equal((await json('/api/v1/status', { headers: { cookie: therapeutCookie } })).body.ingelogd, false, 'Herstellen reanimeert geen oude sessie');
  console.log("OK: account/mail/login, persoonlijk intrekken/herstellen, V2 categoriebeheer en AI werken end-to-end.");
} finally {
  if (app.exitCode === null) app.kill("SIGTERM");
  await Promise.all([
    app.exitCode === null ? new Promise((resolve) => app.once("exit", resolve)) : Promise.resolve(),
    new Promise((resolve) => mailServer.close(resolve))
  ]);
  await rm(dataDir, { recursive: true, force: true });
}
