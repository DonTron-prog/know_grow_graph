import assert from "node:assert/strict";
import test from "node:test";
import { applyGraphPatch, type GraphState } from "@know-grow/shared";
import {
  addEdgeToGraph,
  addNodeToGraph,
  buildDeleteSelectionPatch,
  buildMergeSelectedPatch,
  buildSplitNodePatch,
  deleteSelectionFromGraph,
  updateEdgeInGraph,
  updateNodeInGraph
} from "../src/graphMutations.ts";

const baseGraph: GraphState = {
  graphId: "working-test",
  name: "Working Test",
  stateType: "working",
  nodes: [
    { id: "node-a", label: "A", type: "concept", origin: "source", sourceNodeIds: ["source-a"] },
    { id: "node-b", label: "B", type: "concept", origin: "human" },
    { id: "node-c", label: "C", type: "concept", origin: "source" }
  ],
  edges: [
    { id: "edge-ab", source: "node-a", target: "node-b", label: "connects", origin: "source" },
    { id: "edge-bc", source: "node-b", target: "node-c", label: "points", origin: "human" }
  ],
  layout: {
    "node-a": { x: 10, y: 10 },
    "node-b": { x: 20, y: 20 },
    "node-c": { x: 30, y: 30 }
  }
};

test("frontend graph mutations add and update human-authored elements without mutating the input graph", () => {
  const addedNode = addNodeToGraph(baseGraph, { label: "New", type: "idea", position: { x: 100, y: 120 } });
  assert.equal(baseGraph.nodes.length, 3);
  assert.equal(addedNode.graph.nodes.length, 4);
  assert.deepEqual(addedNode.actionSummary.addedNodes, ["human-node-4"]);
  assert.deepEqual(addedNode.graph.layout?.["human-node-4"], { x: 100, y: 120 });

  const addedEdge = addEdgeToGraph(addedNode.graph, { source: "node-a", target: "human-node-4", label: "inspires" });
  assert.deepEqual(addedEdge.actionSummary.addedEdges, ["human-edge-3"]);

  const updatedNode = updateNodeInGraph(addedEdge.graph, "human-node-4", { label: "Renamed", type: "theme", notes: "" });
  assert.equal(updatedNode?.graph.nodes.find((node) => node.id === "human-node-4")?.label, "Renamed");
  assert.equal(updatedNode?.graph.nodes.find((node) => node.id === "human-node-4")?.notes, undefined);

  const updatedEdge = updateEdgeInGraph(addedEdge.graph, "human-edge-3", { label: "supports", notes: "why" });
  assert.equal(updatedEdge?.graph.edges.find((edge) => edge.id === "human-edge-3")?.notes, "why");
});

test("delete selection removes selected nodes, selected edges, incident edges, and stale layout", () => {
  const result = deleteSelectionFromGraph(baseGraph, { nodeIds: ["node-b"], edgeIds: [] });

  assert.deepEqual(result?.actionSummary.deletedNodes, ["node-b"]);
  assert.deepEqual(result?.actionSummary.deletedEdges, ["edge-ab", "edge-bc"]);
  assert.deepEqual(result?.changedElementIds, ["node-b", "edge-ab", "edge-bc"]);
  assert.equal(result?.graph.nodes.some((node) => node.id === "node-b"), false);
  assert.equal(result?.graph.edges.length, 0);
  assert.equal(result?.graph.layout?.["node-b"], undefined);
});

test("delete toolbar patch uses shared patch warnings for source-origin working elements", () => {
  const deletePatch = buildDeleteSelectionPatch(baseGraph, { nodeIds: ["node-a"], edgeIds: [] });
  assert.ok(deletePatch);

  const deleted = applyGraphPatch(baseGraph, deletePatch);

  assert.equal(deleted.validationResults.some((result) => result.level === "blocker"), false);
  assert.ok(deleted.validationResults.some((result) => result.code === "delete_source_origin_node"));
  assert.deepEqual(deleted.actionSummary.deletedNodes, ["node-a"]);
  assert.deepEqual(deleted.actionSummary.deletedEdges, ["edge-ab"]);
});

test("merge and split toolbar patches are accepted by shared patch application", () => {
  const mergePatch = buildMergeSelectedPatch(baseGraph, ["node-a", "node-b"], "A+B", "concept");
  assert.ok(mergePatch);
  const merged = applyGraphPatch(baseGraph, mergePatch);
  assert.equal(merged.validationResults.some((result) => result.level === "blocker"), false);
  assert.deepEqual(merged.actionSummary.mergedNodes, ["node-a", "node-b", "human-node-4"]);
  assert.ok(merged.graph.nodes.some((node) => node.id === "human-node-4"));

  const splitPatch = buildSplitNodePatch(baseGraph, "node-a", ["A1", "A2"], "concept");
  assert.ok(splitPatch);
  const split = applyGraphPatch(baseGraph, splitPatch);
  assert.equal(split.validationResults.some((result) => result.level === "blocker"), false);
  assert.deepEqual(split.actionSummary.splitNodes, ["node-a", "human-node-4", "human-node-5"]);
});
