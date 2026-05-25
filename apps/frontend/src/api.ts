import type { GraphMeta, GraphState, HealthResponse, ListSnapshotsResponse, SnapshotMeta } from "@know-grow/shared";

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

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      headers: { accept: "application/json" }
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

  return {
    fetchHealth: () => getJson<HealthResponse>("/health"),
    fetchSourceMeta: () => getJson<GraphMeta>("/source/meta"),
    fetchWorkingGraph: () => getJson<GraphState>("/working/graph"),
    fetchSnapshots: async () => {
      const response = await getJson<ListSnapshotsResponse>("/snapshots");
      return response.snapshots;
    }
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
