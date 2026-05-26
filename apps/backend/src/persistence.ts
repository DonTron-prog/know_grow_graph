import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  parseGraphState,
  snapshotMetaSchema,
  type GraphState,
  type SnapshotMeta
} from "@know-grow/shared";

export type BackendPaths = {
  dataDir: string;
  sourceGraph: string;
  workingGraph: string;
  snapshotsMeta: string;
  snapshotsDir: string;
  fixtureGraphPath: string;
};

export function resolvePath(path: string, root = resolve(import.meta.dirname, "../../..")): string {
  return path.startsWith("/") ? path : resolve(root, path);
}

export function resolveBackendPaths(options: {
  dataDir?: string;
  fixtureGraphPath?: string;
  repoRoot?: string;
} = {}): BackendPaths {
  const repoRoot = options.repoRoot ?? resolve(import.meta.dirname, "../../..");
  const dataDir = resolvePath(options.dataDir ?? process.env.DATA_DIR ?? ".data", repoRoot);
  const fixtureGraphPath = resolvePath(
    options.fixtureGraphPath ?? process.env.FIXTURE_GRAPH_PATH ?? "fixtures/source_graph.example.json",
    repoRoot
  );

  return {
    dataDir,
    fixtureGraphPath,
    sourceGraph: resolve(dataDir, "source_graph.json"),
    workingGraph: resolve(dataDir, "working_graph.json"),
    snapshotsMeta: resolve(dataDir, "snapshots.json"),
    snapshotsDir: resolve(dataDir, "snapshots")
  };
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

export function asWorkingCopy(graph: GraphState): GraphState {
  return {
    ...graph,
    graphId: graph.graphId === "source-example" ? "working-example" : `${graph.graphId}-working`,
    name: graph.name.replace(/ source$/i, ""),
    stateType: "working",
    updatedAt: new Date().toISOString()
  };
}

export async function initializePersistence(paths: BackendPaths): Promise<void> {
  await mkdir(paths.dataDir, { recursive: true });
  await mkdir(paths.snapshotsDir, { recursive: true });

  if (!existsSync(paths.sourceGraph)) {
    await copyFile(paths.fixtureGraphPath, paths.sourceGraph);
  }

  const sourceGraph = parseGraphState(await readJson(paths.sourceGraph));

  if (!existsSync(paths.workingGraph)) {
    await writeJsonAtomic(paths.workingGraph, asWorkingCopy(sourceGraph));
  } else {
    parseGraphState(await readJson(paths.workingGraph));
  }

  if (!existsSync(paths.snapshotsMeta)) {
    await writeJsonAtomic(paths.snapshotsMeta, [] satisfies SnapshotMeta[]);
  } else {
    parseSnapshotMeta(await readJson(paths.snapshotsMeta));
  }
}

export async function loadSourceGraph(paths: BackendPaths): Promise<GraphState> {
  return parseGraphState(await readJson(paths.sourceGraph));
}

export async function loadWorkingGraph(paths: BackendPaths): Promise<GraphState> {
  return parseGraphState(await readJson(paths.workingGraph));
}

export async function saveWorkingGraph(paths: BackendPaths, graph: GraphState): Promise<void> {
  await writeJsonAtomic(paths.workingGraph, graph);
}

export async function loadSnapshotsMeta(paths: BackendPaths): Promise<SnapshotMeta[]> {
  return parseSnapshotMeta(await readJson(paths.snapshotsMeta));
}

export async function saveSnapshotsMeta(paths: BackendPaths, snapshots: SnapshotMeta[]): Promise<void> {
  await writeJsonAtomic(paths.snapshotsMeta, parseSnapshotMeta(snapshots));
}

export function snapshotGraphPath(paths: BackendPaths, snapshotId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(snapshotId)) {
    throw new Error(`Invalid snapshot id '${snapshotId}'.`);
  }
  return resolve(paths.snapshotsDir, `${snapshotId}.json`);
}

export async function readSnapshotGraph(paths: BackendPaths, snapshotId: string): Promise<unknown> {
  return readJson(snapshotGraphPath(paths, snapshotId));
}

export async function saveSnapshotGraph(paths: BackendPaths, snapshotId: string, graph: GraphState): Promise<void> {
  await writeJsonAtomic(snapshotGraphPath(paths, snapshotId), parseGraphState(graph));
}

function parseSnapshotMeta(input: unknown): SnapshotMeta[] {
  return snapshotMetaSchema.array().parse(input);
}
