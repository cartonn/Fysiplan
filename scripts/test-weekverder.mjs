// "+1 week" bij een afspraak in de therapeut-app en het doorrollen van een reeks moeten een week
// later op dezelfde kloktijd uitkomen, ook over de zomertijdwissel. Eerst was het 7×24 uur:
// di 24-03-2027 14:00 + 1 week werd 31-03-2027 15:00 (gebruikers-sweep 2026-11-11 14u).
// Draait zonder browser: haalt weekVerder uit public/index.html en rekent hem in Amsterdam-tijd door.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
assert.ok(!/7\*864e5/.test(html), "geen 7×24 uur meer in de therapeut-app (gebruik weekVerder)");
const m = html.match(/function weekVerder\(t\)\{[^\n]*\}/);
assert.ok(m, "weekVerder staat in index.html");
assert.match(html, /var dW=new Date\(weekVerder\(basisW\)\)/, "\"+1 week\" gebruikt weekVerder");
assert.match(html, /while\(t<grens&&rest>1\)\{t=weekVerder\(t\);rest--;\}/, "volgendeAfspraak rolt door met weekVerder");

const code = `${m[0]}
const p = (n) => String(n).padStart(2, "0");
const toon = (t) => { const d = new Date(t); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
console.log(JSON.stringify([
  toon(weekVerder(new Date(2027, 2, 24, 14, 0).getTime())),
  toon(weekVerder(new Date(2026, 9, 21, 9, 30).getTime())),
  toon(weekVerder(new Date(2026, 11, 29, 16, 15).getTime())),
]));`;
const uit = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, TZ: "Europe/Amsterdam" } }).toString());
assert.deepEqual(uit, ["2027-03-31 14:00", "2026-10-28 09:30", "2027-01-05 16:15"], "zelfde kloktijd over zomertijd, wintertijd en jaarwissel");
console.log("test-weekverder: ok");
