// Expliciete V2-koppelingsuitzonderingen (content/v2-avatar-overrides.json).
//
// Een legacykaart in V2 hoort exact het V1-lijnbeeld te gebruiken. Die regel blijft voor
// alle oefeningen gelden, behalve voor de oefeningen die hier met exerciseId, paden en
// sha256 zijn vastgelegd. assertV2Override() controleert zo'n uitzondering volledig; een
// gate die een oefening van de V1-regel vrijstelt, roept deze functie voor die oefening aan.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exerciseId } from "./exercise-id.js";

export const V2_OVERRIDES_FILE = "content/v2-avatar-overrides.json";

export async function loadV2Overrides(root) {
  const data = JSON.parse(await readFile(join(root, V2_OVERRIDES_FILE), "utf8"));
  if (data.schemaVersion !== 2 || !Array.isArray(data.overrides)) {
    throw new Error(`${V2_OVERRIDES_FILE} heeft een onbekende vorm`);
  }
  const map = new Map();
  for (const override of data.overrides) {
    if (!/^fp_[a-f0-9]{16}$/.test(String(override.exerciseId || "")) || map.has(override.exerciseId)) {
      throw new Error(`${V2_OVERRIDES_FILE}: ongeldige of dubbele exerciseId ${override.exerciseId}`);
    }
    map.set(override.exerciseId, override);
  }
  return map;
}

async function sha256(root, relative) {
  return createHash("sha256").update(await readFile(join(root, "public", relative))).digest("hex");
}

// Gooit bij elke afwijking. v2Entries en v1Entries zijn de volledige catalogi; arrows is
// content/beginhouding-pijl.json.
export async function assertV2Override(root, override, v2Entries, v1Entries, arrows) {
  const label = `V2-uitzondering ${override.name} (${override.exerciseId})`;
  const v2 = v2Entries.filter((entry) => entry.exerciseId === override.exerciseId);
  if (v2.length !== 1 || v2[0].naam !== override.name) throw new Error(`${label}: staat niet precies één keer onder die naam in V2`);
  const v1 = v1Entries.filter((entry) => entry.naam === override.name);
  if (v1.length !== 1) throw new Error(`${label}: niet precies één keer in V1`);
  // stabiele id's: kaarten uit V1 en V2 moeten dezelfde oefening blijven vinden
  if (exerciseId(v1[0]) !== override.exerciseId || exerciseId(v2[0]) !== override.exerciseId) {
    throw new Error(`${label}: exerciseId van V1 en V2 lopen uiteen`);
  }
  if (v1[0].img !== override.v1LineImg) throw new Error(`${label}: het V1-lijnbeeld is veranderd`);
  if (v2[0].kaartImg !== override.kaartImg) throw new Error(`${label}: kaartbeeld ${v2[0].kaartImg} in plaats van ${override.kaartImg}`);
  if (v2[0].img !== override.lineImg) throw new Error(`${label}: lijnbeeld ${v2[0].img} in plaats van ${override.lineImg}`);
  const hashes = [
    [override.kaartImg, override.assetSha256, "kaartbeeld"],
    [override.lineImg, override.lineSha256, "V2-lijnbeeld"],
    [override.v1LineImg, override.v1LineSha256, "V1-lijnbeeld"],
    [override.arrow.img, override.arrow.sha256, "pijlbeeld"],
  ];
  for (const [path, expected, kind] of hashes) {
    if (await sha256(root, path) !== expected) throw new Error(`${label}: ${kind} ${path} is gewijzigd`);
  }
  for (const field of ["kaartImg", "img"]) {
    const sharing = v2Entries.filter((entry) => entry[field] === v2[0][field]);
    if (sharing.length !== 1) throw new Error(`${label}: ${field} wordt door ${sharing.length} V2-oefeningen gebruikt`);
  }
  const arrow = arrows.entries.filter((entry) => entry.id === override.arrow.id);
  if (arrow.length !== 1 || arrow[0].naam !== override.name || arrow[0].img !== override.arrow.img || arrow[0].source !== override.lineImg) {
    throw new Error(`${label}: pijlbeeld ${override.arrow.id} hoort niet meer onder het gecorrigeerde lijnbeeld`);
  }
  if (arrows.entries.filter((entry) => entry.source === override.lineImg).length !== 1) {
    throw new Error(`${label}: meer dan één pijlbeeld onder ${override.lineImg}`);
  }
  return v2[0];
}
