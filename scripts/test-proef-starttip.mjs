// Starttip: een proef die na 3 dagen nog geen enkele kaart met een patiënt deelde, krijgt één mail met de
// eerste stappen en beheer een seintje om te bellen. Alleen met PROEF_STARTTIP=aan; zonder verandert er
// niets. Niet aan wie al een kaart deelde, klant is, al "doorgaan" koos, nog geen 3 dagen bezig is of al
// veel verder is (geen inhaalmails bij het aanzetten). Een tweede ronde stuurt niets opnieuw.
// Zonder browser. `npm run test:starttip`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const uur = 3600000, dag = 24 * uur, nu = Date.now();
const proef = (id, gestart, extra) => ({ id, email: id + "@praktijk.nl", naam: "Piet " + id, tel: "+31612340000", praktijk: "Fysio " + id,
  akkoord: "x", tokens: [], gestart, verloopt: gestart + 14 * dag, ...extra });
const aanmeldingen = () => ({
  stil: proef("stil", nu - 3 * dag - 2 * uur),                          // dag 3, geen kaart: tip
  actief: proef("actief", nu - 3 * dag - 2 * uur, { kaarten: 2 }),      // deelde al kaarten: niets
  vroeg: proef("vroeg", nu - dag),                                      // pas 1 dag bezig: nog niets
  laat: proef("laat", nu - 8 * dag),                                    // al ver: geen inhaalmail
  klant: proef("klant", nu - 3 * dag - 2 * uur, { klant: true }),       // klant: niets
  door: proef("door", nu - 3 * dag - 2 * uur, { doorgaan: nu - uur }),  // koos al doorgaan: niets
  bijna: proef("bijna", nu - 13 * dag)                                  // ijkpunt: herinnering, ronde is gedraaid
});

async function ronde(aan) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-starttip-"));
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
        MOLLIE_API_KEY: "", MOLLIE_INCASSO: "", PROEF_STARTTIP: aan ? "aan" : "",
        MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" },
      stdio: ["ignore", "pipe", "pipe"] });
    for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:" + port + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    // de eerste proefronde draait 5 seconden na de start
    for (let i = 0; i < 150; i++) {
      const p = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
      if (p.bijna.herinnerd) break;
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

// uit (zoals nu op productie): geen starttip, de herinnering gaat gewoon door
{
  const { mails, proeven } = await ronde(false);
  assert.equal(mails.filter((m) => /eerste Fysiplan-kaart|Proef zonder kaart/.test(m.subject)).length, 0, "zonder PROEF_STARTTIP geen starttip");
  assert.ok(proeven.bijna.herinnerd, "de proefronde draaide wel");
  assert.ok(!proeven.stil.startTip);
}
// aan
{
  const { mails, proeven } = await ronde(true);
  const tips = mails.filter((m) => /eerste Fysiplan-kaart/.test(m.subject));
  assert.deepEqual(tips.map(naar), ["stil@praktijk.nl"], "alleen de stille proef op dag 3; niet actief, vroeg, laat, klant of doorgaan");
  const t = tips[0].text;
  assert.match(t, /^Hoi Piet,/);
  assert.match(t, /nog geen kaart met een patiënt gedeeld/);
  assert.match(t, /https:\/\/fysiplan\.nl\/v2\/app/);
  assert.match(t, /Print de A4/);
  assert.match(t, /Antwoord op deze mail, dan bellen we je/);
  assert.doesNotMatch(t, /\bAI\b|dosering/, "geen AI- of doseringsbelofte");
  const beheer = mails.filter((m) => naar(m) === "beheer@voorbeeld.nl" && /Proef zonder kaart/.test(m.subject));
  assert.equal(beheer.length, 1, "één seintje aan beheer");
  assert.match(beheer[0].subject, /Fysio stil/);
  assert.ok(proeven.stil.startTip && !proeven.actief.startTip && !proeven.vroeg.startTip && !proeven.laat.startTip &&
    !proeven.klant.startTip && !proeven.door.startTip);
}
console.log("Starttip op dag 3 voor een proef zonder gedeelde kaart, alleen met PROEF_STARTTIP=aan: ok.");
