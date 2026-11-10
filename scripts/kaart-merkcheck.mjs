// Browsercontrole van één merk op de patiëntkaart (headless Chromium, telefoonformaat).
//
// Toont aan: (1) geen miniatuur heeft nog een blauwe merkstip linksboven, (2) de vergrote
// foto van een beeld mét ingebakken merk toont dat merk niet meer en wel het eigen merk
// boven het beeld, (3) hetzelfde bij een beeld zónder ingebakken merk, (4) bij de houdingen
// staat het merk in dezelfde stijl en ligt het niet over het getekende figuur.
// Schrijft naar output/pose-review/merk/. Geen klinische controle.
//
//   node scripts/kaart-merkcheck.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BROWSER = process.env.KAART_BROWSER || path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell');
try { await fs.access(BROWSER); } catch {
  console.log('Overgeslagen: geen headless browser gevonden (' + BROWSER + '). Zet KAART_BROWSER.');
  process.exit(2);
}

const UIT = 'output/pose-review/merk';
await fs.mkdir(UIT, { recursive: true });
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fysiplan-browser-data-'));
const profiel = await fs.mkdtemp(path.join(os.tmpdir(), 'fysiplan-browser-profiel-'));
const serverPoort = 8800 + (process.pid % 100), cdpPoort = 9300 + (process.pid % 100);
const kinderen = [];
const opruimen = async () => {
  for (const k of kinderen) { try { k.kill('SIGTERM'); } catch {} }
  await new Promise(r => setTimeout(r, 300));
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.rm(profiel, { recursive: true, force: true });
};
const slaap = ms => new Promise(r => setTimeout(r, ms));

async function wachtOp(check, ms, wat) {
  const tot = Date.now() + ms;
  while (Date.now() < tot) { try { const v = await check(); if (v) return v; } catch {} await slaap(150); }
  throw new Error('time-out: ' + wat);
}

