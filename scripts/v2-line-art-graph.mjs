import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { graphLayers, runDag } from "../lib/dag-runner.js";
import {
  analyzeBinaryLineArt,
  assetExists,
  createBinaryLineArt,
  linePathForColor,
  publicAssetPath,
} from "../lib/v2-line-art.js";

const root = resolve(new URL("../", import.meta.url).pathname);
const publicDir = join(root, "public");
const cataloguePath = join(publicDir, "oefeningen-v2.json");
const reportPath = join(root, "content", "v2-image-pair-report.json");
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "status";
const executeApproved = args.includes("--execute");
const force = args.includes("--force");
const limitIndex = args.indexOf("--limit");
const limit = limitIndex === -1 ? 0 : Math.max(0, Number(args[limitIndex + 1]) || 0);
if (command === "run" && !executeApproved) throw new Error("Gebruik run --execute om lijnkaarten en de V2-catalogus te schrijven");
if (!["status", "plan", "run"].includes(command)) throw new Error(`Onbekend commando: ${command}`);

const catalogue = JSON.parse(await readFile(cataloguePath, "utf8"));
const selected = catalogue.slice(0, limit || undefined);
const pairNodes = selected.map((exercise, index) => ({
  id: `pair:${String(index + 1).padStart(3, "0")}`,
  kind: "pair",
  exercise,
  dependencies: ["catalog:v2"],
}));
const nodes = [
  { id: "catalog:v2", kind: "catalog", dependencies: [] },
  ...pairNodes,
  { id: "report:pairs", kind: "report", dependencies: pairNodes.map((node) => node.id) },
];
graphLayers(nodes);

async function execute(node, results) {
  if (node.kind === "catalog") return { count: catalogue.length, selected: selected.length };
  if (node.kind === "pair") {
    const colorSource = node.exercise.kaartImg || "";
    const lineSource = linePathForColor(colorSource);
    const colorPath = publicAssetPath(publicDir, colorSource);
    const linePath = publicAssetPath(publicDir, lineSource);
    const colorReady = await assetExists(colorPath);
    if (!colorReady) {
      return {
        name: node.exercise.naam,
        colorSource,
        lineSource,
        status: "pending-color",
        colorReady: false,
        lineReady: await assetExists(linePath),
      };
    }
    const hadLine = await assetExists(linePath);
    if (command === "run" && (!hadLine || force)) await createBinaryLineArt(colorPath, linePath);
    const lineReady = await assetExists(linePath);
    const qa = lineReady ? await analyzeBinaryLineArt(linePath) : null;
    return {
      name: node.exercise.naam,
      colorSource,
      lineSource,
      status: lineReady ? (hadLine && !force ? "ready" : "generated") : "pending-line",
      colorReady,
      lineReady,
      qa,
    };
  }

  const pairs = pairNodes.map((pairNode) => results.get(pairNode.id));
  const summary = {
    schemaVersion: 1,
    architecture: "V2 color card -> deterministic binary line companion -> hard QA",
    layers: graphLayers(nodes).map((layer) => layer.map((entry) => entry.id)),
    catalogueCount: catalogue.length,
    selectedCount: selected.length,
    colorReady: pairs.filter((pair) => pair.colorReady).length,
    lineReady: pairs.filter((pair) => pair.lineReady).length,
    pairReady: pairs.filter((pair) => pair.colorReady && pair.lineReady).length,
    generated: pairs.filter((pair) => pair.status === "generated").length,
    pendingColor: pairs.filter((pair) => pair.status === "pending-color").map((pair) => pair.name),
    pendingLine: pairs.filter((pair) => pair.status === "pending-line").map((pair) => pair.name),
    pairs,
  };
  if (command === "run") {
    const lineByName = new Map(pairs.map((pair) => [pair.name, pair.lineSource]));
    const updated = catalogue.map((exercise) => (
      lineByName.has(exercise.naam)
        ? { ...exercise, img: lineByName.get(exercise.naam) }
        : exercise
    ));
    const temporaryCatalogue = `${cataloguePath}.tmp`;
    await writeFile(temporaryCatalogue, JSON.stringify(updated, null, 1) + "\n");
    await rename(temporaryCatalogue, cataloguePath);
    await mkdir(join(root, "content"), { recursive: true });
    const temporaryReport = `${reportPath}.tmp`;
    await writeFile(temporaryReport, JSON.stringify(summary, null, 2) + "\n");
    await rename(temporaryReport, reportPath);
  }
  return summary;
}

const results = await runDag({
  nodes,
  concurrency: 6,
  canRun: (node, completed) => node.dependencies.every((dependency) => completed.has(dependency)),
  execute,
});
const report = results.get("report:pairs");
if (!report) throw new Error("V2-lijnvariantgraph kon niet volledig worden uitgevoerd");
console.log(JSON.stringify({
  architecture: report.architecture,
  catalogueCount: report.catalogueCount,
  selectedCount: report.selectedCount,
  colorReady: report.colorReady,
  lineReady: report.lineReady,
  pairReady: report.pairReady,
  generated: report.generated,
  pendingColor: report.pendingColor.length,
  pendingLine: report.pendingLine.length,
}, null, 2));
