// Legal 2026-11-18 21u, verwerkersovereenkomst (b) tegen de code (d).
// Art. 10 van de verwerkersovereenkomst en /privacy#einde zeiden zonder uitzondering: "word je na de
// proef geen klant, dan wissen we alles". Sinds #352 is er één uitzondering in de code: een bestaande
// praktijk die V2 als pilot probeert (V2_BESTAANDE_PILOT). Na de pilot wist de server alleen de
// proefaanmelding; account en kaarten blijven. Deze test zet het gedrag en de tekst naast elkaar,
// en controleert dat art. 5 noemt dat een video uit de galerij zonder plek en toestel wordt bewaard (#359).
// Faalt zonder de fix. Zonder browser. `npm run test:proef`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wacht } from "node:timers/promises";

const dir = await mkdtemp(join(tmpdir(), "vwo-pilot-"));
const schrijf = (n, v) => writeFile(join(dir, n + ".json"), JSON.stringify(v));
const lees = async (n) => JSON.parse(await readFile(join(dir, n + ".json"), "utf8"));
const pk = "pilotpraktijk", id = "pilotproef", gemaakt = Date.now() - 200 * 86400000;
const verloopt = Date.now() - 35 * 86400000;
const account = { naam: "Pilotpraktijk", hash: "scrypt$00$00", gemaakt };
const kaarten = { k1: { naam: "Test", id: "000000000001", ts: Date.now(), oefeningen: [] } };
const tekst = (html) => html.replace(/<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&oacute;/g, "ó").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");

const vrij = createServer(); await new Promise((r) => vrij.listen(0, "127.0.0.1", r));
const port = vrij.address().port; await new Promise((r) => vrij.close(r));
const url = "http://127.0.0.1:" + port;
await schrijf("praktijk-accounts", { [pk]: account });
await schrijf("kaarten", { [pk]: kaarten });
await schrijf("proef-aanmeldingen", { [id]: { id, gestart: verloopt - 14 * 86400000, verloopt, praktijk: "Pilotpraktijk", tokens: [] } });
const app = spawn(process.execPath, ["server.js"], {
  env: { PATH: process.env.PATH, HOME: dir, DATA_DIR: dir, PORT: String(port), HOST: "127.0.0.1",
    V2_BESTAANDE_PILOT: JSON.stringify({ pk, id, gemaakt, verloopt }) },
  stdio: "ignore",
});
const exit = new Promise((r) => app.once("exit", r));
try {
  for (let i = 0; i < 150; i++) { if (await fetch(url + "/health").then((r) => r.ok, () => false)) break; await wacht(100); }
  // gedrag: na de pilot gaat alleen de proefaanmelding weg
  for (let i = 0; i < 100 && (await lees("proef-aanmeldingen"))[id]; i++) await wacht(100);
  assert.ok(!(await lees("proef-aanmeldingen"))[id], "proefaanmelding van de pilot is gewist");
  assert.deepEqual((await lees("praktijk-accounts"))[pk], account, "account van de pilotpraktijk blijft");
  assert.deepEqual((await lees("kaarten"))[pk], kaarten, "kaarten van de pilotpraktijk blijven");
  // tekst: verwerkersovereenkomst en privacyverklaring zeggen dat ook
  const vwo = tekst(await (await fetch(url + "/verwerkersovereenkomst")).text());
  assert.match(vwo, /als pilot, dan wist het einde van de pilot alleen de proefaanmelding/, "VWO art. 10 noemt de pilot");
  assert.match(vwo, /in de pilot maakte, blijven/, "VWO art. 10: bestaande gegevens blijven");
  assert.match(vwo, /uit de galerij van een telefoon kiest, bewaart Fysiplan zonder de plek van opnemen/, "VWO art. 5 noemt #359");
  const pv = tekst(await (await fetch(url + "/privacy")).text());
  assert.match(pv, /als pilot, dan wissen we na de pilot alleen je proefaanmelding/, "/privacy#einde noemt de pilot");
  const av = tekst(await (await fetch(url + "/voorwaarden")).text());
  assert.match(av, /als pilot, dan wissen we alleen je proefaanmelding; je bestaande gegevens blijven/, "AV art. 3 noemt de pilot");
  console.log("OK: pilot wist alleen de proefaanmelding, en VWO art. 10 en /privacy#einde zeggen dat.");
} finally {
  app.kill(); await exit; await rm(dir, { recursive: true, force: true });
}
