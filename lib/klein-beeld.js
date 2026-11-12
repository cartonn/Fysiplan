// Kleine versies van de bibliotheekbeelden, voor de oefenlijst en de sjabloonkiezer van de app
// (platformreview 2026-11-11). De lijst toont een beeld in een vakje van 76 px, maar haalde
// daarvoor het hele bestand op: lijntekeningen van 1024 px en groter, tot 1,6 MB per stuk, en
// alle 818 tegelijk (166 MB bij het openen van de app).
//
// Bij het bouwen (`npm run build`, dus ook op Railway en in CI) maakt scripts/kleine-beelden.mjs
// van elk beeld in public/images een versie van hooguit 160 px (scherp op een scherm met dubbele
// dichtheid), 1 tot 4 kB per stuk, in dist/klein/. De server zelf verkleint niets: hij stuurt het
// kleine bestand als het er staat en anders het origineel, zoals voorheen. Het verkleinen in de
// server zelf is gemeten en afgevallen: de beeldbibliotheek hield daar ruim 200 MB werkgeheugen
// vast voor 2,5 MB aan plaatjes.
//
// Het origineel blijft wat het was: de A4, de pdf en de patiëntkaart gebruiken het volledige
// bestand (de patiëntkaart controleert daar ook de hash van).
import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const KLEIN_PX = 160;
export const KLEIN_BEELD = /\.(?:png|jpe?g|webp)$/i;
export const kleinMap = (root = process.cwd()) => join(root, "dist", "klein");
// images/rug/x.png → <root>/dist/klein/images/rug/x.png.webp
export const kleinPadVoor = (rel, root = process.cwd()) => join(kleinMap(root), rel + ".webp");

async function alleBeelden(map, voor = "images") {
  const uit = [];
  let namen = [];
  try { namen = await readdir(map, { withFileTypes: true }); } catch { return uit; }
  for (const n of namen) {
    if (n.isDirectory()) uit.push(...await alleBeelden(join(map, n.name), voor + "/" + n.name));
    else if (n.isFile() && KLEIN_BEELD.test(n.name)) uit.push(voor + "/" + n.name);
  }
  return uit;
}

// Maakt de kleine versies. `alleen` beperkt het tot een lijst paden ("images/…"); zonder die lijst
// alles onder public/images. Wat al bestaat en nieuwer is dan zijn bron, blijft staan.
// Eén beeld dat niet lukt houdt de rest niet tegen; de fouten komen terug in het resultaat.
export async function maakKleineBeelden({ root = process.cwd(), alleen = null, tegelijk = 3 } = {}) {
  const sharp = (await import("sharp")).default;
  const publicDir = join(root, "public");
  const lijst = alleen || await alleBeelden(join(publicDir, "images"));
  const uit = { totaal: lijst.length, gemaakt: 0, bijgewerkt: 0, fouten: [], bytes: 0 };
  let i = 0;
  const werker = async () => {
    while (i < lijst.length) {
      const rel = lijst[i++];
      const bron = join(publicDir, rel);
      const doel = kleinPadVoor(rel, root);
      try {
        const b = await stat(bron);
        const d = await stat(doel).catch(() => null);
        if (d && d.mtimeMs >= b.mtimeMs && d.size > 0) { uit.bijgewerkt++; uit.bytes += d.size; continue; }
        // rotate() zonder hoek volgt de stand uit de EXIF-gegevens, zoals de browser dat bij het
        // origineel ook doet; withoutEnlargement laat een beeld dat al klein is zo groot als het is
        const data = await sharp(bron, { sequentialRead: true }).rotate()
          .resize({ width: KLEIN_PX, height: KLEIN_PX, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 }).toBuffer();
        await mkdir(dirname(doel), { recursive: true });
        // eerst naast het doel schrijven en dan hernoemen: een afgebroken run laat geen half bestand achter
        const tmp = doel + ".tmp-" + process.pid;
        await writeFile(tmp, data);
        await rename(tmp, doel);
        uit.gemaakt++; uit.bytes += data.length;
      } catch (e) {
        uit.fouten.push(rel + ": " + ((e && e.message) || e));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, tegelijk) }, werker));
  return uit;
}
