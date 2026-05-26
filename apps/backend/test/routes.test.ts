import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { initializePersistence, resolveBackendPaths } from "../src/persistence.ts";
import { type GraphPatch, type GraphState } from "@know-grow/shared";

async function startTestServer(options: { piAgentUrl?: string } = {}): Promise<{
  baseUrl: string;
  paths: ReturnType<typeof resolveBackendPaths>;
  close: () => Promise<void>;
}> {
  const dataDir = await mkdtemp(resolve(tmpdir(), "know-grow-backend-"));
  const paths = resolveBackendPaths({ dataDir, repoRoot: resolve(import.meta.dirname, "../../..") });
  await initializePersistence(paths);

  const server = createApp({ paths, version: "test", piAgentUrl: options.piAgentUrl }).listen(0);
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

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function startFakePiAgent(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error: unknown) => {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    });
  });
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())))
  };
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

test("POST /api/snapshots saves current working graph and GET returns the snapshot graph", async () => {
  const server = await startTestServer();
  try {
    const working = await readWorkingGraph(server.paths.workingGraph);
    const layout = { prompting: { x: 10, y: 20 } };

    const createResponse = await postJson(`${server.baseUrl}/api/snapshots`, {
      name: "First saved view",
      notes: "Captures the graph before experiments.",
      layout
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.match(createBody.snapshot.snapshotId, /^snapshot-/);
    assert.equal(createBody.snapshot.name, "First saved view");
    assert.equal(createBody.snapshot.nodeCount, working.nodes.length);
    assert.equal(createBody.snapshot.edgeCount, working.edges.length);

    const listResponse = await fetch(`${server.baseUrl}/api/snapshots`);
    const listBody = await listResponse.json();
    assert.deepEqual(listBody.snapshots, [createBody.snapshot]);

    const getResponse = await fetch(`${server.baseUrl}/api/snapshots/${createBody.snapshot.snapshotId}`);
    const getBody = await getResponse.json();
    assert.equal(getResponse.status, 200);
    assert.deepEqual(getBody.snapshot, createBody.snapshot);
    assert.equal(getBody.graph.stateType, "snapshot");
    assert.equal(getBody.graph.graphId, createBody.snapshot.snapshotId);
    assert.equal(getBody.graph.name, "First saved view");
    assert.deepEqual(getBody.graph.layout, layout);
  } finally {
    await server.close();
  }
});

test("snapshot load replaces only the working graph and returns an action summary", async () => {
  const server = await startTestServer();
  try {
    const originalSource = await readFile(server.paths.sourceGraph, "utf8");
    const originalWorking = await readWorkingGraph(server.paths.workingGraph);
    const snapshotResponse = await postJson(`${server.baseUrl}/api/snapshots`, { name: "Before edits" });
    const { snapshot } = await snapshotResponse.json();

    const editedWorking: GraphState = {
      ...originalWorking,
      name: "Edited after snapshot",
      nodes: [...originalWorking.nodes, { id: "after-snapshot", label: "After Snapshot", type: "concept", origin: "human" }]
    };
    await fetch(`${server.baseUrl}/api/working/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graph: editedWorking })
    });

    const loadResponse = await postJson(`${server.baseUrl}/api/snapshots/${snapshot.snapshotId}/load`, {});
    const loadBody = await loadResponse.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);
    const sourceAfter = await readFile(server.paths.sourceGraph, "utf8");

    assert.equal(loadResponse.status, 200);
    assert.equal(loadBody.snapshot.snapshotId, snapshot.snapshotId);
    assert.equal(loadBody.graph.stateType, "working");
    assert.equal(loadBody.graph.name, "Before edits");
    assert.ok(!loadBody.graph.nodes.some((node: { id: string }) => node.id === "after-snapshot"));
    assert.equal(loadBody.actionSummary.title, "Loaded snapshot 'Before edits'");
    assert.deepEqual(loadBody.actionSummary.deletedNodes, ["after-snapshot"]);
    assert.deepEqual(persisted.nodes, loadBody.graph.nodes);
    assert.equal(sourceAfter, originalSource);
  } finally {
    await server.close();
  }
});

test("POST /api/snapshots/:snapshotId/duplicate copies snapshot graph with new metadata", async () => {
  const server = await startTestServer();
  try {
    const createResponse = await postJson(`${server.baseUrl}/api/snapshots`, { name: "Original snapshot" });
    const { snapshot: originalSnapshot } = await createResponse.json();

    const duplicateResponse = await postJson(`${server.baseUrl}/api/snapshots/${originalSnapshot.snapshotId}/duplicate`, {
      name: "Duplicate snapshot",
      notes: "Branching from the original snapshot."
    });
    const duplicateBody = await duplicateResponse.json();

    assert.equal(duplicateResponse.status, 201);
    assert.notEqual(duplicateBody.snapshot.snapshotId, originalSnapshot.snapshotId);
    assert.equal(duplicateBody.snapshot.name, "Duplicate snapshot");
    assert.equal(duplicateBody.snapshot.notes, "Branching from the original snapshot.");

    const duplicateGraphResponse = await fetch(`${server.baseUrl}/api/snapshots/${duplicateBody.snapshot.snapshotId}`);
    const duplicateGraphBody = await duplicateGraphResponse.json();
    assert.equal(duplicateGraphBody.graph.graphId, duplicateBody.snapshot.snapshotId);
    assert.equal(duplicateGraphBody.graph.name, "Duplicate snapshot");
    assert.equal(duplicateGraphBody.graph.nodes.length, originalSnapshot.nodeCount);
  } finally {
    await server.close();
  }
});

test("POST /api/working/revert-to-source copies source into working without mutating source", async () => {
  const server = await startTestServer();
  try {
    const originalSource = await readFile(server.paths.sourceGraph, "utf8");
    const originalWorking = await readWorkingGraph(server.paths.workingGraph);
    const editedWorking: GraphState = {
      ...originalWorking,
      nodes: [...originalWorking.nodes, { id: "temporary-node", label: "Temporary", type: "concept", origin: "human" }]
    };
    await fetch(`${server.baseUrl}/api/working/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graph: editedWorking })
    });

    const response = await postJson(`${server.baseUrl}/api/working/revert-to-source`, {});
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);
    const sourceAfter = await readFile(server.paths.sourceGraph, "utf8");

    assert.equal(response.status, 200);
    assert.equal(body.graph.stateType, "working");
    assert.ok(!body.graph.nodes.some((node: { id: string }) => node.id === "temporary-node"));
    assert.equal(body.actionSummary.title, "Reverted working graph to source");
    assert.deepEqual(body.actionSummary.deletedNodes, ["temporary-node"]);
    assert.deepEqual(persisted, body.graph);
    assert.equal(sourceAfter, originalSource);
  } finally {
    await server.close();
  }
});

