import type { ActionSummary, GraphEdge, GraphNode, GraphPatch, GraphState } from "@know-grow/shared";
import type { CanvasPosition, ElementSelection } from "./graphInteraction.js";

export type GraphMutationResult = {
  graph: GraphState;
  actionSummary: ActionSummary;
  changedElementIds: string[];
};

type IdKind = "node" | "edge";

export function cloneGraph(graph: GraphState): GraphState {
  return JSON.parse(JSON.stringify(graph)) as GraphState;
}

export function createEmptyFrontendSummary(instruction: string, title = "Graph updated"): ActionSummary {
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

export function nextElementId(graph: GraphState, kind: IdKind): string {
  return nextElementIds(graph, kind, 1)[0];
}

function nextElementIds(graph: GraphState, kind: IdKind, count: number): string[] {
  const prefix = kind === "node" ? "human-node" : "human-edge";
  const existing = new Set(kind === "node" ? graph.nodes.map((node) => node.id) : graph.edges.map((edge) => edge.id));
  const ids: string[] = [];
  let index = existing.size + 1;
  while (ids.length < count) {
    const id = `${prefix}-${index}`;
    if (!existing.has(id)) {
      ids.push(id);
      existing.add(id);
    }
    index += 1;
  }
  return ids;
}

export function addNodeToGraph(graph: GraphState, input: { label: string; type: string; position?: CanvasPosition }): GraphMutationResult {
  const next = cloneGraph(graph);
  const node: GraphNode = {
    id: nextElementId(next, "node"),
    label: input.label,
    type: input.type,
    origin: "human"
  };
  next.nodes.push(node);
  if (input.position) {
    next.layout = { ...(next.layout ?? {}), [node.id]: input.position };
  }
  const actionSummary = createEmptyFrontendSummary(`Add node '${node.label}'`, "Added node");
  actionSummary.addedNodes.push(node.id);
  return { graph: next, actionSummary, changedElementIds: [node.id] };
}

export function addEdgeToGraph(graph: GraphState, input: { source: string; target: string; label: string }): GraphMutationResult {
  const next = cloneGraph(graph);
  const edge: GraphEdge = {
    id: nextElementId(next, "edge"),
    source: input.source,
    target: input.target,
    label: input.label,
    origin: "human"
  };
  next.edges.push(edge);
  const actionSummary = createEmptyFrontendSummary(`Add edge '${edge.label}'`, "Added edge");
  actionSummary.addedEdges.push(edge.id);
  return { graph: next, actionSummary, changedElementIds: [edge.id] };
}

export function updateNodeInGraph(graph: GraphState, nodeId: string, changes: Partial<Pick<GraphNode, "label" | "type" | "notes">>): GraphMutationResult | null {
  const next = cloneGraph(graph);
  const node = next.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return null;
  }

  const nextLabel = changes.label ?? node.label;
  const nextType = changes.type ?? node.type;
  const nextNotes = normalizeNotes(changes.notes, node.notes);
  if (node.label === nextLabel && node.type === nextType && (node.notes ?? undefined) === nextNotes) {
    return null;
  }

  node.label = nextLabel;
  node.type = nextType;
  if (nextNotes === undefined) {
    delete node.notes;
  } else {
    node.notes = nextNotes;
  }

  const actionSummary = createEmptyFrontendSummary(`Update node '${nodeId}'`, "Updated node");
  actionSummary.updatedNodes.push(nodeId);
  return { graph: next, actionSummary, changedElementIds: [nodeId] };
}

export function updateEdgeInGraph(graph: GraphState, edgeId: string, changes: Partial<Pick<GraphEdge, "label" | "notes">>): GraphMutationResult | null {
  const next = cloneGraph(graph);
  const edge = next.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) {
    return null;
  }

  const nextLabel = changes.label ?? edge.label;
  const nextNotes = normalizeNotes(changes.notes, edge.notes);
  if (edge.label === nextLabel && (edge.notes ?? undefined) === nextNotes) {
    return null;
  }

  edge.label = nextLabel;
  if (nextNotes === undefined) {
    delete edge.notes;
  } else {
    edge.notes = nextNotes;
  }

  const actionSummary = createEmptyFrontendSummary(`Update edge '${edgeId}'`, "Updated edge");
  actionSummary.updatedEdges.push(edgeId);
  return { graph: next, actionSummary, changedElementIds: [edgeId] };
}

export function buildDeleteSelectionPatch(graph: GraphState, selection: ElementSelection): GraphPatch | null {
  const selectedNodeIds = [...new Set(selection.nodeIds)].filter((id) => graph.nodes.some((node) => node.id === id));
  const selectedEdgeIds = new Set(selection.edgeIds.filter((id) => graph.edges.some((edge) => edge.id === id)));
  const selectedNodeIdSet = new Set(selectedNodeIds);
  for (const edge of graph.edges) {
    if (selectedNodeIdSet.has(edge.source) || selectedNodeIdSet.has(edge.target)) {
      selectedEdgeIds.delete(edge.id);
    }
  }

  if (selectedNodeIds.length === 0 && selectedEdgeIds.size === 0) {
    return null;
  }

  return {
    patchId: `frontend-delete-${Date.now()}`,
    instruction: "Delete selected graph elements",
    summary: "Deleted selected graph elements.",
    operations: [
      ...[...selectedEdgeIds].map((id) => ({ op: "delete_edge" as const, id })),
      ...selectedNodeIds.map((id) => ({ op: "delete_node" as const, id, deleteIncidentEdges: true }))
    ]
  };
}

