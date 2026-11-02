// Kandidaat-uitsnedes voor de twee houdingen op een oefenafbeelding.
//
// Dit is nadrukkelijk GEEN goedkeuring. Het script meet alleen waar in de
// bronafbeelding losstaande figuren staan, waar het Fysiplan-merk staat, en of de
// twee gevonden figuren van elkaar te scheiden zijn zonder dat er een stuk van de
// andere tekening in de uitsnede achterblijft. De uitkomst is een voorstel dat een
// mens (en daarna een fysiotherapeut) moet bekijken; pas wat in
// content/mobile-pose-approvals.json staat, komt in de kaart terecht.
//
// Waarom geen witruimte-splitsing: één lichaam of apparaat kan een witte kolom
// bevatten, en een arm of halter kan de middellijn kruisen. We labelen daarom
// samenhangende inkt (connected components) en eisen twee echt gescheiden figuren.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { exerciseId } from '../lib/exercise-id.js';
import { validatePosePair, cropsOverlap, poseFrameLayout } from '../lib/pose-frames.js';

const BLOCK = 4;              // werkraster: dempt JPEG-ruis en anti-aliasing
const INK_MAX = 248;          // onder deze waarde noemen we een pixel inkt
const BLOCK_INK_MIN = 3;      // minstens 3 van de 16 pixels in een blok
const FIGURE_MIN_SPAN = 0.25;  // een liggende oefening is breed en laag
const FIGURE_MIN_AREA = 0.012;
const BRAND_BAND = 0.16;      // het merk staat in de bovenste strook
const BRAND_MAX_HEIGHT = 0.10;
const BRAND_MIN_BLUE = 200;   // het Fysiplan-icoon is blauw; tekst staat ernaast
const BRAND_TEXT_GAP = 48;
// Vrijwel gelijke silhouetten tonen we niet als beweging. Twee drempels: een harde
// bovengrens voor de overlap, en een mildere overlap gecombineerd met nauwelijks
// pixelverschil. Beide zijn tijdens de visuele controle op echte bladen geijkt.
const IDENTICAL_IOU = 0.90;
const SIMILAR_IOU = 0.85, SIMILAR_MAD = 10;
const FOREIGN_INK_MAX = 0;    // strikt: elke inkt die niet bij deze houding hoort, diskwalificeert het paar

export async function analyseSheet(bytes) {
  const image = sharp(bytes).removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, CH = info.channels;
  const gw = Math.ceil(W / BLOCK), gh = Math.ceil(H / BLOCK);
  const ink = new Uint8Array(gw * gh);
  const blue = new Int32Array(gw * gh);
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      let count = 0, blueCount = 0;
      const y1 = Math.min((by + 1) * BLOCK, H), x1 = Math.min((bx + 1) * BLOCK, W);
      for (let y = by * BLOCK; y < y1; y++) {
        for (let x = bx * BLOCK; x < x1; x++) {
          const i = (y * W + x) * CH;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (Math.min(r, g, b) <= INK_MAX) count++;
          if (b - Math.max(r, g) > 30 && b > 110) blueCount++;
        }
      }
      if (count >= BLOCK_INK_MIN) ink[by * gw + bx] = 1;
      blue[by * gw + bx] = blueCount;
    }
  }
  // 8-verbonden componenten over het blokraster
  const label = new Int32Array(gw * gh).fill(-1);
  const stack = new Int32Array(gw * gh);
  const components = [];
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || label[start] !== -1) continue;
    const id = components.length;
    let top = 0;
    stack[top++] = start; label[start] = id;
    let minX = gw, minY = gh, maxX = -1, maxY = -1, area = 0, blueArea = 0;
    while (top > 0) {
      const p = stack[--top];
      const px = p % gw, py = (p - px) / gw;
      area++; blueArea += blue[p];
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (ink[n] && label[n] === -1) { label[n] = id; stack[top++] = n; }
      }
    }
    components.push({
      id,
      box: { x: minX * BLOCK, y: minY * BLOCK, w: Math.min((maxX + 1) * BLOCK, W) - minX * BLOCK, h: Math.min((maxY + 1) * BLOCK, H) - minY * BLOCK },
      blocks: area,
      pixelArea: area * BLOCK * BLOCK,
      bluePixels: blueArea
    });
  }
  const figures = components.filter(c => c.pixelArea >= FIGURE_MIN_AREA * W * H &&
    (c.box.h >= FIGURE_MIN_SPAN * H || c.box.w >= FIGURE_MIN_SPAN * W));
  const rest = components.filter(c => !figures.includes(c));
  // Alleen het eigen merk herkennen we als merk: het blauwe icoon in de bovenstrook en
  // het woordmerk er direct naast. Een halter boven het hoofd is geen merk, en een
  // vreemd eigendomsmerk mogen we niet als "ons merk" wegstrepen.
  const topBand = rest.filter(c => c.box.y + c.box.h <= BRAND_BAND * H && c.box.h <= BRAND_MAX_HEIGHT * H && c.pixelArea > 64);
  const icons = topBand.filter(c => c.bluePixels >= BRAND_MIN_BLUE);
  const branding = topBand.filter(c => icons.includes(c) || icons.some(icon =>
    c.box.x >= icon.box.x && c.box.x - (icon.box.x + icon.box.w) <= BRAND_TEXT_GAP &&
    c.box.y + c.box.h > icon.box.y && c.box.y < icon.box.y + icon.box.h));
  const loose = rest.filter(c => !branding.includes(c) && c.pixelArea > 400);
  return { W, H, gw, gh, ink, label, figures, branding, loose, components,
    speckle: rest.length - branding.length - loose.length };
}

