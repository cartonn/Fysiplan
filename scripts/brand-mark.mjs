// Het ingebakken Fysiplan-merk in een oefenbeeld vinden, zodat de kaart het met een wit
// vlak kan afdekken en overal hetzelfde eigen merk kan tonen.
//
// Het merk staat in 215 van de 319 beelden linksboven: een blauw icoon op 20..61 x 22..63
// en het woord "Fysiplan" ernaast, in een wit vak dat bij het inbakken over het beeld is
// gelegd (bij drie beelden is daardoor een hoekje uit de haren gesneden). We dekken alleen
// af als we kunnen bewijzen dat het vlak er niets anders onder heeft dan het merk:
//   1. het beeld is 800x1200, zoals alle beelden met merk;
//   2. het icoon is er echt: minstens 500 blauwe pixels in het icoonvak;
//   3. de rand van 14 px rond het afdekvlak, binnen het witte vak van 200x84, is volledig
//      wit. Raakt er ook maar één pixel van een figuur, haar of apparaat die rand, dan geen
//      afdekking en blijft het beeld zoals het is.
// Het afdekvlak is in bronpixels, dus onafhankelijk van hoe groot de kaart het toont.
import sharp from 'sharp';

export const MERK_VAK = { x: 0, y: 0, w: 200, h: 84 };
export const MERK_AFDEKKING = { x: 14, y: 14, w: 178, h: 58 };
const ICOON = { x0: 20, y0: 22, x1: 61, y1: 63 };

export async function measureBrandMark(bytes) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w !== 800 || h !== 1200) return { present: false, reason: 'afwijkend formaat ' + w + 'x' + h };
  const px = (x, y) => { const i = (y * w + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  let blauw = 0;
  for (let y = ICOON.y0; y <= ICOON.y1; y++) for (let x = ICOON.x0; x <= ICOON.x1; x++) {
    const [r, , b] = px(x, y); if (b > 150 && b - r > 80) blauw++;
  }
  if (blauw < 500) return { present: false, reason: 'geen merkicoon linksboven', bluePixels: blauw };
  const a = MERK_AFDEKKING;
  let rand = 0;
  for (let y = MERK_VAK.y; y < MERK_VAK.y + MERK_VAK.h; y++) for (let x = MERK_VAK.x; x < MERK_VAK.x + MERK_VAK.w; x++) {
    if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) continue;
    const [r, g, b] = px(x, y); if (r < 235 || g < 235 || b < 235) rand++;
  }
  if (rand) return { present: true, coverable: false, reason: 'iets anders dan het merk raakt de rand van het afdekvlak', bluePixels: blauw, inkInRing: rand };
  return { present: true, coverable: true, bluePixels: blauw, inkInRing: 0, patch: { ...a } };
}
