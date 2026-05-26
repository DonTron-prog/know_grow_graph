import type {
  ApplyPatchResponse,
  CreateSnapshotRequest,
  CreateSnapshotResponse,
  DuplicateSnapshotRequest,
  DuplicateSnapshotResponse,
  GraphMeta,
  GraphPatch,
  GraphState,
  HealthResponse,
  ListSnapshotsResponse,
  LoadSnapshotResponse,
  ReplaceWorkingGraphResponse,
  RevertToSourceResponse,
  SnapshotMeta
} from "@know-grow/shared";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type FrontendApiClient = {
  fetchHealth: () => Promise<HealthResponse>;
  fetchSourceMeta: () => Promise<GraphMeta>;
  fetchWorkingGraph: () => Promise<GraphState>;
  fetchSnapshots: () => Promise<SnapshotMeta[]>;
  replaceWorkingGraph: (graph: GraphState) => Promise<ReplaceWorkingGraphResponse>;
  createSnapshot: (request: CreateSnapshotRequest) => Promise<CreateSnapshotResponse>;
  loadSnapshot: (snapshotId: string) => Promise<LoadSnapshotResponse>;
  duplicateSnapshot: (snapshotId: string, request: DuplicateSnapshotRequest) => Promise<DuplicateSnapshotResponse>;
  revertToSource: () => Promise<RevertToSourceResponse>;
  applyPatch: (patch: GraphPatch) => Promise<ApplyPatchResponse>;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export function normalizeApiBaseUrl(value: string | undefined): string {
  const base = value?.trim() || "http://localhost:3001/api";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function createApiClient(baseUrl: string, fetchImpl: FetchLike = fetch): FrontendApiClient {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
        ...init?.headers
      }
    });

    const body = await readJson(response);
    if (!response.ok) {
      const apiError = body as ApiErrorBody;
      throw new ApiClientError(
        apiError.error?.message ?? `Request failed with HTTP ${response.status}`,
        response.status,
        apiError.error?.code,
        apiError.error?.details
      );
    }

    return body as T;
  }

  const postJson = <T>(path: string, body: unknown = {}): Promise<T> => requestJson<T>(path, { method: "POST", body: JSON.stringify(body) });

  return {
    fetchHealth: () => requestJson<HealthResponse>("/health"),
    fetchSourceMeta: () => requestJson<GraphMeta>("/source/meta"),
    fetchWorkingGraph: () => requestJson<GraphState>("/working/graph"),
    fetchSnapshots: async () => {
      const response = await requestJson<ListSnapshotsResponse>("/snapshots");
      return response.snapshots;
    },
    replaceWorkingGraph: (graph) => requestJson<ReplaceWorkingGraphResponse>("/working/graph", { method: "PUT", body: JSON.stringify({ graph }) }),
    createSnapshot: (request) => postJson<CreateSnapshotResponse>("/snapshots", request),
    loadSnapshot: (snapshotId) => postJson<LoadSnapshotResponse>(`/snapshots/${encodeURIComponent(snapshotId)}/load`),
    duplicateSnapshot: (snapshotId, request) => postJson<DuplicateSnapshotResponse>(`/snapshots/${encodeURIComponent(snapshotId)}/duplicate`, request),
    revertToSource: () => postJson<RevertToSourceResponse>("/working/revert-to-source"),
    applyPatch: (patch) => postJson<ApplyPatchResponse>("/patch/apply", { patch })
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ApiClientError(
      error instanceof Error ? `Backend returned invalid JSON: ${error.message}` : "Backend returned invalid JSON.",
      response.status
    );
  }
}
