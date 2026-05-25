import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, createApiClient, normalizeApiBaseUrl, type FetchLike } from "../src/api.ts";

const sampleGraph = {
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
