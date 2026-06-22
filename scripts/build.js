import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");

mkdirSync(dist, { recursive: true });
writeFileSync(
  join(dist, "build-info.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local"
    },
    null,
    2
  )
);

console.log("Fysiplan build metadata written.");
