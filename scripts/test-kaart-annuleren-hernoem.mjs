// Regressietest gebruikers-sweep 2026-11-10 22u (Mark, desktop en iPad):
// de editor had de kaart van "Els B." open; Mark typte "Piet Z." en tikte "In de praktijk".
// In de vraag "andere patiënt?" stond Annuleren (en dus ook Esc) voor "alleen de naam verbeteren":
// de kaart van Els heette daarna stil "Piet Z." en haar geprinte QR opende die kaart.
// Nu: OK = nieuwe kaart; daarna een tweede vraag, OK = naam verbeteren; Annuleren/Esc = niets.
// Draait zonder browser: saveServerCard wordt uit index.html gehaald en met nep-fetch/confirm gedraaid.
// `npm run test:annulerenhernoem`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/index.html"), "utf8");
const m = html.match(/  function saveServerCard\(naam,cb,keuze\)\{[\s\S]*?\n  \}\n/);
assert.ok(m, "saveServerCard gevonden");

async function draai(antwoorden) {
  const verzoeken = [], vragen = [];
  let klaar;
  const uitkomst = new Promise((r) => { klaar = r; });
  const ctx = {
    serverKaart: (naam) => ({ naam, kaartId: "8b29eda692f7", basisTs: 1 }),
    PJSON: () => ({}),
    KAART_ID: "8b29eda692f7",
    zetKaartId: () => {}, volgNieuweKaart: () => {},
    confirm: (t) => { vragen.push(t); return antwoorden.shift() ?? false; },
    fetch: async (_url, opt) => {
      const body = JSON.parse(opt.body);
      verzoeken.push(body);
      const antwoord = body.hernoem ? { ok: true, id: "8b29eda692f7", ts: 2 }
        : body.kaartId === "" ? { ok: true, id: "nieuw0000001", ts: 3 }
        : { ok: false, hernoemVraag: true, naam: "Els B." };
      return { json: async () => antwoord };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(m[0] + "\nthis.saveServerCard=saveServerCard;", ctx);
  ctx.saveServerCard("Piet Z.", (d) => klaar(d));
  const d = await Promise.race([uitkomst, new Promise((r) => setTimeout(() => r("geen antwoord"), 2000))]);
  return { d, verzoeken, vragen };
}

// Annuleren (of Esc) bij beide vragen: niets hernoemd, één verzoek (de vraag van de server)
{
  const { d, verzoeken, vragen } = await draai([false, false]);
  assert.equal(verzoeken.length, 1, "na Annuleren geen tweede verzoek: " + JSON.stringify(verzoeken));
  assert.ok(!verzoeken.some((v) => v.hernoem), "Annuleren hernoemt nooit");
  assert.equal(d.ok, false); assert.equal(d.geannuleerd, true);
  assert.match(d.fout, /niet veranderd/);
  assert.equal(vragen.length, 2);
}
// OK bij de eerste vraag: nieuwe kaart, geen hernoem
{
  const { d, verzoeken } = await draai([true]);
  assert.equal(verzoeken.length, 2);
  assert.equal(verzoeken[1].kaartId, "", "nieuwe kaart");
  assert.ok(!verzoeken[1].hernoem);
  assert.equal(d.id, "nieuw0000001");
}
// Annuleren, dan OK: alleen dan de naam verbeteren
{
  const { d, verzoeken, vragen } = await draai([false, true]);
  assert.equal(verzoeken.length, 2);
  assert.equal(verzoeken[1].hernoem, true, "pas na een bewuste OK hernoemen");
  assert.match(vragen[1], /OK = naam verbeteren/);
  assert.equal(d.ok, true);
}
console.log("test-kaart-annuleren-hernoem: Annuleren/Esc hernoemt de kaart van de vorige patiënt niet meer; alleen OK doet iets");
