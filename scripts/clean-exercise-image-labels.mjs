import { execFile } from "node:child_process";
import { readFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const root = resolve(new URL("../", import.meta.url).pathname);
const catalogue = JSON.parse(await readFile(join(root, "public", "oefeningen.json"), "utf8"));
const cleanup = JSON.parse(await readFile(join(root, "content", "oefenbeeld-label-cleanup.json"), "utf8"));

for (const item of cleanup.images) {
  const exercise = catalogue.find((entry) => entry.naam === item.sourceName);
  if (!exercise?.kaartImg) throw new Error(`Kaartafbeelding ontbreekt voor ${item.sourceName}`);
  const path = join(root, "public", exercise.kaartImg);
  const filters = item.rectangles.map((rectangle) => `delogo=x=${rectangle.left}:y=${rectangle.top}:w=${rectangle.width}:h=${rectangle.height}:show=0`).join(",");
  const temporary = `${path}.cleaned.jpg`;
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", path, "-vf", filters, "-q:v", "2", temporary]);
  await rename(temporary, path);
  console.log(`cleaned\t${item.sourceName}\t${exercise.kaartImg}`);
}
