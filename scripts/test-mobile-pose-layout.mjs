// De kaart draagt een eigen kopie van de houding-meetkunde (één los HTML-bestand kan
// niet importeren). Deze test bewijst dat die kopie zich exact gedraagt als
// lib/pose-frames.js, en legt de eigenschappen vast waar de reparatie om draaide:
// één schaal, geen uitrekken, centreren langs de indelingsas en het echte verschil
// loodrecht daarop behouden.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { poseFrameLayout, validatePoseCrop, cropsOverlap, validatePosePair } from '../lib/pose-frames.js';

const html = fs.readFileSync(new URL('../public/kaart.html', import.meta.url), 'utf8');
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);

const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
const code = between('  function geldigeUitsnede(', '  async function loadMobileReview(') +
  between('  function houdingFrames(', '  function demoStart()');
const context = vm.createContext({ Math, Number });
vm.runInContext(code, context);

// dezelfde invoer, dezelfde uitkomst: elke afwijking tussen kaart en bibliotheek is een bug
let seed = 20261102;
const random = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
for (let i = 0; i < 400; i++) {
  const width = 400 + random(1200), height = 400 + random(1200);
  const crop = () => {
    const w = 40 + random(Math.max(1, width - 60)), h = 40 + random(Math.max(1, height - 60));
    return { x: random(Math.max(1, width - w)), y: random(Math.max(1, height - h)), w, h };
  };
  const poses = [{ label: 'start', crop: crop() }, { label: 'end', crop: crop() }];
  const axis = i % 2 ? 'x' : 'y';
  for (const pose of poses) {
    assert.equal(context.geldigeUitsnede(pose.crop, width, height), validatePoseCrop(pose.crop, width, height));
  }
  assert.equal(context.uitsnedenOverlappen(poses[0].crop, poses[1].crop), cropsOverlap(poses[0].crop, poses[1].crop));
  const mine = context.houdingFrames(poses, axis, 640, 32);
  const theirs = poseFrameLayout(poses, axis, 640, 32);
  // de kaart rekent in een eigen VM-realm, dus vergelijken we de waarden, niet de objecten
  assert.equal(JSON.stringify(mine), JSON.stringify(theirs), 'kaart en lib/pose-frames.js moeten identiek rekenen');

  // één schaal voor beide houdingen, en geen uitrekken: de verhouding blijft gelijk
  assert.equal(mine[0].scale, mine[1].scale);
  for (const f of mine) {
    assert.ok(Math.abs(f.dw / f.sw - f.dh / f.sh) < 1e-9, 'beeldverhouding blijft gelijk');
    assert.ok(Math.abs(f.dw / f.sw - f.scale) < 1e-9, 'geen afzonderlijke schaal per houding');
    assert.ok(f.dx >= 32 - 1e-9 && f.dy >= 32 - 1e-9, 'binnen de marge');
    assert.ok(f.dx + f.dw <= 608 + 1e-9 && f.dy + f.dh <= 608 + 1e-9, 'binnen de marge');
  }
  if (axis === 'x') {
    // naast elkaar op het blad: horizontaal centreren, het hoogteverschil blijft echt
    for (const f of mine) assert.ok(Math.abs(f.dx + f.dw / 2 - 320) < 1e-9, 'houding staat gecentreerd');
    const bron = poses[1].crop.y - poses[0].crop.y, frame = mine[1].dy - mine[0].dy;
    assert.ok(Math.abs(frame - bron * mine[0].scale) < 1e-9, 'echt hoogteverschil blijft behouden');
  } else {
    // onder elkaar op het blad: verticaal centreren, het breedteverschil blijft echt
    for (const f of mine) assert.ok(Math.abs(f.dy + f.dh / 2 - 320) < 1e-9, 'houding staat gecentreerd');
    const bron = poses[1].crop.x - poses[0].crop.x, frame = mine[1].dx - mine[0].dx;
    assert.ok(Math.abs(frame - bron * mine[0].scale) < 1e-9, 'echt zijwaarts verschil blijft behouden');
  }
}

// de bladindeling zelf mag nooit als beweging op het scherm komen
const sideBySide = [{ label: 'start', crop: { x: 20, y: 100, w: 300, h: 800 } },
                    { label: 'end', crop: { x: 450, y: 100, w: 300, h: 800 } }];
const flat = context.houdingFrames(sideBySide, 'x', 640, 32);
assert.equal(flat[0].dx, flat[1].dx, 'gelijke houdingen naast elkaar vallen exact over elkaar');
assert.equal(flat[0].dy, flat[1].dy);
const stacked = [{ label: 'start', crop: { x: 100, y: 20, w: 600, h: 500 } },
                 { label: 'end', crop: { x: 100, y: 600, w: 600, h: 500 } }];
const stack = context.houdingFrames(stacked, 'y', 640, 32);
assert.equal(stack[0].dy, stack[1].dy, 'gestapelde houdingen vallen exact over elkaar');
assert.equal(stack[0].dx, stack[1].dx);

// ongeldige of elkaar overlappende uitsnedes komen er niet doorheen
assert.equal(validatePosePair([{ crop: { x: 0, y: 0, w: 100, h: 100 } }, { crop: { x: 50, y: 50, w: 100, h: 100 } }], 400, 400), false);
assert.equal(context.geldigeUitsnede({ x: 0, y: 0, w: 100.5, h: 100 }, 400, 400), false, 'geen gebroken pixels');
assert.equal(context.geldigeUitsnede({ x: 350, y: 0, w: 100, h: 100 }, 400, 400), false, 'niet buiten het beeld');
assert.equal(context.geldigeUitsnede({ x: 0, y: 0, w: 0, h: 10 }, 400, 400), false);