function unionBox(boxes) {
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  const r = Math.max(...boxes.map(b => b.x + b.w)), bo = Math.max(...boxes.map(b => b.y + b.h));
  return { x, y, w: r - x, h: bo - y };
}

function grow(box, by, W, H) {
  const x = Math.max(0, box.x - by), y = Math.max(0, box.y - by);
  return { x, y, w: Math.min(W, box.x + box.w + by) - x, h: Math.min(H, box.y + box.h + by) - y };
}

// Hoe verschillend zijn de twee houdingen echt? Een identiek start- en eindbeeld mag
// nooit als beweging worden getoond. madMirrored helpt de "zelfde been"-fout zien:
// bij een correcte wissel lijkt houding 2 op het spiegelbeeld van houding 1.
async function poseDifference(bytes, crops) {
  const w = 48, h = 72;
  const [a, b] = await Promise.all(crops.map(c =>
    sharp(bytes).extract({ left: c.x, top: c.y, width: c.w, height: c.h })
      .resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer()));
  let direct = 0, mirrored = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    direct += Math.abs(a[y * w + x] - b[y * w + x]);
    mirrored += Math.abs(a[y * w + x] - b[y * w + (w - 1 - x)]);
  }
  return { madDirect: +(direct / (w * h)).toFixed(2), madMirrored: +(mirrored / (w * h)).toFixed(2) };
}

// Overlappen de twee silhouetten elkaar bijna volledig, dan beweegt er in het frame
// niets zichtbaars en mag dit geen beweging heten. We meten in exact de meetkunde
// waarin de kaart de houdingen tekent, dus zoals de patiënt het ziet.
async function silhouetteOverlap(bytes, poses, axis) {
  const size = 160, pad = 8;
  const layout = poseFrameLayout(poses, axis, size, pad);
  const masks = [];
  for (const frame of layout) {
    const w = Math.max(1, Math.round(frame.dw)), h = Math.max(1, Math.round(frame.dh));
    const pixels = await sharp(bytes).extract({ left: frame.sx, top: frame.sy, width: frame.sw, height: frame.sh })
      .resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer();
    const mask = new Uint8Array(size * size);
    const dx = Math.round(frame.dx), dy = Math.round(frame.dy);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (pixels[y * w + x] > INK_MAX) continue;
      const ty = dy + y, tx = dx + x;
      if (ty < 0 || tx < 0 || ty >= size || tx >= size) continue;
      mask[ty * size + tx] = 1;
    }
    masks.push(mask);
  }
  let both = 0, either = 0;
  for (let i = 0; i < size * size; i++) {
    if (masks[0][i] && masks[1][i]) both++;
    if (masks[0][i] || masks[1][i]) either++;
  }
  return { silhouetteIoU: either ? +(both / either).toFixed(3) : 1, silhouettePixels: either };
}

