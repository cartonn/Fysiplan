// Echte browsercontrole: luisterknoppen per oefening na een mislukt of verlopen eerste
// laden van het Noor-manifest. Zelfde opzet als kaart-browsercheck.mjs: de echte server,
// headless Chromium via het DevTools-protocol, echte tikken. Het manifest wordt in de
// browser onderschept: eerste aanvraag laten mislukken of laten verlopen, de nieuwe poging
// via de knop bovenaan vasthouden en dan doorlaten.
//
// Wat dit WEL aantoont: dat in een echte browser na een geslaagde nieuwe poging precies
// dezelfde knoppen terugkomen als bij een gewone lading, zonder dubbele, dat de opname dan
// start, en dat stoppen tijdens de poging niets laat afspelen maar de knoppen wel herstelt.
// Wat dit NIET is: een test op iOS Safari of een echte telefoon, en geen luisterronde.
// De service worker wordt omzeild, zodat het onderscheppen eenduidig is.
//
//   node scripts/kaart-browsercheck-noor-herstel.mjs
//   KAART_BROWSER=/pad/naar/chrome node scripts/kaart-browsercheck-noor-herstel.mjs
// Schrijft niets in de repository; de uitkomst staat op stdout.
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

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fysiplan-noor-herstel-data-'));
const profiel = await fs.mkdtemp(path.join(os.tmpdir(), 'fysiplan-noor-herstel-profiel-'));
const serverPoort = 8700 + (process.pid % 100), cdpPoort = 9200 + (process.pid % 100);
const kinderen = [];
const slaap = ms => new Promise(r => setTimeout(r, ms));
async function wachtOp(check, ms, wat) {
  const tot = Date.now() + ms;
  while (Date.now() < tot) { try { const v = await check(); if (v) return v; } catch {} await slaap(100); }
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
    const r = await this.waarde(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;
      el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
    if (!r) throw new Error('niet gevonden: ' + selector);
    for (const type of ['mousePressed', 'mouseReleased'])
      await this.stuur('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  }
}

// de luisterregels zoals de patiënt ze ziet
const NOOR = `(()=>{const o=document.getElementById('oefs');
  const knoppen=[...o.querySelectorAll('[data-noor]')].map(b=>Number(b.dataset.noor));
  return {knoppen,wachtend:[...o.querySelectorAll('[data-noor-wacht]')].map(b=>Number(b.dataset.noorWacht)),
    uniek:new Set(knoppen).size===knoppen.length,
    regels:[...o.querySelectorAll('[data-noor]')].map(b=>b.outerHTML+(b.nextElementSibling?b.nextElementSibling.outerHTML:'')),
    stand:document.getElementById('leesBtn').getAttribute('aria-pressed')};})()`;

const verslag = { gemaakt: new Date().toISOString(), browser: BROWSER, kaart: '/k/demo?taal=nl', scenarios: {}, fouten: [] };
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

  let manifest = [], mp3 = [], dialogen = [], fouten = [];
  cdp.luisteraars.push(d => {
    if (d.method === 'Fetch.requestPaused') manifest.push(d.params.requestId);
    if (d.method === 'Network.requestWillBeSent' && /\/audio\/noor\/[a-f0-9]+\.mp3/.test(d.params.request.url)) mp3.push(d.params.request.url);
    if (d.method === 'Page.javascriptDialogOpening') { dialogen.push(d.params.message); cdp.stuur('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
    if (d.method === 'Runtime.exceptionThrown') fouten.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  });
  for (const m of ['Page.enable', 'Runtime.enable', 'Network.enable']) await cdp.stuur(m);
  await cdp.stuur('Network.setBypassServiceWorker', { bypass: true });
  await cdp.stuur('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.stuur('Fetch.enable', { patterns: [{ urlPattern: '*/audio/noor/manifest.json*', requestStage: 'Request' }] });
  await cdp.stuur('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  const laat = id => cdp.stuur('Fetch.continueRequest', { requestId: id }).catch(() => {});
  const breek = id => cdp.stuur('Fetch.failRequest', { requestId: id, errorReason: 'ConnectionFailed' }).catch(() => {});
  async function open(eersteManifest) {
    manifest = []; mp3 = []; dialogen = []; fouten = [];
    await cdp.stuur('Page.navigate', { url: `http://127.0.0.1:${serverPoort}/k/demo?taal=nl` });
    const eerste = await wachtOp(() => manifest[0], 10000, 'eerste manifestaanvraag');
    await eersteManifest(eerste);
    await wachtOp(() => cdp.waarde(`document.querySelectorAll('#oefs .oef').length>0&&document.getElementById('wrap').style.display==='block'`), 15000, 'kaart getekend');
  }
  const check = (wat, ok) => { if (!ok) verslag.fouten.push(wat); };

  // 0. gewone lading: de referentie
  await open(laat);
  const ref = await wachtOp(async () => { const s = await cdp.waarde(NOOR); return s.knoppen.length ? s : null; }, 10000, 'referentieknoppen');
  verslag.scenarios.referentie = { knoppen: ref.knoppen, wachtend: ref.wachtend };
  check('referentie: geen knoppen op de voorbeeldkaart', ref.knoppen.length > 0);

  // 1/2. eerste laden mislukt of verloopt; nieuwe poging via de knop bovenaan lukt
  for (const [naam, eersteManifest] of [['mislukt', breek], ['verlopen', async () => { await slaap(10600); }]]) {
    await open(eersteManifest);
    await slaap(400);
    const na = await cdp.waarde(NOOR);
    check(naam + ': na het mislukken nog knoppen', na.knoppen.length === 0);
    check(naam + ': wachtende regels kloppen niet', JSON.stringify(na.wachtend) === JSON.stringify([...ref.knoppen, ...ref.wachtend].sort((a, b) => a - b)));
    await cdp.tik('#leesBtn');
    const tweede = await wachtOp(() => manifest[1], 5000, naam + ': nieuwe poging');
    const tijdens = await cdp.waarde(NOOR);
    check(naam + ': knop bovenaan niet op Stop tijdens de poging', tijdens.stand === 'true');
    await slaap(800);
    await laat(tweede);
    const hersteld = await wachtOp(async () => { const s = await cdp.waarde(NOOR); return s.knoppen.length ? s : null; }, 5000, naam + ': knoppen hersteld');
    await wachtOp(() => mp3.length > 0, 5000, naam + ': opname gestart');
    await slaap(500);
    const later = await cdp.waarde(NOOR);
    check(naam + ': andere knoppen dan bij een gewone lading', JSON.stringify(hersteld.knoppen) === JSON.stringify(ref.knoppen) && JSON.stringify(hersteld.regels) === JSON.stringify(ref.regels));
    check(naam + ': dubbele knoppen', hersteld.uniek && later.uniek && JSON.stringify(later.knoppen) === JSON.stringify(ref.knoppen));
    check(naam + ': opname loopt niet', later.stand === 'true');
    verslag.scenarios[naam] = { naFalen: { knoppen: na.knoppen, wachtend: na.wachtend }, hersteld: hersteld.knoppen, wachtendNaHerstel: hersteld.wachtend,
      opnameAanvragen: mp3.length, knopBovenaan: later.stand, meldingen: dialogen.slice(), paginafouten: fouten.slice() };
    await cdp.tik('#leesBtn');
    await wachtOp(() => cdp.waarde(`document.getElementById('leesBtn').getAttribute('aria-pressed')==='false'`), 3000, naam + ': stoppen');
  }

  // 3. stoppen tijdens de nieuwe poging
  await open(breek);
  await slaap(400);
  await cdp.tik('#leesBtn');
  const tweede = await wachtOp(() => manifest[1], 5000, 'stop: nieuwe poging');
  await cdp.tik('#leesBtn');
  const gestopt = await cdp.waarde(NOOR);
  check('stop: knop bovenaan niet terug na stoppen', gestopt.stand === 'false');
  const meldingenVoor = dialogen.length;
  await laat(tweede);
  const herstelStop = await wachtOp(async () => { const s = await cdp.waarde(NOOR); return s.knoppen.length ? s : null; }, 5000, 'stop: knoppen hersteld');
  await slaap(1500);
  const naStop = await cdp.waarde(NOOR);
  check('stop: toch geluid na stoppen', mp3.length === 0);
  check('stop: knop bovenaan weer op Stop', naStop.stand === 'false');
  check('stop: melding achteraf', dialogen.length === meldingenVoor);
  check('stop: knoppen niet gelijk aan gewone lading', JSON.stringify(naStop.knoppen) === JSON.stringify(ref.knoppen) && naStop.uniek);
  verslag.scenarios.stopTijdensPoging = { hersteld: herstelStop.knoppen, opnameAanvragen: mp3.length, knopBovenaan: naStop.stand, meldingenNaStop: dialogen.length - meldingenVoor, paginafouten: fouten.slice() };
  // een herstelde knop werkt: tik de eerste en de opname start
  // de stemknop staat bij de oefening zelf: eerst de oefening openen vanuit het overzicht
  await cdp.tik(`#oefs .oef[data-oidx="${ref.knoppen[0]}"] .oefinfo`);
  await wachtOp(() => cdp.waarde(`document.body.classList.contains('sessie')`), 3000, 'oefening open');
  await slaap(300);
  await cdp.tik(`#oefs [data-noor="${ref.knoppen[0]}"]`);
  await wachtOp(() => mp3.length > 0, 5000, 'herstelde knop speelt af');
  verslag.scenarios.stopTijdensPoging.hersteldeKnopSpeelt = true;
  for (const [naam, s] of Object.entries(verslag.scenarios)) if (s.paginafouten && s.paginafouten.length) verslag.fouten.push(naam + ': paginafout ' + s.paginafouten.join(' | '));
} catch (e) {
  verslag.fouten.push(String(e && e.stack || e));
} finally {
  for (const k of kinderen) { try { k.kill('SIGTERM'); } catch {} }
  await slaap(300);
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.rm(profiel, { recursive: true, force: true });
}
verslag.geslaagd = verslag.fouten.length === 0;
console.log(JSON.stringify(verslag, null, 2));
console.log(verslag.geslaagd ? 'Browsercontrole Noor-herstel geslaagd.' : 'Browsercontrole Noor-herstel NIET geslaagd.');
process.exit(verslag.geslaagd ? 0 : 1);
