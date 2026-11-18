// /privacy, /verwerkersovereenkomst en /voorwaarden groeien mee met de lettergrootte van de lezer.
// Eerder stonden alle letters in px: bij 200 % tekst (een grotere standaardletter in de browser)
// bleef de pagina even klein, "Naar de site" was 69×12 px en de inhoudslinks 17 px hoog.
// Nu staan de letters in rem en zijn de koppelingen in kop, inhoud en voet minstens 44 px hoog.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:juridisch200`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const jur = await readFile(join(root, "public/juridisch.html"), "utf8");
const kop = jur.slice(0, jur.indexOf("</head>"));
const pxLetters = kop.match(/font:(?:[0-9]+ )?[0-9.]+px|font-size:[0-9.]+px|clamp\([0-9.]+px/g) || [];
assert.deepEqual(pxLetters, [], "letters in /privacy staan in rem, niet in px: " + pxLetters.join(", "));
assert.match(kop, /nav \.naam,nav \.terug\{[^}]*min-height:44px/, "kopkoppelingen minstens 44 px hoog");
assert.match(kop, /\.inhoud a,footer a\{[^}]*min-height:44px/, "inhouds- en voetkoppelingen minstens 44 px hoog");
console.log("test-juridisch-200: bron OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-juridisch-200: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-jur200-"));
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
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"] });
    const page = await ctx.newPage();
    for (const pad of ["/privacy", "/verwerkersovereenkomst", "/voorwaarden"]) {
      await page.goto(origin + pad);
      const meet = () => page.evaluate(() => {
        const px = (el) => el ? parseFloat(getComputedStyle(el).fontSize) : 0;
        const hoog = [...document.querySelectorAll("nav a, .inhoud a, footer a")]
          .map((a) => ({ t: a.textContent.trim(), h: Math.round(a.getBoundingClientRect().height) }));
        return { p: px(document.querySelector("main p")), h1: px(document.querySelector("h1")), terug: px(document.querySelector("nav .terug")),
          voet: px(document.querySelector("footer")), hoog, breed: document.documentElement.scrollWidth };
      });
      const gewoon = await meet();
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const groot = await meet();
      for (const k of ["p", "h1", "terug", "voet"]) {
        assert.ok(groot[k] >= gewoon[k] * 1.4, `${pad}: ${k} groeit mee bij 200 % (${gewoon[k]} → ${groot[k]} px)`);
      }
      for (const m of [gewoon, groot]) {
        const klein = m.hoog.filter((x) => x.h < 44);
        assert.deepEqual(klein, [], `${pad}: koppelingen lager dan 44 px`);
      }
      assert.ok(groot.breed <= 322, `${pad} bij 200 % is ${groot.breed} px breed op 320`);
    }
    await ctx.close();
    console.log("test-juridisch-200: browser OK");
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
