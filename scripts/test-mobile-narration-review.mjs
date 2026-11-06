import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {exerciseId} from '../lib/exercise-id.js';

const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const review = await read('public/mobile-narration-review.json');
const base = await read('public/oefeningen-v2.json');
const v1 = await read('public/oefeningen.json');
const clips = (await read('public/audio/noor/manifest.json')).clips;
const available = [];
for (const entry of base) {
  try { await fs.access('public/' + (entry.kaartImg || entry.img)); available.push(entry); } catch {}
}
const hash = text => createHash('sha256').update(text).digest('hex');
assert.equal(review.schemaVersion, 1);
assert.equal(review.catalog, 'public/oefeningen-v2.json');
assert.equal(review.hashAlgorithm, 'sha256');
assert.equal(review.unlistedStatus, 'not_assessed_for_clinical_approval');
assert.equal(review.summary.effectiveEntries, available.length);
assert.equal(review.summary.clinicalApproved, 0);
assert.equal(review.holds.length, 15);
assert.equal(review.summary.held, review.holds.length);
assert.equal(new Set(review.holds.map(h => h.exerciseId)).size, review.holds.length);
assert.equal(new Set(review.holds.map(h => h.name)).size, review.holds.length);
for (const hold of review.holds) {
  const entry = available.find(e => exerciseId(e) === hold.exerciseId);
  assert(entry, hold.name);
  assert.equal(hold.name, entry.naam);
  assert.equal(hold.text, entry.uitleg);
  assert.equal(hold.status, 'hold');
  assert.equal(hold.clinicalApproved, false);
  assert.equal(hold.explanationSha256, hash(entry.uitleg));
  assert.equal(hold.narrationSha256, hash(entry.naam + '. ' + entry.uitleg));
  assert(hold.reason && hold.reasonCode && hold.requiredAction, hold.name);
}
const prior = await read('content/beginhouding-pijl.json');
for (const hold of prior.withheld) {
  assert(review.holds.some(h => h.name === hold.naam), 'Existing unresolved hold missing: ' + hold.naam);
}
for (const name of ['Med ball obliques cross', 'Med ball swing', 'Med ball lunge overhead press',
  'Mob back cat/cow', 'Seated band leg curl', 'Standing chair heel/toe']) {
  assert(review.holds.some(h => h.name === name), name);
}
// nieuwe lijntekeningen (content/nieuwe-lijntekeningen.json) horen bij oefeningen die niet in V1 staan
const nieuweLijn = new Set((await read('content/nieuwe-lijntekeningen.json')).lijntekeningen.map(n => n.naam));
assert.equal(available.filter(e => !nieuweLijn.has(e.naam)).filter(e => v1.find(x => x.naam === e.naam)?.uitleg !== e.uitleg).length, 0);
assert.equal(available.filter(e => nieuweLijn.has(e.naam) && v1.some(x => x.naam === e.naam)).length, 0);
// Check every current audio clip, not a fixed 61: later safe generation may add clips.
for (const clip of clips) {
  const entry = available.find(e => e.naam === clip.name);
  assert(entry, clip.name);
  assert.equal(clip.text, entry.naam + '. ' + entry.uitleg, 'Stale audio: ' + clip.name);
  assert(!review.holds.some(h => h.name === clip.name), 'Held narration published: ' + clip.name);
}
assert.equal(review.summary.existingAudioClips, 61, 'Audit baseline');
assert.equal(review.summary.existingAudioExactMatches, 61, 'Audit baseline');
console.log(`PASS: ${available.length} effective V2 entries, 15 source-hashed holds, ${clips.length} exact audio matches; no clinical approval inferred.`);
