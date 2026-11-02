// Wat de server werkelijk uitlevert aan een patiënttelefoon. Twee dingen die je alleen
// zó ziet: (1) een opname die als octet-stream zonder byte-ranges binnenkomt klinkt als
// "de stem werkt niet" terwijl het bestand prima is — iOS Safari opent media met
// Range: bytes=0-1 en haakt af zonder 206 met Content-Length; (2) de sleutels waarmee de
// kaart beoordelingen opzoekt worden gevormd uit het gedraaide manifest, niet uit het
// bestand in de repository. Loopt dat uiteen, dan valt elke controle stil terug op
// "niet beoordeeld" zonder dat iets faalt.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(await fs.readFile('public/audio/noor/manifest.json', 'utf8'));
assert(manifest.clips.length > 0, 'geen opnames om te controleren');
const clip = manifest.clips[0].src;
assert.match(clip, /^\/audio\/noor\/[a-f0-9]{64}\.mp3$/);
const clipBytes = await fs.readFile('public' + clip);

// Een eigen, lege datamap: de test schrijft niets in de werkmap en kan een praktijk-
// video neerzetten zoals een upload dat zou doen. Het patroon maakt elke byte uniek
// genoeg om te zien of een range uit het begin of uit het einde komt.
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fysiplan-levering-'));
const videoBytes = Buffer.alloc(4099);
for (let i = 0; i < videoBytes.length; i++) videoBytes[i] = (i * 31 + (i >> 8)) & 255;
await fs.mkdir(path.join(dataDir, 'uploads', 'videos'), { recursive: true });
await fs.writeFile(path.join(dataDir, 'uploads', 'videos', 'v-rangetest0001.mp4'), videoBytes);

const port = 8700 + (process.pid % 300);
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe']
});
const stop = () => { try { server.kill('SIGTERM'); } catch {} };
process.on('exit', stop);

// Range-verzoeken tegen één URL, met de verwachte bytes uit het bestand op schijf.
// Byte-voor-byte vergelijken, want een kop die "de laatste 500" belooft terwijl de
// inhoud het begin is, is precies de fout die de coördinator vond.
async function rangeSuite(url, bytes, soort) {
  const n = bytes.length;
  const gevallen = [
    ['bytes=0-1', 206, 0, 1],
    ['bytes=10-', 206, 10, n - 1],
    ['bytes=-500', 206, n - 500, n - 1],
    ['bytes=-1', 206, n - 1, n - 1],
    [`bytes=-${n + 50}`, 206, 0, n - 1],
    [`bytes=100-${n + 1000}`, 206, 100, n - 1],
    ['bytes=5-2', 200],
    ['bytes=0-1,5-6', 200],
    ['items=0-1', 200],
    ['bytes=abc', 200],
    [`bytes=${n}-`, 416],
    ['bytes=-0', 416]
  ];
  for (const [kop, status, start, eind] of gevallen) {
    const r = await fetch(url, { headers: { range: kop } });
    const body = Buffer.from(await r.arrayBuffer());
    assert.equal(r.status, status, `${soort} ${kop}: status`);
    if (status === 206) {
      assert.equal(r.headers.get('content-range'), `bytes ${start}-${eind}/${n}`, `${soort} ${kop}: content-range`);
      assert.equal(Number(r.headers.get('content-length')), eind - start + 1, `${soort} ${kop}: content-length`);
      assert.ok(body.equals(bytes.subarray(start, eind + 1)), `${soort} ${kop}: inhoud komt niet van de beloofde plek`);
    } else if (status === 200) {
      assert.equal(r.headers.get('content-range'), null, `${soort} ${kop}: geen content-range bij negeren`);
      assert.ok(body.equals(bytes), `${soort} ${kop}: ongeldige range levert het hele bestand`);
    } else {
      assert.equal(r.headers.get('content-range'), `bytes */${n}`, `${soort} ${kop}: content-range bij 416`);
      assert.match(r.headers.get('cache-control') || '', /no-store/, `${soort} ${kop}: een 416 mag nooit in een cache belanden`);
      assert.equal(body.length, 0, `${soort} ${kop}: 416 heeft geen inhoud`);
    }
    assert.equal(r.headers.get('accept-ranges'), 'bytes', `${soort} ${kop}: accept-ranges`);
  }
  return gevallen.length;
}

