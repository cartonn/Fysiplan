// Factuurgegevens van de praktijk (naam + adres) op Mijn abonnement en op de factuur.
// Een volledige factuur boven 100 euro moet het adres van de afnemer hebben (art. 35a Wet OB).
// Een factuur die al met factuurgegevens is uitgegeven, verandert niet meer. `npm run test:abonnement`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afnemerGegevens, factuurHtml, AFNEMER_ADRES_MAX } from "../lib/factuur.js";

// ---- pure regels ----
assert.deepEqual(afnemerGegevens("  Fysio  De Brug ", "Dorpsstraat 1\r\n\r\n1234 AB  Ergens "), { naam: "Fysio De Brug", adres: "Dorpsstraat 1\n1234 AB Ergens" });
assert.deepEqual(afnemerGegevens("", ""), { naam: "", adres: "" }, "leeg mag (optioneel)");
assert.ok(afnemerGegevens("", "Dorpsstraat 1").fout, "adres zonder naam niet");
assert.ok(afnemerGegevens("x", "a".repeat(AFNEMER_ADRES_MAX + 1)).fout, "te lang adres");
assert.ok(afnemerGegevens("x", "1\n2\n3\n4\n5\n6").fout, "te veel regels");
assert.equal(afnemerGegevens("A\u0000B\tC", "").naam, "ABC", "stuurtekens weg");
const lev = { bedrijf: "Fysiplan B.V.", kvk: "12345678", adres: "Straat 1, Utrecht", btwNummer: "NL000000000B01" };
const groot = { aantal: 11, bedrag: "109.89", sinds: Date.UTC(2026, 10, 8), betaaldTot: Date.UTC(2026, 11, 8), eersteBetaling: "tr_x1", factuurNr: "FP-2026-0001" };
assert.match(factuurHtml({ leverancier: lev, afnemer: { naam: "P", email: "a@b.nl" }, abonnement: groot }), /hoort het adres van je praktijk/, "boven 100 euro zonder adres: melding");
const metAdres = factuurHtml({ leverancier: lev, afnemer: { naam: "P", adres: "Straat <b>2</b>\n1234 AB Plaats", email: "a@b.nl" }, abonnement: groot });
assert.doesNotMatch(metAdres, /hoort het adres/);
assert.match(metAdres, /Straat &lt;b&gt;2&lt;\/b&gt;<br\/>1234 AB Plaats/, "adres ge-escaped, regels behouden");
assert.doesNotMatch(factuurHtml({ leverancier: lev, afnemer: { naam: "P" }, abonnement: { ...groot, bedrag: "9.99" } }), /hoort het adres/, "onder 100 euro geen melding");
assert.doesNotMatch(factuurHtml({ leverancier: {}, afnemer: { naam: "P" }, abonnement: groot }), /hoort het adres/, "betaalbewijs: geen melding");

// ---- server ----
const dag = 86400000, nu = Date.now();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-factuurgegevens-"));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tokens = { goed: "c".repeat(48), proef: "d".repeat(48) };
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  goed: { id: "goed", email: "goed@praktijk.nl", naam: "Naam Goed", tel: "+31612345678", praktijk: "Goed Fysio",
    gestart: nu - 60 * dag, verloopt: nu - 46 * dag, akkoord: nu - 60 * dag, tokens: [hash(tokens.goed)], klant: true,
    betaling: { id: "tr_eerste1", klant: "cst_goed1234", aantal: 11, status: "paid", gemaakt: nu - 31 * dag },
    abonnement: { status: "actief", aantal: 11, bedrag: "109.89", sinds: nu - 31 * dag, betaaldTot: nu + 20 * dag, eersteBetaling: "tr_eerste1", factuurNr: "FP-2026-0001",
      betalingen: [{ id: "tr_maand2", bedrag: "109.89", sinds: nu - dag, betaald: nu - dag }] } },
  proef: { id: "proef", email: "proef@praktijk.nl", naam: "Naam Proef", tel: "+31612345679", praktijk: "",
    gestart: nu - dag, verloopt: nu + 13 * dag, akkoord: nu - dag, tokens: [hash(tokens.proef)] }
}));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MOLLIE_API_KEY: "test_nep", MOLLIE_API_BASIS: "http://127.0.0.1:9", MOLLIE_INCASSO: "", MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "",
    FYSIPLAN_BEDRIJF: lev.bedrijf, FYSIPLAN_KVK: lev.kvk, FYSIPLAN_ADRES: lev.adres, FYSIPLAN_BTW_NUMMER: lev.btwNummer },
  stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
