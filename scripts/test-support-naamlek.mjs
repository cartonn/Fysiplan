// Security 2026-11-15 16u: logboekregels van de support-agent van vóór #274 hebben alleen een
// praktijknaam. De download op /v2/gegevens (#331) koppelde ze op de huidige weergavenaam. Een andere
// beveiligde praktijk die zich daarna zo noemde (409, daarna "toch deze naam" mag) kreeg de oude
// regels van die praktijk (onderwerp, tekst, aantal mails) in haar eigen download.
// Nu: bij het laden één keer vastgezet op de pk als precies één praktijk zo heet; de download kijkt
// alleen nog naar de pk. Zonder browser (draait ook in CI). `npm run test:supportnaamlek`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-supportnaam-"));
const nu = Date.now();
const hash = (ww) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(ww, s, 32).toString("hex"); };
const account = (naam, ww) => ({ naam, hash: hash(ww), gemaakt: nu, vwo: { versie: "2026-11-01", t: new Date(nu).toISOString() } });
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
  "fysio echt": account("Fysio Echt", "echt-wachtwoord-1"),
  "fysio ander": account("Fysio Ander", "ander-wachtwoord-1"),
  // twee praktijken met dezelfde naam: een oude regel op die naam is van geen van beide aantoonbaar
  "fysio dubbel a": account("Fysio Dubbel", "dubbel-wachtwoord-1"),
  "fysio dubbel b": account("Fysio Dubbel", "dubbel-wachtwoord-2")
}));
await writeFile(join(dataDir, "praktijken.json"), JSON.stringify({
  "fysio echt": { praktijk: "Fysio Echt", adres: "Straat 1", plaats: "Utrecht" },
  "fysio ander": { praktijk: "Fysio Ander", adres: "Straat 2", plaats: "Zeist" }
}));
const t0 = new Date(nu).toISOString();
await writeFile(join(dataDir, "beheer-agent.json"), JSON.stringify({ stand: {}, rondes: [], laatsteRonde: null, verstuurd: {}, open: null,
  logboek: [
    { t: t0, wat: "gemaild", praktijk: "Fysio Echt", tekst: "Oude hulpmail aan Echt", onderwerp: "Onderwerp van Echt", aan: 2, wie: "agent" },
    { t: t0, wat: "nieuw", praktijk: "Fysio Dubbel", tekst: "Oude regel van een dubbele naam" }
  ] }));

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
const kop = (extra = {}) => ({ "x-forwarded-for": "10.7.4." + (ip++), ...extra });
const download = async (praktijk, wachtwoord) => {
  const r = await fetch(origin + "/v2/gegevens/download", { method: "POST", redirect: "manual",
    headers: kop({ "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams({ praktijk, wachtwoord }).toString() });
  assert.equal(r.status, 200, "download " + praktijk);
  return (await r.json()).support;
};

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // Fysio Ander logt in en noemt zich daarna "Fysio Echt" (bevestigd na de 409)
  const login = await fetch(origin + "/api/praktijk/login", { method: "POST", headers: kop({ "content-type": "application/json" }),
    body: JSON.stringify({ praktijk: "Fysio Ander", wachtwoord: "ander-wachtwoord-1" }) });
  assert.equal(login.status, 200, "login Fysio Ander");
  const sessie = (await login.json()).sessie;
  const hernoem = (extra) => fetch(origin + "/api/praktijken", { method: "POST",
    headers: kop({ "content-type": "application/json", "x-praktijk-sessie": sessie }),
    body: JSON.stringify({ praktijk: "Fysio Echt", adres: "Straat 2", plaats: "Zeist", ...extra }) });
  assert.equal((await hernoem({})).status, 409, "eerst een vraag");
  assert.equal((await hernoem({ zelfdeNaam: true })).status, 200, "daarna mag de naam");

  const ander = await download("fysio ander", "ander-wachtwoord-1");
  assert.ok(ander, "blok support in de download");
  assert.doesNotMatch(JSON.stringify(ander), /Oude hulpmail aan Echt|Onderwerp van Echt/,
    "de oude supportregel van Fysio Echt komt niet in de download van een praktijk die zich zo noemt");

  // de echte eigenaar ziet zijn oude regel nog wel (legal #331: download = wat bij wissen weggaat)
  const echt = await download("fysio echt", "echt-wachtwoord-1");
  assert.deepEqual(echt.logboek.map((r) => r.onderwerp), ["Onderwerp van Echt"], "eigen oude regel blijft in de eigen download");

  // een naam die bij het laden bij twee praktijken hoorde: in geen van beide downloads
  for (const [pk, ww] of [["fysio dubbel a", "dubbel-wachtwoord-1"], ["fysio dubbel b", "dubbel-wachtwoord-2"]]) {
    assert.doesNotMatch(JSON.stringify(await download(pk, ww)), /dubbele naam/, "geen regel op een dubbele naam bij " + pk);
  }
  console.log("test-support-naamlek: oude supportregels gaan alleen naar de praktijk waar ze aantoonbaar bij horen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  // eerst wachten tot de server echt weg is: anders schrijft hij nog in de map die we wissen (ENOTEMPTY)
  const weg = new Promise((r) => app.once("exit", r));
  app.kill();
  await weg;
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
}
