import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import {
  applyGraphPatch,
  applyPatchRequestSchema,
  createEmptyActionSummary,
  createSnapshotRequestSchema,
  duplicateSnapshotRequestSchema,
  graphMetaFromState,
  hasBlockers,
  parseGraphState,
  replaceWorkingGraphRequestSchema,
  validateGraphPatch,
  validateGraphState,
  validatePatchRequestSchema,
  type ActionSummary,
  type GraphState,
  type SnapshotMeta,
  type ValidationResult
} from "@know-grow/shared";
import {
  asWorkingCopy,
  loadSnapshotsMeta,
  loadSourceGraph,
  loadWorkingGraph,
  readSnapshotGraph,
  saveSnapshotGraph,
  saveSnapshotsMeta,
  saveWorkingGraph,
  type BackendPaths
} from "./persistence.ts";

export type CreateAppOptions = {
  paths: BackendPaths;
  version?: string;
  piCoderAvailable?: boolean;
};

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

function validationDetails(validationResults: ValidationResult[]): { validationResults: ValidationResult[] } {
  return { validationResults };
}

function badRequestFromZod(error: unknown): HttpError {
  return new HttpError(400, "invalid_request", "Request body does not match the required API shape.", error);
}

function sendApiError(res: Response, error: HttpError): void {
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    }
  });
}

function createSnapshotId(): string {
  return `snapshot-${randomUUID()}`;
}

function snapshotMetaFromGraph(graph: GraphState, snapshotId: string, name: string, createdAt: string, notes?: string, updatedAt?: string): SnapshotMeta {
  return {
    snapshotId,
    name,
    ...(notes === undefined ? {} : { notes }),
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    createdAt,
    ...(updatedAt === undefined ? {} : { updatedAt })
  };
}

function snapshotGraphFromWorking(workingGraph: GraphState, snapshotId: string, name: string, timestamp: string, layout?: GraphState["layout"]): GraphState {
  return parseGraphState({
    ...workingGraph,
    graphId: snapshotId,
    name,
    stateType: "snapshot",
    ...(layout === undefined ? {} : { layout }),
    updatedAt: timestamp
  });
}

function workingGraphFromSnapshot(snapshotGraph: GraphState, timestamp: string): GraphState {
  return parseGraphState({
    ...snapshotGraph,
    graphId: `${snapshotGraph.graphId}-working`,
    stateType: "working",
    updatedAt: timestamp
  });
}

function summarizeGraphReplacement(before: GraphState, after: GraphState, title: string, instruction: string): ActionSummary {
  const summary = createEmptyActionSummary(instruction, title);
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));

  summary.addedNodes = after.nodes.filter((node) => !beforeNodes.has(node.id)).map((node) => node.id);
  summary.deletedNodes = before.nodes.filter((node) => !afterNodes.has(node.id)).map((node) => node.id);
  summary.updatedNodes = after.nodes
    .filter((node) => beforeNodes.has(node.id) && JSON.stringify(beforeNodes.get(node.id)) !== JSON.stringify(node))
    .map((node) => node.id);
  summary.addedEdges = after.edges.filter((edge) => !beforeEdges.has(edge.id)).map((edge) => edge.id);
  summary.deletedEdges = before.edges.filter((edge) => !afterEdges.has(edge.id)).map((edge) => edge.id);
  summary.updatedEdges = after.edges
    .filter((edge) => beforeEdges.has(edge.id) && JSON.stringify(beforeEdges.get(edge.id)) !== JSON.stringify(edge))
    .map((edge) => edge.id);

  return summary;
}

function findSnapshotMeta(snapshots: SnapshotMeta[], snapshotId: string): SnapshotMeta | undefined {
  return snapshots.find((snapshot) => snapshot.snapshotId === snapshotId);
}

function snapshotIdParam(req: Request): string {
  const value = req.params.snapshotId;
  return Array.isArray(value) ? value[0] ?? "" : value;
}

