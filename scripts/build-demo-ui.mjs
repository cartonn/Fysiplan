import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const check = process.argv.includes('--check');
const result = await build({ entryPoints: ['scripts/ui/demo-agent-ui.mjs'], bundle: true, format: 'esm',
  target: 'es2022', minify: true, legalComments: 'eof', write: !check, outfile: 'public/demo-agent-ui.js' });
if (check) assert.equal(result.outputFiles[0].text, await readFile('public/demo-agent-ui.js', 'utf8'), 'Run npm run build:demo-ui and commit the bundle');
