#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { exerciseId } from "../lib/exercise-id.js";

const root = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(root, "public");
const v1File = path.join(publicDir, "oefeningen.json");
const v2File = path.join(publicDir, "oefeningen-v2.json");
const v1 = JSON.parse(fs.readFileSync(v1File, "utf8"));
const v2 = JSON.parse(fs.readFileSync(v2File, "utf8"));

const carla = v1.filter((exercise) => String(exercise.img || "").endsWith("-line-v1.png"));
if (carla.length !== 104) throw new Error(`Verwacht 104 Carla-oefeningen in V1; gevonden ${carla.length}`);

const v2ByName = new Map(v2.map((exercise) => [exercise.naam, exercise]));
const duplicateNames = carla.filter((exercise) => v2ByName.has(exercise.naam)).map((exercise) => exercise.naam);
if (duplicateNames.length) throw new Error(`Carla-oefeningen bestaan al in V2: ${duplicateNames.join(", ")}`);

const additions = carla.map((exercise) => {
  const line = exercise.img;
  return {
    ...exercise,
    // Carla supplied no colour cards. Keeping both sources on the approved V1
    // drawing makes both V2 display modes safe and avoids inventing a colour asset.
    img: line,
    kaartImg: line,
    exerciseId: exerciseId({ ...exercise, img: line }),
    lineStatus: "verified-v1",
    v1Source: "carla",
  };
});

const ids = additions.map((exercise) => exercise.exerciseId);
if (new Set(ids).size !== ids.length || ids.some((id) => v2.some((exercise) => exercise.exerciseId === id))) {
  throw new Error("Carla-V2 synchronisatie levert geen unieke exerciseId's op");
}

fs.writeFileSync(v2File, `${JSON.stringify([...v2, ...additions], null, 1)}\n`);
console.log(`Synced ${additions.length} Carla exercises to V2; total ${v2.length + additions.length}.`);
