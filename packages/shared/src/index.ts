import { z } from "zod";

export const originSchema = z.enum(["source", "human", "llm", "imported", "unknown"]);
export const graphStateTypeSchema = z.enum(["source", "working", "snapshot"]);
export const layoutPositionSchema = z.object({ x: z.number(), y: z.number() });

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  type: z.string().min(1),
  origin: originSchema,
  notes: z.string().optional(),
  sourceNodeIds: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.unknown()).optional()
});

export const graphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string(),
  origin: originSchema,
  notes: z.string().optional(),
  sourceEdgeIds: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.unknown()).optional()
});

export const graphStateSchema = z.object({
  graphId: z.string().min(1),
  name: z.string().min(1),
  stateType: graphStateTypeSchema,
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  layout: z.record(z.string(), layoutPositionSchema).optional(),
  updatedAt: z.string().optional()
});

export const graphMetaSchema = z.object({
  graphId: z.string(),
  name: z.string(),
  stateType: graphStateTypeSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  readOnly: z.boolean(),
  updatedAt: z.string().optional()
});

export const snapshotMetaSchema = z.object({
  snapshotId: z.string().min(1),
  name: z.string().min(1),
  notes: z.string().optional(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string().optional()
});

const addNodeOpSchema = z.object({
  op: z.literal("add_node"),
  id: z.string().min(1),
  label: z.string(),
  nodeType: z.string().min(1),
  origin: z.enum(["llm", "human"]),
  notes: z.string().optional(),
  sourceNodeIds: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.unknown()).optional()
});

const updateNodeOpSchema = z.object({
  op: z.literal("update_node"),
  id: z.string().min(1),
  changes: graphNodeSchema.pick({ label: true, type: true, notes: true, properties: true }).partial()
});

const deleteNodeOpSchema = z.object({
  op: z.literal("delete_node"),
  id: z.string().min(1),
  deleteIncidentEdges: z.boolean().optional()
});

const addEdgeOpSchema = z.object({
  op: z.literal("add_edge"),
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string(),
  origin: z.enum(["llm", "human"]),
  notes: z.string().optional(),
  sourceEdgeIds: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.unknown()).optional()
});

const updateEdgeOpSchema = z.object({
  op: z.literal("update_edge"),
  id: z.string().min(1),
  changes: graphEdgeSchema.pick({ label: true, notes: true, properties: true }).partial()
});

const deleteEdgeOpSchema = z.object({
  op: z.literal("delete_edge"),
  id: z.string().min(1)
});

const mergeNodesOpSchema = z.object({
  op: z.literal("merge_nodes"),
  inputNodeIds: z.array(z.string().min(1)).min(2),
  outputNode: graphNodeSchema,
  replacementEdges: z.array(graphEdgeSchema).optional(),
  deleteInputNodes: z.boolean()
});

const splitNodeOpSchema = z.object({
  op: z.literal("split_node"),
  inputNodeId: z.string().min(1),
  outputNodes: z.array(graphNodeSchema).min(1),
  replacementEdges: z.array(graphEdgeSchema).optional(),
  deleteInputNode: z.boolean()
});

export const graphPatchOperationSchema = z.discriminatedUnion("op", [
  addNodeOpSchema,
  updateNodeOpSchema,
  deleteNodeOpSchema,
  addEdgeOpSchema,
  updateEdgeOpSchema,
  deleteEdgeOpSchema,
  mergeNodesOpSchema,
  splitNodeOpSchema
]);

export const graphPatchSchema = z.object({
  patchId: z.string().min(1),
  instruction: z.string(),
  summary: z.string(),
  operations: z.array(graphPatchOperationSchema)
});

export const validationResultSchema = z.object({
  level: z.enum(["blocker", "warning", "info"]),
  code: z.string(),
  message: z.string(),
  elementIds: z.array(z.string()).optional(),
  operationIndex: z.number().int().nonnegative().optional()
});

