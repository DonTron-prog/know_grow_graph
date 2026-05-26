import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { once } from "node:events";
import { type AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { initializePersistence, resolveBackendPaths } from "../src/persistence.ts";
import { type GraphPatch, type GraphState } from "@know-grow/shared";

async function startTestServer(): Promise<{
  baseUrl: string;
  paths: ReturnType<typeof resolveBackendPaths>;
  close: () => Promise<void>;
}> {
  const dataDir = await mkdtemp(resolve(tmpdir(), "know-grow-backend-"));
  const paths = resolveBackendPaths({ dataDir, repoRoot: resolve(import.meta.dirname, "../../..") });
  await initializePersistence(paths);

  const server = createApp({ paths, version: "test" }).listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    paths,
    close: () => new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())))
  };
}

async function readWorkingGraph(path: string): Promise<GraphState> {
  return JSON.parse(await readFile(path, "utf8")) as GraphState;
}

test("GET /api/snapshots returns the spec envelope", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/snapshots`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { snapshots: [] });
  } finally {
    await server.close();
  }
});

test("PUT /api/working/graph accepts { graph }, persists it, and returns validationResults", async () => {
  const server = await startTestServer();
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const replacement: GraphState = {
      ...original,
      name: "Undo restored graph",
      nodes: [...original.nodes, { id: "human-new", label: "Human New", type: "concept", origin: "human" }]
    };

    const response = await fetch(`${server.baseUrl}/api/working/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graph: replacement })
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 200);
    assert.equal(body.graph.name, "Undo restored graph");
    assert.equal(body.graph.stateType, "working");
    assert.deepEqual(body.validationResults, []);
    assert.equal(persisted.name, "Undo restored graph");
    assert.ok(persisted.nodes.some((node) => node.id === "human-new"));
  } finally {
    await server.close();
  }
});

test("PUT /api/working/graph rejects legacy raw graph bodies with ApiError", async () => {
  const server = await startTestServer();
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);

    const response = await fetch(`${server.baseUrl}/api/working/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(original)
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "invalid_request");
    assert.equal(persisted.name, original.name);
  } finally {
    await server.close();
  }
});

test("PUT /api/working/graph returns 422 ApiError and does not persist invalid replacements", async () => {
  const server = await startTestServer();
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const invalid: GraphState = {
      ...original,
      nodes: [original.nodes[0]!, { ...original.nodes[0]!, label: "Duplicate id" }]
    };

    const response = await fetch(`${server.baseUrl}/api/working/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graph: invalid })
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "invalid_working_graph");
    assert.ok(body.error.details.validationResults.some((result: { code: string }) => result.code === "duplicate_node_id"));
    assert.deepEqual(persisted, original);
  } finally {
    await server.close();
  }
});

test("POST /api/patch/validate returns validation results and does not mutate working graph", async () => {
  const server = await startTestServer();
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const patch: GraphPatch = {
      patchId: "patch-invalid-delete",
      instruction: "Delete Prompting",
      summary: "Invalid delete without incident edges",
      operations: [{ op: "delete_node", id: "prompting" }]
    };

    const response = await fetch(`${server.baseUrl}/api/patch/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch })
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 200);
    assert.equal(body.valid, false);
    assert.ok(body.validationResults.some((result: { code: string }) => result.code === "delete_node_would_leave_dangling_edges"));
    assert.deepEqual(persisted, original);
  } finally {
    await server.close();
  }
});

test("POST /api/patch/apply persists valid patches and returns changed element IDs", async () => {
  const server = await startTestServer();
  try {
    const patch: GraphPatch = {
      patchId: "patch-add-node-edge",
      instruction: "Add a human review concept",
      summary: "Adds review concept connected to prompting",
      operations: [
        {
          op: "add_node",
          id: "human-review",
          label: "Human Review",
          nodeType: "concept",
          origin: "human",
          notes: "Added from toolbar or Pi patch."
        },
        {
          op: "add_edge",
          id: "edge-prompting-human-review",
          source: "prompting",
          target: "human-review",
          label: "benefits_from",
          origin: "human",
          notes: "Connects new review concept."
        }
      ]
    };

    const response = await fetch(`${server.baseUrl}/api/patch/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch })
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 200);
    assert.equal(body.appliedPatch.patchId, patch.patchId);
    assert.deepEqual(body.actionSummary.addedNodes, ["human-review"]);
    assert.ok(body.changedElementIds.includes("human-review"));
    assert.ok(persisted.nodes.some((node) => node.id === "human-review"));
    assert.ok(persisted.edges.some((edge) => edge.id === "edge-prompting-human-review"));
  } finally {
    await server.close();
  }
});

test("POST /api/patch/apply persists warning-only patches", async () => {
  const server = await startTestServer();
  try {
    const patch: GraphPatch = {
      patchId: "patch-warning-only",
      instruction: "Add unsourced LLM concept",
      summary: "Warns but applies",
      operations: [{ op: "add_node", id: "llm-unsourced", label: "LLM Unsourced", nodeType: "concept", origin: "llm" }]
    };

    const response = await fetch(`${server.baseUrl}/api/patch/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch })
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 200);
    assert.ok(body.validationResults.some((result: { code: string; level: string }) => result.code === "llm_node_missing_source_refs" && result.level === "warning"));
    assert.ok(persisted.nodes.some((node) => node.id === "llm-unsourced"));
  } finally {
    await server.close();
  }
});

test("POST /api/patch/apply returns 422 and does not persist invalid patches", async () => {
  const server = await startTestServer();
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const patch: GraphPatch = {
      patchId: "patch-duplicate",
      instruction: "Duplicate existing node",
      summary: "Should fail",
      operations: [{ op: "add_node", id: "prompting", label: "Duplicate", nodeType: "concept", origin: "human" }]
    };

    const response = await fetch(`${server.baseUrl}/api/patch/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch })
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "patch_validation_failed");
    assert.ok(body.error.details.validationResults.some((result: { code: string }) => result.code === "duplicate_node_id"));
    assert.deepEqual(persisted, original);
  } finally {
    await server.close();
  }
});

test("malformed JSON, unknown routes, and unexpected failures use ApiError", async () => {
  const server = await startTestServer();
  try {
    const malformedResponse = await fetch(`${server.baseUrl}/api/working/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{not-json"
    });
    const malformedBody = await malformedResponse.json();

    assert.equal(malformedResponse.status, 400);
    assert.equal(malformedBody.error.code, "malformed_json");

    const missingResponse = await fetch(`${server.baseUrl}/api/missing`);
    const missingBody = await missingResponse.json();

    assert.equal(missingResponse.status, 404);
    assert.equal(missingBody.error.code, "not_found");

    await writeFile(server.paths.snapshotsMeta, JSON.stringify({ invalid: true }), "utf8");
    const failureResponse = await fetch(`${server.baseUrl}/api/snapshots`);
    const failureBody = await failureResponse.json();

    assert.equal(failureResponse.status, 500);
    assert.equal(failureBody.error.code, "internal_error");
  } finally {
    await server.close();
  }
});
