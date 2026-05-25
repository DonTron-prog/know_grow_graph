import cors from "cors";
import express, { type Request, type Response } from "express";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  graphMetaFromState,
  hasBlockers,
  parseGraphState,
  validateGraphState,
  type GraphState,
  type SnapshotMeta
} from "@know-grow/shared";

const repoRoot = resolve(import.meta.dirname, "../../..");
const port = Number(process.env.BACKEND_PORT ?? 3001);
const dataDir = resolvePath(process.env.DATA_DIR ?? ".data");
const fixtureGraphPath = resolvePath(process.env.FIXTURE_GRAPH_PATH ?? "fixtures/source_graph.example.json");

const paths = {
  dataDir,
  sourceGraph: resolve(dataDir, "source_graph.json"),
  workingGraph: resolve(dataDir, "working_graph.json"),
  snapshotsMeta: resolve(dataDir, "snapshots.json")
};

function resolvePath(path: string): string {
  return path.startsWith("/") ? path : resolve(repoRoot, path);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

function asWorkingCopy(graph: GraphState): GraphState {
  return {
    ...graph,
    graphId: graph.graphId === "source-example" ? "working-example" : `${graph.graphId}-working`,
    name: graph.name.replace(/ source$/i, ""),
    stateType: "working",
    updatedAt: new Date().toISOString()
  };
}

async function initializePersistence(): Promise<void> {
  await mkdir(paths.dataDir, { recursive: true });

  if (!existsSync(paths.sourceGraph)) {
    await copyFile(fixtureGraphPath, paths.sourceGraph);
  }

  const sourceGraph = parseGraphState(await readJson(paths.sourceGraph));

  if (!existsSync(paths.workingGraph)) {
    await writeJsonAtomic(paths.workingGraph, asWorkingCopy(sourceGraph));
  } else {
    parseGraphState(await readJson(paths.workingGraph));
  }

  if (!existsSync(paths.snapshotsMeta)) {
    await writeJsonAtomic(paths.snapshotsMeta, [] satisfies SnapshotMeta[]);
  }
}

async function loadSourceGraph(): Promise<GraphState> {
  return parseGraphState(await readJson(paths.sourceGraph));
}

async function loadWorkingGraph(): Promise<GraphState> {
  return parseGraphState(await readJson(paths.workingGraph));
}

async function loadSnapshotsMeta(): Promise<SnapshotMeta[]> {
  const raw = await readJson<unknown>(paths.snapshotsMeta);
  if (!Array.isArray(raw)) {
    throw new Error("snapshots.json must contain an array");
  }
  return raw as SnapshotMeta[];
}

function sendValidationFailure(res: Response, graph: unknown): void {
  const validation = validateGraphState(graph);
  res.status(422).json({ ok: false, validation });
}

async function main(): Promise<void> {
  await initializePersistence();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version: "0.1.0", piCoderAvailable: false });
  });

  app.get("/api/source/meta", async (_req, res, next) => {
    try {
      res.json(graphMetaFromState(await loadSourceGraph(), true));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/source/graph", async (_req, res, next) => {
    try {
      res.json(await loadSourceGraph());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/working/graph", async (_req, res, next) => {
    try {
      res.json(await loadWorkingGraph());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/working/graph", async (req: Request, res: Response, next) => {
    try {
      const validation = validateGraphState(req.body);
      if (hasBlockers(validation)) {
        sendValidationFailure(res, req.body);
        return;
      }

      const graph = parseGraphState({
        ...req.body,
        stateType: "working",
        updatedAt: new Date().toISOString()
      });
      await writeJsonAtomic(paths.workingGraph, graph);
      res.json({ ok: true, graph, validation });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/snapshots", async (_req, res, next) => {
    try {
      res.json(await loadSnapshotsMeta());
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown backend error";
    res.status(500).json({ ok: false, error: message });
  });

  app.listen(port, () => {
    console.log(`backend listening on http://localhost:${port}`);
    console.log(`graph data dir: ${paths.dataDir}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
