#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "public", "oefeningen.json");
const exercises = JSON.parse(fs.readFileSync(file, "utf8"));

function carlaCategory(exercise) {
  const image = exercise.img || "";
  if (!image.endsWith("-line-v1.png")) return null;
  if (image.startsWith("images/cardio/")) return "Agility";
  if (image.startsWith("images/exercise-ball/")) return "Exercise Ball";
  if (image.startsWith("images/foam-roller/")) return "Foam Roller";
  if (image.startsWith("images/medicine-ball/")) return "Medicine Ball";
  if (image.startsWith("images/mobility/")) return "Mobility";
  if (image.startsWith("images/seated-chair/")) {
    return exercise.naam.startsWith("Standing") || exercise.naam === "One leg standing"
      ? "Standing Chair"
      : "Seated Chair";
  }
  return null;
}

let changed = 0;
for (const exercise of exercises) {
  const category = carlaCategory(exercise);
  if (category && exercise.groep !== category) {
    exercise.groep = category;
    changed += 1;
  }
}

fs.writeFileSync(file, `${JSON.stringify(exercises, null, 1)}\n`);
console.log(`Applied Carla categories to ${changed} exercises.`);