async function loadValidSnapshotGraph(paths: BackendPaths, snapshotId: string): Promise<GraphState> {
  let snapshotInput: unknown;
  try {
    snapshotInput = await readSnapshotGraph(paths, snapshotId);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new HttpError(404, "snapshot_not_found", `Snapshot '${snapshotId}' was not found.`);
    }
    throw error;
  }

  const validationResults = validateGraphState(snapshotInput);
  if (hasBlockers(validationResults)) {
    throw new HttpError(
      422,
      "invalid_snapshot_graph",
      `Snapshot '${snapshotId}' is not a valid graph; current working graph was not changed.`,
      validationDetails(validationResults)
    );
  }

  return parseGraphState(snapshotInput);
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  const version = options.version ?? "0.1.0";

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version, piCoderAvailable: options.piCoderAvailable ?? false });
  });

  app.get(
    "/api/source/meta",
    asyncRoute(async (_req, res) => {
      res.json(graphMetaFromState(await loadSourceGraph(options.paths), true));
    })
  );

  app.get(
    "/api/source/graph",
    asyncRoute(async (_req, res) => {
      res.json(await loadSourceGraph(options.paths));
    })
  );

  app.get(
    "/api/working/graph",
    asyncRoute(async (_req, res) => {
      res.json(await loadWorkingGraph(options.paths));
    })
  );

  app.put(
    "/api/working/graph",
    asyncRoute(async (req, res) => {
      const parsedRequest = replaceWorkingGraphRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const validationResults = validateGraphState(parsedRequest.data.graph);
      if (hasBlockers(validationResults)) {
        throw new HttpError(
          422,
          "invalid_working_graph",
          "Working graph validation failed; current working graph was not changed.",
          validationDetails(validationResults)
        );
      }

      const graph = parseGraphState({
        ...parsedRequest.data.graph,
        stateType: "working",
        updatedAt: new Date().toISOString()
      });
      await saveWorkingGraph(options.paths, graph);
      res.json({ graph, validationResults });
    })
  );

  app.post(
    "/api/working/revert-to-source",
    asyncRoute(async (_req, res) => {
      const previousGraph = await loadWorkingGraph(options.paths);
      const graph = asWorkingCopy(await loadSourceGraph(options.paths));
      const validationResults = validateGraphState(graph);
      if (hasBlockers(validationResults)) {
        throw new HttpError(
          422,
          "invalid_source_graph",
          "Source graph validation failed; current working graph was not changed.",
          validationDetails(validationResults)
        );
      }

      await saveWorkingGraph(options.paths, graph);
      res.json({
        graph,
        actionSummary: summarizeGraphReplacement(previousGraph, graph, "Reverted working graph to source", "Revert to immutable source graph")
      });
    })
  );

  app.post(
    "/api/patch/validate",
    asyncRoute(async (req, res) => {
      const parsedRequest = validatePatchRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const workingGraph = await loadWorkingGraph(options.paths);
      res.json(validateGraphPatch(workingGraph, parsedRequest.data.patch));
    })
  );

  app.post(
    "/api/patch/apply",
    asyncRoute(async (req, res) => {
      const parsedRequest = applyPatchRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const workingGraph = await loadWorkingGraph(options.paths);
      const patchResult = applyGraphPatch(workingGraph, parsedRequest.data.patch);
      if (hasBlockers(patchResult.validationResults)) {
        throw new HttpError(
          422,
          "patch_validation_failed",
          "Patch validation failed; current working graph was not changed.",
          validationDetails(patchResult.validationResults)
        );
      }

      const graph = parseGraphState({
        ...patchResult.graph,
        stateType: "working",
        updatedAt: new Date().toISOString()
      });
      await saveWorkingGraph(options.paths, graph);
      res.json({
        graph,
        appliedPatch: patchResult.patch,
        validationResults: patchResult.validationResults,
        actionSummary: patchResult.actionSummary,
        changedElementIds: patchResult.changedElementIds
      });
    })
  );

  app.get(
    "/api/snapshots",
    asyncRoute(async (_req, res) => {
      res.json({ snapshots: await loadSnapshotsMeta(options.paths) });
    })
  );

  app.post(
    "/api/snapshots",
    asyncRoute(async (req, res) => {
      const parsedRequest = createSnapshotRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const timestamp = new Date().toISOString();
      const snapshotId = createSnapshotId();
      const workingGraph = await loadWorkingGraph(options.paths);
      const graph = snapshotGraphFromWorking(
        workingGraph,
        snapshotId,
        parsedRequest.data.name,
        timestamp,
        parsedRequest.data.layout
      );
      const validationResults = validateGraphState(graph);
      if (hasBlockers(validationResults)) {
        throw new HttpError(422, "invalid_snapshot_graph", "Snapshot graph validation failed; snapshot was not saved.", validationDetails(validationResults));
      }

      const snapshots = await loadSnapshotsMeta(options.paths);
      const snapshot = snapshotMetaFromGraph(graph, snapshotId, parsedRequest.data.name, timestamp, parsedRequest.data.notes, timestamp);
      await saveSnapshotGraph(options.paths, snapshotId, graph);
      await saveSnapshotsMeta(options.paths, [...snapshots, snapshot]);
      res.status(201).json({ snapshot });
    })
  );

  app.get(
    "/api/snapshots/:snapshotId",
    asyncRoute(async (req, res) => {
      const snapshotId = snapshotIdParam(req);
      const snapshots = await loadSnapshotsMeta(options.paths);
      const snapshot = findSnapshotMeta(snapshots, snapshotId);
      if (!snapshot) {
        throw new HttpError(404, "snapshot_not_found", `Snapshot '${snapshotId}' was not found.`);
      }

      const graph = await loadValidSnapshotGraph(options.paths, snapshotId);
      res.json({ snapshot, graph });
    })
  );

  app.post(
    "/api/snapshots/:snapshotId/load",
    asyncRoute(async (req, res) => {
      const snapshotId = snapshotIdParam(req);
      const snapshots = await loadSnapshotsMeta(options.paths);
      const snapshot = findSnapshotMeta(snapshots, snapshotId);
      if (!snapshot) {
        throw new HttpError(404, "snapshot_not_found", `Snapshot '${snapshotId}' was not found.`);
      }

      const previousGraph = await loadWorkingGraph(options.paths);
      const snapshotGraph = await loadValidSnapshotGraph(options.paths, snapshotId);
      const graph = workingGraphFromSnapshot(snapshotGraph, new Date().toISOString());
      const validationResults = validateGraphState(graph);
      if (hasBlockers(validationResults)) {
        throw new HttpError(
          422,
          "invalid_snapshot_graph",
          `Snapshot '${snapshotId}' cannot be loaded; current working graph was not changed.`,
          validationDetails(validationResults)
        );
      }

      await saveWorkingGraph(options.paths, graph);
      res.json({
        graph,
        snapshot,
        actionSummary: summarizeGraphReplacement(previousGraph, graph, `Loaded snapshot '${snapshot.name}'`, `Load snapshot ${snapshot.snapshotId}`)
      });
    })
  );

  app.post(
    "/api/snapshots/:snapshotId/duplicate",
    asyncRoute(async (req, res) => {
      const snapshotId = snapshotIdParam(req);
      const parsedRequest = duplicateSnapshotRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const snapshots = await loadSnapshotsMeta(options.paths);
      const sourceSnapshot = findSnapshotMeta(snapshots, snapshotId);
      if (!sourceSnapshot) {
        throw new HttpError(404, "snapshot_not_found", `Snapshot '${snapshotId}' was not found.`);
      }

      const sourceGraph = await loadValidSnapshotGraph(options.paths, snapshotId);
      const timestamp = new Date().toISOString();
      const duplicateSnapshotId = createSnapshotId();
      const graph = parseGraphState({
        ...sourceGraph,
        graphId: duplicateSnapshotId,
        name: parsedRequest.data.name,
        stateType: "snapshot",
        updatedAt: timestamp
      });
      const snapshot = snapshotMetaFromGraph(graph, duplicateSnapshotId, parsedRequest.data.name, timestamp, parsedRequest.data.notes, timestamp);
      await saveSnapshotGraph(options.paths, duplicateSnapshotId, graph);
      await saveSnapshotsMeta(options.paths, [...snapshots, snapshot]);
      res.status(201).json({ snapshot });
    })
  );

  app.use((_req, _res, next) => {
    next(new HttpError(404, "not_found", "Route not found."));
  });

  app.use(apiErrorHandler);

  return app;
}

const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (error instanceof HttpError) {
    sendApiError(res, error);
    return;
  }

  if (isJsonSyntaxError(error)) {
    sendApiError(res, new HttpError(400, "malformed_json", "Request body must be valid JSON."));
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown backend error";
  sendApiError(res, new HttpError(500, "internal_error", message));
};

function isJsonSyntaxError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }
  const maybeBodyParserError = error as SyntaxError & { status?: number; type?: string };
  return maybeBodyParserError.status === 400 || maybeBodyParserError.type === "entity.parse.failed";
}
