import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { graphLayers, runDag } from "../lib/dag-runner.js";
import { linePathForColor } from "../lib/v2-line-art.js";

const root = resolve(new URL("../", import.meta.url).pathname);
const publicDir = join(root, "public");
const readJson = async (file) => JSON.parse(await readFile(join(publicDir, file), "utf8"));

const nodes = [
  { id: "catalog:v1", kind: "catalog", channel: "v1", dependencies: [] },
  { id: "catalog:v2", kind: "catalog", channel: "v2", dependencies: [] },
  { id: "gate:v1-line-art", kind: "v1-gate", dependencies: ["catalog:v1"] },
  { id: "gate:v2-content", kind: "v2-gate", dependencies: ["catalog:v1", "catalog:v2"] },
  { id: "gate:routes", kind: "route-gate", dependencies: ["gate:v1-line-art", "gate:v2-content"] },
  { id: "gate:generators", kind: "generator-gate", dependencies: ["gate:v2-content"] },
  { id: "report:channels", kind: "report", dependencies: ["gate:routes", "gate:generators"] },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function imageExists(source) {
  try { return (await stat(join(publicDir, String(source || "").replace(/^\/+/, "")))).size > 100; }
  catch { return false; }
}

async function execute(node, results) {
  if (node.kind === "catalog") {
    const file = node.channel === "v1" ? "oefeningen.json" : "oefeningen-v2.json";
    return { file, entries: await readJson(file) };
  }

  if (node.kind === "v1-gate") {
    const { entries } = results.get("catalog:v1");
    assert(entries.length === 215, `v1 moet exact 215 oefeningen bevatten; gevonden ${entries.length}`);
    assert(new Set(entries.map((entry) => entry.naam)).size === entries.length, "v1 bevat dubbele oefeningnamen");
    const invalid = entries.filter((entry) => !entry.img || /avatar|v8/i.test(entry.img));
    assert(invalid.length === 0, `v1 verwijst niet uitsluitend naar lijntekeningen: ${invalid.map((entry) => entry.naam).join(", ")}`);
    const ready = await Promise.all(entries.map((entry) => imageExists(entry.img)));
    assert(ready.every(Boolean), `v1 mist ${ready.filter(Boolean).length === ready.length ? 0 : ready.filter((value) => !value).length} lijntekeningen`);
    return { count: entries.length, lineDrawingsReady: ready.filter(Boolean).length };
  }

  if (node.kind === "v2-gate") {
    const v1 = results.get("catalog:v1").entries;
    const v2 = results.get("catalog:v2").entries;
    assert(v2.length === 500, `v2-broncatalogus moet exact 500 oefeningen bevatten; gevonden ${v2.length}`);
    assert(new Set(v2.map((entry) => entry.naam)).size === v2.length, "v2 bevat dubbele oefeningnamen");
    const v2Names = new Set(v2.map((entry) => entry.naam));
    assert(v1.every((entry) => v2Names.has(entry.naam)), "v2 bevat niet de volledige stabiele v1-set");
    const extension = v2.filter((entry) => entry.coreExerciseId);
    assert(extension.length === 285, `v2-uitbreiding moet 285 oefeningen bevatten; gevonden ${extension.length}`);
    const v1ByName = new Map(v1.map((entry) => [entry.naam, entry]));
    const pathErrors = v2.filter((entry) => {
      if (!entry.kaartImg) return true;
      if (!entry.coreExerciseId) return entry.img !== v1ByName.get(entry.naam)?.img;
      return entry.img !== linePathForColor(entry.kaartImg);
    });
    assert(pathErrors.length === 0, `v2 bevat ${pathErrors.length} onjuiste kleur/lijn-koppelingen: ${pathErrors.slice(0, 5).map((entry) => entry.naam).join(", ")}`);
    const pairs = await Promise.all(v2.map(async (entry) => {
      const [colorReady, lineReady] = await Promise.all([
        imageExists(entry.kaartImg),
        imageExists(entry.img),
      ]);
      return { name: entry.naam, colorReady, lineReady, pairReady: colorReady && lineReady };
    }));
    const unpaired = pairs.filter((pair) => pair.colorReady !== pair.lineReady);
    assert(unpaired.length === 0, `v2 bevat ${unpaired.length} half gepubliceerde beeldparen: ${unpaired.slice(0, 5).map((pair) => pair.name).join(", ")}`);
    return {
      sourceCount: v2.length,
      extensionCount: extension.length,
      publishedCount: pairs.filter((pair) => pair.colorReady).length,
      lineDrawingsReady: pairs.filter((pair) => pair.lineReady).length,
      pairsReady: pairs.filter((pair) => pair.pairReady).length,
      pendingCount: pairs.filter((pair) => !pair.pairReady).length,
      lineRule: "legacy reuses exact V1 images; extensions use black-only contours on pure #FFFFFF",
    };
  }

  if (node.kind === "route-gate") {
    const [server, client] = await Promise.all([
      readFile(join(root, "server.js"), "utf8"),
      readFile(join(publicDir, "index.html"), "utf8"),
    ]);
    [
      'buildManifest("v1")',
      'buildManifest("v2")',
      'urlPath === "/v2/oefeningen.json"',
      'urlPath.startsWith("/v2/images/")',
    ].forEach((token) => assert(server.includes(token), `server-routecontract mist ${token}`));
    assert(client.includes("var USE_V2_LIBRARY=IS_V2;"), "alleen de v2-route mag de v2-bibliotheek activeren");
    assert(client.includes("USE_V2_LIBRARY?'/v2/oefeningen.json':'/oefeningen.json'"), "client kiest niet expliciet tussen v1 en v2");
    return { root: "/oefeningen.json", admin: "/oefeningen.json", v2: "/v2/oefeningen.json", v2Assets: "/v2/images/*" };
  }

  if (node.kind === "generator-gate") {
    const files = [
      "scripts/exercise-image-graph.mjs",
      "scripts/runway-image-batch.mjs",
      "scripts/v2-line-art-graph.mjs",
      "scripts/top500.mjs",
      "scripts/normalize-exercise-backgrounds.py",
    ];
    for (const file of files) {
      const source = await readFile(join(root, file), "utf8");
      assert(source.includes("oefeningen-v2.json"), `${file} is niet op de v2-catalogus gericht`);
    }
    return { target: "public/oefeningen-v2.json", protected: "public/oefeningen.json" };
  }

  const v1 = results.get("gate:v1-line-art");
  const v2 = results.get("gate:v2-content");
  return {
    architecture: "stable-v1 -> isolated-v2 -> quota-aware-image-DAG",
    layers: graphLayers(nodes).map((layer) => layer.map((entry) => entry.id)),
    v1,
    v2,
    routes: results.get("gate:routes"),
    generation: results.get("gate:generators"),
  };
}

const results = await runDag({
  nodes,
  concurrency: 2,
  canRun: (node, completed) => node.dependencies.every((dependency) => completed.has(dependency)),
  execute,
});

const report = results.get("report:channels");
assert(report, "Publicatiegraph kon niet volledig worden uitgevoerd");
console.log(JSON.stringify(report, null, 2));
