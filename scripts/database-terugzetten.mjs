// De hersteltest (reviewlijst punt 11): alle bestanden uit de database terug naar een LEGE map, en
// desgewenst vergelijken met de datamap waar ze vandaan kwamen.
//   DATABASE_URL=postgres://… node scripts/database-terugzetten.mjs <lege map> [--vergelijk <datamap>]
// Schrijft nooit in een map waar al iets in staat: zo kan dit een draaiende datamap niet overschrijven.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { zetTerug, gespiegeld, vinger } from "../lib/database.js";
import { maakPgDb } from "../lib/database-pg.js";

const [naar, vlag, bron] = process.argv.slice(2);
if (!naar || !process.env.DATABASE_URL || (vlag && (vlag !== "--vergelijk" || !bron))) {
  console.error("gebruik: DATABASE_URL=postgres://… node scripts/database-terugzetten.mjs <lege map> [--vergelijk <datamap>]");
  process.exit(2);
}
await mkdir(naar, { recursive: true });
if ((await readdir(naar)).length) { console.error("de map " + naar + " is niet leeg; kies een lege map"); process.exit(2); }
const db = maakPgDb(process.env.DATABASE_URL);
try {
  const n = await zetTerug(db, naar, (pad, tekst) => writeFile(pad, tekst));
  console.log("teruggezet: " + n + " bestanden naar " + naar);
  if (bron) {
    const namen = new Set([...(await readdir(bron)).filter(gespiegeld), ...(await readdir(naar)).filter(gespiegeld)]);
    const mis = [];
    for (const naam of [...namen].sort()) {
      let a = null, b = null;
      try { a = JSON.parse(await readFile(join(bron, naam), "utf8")); } catch {}
      try { b = JSON.parse(await readFile(join(naar, naam), "utf8")); } catch {}
      if (a === null || b === null || vinger(a) !== vinger(b)) mis.push(naam + (a === null ? " (niet in de datamap)" : b === null ? " (niet teruggezet)" : " (inhoud verschilt)"));
    }
    console.log(mis.length ? "verschillen:\n  - " + mis.join("\n  - ") : "gelijk aan " + bron + " (" + namen.size + " bestanden)");
    process.exitCode = mis.length ? 1 : 0;
  }
} finally {
  await db.sluit();
}
