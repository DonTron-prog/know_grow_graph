import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createPiAgentServer, createPatchResponse } from "../src/index.js";

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
