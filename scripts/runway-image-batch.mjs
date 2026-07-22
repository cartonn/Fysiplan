import { spawn } from "node:child_process";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);
const args = process.argv.slice(2);
const command = args.find((argument) => !argument.startsWith("--")) || "plan";

function valueAfter(flag, fallback = "") {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : String(args[index + 1] || fallback);
}

function boundedNumber(flag, fallback, minimum, maximum) {
  const value = Number(valueAfter(flag, String(fallback)));
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? Math.floor(value) : fallback));
}

const workDir = resolve(valueAfter("--work-dir", join(root, "image-work-top500")));
const statePath = join(workDir, "state.json");
const reportPath = join(workDir, "rolling-24h-report.json");
const lockPath = join(workDir, ".runway-batch.lock");
const maxRollingGenerations = boundedNumber("--max-rolling-generations", 190, 1, 195);
const maxBatch = boundedNumber("--max-batch", 10, 1, 50);
const executeApproved = args.includes("--execute");

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fileExists(path) {
  try { return (await stat(path)).size > 100; }
  catch { return false; }
}

async function snapshot() {
  const catalogue = await readJson(join(root, "public", "oefeningen-v2.json"), []);
  const extension = catalogue
    .map((exercise, index) => ({ ...exercise, order: index + 1 }))
    .filter((exercise) => exercise.coreExerciseId);
  const existence = await Promise.all(extension.map(async (exercise) => ({
    exercise,
    exists: Boolean(exercise.kaartImg) && await fileExists(join(root, "public", exercise.kaartImg)),
  })));
  const pending = existence.filter((entry) => !entry.exists).map((entry) => entry.exercise);
  const published = existence.length - pending.length;

  const state = await readJson(statePath, { nodes: {} });
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const rollingGenerations = Object.entries(state.nodes || {}).filter(([id, record]) => (
    id.startsWith("generate:")
    && record.status === "succeeded"
    && record.metadata?.model === "gpt_image_2"
    && Date.parse(record.completedAt || "") >= cutoff
  ));
  const rollingUsed = rollingGenerations.length;
  const rollingCapacity = Math.max(0, maxRollingGenerations - rollingUsed);
  const selected = pending.slice(0, Math.min(maxBatch, rollingCapacity));
  const oldestRollingGeneration = rollingGenerations
    .map(([, record]) => record.completedAt)
    .sort()[0] || null;

  return {
    schemaVersion: 1,
    architecture: "quota-aware-controller -> resumable-exercise-image-DAG",
    provider: "runway",
    model: "gpt_image_2",
    quality: "low",
    generatedAt: new Date().toISOString(),
    totalExtension: extension.length,
    published,
    remaining: pending.length,
    rollingWindowHours: 24,
    providerPublishedLimit: 200,
    safetyLimit: maxRollingGenerations,
    rollingUsed,
    rollingCapacity,
    oldestRollingGeneration,
    maxBatch,
    selectedCount: selected.length,
    selectedOrders: selected.map((exercise) => exercise.order),
    selectedNames: selected.map((exercise) => exercise.naam),
    estimatedSelectedCredits: selected.length,
    estimatedRemainingCredits: pending.length,
    complete: pending.length === 0,
  };
}

async function writeReport(report) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
}

async function acquireLock() {
  await mkdir(workDir, { recursive: true });
  try {
    return await open(lockPath, "wx");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const lock = await stat(lockPath);
    if (Date.now() - lock.mtimeMs <= 2 * 60 * 60 * 1000) return null;
    await unlink(lockPath);
    return open(lockPath, "wx");
  }
}

async function runGraph(plan) {
  const graphArgs = [
    "--env-file=.env",
    "scripts/exercise-image-graph.mjs",
    "run",
    "--provider", "runway",
    "--work-dir", workDir,
    "--orders", plan.selectedOrders.join(","),
    "--force-gpt-low",
    "--publish-concepts",
    "--stop-on-quota",
    "--concurrency", "1",
    "--budget-credits", String(plan.estimatedSelectedCredits),
    "--execute",
  ];
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, graphArgs, { cwd: root, stdio: "inherit" });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => resolvePromise({ code: code ?? 1, signal }));
  });
}

if (!["plan", "status", "run"].includes(command)) {
  throw new Error("Gebruik plan, status of run");
}

const before = await snapshot();
if (command === "plan" || command === "status") {
  console.log(JSON.stringify(before, null, 2));
  process.exit(0);
}
if (!executeApproved) throw new Error("Run vereist --execute; zo worden credits nooit onbedoeld gebruikt.");
if (before.complete || before.selectedCount === 0) {
  const noOp = { ...before, action: before.complete ? "complete" : "wait-for-rolling-capacity" };
  await writeReport(noOp);
  console.log(JSON.stringify(noOp, null, 2));
  process.exit(0);
}

const lock = await acquireLock();
if (!lock) {
  const noOp = { ...before, action: "skipped-active-run" };
  console.log(JSON.stringify(noOp, null, 2));
  process.exit(0);
}

let graphResult;
try {
  await writeFile(lock, `${process.pid}\n${new Date().toISOString()}\n`);
  await writeReport({ ...before, action: "running" });
  graphResult = await runGraph(before);
} finally {
  await lock.close();
  await unlink(lockPath).catch(() => {});
}

const after = await snapshot();
const report = {
  ...after,
  action: graphResult.code === 0 ? "batch-finished-or-quota-deferred" : "batch-failed",
  childExitCode: graphResult.code,
  childSignal: graphResult.signal,
  publishedThisRun: after.published - before.published,
  generatedThisRollingWindow: after.rollingUsed - before.rollingUsed,
  workDir: relative(root, workDir),
};
await writeReport(report);
console.log(JSON.stringify(report, null, 2));
if (graphResult.code !== 0) process.exitCode = graphResult.code;
