// Uitwijklink onder een ingesloten YouTube-video (patiëntkaart en videovoorbeeld in beheer).
// De ingesloten speler kan "configuratiefout" melden omdat YouTube een Referer verwacht en
// deze site bewust referrer-policy same-origin stuurt. Die policy blijft; de link herstelt
// de speler niet. Deze test bewaakt: policy ongewijzigd (ook live), link alleen bij een
// gevalideerd YouTube-id, exact https://www.youtube.com/watch?v=ID, nieuw tabblad zonder
// referrer, geen kaartgegevens in de link, geen link bij andere bronnen, speler en
// bronvolgorde ongewijzigd.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';

const kaart = await fs.readFile('public/kaart.html', 'utf8');
const beheer = await fs.readFile('public/index.html', 'utf8');
const server = await fs.readFile('server.js', 'utf8');
const tussen = (bron, a, b) => { const i = bron.indexOf(a); assert.ok(i >= 0, a); const j = bron.indexOf(b, i); assert.ok(j > i, b); return bron.slice(i, j); };
const regel = (bron, re) => { const m = bron.match(re); assert.ok(m, String(re)); return m[0]; };
const ID = 'Ab3_-xY9zQ1';
const KIJK = 'https://www.youtube.com/watch?v=' + ID;
const KAART_ID = 'k7Qe9TzUvW2xYa'; // nep-kaarttoegang; mag nergens in een link belanden

