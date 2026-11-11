// Zet een versleutelde reservekopie (lib/backup-elders.js) terug in een map.
//
//   BACKUP_SLEUTEL=… node scripts/backup-terugzetten.mjs <bestand.fpb> <doelmap>
//   BACKUP_SLEUTEL=… BACKUP_S3_URL=… BACKUP_S3_SLEUTEL_ID=… BACKUP_S3_GEHEIM=… \
//     node scripts/backup-terugzetten.mjs s3:fysiplan-ma.fpb <doelmap>
//
// Het script schrijft alleen in de doelmap en overschrijft daar niets: de doelmap moet
// leeg zijn of nog niet bestaan. Kopieer de bestanden daarna zelf naar het volume (/data)
// terwijl de server stilstaat.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { backupInstellingen, haalVanElders, ontsleutel } from "../lib/backup-elders.js";

const [bron, doel] = process.argv.slice(2);
const wachtzin = String(process.env.BACKUP_SLEUTEL || "");
if (!bron || !doel || !wachtzin) {
  console.error("Gebruik: BACKUP_SLEUTEL=… node scripts/backup-terugzetten.mjs <bestand.fpb | s3:fysiplan-ma.fpb> <doelmap>");
  process.exit(2);
}
let buf;
if (bron.startsWith("s3:")) {
  const inst = backupInstellingen();
  if (!inst) { console.error("Voor s3: zijn BACKUP_S3_URL, BACKUP_S3_SLEUTEL_ID, BACKUP_S3_GEHEIM en BACKUP_SLEUTEL nodig."); process.exit(2); }
  buf = await haalVanElders(inst, bron.slice(3));
} else buf = await readFile(bron);

let kopie;
try { kopie = ontsleutel(buf, wachtzin); }
catch { console.error("Ontsleutelen mislukt: verkeerde BACKUP_SLEUTEL of beschadigd bestand."); process.exit(1); }

await mkdir(doel, { recursive: true });
if ((await readdir(doel)).length) { console.error("De doelmap is niet leeg; kies een lege map."); process.exit(1); }
for (const [naam, inhoud] of Object.entries(kopie.bestanden)) await writeFile(join(doel, basename(naam)), inhoud);
console.log("Reservekopie van " + kopie.gemaakt + ": " + Object.keys(kopie.bestanden).length + " bestanden in " + doel);
