import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { graphLayers, runDag } from "../lib/dag-runner.js";
import { linePathForColor } from "../lib/v2-line-art.js";
import { assertV2Override, loadV2Overrides } from "../lib/v2-overrides.js";

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
    assert(entries.length === 319, `v1 moet exact 319 oefeningen bevatten; gevonden ${entries.length}`);
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
    const register = JSON.parse(await readFile(join(root, "content", "nieuwe-lijntekeningen.json"), "utf8")).lijntekeningen;
    // Nieuwe oefeningen (nieuweOefening: true in content/nieuwe-lijntekeningen.json, sinds 2026-11-09)
    // staan los van de vaste 604; ze zijn volledig met pad en sha256 vastgelegd en hebben geen coreExerciseId.
    const nieuweOefeningen = new Set(register.filter((entry) => entry.nieuweOefening).map((entry) => entry.naam));
    const basis = v2.filter((entry) => !nieuweOefeningen.has(entry.naam));
    assert(basis.length === 604, `v2-broncatalogus moet exact 604 oefeningen bevatten (plus vastgelegde nieuwe oefeningen); gevonden ${basis.length}`);
    assert(v2.length === basis.length + nieuweOefeningen.size, "vastgelegde nieuwe oefening ontbreekt in oefeningen-v2.json");
    assert(v2.every((entry) => !nieuweOefeningen.has(entry.naam) || !entry.coreExerciseId), "nieuwe oefening mag geen coreExerciseId hebben");
    assert(new Set(v2.map((entry) => entry.naam)).size === v2.length, "v2 bevat dubbele oefeningnamen");
    const v2Names = new Set(v2.map((entry) => entry.naam));
    const v1Core = v1.filter((entry) => !String(entry.img || "").endsWith("-line-v1.png"));
    assert(v1Core.length === 215, `v1-kern moet 215 oefeningen bevatten; gevonden ${v1Core.length}`);
    assert(v1Core.every((entry) => v2Names.has(entry.naam)), "v2 bevat niet de volledige stabiele v1-kernset");
    const extension = v2.filter((entry) => entry.coreExerciseId);
    assert(extension.length === 285, `v2-Core-uitbreiding moet 285 oefeningen bevatten; gevonden ${extension.length}`);
    const v1ByName = new Map(v1.map((entry) => [entry.naam, entry]));
    // Alleen vastgelegde, hash-gebonden uitzonderingen mogen van het V1-lijnbeeld afwijken;
    // assertV2Override controleert ze volledig. Elke andere afwijking blijft een fout.
    const overrides = await loadV2Overrides(root);
    const arrows = JSON.parse(await readFile(join(root, "content", "beginhouding-pijl.json"), "utf8"));
    for (const override of overrides.values()) await assertV2Override(root, override, v2, v1, arrows);
    // nieuwe lijntekeningen zonder avatarkaart (content/nieuwe-lijntekeningen.json): bewust
    // geen kaartImg, wel exact het vastgelegde lijnbeeld; geen half paar maar een lijn-alleen-stand
    const nieuweLijn = new Map(register.map((entry) => [entry.naam, entry]));
    const pathErrors = v2.filter((entry) => {
      const nieuwe = nieuweLijn.get(entry.naam);
      // met vastgelegde avatar: kaartImg exact het geregistreerde pad; zonder: geen kaartImg
      if (nieuwe) return (entry.kaartImg ?? null) !== (nieuwe.kaartImg ?? null) || (!entry.coreExerciseId && !nieuwe.nieuweOefening) || entry.img !== nieuwe.img;
      if (!entry.kaartImg) return true;
      const override = !entry.coreExerciseId && overrides.get(entry.exerciseId);
      if (override) return entry.img !== override.lineImg || v1ByName.get(entry.naam)?.img !== override.v1LineImg;
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
    const unpaired = pairs.filter((pair) => !nieuweLijn.has(pair.name) && pair.colorReady !== pair.lineReady);
    const nieuweZonderBeeld = pairs.filter((pair) => nieuweLijn.has(pair.name) && (!pair.lineReady || (Boolean(nieuweLijn.get(pair.name).kaartImg) && !pair.colorReady)));
    assert(nieuweZonderBeeld.length === 0, `nieuwe lijntekeningen ontbreken: ${nieuweZonderBeeld.slice(0, 5).map((pair) => pair.name).join(", ")}`);
    assert(unpaired.length === 0, `v2 bevat ${unpaired.length} half gepubliceerde beeldparen: ${unpaired.slice(0, 5).map((pair) => pair.name).join(", ")}`);
    return {
      sourceCount: v2.length,
      extensionCount: extension.length,
      publishedCount: pairs.filter((pair) => pair.colorReady).length,
      lineDrawingsReady: pairs.filter((pair) => pair.lineReady).length,
      pairsReady: pairs.filter((pair) => pair.pairReady).length,
      pendingCount: pairs.filter((pair) => !pair.pairReady && !nieuweLijn.has(pair.name)).length,
      lineOnlyNew: [...nieuweLijn.values()].filter((entry) => !entry.kaartImg).length,
      newWithAvatar: [...nieuweLijn.values()].filter((entry) => entry.kaartImg).length,
      lineRule: "legacy reuses exact V1 images, except hash-bound V2 corrections in content/v2-avatar-overrides.json; extensions use black-only contours on pure #FFFFFF",
      correctedLegacyLines: overrides.size,
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
    assert(client.includes("var USE_V2_LIBRARY=IS_V2||IS_ADMIN;"), "v2 en beheer moeten de v2-bibliotheek expliciet activeren");
    assert(client.includes("USE_V2_LIBRARY?'/v2/oefeningen.json':'/oefeningen.json'"), "client kiest niet expliciet tussen v1 en v2");
    return { root: "/oefeningen.json", admin: "/v2/oefeningen.json", v2: "/v2/oefeningen.json", v2Assets: "/v2/images/*" };
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
