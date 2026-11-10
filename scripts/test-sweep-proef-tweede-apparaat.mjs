// Gebruikers-sweep 2026-11-10 (Mark, iPad): een collega logt op een tweede apparaat (zonder
// proefcookie) in bij een praktijk waarvan de proef voorbij is. De app zei bij het laden niets;
// pas de eerste geweigerde opslag liet iets zien, en "In de praktijk" gaf dan alleen een kale
// melding "Kijk op fysiplan.nl/v2/proef" zonder proefbalk.
// Nu: /api/praktijk/status zegt proefVerlopen (cookie of ingelogde praktijk), de app toont de
// proefbalk meteen bij het laden, en "In de praktijk" toont de balk in plaats van een alert.
// Server en code altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:proeftweedeapparaat`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
// code: de status-ophaling en "In de praktijk" kennen de verlopen proef
assert.match(appHtml, /if\(d\.proefVerlopen&&!PROEF_VOORBIJ\)toonProefVoorbij\(null,true\);/, "status bij laden toont de proefbalk");
assert.match(appHtml, /if\(d\.proefVerlopen\)\{toonProefVoorbij\(skn\);return;\}/, "'In de praktijk' toont de proefbalk, geen alert");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef2e-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const hash = (ww) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(ww, s, 32).toString("hex"); };
const dag = 86400000;
const verlopenToken = randomBytes(24).toString("hex");
const actiefToken = randomBytes(24).toString("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud0000000000002: { id: "oud0000000000002", email: "oud@praktijk.nl", naam: "Piet Oud", tel: "+31612340000",
    praktijk: "Fysio Oud", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(verlopenToken)] },
  nieuw00000000002: { id: "nieuw00000000002", email: "nieuw@praktijk.nl", naam: "Nina Nieuw", tel: "+31612340001",
    praktijk: "Fysio Nieuw", gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, akkoord: "x", tokens: [sha(actiefToken)] }
}));
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
  "fysio oud": { hash: hash("oud-wachtwoord-1"), gemaakt: Date.now() - 14 * dag, proef: { id: "oud0000000000002", verloopt: Date.now() - dag } },
  "fysio nieuw": { hash: hash("nieuw-wachtwoord-1"), gemaakt: Date.now() - dag, proef: { id: "nieuw00000000002", verloopt: Date.now() + 13 * dag } },
  "fysio vast": { hash: hash("vast-wachtwoord-1"), gemaakt: Date.now() - 400 * dag }
}));

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
let ip = 0;
const kop = (extra = {}) => ({ "x-forwarded-for": "10.71.0." + (++ip % 250), ...extra });
const login = async (praktijk, wachtwoord) => {
  const r = await fetch(origin + "/api/praktijk/login", { method: "POST", headers: kop({ "content-type": "application/json" }), body: JSON.stringify({ praktijk, wachtwoord }) });
  assert.equal(r.status, 200, "inloggen " + praktijk);
  return (await r.json()).sessie;
};
const status = async (praktijk, extra) => {
  const r = await fetch(origin + "/api/praktijk/status?praktijk=" + encodeURIComponent(praktijk), { headers: kop(extra) });
  assert.equal(r.status, 200);
  return r.json();
};

let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // server: ingelogd zonder proefcookie, praktijk met verlopen proef → proefVerlopen
  const sOud = await login("Fysio Oud", "oud-wachtwoord-1");
  assert.equal((await status("Fysio Oud", { "x-praktijk-sessie": sOud })).proefVerlopen, true, "tweede apparaat, ingelogd: proef voorbij");
  // apparaat met verlopen proefcookie, niet ingelogd → ook
  assert.equal((await status("Fysio Oud", { cookie: "fpproef=" + verlopenToken })).proefVerlopen, true, "proefapparaat: proef voorbij");
  // niet ingelogd en geen cookie: de naam alleen verraadt niets
  assert.equal((await status("Fysio Oud")).proefVerlopen, undefined, "zonder sessie of cookie geen proefstatus van een andere praktijk");
  // lopende proef en praktijk zonder proef: niets
  const sNieuw = await login("Fysio Nieuw", "nieuw-wachtwoord-1");
  assert.equal((await status("Fysio Nieuw", { "x-praktijk-sessie": sNieuw, cookie: "fpproef=" + actiefToken })).proefVerlopen, undefined, "lopende proef");
  const sVast = await login("Fysio Vast", "vast-wachtwoord-1");
  assert.equal((await status("Fysio Vast", { "x-praktijk-sessie": sVast })).proefVerlopen, undefined, "praktijk zonder proef");
  console.log("Proef op een tweede apparaat (server): status zegt proefVerlopen voor sessie en cookie, niet voor lopend, vast of onbekend.");

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-proef-tweede-apparaat: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    browser = await pw.chromium.launch();
    for (const [toestel, opties] of [["iPad", pw.devices["iPad (gen 7) landscape"] || { viewport: { width: 1080, height: 810 } }], ["desktop", { viewport: { width: 1280, height: 800 } }]]) {
      const ctx = await browser.newContext({ ...opties, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.71.1." + (toestel === "iPad" ? 1 : 2) } });
      const sessie = await login("Fysio Oud", "oud-wachtwoord-1");
      await ctx.addInitScript((s) => {
        localStorage.setItem("fp_praksessie", s);
        localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Oud" }));
        localStorage.setItem("fysiplan_welkom_gezien", "1");
        localStorage.setItem("fysiplan_release_gezien", "9999");
      }, sessie);
      const p = await ctx.newPage();
      const fouten = [], dialogen = [];
      p.on("pageerror", (e) => fouten.push(e.message));
      p.on("dialog", (d) => { dialogen.push(d.message()); d.dismiss().catch(() => {}); });
      await p.goto(origin + "/v2/app", { waitUntil: "networkidle" });
      // bij het laden, zonder iets op te slaan: de proefbalk staat er
      await p.waitForSelector("#proefBalk:not([hidden]) #pb_voorbij", { timeout: 10000 });
      assert.match(await p.textContent("#proefBalk"), /Je gratis proef is voorbij/, toestel + ": balk bij het laden");
      assert.equal(await p.locator('#proefBalk a[href="/v2/proef"]').count(), 1, toestel + ": knop Wil je doorgaan?");
      // "In de praktijk": geen kale alert, de reden staat in het venster
      await p.evaluate(() => { const k = document.getElementById("k_naam"); if (k) k.value = "Jan"; });
      await p.evaluate(() => document.getElementById("k_save_srv").click());
      await p.waitForTimeout(800);
      assert.deepEqual(dialogen.filter((d) => /proef|Kijk op/i.test(d)), [], toestel + ": geen alert over de proef");
      assert.match(await p.textContent("#proefBalk"), /Je gratis proef is voorbij/, toestel + ": balk blijft");
      assert.deepEqual(fouten, [], toestel + ": geen scriptfouten");
      await ctx.close();
    }
    console.log("Proef op een tweede apparaat (browser): proefbalk bij het laden en na 'In de praktijk', geen alert (iPad liggend, desktop).");
  }
} catch (err) {
  console.error(uit.slice(-3000));
  throw err;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
