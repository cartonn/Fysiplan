// Regressietest gebruikers-sweep 2026-11-20 18u (MIDDEL, Mark, iPad liggend): een nieuw apparaat met de proefcookie
// dat inlogt bij een praktijk die al kaarten heeft, kreeg het proefwelkom en een vanzelf gedeelde "Voorbeeldpatiënt"
// (telde mee voor de grens van lopende kaarten; op een volgend apparaat een stille 409 met "Ja, die kaart bijwerken").
// En een collega met een eigen proef die inlogt bij de praktijk van Mark zag de einddatum van háár proef.
// Nu krijgt /v2/app in die gevallen de proefstand "elders" van de praktijk (alleen de proefbalk, geen welkom).
// Alleen server, geen browser: draait ook in CI. `npm run test:proefnieuwapparaat`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef-nieuw-apparaat-"));
const nu = Date.now();
const dag = 86400000;
const tokA = "a".repeat(48), tokB = "b".repeat(48);
const h = (t) => createHash("sha256").update(t).digest("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  p_ma: { id: "p_ma", email: "test-ma@voorbeeld.test", naam: "Testm Een", tel: "+31612345678", praktijk: "Testm Duin",
    gestart: nu - 4 * dag, verloopt: nu + 10 * dag, akkoord: nu - 4 * dag, tokens: [h(tokA)], kaarten: 0 },
  p_lo: { id: "p_lo", email: "test-lo@voorbeeld.test", naam: "Testl Twee", tel: "+31612345679", praktijk: "Testl Eigen",
    gestart: nu - 1 * dag, verloopt: nu + 13 * dag, akkoord: nu - 1 * dag, tokens: [h(tokB)], kaarten: 0 }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.73.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const proefStand = async (extra) => {
  const r = await fetch(origin + "/v2/app", { headers: { "x-forwarded-for": "10.73.1." + (ip++), ...extra } });
  assert.equal(r.status, 200, "/v2/app");
  const m = (await r.text()).match(/window\.FYSIPLAN_PROEF=(\{[^<]*?\})<\/script>/);
  return m ? JSON.parse(m[1]) : null;
};
const datumNl = (t) => new Date(t).toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const P = "Testm Duin";
  const c = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "proef-nieuw-apparaat-1", akkoord: true }, { cookie: "fpproef=" + tokA });
  assert.equal(c.status, 200, "beveiligen met proef: " + await c.clone().text());
  const sessie = (await c.json()).sessie;
  const S = { "x-praktijk-sessie": sessie };

  // eerste apparaat, nog geen kaarten: gewoon het proefwelkom (geen elders)
  const eerst = await proefStand({ cookie: "fpproef=" + tokA, ...S });
  assert.ok(eerst && !eerst.elders, "eerste apparaat zonder kaarten: welkom en voorbeeldkaart: " + JSON.stringify(eerst));
  assert.equal(eerst.naam, "Testm", "welkom met voornaam");

  // de praktijk deelt een kaart
  const k = await post("/api/kaarten", { praktijk: P, naam: "Jansen R.", client: { c_naam: "Jansen R." }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, { ...S, cookie: "fpproef=" + tokA });
  assert.equal(k.status, 200, "kaart gedeeld");

  // nieuw apparaat met dezelfde proefcookie en een sessie van de praktijk: geen welkom, geen voorbeeldkaart
  const tweede = await proefStand({ cookie: "fpproef=" + tokA, ...S });
  assert.ok(tweede, "proefbalk blijft");
  assert.equal(tweede.elders, true, "praktijk heeft al kaarten: alleen de proefbalk: " + JSON.stringify(tweede));
  assert.equal(tweede.naam, "", "geen welkom");

  // collega met een eigen proef (andere praktijk) logt in bij deze praktijk: einddatum van de praktijk
  const lotte = await proefStand({ cookie: "fpproef=" + tokB, ...S });
  assert.equal(lotte && lotte.elders, true, "eigen proef van een collega: proefstand van de praktijk: " + JSON.stringify(lotte));
  assert.ok(String(lotte.tot).endsWith(datumNl(nu + 10 * dag)), "einddatum van de praktijk, niet van haar eigen proef");

  // alleen de proefcookie, niet ingelogd: ongewijzigd (eigen proef)
  const los = await proefStand({ cookie: "fpproef=" + tokB });
  assert.ok(los && !los.elders && los.naam === "Testl", "zonder sessie: eigen proef: " + JSON.stringify(los));

  console.log("test-sweep-proef-nieuw-apparaat: geen voorbeeldkaart op een nieuw apparaat van een praktijk met kaarten");
} catch (e) {
  console.error(uit);
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
