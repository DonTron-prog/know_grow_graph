import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  piCoderRequestSchema,
  piCoderResponseSchema,
  piDirectEditRequestSchema,
  piDirectEditResponseSchema,
  replaceWorkingGraphRequestSchema,
  validateGraphPatch,
  validateGraphState,
  validatePatchRequestSchema,
  type ActionSummary,
  type GraphPatch,
  type GraphState,
  type PiCoderRequest,
  type PiCoderResponse,
  type PiDirectEditRequest,
  type PiDirectEditResponse,
  type SnapshotMeta,
  type ValidationResult
} from "@know-grow/shared";
import {
  asWorkingCopy,
  loadSnapshotsMeta,
  readJson,
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
  piAgentUrl?: string;
  piRequestTimeoutMs?: number;
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

function normalizePiAgentUrl(piAgentUrl: string): string {
  return piAgentUrl.endsWith("/") ? piAgentUrl.slice(0, -1) : piAgentUrl;
}

function createMockPiPatch(request: PiCoderRequest, workingGraph: GraphState): GraphPatch {
  const anchorNodeId = request.selectedNodeIds.find((id) => workingGraph.nodes.some((node) => node.id === id)) ?? workingGraph.nodes[0]?.id;
  const nodeId = uniqueElementId(workingGraph, "node", `pi-${slugify(request.instruction) || "suggestion"}`);
  const operations: GraphPatch["operations"] = [
    {
      op: "add_node",
      id: nodeId,
      label: request.instruction.trim() ? `Pi: ${request.instruction.trim().slice(0, 48)}` : "Pi suggested concept",
      nodeType: "concept",
      origin: "llm",
      notes: "Mock Pi patch proposal. Review and apply through the patch endpoint.",
      ...(anchorNodeId ? { sourceNodeIds: [anchorNodeId] } : {})
    }
  ];

  if (anchorNodeId) {
    operations.push({
      op: "add_edge",
      id: uniqueElementId(workingGraph, "edge", `edge-${anchorNodeId}-${nodeId}`),
      source: anchorNodeId,
      target: nodeId,
      label: "suggests",
      origin: "llm",
      notes: "Mock Pi relationship from selected or first node."
    });
  }

  return {
    patchId: `patch-${randomUUID()}`,
    instruction: request.instruction,
    summary: "Mock Pi patch proposal",
    operations
  };
}

function uniqueElementId(graph: GraphState, kind: "node" | "edge", preferredId: string): string {
  const existing = new Set((kind === "node" ? graph.nodes : graph.edges).map((element) => element.id));
  const safePreferred = preferredId.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || `pi-${kind}`;
  if (!existing.has(safePreferred)) {
    return safePreferred;
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${safePreferred}-${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
}

function responseFromPatch(request: PiCoderRequest, workingGraph: GraphState, patch: GraphPatch, rawPiOutput?: unknown): PiCoderResponse {
  const validation = validateGraphPatch(workingGraph, patch);
  const warnings = validation.validationResults.filter((result) => result.level === "warning").map((result) => result.message);
  return {
    message: hasBlockers(validation.validationResults)
      ? "Pi proposed a patch, but validation found blockers. The working graph was not changed."
      : "Pi proposed a patch. Review it in Actions/Raw, then apply it if acceptable.",
    mode: "patch",
    patch,
    actionSummary: validation.actionSummary,
    warnings,
    validationResults: validation.validationResults,
    rawPiOutput
  };
}

async function requestPiAgent(piAgentUrl: string, request: PiCoderRequest, timeoutMs: number): Promise<PiCoderResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizePiAgentUrl(piAgentUrl)}/api/pi/chat`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    const body = await response.json().catch(() => undefined) as unknown;
    if (!response.ok) {
      throw new HttpError(502, "pi_agent_error", `Pi agent returned HTTP ${response.status}.`, body);
    }
    const parsed = piCoderResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(502, "invalid_pi_response", "Pi agent returned an invalid response shape.", { issues: parsed.error.issues, body });
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "pi_agent_timeout", `Pi agent did not respond within ${timeoutMs}ms.`);
    }
    throw new HttpError(502, "pi_agent_unavailable", error instanceof Error ? error.message : "Pi agent is unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}

type DirectEditBackup = {
  sourceGraph: Buffer;
  workingGraph: Buffer;
  snapshotsMeta: Buffer;
  snapshotFiles: Map<string, Buffer>;
};

function checksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function backupDirectEditFiles(paths: BackendPaths): Promise<DirectEditBackup> {
  return {
    sourceGraph: await readFile(paths.sourceGraph),
    workingGraph: await readFile(paths.workingGraph),
    snapshotsMeta: await readFile(paths.snapshotsMeta),
    snapshotFiles: await readSnapshotFileBackups(paths)
  };
}

async function readSnapshotFileBackups(paths: BackendPaths): Promise<Map<string, Buffer>> {
  const backups = new Map<string, Buffer>();
  let entries: string[];
  try {
    entries = await readdir(paths.snapshotsDir);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return backups;
    }
    throw error;
  }

  for (const entry of entries) {
    if (entry.endsWith(".json")) {
      backups.set(entry, await readFile(join(paths.snapshotsDir, entry)));
    }
  }
  return backups;
}

async function restoreDirectEditFiles(paths: BackendPaths, backup: DirectEditBackup): Promise<void> {
  await mkdir(paths.snapshotsDir, { recursive: true });
  await writeFile(paths.sourceGraph, backup.sourceGraph);
  await writeFile(paths.workingGraph, backup.workingGraph);
  await writeFile(paths.snapshotsMeta, backup.snapshotsMeta);

  let currentSnapshotFiles: string[] = [];
  try {
    currentSnapshotFiles = (await readdir(paths.snapshotsDir)).filter((entry) => entry.endsWith(".json"));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }

  await Promise.all(
    currentSnapshotFiles
      .filter((entry) => !backup.snapshotFiles.has(entry))
      .map((entry) => rm(join(paths.snapshotsDir, entry), { force: true }))
  );
  await Promise.all([...backup.snapshotFiles].map(([entry, bytes]) => writeFile(join(paths.snapshotsDir, entry), bytes)));
}

async function requestPiAgentDirectEdit(piAgentUrl: string, request: PiDirectEditRequest, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizePiAgentUrl(piAgentUrl)}/api/pi/direct-edit`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    const body = await response.json().catch(() => undefined) as unknown;
    if (!response.ok) {
      throw new HttpError(502, "pi_agent_error", `Pi agent returned HTTP ${response.status}.`, body);
    }
    return body;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "pi_agent_timeout", `Pi agent did not respond within ${timeoutMs}ms.`);
    }
    throw new HttpError(502, "pi_agent_unavailable", error instanceof Error ? error.message : "Pi agent is unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}

async function createMockPiDirectEdit(paths: BackendPaths, request: PiDirectEditRequest, workingGraph: GraphState): Promise<unknown> {
  const patch = createMockPiPatch({ ...request, mode: "patch" }, workingGraph);
  const patchResult = applyGraphPatch(workingGraph, patch);
  if (hasBlockers(patchResult.validationResults)) {
    throw new HttpError(422, "mock_direct_edit_failed", "Mock Pi direct edit could not produce a valid graph patch.", validationDetails(patchResult.validationResults));
  }
  await saveWorkingGraph(paths, {
    ...patchResult.graph,
    stateType: "working",
    updatedAt: new Date().toISOString()
  });
  return { source: "backend_mock_direct_json", patch };
}

async function loadAndValidateDirectEditResult(paths: BackendPaths): Promise<{ graph: GraphState; snapshots: SnapshotMeta[]; validationResults: ValidationResult[] }> {
  const validationResults: ValidationResult[] = [];
  let workingParse: GraphState | null = null;
  try {
    const workingInput = await readJson(paths.workingGraph);
    const workingValidationResults = validateGraphState(workingInput);
    validationResults.push(...workingValidationResults);
    workingParse = hasBlockers(workingValidationResults) ? null : parseGraphState(workingInput);
  } catch (error) {
    validationResults.push({
      level: "blocker",
      code: "malformed_working_graph_file",
      message: error instanceof Error ? `working_graph.json could not be read as a valid graph: ${error.message}` : "working_graph.json could not be read as a valid graph."
    });
  }
  if (workingParse && workingParse.stateType !== "working") {
    validationResults.push({
      level: "blocker",
      code: "working_graph_state_type_changed",
      message: "Pi direct JSON edits must leave working_graph.json as a working graph."
    });
  }

  let snapshots: SnapshotMeta[] = [];
  try {
    snapshots = await loadSnapshotsMeta(paths);
  } catch (error) {
    validationResults.push({
      level: "blocker",
      code: "malformed_snapshots_meta",
      message: error instanceof Error ? `snapshots.json is invalid: ${error.message}` : "snapshots.json is invalid."
    });
  }

  for (const snapshot of snapshots) {
    try {
      const snapshotGraph = await readSnapshotGraph(paths, snapshot.snapshotId);
      const snapshotValidation = validateGraphState(snapshotGraph).map((result) => ({
        ...result,
        code: `snapshot_${result.code}`,
        message: `Snapshot '${snapshot.snapshotId}': ${result.message}`
      }));
      validationResults.push(...snapshotValidation);
    } catch (error) {
      validationResults.push({
        level: "blocker",
        code: "snapshot_graph_unreadable",
        message: error instanceof Error ? `Snapshot '${snapshot.snapshotId}' could not be read: ${error.message}` : `Snapshot '${snapshot.snapshotId}' could not be read.`,
        elementIds: [snapshot.snapshotId]
      });
    }
  }

  if (hasBlockers(validationResults) || !workingParse) {
    throw new HttpError(
      422,
      "invalid_direct_json_edit",
      "Pi direct JSON edit produced invalid graph files; backups were restored.",
      validationDetails(validationResults)
    );
  }

  return { graph: workingParse, snapshots, validationResults };
}

function changedIdsFromSummary(summary: ActionSummary): string[] {
  return [...new Set([
    ...summary.addedNodes,
    ...summary.updatedNodes,
    ...summary.deletedNodes,
    ...summary.addedEdges,
    ...summary.updatedEdges,
    ...summary.deletedEdges,
    ...summary.mergedNodes,
    ...summary.splitNodes
  ])];
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  const version = options.version ?? "0.1.0";
  const piAgentUrl = options.piAgentUrl ?? process.env.PI_AGENT_URL;
  const piRequestTimeoutMs = options.piRequestTimeoutMs ?? Number(process.env.PI_REQUEST_TIMEOUT_MS ?? 65_000);

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version, piCoderAvailable: options.piCoderAvailable ?? Boolean(piAgentUrl) });
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

  app.post(
    "/api/pi/chat",
    asyncRoute(async (req, res) => {
      const parsedRequest = piCoderRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const request = { ...parsedRequest.data, mode: parsedRequest.data.mode ?? "patch" } satisfies PiCoderRequest;
      if (request.mode === "direct_json") {
        throw new HttpError(400, "direct_json_not_supported", "Use /api/pi/direct-edit for direct JSON mode when that workflow is enabled.");
      }

      const workingGraph = await loadWorkingGraph(options.paths);
      if (!piAgentUrl) {
        res.json(responseFromPatch(request, workingGraph, createMockPiPatch(request, workingGraph), { source: "backend_mock" }));
        return;
      }

      const piResponse = await requestPiAgent(piAgentUrl, request, piRequestTimeoutMs);
      if (piResponse.mode !== "patch") {
        throw new HttpError(502, "invalid_pi_response", "Pi chat bridge must return patch mode for /api/pi/chat.", piResponse);
      }
      if (!piResponse.patch) {
        res.json({ ...piResponse, mode: "patch" });
        return;
      }

      res.json(responseFromPatch(request, workingGraph, piResponse.patch, piResponse.rawPiOutput ?? piResponse));
    })
  );

  app.post(
    "/api/pi/direct-edit",
    asyncRoute(async (req, res) => {
      const parsedRequest = piDirectEditRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        throw badRequestFromZod(parsedRequest.error.issues);
      }

      const request = { ...parsedRequest.data, mode: "direct_json" } satisfies PiDirectEditRequest;
      const beforeGraph = await loadWorkingGraph(options.paths);
      const backup = await backupDirectEditFiles(options.paths);
      const sourceChecksumBefore = checksum(backup.sourceGraph);
      let rawPiOutput: unknown;

      try {
        rawPiOutput = piAgentUrl
          ? await requestPiAgentDirectEdit(piAgentUrl, request, piRequestTimeoutMs)
          : await createMockPiDirectEdit(options.paths, request, beforeGraph);

        let sourceAfter: Buffer;
        try {
          sourceAfter = await readFile(options.paths.sourceGraph);
        } catch (error) {
          throw new HttpError(422, "invalid_direct_json_edit", "Pi direct JSON edit changed or removed immutable source_graph.json; backups were restored.", {
            validationResults: [{ level: "blocker", code: "source_graph_changed", message: error instanceof Error ? `source_graph.json could not be read after Pi direct JSON edit: ${error.message}` : "source_graph.json could not be read after Pi direct JSON edit." }]
          });
        }
        if (checksum(sourceAfter) !== sourceChecksumBefore) {
          throw new HttpError(422, "invalid_direct_json_edit", "Pi direct JSON edit changed immutable source_graph.json; backups were restored.", {
            validationResults: [{ level: "blocker", code: "source_graph_changed", message: "source_graph.json changed during Pi direct JSON edit." }]
          });
        }

        const directResult = await loadAndValidateDirectEditResult(options.paths);
        const acceptedGraph = parseGraphState({
          ...directResult.graph,
          stateType: "working",
          updatedAt: new Date().toISOString()
        });
        const actionSummary = summarizeGraphReplacement(beforeGraph, acceptedGraph, "Applied Pi direct JSON edit", request.instruction);
        const changedElementIds = changedIdsFromSummary(actionSummary);
        const warnings = directResult.validationResults.filter((result) => result.level === "warning").map((result) => result.message);
        await saveWorkingGraph(options.paths, acceptedGraph);
        const response: PiDirectEditResponse = {
          message: "Pi edited working graph JSON; backend reloaded and validated the result.",
          mode: "direct_json",
          graph: acceptedGraph,
          snapshots: directResult.snapshots,
          actionSummary,
          warnings,
          validationResults: directResult.validationResults,
          changedElementIds,
          rawPiOutput
        };
        res.json(piDirectEditResponseSchema.parse(response));
      } catch (error) {
        await restoreDirectEditFiles(options.paths, backup);
        throw error;
      }
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
