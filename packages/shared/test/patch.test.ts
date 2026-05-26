import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGraphPatch,
  hasBlockers,
  validateGraphPatch,
  type GraphPatch,
  type GraphState
} from "../src/index.ts";

const baseGraph: GraphState = {
  graphId: "working-test",
  name: "Working Test Graph",
  stateType: "working",
  nodes: [
    { id: "a", label: "A", type: "concept", origin: "source" },
    { id: "b", label: "B", type: "concept", origin: "human" }
  ],
  edges: [{ id: "edge-a-b", source: "a", target: "b", label: "relates", origin: "source" }]
};

test("validateGraphPatch reports blockers without mutating the input graph", () => {
  const patch: GraphPatch = {
    patchId: "patch-invalid-delete",
    instruction: "Delete A",
    summary: "Delete A without incident edges",
    operations: [{ op: "delete_node", id: "a" }]
  };

  const result = validateGraphPatch(baseGraph, patch);

  assert.equal(result.valid, false);
  assert.ok(result.validationResults.some((validation) => validation.code === "delete_node_would_leave_dangling_edges"));
  assert.equal(baseGraph.nodes.length, 2);
  assert.equal(baseGraph.edges.length, 1);
});

test("applyGraphPatch applies add/update/delete operations immutably and summarizes changes", () => {
  const patch: GraphPatch = {
    patchId: "patch-basic-mutations",
    instruction: "Add and update graph concepts",
    summary: "Add C, update B, delete A and its incident edge",
    operations: [
      {
        op: "add_node",
        id: "c",
        label: "C",
        nodeType: "concept",
        origin: "llm",
        notes: "New concept inferred from the instruction.",
        sourceNodeIds: ["a"]
      },
      { op: "update_node", id: "b", changes: { label: "B updated" } },
      { op: "delete_node", id: "a", deleteIncidentEdges: true },
      { op: "delete_edge", id: "edge-a-b" }
    ]
  };

  const result = applyGraphPatch(baseGraph, patch);

  assert.equal(hasBlockers(result.validationResults), false);
  assert.deepEqual(result.actionSummary.addedNodes, ["c"]);
  assert.deepEqual(result.actionSummary.updatedNodes, ["b"]);
  assert.deepEqual(result.actionSummary.deletedNodes, ["a"]);
  assert.deepEqual(result.actionSummary.deletedEdges, ["edge-a-b"]);
  assert.ok(result.validationResults.some((validation) => validation.code === "delete_edge_already_removed"));
  assert.ok(result.changedElementIds.includes("c"));
  assert.ok(result.changedElementIds.includes("b"));
  assert.equal(result.graph.nodes.some((node) => node.id === "a"), false);
  assert.equal(result.graph.nodes.find((node) => node.id === "b")?.label, "B updated");
  assert.equal(baseGraph.nodes.some((node) => node.id === "a"), true);
  assert.equal(baseGraph.nodes.find((node) => node.id === "b")?.label, "B");
});

test("applyGraphPatch blocks missing delete targets", () => {
  const patch: GraphPatch = {
    patchId: "patch-missing-delete",
    instruction: "Delete missing edge",
    summary: "Should fail",
    operations: [{ op: "delete_edge", id: "missing-edge" }]
  };

  const result = applyGraphPatch(baseGraph, patch);

  assert.equal(hasBlockers(result.validationResults), true);
  assert.ok(result.validationResults.some((validation) => validation.code === "missing_edge"));
  assert.deepEqual(result.graph, baseGraph);
});

test("applyGraphPatch blocks duplicate IDs and missing endpoints", () => {
  const patch: GraphPatch = {
    patchId: "patch-conflicts",
    instruction: "Create conflicting records",
    summary: "Invalid add operations",
    operations: [
      { op: "add_node", id: "a", label: "A duplicate", nodeType: "concept", origin: "human" },
      { op: "add_edge", id: "edge-missing", source: "a", target: "missing", label: "points", origin: "human" }
    ]
  };

  const result = applyGraphPatch(baseGraph, patch);

  assert.equal(hasBlockers(result.validationResults), true);
  assert.ok(result.validationResults.some((validation) => validation.code === "duplicate_node_id"));
  assert.ok(result.validationResults.some((validation) => validation.code === "edge_references_missing_node"));
  assert.deepEqual(result.graph, baseGraph);
  assert.deepEqual(result.changedElementIds, []);
});

test("applyGraphPatch supports merge and split replacement edges", () => {
  const patch: GraphPatch = {
    patchId: "patch-merge-split",
    instruction: "Reshape concepts",
    summary: "Merge A and B, then split merged concept",
    operations: [
      {
        op: "merge_nodes",
        inputNodeIds: ["a", "b"],
        outputNode: {
          id: "ab",
          label: "AB",
          type: "concept",
          origin: "human",
          notes: "Merged for cleanup."
        },
        replacementEdges: [],
        deleteInputNodes: true
      },
      {
        op: "split_node",
        inputNodeId: "ab",
        outputNodes: [
          { id: "a1", label: "A1", type: "concept", origin: "human", notes: "Split half one." },
          { id: "b1", label: "B1", type: "concept", origin: "human", notes: "Split half two." }
        ],
        replacementEdges: [{ id: "edge-a1-b1", source: "a1", target: "b1", label: "relates", origin: "human" }],
        deleteInputNode: true
      }
    ]
  };

  const result = applyGraphPatch(baseGraph, patch);

  assert.equal(hasBlockers(result.validationResults), false);
  assert.deepEqual(result.graph.nodes.map((node) => node.id).sort(), ["a1", "b1"]);
  assert.deepEqual(result.graph.edges.map((edge) => edge.id), ["edge-a1-b1"]);
  assert.ok(result.actionSummary.mergedNodes.includes("ab"));
  assert.ok(result.actionSummary.splitNodes.includes("a1"));
  assert.ok(result.changedElementIds.includes("edge-a1-b1"));
});

test("source graphs cannot be patched directly", () => {
  const sourceGraph: GraphState = { ...baseGraph, stateType: "source" };
  const patch: GraphPatch = {
    patchId: "patch-source",
    instruction: "Mutate source",
    summary: "Should fail",
    operations: [{ op: "update_node", id: "a", changes: { label: "Changed" } }]
  };

  const result = applyGraphPatch(sourceGraph, patch);

  assert.equal(hasBlockers(result.validationResults), true);
  assert.ok(result.validationResults.some((validation) => validation.code === "source_graph_mutation"));
});
