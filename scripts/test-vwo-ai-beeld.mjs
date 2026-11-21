// Legal 2026-11-21 09u, verwerkersovereenkomst (b) tegen de code (d), art. 28 lid 3 AVG.
// Art. 5 van de verwerkersovereenkomst zei dat naar de AI-dienst alleen namen van oefeningen gaan.
// Maar de vraaghulp op /k (/api/kaart/vraag) stuurt, als hij aan staat, ook de vrije vraag van de
// patiënt mee, en de zoekhulp de zoekwoorden van de therapeut. En sinds #407 haalt de server plek en
// toestel uit foto's van eigen oefeningen en uit het logo; art. 5 noemde dat alleen voor video's.
// Deze test leest de code en de getoonde tekst naast elkaar. Faalt zonder de fix. Zonder browser.
// `node scripts/test-vwo-ai-beeld.mjs`, onderdeel van `npm run test:privacy`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wacht } from "node:timers/promises";

const bron = await readFile(new URL("../server.js", import.meta.url), "utf8");
const tekst = (html) => html.replace(/<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&euml;/g, "ë").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");

// wat de code doet
const vraagRoute = (bron.match(/urlPath === "\/api\/kaart\/vraag"[\s\S]*?\n  }\n/) || [""])[0];
assert.ok(vraagRoute, "route /api/kaart/vraag gevonden");
const vraagNaarAi = /vraagClaude\([^)]*"<vraag>" \+ vraag/.test(vraagRoute);
const klachtNiet = /vraagOverKlacht\(vraag\)/.test(vraagRoute) && /vraagOverDosering\(vraag\)/.test(vraagRoute);
const fotoSchoon = /zonderBeeldMetadata\(/.test(bron);
assert.ok(vraagNaarAi, "de vraaghulp stuurt de vraag van de patiënt naar de AI-dienst (anders deze test bijwerken)");

const dir = await mkdtemp(join(tmpdir(), "vwo-ai-beeld-"));
const vrij = createServer(); await new Promise((r) => vrij.listen(0, "127.0.0.1", r));
const port = vrij.address().port; await new Promise((r) => vrij.close(r));
const url = "http://127.0.0.1:" + port;
const app = spawn(process.execPath, ["server.js"], {
  env: { PATH: process.env.PATH, HOME: dir, DATA_DIR: dir, PORT: String(port), HOST: "127.0.0.1" },
  stdio: "ignore",
});
const exit = new Promise((r) => app.once("exit", r));
try {
  for (let i = 0; i < 150; i++) { if (await fetch(url + "/health").then((r) => r.ok, () => false)) break; await wacht(100); }
  const vwo = tekst(await (await fetch(url + "/verwerkersovereenkomst")).text());
  const art5 = (vwo.match(/5\. Beveiliging[\s\S]*?6\. Subverwerkers/) || [""])[0];
  assert.ok(art5, "art. 5 gevonden");
  assert.match(art5, /zoekwoorden van de therapeut/, "art. 5 noemt de zoekwoorden van de zoekhulp");
  if (vraagNaarAi) assert.match(art5, /vraaghulp op de patiëntkaart aan, dan gaat ook de korte vraag mee/,
    "art. 5 noemt dat de vraag van de patiënt naar de AI-dienst gaat");
  if (klachtNiet) assert.match(art5, /over pijn, klachten, medicijnen of hoe vaak en hoeveel gaat niet naar de AI-dienst/,
    "art. 5 noemt dat een vraag over klachten of dosering er niet naartoe gaat");
  assert.match(art5, /Fysiplan bewaart die vraag niet/, "art. 5: de vraag wordt niet bewaard");
  if (fotoSchoon) assert.match(art5, /Uit een foto bij een eigen oefening en uit het logo van de praktijk haalt Fysiplan ook de plek/,
    "art. 5 noemt het weghalen van plek en toestel uit foto's en logo (#407)");
  // de code bewaart de vraag inderdaad niet: alleen een teller
  assert.ok(!/kaartvraag[^\n]*vraag\)/.test(vraagRoute) && !/saveJson\([^)]*vraag/.test(vraagRoute), "vraag wordt niet opgeslagen");
  console.log("OK: art. 5 van de verwerkersovereenkomst noemt de vraaghulp, de zoekwoorden en het schoonmaken van foto's en logo.");
} finally {
  app.kill(); await exit; await rm(dir, { recursive: true, force: true });
}
