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
import { dirname, join } from "node:path";
import { backupInstellingen, haalVanElders, ontsleutel, veiligBackupPad } from "../lib/backup-elders.js";

import { MANIFEST, leesManifest, herstelUpload } from "../lib/backup-snapshots.js";
const [bron, doel, optie] = process.argv.slice(2);
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

const manifest = leesManifest(kopie);
if(manifest && !manifest.complete && optie !== "--onvolledig") throw new Error("Onvolledige reservekopie. Gebruik alleen bewust --onvolledig voor herstel van beschikbare bestanden.");
const inst = manifest ? backupInstellingen() : null;
if(manifest && !inst) throw new Error("Voor deze dagkopie zijn de S3-instellingen nodig: uploads staan in afzonderlijke versleutelde objecten.");
for (const naam of Object.keys(kopie.bestanden)) {
  if (!veiligBackupPad(naam)) throw new Error("Onveilig pad in reservekopie");
}
await mkdir(doel, { recursive: true, mode: 0o700 });
if ((await readdir(doel)).length) { console.error("De doelmap is niet leeg; kies een lege map."); process.exit(1); }
for (const [naam, inhoud] of Object.entries(kopie.bestanden)) {
  if(naam === MANIFEST) continue;
  if(manifest && naam.startsWith("uploads/")) throw new Error("dubbel uploadpad");
  await mkdir(dirname(join(doel, naam)), { recursive: true, mode: 0o700 });
  await writeFile(join(doel, naam), inhoud, { flag: 'wx', mode: 0o600 });
}
if(manifest) for(const [naam, ref] of Object.entries(manifest.uploads)) {
  const inhoud = await herstelUpload(inst, ref);
  await mkdir(dirname(join(doel, naam)), {recursive:true,mode:0o700});
  await writeFile(join(doel,naam),inhoud,{flag:"wx",mode:0o600});
}
console.log("Reservekopie van " + kopie.gemaakt + ": " + (Object.keys(kopie.bestanden).length - (manifest?1:0) + Object.keys(manifest?.uploads || {}).length) + " bestanden in " + doel);