// Harde meting van de eis "geen stuk van de andere tekening in beeld": tel binnen
// elke uitsnede de inkt die bij geen enkel toegestaan onderdeel van déze houding
// hoort. Het oog ziet dat op een contactvel niet betrouwbaar; dit wel.
function foreignInk(sheet, crop, allowed) {
  const { gw, ink, label } = sheet;
  const found = new Map();
  const bx0 = Math.floor(crop.x / BLOCK), bx1 = Math.ceil((crop.x + crop.w) / BLOCK);
  const by0 = Math.floor(crop.y / BLOCK), by1 = Math.ceil((crop.y + crop.h) / BLOCK);
  let blocks = 0;
  for (let by = by0; by < by1; by++) for (let bx = bx0; bx < bx1; bx++) {
    const index = by * gw + bx;
    if (!ink[index]) continue;
    const id = label[index];
    if (allowed.has(id)) continue;
    blocks++;
    found.set(id, (found.get(id) || 0) + 1);
  }
  return { pixels: blocks * BLOCK * BLOCK, components: [...found.keys()] };
}

export async function poseCandidate(bytes) {
  const sheet = await analyseSheet(bytes);
  const { W, H, figures, branding, loose } = sheet;
  const geometry = {
    width: W, height: H,
    figureCount: figures.length,
    brandingBoxes: branding.map(c => ({ ...c.box, bluePixels: c.bluePixels })),
    looseObjects: loose.map(c => ({ ...c.box, pixelArea: c.pixelArea }))
  };
  if (figures.length !== 2) {
    return { ...geometry, verdict: figures.length < 2 ? 'single-figure' : 'multiple-figures',
      reason: figures.length === 1 ? 'Eén samenhangend figuur gevonden; geen paar om te tonen.'
        : figures.length === 0 ? 'Geen figuur van voldoende formaat gevonden.'
        : figures.length + ' figuren gevonden; welk paar bedoeld is, staat niet vast.' };
  }
  const sorted = figures.slice().sort((a, b) => a.box.x - b.box.x);
  const horizontal = sorted[0].box.x + sorted[0].box.w <= sorted[1].box.x;
  const vertical = !horizontal && Math.min(...figures.map(f => f.box.y + f.box.h)) <= Math.max(...figures.map(f => f.box.y));
  if (!horizontal && !vertical) {
    return { ...geometry, verdict: 'overlapping-figures',
      reason: 'De twee figuren overlappen elkaar in beide richtingen; een uitsnede zou een stuk van de andere tekening bevatten.' };
  }
  const order = horizontal ? sorted : figures.slice().sort((a, b) => a.box.y - b.box.y);
  const axis = horizontal ? 'x' : 'y';
  // losse voorwerpen (halter, mat, schaduw) toewijzen aan het figuur waar ze bij horen
  const assigned = [[], []];
  const unassigned = [];
  for (const object of loose) {
    const overlaps = order.map(f => axis === 'x'
      ? Math.min(f.box.x + f.box.w, object.box.x + object.box.w) - Math.max(f.box.x, object.box.x)
      : Math.min(f.box.y + f.box.h, object.box.y + object.box.h) - Math.max(f.box.y, object.box.y));
    const best = overlaps[0] >= overlaps[1] ? 0 : 1;
    if (overlaps[best] <= 0) { unassigned.push(object); continue; }
    if (overlaps[0] > 0 && overlaps[1] > 0) { unassigned.push(object); continue; }
    assigned[best].push(object);
  }
  if (unassigned.length) {
    return { ...geometry, verdict: 'ambiguous-objects', axis,
      reason: 'Losse voorwerpen horen bij geen of bij beide figuren: ' +
        unassigned.map(o => `${o.box.w}x${o.box.h}@${o.box.x},${o.box.y}`).join(', ') + '.' };
  }
  let crops = order.map((f, i) => unionBox([f.box, ...assigned[i].map(o => o.box)]));
  // het merk hoort nooit in een houding-uitsnede: de kaart zet het merk zelf, gelijk
  // voor beide houdingen, buiten de uitsnede
  const brandInside = branding.filter(b => crops.some(c => cropsOverlap(c, b.box)));
  if (brandInside.length) {
    return { ...geometry, verdict: 'branding-overlaps-figure', axis,
      brandingOverlap: brandInside.map(b => ({ ...b.box, overlapsCrop: crops.findIndex(c => cropsOverlap(c, b.box)) })),
      reason: 'Het merk-/tekstblok valt binnen een figuur-uitsnede; uitsnijden zou het merk ongelijk over de houdingen verdelen. De volledige afbeelding blijft staan.' };
  }
  let padding = 8;
  while (padding > 0 && cropsOverlap(grow(crops[0], padding, W, H), grow(crops[1], padding, W, H))) padding -= 2;
  crops = crops.map(c => grow(c, Math.max(padding, 0), W, H));
  if (cropsOverlap(crops[0], crops[1])) {
    return { ...geometry, verdict: 'crops-touch', axis,
      reason: 'De uitsnedes raken elkaar ook zonder marge; er zou een stuk van de andere tekening in blijven staan.' };
  }
  const poses = crops.map((crop, i) => ({ label: i === 0 ? 'start' : 'end', crop }));
  if (!validatePosePair(poses, W, H)) {
    return { ...geometry, verdict: 'invalid-crops', axis, reason: 'Uitsnedes vielen buiten het beeld of overlapten.' };
  }
  const strays = crops.map((crop, i) => foreignInk(sheet, crop, new Set([order[i].id, ...assigned[i].map(o => o.id)])));
  const strayTotal = strays.reduce((sum, s) => sum + s.pixels, 0);
  if (strayTotal > FOREIGN_INK_MAX) {
    return { ...geometry, verdict: 'foreign-ink-in-crop', axis,
      foreignInk: strays.map((s, i) => ({ pose: i, ...s })),
      reason: `Binnen de uitsnedes staat ${strayTotal} px² inkt die niet bij deze houding hoort (los voorwerp of stuk van de andere tekening). Volledige afbeelding blijft staan.` };
  }
  const metrics = { ...await poseDifference(bytes, crops), ...await silhouetteOverlap(bytes, poses, axis) };
  if (metrics.silhouetteIoU >= IDENTICAL_IOU || (metrics.silhouetteIoU >= SIMILAR_IOU && metrics.madDirect < SIMILAR_MAD)) {
    return { ...geometry, verdict: 'poses-too-similar', axis, metrics,
      reason: `De silhouetten van beide houdingen overlappen voor ${Math.round(metrics.silhouetteIoU * 100)}%; in het frame is geen beweging te zien. Als beweging tonen zou misleidend zijn.` };
  }
  return { ...geometry, verdict: 'pair-candidate', axis, poses, metrics,
    foreignInkPixels: strayTotal,
    // Losse voorwerpen die aan een houding zijn toegewezen zijn de zwakke plek van
    // automatische detectie: die vragen expliciete visuele bevestiging.
    assignedObjects: assigned.map(list => list.length),
    gapPixels: axis === 'x' ? order[1].box.x - (order[0].box.x + order[0].box.w) : order[1].box.y - (order[0].box.y + order[0].box.h) };
}