export function deleteSelectionFromGraph(graph: GraphState, selection: ElementSelection): GraphMutationResult | null {
  const selectedNodeIds = new Set(selection.nodeIds);
  const selectedEdgeIds = new Set(selection.edgeIds);
  if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) {
    return null;
  }

  const next = cloneGraph(graph);
  const deletedNodes = next.nodes.filter((node) => selectedNodeIds.has(node.id)).map((node) => node.id);
  const deletedEdges = next.edges
    .filter((edge) => selectedEdgeIds.has(edge.id) || selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target))
    .map((edge) => edge.id);

  if (deletedNodes.length === 0 && deletedEdges.length === 0) {
    return null;
  }

  const deletedNodeSet = new Set(deletedNodes);
  const deletedEdgeSet = new Set(deletedEdges);
  next.nodes = next.nodes.filter((node) => !deletedNodeSet.has(node.id));
  next.edges = next.edges.filter((edge) => !deletedEdgeSet.has(edge.id));
  if (next.layout) {
    next.layout = Object.fromEntries(Object.entries(next.layout).filter(([nodeId]) => !deletedNodeSet.has(nodeId)));
  }

  const actionSummary = createEmptyFrontendSummary("Delete selected graph elements", "Deleted selection");
  actionSummary.deletedNodes = deletedNodes;
  actionSummary.deletedEdges = deletedEdges;
  return { graph: next, actionSummary, changedElementIds: [...deletedNodes, ...deletedEdges] };
}

export function buildMergeSelectedPatch(graph: GraphState, nodeIds: string[], label: string, nodeType: string): GraphPatch | null {
  const uniqueNodeIds = [...new Set(nodeIds)];
  if (uniqueNodeIds.length < 2) {
    return null;
  }
  const inputNodes = uniqueNodeIds.map((id) => graph.nodes.find((node) => node.id === id));
  if (inputNodes.some((node) => !node)) {
    return null;
  }

  const inputSet = new Set(uniqueNodeIds);
  const outputNodeId = nextElementId(graph, "node");
  const crossingEdges = graph.edges.filter((edge) => inputSet.has(edge.source) !== inputSet.has(edge.target));
  const replacementEdgeIds = nextElementIds(graph, "edge", crossingEdges.length);
  const sourceNodeIds = uniqueNodeIds.flatMap((id) => {
    const node = graph.nodes.find((candidate) => candidate.id === id);
    return node?.sourceNodeIds?.length ? node.sourceNodeIds : [id];
  });

  return {
    patchId: `frontend-merge-${Date.now()}`,
    instruction: `Merge selected nodes: ${uniqueNodeIds.join(", ")}`,
    summary: `Merged ${uniqueNodeIds.length} selected nodes into '${label}'.`,
    operations: [
      {
        op: "merge_nodes",
        inputNodeIds: uniqueNodeIds,
        outputNode: {
          id: outputNodeId,
          label,
          type: nodeType,
          origin: "human",
          notes: `Merged from ${uniqueNodeIds.join(", ")}.`,
          sourceNodeIds: [...new Set(sourceNodeIds)]
        },
        replacementEdges: crossingEdges.map((edge, index) => ({
          ...edge,
          id: replacementEdgeIds[index],
          source: inputSet.has(edge.source) ? outputNodeId : edge.source,
          target: inputSet.has(edge.target) ? outputNodeId : edge.target,
          origin: "human" as const,
          sourceEdgeIds: edge.sourceEdgeIds?.length ? edge.sourceEdgeIds : [edge.id]
        })),
        deleteInputNodes: true
      }
    ]
  };
}

export function buildSplitNodePatch(graph: GraphState, inputNodeId: string, labels: string[], nodeType: string): GraphPatch | null {
  const inputNode = graph.nodes.find((node) => node.id === inputNodeId);
  const normalizedLabels = labels.map((label) => label.trim()).filter(Boolean);
  if (!inputNode || normalizedLabels.length < 2) {
    return null;
  }
  const outputNodeIds = nextElementIds(graph, "node", normalizedLabels.length);
  const outputNodes = normalizedLabels.map((label, index) => ({
    id: outputNodeIds[index],
    label,
    type: nodeType,
    origin: "human" as const,
    notes: `Split from ${inputNode.label}.`,
    sourceNodeIds: inputNode.sourceNodeIds?.length ? inputNode.sourceNodeIds : [inputNode.id]
  }));

  return {
    patchId: `frontend-split-${Date.now()}`,
    instruction: `Split selected node: ${inputNodeId}`,
    summary: `Split '${inputNode.label}' into ${normalizedLabels.length} nodes.`,
    operations: [
      {
        op: "split_node",
        inputNodeId,
        outputNodes,
        replacementEdges: [],
        deleteInputNode: true
      }
    ]
  };
}

function normalizeNotes(nextValue: string | undefined, currentValue: string | undefined): string | undefined {
  if (nextValue === undefined) {
    return currentValue;
  }
  const trimmed = nextValue.trim();
  return trimmed.length > 0 ? nextValue : undefined;
}