class Cdp {
  constructor(url) {
    this.n = 0; this.open = new Map(); this.luisteraars = [];
    this.ws = new WebSocket(url);
    this.klaar = new Promise((ok, fout) => { this.ws.onopen = ok; this.ws.onerror = fout; });
    this.ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.id) { const p = this.open.get(d.id); this.open.delete(d.id); d.error ? p.fout(new Error(d.error.message)) : p.ok(d.result); }
      else this.luisteraars.forEach(f => f(d));
    };
  }
  stuur(method, params = {}) {
    const id = ++this.n;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fout) => this.open.set(id, { ok, fout }));
  }
  async waarde(expr) {
    const r = await this.stuur('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async tik(selector) {
    const rect = await this.waarde(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;
      el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if (!rect) throw new Error('niet gevonden: ' + selector);
    await slaap(150);
    const opnieuw = await this.waarde(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.stuur('Input.dispatchMouseEvent', { type, x: opnieuw.x, y: opnieuw.y, button: 'left', clickCount: 1 });
    }
  }
  async foto(naam) {
    const r = await this.stuur('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(UIT, naam), Buffer.from(r.data, 'base64'));
    return path.join(UIT, naam);
  }
}


import sharp from 'sharp';
const review = JSON.parse(await fs.readFile('public/mobile-media-review.json', 'utf8'));
const regel = naam => review.entries.find(e => e.name === naam);
const verslag = { gemaakt: new Date().toISOString(), viewport: '390x844 @2x', stappen: [], fouten: [] };
const stap = (wat, uitkomst) => { verslag.stappen.push({ wat, ...uitkomst }); console.log('•', wat, JSON.stringify(uitkomst)); };
// blauwe merkpixels in een rechthoek (CSS-px) van een schermafdruk op 2x
async function blauw(png, r) {
  const left = Math.max(0, Math.round(r.x * 2)), top = Math.max(0, Math.round(r.y * 2));
  const { data, info } = await sharp(png).extract({ left, top, width: Math.max(1, Math.round(r.w * 2)), height: Math.max(1, Math.round(r.h * 2)) })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0; for (let i = 0; i < data.length; i += 3) if (data[i + 2] > 150 && data[i + 2] - data[i] > 80) n++;
  return n;
}
const schot = async (cdp) => Buffer.from((await cdp.stuur('Page.captureScreenshot', { format: 'png' })).data, 'base64');

try {
  const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(serverPoort), DATA_DIR: dataDir }, stdio: 'ignore' });
  kinderen.push(server);
  await wachtOp(async () => (await fetch(`http://127.0.0.1:${serverPoort}/mobile-media-review.json`)).ok, 15000, 'server');
  const browser = spawn(BROWSER, ['--headless', `--remote-debugging-port=${cdpPoort}`, `--user-data-dir=${profiel}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync',
    '--disable-extensions', '--mute-audio', '--lang=nl-NL', 'about:blank'], { stdio: 'ignore' });
  kinderen.push(browser);
  const doel = await wachtOp(async () => (await (await fetch(`http://127.0.0.1:${cdpPoort}/json/list`)).json()).find(t => t.type === 'page'), 15000, 'browser');
  const cdp = new Cdp(doel.webSocketDebuggerUrl);
  await cdp.klaar;
  cdp.luisteraars.push(d => {
    if (d.method === 'Runtime.exceptionThrown') verslag.fouten.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Page.javascriptDialogOpening') cdp.stuur('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
  for (const m of ['Page.enable', 'Runtime.enable']) await cdp.stuur(m);
  await cdp.stuur('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.stuur('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.stuur('Page.navigate', { url: `http://127.0.0.1:${serverPoort}/k/demo?taal=nl` });
  await wachtOp(() => cdp.waarde(`(()=>{const imgs=[...document.querySelectorAll('#oefs .fotoknop img')];
    return imgs.length&&imgs.every(i=>{i.loading='eager';return i.complete&&i.naturalWidth>0})?imgs.length:0})()`), 20000, 'miniaturen');
  await slaap(400);

  // 1. miniaturen: geen blauwe stip linksboven in het getekende beeld
  const minis = await cdp.waarde(`[...document.querySelectorAll('#oefs .fotoknop img')].map(i=>{i.scrollIntoView({block:'center'});
    const r=i.getBoundingClientRect();return {naam:i.dataset.audioNaam,pose:i.dataset.pose,dek:!!i.parentNode.querySelector('.merkdek'),r:{x:r.x,y:r.y,w:r.width,h:r.height}};})`);
  for (const [k, m] of minis.entries()) {
    await cdp.waarde(`document.querySelectorAll('#oefs .fotoknop img')[${k}].scrollIntoView({block:'center'})`);
    await slaap(150);
    const r = await cdp.waarde(`(()=>{const r=document.querySelectorAll('#oefs .fotoknop img')[${k}].getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    const png = await schot(cdp);
    if (k === 0) await fs.writeFile(path.join(UIT, '01-miniaturen.png'), png);
    const n = await blauw(png, { x: r.x, y: r.y, w: r.w * 0.5, h: r.h * 0.3 });
    const metMerk = !!(review.entries.find(e => e.exerciseId + '|' + e.source === m.pose)?.brandMark?.cover);
    stap('miniatuur ' + m.naam, { ingebakkenMerk: metMerk, afgedekt: m.dek, blauwLinksboven: n });
    if (metMerk !== m.dek) verslag.fouten.push('afdekking miniatuur klopt niet: ' + m.naam);
    if (n > 0) verslag.fouten.push('blauwe merkstip zichtbaar op miniatuur: ' + m.naam);
  }

  // De kaart opent als overzicht; het grote beeld en de vergroting staan bij de oefening zelf.
  const openOefening = async (n) => {
    await cdp.tik(`#oefs .oef:nth-of-type(${n}) .oefinfo`);
    await wachtOp(() => cdp.waarde(`document.body.classList.contains('sessie')&&!!document.querySelector('#oefs .oef:nth-of-type(${n}).actief')`), 3000, 'oefening open');
    await slaap(400);
  };
  const sluitOefening = async () => {
    await cdp.waarde(`document.getElementById('sterug').click()`);
    await wachtOp(() => cdp.waarde(`!document.body.classList.contains('sessie')`), 3000, 'oefening dicht');
    await slaap(250);
  };

  // 1b. hetzelfde beeld groot in de oefenstand: het afdekvlak is opnieuw gemeten, geen blauwe stip
  for (const [k, m] of minis.entries()) {
    await openOefening(k + 1);
    const g = await cdp.waarde(`(()=>{const i=document.querySelector('#oefs .oef.actief .fotoknop img');const r=i.getBoundingClientRect();
      return {dek:!!i.parentNode.querySelector('.merkdek'),r:{x:r.x,y:r.y,w:r.width,h:r.height}};})()`);
    const png = await schot(cdp);
    if (k === 0) await fs.writeFile(path.join(UIT, '01b-oefening.png'), png);
    const n = await blauw(png, { x: g.r.x, y: g.r.y, w: g.r.w * 0.5, h: g.r.h * 0.3 });
    const metMerk = !!(review.entries.find(e => e.exerciseId + '|' + e.source === m.pose)?.brandMark?.cover);
    stap('oefenstand ' + m.naam, { ingebakkenMerk: metMerk, afgedekt: g.dek, blauwLinksboven: n, breedte: Math.round(g.r.w) });
    if (metMerk !== g.dek) verslag.fouten.push('afdekking in de oefenstand klopt niet: ' + m.naam);
    if (n > 0) verslag.fouten.push('blauwe merkstip zichtbaar in de oefenstand: ' + m.naam);
    if (g.r.w < 120) verslag.fouten.push('beeld in de oefenstand is niet groot: ' + m.naam);
    await sluitOefening();
    // terug in de lijst moet het afdekvlak weer op de miniatuur passen
    const terug = await cdp.waarde(`(()=>{const i=document.querySelectorAll('#oefs .fotoknop img')[${k}];i.scrollIntoView({block:'center'});const r=i.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    await slaap(200);
    const r2 = await cdp.waarde(`(()=>{const r=document.querySelectorAll('#oefs .fotoknop img')[${k}].getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    const n2 = await blauw(await schot(cdp), { x: r2.x, y: r2.y, w: r2.w * 0.5, h: r2.h * 0.3 });
    if (n2 > 0) verslag.fouten.push('blauwe merkstip terug op de miniatuur na het sluiten: ' + m.naam);
  }

  // 2. houdingen: zelfde merk, niet over het figuur
  await openOefening(1);
  await cdp.tik('#oefs .oef:nth-of-type(1) .fotoknop');
  await wachtOp(() => cdp.waarde(`!document.getElementById('lbdemo').hidden&&document.querySelectorAll('#lbdemo canvas').length===2`), 10000, 'houdingen');
  const pose = await cdp.waarde(`(()=>{const m=document.querySelector('#lbdemo .demomerk').getBoundingClientRect();
    const c=document.querySelector('#lbdemo canvas');const cr=c.getBoundingClientRect();const s=c.width/cr.width;
    const g=c.getContext('2d');const x0=Math.max(0,Math.floor((m.left-cr.left)*s)),y0=Math.max(0,Math.floor((m.top-cr.top)*s));
    const d=g.getImageData(x0,y0,Math.ceil(m.width*s),Math.ceil(m.height*s)).data;let inkt=0;for(let i=0;i<d.length;i+=4)if(Math.min(d[i],d[i+1],d[i+2])<=248)inkt++;
    return {tekst:document.querySelector('#lbdemo .demomerk').textContent,breedte:Math.round(m.width),hoogte:Math.round(m.height),inktOnderMerk:inkt,
      fotoKaderVerborgen:document.getElementById('lbfoto').hidden};})()`);
  stap('houdingen: merk', pose);
  await fs.writeFile(path.join(UIT, '02-houdingen.png'), await schot(cdp));
  if (pose.inktOnderMerk > 0) verslag.fouten.push('merk ligt over het figuur in de houdingen');
  if (pose.breedte < 50) verslag.fouten.push('merk bij houdingen mist icoon of tekst');
  await cdp.tik('#lbdemoKnop'); await slaap(200);
  await cdp.tik('#lbnaam'); await slaap(300);
  await sluitOefening();

  // 3. vergrote foto's van statische beelden, met en zonder ingebakken merk
  const pad0 = await cdp.waarde(`document.querySelector('#oefs .fotoknop img').getAttribute('src')`);
  const voorvoegsel = pad0.startsWith('/v2/') ? '/v2/' : '/';
  let nr = 3;
  await openOefening(2);
  for (const naam of ['Front raises', 'Barbell neck press', 'Yoga deep squat', 'Foam roller calf', 'Seated biceps curl']) {
    const e = regel(naam);
    await cdp.waarde(`(()=>{const i=document.querySelector('#oefs .oef:nth-of-type(2) .fotoknop img');
      i.src=${JSON.stringify(voorvoegsel + e.source)};i.dataset.pose=${JSON.stringify(e.exerciseId + '|' + e.source)};i.dataset.uitleg='';i.dataset.heeftVideo='0';return true;})()`);
    await wachtOp(() => cdp.waarde(`(()=>{const i=document.querySelector('#oefs .oef:nth-of-type(2) .fotoknop img');return i.complete&&i.naturalWidth>0})()`), 8000, 'bron ' + naam);
    await cdp.tik('#oefs .oef:nth-of-type(2) .fotoknop');
    await wachtOp(() => cdp.waarde(`document.getElementById('lightbox').classList.contains('open')&&!document.getElementById('lbfoto').classList.contains('wacht')&&document.getElementById('lbimg').naturalWidth>0`), 8000, 'vergroting ' + naam);
    await slaap(400);
    const m = await cdp.waarde(`(()=>{const i=document.getElementById('lbimg').getBoundingClientRect(),f=document.querySelector('#lbfoto .fpmerk').getBoundingClientRect();
      return {beeld:{x:i.x,y:i.y,w:i.width,h:i.height},merk:{x:f.x,y:f.y,w:f.width,h:f.height},dek:!document.getElementById('lbdek').hidden,
        merkBovenBeeld:f.bottom<=i.top}})()`);
    const png = await schot(cdp);
    const bestand = String(nr++).padStart(2, '0') + '-' + naam.replace(/\W+/g, '-').toLowerCase() + '.png';
    await fs.writeFile(path.join(UIT, bestand), png);
    const inBeeld = await blauw(png, { x: m.beeld.x, y: m.beeld.y, w: m.beeld.w * 0.3, h: m.beeld.h * 0.08 });
    const eigenMerk = await blauw(png, m.merk);
    const uitkomst = { ingebakkenMerk: !!e.brandMark.cover, afgedekt: m.dek, blauwInBeeldLinksboven: inBeeld, eigenMerkBlauw: eigenMerk, merkBovenBeeld: m.merkBovenBeeld, schermafdruk: bestand };
    stap('vergrote foto ' + naam, uitkomst);
    if (inBeeld > 0) verslag.fouten.push('ingebakken merk nog zichtbaar: ' + naam);
    if (eigenMerk < 20) verslag.fouten.push('eigen merk ontbreekt: ' + naam);
    if (!m.merkBovenBeeld) verslag.fouten.push('eigen merk ligt over het beeld: ' + naam);
    if (!!e.brandMark.cover !== m.dek) verslag.fouten.push('afdekking klopt niet: ' + naam);
    await cdp.tik('#lbnaam'); await slaap(300);
  }
} catch (fout) {
  verslag.fouten.push('afgebroken: ' + fout.message);
} finally {
  await fs.writeFile(path.join(UIT, 'merkcheck.json'), JSON.stringify(verslag, null, 2) + '\n');
  await opruimen();
}
console.log(verslag.fouten.length ? 'FOUTEN:\n- ' + verslag.fouten.join('\n- ') : 'Eén merk in de browser: geen ingebakken merk meer zichtbaar, eigen merk overal boven het beeld.');
process.exit(verslag.fouten.length ? 1 : 0);
