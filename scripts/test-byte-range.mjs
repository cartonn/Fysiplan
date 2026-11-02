// Tabel van Range-verzoeken met de uitkomst die RFC 9110 §14 voorschrijft.
// De coördinator vond dat "bytes=-500" als "bytes 0-500" werd uitgeleverd; deze tabel
// legt elke vorm vast zodat dat niet terugkomt.
import assert from 'node:assert/strict';
import { byteRange } from '../lib/byte-range.js';

const S = 1000;
const gevallen = [
  // geen of lege kop: hele bestand
  [undefined, S, { status: 200 }, 'geen Range-kop'],
  ['', S, { status: 200 }, 'lege Range-kop'],
  ['   ', S, { status: 200 }, 'alleen spaties'],

  // gewone ranges
  ['bytes=0-1', S, { status: 206, start: 0, end: 1 }, 'iOS-proef bytes=0-1'],
  ['bytes=0-0', S, { status: 206, start: 0, end: 0 }, 'één byte'],
  ['bytes=10-19', S, { status: 206, start: 10, end: 19 }, 'middenstuk'],
  ['bytes=999-999', S, { status: 206, start: 999, end: 999 }, 'laatste byte'],
  ['bytes=500-5000', S, { status: 206, start: 500, end: 999 }, 'einde voorbij het bestand wordt afgekapt'],
  ['bytes=0-99999999999999999999', S, { status: 206, start: 0, end: 999 }, 'absurd grote eindpositie'],

  // open ranges
  ['bytes=10-', S, { status: 206, start: 10, end: 999 }, 'open range'],
  ['bytes=0-', S, { status: 206, start: 0, end: 999 }, 'open range vanaf het begin'],
  ['bytes=999-', S, { status: 206, start: 999, end: 999 }, 'open range op de laatste byte'],

  // suffix: de LAATSTE n bytes, niet de eerste
  ['bytes=-500', S, { status: 206, start: 500, end: 999 }, 'suffix 500: de laatste 500 bytes'],
  ['bytes=-1', S, { status: 206, start: 999, end: 999 }, 'suffix 1: alleen de laatste byte'],
  ['bytes=-1000', S, { status: 206, start: 0, end: 999 }, 'suffix precies de bestandsgrootte'],
  ['bytes=-5000', S, { status: 206, start: 0, end: 999 }, 'suffix langer dan het bestand: alles'],
  ['bytes=-99999999999999999999', S, { status: 206, start: 0, end: 999 }, 'absurd grote suffix'],

  // geldig maar onvervulbaar: 416
  ['bytes=1000-', S, { status: 416 }, 'begin precies op de bestandsgrootte'],
  ['bytes=1000-1001', S, { status: 416 }, 'begin voorbij het einde'],
  ['bytes=99999999999999999999-', S, { status: 416 }, 'absurd groot begin'],
  ['bytes=-0', S, { status: 416 }, 'suffix van nul bytes'],
  ['bytes=0-1', 0, { status: 416 }, 'leeg bestand: niets te leveren'],
  ['bytes=-5', 0, { status: 416 }, 'leeg bestand met suffix'],

  // ongeldig of niet ondersteund: Range negeren, hele bestand (200)
  ['bytes=5-2', S, { status: 200 }, 'laatste vóór eerste is ongeldig, niet onvervulbaar (RFC 9110 §14.1.1)'],
  ['bytes=-', S, { status: 200 }, 'geen enkel getal'],
  ['bytes=abc', S, { status: 200 }, 'onzin'],
  ['bytes=1-2-3', S, { status: 200 }, 'te veel streepjes'],
  ['bytes=0-1,5-6', S, { status: 200 }, 'meerdere ranges: geen multipart, dus negeren'],
  ['bytes=0-1, -5', S, { status: 200 }, 'meerdere ranges met suffix'],
  ['items=0-1', S, { status: 200 }, 'andere eenheid'],
  ['0-1', S, { status: 200 }, 'eenheid ontbreekt'],
  ['bytes 0-1', S, { status: 200 }, 'geen isgelijkteken'],
  ['bytes=+1-2', S, { status: 200 }, 'plusteken'],
  ['bytes=1.5-2', S, { status: 200 }, 'decimaal'],

  // tolerant op hoofdletters en witruimte rond het getallenpaar
  ['BYTES=0-1', S, { status: 206, start: 0, end: 1 }, 'eenheid is hoofdletterongevoelig'],
  [' bytes=0-1 ', S, { status: 206, start: 0, end: 1 }, 'witruimte rond de kop']
];

for (const [kop, grootte, verwacht, uitleg] of gevallen) {
  assert.deepEqual(byteRange(kop, grootte), verwacht, `${uitleg} (${JSON.stringify(kop)}, ${grootte})`);
}

// eigenschappen die voor elke geldige 206 moeten gelden
for (let grootte = 1; grootte < 60; grootte++) {
  for (const kop of [`bytes=-${grootte}`, `bytes=-${grootte + 7}`, `bytes=${grootte - 1}-`, 'bytes=0-', `bytes=-${Math.ceil(grootte / 2)}`]) {
    const r = byteRange(kop, grootte);
    assert.equal(r.status, 206, kop + ' / ' + grootte);
    assert.ok(r.start >= 0 && r.end <= grootte - 1 && r.start <= r.end, kop + ' / ' + grootte);
  }
  const suffix = byteRange(`bytes=-${Math.ceil(grootte / 2)}`, grootte);
  assert.equal(suffix.end, grootte - 1, 'een suffix eindigt altijd op de laatste byte');
  assert.equal(suffix.end - suffix.start + 1, Math.ceil(grootte / 2), 'een suffix levert precies het gevraagde aantal bytes');
}

console.log(`Byte-ranges: ${gevallen.length} gevallen volgens RFC 9110 (suffix, open, afgekapt, onvervulbaar, ongeldig, meervoudig).`);