test("snapshot mutation routes reject invalid request bodies with ApiError", async () => {
  const server = await startTestServer();
  try {
    const invalidCreateResponse = await postJson(`${server.baseUrl}/api/snapshots`, { name: "" });
    const invalidCreateBody = await invalidCreateResponse.json();
    assert.equal(invalidCreateResponse.status, 400);
    assert.equal(invalidCreateBody.error.code, "invalid_request");

    const createResponse = await postJson(`${server.baseUrl}/api/snapshots`, { name: "Valid source snapshot" });
    const { snapshot } = await createResponse.json();
    const invalidDuplicateResponse = await postJson(`${server.baseUrl}/api/snapshots/${snapshot.snapshotId}/duplicate`, { name: "" });
    const invalidDuplicateBody = await invalidDuplicateResponse.json();
    assert.equal(invalidDuplicateResponse.status, 400);
    assert.equal(invalidDuplicateBody.error.code, "invalid_request");
  } finally {
    await server.close();
  }
});

test("snapshot routes return 404 for missing snapshots and 422 for invalid snapshot graphs without mutating working graph", async () => {
  const server = await startTestServer();
  try {
    const missingResponse = await fetch(`${server.baseUrl}/api/snapshots/missing-snapshot`);
    const missingBody = await missingResponse.json();
    assert.equal(missingResponse.status, 404);
    assert.equal(missingBody.error.code, "snapshot_not_found");

    const createResponse = await postJson(`${server.baseUrl}/api/snapshots`, { name: "Will become invalid" });
    const { snapshot } = await createResponse.json();
    const workingBeforeInvalidLoad = await readWorkingGraph(server.paths.workingGraph);
    await writeFile(
      resolve(server.paths.snapshotsDir, `${snapshot.snapshotId}.json`),
      JSON.stringify({ ...workingBeforeInvalidLoad, stateType: "snapshot", graphId: snapshot.snapshotId, nodes: [workingBeforeInvalidLoad.nodes[0], workingBeforeInvalidLoad.nodes[0]] }),
      "utf8"
    );

    const invalidLoadResponse = await postJson(`${server.baseUrl}/api/snapshots/${snapshot.snapshotId}/load`, {});
    const invalidLoadBody = await invalidLoadResponse.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(invalidLoadResponse.status, 422);
    assert.equal(invalidLoadBody.error.code, "invalid_snapshot_graph");
    assert.deepEqual(persisted, workingBeforeInvalidLoad);
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

test("POST /api/pi/chat returns a typed patch proposal without mutating working graph", async () => {
  const server = await startTestServer();
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const response = await postJson(`${server.baseUrl}/api/pi/chat`, {
      instruction: "Add a review concept",
      selectedNodeIds: ["prompting"],
      selectedEdgeIds: [],
      graph: { nodes: original.nodes, edges: original.edges },
      mode: "patch"
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 200);
    assert.equal(body.mode, "patch");
    assert.equal(body.message, "Pi proposed a patch. Review it in Actions/Raw, then apply it if acceptable.");
    assert.match(body.patch.patchId, /^patch-/);
    assert.deepEqual(body.patch.operations.map((operation: { op: string }) => operation.op), ["add_node", "add_edge"]);
    assert.equal(body.actionSummary.addedNodes.length, 1);
    assert.deepEqual(persisted, original);
  } finally {
    await server.close();
  }
});

test("POST /api/pi/chat rejects direct JSON mode on the patch chat route", async () => {
  const server = await startTestServer();
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const response = await postJson(`${server.baseUrl}/api/pi/chat`, {
      instruction: "Edit files directly",
      selectedNodeIds: [],
      selectedEdgeIds: [],
      graph: { nodes: original.nodes, edges: original.edges },
      mode: "direct_json"
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "direct_json_not_supported");
  } finally {
    await server.close();
  }
});

test("POST /api/pi/direct-edit reloads and validates a mock direct JSON edit", async () => {
  const server = await startTestServer();
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const originalSource = await readFile(server.paths.sourceGraph, "utf8");
    const response = await postJson(`${server.baseUrl}/api/pi/direct-edit`, {
      instruction: "Add a direct JSON concept",
      selectedNodeIds: ["prompting"],
      selectedEdgeIds: [],
      graph: { nodes: original.nodes, edges: original.edges },
      mode: "direct_json"
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);
    const sourceAfter = await readFile(server.paths.sourceGraph, "utf8");

    assert.equal(response.status, 200);
    assert.equal(body.mode, "direct_json");
    assert.equal(body.message, "Pi edited working graph JSON; backend reloaded and validated the result.");
    assert.ok(body.graph.nodes.length > original.nodes.length);
    assert.ok(body.changedElementIds.length > 0);
    assert.deepEqual(persisted.nodes, body.graph.nodes);
    assert.equal(sourceAfter, originalSource);
  } finally {
    await server.close();
  }
});

test("POST /api/pi/direct-edit restores backups when direct JSON output is invalid", async () => {
  let pathsRef: ReturnType<typeof resolveBackendPaths> | null = null;
  const piAgent = await startFakePiAgent(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/pi/direct-edit" && pathsRef) {
      const original = await readWorkingGraph(pathsRef.workingGraph);
      await writeFile(pathsRef.workingGraph, JSON.stringify({ ...original, nodes: [original.nodes[0], original.nodes[0]] }), "utf8");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "Wrote invalid graph", mode: "direct_json" }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const server = await startTestServer({ piAgentUrl: piAgent.url });
  pathsRef = server.paths;
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const response = await postJson(`${server.baseUrl}/api/pi/direct-edit`, {
      instruction: "Break the graph",
      selectedNodeIds: [],
      selectedEdgeIds: [],
      graph: { nodes: original.nodes, edges: original.edges },
      mode: "direct_json"
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "invalid_direct_json_edit");
    assert.ok(body.error.details.validationResults.some((result: { code: string }) => result.code === "duplicate_node_id"));
    assert.deepEqual(persisted, original);
  } finally {
    await server.close();
    await piAgent.close();
  }
});

test("POST /api/pi/direct-edit restores backups when direct JSON output is malformed JSON", async () => {
  let pathsRef: ReturnType<typeof resolveBackendPaths> | null = null;
  const piAgent = await startFakePiAgent(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/pi/direct-edit" && pathsRef) {
      await writeFile(pathsRef.workingGraph, "{not-json", "utf8");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "Wrote malformed graph", mode: "direct_json" }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const server = await startTestServer({ piAgentUrl: piAgent.url });
  pathsRef = server.paths;
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const response = await postJson(`${server.baseUrl}/api/pi/direct-edit`, {
      instruction: "Write malformed JSON",
      selectedNodeIds: [],
      selectedEdgeIds: [],
      graph: { nodes: original.nodes, edges: original.edges },
      mode: "direct_json"
    });
    const body = await response.json();
    const persisted = await readWorkingGraph(server.paths.workingGraph);

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "invalid_direct_json_edit");
    assert.ok(body.error.details.validationResults.some((result: { code: string }) => result.code === "malformed_working_graph_file"));
    assert.deepEqual(persisted, original);
  } finally {
    await server.close();
    await piAgent.close();
  }
});

test("POST /api/pi/direct-edit restores backups when source graph changes", async () => {
  let pathsRef: ReturnType<typeof resolveBackendPaths> | null = null;
  const piAgent = await startFakePiAgent(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/pi/direct-edit" && pathsRef) {
      const source = JSON.parse(await readFile(pathsRef.sourceGraph, "utf8")) as GraphState;
      await writeFile(pathsRef.sourceGraph, JSON.stringify({ ...source, name: "Mutated source" }), "utf8");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "Mutated source", mode: "direct_json" }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const server = await startTestServer({ piAgentUrl: piAgent.url });
  pathsRef = server.paths;
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const originalSource = await readFile(server.paths.sourceGraph, "utf8");
    const response = await postJson(`${server.baseUrl}/api/pi/direct-edit`, {
      instruction: "Mutate source",
      selectedNodeIds: [],
      selectedEdgeIds: [],
      graph: { nodes: original.nodes, edges: original.edges },
      mode: "direct_json"
    });
    const body = await response.json();
    const sourceAfter = await readFile(server.paths.sourceGraph, "utf8");

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "invalid_direct_json_edit");
    assert.ok(body.error.details.validationResults.some((result: { code: string }) => result.code === "source_graph_changed"));
    assert.equal(sourceAfter, originalSource);
  } finally {
    await server.close();
    await piAgent.close();
  }
});

test("POST /api/pi/direct-edit restores backups when source graph is removed", async () => {
  let pathsRef: ReturnType<typeof resolveBackendPaths> | null = null;
  const piAgent = await startFakePiAgent(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/pi/direct-edit" && pathsRef) {
      await rm(pathsRef.sourceGraph, { force: true });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "Removed source", mode: "direct_json" }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const server = await startTestServer({ piAgentUrl: piAgent.url });
  pathsRef = server.paths;
  try {
    const original = await readWorkingGraph(server.paths.workingGraph);
    const originalSource = await readFile(server.paths.sourceGraph, "utf8");
    const response = await postJson(`${server.baseUrl}/api/pi/direct-edit`, {
      instruction: "Remove source",
      selectedNodeIds: [],
      selectedEdgeIds: [],
      graph: { nodes: original.nodes, edges: original.edges },
      mode: "direct_json"
    });
    const body = await response.json();
    const sourceAfter = await readFile(server.paths.sourceGraph, "utf8");

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "invalid_direct_json_edit");
    assert.ok(body.error.details.validationResults.some((result: { code: string }) => result.code === "source_graph_changed"));
    assert.equal(sourceAfter, originalSource);
  } finally {
    await server.close();
    await piAgent.close();
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
