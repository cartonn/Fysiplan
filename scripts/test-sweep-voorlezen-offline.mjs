// Gebruikers-sweep 2026-11-19 10u (Truus, iPhone SE, zonder internet): "Luister naar uitleg" gaf
// "De Noor-opname kon niet worden afgespeeld. Probeer opnieuw of lees de uitleg." Intern jargon en
// geen woord over de verbinding. Nu zegt de kaart zonder internet dat voorlezen weer lukt zodra er
// verbinding is, en heet het online "de voorleesstem". Zonder browser. `npm run test:voorlezenoffline`
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = await readFile("public/noor-audio.js", "utf8");
const clips = [{ name: "Test", text: "Test. Algemene uitleg.", src: "/audio/noor/abc123.mp3" }];
function maak(onLine) {
  const players = [];
  class Audio { constructor() { players.push(this); this.currentTime = 0; } play() { return Promise.resolve(); } pause() {} load() {} removeAttribute() {} }
  const window = {};
  vm.runInNewContext(source, { window, Audio, navigator: { onLine }, setTimeout: () => 1, clearTimeout: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ clips }) }) });
  return { NoorAudio: window.NoorAudio, players };
}
for (const onLine of [false, true]) {
  const { NoorAudio, players } = maak(onLine);
  let fout = "";
  await NoorAudio.play([{ name: "Test", text: "Algemene uitleg." }], () => {}, (s) => { fout = s; });
  players[0].onerror();
  assert.doesNotMatch(fout, /Noor/, "geen intern woord 'Noor' in de melding");
  if (onLine) assert.match(fout, /voorleesstem kon niet worden afgespeeld/, "online: gewone melding");
  else assert.match(fout, /geen internet.*verbinding/i, "offline: melding noemt de verbinding");
}
console.log("voorlezenoffline: ok (zonder internet een melding over de verbinding, nergens 'Noor-opname')");
