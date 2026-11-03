import { resolve } from 'node:path';
import { importDraft } from '../lib/draft-exercise-import.js';
if (process.argv.length !== 3) throw new Error('Usage: node scripts/import-exercise-draft.mjs /absolute/path/candidate.json');
console.log(JSON.stringify(await importDraft({ bundlePath: resolve(process.argv[2]), cataloguePath: resolve('public/oefeningen-v2.json'), draftRoot: resolve('content/private-exercise-drafts') }), null, 2));
