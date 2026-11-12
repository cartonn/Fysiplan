// Welk lijnbeeld de server in V2 levert, vergeleken met V1.
//
// Regel (d4ff267, "v2: gebruik exact de v1-afbeeldingen"): een V2-oefening gebruikt exact
// het V1-lijnbeeld. Daar zijn twee dingen bij gekomen, allebei vastgelegd:
//   1. eed69d8: de server levert per oefening de pijlversie van dat lijnbeeld
//      (content/beginhouding-pijl.json, sleutel source = lijnbeeld; server.js:
//      img = arrowImages.get(e.img) || e.img). Een oefening zonder pijlbeeld (of met een
//      tegengehouden pijlbeeld) krijgt het lijnbeeld zelf.
//   2. 785559c: precies twee oefeningen hebben bewust een ander lijnbeeld dan V1
//      (content/v2-avatar-overrides.json, per exerciseId gebonden aan paden en sha256 van
//      kaart-, V2-lijn-, V1-lijn- en pijlbeeld; lib/v2-overrides.js controleert dat).
//   3. 2026-11-06: nieuwe lijntekeningen voor oefeningen die niet in V1 staan
//      (content/nieuwe-lijntekeningen.json, per oefening img-pad en sha256); die levert de
//      server precies op dat pad.
// Elke andere afwijking van V1 is een fout. Deze controle versoepelt de regel dus niet: hij
// rekent per oefening vooruit wat de server moet leveren en eist exact dat.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertV2Override, loadV2Overrides } from "../lib/v2-overrides.js";

// Standing chair hip extension en Standing chair knee lift (2026-11-03), en One leg standing en
// Standing chair shoulder rotations (2026-11-06, besluit eigenaar: lijntekening leidend). Een
// volgende uitzondering vraagt een bewuste wijziging hier, niet alleen een regel in
// content/v2-avatar-overrides.json.
export const VASTGELEGDE_UITZONDERINGEN = Object.freeze(["fp_514654a0d4181742", "fp_5319c4700561725d", "fp_14c75a700561d59f", "fp_4b99c5f11b42a30d"]);

// Laadt de uitzonderingen en controleert elk volledig tegen de basiscatalogi en de
// beeldbestanden (sha256). Gooit bij elke afwijking.
export async function laadGecontroleerdeUitzonderingen(root) {
  const lees = async (pad) => JSON.parse(await readFile(join(root, pad), "utf8"));
  const [overrides, v2, v1, arrows, nieuwRegister] = await Promise.all([
    loadV2Overrides(root), lees("public/oefeningen-v2.json"), lees("public/oefeningen.json"), lees("content/beginhouding-pijl.json"),
    lees("content/nieuwe-lijntekeningen.json")
  ]);
  for (const override of overrides.values()) await assertV2Override(root, override, v2, v1, arrows);
  const v1Namen = new Set(v1.map((e) => e.naam));
  const v2PerNaam = new Map(v2.map((e) => [e.naam, e]));
  const nieuw = new Map();
  for (const n of nieuwRegister.lijntekeningen) {
    if (v1Namen.has(n.naam)) throw new Error(`${n.naam}: staat in V1 en hoort niet bij de nieuwe lijntekeningen`);
    if (v2PerNaam.get(n.naam)?.img !== n.img) throw new Error(`${n.naam}: img in oefeningen-v2.json wijkt af van ${n.img}`);
    const sha = createHash("sha256").update(await readFile(join(root, "public", n.img))).digest("hex");
    if (sha !== n.sha256) throw new Error(`${n.naam}: ${n.img} wijkt af van de vastgelegde sha256`);
    nieuw.set(n.naam, n);
  }
  return { overrides, arrows, nieuw };
}

// manifest en v1Manifest zijn wat de server levert (/v2/oefeningen.json, /oefeningen.json).
// Geeft de exerciseIds van de toegepaste uitzonderingen terug; gooit bij elke afwijking.
export function controleerGeleverdeLijnbeelden({ manifest, v1Manifest, arrows, overrides, nieuw = new Map() }) {
  const v1Img = new Map(v1Manifest.map((entry) => [entry.naam, entry.img]));
  const pijlBijLijn = new Map(arrows.entries.map((entry) => [entry.source, entry]));
  const fouten = [];
  const toegepast = [];
  for (const entry of manifest) {
    // V1, de uitzonderingen en de pijlbeelden kennen een oefening bij haar naam uit het bestand.
    // Toont V2 een Nederlandse naam (content/oefennamen-nl.json), dan levert de server die naam
    // mee als `eerder`; zonder die naam blijft de vergelijking op de getoonde naam en faalt ze.
    const basisNaam = (Array.isArray(entry.eerder) && entry.eerder[0]) || entry.naam;
    const v1 = v1Img.get(basisNaam);
    const nieuwe = nieuw.get(basisNaam);
    if (!v1 && nieuwe) {
      if (entry.img !== "/v2/" + nieuwe.img) fouten.push(`${entry.naam}: levert ${entry.img}, verwacht nieuwe lijntekening /v2/${nieuwe.img}`);
      continue;
    }
    if (!v1) { fouten.push(`${entry.naam}: staat niet in V1`); continue; }
    const override = !entry.coreExerciseId && overrides.get(entry.exerciseId);
    if (override) {
      toegepast.push(entry.exerciseId);
      if (override.name !== basisNaam) fouten.push(`${entry.naam}: uitzondering ${entry.exerciseId} hoort bij ${override.name}`);
      if (v1 !== override.v1LineImg) fouten.push(`${entry.naam}: V1-lijnbeeld ${v1} in plaats van ${override.v1LineImg}`);
    }
    const lijn = override ? override.lineImg : v1;
    const pijl = pijlBijLijn.get(lijn);
    if (pijl && pijl.naam !== basisNaam) fouten.push(`${entry.naam}: pijlbeeld ${pijl.id} onder ${lijn} is getekend voor ${pijl.naam}`);
    const verwacht = "/v2/" + (pijl ? pijl.img : lijn);
    if (entry.img !== verwacht) {
      fouten.push(`${entry.naam}: levert ${entry.img}, verwacht ${verwacht} (${override ? "uitzondering" : "V1-lijnbeeld"} ${lijn})`);
    }
  }
  const vastgelegd = [...overrides.keys()].sort();
  if (JSON.stringify(vastgelegd) !== JSON.stringify([...VASTGELEGDE_UITZONDERINGEN].sort())) {
    fouten.push(`uitzonderingen in content/v2-avatar-overrides.json: ${vastgelegd.join(", ") || "geen"}; verwacht exact ${VASTGELEGDE_UITZONDERINGEN.join(", ")}`);
  }
  if (JSON.stringify([...toegepast].sort()) !== JSON.stringify(vastgelegd)) {
    fouten.push(`in de levering toegepast: ${[...toegepast].sort().join(", ") || "geen"}; vastgelegd: ${vastgelegd.join(", ")}`);
  }
  if (fouten.length) throw new Error(`V2-lijnbeelden wijken af van V1 (${fouten.length}):\n  ${fouten.slice(0, 8).join("\n  ")}`);
  return [...toegepast].sort();
}
