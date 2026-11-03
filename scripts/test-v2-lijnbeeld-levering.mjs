// Mutatietest voor scripts/v2-lijnbeeld-levering.mjs (ook gebruikt door test-ahmed-notities).
//
// Start de echte server, haalt /oefeningen.json en /v2/oefeningen.json op en controleert:
//   - de echte levering klopt: pijlversie van exact het V1-lijnbeeld, behalve exact de twee
//     hash-gebonden uitzonderingen;
//   - de oude vergelijking (geleverd img = V1-img) is op deze levering echt onhoudbaar, zodat
//     duidelijk blijft waarom die is vervangen;
//   - ELKE mogelijke derde afwijking faalt (iedere niet-uitgezonderde oefening om de beurt
//     een ander beeld), net als een willekeurige paarwissel zoals bij het stoelpaar;
//   - ook: ruw lijnbeeld i.p.v. pijlbeeld, terugwisselen van de uitzondering, een uitzondering
//     weghalen of toevoegen, een pijlbeeld onder het lijnbeeld van een andere oefening, en een
//     gewijzigde hash.
// Alle mutaties zijn kopieën in het geheugen; geen bestand in de repo wordt aangeraakt.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertV2Override } from "../lib/v2-overrides.js";
import { controleerGeleverdeLijnbeelden, laadGecontroleerdeUitzonderingen, VASTGELEGDE_UITZONDERINGEN } from "./v2-lijnbeeld-levering.mjs";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-lijnbeeld-"));
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const app = spawn(process.execPath, ["server.js"], { env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir }, stdio: ["ignore", "ignore", "pipe"] });
let stderr = ""; app.stderr.on("data", (d) => { stderr += d; });
let manifest, v1Manifest;
try {
  for (let i = 0; i < 100 && !manifest; i++) {
    try {
      v1Manifest = await (await fetch(`http://127.0.0.1:${port}/oefeningen.json`)).json();
      manifest = await (await fetch(`http://127.0.0.1:${port}/v2/oefeningen.json`)).json();
    } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
} finally {
  app.kill("SIGTERM");
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
assert.ok(manifest && v1Manifest, "server start niet: " + stderr.slice(0, 500));

const { overrides, arrows } = await laadGecontroleerdeUitzonderingen(root);
const uitzonderingen = [...VASTGELEGDE_UITZONDERINGEN].sort();
const controleer = (m = manifest, extra = {}) => controleerGeleverdeLijnbeelden({ manifest: m, v1Manifest, arrows, overrides, ...extra });
const kopie = () => manifest.map((e) => ({ ...e }));
const faalt = (omschrijving, fn, patroon = /V2-lijnbeelden wijken af/) => assert.throws(fn, patroon, `${omschrijving} had moeten falen`);

// ---- echte levering ----
assert.equal(manifest.length, v1Manifest.length);
assert.deepEqual(controleer(), uitzonderingen);
const v1Img = new Map(v1Manifest.map((e) => [e.naam, e.img]));
const oudeVergelijking = manifest.filter((e) => e.img.replace(/^\/v2\//, "") !== v1Img.get(e.naam));
const metPijl = manifest.filter((e) => e.img.startsWith("/v2/images/beginhouding-pijl-v1/"));
assert.ok(metPijl.length > 0, "de levering gebruikt pijlbeelden");
assert.ok(oudeVergelijking.length > uitzonderingen.length, "de oude vergelijking faalt op de pijlbeelden, niet alleen op de uitzonderingen");

// ---- elke mogelijke derde afwijking ----
const gewoon = manifest.map((e, i) => i).filter((i) => !overrides.has(manifest[i].exerciseId));
let derdeAfwijkingen = 0;
for (const i of gewoon) {
  const m = kopie();
  const ander = manifest[(i + 1) % manifest.length].img === m[i].img ? manifest[(i + 2) % manifest.length] : manifest[(i + 1) % manifest.length];
  m[i].img = ander.img;
  faalt(`derde afwijking ${m[i].naam}`, () => controleer(m));
  derdeAfwijkingen++;
}
assert.equal(derdeAfwijkingen, manifest.length - uitzonderingen.length);

// willekeurige paarwissel van twee gewone oefeningen, zoals bij het stoelpaar
const a = gewoon[Math.floor(Math.random() * gewoon.length)];
let b = gewoon[Math.floor(Math.random() * gewoon.length)];
if (b === a) b = gewoon[(gewoon.indexOf(a) + 1) % gewoon.length];
{
  const m = kopie();
  [m[a].img, m[b].img] = [m[b].img, m[a].img];
  faalt(`paarwissel ${m[a].naam} / ${m[b].naam}`, () => controleer(m));
}

// ruw lijnbeeld in plaats van het pijlbeeld (pijllevering stil kapot)
{
  const i = manifest.findIndex((e) => !overrides.has(e.exerciseId) && e.img.includes("/beginhouding-pijl-v1/"));
  const m = kopie();
  m[i].img = "/v2/" + v1Img.get(m[i].naam);
  faalt("ruw lijnbeeld zonder pijl", () => controleer(m));
}

// een uitzondering teruggewisseld naar het V1-lijnbeeld
{
  const [id] = uitzonderingen;
  const i = manifest.findIndex((e) => e.exerciseId === id);
  const pijlV1 = arrows.entries.find((p) => p.source === v1Img.get(manifest[i].naam));
  const m = kopie();
  m[i].img = "/v2/" + (pijlV1 ? pijlV1.img : v1Img.get(m[i].naam));
  faalt("uitzondering teruggewisseld", () => controleer(m), /verwacht .*\(uitzondering /);
}

// een uitzondering weggehaald: de gewisselde oefening is dan onverklaard
for (const id of uitzonderingen) {
  const minder = new Map(overrides); minder.delete(id);
  faalt(`uitzondering ${id} weggehaald`, () => controleer(manifest, { overrides: minder }), /levert .*verwacht .*V1-lijnbeeld/);
}

// een derde uitzondering toegevoegd (ook als die het geleverde beeld exact zou dekken)
{
  const i = gewoon[0];
  const e = manifest[i];
  const meer = new Map(overrides);
  meer.set(e.exerciseId, { ...overrides.get(uitzonderingen[0]), exerciseId: e.exerciseId, name: e.naam, lineImg: v1Img.get(e.naam), v1LineImg: v1Img.get(e.naam) });
  faalt("derde vastgelegde uitzondering", () => controleer(manifest, { overrides: meer }), /verwacht exact/);
}

// pijlbeeld van een andere oefening onder dit lijnbeeld: zelfde img, verkeerde tekening
{
  const i = manifest.findIndex((e) => !overrides.has(e.exerciseId) && e.img.includes("/beginhouding-pijl-v1/"));
  const lijn = v1Img.get(manifest[i].naam);
  const andere = arrows.entries.find((p) => p.source !== lijn && p.naam !== manifest[i].naam);
  const verschoven = { ...arrows, entries: arrows.entries.map((p) => p.source === lijn ? { ...andere, source: lijn } : p.source === andere.source ? { ...p, source: "images/weg.png" } : p) };
  const m = kopie();
  m[i].img = "/v2/" + andere.img;
  faalt("pijlbeeld van een andere oefening", () => controleer(m, { arrows: verschoven }), /is getekend voor/);
}

// hash-gebonden: een uitzondering met een andere hash wordt niet geaccepteerd
{
  const echtV2 = readFileSync(join(root, "public/oefeningen-v2.json"), "utf8");
  const echtV1 = readFileSync(join(root, "public/oefeningen.json"), "utf8");
  const o = overrides.get(uitzonderingen[0]);
  for (const veld of ["assetSha256", "lineSha256", "v1LineSha256"]) {
    await assert.rejects(assertV2Override(root, { ...o, [veld]: "0".repeat(64) }, JSON.parse(echtV2), JSON.parse(echtV1), arrows), /is gewijzigd/, veld);
  }
  await assert.rejects(assertV2Override(root, { ...o, arrow: { ...o.arrow, sha256: "0".repeat(64) } }, JSON.parse(echtV2), JSON.parse(echtV1), arrows), /pijlbeeld .* is gewijzigd/);
}

console.log(JSON.stringify({
  passed: true, geleverd: manifest.length, metPijlbeeld: metPijl.length, oudeVergelijkingAfwijkingen: oudeVergelijking.length,
  uitzonderingen, derdeAfwijkingenGetest: derdeAfwijkingen, paarwissel: [manifest[a].naam, manifest[b].naam]
}));