async function main() {
  const catalog = JSON.parse(await fs.readFile('public/oefeningen-v2.json', 'utf8'));
  const results = [];
  for (const exercise of catalog) {
    const source = exercise.kaartImg || exercise.img;
    let bytes;
    try { bytes = await fs.readFile('public/' + source); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const candidate = await poseCandidate(bytes);
    results.push({
      exerciseId: exerciseId(exercise), name: exercise.naam, source,
      assetSha256: createHash('sha256').update(bytes).digest('hex'),
      ...candidate
    });
    if (results.length % 40 === 0) process.stderr.write(`  ${results.length} beelden gemeten\n`);
  }
  const tally = {};
  for (const r of results) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  const payload = {
    schemaVersion: 1,
    generatedBy: 'scripts/pose-crop-candidates.mjs',
    warning: 'Meetresultaat, geen goedkeuring. Alleen handmatig bekeken en in content/mobile-pose-approvals.json vastgelegde uitsnedes mogen in de kaart komen.',
    method: `blokraster ${BLOCK}px, inkt<=${INK_MAX}, 8-verbonden componenten, figuren >=${FIGURE_MIN_SPAN * 100}% van een beeldzijde en >=${FIGURE_MIN_AREA * 100}% oppervlak, eigen merk herkend aan blauw icoon`,
    tally, total: results.length, candidates: results
  };
  await fs.writeFile('output/mobile-pose-candidates.json', JSON.stringify(payload, null, 1) + '\n');
  console.log(tally, 'total', results.length);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
