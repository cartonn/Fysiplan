// Regressietest gebruikers-sweep 2026-11-22 06u (Jayden, Pixel 7): offline zei de Engelse kaart "Not sent yet: 1 saved
// on your phone. They will be sent…" (geen zelfstandig naamwoord, "They" bij één) en "{n} tap(s) … no longer count".
// Nu een zin die bij elk aantal klopt. Zonder browser, past in CI. `npm run test:engelswachtrij`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const en = (html.match(/var TWACHT=\{[\s\S]*?\ben:\{([\s\S]*?)\},de:\{/) || [])[1];
assert.ok(en, "Engelse wachtrijteksten gevonden");
assert.doesNotMatch(en, /\{n\} saved on your phone/, "geen '{n} saved' zonder zelfstandig naamwoord");
assert.doesNotMatch(en, /\(s\)/, "geen '(s)'");
for (const k of ["n", "drukN", "oud"]) {
  const t = (en.match(new RegExp("\\b" + k + ":'([^']*)'")) || [])[1];
  assert.ok(t && t.includes("{n}"), k + " noemt het aantal");
  assert.doesNotMatch(t.replace("{n}", "1"), /\bThey\b/, k + " klopt ook bij één");
}
console.log("test-sweep-engels-wachtrij: ok");