export const actionSummarySchema = z.object({
  title: z.string(),
  instruction: z.string(),
  addedNodes: z.array(z.string()),
  updatedNodes: z.array(z.string()),
  deletedNodes: z.array(z.string()),
  addedEdges: z.array(z.string()),
  updatedEdges: z.array(z.string()),
  deletedEdges: z.array(z.string()),
  mergedNodes: z.array(z.string()),
  splitNodes: z.array(z.string()),
  warnings: z.array(z.string())
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  piCoderAvailable: z.boolean()
});

export const replaceWorkingGraphRequestSchema = z.object({
  graph: graphStateSchema
});

export const replaceWorkingGraphResponseSchema = z.object({
  graph: graphStateSchema,
  validationResults: z.array(validationResultSchema)
});

export const validatePatchRequestSchema = z.object({
  patch: z.unknown()
});

export const validatePatchResponseSchema = z.object({
  valid: z.boolean(),
  validationResults: z.array(validationResultSchema),
  actionSummary: actionSummarySchema
});

export const applyPatchRequestSchema = validatePatchRequestSchema;

export const applyPatchResponseSchema = z.object({
  graph: graphStateSchema,
  appliedPatch: graphPatchSchema,
  validationResults: z.array(validationResultSchema),
  actionSummary: actionSummarySchema,
  changedElementIds: z.array(z.string())
});

export const listSnapshotsResponseSchema = z.object({
  snapshots: z.array(snapshotMetaSchema)
});

export const createSnapshotRequestSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  layout: z.record(z.string(), layoutPositionSchema).optional()
});

export const createSnapshotResponseSchema = z.object({
  snapshot: snapshotMetaSchema
});

export const getSnapshotResponseSchema = z.object({
  snapshot: snapshotMetaSchema,
  graph: graphStateSchema
});

export const loadSnapshotResponseSchema = z.object({
  graph: graphStateSchema,
  snapshot: snapshotMetaSchema,
  actionSummary: actionSummarySchema
});

export const duplicateSnapshotRequestSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional()
});

export const duplicateSnapshotResponseSchema = z.object({
  snapshot: snapshotMetaSchema
});

export const revertToSourceResponseSchema = z.object({
  graph: graphStateSchema,
  actionSummary: actionSummarySchema
});

export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphState = z.infer<typeof graphStateSchema>;
export type GraphMeta = z.infer<typeof graphMetaSchema>;
export type SnapshotMeta = z.infer<typeof snapshotMetaSchema>;
export type GraphPatchOperation = z.infer<typeof graphPatchOperationSchema>;
export type GraphPatch = z.infer<typeof graphPatchSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type ActionSummary = z.infer<typeof actionSummarySchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReplaceWorkingGraphRequest = z.infer<typeof replaceWorkingGraphRequestSchema>;
export type ReplaceWorkingGraphResponse = z.infer<typeof replaceWorkingGraphResponseSchema>;
export type ValidatePatchRequest = z.infer<typeof validatePatchRequestSchema>;
export type ValidatePatchResponse = z.infer<typeof validatePatchResponseSchema>;
export type ApplyPatchRequest = z.infer<typeof applyPatchRequestSchema>;
export type ApplyPatchResponse = z.infer<typeof applyPatchResponseSchema>;
export type ListSnapshotsResponse = z.infer<typeof listSnapshotsResponseSchema>;
export type CreateSnapshotRequest = z.infer<typeof createSnapshotRequestSchema>;
export type CreateSnapshotResponse = z.infer<typeof createSnapshotResponseSchema>;
export type GetSnapshotResponse = z.infer<typeof getSnapshotResponseSchema>;
export type LoadSnapshotResponse = z.infer<typeof loadSnapshotResponseSchema>;
export type DuplicateSnapshotRequest = z.infer<typeof duplicateSnapshotRequestSchema>;
export type DuplicateSnapshotResponse = z.infer<typeof duplicateSnapshotResponseSchema>;
export type RevertToSourceResponse = z.infer<typeof revertToSourceResponseSchema>;