// ---------- 1. referrer-policy ongewijzigd ----------
const policies = [...server.matchAll(/"referrer-policy":\s*"([^"]*)"/g)].map((m) => m[1]);
assert.deepEqual(policies, ['same-origin', 'same-origin', 'same-origin', 'same-origin'], 'server.js: viermaal same-origin, niets anders');
assert.ok(!/referrerpolicy/i.test(kaart) && !/referrerpolicy/i.test(beheer), 'geen referrerpolicy-attribuut op iframe of link');
assert.ok(!/<meta[^>]+name=["']?referrer/i.test(kaart) && !/<meta[^>]+name=["']?referrer/i.test(beheer), 'geen referrer-meta');
{
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fysiplan-yt-'));
  const port = 9100 + (process.pid % 300);
  const proc = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let klaar = false;
    for (let i = 0; i < 80 && !klaar; i++) {
      try { klaar = (await fetch(`http://127.0.0.1:${port}/mobile-narration-review.json`)).ok; } catch {}
      if (!klaar) await new Promise((r) => setTimeout(r, 150));
    }
    assert.ok(klaar, 'server start niet');
    for (const pad of ['/', '/k/demo', '/kaart.html', '/v2/oefeningen.json']) {
      const r = await fetch(`http://127.0.0.1:${port}${pad}`);
      assert.equal(r.headers.get('referrer-policy'), 'same-origin', pad + ': referrer-policy live ongewijzigd');
    }
  } finally {
    proc.kill('SIGTERM');
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

// ---------- 2. patiëntkaart: de echte klikafhandeling ----------
const T = vm.runInNewContext(tussen(kaart, '  var T={', '  var SPRAAK=') + ';T');
function kaartKlik(taal, dataset) {
  let handler = null;
  const houder = { innerHTML: '', classList: { contains: () => false, add() {}, remove() {} }, scrollIntoView() {} };
  const b = { dataset, setAttribute() {}, closest: (sel) => (sel === '.oef' ? { querySelector: () => houder } : null) };
  const ctx = vm.createContext({
    TAAL: taal, setTimeout: () => 0, stopLezen() {}, location: { pathname: '/k/' + KAART_ID, href: 'https://fysiplan.example/k/' + KAART_ID },
    window: {}, document: { getElementById: (id) => (id === 'oefs' ? { addEventListener: (t, fn) => { handler = fn; } } : null), querySelectorAll: () => [] },
  });
  vm.runInContext(regel(kaart, /  function esc\(s\)\{[^\n]*\n/) + tussen(kaart, '  var T={', '  var SPRAAK=') +
    regel(kaart, /  var VIDEO_TEKST_ALG=[^\n]*\n/) + regel(kaart, /  var VIDEO_BRON_PRAKTIJK=[^\n]*\n/) + regel(kaart, /  var VIDEO_TEKST_LABEL=[^\n]*\n/) +
    regel(kaart, /  function tr\(k\)\{[^\n]*\n/) + regel(kaart, /  function ytKijkUrl\(id\)\{[^\n]*\n/) +
    tussen(kaart, "    document.getElementById('oefs').addEventListener('click',", "    document.getElementById('mschaal')"), ctx);
  assert.equal(typeof handler, 'function');
  handler({ target: { closest: (sel) => (sel === '.vbtn' ? b : null) } });
  return houder.innerHTML;
}
const linksIn = (html) => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
{
  const html = kaartKlik('en', { yt: ID, vbron: 'bibliotheek', vtekst: 'Tekst' });
  // speler exact zoals voorheen
  assert.ok(html.startsWith('<iframe src="https://www.youtube-nocookie.com/embed/' + ID + '?autoplay=1&rel=0&modestbranding=1" title="Video instructions" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>'), 'ingesloten speler ongewijzigd en eerst');
  const links = linksIn(html);
  assert.equal(links.length, 1, 'precies één uitwijklink');
  assert.equal(links[0], '<a class="ytextern" href="' + KIJK + '" target="_blank" rel="noopener noreferrer">Open this video on YouTube (external website)</a>');
  assert.ok(html.indexOf('</iframe>') < html.indexOf('<a class="ytextern"'), 'link onder de speler');
  const url = new URL(links[0].match(/href="([^"]*)"/)[1]);
  assert.equal(url.origin, 'https://www.youtube.com');assert.equal(url.pathname, '/watch');
  assert.deepEqual([...url.searchParams.keys()], ['v'], 'alleen het video-id, geen andere parameters');
  assert.ok(!links[0].includes(KAART_ID) && !links[0].includes('/k/'), 'geen kaartgegevens in de link');
  // praktijklink van de therapeut ("yt:" op de kaart) gebruikt dezelfde tak
  assert.equal(linksIn(kaartKlik('nl', { yt: ID, vbron: 'praktijk' }))[0], '<a class="ytextern" href="' + KIJK + '" target="_blank" rel="noopener noreferrer">Open deze video op YouTube (externe website)</a>');
}
// elke taal zegt dat de link YouTube opent
for (const taal of ['nl', 'en', 'de', 'fr', 'es', 'pl', 'tr', 'ar', 'uk']) {
  assert.ok(typeof T[taal].ytOpen === 'string' && T[taal].ytOpen.includes('YouTube'), taal);
  assert.ok(linksIn(kaartKlik(taal, { yt: ID }))[0].includes('>' + T[taal].ytOpen.replace(/'/g, '&#39;') + '</a>'), taal);
}
// ongeldige id's: geen link (de speler-tak zelf is niet aangepast)
for (const fout of ['', 'abc', ID + 'X', 'yt:' + ID, 'x" onmouseover="alert(1)', '"><script>x</script>', 'https://youtu.be/' + ID]) {
  assert.deepEqual(linksIn(kaartKlik('en', { yt: fout })), [], 'geen link bij id ' + JSON.stringify(fout));
}
// andere bronnen: geen YouTube-link
assert.deepEqual(linksIn(kaartKlik('en', { eigen: '/uploads/videos/v-abc123.mp4', vbron: 'praktijk' })), [], 'eigen video');
assert.deepEqual(linksIn(kaartKlik('en', { stream: 'https://customer-abc123.cloudflarestream.com/0123abcd/iframe', vbron: 'bibliotheek' })), [], 'Stream-video');
assert.ok(!/youtube\.com\/watch/.test(kaartKlik('en', { stream: 'https://iframe.videodelivery.net/0123abcd/iframe' })), 'Stream-video');
// geen automatische externe navigatie en bronvolgorde ongewijzigd
const ytTak = tussen(kaart, '      }else if(b.dataset.yt){', '      }else if(/^https:');
assert.ok(!/window\.open|location\s*=|location\.href\s*=|\.click\(\)/.test(ytTak), 'geen automatische navigatie');
assert.ok(kaart.includes("var yt=persoonlijkYt||(!eigen&&!praktijkStream&&!catKlaar&&o&&o.video&&o.video.yt)||null;"), 'bronvolgorde ongewijzigd');
assert.ok(kaart.includes("var catKlaar=!eigen&&!praktijkStream&&!persoonlijkYt&&o&&o.video&&o.video.catalog&&o.video.catalog.iframe&&o.video.catalog.clinicallyReviewed===true;"));

// ---------- 3. beheer: het echte videovoorbeeld ----------
function voorbeeld(video) {
  const box = { innerHTML: '' };
  const ctx = vm.createContext({ document: { getElementById: (id) => (id === 'vup_preview' ? box : { style: {} }) } });
  vm.runInContext(regel(beheer, /  function esc\(s\)\{[^\n]*\n/) + tussen(beheer, '  function renderVideoPreview(o){', '  function kiesVideoFile('), ctx);
  ctx.renderVideoPreview({ naam: 'Step up tempo', video });
  return box.innerHTML;
}
{
  const html = voorbeeld({ yt: ID });
  assert.ok(html.startsWith("<iframe src='https://www.youtube-nocookie.com/embed/" + ID + "' title='Instructievideo' allowfullscreen></iframe><div class='video-caption'>YouTube-video · te vervangen door een eigen avatarvideo</div>"), 'beheer: speler en bijschrift ongewijzigd');
  assert.deepEqual(linksIn(html), ["<a class='ytextern' href='" + KIJK + "' target='_blank' rel='noopener noreferrer'>Open deze video op YouTube (externe website)</a>"]);
  for (const fout of ['abc', ID + '1', "x' onclick='y", 'yt:' + ID]) assert.deepEqual(linksIn(voorbeeld({ yt: fout })), [], 'beheer: geen link bij ' + fout);
  for (const v of [{ eigen: 'uploads/videos/v-abc.mp4' }, { stream: { iframe: 'https://iframe.videodelivery.net/abc/iframe' } }, { catalog: { iframe: 'https://iframe.videodelivery.net/def/iframe' } }, null]) {
    assert.ok(!/youtube\.com\/watch/.test(voorbeeld(v)), 'beheer: geen YouTube-link bij ' + JSON.stringify(v));
  }
  // eigen video gaat in het voorbeeld nog steeds vóór een YouTube-link
  assert.ok(!/youtube/.test(voorbeeld({ eigen: 'uploads/videos/v-abc.mp4', yt: ID })), 'beheer: bronvolgorde ongewijzigd');
}
console.log('YouTube-uitwijklink: referrer-policy same-origin ongewijzigd (statisch en live op /, /k/demo, /kaart.html, /v2/oefeningen.json); link alleen bij een gevalideerd id, exact youtube.com/watch?v=ID, nieuw tabblad zonder referrer, geen kaartgegevens, negen talen; speler, bronvolgorde en andere bronnen ongewijzigd; geen automatische navigatie. Herstelt de ingesloten speler niet.');