const cookie = (t) => ({ cookie: "fpproef=" + tokens[t] });
const post = (t, velden, extra = {}) => fetch(origin + "/v2/proef/factuurgegevens", { method: "POST", redirect: "manual",
  headers: { ...cookie(t), "content-type": "application/x-www-form-urlencoded", ...extra }, body: new URLSearchParams(velden).toString() });
const lees = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  const mijn = await (await fetch(origin + "/v2/proef?mijn=1", { headers: cookie("goed") })).text();
  assert.match(mijn, /id="factuurgegevens"/, "Mijn abonnement heeft het blok Factuurgegevens");
  assert.match(mijn, /action="\/v2\/proef\/factuurgegevens"/);

  // alleen de eigen praktijk met abonnement; kruis-site en fouten veranderen niets
  assert.equal((await post("proef", { naam: "X", adres: "Y" })).status, 303, "proef zonder abonnement");
  assert.equal((await fetch(origin + "/v2/proef/factuurgegevens", { method: "POST", redirect: "manual", body: "naam=X" })).status, 303, "zonder cookie");
  assert.equal((await post("goed", { naam: "X", adres: "Y" }, { "sec-fetch-site": "cross-site" })).status, 403, "kruis-site geweigerd");
  assert.equal((await post("goed", { naam: "", adres: "Straat 1" })).status, 422, "adres zonder naam");
  assert.equal((await lees()).goed.abonnement.afnemer, undefined, "niets bewaard");

  // bewaren: de eerste factuur (al uitgegeven zonder factuurgegevens) krijgt het adres
  const ok = await post("goed", { naam: "Fysio De Brug B.V.", adres: "Dorpsstraat 1\n1234 AB Ergens" });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /factuurgegevens zijn bewaard/);
  const ab = (await lees()).goed.abonnement;
  assert.equal(ab.afnemer.naam, "Fysio De Brug B.V."); assert.equal(ab.afnemer.adres, "Dorpsstraat 1\n1234 AB Ergens");
  assert.ok(!JSON.stringify(ab.afnemer).includes("<"), "geen opmaak");
  const f2 = await (await fetch(origin + "/v2/proef/factuur", { headers: cookie("goed") })).text();
  assert.match(f2, /Fysio De Brug B\.V\./); assert.match(f2, /Dorpsstraat 1<br\/>1234 AB Ergens/);
  assert.doesNotMatch(f2, /hoort het adres/);
  assert.match(await (await fetch(origin + "/v2/proef?mijn=1", { headers: cookie("goed") })).text(), /Dorpsstraat 1\n1234 AB Ergens<\/textarea>/, "formulier toont het bewaarde adres");

  // de maandfactuur krijgt bij het uitgeven van het nummer de gegevens van dat moment vast
  const nr = (await lees()).goed.abonnement.betalingen[0].factuurNr;
  assert.match(nr, /^FP-\d{4}-\d{4}$/, "maandfactuur heeft een nummer");
  assert.equal((await lees()).goed.abonnement.betalingen[0].afnemer.adres, "Dorpsstraat 1\n1234 AB Ergens", "vastgelegd bij uitgeven");
  assert.equal((await post("goed", { naam: "Nieuwe Naam", adres: "Andere Straat 9" })).status, 200);
  const f3 = await (await fetch(origin + "/v2/proef/factuur?nr=" + nr, { headers: cookie("goed") })).text();
  assert.match(f3, /Dorpsstraat 1/, "uitgegeven factuur verandert niet");
  assert.doesNotMatch(f3, /Andere Straat 9/);

  // leegmaken mag
  assert.equal((await post("goed", { naam: "", adres: "" })).status, 200);
  assert.equal((await lees()).goed.abonnement.afnemer, undefined);
  // eerste factuur weer zonder adres: boven 100 euro de melding
  const f4 = await (await fetch(origin + "/v2/proef/factuur", { headers: cookie("goed") })).text();
  assert.match(f4, /<h1>Factuur<\/h1>/);
  assert.match(f4, /hoort het adres van je praktijk/, "boven 100 euro zonder adres: melding");
  assert.doesNotMatch(uitvoer, /TypeError|ReferenceError/);
  console.log("factuurgegevens ok");
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
