# Backend Specification: Sigma-First Knowledge Graph Workbench

## 1. Scope

The backend supports the Sigma-first frontend rewrite. It should stay minimal until the graph rendering and manual manipulation model are proven.

The project no longer prioritizes snapshots, branching, lineage, replay, or Pi-first workflows for the next phase. The backend should not introduce those concepts unless they become necessary later.

## 2. Phases

### Phase 1: Render and Layout Support

Backend goal: provide graph data that the Sigma frontend can render immediately.

Required:

- health endpoint
- get working graph endpoint
- fixture fallback graph
- graph shape compatible with frontend Sigma mapping
- optional endpoint to replace/persist graph coordinates

No agent endpoint is required in Phase 1.

### Phase 2: Manual Operations Support

Backend goal: persist validated user graph edits.

Required:

- add node
- update node
- delete node
- add edge
- update edge
- delete edge
- validate full graph after mutations
- persist updated working graph

The backend may expose either small operation endpoints or a patch endpoint. A patch endpoint is preferred if it stays simple.

### Phase 3: Agent Support

Backend goal: let an agent answer questions and propose/manipulate graph operations.

Target capabilities:

- receive current graph context and user instruction
- answer graph questions
- return proposed graph operations
- validate proposed operations before application
- apply valid operations
- return a human-readable summary of applied changes

Phase 3 contracts are intentionally provisional and may change after Phases 1 and 2.

## 3. Non-Goals

Do not build for the current rewrite phase:

- lineage tracking
- branching
- deterministic replay
- audit-grade action history
- snapshot management
- side-by-side comparison
- collaboration
- auth/user accounts
- advanced graph analytics
- complex persistence
- Pi direct JSON editing as a required first workflow

## 4. Recommended Stack

Use the existing local backend stack if convenient, but keep the surface small.

Recommended persistence:

```text
.data/
├── source_graph.json      # optional immutable seed/reference graph
└── working_graph.json     # current mutable graph
```

A checked-in fixture should be available so the frontend can render immediately without private data.

## 5. Canonical API Models

### 5.1 GraphNode

```ts
type GraphNode = {
  id: string;
  label: string;
  type?: string;
  origin?: 'source' | 'human' | 'llm' | 'imported' | 'unknown';
  notes?: string;
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  properties?: Record<string, unknown>;
};
```

### 5.2 GraphEdge

```ts
type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  origin?: 'source' | 'human' | 'llm' | 'imported' | 'unknown';
  notes?: string;
  size?: number;
  color?: string;
  properties?: Record<string, unknown>;
};
```

### 5.3 GraphState

```ts
type GraphState = {
  graphId: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: Record<string, { x: number; y: number }>;
  updatedAt?: string;
};
```

### 5.4 ValidationResult

```ts
type ValidationResult = {
  level: 'blocker' | 'warning' | 'info';
  code: string;
  message: string;
  elementIds?: string[];
  operationIndex?: number;
};
```

## 6. REST API

Base path:

```text
/api
```

### 6.1 Health

#### `GET /api/health`

```ts
type HealthResponse = {
  ok: boolean;
  version: string;
};
```

### 6.2 Working Graph

#### `GET /api/working/graph`

Returns the current working graph.

```ts
type WorkingGraphResponse = GraphState;
```

Startup behavior:

1. Load `.data/working_graph.json` if present.
2. Otherwise copy/load `.data/source_graph.json` if present.
3. Otherwise load a checked-in fixture graph.

#### `PUT /api/working/graph`

Replaces the current working graph with a validated graph state. This is useful for saving layout coordinates and, later, simple manual edits.

Request:

```ts
type ReplaceWorkingGraphRequest = {
  graph: GraphState;
};
```

Response:

```ts
type ReplaceWorkingGraphResponse = {
  graph: GraphState;
  validationResults: ValidationResult[];
};
```

If validation has blockers, return `422` and leave the previous working graph unchanged.

### 6.3 Optional Phase 2 Patch Endpoint

#### `POST /api/graph/operations`

Applies one or more validated graph operations.

```ts
type GraphOperation =
  | { op: 'add_node'; node: GraphNode }
  | { op: 'update_node'; id: string; changes: Partial<GraphNode> }
  | { op: 'delete_node'; id: string; deleteIncidentEdges?: boolean }
  | { op: 'add_edge'; edge: GraphEdge }
  | { op: 'update_edge'; id: string; changes: Partial<GraphEdge> }
  | { op: 'delete_edge'; id: string };
```

Request:

```ts
type ApplyOperationsRequest = {
  operations: GraphOperation[];
};
```

Response:

```ts
type ApplyOperationsResponse = {
  graph: GraphState;
  validationResults: ValidationResult[];
  changedElementIds: string[];
};
```

Optional later operations:

- `merge_nodes`
- `split_node`

## 7. Validation

Blockers:

- malformed graph
- duplicate node id
- duplicate edge id
- edge references missing node
- update/delete references missing element
- delete node would leave dangling edges unless incident edge deletion is requested
- operation has invalid required fields

Warnings:

- graph has disconnected components
- node has no label
- edge has no label
- graph has no layout coordinates

Warnings should not block exploratory work.

## 8. Layout Persistence

The backend may persist layout in either of these forms:

1. `GraphState.layout[nodeId] = { x, y }`
2. node-level `x` and `y` fields

The frontend is responsible for layout behavior. The backend only validates and stores coordinates.

Rules:

- missing coordinates are valid
- coordinates are mutable on the working graph
- layout saves should not require snapshots or history

## 9. Agent Integration Placeholder

Phase 3 may add:

#### `POST /api/agent/chat`

Potential request:

```ts
type AgentRequest = {
  instruction: string;
  selectedNodeIds?: string[];
  selectedEdgeIds?: string[];
  graph?: GraphState;
};
```

Potential response:

```ts
type AgentResponse = {
  message: string;
  operations?: GraphOperation[];
  validationResults?: ValidationResult[];
  changedElementIds?: string[];
  summary?: string;
  rawOutput?: unknown;
};
```

This endpoint should not be implemented until the graph render and manual operation phases are working.

## 10. Error Response Shape

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

Recommended status codes:

- `400` malformed request
- `404` missing graph or element
- `409` duplicate id or conflict
- `422` validation blockers
- `500` unexpected backend error

## 11. Acceptance Criteria

### Phase 1

- `GET /api/working/graph` returns a renderable graph.
- A checked-in non-private fixture graph is available.
- The frontend can render the graph with Sigma.
- Layout coordinates can be loaded when present.
- The graph remains valid after optional layout saves.

### Phase 2

- Manual add/update/delete node operations persist.
- Manual add/update/delete edge operations persist.
- Invalid operations are rejected without corrupting the graph.
- Sigma frontend re-renders after successful mutations.

### Phase 3

- Agent can answer questions about graph data.
- Agent can propose validated operations.
- Valid agent operations can be applied and rendered.
- Invalid agent operations are rejected safely.

## 12. Implementation Order

1. Define simplified shared graph types.
2. Add or keep a non-private fixture graph.
3. Implement `GET /api/health`.
4. Implement `GET /api/working/graph` with fixture fallback.
5. Implement graph validation helpers.
6. Implement `PUT /api/working/graph` for layout/full graph replacement.
7. Connect Sigma frontend and verify render/layout.
8. Add Phase 2 operation endpoint or specific mutation endpoints.
9. Add Phase 2 manual operations in the frontend.
10. Add Phase 3 agent endpoint only after manual operations are usable.
