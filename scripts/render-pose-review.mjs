// Rendert de houding-frames precies zoals de patiëntkaart ze tekent, zodat de
// visuele controle gaat over wat de patiënt ziet en niet over een benadering.
//
//   node scripts/render-pose-review.mjs            alle pair-candidates op contactvellen
//   node scripts/render-pose-review.mjs --verdict single-figure --limit 24
//   node scripts/render-pose-review.mjs --before-after "Anteflexie armen,Squat"
//
// --before-after zet de oude middellijn-splitsing (met het merk in het contentvak)
// naast de nieuwe uitsnede, als bewijsmateriaal bij de reparatie.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { poseFrameLayout } from '../lib/pose-frames.js';

const FRAME = 640, PAD = 32;
const TILE = 300, THUMB = 200, LABEL = 30;

function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function label(text, width, height, size = 17) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `<text x="6" y="${Math.round(height * 0.72)}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="${size}" fill="#0f172a">${escapeXml(text)}</text></svg>`);
}

// Dezelfde meetkunde als de kaart: één schaal, echte hoogteverhouding, gecentreerd.
export async function renderPoseFrame(bytes, poses, axis, index, size = FRAME, pad = PAD) {
  const layout = poseFrameLayout(poses, axis, size, pad)[index];
  const piece = await sharp(bytes)
    .extract({ left: layout.sx, top: layout.sy, width: layout.sw, height: layout.sh })
    .resize(Math.max(1, Math.round(layout.dw)), Math.max(1, Math.round(layout.dh)), { fit: 'fill' })
    .png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: '#ffffff' } })
    .composite([{ input: piece, left: Math.round(layout.dx), top: Math.round(layout.dy) }])
    .png().toBuffer();
}

// De situatie van vóór de reparatie, exact nagebouwd: halveren op de middellijn en
// daarna het contentvak bepalen met een witruimte-scan die het merk meerekent.
async function renderLegacyFrame(bytes, which) {
  const meta = await sharp(bytes).metadata();
  const W = meta.width, H = meta.height;
  const half = Math.round(W / 2);
  const width = which === 0 ? half : W - half;
  const halves = [];
  for (const side of [0, 1]) {
    const w = side === 0 ? half : W - half;
    halves.push(await sharp(bytes).extract({ left: side === 0 ? 0 : half, top: 0, width: w, height: H }).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  const boxes = halves.map(({ data, info }) => {
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 245) {
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
    return right >= left ? { x: left, y: top, w: right - left + 1, h: bottom - top + 1 } : { x: 0, y: 0, w: info.width, h: info.height };
  });
  const scale = Math.min((FRAME - 2 * PAD) / Math.max(...boxes.map(b => b.w)), (FRAME - 2 * PAD) / Math.max(...boxes.map(b => b.h)));
  const b = boxes[which];
  const piece = await sharp(bytes)
    .extract({ left: (which === 0 ? 0 : half) + b.x, top: b.y, width: b.w, height: b.h })
    .resize(Math.max(1, Math.round(b.w * scale)), Math.max(1, Math.round(b.h * scale)), { fit: 'fill' }).png().toBuffer();
  return sharp({ create: { width: FRAME, height: FRAME, channels: 3, background: '#ffffff' } })
    .composite([{ input: piece, left: Math.round((FRAME - b.w * scale) / 2), top: Math.round(FRAME - PAD - b.h * scale) }])
    .png().toBuffer();
}

async function tile(candidate, bytes) {
  const width = THUMB + 2 * TILE, height = TILE + LABEL;
  const parts = [{ input: label(`${candidate.name} — ${candidate.source}`, width, LABEL), left: 0, top: TILE }];
  parts.push({ input: await sharp(bytes).resize(THUMB, TILE, { fit: 'contain', background: '#ffffff' }).png().toBuffer(), left: 0, top: 0 });
  if (candidate.poses) {
    for (const index of [0, 1]) {
      const frame = await renderPoseFrame(bytes, candidate.poses, candidate.axis, index);
      parts.push({ input: await sharp(frame).resize(TILE, TILE).png().toBuffer(), left: THUMB + index * TILE, top: 0 });
    }
  } else {
    parts.push({ input: label(`${candidate.verdict}: ${candidate.reason || ''}`, 2 * TILE, TILE, 15), left: THUMB, top: 0 });
  }
  return sharp({ create: { width, height, channels: 3, background: '#e2e8f0' } }).composite(parts).png().toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
  const data = JSON.parse(await fs.readFile('output/mobile-pose-candidates.json', 'utf8'));
  await fs.mkdir('output/pose-review', { recursive: true });

  const beforeAfter = option('--before-after');
  if (beforeAfter) {
    for (const name of beforeAfter.split(',')) {
      const candidate = data.candidates.find(c => c.name === name.trim());
      if (!candidate || !candidate.poses) { console.log('overgeslagen (geen paar):', name); continue; }
      const bytes = await fs.readFile('public/' + candidate.source);
      const columns = [
        ['bron', await sharp(bytes).resize(TILE, TILE, { fit: 'contain', background: '#ffffff' }).png().toBuffer()],
        ['oud: start', await sharp(await renderLegacyFrame(bytes, 0)).resize(TILE, TILE).png().toBuffer()],
        ['oud: eind', await sharp(await renderLegacyFrame(bytes, 1)).resize(TILE, TILE).png().toBuffer()],
        ['nieuw: start', await sharp(await renderPoseFrame(bytes, candidate.poses, candidate.axis, 0)).resize(TILE, TILE).png().toBuffer()],
        ['nieuw: eind', await sharp(await renderPoseFrame(bytes, candidate.poses, candidate.axis, 1)).resize(TILE, TILE).png().toBuffer()]
      ];
      const parts = [];
      columns.forEach(([caption, buffer], i) => {
        parts.push({ input: buffer, left: i * TILE, top: LABEL });
        parts.push({ input: label(caption, TILE, LABEL), left: i * TILE, top: 0 });
      });
      parts.push({ input: label(`${candidate.name} — ${candidate.source}`, columns.length * TILE, LABEL), left: 0, top: TILE + LABEL });
      const file = `output/pose-review/before-after-${candidate.exerciseId}.png`;
      await sharp({ create: { width: columns.length * TILE, height: TILE + 2 * LABEL, channels: 3, background: '#e2e8f0' } })
        .composite(parts).png().toFile(file);
      console.log(file);
    }
    return;
  }

  const verdict = option('--verdict') || 'pair-candidate';
  const limit = Number(option('--limit') || 0);
  const perSheet = Number(option('--per-sheet') || 4);
  let selected = data.candidates.filter(c => c.verdict === verdict);
  const offset = Number(option('--offset') || 0);
  selected = selected.slice(offset, limit ? offset + limit : undefined);
  for (let i = 0; i < selected.length; i += perSheet) {
    const group = selected.slice(i, i + perSheet);
    const tiles = [];
    for (const candidate of group) tiles.push(await tile(candidate, await fs.readFile('public/' + candidate.source)));
    const width = THUMB + 2 * TILE, rowHeight = TILE + LABEL;
    const file = path.join('output/pose-review', `${verdict}-${String(offset + i).padStart(3, '0')}.png`);
    await sharp({ create: { width, height: rowHeight * group.length + 4 * (group.length - 1), channels: 3, background: '#94a3b8' } })
      .composite(tiles.map((input, index) => ({ input, left: 0, top: index * (rowHeight + 4) })))
      .png().toFile(file);
    console.log(file, group.map(c => c.name).join(' | '));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
