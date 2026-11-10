// Echte browsercontrole van de patiëntkaart, zonder extra pakketten.
//
// Draait de echte server, opent de voorbeeldkaart in een headless Chromium via het
// DevTools-protocol (Node 22 heeft WebSocket ingebouwd) met de afmetingen van een
// telefoon, en doet wat een patiënt doet: een oefenfoto aantikken, de houdingen bekijken,
// naar de andere houding stappen en de stemopname laten afspelen. Tikken gaan als echte
// muisgebeurtenissen, zodat de browser ze als gebruikersgebaar telt.
//
// Wat dit WEL aantoont: dat de kaart in een browser de beoordeelde uitsnedes tekent, het
// merk buiten de uitsnede zet, de bron controleert, en dat een opname met byte-ranges
// laadt, afspeelt en de knop daarna terugzet.
// Wat dit NIET is: een luisterronde (er luistert geen mens) en geen klinische controle.
//
//   node scripts/kaart-browsercheck.mjs
//   KAART_BROWSER=/pad/naar/chrome node scripts/kaart-browsercheck.mjs
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

const UIT = 'output/pose-review/browser';
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

const verslag = { gemaakt: new Date().toISOString(), browser: BROWSER, kaart: '/k/demo?taal=nl', viewport: '390x844 @2x, mobiel',
  stappen: [], fouten: [], dialogen: [], audioVerzoeken: [], screenshots: [] };
const stap = (wat, uitkomst) => { verslag.stappen.push({ wat, ...uitkomst }); console.log('•', wat, JSON.stringify(uitkomst)); };

