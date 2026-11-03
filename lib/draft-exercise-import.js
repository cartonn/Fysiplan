import { readFile, mkdir, writeFile, rename, readdir, realpath, mkdtemp, rm, rmdir, lstat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const roles = ['line', 'start', 'end'];
// Explicit private packaging candidates only. Neutral start reuse for neck rotation
// never clears the separate chin-retraction hold. This is not clinical approval.
const eligible = new Set(['fc_07a47f244d7392e6', 'fc_853c97009144ec09']);
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
  const verifiedBytes = {};
  const bundleRoot = await realpath(dirname(bundlePath));
  for (const role of roles) {
    const a = b.assets[role];
    const source = resolve(dirname(bundlePath), a.relativePath);
    need(source.startsWith(resolve(dirname(bundlePath)) + '/'), 'Asset traversal');
    const realSource = await realpath(source);
    need(realSource.startsWith(bundleRoot + '/'), 'Asset symlink escapes bundle root');
    const bytes = await readFile(realSource);
    png(bytes, a);
    verifiedBytes[role] = bytes;
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
  // Stage the already-verified bytes, validate the complete draft, then rename
  // atomically. Failure never exposes or leaves a partially imported final ID.
  // A per-ID exclusive lock prevents competing imports from replacing a target.
  await mkdir(draftRoot, { recursive: true });
  const lock = target + '.import-lock';
  await mkdir(lock);
  let staging;
  try {
    try { await lstat(target); throw new Error('Existing draft target; refusing overwrite'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    staging = await mkdtemp(join(draftRoot, '.import-'));
    const stagedTarget = join(staging, b.coreExerciseId);
    await mkdir(stagedTarget);
    for (const role of roles) await writeFile(join(stagedTarget, assets[role].file), verifiedBytes[role], { flag: 'wx' });
    await writeFile(join(stagedTarget, 'draft.json'), JSON.stringify(draft, null, 2) + '\n', { flag: 'wx' });
    await loadDraft({ draftRoot: staging, id: b.coreExerciseId, catalogue: JSON.parse(before) });
    need(sha(await readFile(cataloguePath)) === sha(before), 'Catalogue changed during import');
    await rename(stagedTarget, target);
    return { status: 'imported-unpublished', id: b.coreExerciseId };
  } finally {
    try { if (staging) await rm(staging, { recursive: true, force: true }); }
    finally { await rmdir(lock); }
  }
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
  let motion;
  try { motion = await json(join(draftRoot, id, 'motion.json')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (motion) {
    need(motion.coreExerciseId === id && motion.file === 'motion.mp4', 'Invalid private motion source');
    need(motion.published === false && motion.clinicalApproval === false && motion.qaStatus === 'pending-independent-review', 'Motion must remain a pending private candidate');
    need(motion.audio === false && motion.fit === 'contain', 'Motion presentation mismatch');
    for (const role of ['start','end']) need(motion.referenceSha256[role] === d.assets[role].sha256, 'Motion reference mismatch');
    const bytes = await readFile(join(draftRoot, id, motion.file));
    need(bytes.length === motion.bytes && sha(bytes) === motion.sha256 && bytes.subarray(4,8).toString() === 'ftyp', 'Motion hash/size/format mismatch');
  }
  let narration;
  try { narration = await json(join(draftRoot, id, 'narration.json')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (narration) {
    need(narration.coreExerciseId === id && narration.file === 'narration.mp3', 'Invalid private narration source');
    need(narration.published === false && narration.clinicalApproval === false && narration.qaStatus === 'pending-independent-review', 'Narration must remain a pending private candidate');
    need(narration.voiceId === 'ea8f12713f7644ea9ad4ed710901fbbb' && narration.language === 'nl', 'Narration voice/language mismatch');
    need(narration.explanationSha256 === sha(Buffer.from(d.explanation)), 'Narration explanation changed');
    need(narration.textSha256 === sha(Buffer.from(d.originalRecord.naam + '. ' + d.explanation)), 'Narration spoken text changed');
    const bytes = await readFile(join(draftRoot, id, narration.file));
    need(bytes.length === narration.bytes && sha(bytes) === narration.sha256, 'Narration hash/size mismatch');
  }
  return {...d, ...(motion ? {motionCandidate:motion} : {}), ...(narration ? {narrationCandidate:narration} : {})};
}
export async function listDrafts({ draftRoot, catalogue }) {
  let dirs;
  try { dirs = await readdir(draftRoot); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const id of dirs.filter(id => eligible.has(id))) out.push(await loadDraft({ draftRoot, id, catalogue }));
  return out;
}
