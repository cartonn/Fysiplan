// Een opname die de server verkeerd uitlevert klinkt als "de stem werkt niet", terwijl
// het bestand gewoon goed is. iOS Safari opent een mediabestand met Range: bytes=0-1 en
// speelt niets af als het antwoord geen 206 met Content-Length is. Deze test start de
// echte server en controleert de koppen die daarvoor nodig zijn.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const manifest = JSON.parse(await fs.readFile('public/audio/noor/manifest.json', 'utf8'));
assert(manifest.clips.length > 0, 'geen opnames om te controleren');
const clip = manifest.clips[0].src;
assert.match(clip, /^\/audio\/noor\/[a-f0-9]{64}\.mp3$/);

const port = 8700 + (process.pid % 300);
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
});
const stop = () => { try { server.kill('SIGTERM'); } catch {} };
process.on('exit', stop);

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

  console.log('Mobiele audio-levering: audio/mpeg, byte-ranges, 206/416, cachebeleid en gelijke beoordelingsgeneratie in orde.');
} finally {
  stop();
}