export function graphMetaFromState(graph: GraphState, readOnly = graph.stateType === "source"): GraphMeta {
  return {
    graphId: graph.graphId,
    name: graph.name,
    stateType: graph.stateType,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    readOnly,
    updatedAt: graph.updatedAt
  };
}

export function validateGraphState(input: unknown): ValidationResult[] {
  const parsed = graphStateSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      level: "blocker",
      code: "malformed_graph",
      message: `${issue.path.join(".") || "graph"}: ${issue.message}`
    }));
  }

  const graph = parsed.data;
  const results: ValidationResult[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      results.push({
        level: "blocker",
        code: "duplicate_node_id",
        message: `Duplicate node id '${node.id}'.`,
        elementIds: [node.id]
      });
    }
    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      results.push({
        level: "blocker",
        code: "duplicate_edge_id",
        message: `Duplicate edge id '${edge.id}'.`,
        elementIds: [edge.id]
      });
    }
    edgeIds.add(edge.id);

    const missingEndpoints = [edge.source, edge.target].filter((id) => !nodeIds.has(id));
    if (missingEndpoints.length > 0) {
      results.push({
        level: "blocker",
        code: "dangling_edge_endpoint",
        message: `Edge '${edge.id}' references missing node(s): ${missingEndpoints.join(", ")}.`,
        elementIds: [edge.id, ...missingEndpoints]
      });
    }
  }

  if (graph.layout) {
    for (const nodeId of Object.keys(graph.layout)) {
      if (!nodeIds.has(nodeId)) {
        results.push({
          level: "warning",
          code: "layout_for_missing_node",
          message: `Layout contains coordinates for missing node '${nodeId}'.`,
          elementIds: [nodeId]
        });
      }
    }
  }

  return results;
}

export function parseGraphState(input: unknown): GraphState {
  const parsed = graphStateSchema.parse(input);
  const blockers = validateGraphState(parsed).filter((result) => result.level === "blocker");
  if (blockers.length > 0) {
    throw new Error(blockers.map((blocker) => blocker.message).join("; "));
  }
  return parsed;
}

export function hasBlockers(results: ValidationResult[]): boolean {
  return results.some((result) => result.level === "blocker");
}

type PatchEvaluation = {
  patch?: GraphPatch;
  validationResults: ValidationResult[];
  actionSummary: ActionSummary;
  graph: GraphState;
  changedElementIds: string[];
};

const MANY_NODE_DELETE_THRESHOLD = 5;
const MANY_SOURCE_EDGE_DELETE_THRESHOLD = 5;

export function createEmptyActionSummary(instruction = "", title = "No graph changes"): ActionSummary {
  return {
    title,
    instruction,
    addedNodes: [],
    updatedNodes: [],
    deletedNodes: [],
    addedEdges: [],
    updatedEdges: [],
    deletedEdges: [],
    mergedNodes: [],
    splitNodes: [],
    warnings: []
  };
}

export function validateGraphPatch(baseGraphInput: unknown, patchInput: unknown): ValidatePatchResponse {
  const evaluation = evaluateGraphPatch(baseGraphInput, patchInput);
  return {
    valid: !hasBlockers(evaluation.validationResults),
    validationResults: evaluation.validationResults,
    actionSummary: evaluation.actionSummary
  };
}

export function applyGraphPatch(baseGraphInput: unknown, patchInput: unknown): PatchEvaluation {
  return evaluateGraphPatch(baseGraphInput, patchInput);
}

