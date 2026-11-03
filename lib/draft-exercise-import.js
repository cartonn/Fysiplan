import { readFile, mkdir, writeFile, copyFile, rename, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const roles = ['line', 'start', 'end'];
// Only this reviewed packaging candidate is eligible. This is not clinical approval.
const eligible = new Set(['fc_07a47f244d7392e6']);
const sha = b => createHash('sha256').update(b).digest('hex');
function need(value, message) { if (!value) throw new Error(message); }
const json = async p => JSON.parse(await readFile(p, 'utf8'));
function flags(b) {
  for (const k of ['published', 'publishable', 'apply', 'clinicalApproval']) need(b[k] === false, `Draft flag required: ${k}=false`);
  need(b.audio === null && b.video === null, 'Only labelled still images supported');
}
function png(bytes, a) {
  need(bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a', 'PNG required');
  need(bytes.length === a.bytes && sha(bytes) === a.sha256, 'Asset hash/size mismatch');
  need(bytes.readUInt32BE(16) === a.width && bytes.readUInt32BE(20) === a.height, 'Asset dimension mismatch');
  need(a.width === 1024 && a.height === 1536, 'Expected identical 1024x1536 canvases');
}
function checkRecord(b, catalogue) {
  need(eligible.has(b.coreExerciseId), 'Candidate is not eligible for draft import');
  const matches = catalogue.filter(r => r.coreExerciseId === b.coreExerciseId);
  need(matches.length === 1, 'Expected one existing catalogue record');
  need(isDeepStrictEqual(matches[0], b.originalRecord), 'Source record changed; review before importing');
  need(b.explanation === matches[0].uitleg && b.proposedCategory === matches[0].groep, 'Explanation/category changed');
}
export async function importDraft({ bundlePath, cataloguePath, draftRoot }) {
  const b = await json(bundlePath);
  need(b.schema === 'fysiplan-unpublished-import-candidate-v1', 'Unknown candidate schema');
  flags(b);
  const before = await readFile(cataloguePath);
  checkRecord(b, JSON.parse(before));
  need(b.presentation?.fit === 'contain' && b.presentation?.objectPosition === '50% 50%' && b.presentation?.crop === false && b.presentation?.perFrameZoom === false, 'Unsafe frame layout');
  const assets = {};
  for (const role of roles) {
    const a = b.assets[role];
    const source = resolve(dirname(bundlePath), a.relativePath);
    need(source.startsWith(resolve(dirname(bundlePath)) + '/'), 'Asset traversal');
    const bytes = await readFile(source);
    png(bytes, a);
    assets[role] = { file: `${role}.png`, sha256: a.sha256, bytes: a.bytes, width: a.width, height: a.height, label: a.label, type: 'still-image' };
  }
  const draft = { schemaVersion: 1, coreExerciseId: b.coreExerciseId, originalRecord: b.originalRecord, explanation: b.explanation, proposedCategory: b.proposedCategory, published: false, publishable: false, apply: false, clinicalApproval: false, audio: null, video: null, presentation: b.presentation, assets, integrationBlockers: b.integrationBlockers };
  const target = join(draftRoot, b.coreExerciseId);
  try {
    const existing = await json(join(target, 'draft.json'));
    need(isDeepStrictEqual(existing, draft), 'Existing draft differs; refusing overwrite');
    await loadDraft({ draftRoot, id: b.coreExerciseId, catalogue: JSON.parse(before) });
    return { status: 'unchanged', id: b.coreExerciseId };
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  // Exclusive directory creation prevents concurrent replacement. Never touch public catalogue.
  await mkdir(draftRoot, { recursive: true });
  await mkdir(target);
  for (const role of roles) await copyFile(resolve(dirname(bundlePath), b.assets[role].relativePath), join(target, assets[role].file));
  need(sha(await readFile(cataloguePath)) === sha(before), 'Catalogue changed during import');
  await writeFile(join(target, 'draft.json.tmp'), JSON.stringify(draft, null, 2) + '\n', { flag: 'wx' });
  await rename(join(target, 'draft.json.tmp'), join(target, 'draft.json'));
  await loadDraft({ draftRoot, id: b.coreExerciseId, catalogue: JSON.parse(before) });
  return { status: 'imported-unpublished', id: b.coreExerciseId };
}
export async function loadDraft({ draftRoot, id, catalogue }) {
  need(eligible.has(id), 'Unknown draft ID');
  const d = await json(join(draftRoot, id, 'draft.json'));
  need(d.coreExerciseId === id && d.schemaVersion === 1, 'Draft ID/schema mismatch');
  flags(d); checkRecord(d, catalogue);
  for (const role of roles) {
    need(d.assets[role].file === `${role}.png`, 'Unsafe draft asset path');
    png(await readFile(join(draftRoot, id, d.assets[role].file)), d.assets[role]);
  }
  return d;
}
export async function listDrafts({ draftRoot, catalogue }) {
  let dirs;
  try { dirs = await readdir(draftRoot); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const id of dirs.filter(id => eligible.has(id))) out.push(await loadDraft({ draftRoot, id, catalogue }));
  return out;
}
