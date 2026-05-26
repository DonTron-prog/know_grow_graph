import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { hasBlockers, parseGraphState, validateGraphState, type GraphState } from "../src/index.ts";

test("fixture graph passes validation", async () => {
  const fixturePath = resolve(import.meta.dirname, "../../../fixtures/source_graph.example.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const graph = parseGraphState(fixture);
  const results = validateGraphState(graph);

  assert.equal(graph.nodes.length, 10);
  assert.equal(hasBlockers(results), false);
});

test("duplicate node IDs fail validation", () => {
  const graph: GraphState = {
    graphId: "bad-duplicates",
    name: "Bad duplicate graph",
    stateType: "working",
    nodes: [
      { id: "a", label: "A", type: "concept", origin: "human" },
      { id: "a", label: "A again", type: "concept", origin: "human" }
    ],
    edges: []
  };

  const results = validateGraphState(graph);

  assert.equal(hasBlockers(results), true);
  assert.ok(results.some((result) => result.code === "duplicate_node_id"));
});

test("dangling edge endpoints fail validation", () => {
  const graph: GraphState = {
    graphId: "bad-dangling-edge",
    name: "Bad dangling edge graph",
    stateType: "working",
    nodes: [{ id: "a", label: "A", type: "concept", origin: "human" }],
    edges: [{ id: "edge-a-b", source: "a", target: "b", label: "points_to", origin: "human" }]
  };

  const results = validateGraphState(graph);

  assert.equal(hasBlockers(results), true);
  assert.ok(results.some((result) => result.code === "dangling_edge_endpoint"));
});

test("duplicate edge IDs fail validation", () => {
  const graph: GraphState = {
    graphId: "bad-duplicate-edges",
    name: "Bad duplicate edge graph",
    stateType: "working",
    nodes: [
      { id: "a", label: "A", type: "concept", origin: "human" },
      { id: "b", label: "B", type: "concept", origin: "human" }
    ],
    edges: [
      { id: "edge-a-b", source: "a", target: "b", label: "points_to", origin: "human" },
      { id: "edge-a-b", source: "b", target: "a", label: "points_back", origin: "human" }
    ]
  };

  const results = validateGraphState(graph);

  assert.equal(hasBlockers(results), true);
  assert.ok(results.some((result) => result.code === "duplicate_edge_id"));
});

test("layout entries for missing nodes are warnings, not blockers", () => {
  const graph: GraphState = {
    graphId: "layout-warning",
    name: "Layout warning graph",
    stateType: "working",
    nodes: [{ id: "a", label: "A", type: "concept", origin: "human" }],
    edges: [],
    layout: { missing: { x: 1, y: 2 } }
  };

  const results = validateGraphState(graph);

  assert.equal(hasBlockers(results), false);
  assert.ok(results.some((result) => result.code === "layout_for_missing_node" && result.level === "warning"));
});
