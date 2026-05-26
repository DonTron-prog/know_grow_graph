import assert from "node:assert/strict";
import test from "node:test";
import type { GraphState } from "@know-grow/shared";
import { calculateLayout, clampZoom, EMPTY_SELECTION, isSelected, selectElement, selectionLabel } from "../src/graphInteraction.ts";

const graph: GraphState = {
  graphId: "working-test",
  name: "Working Test",
  stateType: "working",
  nodes: [
    { id: "a", label: "A", type: "concept", origin: "source" },
    { id: "b", label: "B", type: "concept", origin: "human" },
    { id: "c", label: "C", type: "concept", origin: "llm" }
  ],
  edges: [{ id: "ab", source: "a", target: "b", label: "relates", origin: "source" }],
  layout: {
    a: { x: 10, y: 10 },
    b: { x: 30, y: 50 }
  }
};

test("selection helpers support single-select and additive multi-select for nodes and edges", () => {
  const oneNode = selectElement(EMPTY_SELECTION, { kind: "node", id: "a" });
  assert.deepEqual(oneNode, { nodeIds: ["a"], edgeIds: [] });
  assert.equal(isSelected(oneNode, { kind: "node", id: "a" }), true);

  const twoNodes = selectElement(oneNode, { kind: "node", id: "b" }, true);
  assert.deepEqual(twoNodes, { nodeIds: ["a", "b"], edgeIds: [] });
  assert.equal(selectionLabel(twoNodes), "2 selected (2 nodes)");

  const mixed = selectElement(twoNodes, { kind: "edge", id: "ab" }, true);
  assert.deepEqual(mixed, { nodeIds: ["a", "b"], edgeIds: ["ab"] });
  assert.equal(selectionLabel(mixed), "3 selected (2 nodes, 1 edge)");

  const singleEdge = selectElement(mixed, { kind: "edge", id: "ab" });
  assert.deepEqual(singleEdge, { nodeIds: [], edgeIds: ["ab"] });

  const toggledOff = selectElement(mixed, { kind: "node", id: "a" }, true);
  assert.deepEqual(toggledOff, { nodeIds: ["b"], edgeIds: ["ab"] });
});

test("selection checks keep node and edge ID namespaces isolated", () => {
  const selection = { nodeIds: ["shared"], edgeIds: [] };

  assert.equal(isSelected(selection, { kind: "node", id: "shared" }), true);
  assert.equal(isSelected(selection, { kind: "edge", id: "shared" }), false);
});

test("selection labels cover empty, singular, and mixed selections", () => {
  assert.equal(selectionLabel(EMPTY_SELECTION), "0 selected");
  assert.equal(selectionLabel({ nodeIds: ["a"], edgeIds: [] }), "1 selected (1 node)");
  assert.equal(selectionLabel({ nodeIds: [], edgeIds: ["ab"] }), "1 selected (1 edge)");
  assert.equal(selectionLabel({ nodeIds: ["a"], edgeIds: ["ab"] }), "2 selected (1 node, 1 edge)");
});

test("calculateLayout normalizes persisted coordinates and falls back for missing node layout", () => {
  const layout = calculateLayout(graph);

  assert.deepEqual(layout.positions.get("a"), { x: 80, y: 80 });
  assert.deepEqual(layout.positions.get("b"), { x: 840, y: 540 });
  const fallback = layout.positions.get("c");
  assert.ok(fallback);
  assert.ok(Number.isFinite(fallback.x));
  assert.ok(Number.isFinite(fallback.y));
});

test("clampZoom keeps canvas zoom inside the supported range", () => {
  assert.equal(clampZoom(0.1), 0.35);
  assert.equal(clampZoom(1.2), 1.2);
  assert.equal(clampZoom(4), 2.8);
});