function evaluateGraphPatch(baseGraphInput: unknown, patchInput: unknown): PatchEvaluation {
  const baseGraphResults = validateGraphState(baseGraphInput);
  const fallbackGraph = graphStateSchema.safeParse(baseGraphInput).success
    ? graphStateSchema.parse(baseGraphInput)
    : emptyFallbackGraph();
  const patchParse = graphPatchSchema.safeParse(patchInput);
  const actionSummary = createEmptyActionSummary(
    typeof patchInput === "object" && patchInput !== null && "instruction" in patchInput
      ? String((patchInput as { instruction?: unknown }).instruction ?? "")
      : "",
    typeof patchInput === "object" && patchInput !== null && "summary" in patchInput
      ? String((patchInput as { summary?: unknown }).summary ?? "Patch validation failed")
      : "Patch validation failed"
  );

  if (baseGraphResults.some((result) => result.level === "blocker")) {
    return {
      validationResults: baseGraphResults,
      actionSummary,
      graph: fallbackGraph,
      changedElementIds: []
    };
  }

  const baseGraph = parseGraphState(baseGraphInput);
  if (baseGraph.stateType === "source") {
    return {
      validationResults: [
        {
          level: "blocker",
          code: "source_graph_mutation",
          message: "Patches may only mutate the working graph, not the immutable source graph."
        }
      ],
      actionSummary,
      graph: baseGraph,
      changedElementIds: []
    };
  }

  if (!patchParse.success) {
    const validationResults = patchParse.error.issues.map((issue) => ({
      level: "blocker" as const,
      code: issue.path.includes("op") ? "unknown_operation" : "malformed_patch",
      message: `${issue.path.join(".") || "patch"}: ${issue.message}`
    }));
    return { validationResults, actionSummary, graph: baseGraph, changedElementIds: [] };
  }

  const patch = patchParse.data;
  const workingGraph: GraphState = cloneGraph(baseGraph);
  const results: ValidationResult[] = [];
  const summary = createEmptyActionSummary(patch.instruction, patch.summary || "Graph patch");
  const changedElementIds = new Set<string>();
  const deletedSourceEdgeIds = new Set<string>();
  const implicitlyDeletedEdgeIds = new Set<string>();

  const addWarning = (code: string, message: string, operationIndex?: number, elementIds?: string[]) => {
    results.push({ level: "warning", code, message, ...(operationIndex === undefined ? {} : { operationIndex }), ...(elementIds ? { elementIds } : {}) });
    summary.warnings.push(message);
  };
  const addBlocker = (code: string, message: string, operationIndex?: number, elementIds?: string[]) => {
    results.push({ level: "blocker", code, message, ...(operationIndex === undefined ? {} : { operationIndex }), ...(elementIds ? { elementIds } : {}) });
  };

  const noteMissingRationale = (operation: GraphPatchOperation, operationIndex: number) => {
    const hasNotes = "notes" in operation && typeof operation.notes === "string" && operation.notes.trim().length > 0;
    if (!hasNotes) {
      addWarning("operation_missing_notes", `Operation ${operationIndex + 1} has no notes or rationale.`, operationIndex);
    }
  };

  for (const [operationIndex, operation] of patch.operations.entries()) {
    const blockersBefore = results.filter((result) => result.level === "blocker").length;
    noteMissingRationale(operation, operationIndex);

    if (isNoOpAfterPriorOperation(workingGraph, operation, implicitlyDeletedEdgeIds)) {
      continue;
    }

    switch (operation.op) {
      case "add_node": {
        if (findNode(workingGraph, operation.id)) {
          addBlocker("duplicate_node_id", `Node '${operation.id}' already exists.`, operationIndex, [operation.id]);
          break;
        }
        if (operation.origin === "llm" && (!operation.sourceNodeIds || operation.sourceNodeIds.length === 0)) {
          addWarning("llm_node_missing_source_refs", `LLM-created node '${operation.id}' has no source refs.`, operationIndex, [operation.id]);
        }
        workingGraph.nodes.push({
          id: operation.id,
          label: operation.label,
          type: operation.nodeType,
          origin: operation.origin,
          ...(operation.notes === undefined ? {} : { notes: operation.notes }),
          ...(operation.sourceNodeIds === undefined ? {} : { sourceNodeIds: [...operation.sourceNodeIds] }),
          ...(operation.properties === undefined ? {} : { properties: { ...operation.properties } })
        });
        summary.addedNodes.push(operation.id);
        changedElementIds.add(operation.id);
        break;
      }
      case "update_node": {
        const node = findNode(workingGraph, operation.id);
        if (!node) {
          addBlocker("missing_node", `Cannot update missing node '${operation.id}'.`, operationIndex, [operation.id]);
          break;
        }
        Object.assign(node, cloneUnknown(operation.changes));
        summary.updatedNodes.push(operation.id);
        changedElementIds.add(operation.id);
        break;
      }
      case "delete_node": {
        const node = findNode(workingGraph, operation.id);
        if (!node) {
          addBlocker("missing_node", `Cannot delete missing node '${operation.id}'.`, operationIndex, [operation.id]);
          break;
        }
        const incidentEdges = workingGraph.edges.filter((edge) => edge.source === operation.id || edge.target === operation.id);
        if (incidentEdges.length > 0 && !operation.deleteIncidentEdges) {
          addBlocker(
            "delete_node_would_leave_dangling_edges",
            `Cannot delete node '${operation.id}' without deleting incident edges: ${incidentEdges.map((edge) => edge.id).join(", ")}.`,
            operationIndex,
            [operation.id, ...incidentEdges.map((edge) => edge.id)]
          );
          break;
        }
        if (node.origin === "source") {
          addWarning("delete_source_origin_node", `Patch deletes source-origin working node '${operation.id}'.`, operationIndex, [operation.id]);
        }
        const incidentEdgeIds = new Set(incidentEdges.map((edge) => edge.id));
        const explicitIncidentDeletes = patch.operations
          .slice(operationIndex + 1)
          .filter((futureOperation): futureOperation is Extract<GraphPatchOperation, { op: "delete_edge" }> => futureOperation.op === "delete_edge" && incidentEdgeIds.has(futureOperation.id))
          .map((futureOperation) => futureOperation.id);
        for (const edgeId of explicitIncidentDeletes) {
          addWarning("delete_edge_already_removed", `Edge '${edgeId}' is already removed by deleting node '${operation.id}'.`, operationIndex, [edgeId]);
        }
        deleteNodeById(workingGraph, operation.id);
        summary.deletedNodes.push(operation.id);
        changedElementIds.add(operation.id);
        for (const edge of incidentEdges) {
          if (edge.origin === "source") {
            deletedSourceEdgeIds.add(edge.id);
          }
          implicitlyDeletedEdgeIds.add(edge.id);
          deleteEdgeById(workingGraph, edge.id);
          summary.deletedEdges.push(edge.id);
          changedElementIds.add(edge.id);
        }
        break;
      }
      case "add_edge": {
        if (findEdge(workingGraph, operation.id)) {
          addBlocker("duplicate_edge_id", `Edge '${operation.id}' already exists.`, operationIndex, [operation.id]);
          break;
        }
        const missingEndpoints = [operation.source, operation.target].filter((id) => !findNode(workingGraph, id));
        if (missingEndpoints.length > 0) {
          addBlocker(
            "edge_references_missing_node",
            `Edge '${operation.id}' references missing node(s): ${missingEndpoints.join(", ")}.`,
            operationIndex,
            [operation.id, ...missingEndpoints]
          );
          break;
        }
        workingGraph.edges.push({
          id: operation.id,
          source: operation.source,
          target: operation.target,
          label: operation.label,
          origin: operation.origin,
          ...(operation.notes === undefined ? {} : { notes: operation.notes }),
          ...(operation.sourceEdgeIds === undefined ? {} : { sourceEdgeIds: [...operation.sourceEdgeIds] }),
          ...(operation.properties === undefined ? {} : { properties: { ...operation.properties } })
        });
        summary.addedEdges.push(operation.id);
        changedElementIds.add(operation.id);
        break;
      }
      case "update_edge": {
        const edge = findEdge(workingGraph, operation.id);
        if (!edge) {
          addBlocker("missing_edge", `Cannot update missing edge '${operation.id}'.`, operationIndex, [operation.id]);
          break;
        }
        Object.assign(edge, cloneUnknown(operation.changes));
        summary.updatedEdges.push(operation.id);
        changedElementIds.add(operation.id);
        break;
      }
      case "delete_edge": {
        const edge = findEdge(workingGraph, operation.id);
        if (!edge) {
          addBlocker("missing_edge", `Cannot delete missing edge '${operation.id}'.`, operationIndex, [operation.id]);
          break;
        }
        if (edge.origin === "source") {
          deletedSourceEdgeIds.add(edge.id);
          addWarning("delete_source_origin_edge", `Patch deletes source-origin working edge '${operation.id}'.`, operationIndex, [operation.id]);
        }
        deleteEdgeById(workingGraph, operation.id);
        summary.deletedEdges.push(operation.id);
        changedElementIds.add(operation.id);
        break;
      }
      case "merge_nodes": {
        applyMergeNodes(workingGraph, operation, operationIndex, addBlocker, addWarning, summary, changedElementIds, deletedSourceEdgeIds, implicitlyDeletedEdgeIds);
        break;
      }
      case "split_node": {
        applySplitNode(workingGraph, operation, operationIndex, addBlocker, addWarning, summary, changedElementIds, deletedSourceEdgeIds, implicitlyDeletedEdgeIds);
        break;
      }
    }

    if (results.filter((result) => result.level === "blocker").length > blockersBefore) {
      continue;
    }
  }

  if (summary.deletedNodes.length > MANY_NODE_DELETE_THRESHOLD) {
    addWarning("many_nodes_deleted", `Patch deletes ${summary.deletedNodes.length} nodes.`);
  }
  if (deletedSourceEdgeIds.size > MANY_SOURCE_EDGE_DELETE_THRESHOLD) {
    addWarning("many_source_edges_removed", `Patch removes ${deletedSourceEdgeIds.size} source-derived edges.`);
  }

  const finalValidationResults = validateGraphState(workingGraph).map((result) => ({ ...result, code: postApplyCode(result.code) }));
  results.push(...finalValidationResults);

  if (!hasBlockers(results) && hasDisconnectedComponents(workingGraph)) {
    addWarning("disconnected_components", "Patch creates disconnected graph components.");
  }

  return {
    patch,
    validationResults: results,
    actionSummary: summary,
    graph: hasBlockers(results) ? baseGraph : workingGraph,
    changedElementIds: hasBlockers(results) ? [] : [...changedElementIds]
  };
}

