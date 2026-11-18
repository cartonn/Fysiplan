// Eén testprogramma dat alle tests naast elkaar draait (reviewlijst punt 15). `npm run test:alles`
//
// De lijst komt uit .github/workflows/ci.yml: elke stap "- run: ..." behalve `npm ci`. Zo is er één
// lijst voor CI en voor lokaal, en kan een nieuwe test niet in de ene wel en in de andere niet staan.
// Stappen die geen test zijn (de build) draaien eerst, één voor één; daarna de tests met N tegelijk.
// Elke test start zijn eigen server op een vrije poort met een eigen datamap, dus ze zitten elkaar
// niet in de weg.
//
// Opties:
//   --n=4            hoeveel tegelijk (standaard: het aantal processorkernen, minstens 2, hoogstens 8)
//   --alleen=tekst   alleen stappen waarin deze tekst (of reguliere expressie) voorkomt
//   --lijst          alleen laten zien wat er zou draaien
// Een mislukte test wordt niet opnieuw geprobeerd: een test die soms faalt, moet gerepareerd worden.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const arg = (naam) => { const a = process.argv.find((x) => x.startsWith("--" + naam + "=")); return a ? a.slice(naam.length + 3) : null; };
const n = Math.max(1, Math.min(16, Number(arg("n")) || Math.max(2, Math.min(8, cpus().length))));
const alleen = arg("alleen");

export function stappenUit(yml) {
  return yml.split("\n").map((r) => r.match(/^\s+- run:\s*(.+?)\s*$/)).filter(Boolean).map((m) => m[1]).filter((s) => s !== "npm ci");
}
export const isTest = (s) => /^(npm run test[:\w-]*|node scripts\/test-[\w-]+\.mjs)(\s|$)/.test(s);

const yml = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
let stappen = stappenUit(yml);
if (alleen) { let re; try { re = new RegExp(alleen); } catch { re = null; } stappen = stappen.filter((s) => (re ? re.test(s) : s.includes(alleen))); }
const eerst = stappen.filter((s) => !isTest(s)), tests = stappen.filter(isTest);
if (process.argv.includes("--lijst")) { for (const s of eerst) console.log("eerst  " + s); for (const s of tests) console.log("test   " + s); process.exit(0); }

const draai = (stap) => new Promise((klaar) => {
  const t0 = Date.now();
  let uit = "";
  const p = spawn("bash", ["-c", stap], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", (c) => { uit += c; if (uit.length > 2e6) uit = uit.slice(-1e6); });
  p.stderr.on("data", (c) => { uit += c; if (uit.length > 2e6) uit = uit.slice(-1e6); });
  p.on("close", (code) => klaar({ stap, ok: code === 0, s: (Date.now() - t0) / 1000, uit }));
});
const regel = (r) => console.log((r.ok ? "ok    " : "FOUT  ") + r.s.toFixed(1).padStart(6) + " s  " + r.stap);

const T0 = Date.now();
const fouten = [];
for (const s of eerst) { const r = await draai(s); regel(r); if (!r.ok) { fouten.push(r); break; } }
if (!fouten.length) {
  console.log("-- " + tests.length + " tests, " + n + " tegelijk");
  let i = 0;
  const werker = async () => { while (i < tests.length) { const r = await draai(tests[i++]); regel(r); if (!r.ok) fouten.push(r); } };
  await Promise.all(Array.from({ length: Math.min(n, tests.length) }, werker));
}
for (const f of fouten) {
  console.log("\n==== " + f.stap + " (mislukt) ====");
  console.log(f.uit.split("\n").slice(-60).join("\n"));
}
console.log("\n" + (fouten.length ? fouten.length + " mislukt" : "alles ok") + " in " + ((Date.now() - T0) / 1000).toFixed(0) + " s (" + (eerst.length + tests.length) + " stappen)");
process.exit(fouten.length ? 1 : 0);
