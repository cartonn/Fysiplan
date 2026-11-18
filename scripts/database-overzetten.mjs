// De bestanden van een datamap in de database zetten en daarna vergelijken (reviewlijst punt 11).
// Bedoeld om de overstap eerst te oefenen op een kopie van productie:
//   DATABASE_URL=postgres://… node scripts/database-overzetten.mjs /pad/naar/kopie-van-de-datamap
// De server doet hetzelfde bij het starten als DATABASE_MEESCHRIJVEN=aan staat. Dit script leest
// de datamap alleen; het schrijft er niets in.
import { maakMeeschrijver } from "../lib/database.js";
import { maakPgDb } from "../lib/database-pg.js";

const map = process.argv[2];
if (!map || !process.env.DATABASE_URL) {
  console.error("gebruik: DATABASE_URL=postgres://… node scripts/database-overzetten.mjs <datamap>");
  process.exit(2);
}
const db = maakPgDb(process.env.DATABASE_URL);
try {
  const m = maakMeeschrijver({ db, dataDir: map });
  await m.start();
  if (!(await m.bij(10 * 60000))) throw new Error("niet klaar binnen tien minuten");
  const s = m.stand();
  const u = await m.vergelijk();
  console.log("overgezet: " + s.geschreven + " bestanden, " + s.fouten + " fouten");
  console.log(u.gelijk ? "vergelijking: gelijk (" + u.bestanden + " bestanden)" : "vergelijking: " + u.verschillen.length + " verschillen\n" + u.verschillen.map((v) => "  - " + [v.wat, v.naam, v.tekst].filter(Boolean).join(": ")).join("\n"));
  process.exitCode = u.gelijk && !s.fouten ? 0 : 1;
} finally {
  await db.sluit();
}