// geen verzonnen beweging en geen heuristiek in de kaart
assert.ok(!html.includes("style.transform='translate("), 'geen verzonnen pose-verplaatsing');
assert.ok(!html.includes('demoSplitsing'), 'de witruimtesplitsing is verwijderd');
assert.ok(!html.includes('demoUniformFrames'), 'de oude contentvak-scan is verwijderd');
assert.ok(html.includes("if(bronGecontroleerd[pad+'|'+p.assetSha256]!==true)return null;"), 'uitsnede alleen bij bewezen bronbestand, per getoond pad');
assert.ok(html.includes("p.status!=='geometry-approved'"), 'alleen beoordeelde uitsnedes');
assert.ok(html.includes("merk.className='demomerk'"), 'het merk staat buiten de uitsnede en bij beide houdingen gelijk');
assert.ok(html.includes("bronNoot.className='demobron'"), 'de herkomstnotitie staat onder de houdingen');
console.log('Mobile pose layout: kaart en bibliotheek rekenen identiek; één schaal, geen uitrekken, geen heuristiek.');

// ---------------------------------------------------------------------------
// Tekent de kaart werkelijk de frames die zijn beoordeeld? We draaien demoStart uit
// public/kaart.html met echte beoordelingsdata en vangen elke canvas-opdracht op.
const reviewed = JSON.parse(fs.readFileSync(new URL('../public/mobile-media-review.json', import.meta.url), 'utf8'));
const entry = reviewed.entries.find(e => e.poseGeometry.status === 'geometry-approved');
assert.ok(entry, 'geen enkele goedgekeurde uitsnede om te tekenen');

const tekeningen = [];
const gemaakt = [];
function stubElement(tag) {
  const node = { tag, children: [], attrs: {}, style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, textContent: '', innerHTML: '', hidden: false };
  if (tag === 'canvas') {
    node.getContext = () => ({
      set fillStyle(v) { node.fill = v; },
      fillRect(...a) { node.gevuld = a; },
      drawImage(...a) { tekeningen.push({ canvas: node, args: a }); }
    });
  }
  gemaakt.push(node);
  return node;
}
const ids = {};
const demoDocument = {
  getElementById(id) { return (ids[id] = ids[id] || stubElement('div')); },
  createElement: stubElement
};
const img = ids.lbimg = stubElement('img');
img.complete = true; img.naturalWidth = entry.width; img.naturalHeight = entry.height;
// zoals de kaart het echt krijgt: via het v2-kanaal
img.src = 'https://praktijk.example/v2/' + entry.source;

const demoContext = vm.createContext({
  document: demoDocument, Math, Number, URL, JSON,
  location: { href: 'https://praktijk.example/k/abc' },
  window: { matchMedia: () => ({ matches: true }) }, matchMedia: () => ({ matches: true }),
  TAAL: 'nl', tr: (k) => k, vt: (s) => s,
  DEMO_BRON: { nl: 'herkomstnotitie' },
  NoorAudio: { match: () => true },
  demoKlok() {}, demoGeluidKnop() {}, demoZeg() {},
  bronGecontroleerd: { ['/v2/' + entry.source + '|' + entry.assetSha256]: true },
  demo: { info: { name: entry.name, uitleg: 'uitleg', poseMetadata: {
    source: entry.source, assetSha256: entry.assetSha256, axis: entry.poseGeometry.axis,
    poses: entry.poses, width: entry.width, height: entry.height } } }
});
vm.runInContext(between('  function geldigeUitsnede(', '  async function loadMobileReview(') +
  between('  function demoHoudingen(', '  // met geluid aan wisselen we rustiger'), demoContext);
vm.runInContext('demoStart()', demoContext);

assert.equal(tekeningen.length, 2, 'precies twee houdingen getekend');
const verwacht = poseFrameLayout(entry.poses, entry.poseGeometry.axis, 640, 32);
tekeningen.forEach((t, i) => {
  const f = verwacht[i];
  assert.equal(t.canvas.width, 640); assert.equal(t.canvas.height, 640);
  assert.equal(t.canvas.fill, '#fff', 'elk frame start op wit');
  assert.deepEqual(t.canvas.gevuld, [0, 0, 640, 640], 'het hele doek wordt wit gemaakt');
  assert.deepEqual(t.args.slice(1), [f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh],
    'de kaart tekent exact de beoordeelde uitsnede op de beoordeelde plek');
  assert.equal(t.args[0], img, 'getekend uit de originele bron, niet uit een tussenbeeld');
});
// alleen de tweede houding ligt bovenop, en het merk staat buiten beide uitsnedes
assert.equal(tekeningen[0].canvas.className, undefined);
assert.equal(tekeningen[1].canvas.className, 'boven');
const merk = gemaakt.find(n => n.className === 'demomerk');
assert.ok(merk && merk.textContent === 'Fysiplan', 'het merk wordt door de kaart zelf gezet');
assert.ok(gemaakt.some(n => n.className === 'demobron' && n.textContent === 'herkomstnotitie'), 'de herkomstnotitie staat eronder');
console.log('Kaartweergave: ' + entry.name + ' wordt getekend met exact de beoordeelde uitsnede, schaal en plek.');
