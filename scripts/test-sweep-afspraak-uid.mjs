// Regressietest gebruikers-sweep 2026-11-15 14u (Jayden, Pixel 7 + iPhone 14): na "Add to my calendar" verplaatste
// de therapeut de afspraak; een nieuwe download zette er een tweede afspraak bij en de oude reeks bleef met alarmen
// in de agenda staan. De UID bevatte het tijdstip en er was geen SEQUENCE. Nu: één vaste UID per kaart, een
// oplopend SEQUENCE en METHOD:PUBLISH, zodat de agenda de bestaande afspraak bijwerkt.
// Alleen server, geen browser: draait ook in CI. `npm run test:afspraakuid`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-afspraakuid-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.3." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Agenda Uid";
const veld = (ics, naam) => (ics.match(new RegExp("^" + naam + "[:;](.*)$", "m")) || [])[1];

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "agenda-uid-wachtwoord", akkoord: true })).json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const ics = async () => {
    const r = await fetch(origin + "/api/kaart/afspraak.ics?id=" + id + "&taal=en", { headers: kop() });
    assert.equal(r.status, 200); return r.text();
  };
  assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: Date.now() + 3 * 86400000, herhaal: 4 }, S)).status, 200, "reeks gezet");
  const een = await ics();
  await wacht(1100);
  assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: Date.now() + 4 * 86400000 + 3600000 }, S)).status, 200, "afspraak verplaatst");
  const twee = await ics();
  assert.notEqual(veld(een, "DTSTART;TZID=Europe/Amsterdam"), veld(twee, "DTSTART;TZID=Europe/Amsterdam"), "nieuwe tijd in het bestand");
  assert.equal(veld(een, "UID"), veld(twee, "UID"), "zelfde UID, dus de agenda werkt de afspraak bij in plaats van er een bij te zetten");
  assert.equal(veld(een, "UID"), "fysiplan-afspraak-" + id + "@fysiplan.nl", "UID zonder tijdstip");
  const s1 = Number(veld(een, "SEQUENCE")), s2 = Number(veld(twee, "SEQUENCE"));
  assert.ok(Number.isInteger(s1) && s1 >= 0 && s1 < 2 ** 31, "SEQUENCE is een geldig getal: " + s1);
  assert.ok(s2 > s1, "SEQUENCE loopt op na de wijziging: " + s1 + " → " + s2);
  assert.match(twee, /^METHOD:PUBLISH\r$/m, "METHOD:PUBLISH");
  assert.match(een, /^RRULE:FREQ=WEEKLY;COUNT=4\r$/m, "eerst een reeks");
  assert.doesNotMatch(twee, /^RRULE:FREQ=WEEKLY/m, "na het verplaatsen eenmalig");
  // Sweep 2026-11-18 10u (Jayden): de kaartlink in de agenda miste ?taal=en; een agenda-app opent hem vaak in een
  // andere browser, en dan stond de kaart in het Nederlands.
  const plat = (t) => t.replace(/\r\n[ \t]/g, "");
  assert.ok(plat(twee).includes("/k/" + id + "?taal=en"), "afspraak.ics: kaartlink in het Engels");
  const nl = plat(await (await fetch(origin + "/api/kaart/afspraak.ics?id=" + id, { headers: kop() })).text());
  assert.ok(nl.includes("/k/" + id) && !nl.includes("?taal="), "afspraak.ics zonder taal: gewone link");
  const raar = plat(await (await fetch(origin + "/api/kaart/afspraak.ics?id=" + id + "&taal=__proto__", { headers: kop() })).text());
  assert.ok(!raar.includes("?taal="), "onbekende taal komt niet in de link");
  const ag = await fetch(origin + "/api/kaart/agenda?id=" + id + "&dagen=MO,TH&tijd=09:00&taal=en", { headers: kop() });
  assert.equal(ag.status, 200);
  assert.ok(plat(await ag.text()).includes("/k/" + id + "?taal=en"), "herinneringen.ics: kaartlink in het Engels");
  // Sweep 2026-11-23 (Jayden): een reeks van 4 waarvan de eerste voorbij is, begon in de agenda op die voorbije
  // datum met COUNT=4, terwijl de kaart de volgende en "nog 2" toonde. Nu: DTSTART = de volgende, COUNT=3.
  const eerste = Date.now() - 6 * 86400000;
  const zet = await post("/api/kaart/afspraak", { praktijk: P, id, t: eerste, herhaal: 4 }, S);
  if (zet.status === 200) {
    const drie = await ics();
    const dag = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }).replace(/-/g, "");
    assert.equal(String(veld(drie, "DTSTART;TZID=Europe/Amsterdam")).slice(0, 8), dag(eerste + 7 * 86400000), "agenda begint bij de volgende afspraak");
    assert.match(drie, /^RRULE:FREQ=WEEKLY;COUNT=3\r$/m, "nog drie afspraken in de agenda");
  } else console.log("  (voorbije afspraak niet te zetten: " + zet.status + ")");
  const appHtml = await (await import("node:fs/promises")).readFile(join(root, "public/index.html"), "utf8");
  assert.match(appHtml, /\(daarna nog "\+\(va\.rest-1\)\+" keer\)/, "app telt zoals de kaart: daarna nog N");
  assert.doesNotMatch(appHtml, /" ×"\+va\.rest/, "geen ×4-telling meer in het overzicht");
  console.log("test-sweep-afspraak-uid: vaste UID, oplopend SEQUENCE, agenda werkt bij, link in de taal van de kaart");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
