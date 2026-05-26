import {
  applyPatchResponseSchema,
  createSnapshotResponseSchema,
  duplicateSnapshotResponseSchema,
  graphMetaSchema,
  graphStateSchema,
  healthResponseSchema,
  listSnapshotsResponseSchema,
  loadSnapshotResponseSchema,
  replaceWorkingGraphResponseSchema,
  revertToSourceResponseSchema,
  type ApplyPatchResponse,
  type CreateSnapshotRequest,
  type CreateSnapshotResponse,
  type DuplicateSnapshotRequest,
  type DuplicateSnapshotResponse,
  type GraphMeta,
  type GraphPatch,
  type GraphState,
  type HealthResponse,
  type LoadSnapshotResponse,
  type ReplaceWorkingGraphResponse,
  type RevertToSourceResponse,
  type SnapshotMeta
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
  fetchSourceGraph: () => Promise<GraphState>;
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

type SafeParser<T> = {
  safeParse: (input: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: unknown[] } };
};

export function normalizeApiBaseUrl(value: string | undefined): string {
  const base = value?.trim() || "http://localhost:3001/api";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function createApiClient(baseUrl: string, fetchImpl: FetchLike = fetch): FrontendApiClient {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);

  async function requestJson<T>(path: string, schema: SafeParser<T>, init?: RequestInit): Promise<T> {
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

    return parseSuccessfulResponse(path, response.status, body, schema);
  }

  const postJson = <T>(path: string, schema: SafeParser<T>, body: unknown = {}): Promise<T> =>
    requestJson(path, schema, { method: "POST", body: JSON.stringify(body) });

  return {
    fetchHealth: () => requestJson("/health", healthResponseSchema),
    fetchSourceMeta: () => requestJson("/source/meta", graphMetaSchema),
    fetchSourceGraph: () => requestJson("/source/graph", graphStateSchema),
    fetchWorkingGraph: () => requestJson("/working/graph", graphStateSchema),
    fetchSnapshots: async () => {
      const response = await requestJson("/snapshots", listSnapshotsResponseSchema);
      return response.snapshots;
    },
    replaceWorkingGraph: (graph) => requestJson("/working/graph", replaceWorkingGraphResponseSchema, { method: "PUT", body: JSON.stringify({ graph }) }),
    createSnapshot: (request) => postJson("/snapshots", createSnapshotResponseSchema, request),
    loadSnapshot: (snapshotId) => postJson(`/snapshots/${encodeURIComponent(snapshotId)}/load`, loadSnapshotResponseSchema),
    duplicateSnapshot: (snapshotId, request) => postJson(`/snapshots/${encodeURIComponent(snapshotId)}/duplicate`, duplicateSnapshotResponseSchema, request),
    revertToSource: () => postJson("/working/revert-to-source", revertToSourceResponseSchema),
    applyPatch: (patch) => postJson("/patch/apply", applyPatchResponseSchema, { patch })
  };
}

function parseSuccessfulResponse<T>(path: string, status: number, body: unknown, schema: SafeParser<T>): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError(`Backend returned invalid response for ${path}.`, status, "invalid_response", {
      issues: parsed.error.issues
    });
  }

  return parsed.data;
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