function applyMergeNodes(
  graph: GraphState,
  operation: Extract<GraphPatchOperation, { op: "merge_nodes" }>,
  operationIndex: number,
  addBlocker: (code: string, message: string, operationIndex?: number, elementIds?: string[]) => void,
  addWarning: (code: string, message: string, operationIndex?: number, elementIds?: string[]) => void,
  summary: ActionSummary,
  changedElementIds: Set<string>,
  deletedSourceEdgeIds: Set<string>,
  implicitlyDeletedEdgeIds: Set<string>
): void {
  const inputIds = new Set(operation.inputNodeIds);
  if (inputIds.size !== operation.inputNodeIds.length) {
    addBlocker("duplicate_input_node_id", "Merge input node ids must be unique.", operationIndex, operation.inputNodeIds);
    return;
  }
  const missingInputIds = operation.inputNodeIds.filter((id) => !findNode(graph, id));
  if (missingInputIds.length > 0) {
    addBlocker("missing_node", `Cannot merge missing node(s): ${missingInputIds.join(", ")}.`, operationIndex, missingInputIds);
    return;
  }
  const outputConflict = findNode(graph, operation.outputNode.id);
  if (outputConflict && (!operation.deleteInputNodes || !inputIds.has(operation.outputNode.id))) {
    addBlocker("duplicate_node_id", `Merge output node '${operation.outputNode.id}' conflicts with an existing node.`, operationIndex, [operation.outputNode.id]);
    return;
  }
  if (operation.outputNode.origin === "llm" && (!operation.outputNode.sourceNodeIds || operation.outputNode.sourceNodeIds.length === 0)) {
    addWarning("llm_node_missing_source_refs", `LLM-created merge output node '${operation.outputNode.id}' has no source refs.`, operationIndex, [operation.outputNode.id]);
  }

  if (operation.deleteInputNodes) {
    const incidentEdges = graph.edges.filter((edge) => inputIds.has(edge.source) || inputIds.has(edge.target));
    for (const edge of incidentEdges) {
      if (edge.origin === "source") {
        deletedSourceEdgeIds.add(edge.id);
      }
      implicitlyDeletedEdgeIds.add(edge.id);
      deleteEdgeById(graph, edge.id);
      summary.deletedEdges.push(edge.id);
      changedElementIds.add(edge.id);
    }
    for (const nodeId of operation.inputNodeIds) {
      const node = findNode(graph, nodeId);
      if (node?.origin === "source") {
        addWarning("delete_source_origin_node", `Patch deletes source-origin working node '${nodeId}'.`, operationIndex, [nodeId]);
      }
      deleteNodeById(graph, nodeId);
      summary.deletedNodes.push(nodeId);
      changedElementIds.add(nodeId);
    }
  }

  upsertOutputNode(graph, operation.outputNode);
  summary.addedNodes.push(operation.outputNode.id);
  summary.mergedNodes.push(...operation.inputNodeIds, operation.outputNode.id);
  changedElementIds.add(operation.outputNode.id);
  appendReplacementEdges(graph, operation.replacementEdges ?? [], operationIndex, addBlocker, summary, changedElementIds);
}

