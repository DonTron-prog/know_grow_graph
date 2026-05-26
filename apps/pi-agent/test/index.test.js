import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { applyDirectJsonEdit, createPiAgentServer, createPatchResponse } from "../src/index.js";

test("createPatchResponse returns a patch-mode proposal without mutating input", () => {
  const response = createPatchResponse({
    instruction: "Add review",
    selectedNodeIds: ["n1"],
    selectedEdgeIds: [],
    graph: { nodes: [{ id: "n1", label: "One" }], edges: [] },
    mode: "patch"
  });

  assert.equal(response.mode, "patch");
  assert.match(response.patch.patchId, /^patch-/);
  assert.deepEqual(response.patch.operations.map((operation) => operation.op), ["add_node", "add_edge"]);
  assert.equal(response.patch.operations[1].source, "n1");
});

test("applyDirectJsonEdit mutates the shared working graph file", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "know-grow-pi-agent-"));
  const previousGraphDataDir = process.env.GRAPH_DATA_DIR;
  process.env.GRAPH_DATA_DIR = dataDir;
  const graph = {
    graphId: "working-test",
    name: "Working Test",
    stateType: "working",
    nodes: [{ id: "n1", label: "One", type: "concept", origin: "source" }],
    edges: []
  };
  await writeFile(resolve(dataDir, "working_graph.json"), JSON.stringify(graph), "utf8");
  try {
    const response = await applyDirectJsonEdit({ instruction: "Add direct", selectedNodeIds: ["n1"], selectedEdgeIds: [] });
    const persisted = JSON.parse(await readFile(resolve(dataDir, "working_graph.json"), "utf8"));

    assert.equal(response.mode, "direct_json");
    assert.equal(persisted.nodes.length, 2);
    assert.equal(persisted.edges[0].source, "n1");
  } finally {
    if (previousGraphDataDir === undefined) {
      delete process.env.GRAPH_DATA_DIR;
    } else {
      process.env.GRAPH_DATA_DIR = previousGraphDataDir;
    }
  }
});

test("pi-agent HTTP bridge exposes health and patch chat", async () => {
  const server = createPiAgentServer().listen(0);
  await once(server, "listening");
  const { port } = server.address();
  try {
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.ok, true);

    const chatResponse = await fetch(`http://127.0.0.1:${port}/api/pi/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Add review", selectedNodeIds: [], selectedEdgeIds: [], graph: { nodes: [], edges: [] }, mode: "patch" })
    });
    const chat = await chatResponse.json();
    assert.equal(chatResponse.status, 200);
    assert.equal(chat.mode, "patch");
    assert.equal(chat.patch.operations[0].op, "add_node");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
