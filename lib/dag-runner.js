// Kleine deterministische DAG-runner. Productiestappen worden als afhankelijkheden
// gemodelleerd; een mislukte node blokkeert alleen zijn nakomelingen, niet de hele batch.

export function graphLayers(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("DAG bevat dubbele node-ID's");
  const depths = new Map();
  const visiting = new Set();

  const depthOf = (id) => {
    if (depths.has(id)) return depths.get(id);
    if (visiting.has(id)) throw new Error(`DAG bevat een cyclus bij ${id}`);
    const node = byId.get(id);
    if (!node) throw new Error(`DAG verwijst naar onbekende node ${id}`);
    visiting.add(id);
    const depth = (node.dependencies || []).reduce((highest, dependency) => Math.max(highest, depthOf(dependency) + 1), 0);
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };

  nodes.forEach((node) => depthOf(node.id));
  const grouped = nodes.reduce((map, node) => {
    const depth = depths.get(node.id);
    map.set(depth, [...(map.get(depth) || []), node]);
    return map;
  }, new Map());
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([, layer]) => layer);
}

export async function runDag({ nodes, concurrency, canRun, execute, shouldStop = () => false }) {
  const layers = graphLayers(nodes);
  const results = new Map();
  const limit = Math.max(1, Number(concurrency) || 1);

  for (const layer of layers) {
    if (shouldStop()) break;
    const runnable = layer.filter((node) => canRun(node, results));
    const chunks = Array.from({ length: Math.ceil(runnable.length / limit) }, (_, index) => runnable.slice(index * limit, (index + 1) * limit));
    for (const chunk of chunks) {
      if (shouldStop()) break;
      const completed = await Promise.all(chunk.map(async (node) => [node.id, await execute(node, results)]));
      completed.forEach(([id, result]) => results.set(id, result));
    }
  }
  return results;
}