function applySplitNode(
  graph: GraphState,
  operation: Extract<GraphPatchOperation, { op: "split_node" }>,
  operationIndex: number,
  addBlocker: (code: string, message: string, operationIndex?: number, elementIds?: string[]) => void,
  addWarning: (code: string, message: string, operationIndex?: number, elementIds?: string[]) => void,
  summary: ActionSummary,
  changedElementIds: Set<string>,
  deletedSourceEdgeIds: Set<string>,
  implicitlyDeletedEdgeIds: Set<string>
): void {
  const inputNode = findNode(graph, operation.inputNodeId);
  if (!inputNode) {
    addBlocker("missing_node", `Cannot split missing node '${operation.inputNodeId}'.`, operationIndex, [operation.inputNodeId]);
    return;
  }
  const outputIds = new Set(operation.outputNodes.map((node) => node.id));
  if (outputIds.size !== operation.outputNodes.length) {
    addBlocker("duplicate_node_id", "Split output node ids must be unique.", operationIndex, operation.outputNodes.map((node) => node.id));
    return;
  }
  const conflictingOutputIds = operation.outputNodes
    .map((node) => node.id)
    .filter((id) => findNode(graph, id) && (!operation.deleteInputNode || id !== operation.inputNodeId));
  if (conflictingOutputIds.length > 0) {
    addBlocker("duplicate_node_id", `Split output node id(s) already exist: ${conflictingOutputIds.join(", ")}.`, operationIndex, conflictingOutputIds);
    return;
  }
  for (const node of operation.outputNodes) {
    if (node.origin === "llm" && (!node.sourceNodeIds || node.sourceNodeIds.length === 0)) {
      addWarning("llm_node_missing_source_refs", `LLM-created split output node '${node.id}' has no source refs.`, operationIndex, [node.id]);
    }
  }

  if (operation.deleteInputNode) {
    const incidentEdges = graph.edges.filter((edge) => edge.source === operation.inputNodeId || edge.target === operation.inputNodeId);
    for (const edge of incidentEdges) {
      if (edge.origin === "source") {
        deletedSourceEdgeIds.add(edge.id);
      }
      implicitlyDeletedEdgeIds.add(edge.id);
      deleteEdgeById(graph, edge.id);
      summary.deletedEdges.push(edge.id);
      changedElementIds.add(edge.id);
    }
    if (inputNode.origin === "source") {
      addWarning("delete_source_origin_node", `Patch deletes source-origin working node '${operation.inputNodeId}'.`, operationIndex, [operation.inputNodeId]);
    }
    deleteNodeById(graph, operation.inputNodeId);
    summary.deletedNodes.push(operation.inputNodeId);
    changedElementIds.add(operation.inputNodeId);
  }

  for (const outputNode of operation.outputNodes) {
    upsertOutputNode(graph, outputNode);
    summary.addedNodes.push(outputNode.id);
    summary.splitNodes.push(outputNode.id);
    changedElementIds.add(outputNode.id);
  }
  summary.splitNodes.unshift(operation.inputNodeId);
  appendReplacementEdges(graph, operation.replacementEdges ?? [], operationIndex, addBlocker, summary, changedElementIds);
}

