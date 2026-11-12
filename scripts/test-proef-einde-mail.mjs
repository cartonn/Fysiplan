// Mails rond het einde van de proef: op de dag dat de proef afloopt krijgt de aanmelder één mail
// (wat er nog kan, hoe je doorgaat, wanneer er gewist wordt) en beheer een seintje. Proeven die al
// langer voorbij zijn, klanten en wie al "Ja, ik wil doorgaan" koos, krijgen niets. Met Mollie
// (MOLLIE_API_KEY) noemen die mail en de herinnering twee dagen vooraf de link om online af te
// rekenen; zonder Mollie blijft de oude zin "antwoord op deze mail, dan bellen we je".
// Zonder browser. `npm run test:proefeindemail`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const uur = 3600000, dag = 24 * uur, nu = Date.now();
const basis = (id, extra) => ({ id, email: id + "@praktijk.nl", naam: "Piet " + id, tel: "+31612340000", praktijk: "Fysio " + id,
  akkoord: "x", tokens: [], gestart: nu - 14 * dag, ...extra });
const aanmeldingen = () => ({
  net: basis("net", { verloopt: nu - 2 * uur, herinnerd: nu - 2 * dag }),       // vandaag afgelopen: einde-mail
  oud: basis("oud", { verloopt: nu - 3 * dag, herinnerd: nu - 5 * dag }),       // al dagen voorbij: niets (geen inhaalmails bij een uitrol)
  klant: basis("klant", { verloopt: nu - 2 * uur, klant: true }),                // klant: niets
  door: basis("door", { verloopt: nu - 2 * uur, doorgaan: nu - dag, herinnerd: nu - 2 * dag }), // koos al doorgaan: Ahmed belt al
  bijna: basis("bijna", { verloopt: nu + dag })                                  // over een dag: herinnering
});

async function ronde(mollie) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefeinde-"));
  const mails = [];
  const nep = createServer((req, res) => {
    let d = ""; req.on("data", (c) => { d += c; });
    req.on("end", () => { if (req.url === "/emails") mails.push(JSON.parse(d)); res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"m"}'); });
  });
  await new Promise((r) => nep.listen(0, "127.0.0.1", r));
  const nepUrl = "http://127.0.0.1:" + nep.address().port;
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify(aanmeldingen()));
  const start = async () => {
    const reserve = createServer();
    await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
    const port = reserve.address().port;
    await new Promise((r) => reserve.close(r));
    const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
        MOLLIE_API_KEY: mollie ? "test_nepsleutel" : "", MOLLIE_API_BASIS: nepUrl, MOLLIE_INCASSO: "",
        MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" },
      stdio: ["ignore", "pipe", "pipe"] });
    for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:" + port + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    // de eerste proefronde draait 5 seconden na de start
    for (let i = 0; i < 150; i++) {
      const p = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
      if (p.net.eindeGemeld && p.bijna.herinnerd) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => { app.on("exit", r); app.kill(); });
  };
  try {
    await start();
    const eerst = mails.length;
    await start(); // tweede start: niets dubbel
    assert.equal(mails.length, eerst, "een tweede ronde stuurt geen mail opnieuw");
    const proeven = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
    return { mails, proeven };
  } finally {
    nep.close();
    await new Promise((r) => setTimeout(r, 200));
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
}
const naar = (m) => [].concat(m.to).join(",");

// zonder Mollie
{
  const { mails, proeven } = await ronde(false);
  const einde = mails.filter((m) => /proef is afgelopen/.test(m.subject));
  assert.deepEqual(einde.map(naar), ["net@praktijk.nl"], "alleen de proef die vandaag afliep; niet oud, klant of doorgaan");
  const t = einde[0].text;
  assert.match(t, /Nieuwe kaarten maken kan nu niet meer/);
  assert.match(t, /blijven werken/);
  assert.match(t, /Antwoord op deze mail, dan bellen we je/);
  assert.doesNotMatch(t, /online af/, "zonder Mollie geen betaallink");
  assert.match(t, /wissen we op \S+ \d+ \S+ alles van je praktijk/);
  assert.ok(proeven.net.eindeGemeld && !proeven.oud.eindeGemeld && !proeven.klant.eindeGemeld && !proeven.door.eindeGemeld);
  const beheer = mails.filter((m) => naar(m) === "beheer@voorbeeld.nl" && /Proef afgelopen/.test(m.subject));
  assert.equal(beheer.length, 1, "één seintje aan beheer");
  const herinner = mails.find((m) => naar(m) === "bijna@praktijk.nl");
  assert.match(herinner.subject, /over twee dagen af/);
  assert.match(herinner.text, /Antwoord op deze mail, dan bellen we je om het abonnement af te spreken/);
  assert.doesNotMatch(herinner.text, /online af/);
}
// met Mollie
{
  const { mails } = await ronde(true);
  const einde = mails.find((m) => naar(m) === "net@praktijk.nl");
  assert.match(einde.text, /Reken de eerste maand online af op https:\/\/fysiplan\.nl\/v2\/proef\?mijn=1/);
  assert.match(einde.text, /9,99 euro per therapeut per maand, exclusief btw/);
  const herinner = mails.find((m) => naar(m) === "bijna@praktijk.nl");
  assert.match(herinner.text, /online af op https:\/\/fysiplan\.nl\/v2\/proef\?mijn=1/);
}
console.log("Mail op de dag dat de proef afloopt, en de betaallink in de proefmails als Mollie aan staat: ok.");
