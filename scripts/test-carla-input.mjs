import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile('public/index.html', 'utf8');
const source = html.slice(html.indexOf('  function printableTextFits('), html.indexOf('  function fittingPrintablePrefix('));
const fits = runInNewContext(source + '; printableTextFits');
// DOM textarea semantics: assigning .value moves the caret to the end.
let value = 'Rustig oefenen';
const el = {
  get value() { return value; },
  set value(v) { value = v; this.selectionStart = this.selectionEnd = v.length; this.selectionDirection = 'none'; },
  selectionStart: 0, selectionEnd: 6, selectionDirection: 'backward', scrollTop: 3, scrollLeft: 2,
  get scrollHeight() { return value.length > 30 ? 100 : 20; }, clientHeight: 40, scrollWidth: 100, clientWidth: 100,
  setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
};
for (const [candidate, expected] of [[value, true], ['Vandaag ' + value, true], ['x'.repeat(100), false]]) {
  assert.equal(fits(el, candidate), expected);
  assert.equal(el.value, 'Rustig oefenen');
  assert.deepEqual([el.selectionStart, el.selectionEnd, el.selectionDirection, el.scrollTop, el.scrollLeft], [0, 6, 'backward', 3, 2]);
}
console.log('OK: printmeting behoudt tekst, selectie, richting en scrollpositie.');
