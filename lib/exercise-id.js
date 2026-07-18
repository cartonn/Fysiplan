import { createHash } from "node:crypto";

// De afbeelding is de stabiele bron van een oefening: de naam en categorie mogen later
// veranderen zonder dat kaarten of catalogusvideo's hun koppeling verliezen.
export function exerciseId(exercise) {
  if (/^fp_[a-f0-9]{16}$/.test(String(exercise && exercise.exerciseId || ""))) {
    return exercise.exerciseId;
  }
  const source = exercise && exercise.img
    ? "img:" + exercise.img
    : "exercise:" + String(exercise && exercise.groep || "") + "|" + String(exercise && exercise.naam || "");
  return "fp_" + createHash("sha256").update(source).digest("hex").slice(0, 16);
}