async function wacht() {
  for (let poging = 0; poging < 80; poging++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/mobile-narration-review.json`); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('server start niet');
}

try {
  await wacht();
  const url = `http://127.0.0.1:${port}${clip}`;

  const vol = await fetch(url);
  assert.equal(vol.status, 200);
  assert.equal(vol.headers.get('content-type'), 'audio/mpeg', 'geen octet-stream: de telefoon moet weten dat dit audio is');
  assert.equal(vol.headers.get('accept-ranges'), 'bytes', 'zonder accept-ranges weigert iOS Safari af te spelen');
  assert(Number(vol.headers.get('content-length')) > 1000, 'content-length ontbreekt of is onzinnig');
  assert.match(vol.headers.get('cache-control') || '', /max-age=\d+/, 'opnames heten naar hun hash en mogen gecachet worden');

  const deel = await fetch(url, { headers: { range: 'bytes=0-1' } });
  assert.equal(deel.status, 206, 'een Range-verzoek hoort 206 terug te krijgen');
  assert.equal(deel.headers.get('content-length'), '2');
  assert.match(deel.headers.get('content-range') || '', /^bytes 0-1\/\d+$/);
  assert.equal((await deel.arrayBuffer()).byteLength, 2);

  const open = await fetch(url, { headers: { range: 'bytes=10-' } });
  assert.equal(open.status, 206);
  assert.equal(Number(open.headers.get('content-length')), Number(vol.headers.get('content-length')) - 10);

  const buiten = await fetch(url, { headers: { range: 'bytes=99999999-' } });
  assert.equal(buiten.status, 416);
  assert.match(buiten.headers.get('content-range') || '', /^bytes \*\/\d+$/);

  // de volledige reeks, byte voor byte, voor de stemopname én voor een praktijkvideo
  const audioGevallen = await rangeSuite(url, clipBytes, 'stemopname');
  const videoUrl = `http://127.0.0.1:${port}/uploads/videos/v-rangetest0001.mp4`;
  const videoVol = await fetch(videoUrl);
  assert.equal(videoVol.status, 200);
  assert.equal(videoVol.headers.get('content-type'), 'video/mp4');
  assert.ok(Buffer.from(await videoVol.arrayBuffer()).equals(videoBytes), 'praktijkvideo komt ongeschonden aan');
  const videoGevallen = await rangeSuite(videoUrl, videoBytes, 'praktijkvideo');

  // HEAD op een stemopname: koppen zonder inhoud, ook bij een suffix
  const kop = await fetch(url, { method: 'HEAD', headers: { range: 'bytes=-500' } });
  assert.equal(kop.status, 206);
  assert.equal(kop.headers.get('content-range'), `bytes ${clipBytes.length - 500}-${clipBytes.length - 1}/${clipBytes.length}`);

  // De beoordelingsbestanden mogen juist nooit blijven hangen: een nieuwe houd moet
  // meteen gelden en mag niet uit een proxycache komen.
  for (const pad of ['/mobile-media-review.json', '/mobile-narration-review.json', '/audio/noor/manifest.json']) {
    const r = await fetch(`http://127.0.0.1:${port}${pad}`);
    assert.equal(r.status, 200, pad);
    assert.match(r.headers.get('cache-control') || '', /no-store/, pad + ' moet altijd vers zijn');
  }

  // Beide beoordelingsbestanden horen bij dezelfde generatie; de kaart weigert ze anders.
  const media = await (await fetch(`http://127.0.0.1:${port}/mobile-media-review.json`)).json();
  const narration = await (await fetch(`http://127.0.0.1:${port}/mobile-narration-review.json`)).json();
  assert.equal(media.reviewDate, narration.reviewDate, 'beoordelingsbestanden uit verschillende generaties');

  // De kaart zoekt een beoordeling op met exerciseId + bronpad, gevormd uit het
  // manifest dat de server draait. Die sleutels moeten exact die van de beoordeling zijn.
  const lib = await (await fetch(`http://127.0.0.1:${port}/v2/oefeningen.json`)).json();
  const review = await (await fetch(`http://127.0.0.1:${port}/mobile-media-review.json`)).json();
  const sleutel = o => String(o.exerciseId || '') + '|' + String(o.kaartImg || o.img || '').replace(/^\/+/, '').replace(/^v2\//, '');
  const beoordeeld = new Set(review.entries.map(e => e.exerciseId + '|' + e.source));
  const zonder = lib.filter(o => !beoordeeld.has(sleutel(o))).map(o => o.naam);
  assert.deepEqual(zonder, [], 'gedraaide oefeningen zonder beoordelingsregel vallen stil terug op onbeoordeeld');
  const metHouding = new Set(review.entries.filter(e => e.poseGeometry.status === 'geometry-approved').map(e => e.exerciseId + '|' + e.source));
  const actief = lib.filter(o => metHouding.has(sleutel(o)));
  assert.equal(actief.length, review.summary.poseGeometryApproved, 'niet elke goedgekeurde uitsnede bereikt de kaart');

  // De voorbeeldkaart is de enige kaart die zonder database bestaat: hier kan een
  // patiëntlink end-to-end worden nagelopen.
  const kaart = await (await fetch(`http://127.0.0.1:${port}/api/kaart?id=demo`)).json();
  assert.equal(kaart.ok, true, 'de voorbeeldkaart laadt niet');
  const namen = (kaart.kaart.chosen || []).map(x => x.n);
  assert(namen.length > 0, 'de voorbeeldkaart heeft geen oefeningen');
  const perNaam = new Map(lib.map(o => [o.naam, o]));
  for (const naam of namen) {
    const o = perNaam.get(naam);
    assert(o, 'oefening van de kaart ontbreekt in de bibliotheek: ' + naam);
    const regel = review.entries.find(e => e.exerciseId + '|' + e.source === sleutel(o));
    assert(regel, 'geen beoordelingsregel voor ' + naam);
    assert.equal(regel.clinicalApproved, false, naam);
    if (regel.poseGeometry.status === 'geometry-approved') {
      assert.equal(regel.poses.length, 2, naam);
      const beeld = await fetch(`http://127.0.0.1:${port}/${regel.source}`);
      assert.equal(beeld.status, 200, 'de bron van een goedgekeurde uitsnede moet bereikbaar zijn: ' + naam);
      const bytes = Buffer.from(await beeld.arrayBuffer());
      const sha = createHash('sha256').update(bytes).digest('hex');
      assert.equal(sha, regel.assetSha256, 'de uitgeleverde bron wijkt af van de beoordeelde bron: ' + naam);
      for (const p of regel.poses) {
        assert(p.crop.x + p.crop.w <= regel.width && p.crop.y + p.crop.h <= regel.height, naam);
      }
    }
  }
  console.log('Mobiele levering: audio/mpeg; ' + audioGevallen + ' range-gevallen op een stemopname en ' + videoGevallen +
    ' op een praktijkvideo byte voor byte juist (suffix, open, afgekapt, ongeldig, meervoudig, 416 zonder cache); cachebeleid, ' +
    'gelijke beoordelingsgeneratie, ' + lib.length + ' sleutels sluitend, ' + actief.length + ' actieve uitsnedes, voorbeeldkaart (' +
    namen.join(', ') + ') hash-gecontroleerd.');
} finally {
  stop();
  await fs.rm(dataDir, { recursive: true, force: true });
}