function isNoOpAfterPriorOperation(graph: GraphState, operation: GraphPatchOperation, implicitlyDeletedEdgeIds: Set<string>): boolean {
  if (operation.op === "delete_edge") {
    return !findEdge(graph, operation.id) && implicitlyDeletedEdgeIds.has(operation.id);
  }
  return false;
}

function appendReplacementEdges(
  graph: GraphState,
  replacementEdges: GraphEdge[],
  operationIndex: number,
  addBlocker: (code: string, message: string, operationIndex?: number, elementIds?: string[]) => void,
  summary: ActionSummary,
  changedElementIds: Set<string>
): void {
  for (const edge of replacementEdges) {
    if (findEdge(graph, edge.id)) {
      addBlocker("duplicate_edge_id", `Replacement edge '${edge.id}' conflicts with an existing edge.`, operationIndex, [edge.id]);
      continue;
    }
    const missingEndpoints = [edge.source, edge.target].filter((id) => !findNode(graph, id));
    if (missingEndpoints.length > 0) {
      addBlocker("edge_references_missing_node", `Replacement edge '${edge.id}' references missing node(s): ${missingEndpoints.join(", ")}.`, operationIndex, [edge.id, ...missingEndpoints]);
      continue;
    }
    graph.edges.push(cloneUnknown(edge));
    summary.addedEdges.push(edge.id);
    changedElementIds.add(edge.id);
  }
}