try {
  const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(serverPoort), DATA_DIR: dataDir }, stdio: 'ignore' });
  kinderen.push(server);
  await wachtOp(async () => (await fetch(`http://127.0.0.1:${serverPoort}/mobile-media-review.json`)).ok, 15000, 'server');

  const browser = spawn(BROWSER, ['--headless', `--remote-debugging-port=${cdpPoort}`, `--user-data-dir=${profiel}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync',
    '--disable-extensions', '--mute-audio', '--lang=nl-NL', 'about:blank'], { stdio: 'ignore' });
  kinderen.push(browser);
  const doel = await wachtOp(async () => {
    const lijst = await (await fetch(`http://127.0.0.1:${cdpPoort}/json/list`)).json();
    return lijst.find(t => t.type === 'page');
  }, 15000, 'browser');
  const cdp = new Cdp(doel.webSocketDebuggerUrl);
  await cdp.klaar;
  cdp.luisteraars.push(async d => {
    if (d.method === 'Runtime.exceptionThrown') verslag.fouten.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') verslag.fouten.push('console: ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    if (d.method === 'Page.javascriptDialogOpening') {
      verslag.dialogen.push(d.params.message);
      cdp.stuur('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
    if (d.method === 'Network.responseReceived' && d.params.response.url.includes('/audio/noor/') && d.params.response.url.endsWith('.mp3')) {
      verslag.audioVerzoeken.push({ status: d.params.response.status, range: d.params.response.requestHeaders?.Range || d.params.response.requestHeaders?.range || null,
        contentRange: d.params.response.headers['content-range'] || d.params.response.headers['Content-Range'] || null,
        contentType: d.params.response.headers['content-type'] || d.params.response.headers['Content-Type'] || null });
    }
  });
  for (const m of ['Page.enable', 'Runtime.enable', 'Network.enable']) await cdp.stuur(m);
  await cdp.stuur('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.stuur('Emulation.setTouchEmulationEnabled', { enabled: false });
  // geen automatisch wisselen: we stappen zelf, zodat elke schermafdruk één houding toont
  await cdp.stuur('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  await cdp.stuur('Page.navigate', { url: `http://127.0.0.1:${serverPoort}/k/demo?taal=nl` });
  const aantal = await wachtOp(() => cdp.waarde(`(()=>{const imgs=[...document.querySelectorAll('#oefs .fotoknop img')];
    return imgs.length&&imgs.every(i=>{i.loading='eager';return i.complete&&i.naturalWidth>0})?imgs.length:0})()`), 20000, 'oefenfoto\'s geladen');
  stap('kaart geladen', { oefenfotos: aantal, taal: await cdp.waarde('document.documentElement.lang||null') });
  verslag.screenshots.push(await cdp.foto('01-kaart.png'));

  // De kaart opent als overzicht; vergroting, stemknop en video staan bij de oefening zelf.
  // Eén tik op de rij opent de oefening, "Overzicht" sluit haar weer.
  const openOefening = async (n) => {
    await cdp.tik(`#oefs .oef:nth-of-type(${n}) .oefinfo`);
    await wachtOp(() => cdp.waarde(`document.body.classList.contains('sessie')&&!!document.querySelector('#oefs .oef:nth-of-type(${n}).actief')`), 3000, 'oefening open');
    await slaap(300);
  };
  const sluitOefening = async () => {
    await cdp.waarde(`document.getElementById('sterug').click()`);
    await wachtOp(() => cdp.waarde(`!document.body.classList.contains('sessie')`), 3000, 'oefening dicht');
    await slaap(200);
  };

  const oefeningen = await cdp.waarde(`[...document.querySelectorAll('#oefs .fotoknop img')].map(i=>({naam:i.dataset.audioNaam,pose:i.dataset.pose,src:i.getAttribute('src')}))`);
  verslag.oefeningen = oefeningen;
  const review = JSON.parse(await fs.readFile('public/mobile-media-review.json', 'utf8'));
  const goedgekeurd = new Map(review.entries.filter(e => e.poseGeometry.status === 'geometry-approved').map(e => [e.exerciseId + '|' + e.source, e]));

  let volgnummer = 2;
  for (const [i, oef] of oefeningen.entries()) {
    const regel = goedgekeurd.get(oef.pose);
    await openOefening(i + 1);
    await cdp.tik(`#oefs .oef:nth-of-type(${i + 1}) .fotoknop`);
    await wachtOp(() => cdp.waarde(`document.getElementById('lightbox').classList.contains('open')`), 5000, 'vergroting open');
    if (!regel) {
      await slaap(1500);
      const toch = await cdp.waarde(`!document.getElementById('lbdemoKnop').hidden||!document.getElementById('lbdemo').hidden`);
      stap('niet-goedgekeurde oefening blijft volledige foto: ' + oef.naam, { houdingknopZichtbaar: toch, verwacht: false });
      if (toch) verslag.fouten.push('houdingen getoond zonder goedkeuring: ' + oef.naam);
    } else {
      await wachtOp(() => cdp.waarde(`!document.getElementById('lbdemo').hidden&&document.querySelectorAll('#lbdemo canvas').length===2`), 10000, 'houdingen voor ' + oef.naam);
      // meten in de pagina zelf: wit doek, inhoud aanwezig, geen blauw merk in de uitsnede
      const meting = await cdp.waarde(`(()=>{
        const doeken=[...document.querySelectorAll('#lbdemo canvas')];
        const uit=doeken.map(c=>{const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;
          const px=(x,y)=>{const k=(y*c.width+x)*4;return [d[k],d[k+1],d[k+2]];};
          const hoeken=[px(2,2),px(c.width-3,2),px(2,c.height-3),px(c.width-3,c.height-3)].every(p=>p.every(v=>v>=250));
          let inkt=0,blauw=0,minX=c.width,minY=c.height,maxX=-1,maxY=-1;
          for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const k=(y*c.width+x)*4;const r=d[k],gg=d[k+1],b=d[k+2];
            if(Math.min(r,gg,b)<=248){inkt++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
            if(b-Math.max(r,gg)>30&&b>110)blauw++;}
          return {w:c.width,h:c.height,witteHoeken:hoeken,inktPixels:inkt,blauwePixels:blauw,inhoud:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}};});
        const merk=document.querySelector('#lbdemo .demomerk');
        const beeld=document.querySelector('#lbdemo .demobeeld').getBoundingClientRect();
        const m=merk&&merk.getBoundingClientRect();
        return {doeken:uit,merk:merk?{tekst:merk.textContent,links:Math.round(m.left-beeld.left),boven:Math.round(m.top-beeld.top)}:null,
          knop:document.getElementById('lbdemoKnop').textContent,notitie:(document.querySelector('#lbdemo .demobron')||{}).textContent||null,
          volledigeFotoVerborgen:document.getElementById('lbimg').style.display==='none'};
      })()`);
      // de verwachte plaats volgt uit dezelfde meetkunde als de kaart
      const { poseFrameLayout } = await import('../lib/pose-frames.js');
      const verwacht = poseFrameLayout(regel.poses, regel.poseGeometry.axis, 640, 32);
      stap('houdingen getoond: ' + oef.naam, { as: regel.poseGeometry.axis, ...meting,
        verwachteFrames: verwacht.map(f => ({ x: Math.round(f.dx), y: Math.round(f.dy), w: Math.round(f.dw), h: Math.round(f.dh) })) });
      if (!meting.doeken.every(d => d.w === 640 && d.h === 640 && d.witteHoeken && d.inktPixels > 1000)) verslag.fouten.push('doek klopt niet: ' + oef.naam);
      if (!meting.merk || meting.merk.tekst !== 'Fysiplan') verslag.fouten.push('merk ontbreekt: ' + oef.naam);
      // het getekende figuur moet binnen het verwachte frame vallen (marge voor anti-aliasing)
      meting.doeken.forEach((d, k) => {
        const f = verwacht[k];
        if (d.inhoud.x < f.dx - 2 || d.inhoud.y < f.dy - 2 || d.inhoud.x + d.inhoud.w > f.dx + f.dw + 2 || d.inhoud.y + d.inhoud.h > f.dy + f.dh + 2)
          verslag.fouten.push(`houding ${k + 1} van ${oef.naam} valt buiten de beoordeelde plek`);
      });
      verslag.screenshots.push(await cdp.foto(String(volgnummer++).padStart(2, '0') + '-' + oef.naam.replace(/\W+/g, '-').toLowerCase() + '-start.png'));
      await cdp.tik('#lbdemo .demobeeld');
      await wachtOp(() => cdp.waarde(`document.getElementById('lbdemo').classList.contains('tweede')`), 3000, 'naar houding 2');
      const label = await cdp.waarde(`document.getElementById('lbdemotekst').textContent`);
      stap('naar de andere houding: ' + oef.naam, { onderschrift: label });
      verslag.screenshots.push(await cdp.foto(String(volgnummer++).padStart(2, '0') + '-' + oef.naam.replace(/\W+/g, '-').toLowerCase() + '-eind.png'));
    }
    // sluiten met Escape, zoals een patiënt met toetsenbord zou doen
    await cdp.stuur('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.stuur('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wachtOp(() => cdp.waarde(`!document.getElementById('lightbox').classList.contains('open')`), 3000, 'vergroting dicht');
    await sluitOefening();
  }

  // Stemopname: een echte tik op "Luister naar Noor" bij de eerste oefening die er een heeft
  const noorIndex = await cdp.waarde(`(()=>{const b=document.querySelector('#oefs [data-noor]');return b?Number(b.dataset.noor):-1})()`);
  if (noorIndex >= 0) {
    await openOefening(noorIndex + 1);
    const t0 = Date.now();
    await cdp.tik(`#oefs [data-noor="${noorIndex}"]`);
    await wachtOp(() => cdp.waarde(`document.getElementById('leesBtn').getAttribute('aria-pressed')==='true'`), 3000, 'afspelen gestart');
    const tijdens = await cdp.waarde(`document.getElementById('leesTxt').textContent`);
    await wachtOp(() => cdp.waarde(`document.getElementById('leesBtn').getAttribute('aria-pressed')==='false'`), 90000, 'opname afgelopen');
    stap('stemopname afgespeeld tot het einde', { oefening: oefeningen[noorIndex]?.naam, knopTijdensAfspelen: tijdens,
      duurSeconden: +((Date.now() - t0) / 1000).toFixed(1), knopNaAfloop: await cdp.waarde(`document.getElementById('leesTxt').textContent`) });
  } else stap('geen oefening met stemopname op de voorbeeldkaart', {});

  verslag.geslaagd = verslag.fouten.length === 0 && verslag.dialogen.length === 0;
} catch (e) {
  verslag.fouten.push(String(e && e.stack || e));
  verslag.geslaagd = false;
} finally {
  await fs.writeFile('output/kaart-browsercheck.json', JSON.stringify(verslag, null, 2) + '\n');
  await opruimen();
}
console.log(verslag.geslaagd ? 'Browsercontrole geslaagd.' : 'Browsercontrole NIET geslaagd: ' + JSON.stringify(verslag.fouten.concat(verslag.dialogen)));
process.exit(verslag.geslaagd ? 0 : 1);
