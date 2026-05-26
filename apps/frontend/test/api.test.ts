import assert from "node:assert/strict";
import test from "node:test";
import type { GraphPatch, GraphState } from "@know-grow/shared";
import { ApiClientError, createApiClient, normalizeApiBaseUrl, type FetchLike } from "../src/api.ts";

const sampleGraph: GraphState = {
  graphId: "working-example",
  name: "Working Example",
  stateType: "working",
  nodes: [{ id: "node-1", label: "Node 1", type: "concept", origin: "source" }],
  edges: [],
  updatedAt: "2026-05-24T00:00:00.000Z"
};

test("normalizeApiBaseUrl trims whitespace, trailing slashes, and keeps the backend default", () => {
  assert.equal(normalizeApiBaseUrl(undefined), "http://localhost:3001/api");
  assert.equal(normalizeApiBaseUrl(" http://localhost:4000/api/ "), "http://localhost:4000/api");
});

test("frontend API client fetches implemented backend read endpoints", async () => {
  const requestedUrls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    requestedUrls.push(String(input));
    if (String(input).endsWith("/source/meta")) {
      return jsonResponse({ graphId: "source-example", name: "Source", stateType: "source", nodeCount: 1, edgeCount: 0, readOnly: true });
    }
    if (String(input).endsWith("/working/graph")) {
      return jsonResponse(sampleGraph);
    }
    if (String(input).endsWith("/snapshots")) {
      return jsonResponse({ snapshots: [{ snapshotId: "snap-1", name: "Snapshot", nodeCount: 1, edgeCount: 0, createdAt: "2026-05-24T00:00:00.000Z" }] });
    }
    return jsonResponse({ error: { code: "not_found", message: "Missing" } }, 404);
  };

  const apiClient = createApiClient("http://backend.test/api/", fetchImpl);

  const [sourceMeta, graph, snapshots] = await Promise.all([
    apiClient.fetchSourceMeta(),
    apiClient.fetchWorkingGraph(),
    apiClient.fetchSnapshots()
  ]);

  assert.deepEqual(requestedUrls, [
    "http://backend.test/api/source/meta",
    "http://backend.test/api/working/graph",
    "http://backend.test/api/snapshots"
  ]);
  assert.equal(sourceMeta.readOnly, true);
  assert.equal(graph.name, "Working Example");
  assert.equal(snapshots[0]?.snapshotId, "snap-1");
});

test("frontend API client sends mutation requests to implemented backend endpoints", async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    });

    if (String(input).endsWith("/working/graph")) {
      return jsonResponse({ graph: sampleGraph, validationResults: [] });
    }
    if (String(input).endsWith("/snapshots") && init?.method === "POST") {
      return jsonResponse({ snapshot: { snapshotId: "snap-2", name: "Saved", nodeCount: 1, edgeCount: 0, createdAt: "2026-05-24T00:00:00.000Z" } }, 201);
    }
    if (String(input).endsWith("/snapshots/snap-1/load")) {
      return jsonResponse({ graph: sampleGraph, snapshot: { snapshotId: "snap-1", name: "Loaded", nodeCount: 1, edgeCount: 0, createdAt: "2026-05-24T00:00:00.000Z" }, actionSummary: emptyActionSummary("load") });
    }
    if (String(input).endsWith("/snapshots/snap-1/duplicate")) {
      return jsonResponse({ snapshot: { snapshotId: "snap-2", name: "Copy", nodeCount: 1, edgeCount: 0, createdAt: "2026-05-24T00:00:00.000Z" } }, 201);
    }
    if (String(input).endsWith("/working/revert-to-source")) {
      return jsonResponse({ graph: sampleGraph, actionSummary: emptyActionSummary("revert") });
    }
    if (String(input).endsWith("/patch/apply")) {
      const body = requests.at(-1)?.body as { patch?: GraphPatch } | undefined;
      return jsonResponse({ graph: sampleGraph, appliedPatch: body?.patch, validationResults: [], actionSummary: emptyActionSummary("patch"), changedElementIds: ["node-1"] });
    }

    return jsonResponse({ error: { code: "not_found", message: "Missing" } }, 404);
  };
  const apiClient = createApiClient("http://backend.test/api", fetchImpl);
  const patch: GraphPatch = { patchId: "patch-1", instruction: "test", summary: "test", operations: [] };

  await apiClient.replaceWorkingGraph(sampleGraph);
  await apiClient.createSnapshot({ name: "Saved" });
  await apiClient.loadSnapshot("snap-1");
  await apiClient.duplicateSnapshot("snap-1", { name: "Copy" });
  await apiClient.revertToSource();
  await apiClient.applyPatch(patch);

  assert.deepEqual(requests.map((request) => [request.method, request.url]), [
    ["PUT", "http://backend.test/api/working/graph"],
    ["POST", "http://backend.test/api/snapshots"],
    ["POST", "http://backend.test/api/snapshots/snap-1/load"],
    ["POST", "http://backend.test/api/snapshots/snap-1/duplicate"],
    ["POST", "http://backend.test/api/working/revert-to-source"],
    ["POST", "http://backend.test/api/patch/apply"]
  ]);
  assert.deepEqual(requests[0]?.body, { graph: sampleGraph });
  assert.deepEqual(requests[5]?.body, { patch });
});

test("frontend API client preserves backend ApiError details", async () => {
  const fetchImpl: FetchLike = async () => jsonResponse({ error: { code: "invalid_working_graph", message: "Invalid graph", details: { validationResults: [] } } }, 422);
  const apiClient = createApiClient("http://backend.test/api", fetchImpl);

  await assert.rejects(
    apiClient.fetchWorkingGraph(),
    (error) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 422);
      assert.equal(error.code, "invalid_working_graph");
      assert.deepEqual(error.details, { validationResults: [] });
      return true;
    }
  );
});

function emptyActionSummary(instruction: string) {
  return {
    title: "Test action",
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