function upsertOutputNode(graph: GraphState, node: GraphNode): void {
  const existingIndex = graph.nodes.findIndex((existingNode) => existingNode.id === node.id);
  const clonedNode = cloneUnknown(node);
  if (existingIndex >= 0) {
    graph.nodes[existingIndex] = clonedNode;
  } else {
    graph.nodes.push(clonedNode);
  }
}

function cloneGraph(graph: GraphState): GraphState {
  return cloneUnknown(graph);
}

function cloneUnknown<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findNode(graph: GraphState, id: string): GraphNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

function findEdge(graph: GraphState, id: string): GraphEdge | undefined {
  return graph.edges.find((edge) => edge.id === id);
}

function deleteNodeById(graph: GraphState, id: string): void {
  graph.nodes = graph.nodes.filter((node) => node.id !== id);
  if (graph.layout) {
    delete graph.layout[id];
  }
}

function deleteEdgeById(graph: GraphState, id: string): void {
  graph.edges = graph.edges.filter((edge) => edge.id !== id);
}

function hasDisconnectedComponents(graph: GraphState): boolean {
  if (graph.nodes.length <= 1) {
    return false;
  }
  const adjacency = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const [firstNode] = graph.nodes;
  if (!firstNode) {
    return false;
  }
  const visited = new Set<string>();
  const stack = [firstNode.id];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (!visited.has(next)) {
        stack.push(next);
      }
    }
  }
  return visited.size !== graph.nodes.length;
}

function postApplyCode(code: string): string {
  if (code === "duplicate_node_id" || code === "duplicate_edge_id" || code === "dangling_edge_endpoint") {
    return `post_apply_${code}`;
  }
  return code;
}

function emptyFallbackGraph(): GraphState {
  return {
    graphId: "invalid",
    name: "Invalid graph",
    stateType: "working",
    nodes: [],
    edges: []
  };
}
