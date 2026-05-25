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

export const listSnapshotsResponseSchema = z.object({
  snapshots: z.array(snapshotMetaSchema)
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
export type ListSnapshotsResponse = z.infer<typeof listSnapshotsResponseSchema>;

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
