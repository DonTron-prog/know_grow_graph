# Backend Specification: Snapshot Multi-View Knowledge Graph Workbench PoC

## 1. Source of Truth

`frontend_PRD.md` and `frontend_spec.md` are the source of truth for the first proof of concept.

The backend exists only to support the first frontend layout:

```text
AppShell
├── TopToolbar
├── MainGrid
│   ├── InspectorPanel
│   ├── GraphCanvas
│   └── PiPanel
└── StatusBar
```

The backend must not introduce new first-PoC UI concepts such as side-by-side comparison, branch views, lineage views, group inspectors, or extra primary actions.

Deferred features from broader product specs may be added later, but they should not complicate this backend.

## 2. Backend Goal

Provide a small local API that lets the frontend:

1. Load the immutable source graph.
2. Create and load a mutable working graph.
3. Save, load, duplicate, and revert snapshots.
4. Validate and apply graph patches.
5. Send graph context and user instructions to Pi Coder.
6. Support a containerized Pi Coder that shares the mutable graph JSON directory with the backend.
7. Validate/reload graph state after Pi direct JSON edits.
8. Return patch summaries, warnings, validation results, direct-edit results, and errors for the Pi Panel.

The first validation method is visual: the user should run the frontend, manipulate the graph, apply Pi Coder changes, and inspect whether the graph updates correctly.

## 3. Non-Goals for First Backend PoC

The backend will not implement:

- side-by-side state comparison
- branch management
- deterministic replay
- audit-grade lineage
- loss receipts
- collaboration
- auth/user accounts
- mobile-specific APIs
- graph analytics dashboards
- group/ungroup operations as first-class API concepts
- layout/clustering operations as first-class API concepts

## 4. Recommended Stack

Use a simple local service.

Recommended first implementation:

- Node.js + Express or Fastify
- TypeScript
- JSON files for fastest PoC persistence, or DuckDB if already convenient
- Cytoscape-compatible graph JSON returned to the frontend
- local Pi Coder bridge endpoint, initially mockable

Persistence can start as files under local ignored storage. For local Docker, mount the same host `.data/` directory into both backend and Pi as `/graph-data`:

```text
host ./.data/ -> backend:/graph-data
host ./.data/ -> pi-agent:/graph-data
```

Canonical mutable storage:

```text
/graph-data/
├── source_graph.json          # read-only by application rule
├── working_graph.json         # mutable current working graph
├── snapshots.json             # snapshot metadata
├── snapshots/
│   └── <snapshotId>.json      # mutable snapshot graph state
└── action_log.jsonl           # optional debugging only
```

`.data/` and private vault contents must not be committed to git.

## 5. Canonical API Models

The backend should use the frontend graph shape at API boundaries.

### 5.1 GraphNode

```ts
type GraphNode = {
  id: string;
  label: string;
  type: string;
  origin: 'source' | 'human' | 'llm' | 'imported' | 'unknown';
  notes?: string;
  sourceNodeIds?: string[];
  properties?: Record<string, unknown>;
};
```

### 5.2 GraphEdge

```ts
type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  origin: 'source' | 'human' | 'llm' | 'imported' | 'unknown';
  notes?: string;
  sourceEdgeIds?: string[];
  properties?: Record<string, unknown>;
};
```

### 5.3 GraphState

```ts
type GraphState = {
  graphId: string;
  name: string;
  stateType: 'source' | 'working' | 'snapshot';
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: Record<string, { x: number; y: number }>;
  updatedAt?: string;
};
```

### 5.4 GraphMeta

```ts
type GraphMeta = {
  graphId: string;
  name: string;
  stateType: 'source' | 'working' | 'snapshot';
  nodeCount: number;
  edgeCount: number;
  readOnly: boolean;
  updatedAt?: string;
};
```

### 5.5 SnapshotMeta

```ts
type SnapshotMeta = {
  snapshotId: string;
  name: string;
  notes?: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt?: string;
};
```

## 6. Source and Working Graph Semantics

### 6.1 Source Graph

The source graph is immutable.

- Backend never mutates `source_graph.json` or source tables through working graph operations.
- Revert always copies source into working graph.
- Source graph may be returned to frontend for metadata and initial load.

### 6.2 Working Graph

The working graph is mutable.

Important distinction:

- A source graph record is read-only.
- A working graph element with `origin: 'source'` is editable/deletable because it is only a working copy.

This prevents conflict with the frontend inspector, which edits the working graph but treats the original source graph as read-only.

### 6.3 Snapshots

A snapshot is a full persisted graph state.

Snapshots store:

- nodes
- edges
- layout metadata
- snapshot name
- notes, optional
- created timestamp

Snapshots must load without calling Pi Coder and without replaying operations.

### 6.4 Containerized Pi Data Access

The Pi Coder runs in a separate `pi-agent` container, but it must reside on the same mutable graph-data volume as the backend.

Required mount contract:

```text
host ./.data -> backend:/graph-data
host ./.data -> pi-agent:/graph-data
```

Pi may read and write:

- `/graph-data/working_graph.json`
- `/graph-data/snapshots.json`
- `/graph-data/snapshots/*.json`

Pi may read `/graph-data/source_graph.json`, but the source graph remains immutable by application rule. Direct source edits are invalid and should be treated as corruption or operator error. Direct-edit flows should checksum or back up `source_graph.json` before invoking Pi and fail if it changes.

The backend must not assume its in-memory graph cache is authoritative after Pi direct-file work. It must either:

1. read `working_graph.json` from disk on graph requests, or
2. explicitly reload and validate `working_graph.json` after Pi direct-file operations.

## 7. Graph Patch Contract

Use the frontend patch contract.

```ts
type GraphPatch = {
  patchId: string;
  instruction: string;
  summary: string;
  operations: GraphPatchOperation[];
};
```

```ts
type GraphPatchOperation =
  | AddNodeOp
  | UpdateNodeOp
  | DeleteNodeOp
  | AddEdgeOp
  | UpdateEdgeOp
  | DeleteEdgeOp
  | MergeNodesOp
  | SplitNodeOp;
```

Required operation names:

- `add_node`
- `update_node`
- `delete_node`
- `add_edge`
- `update_edge`
- `delete_edge`
- `merge_nodes`
- `split_node`

The first PoC should not add first-class `group_nodes`, `layout_graph`, or comparison operations.

### 7.1 Update Operations

Use minimal changed fields.

```ts
type UpdateNodeOp = {
  op: 'update_node';
  id: string;
  changes: Partial<Pick<GraphNode, 'label' | 'type' | 'notes' | 'properties'>>;
};
```

```ts
type UpdateEdgeOp = {
  op: 'update_edge';
  id: string;
  changes: Partial<Pick<GraphEdge, 'label' | 'notes' | 'properties'>>;
};
```

Edge source/target edits are not required in the first frontend. Reconnect should be represented as `delete_edge` plus `add_edge`.

### 7.2 Delete Operations

```ts
type DeleteNodeOp = {
  op: 'delete_node';
  id: string;
  deleteIncidentEdges?: boolean;
};
```

```ts
type DeleteEdgeOp = {
  op: 'delete_edge';
  id: string;
};
```

If `deleteIncidentEdges` is false or omitted and incident edges exist, validation should block the patch.

## 8. Validation

The backend must expose validation before applying a patch and must validate again during apply.

### 8.1 Validation Result

```ts
type ValidationResult = {
  level: 'blocker' | 'warning' | 'info';
  code: string;
  message: string;
  elementIds?: string[];
  operationIndex?: number;
};
```

### 8.2 Blockers

Block patch application for:

- malformed patch
- unknown operation type
- duplicate node id
- duplicate edge id
- edge references missing node
- delete operation references missing element
- update operation references missing element
- delete node would leave dangling edges
- patch attempts to mutate source graph directly
- graph would contain duplicate ids after apply
- graph would contain edges pointing to missing nodes after apply

### 8.3 Warnings

Do not block for:

- LLM-created node has no source refs
- patch deletes source-origin elements from the working graph
- patch deletes many nodes
- patch creates disconnected components
- patch removes many source-derived edges
- operation has no notes or rationale

Warnings should be returned to the frontend for the `Actions` and `Raw` tabs.

## 9. Action Summary

The backend should generate or pass through the frontend `ActionSummary` shape.

```ts
type ActionSummary = {
  title: string;
  instruction: string;
  addedNodes: string[];
  updatedNodes: string[];
  deletedNodes: string[];
  addedEdges: string[];
  updatedEdges: string[];
  deletedEdges: string[];
  mergedNodes: string[];
  splitNodes: string[];
  warnings: string[];
};
```

The frontend will display this in the Pi Panel `Actions` tab.

No separate backend-driven Change Summary panel is required for the first PoC.

## 10. REST API

Base path:

```text
/api
```

### 10.1 Health

#### `GET /api/health`

Returns:

```ts
type HealthResponse = {
  ok: boolean;
  version: string;
  piCoderAvailable: boolean;
};
```

### 10.2 Source Graph

#### `GET /api/source/meta`

Returns source graph metadata.

```ts
type SourceMetaResponse = GraphMeta;
```

#### `GET /api/source/graph`

Returns the immutable source graph.

```ts
type SourceGraphResponse = GraphState;
```

The returned graph has `stateType: 'source'` and `readOnly` metadata should be true where relevant.

### 10.3 Working Graph

#### `GET /api/working/graph`

Returns the current working graph.

```ts
type WorkingGraphResponse = GraphState;
```

#### `PUT /api/working/graph`

Replaces the current working graph with a validated graph state.

This endpoint is required for frontend-owned undo/redo. The frontend may restore a previous full `GraphState` by calling this endpoint. The backend validates and persists the replacement but does not maintain an undo or redo stack.

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

#### `POST /api/working/revert-to-source`

Copies the source graph into the working graph.

Response:

```ts
type RevertToSourceResponse = {
  graph: GraphState;
  actionSummary: ActionSummary;
};
```

### 10.4 Patch Validation and Apply

#### `POST /api/patch/validate`

Validates a patch against the current working graph without applying it.

Request:

```ts
type ValidatePatchRequest = {
  patch: GraphPatch;
};
```

Response:

```ts
type ValidatePatchResponse = {
  valid: boolean;
  validationResults: ValidationResult[];
  actionSummary: ActionSummary;
};
```

#### `POST /api/patch/apply`

Validates and applies a patch to the current working graph.

Request:

```ts
type ApplyPatchRequest = {
  patch: GraphPatch;
};
```

Response:

```ts
type ApplyPatchResponse = {
  graph: GraphState;
  appliedPatch: GraphPatch;
  validationResults: ValidationResult[];
  actionSummary: ActionSummary;
  changedElementIds: string[];
};
```

If validation has blockers, return HTTP `422` and do not mutate the working graph.

### 10.5 Direct Operations

The frontend may perform direct operations locally and then replace the working graph, or it may use backend patch application.

Preferred first-PoC approach: model direct toolbar/inspector edits as `GraphPatch` operations and call `/api/patch/apply`.

Examples:

- Add Node -> `add_node`
- Add Edge -> `add_edge`
- Delete Selected -> `delete_node` / `delete_edge`
- Merge Selected -> `merge_nodes`
- Split Selected -> `split_node`
- Inspector label edit -> `update_node` / `update_edge`

This keeps validation and graph mutation logic in one place.

### 10.6 Snapshots

#### `GET /api/snapshots`

Returns snapshot list for the snapshot dropdown.

```ts
type ListSnapshotsResponse = {
  snapshots: SnapshotMeta[];
};
```

#### `POST /api/snapshots`

Saves the current working graph as a named snapshot.

Request:

```ts
type CreateSnapshotRequest = {
  name: string;
  notes?: string;
  layout?: Record<string, { x: number; y: number }>;
};
```

Response:

```ts
type CreateSnapshotResponse = {
  snapshot: SnapshotMeta;
};
```

#### `GET /api/snapshots/:snapshotId`

Returns a saved snapshot graph.

```ts
type GetSnapshotResponse = {
  snapshot: SnapshotMeta;
  graph: GraphState;
};
```

#### `POST /api/snapshots/:snapshotId/load`

Replaces the working graph with the snapshot graph.

Response:

```ts
type LoadSnapshotResponse = {
  graph: GraphState;
  snapshot: SnapshotMeta;
  actionSummary: ActionSummary;
};
```

#### `POST /api/snapshots/:snapshotId/duplicate`

Duplicates an existing snapshot.

Request:

```ts
type DuplicateSnapshotRequest = {
  name: string;
  notes?: string;
};
```

Response:

```ts
type DuplicateSnapshotResponse = {
  snapshot: SnapshotMeta;
};
```

### 10.7 Pi Coder

The backend supports two Pi Coder modes:

1. `patch` mode, where Pi proposes a typed `GraphPatch` and the frontend/user applies it through `/api/patch/apply`.
2. `direct_json` mode, where Pi reads and edits `/graph-data/working_graph.json` directly, then the backend reloads and validates the resulting file.

Patch mode is the preferred default because all mutation logic stays in backend patch validation. Direct JSON mode is required for local workflows where Pi must operate directly on the JSON graph file.

```ts
type PiEditMode = 'patch' | 'direct_json';
```

#### `POST /api/pi/chat`

Sends current graph context and user instruction to Pi Coder. By default this endpoint proposes a patch and does not mutate the working graph.

Request:

```ts
type PiCoderRequest = {
  instruction: string;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  snapshot?: SnapshotMeta;
  mode?: PiEditMode; // default: 'patch'
};
```

Response:

```ts
type PiCoderResponse = {
  message: string;
  mode: PiEditMode;
  patch?: GraphPatch;
  graph?: GraphState; // present when direct_json mode succeeds
  snapshots?: SnapshotMeta[]; // present if direct_json changes snapshot metadata
  actionSummary?: ActionSummary;
  warnings?: string[];
  validationResults?: ValidationResult[];
  changedElementIds?: string[];
  rawPiOutput?: unknown;
};
```

If Pi Coder returns plain text without a patch in `patch` mode, the backend returns `message` only and does not mutate the graph.

For the first PoC, this endpoint may return mocked patches until the Pi bridge is ready.

Important: in `patch` mode, `/api/pi/chat` should propose a patch. Patch application should happen through `/api/patch/apply` after frontend/user confirmation.

#### `POST /api/pi/direct-edit`

Runs Pi with working directory `/graph-data` and explicitly allows direct edits to `working_graph.json` and snapshot JSON files.

Request:

```ts
type PiDirectEditRequest = Omit<PiCoderRequest, 'mode'> & {
  mode?: 'direct_json';
};
```

Required backend behavior:

1. Read and keep backups of the current valid `working_graph.json`, `snapshots.json`, and `source_graph.json`, and record a checksum of `source_graph.json`.
2. Call the `pi-agent` container with `GRAPH_DATA_DIR=/graph-data`.
3. Instruct Pi not to edit `source_graph.json`.
4. Let Pi read and modify `/graph-data/working_graph.json`, and snapshot JSON files if the instruction requires it.
5. Reload `working_graph.json` and snapshot metadata from disk after Pi completes.
6. Validate the full graph state and any touched snapshot graph states.
7. If valid, persist/return the graph, snapshot metadata if changed, and changed element ids.
8. If invalid or if `source_graph.json` changed, restore backups, return `422`, and do not expose corrupted graph state to the frontend.

Response:

```ts
type PiDirectEditResponse = {
  message: string;
  mode: 'direct_json';
  graph: GraphState;
  snapshots?: SnapshotMeta[];
  actionSummary?: ActionSummary;
  warnings?: string[];
  validationResults: ValidationResult[];
  changedElementIds: string[];
  rawPiOutput?: unknown;
};
```

## 11. Error Response Shape

All API errors should use this shape:

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
- `404` missing graph/snapshot/element
- `409` duplicate id or state conflict
- `422` patch validation blockers or invalid direct JSON edit result
- `500` unexpected backend error
- `504` Pi Coder timeout

The frontend will display errors in the StatusBar and Pi Panel Raw tab.

## 12. Layout Metadata

The backend should accept and persist layout coordinates but should not own layout behavior.

```ts
type LayoutMetadata = Record<string, { x: number; y: number }>;
```

Rules:

- Cytoscape/frontend can compute layout.
- Backend stores coordinates when saving snapshots.
- Missing layout is acceptable; frontend may recompute.
- Layout updates do not mutate the source graph.

## 13. State Ownership and Undo/Redo

For the first PoC, undo and redo are frontend-owned.

Backend responsibilities:

- Persist the immutable source graph.
- Persist the latest valid working graph.
- Persist saved snapshots.
- Validate full working graph replacements.
- Validate and apply patches.

Backend non-responsibilities:

- Do not store undo or redo stacks.
- Do not replay action history to implement undo.
- Do not treat action history as canonical state.

Undo/redo flow:

1. Frontend keeps full previous `GraphState` values in memory.
2. On undo or redo, frontend calls `PUT /api/working/graph` with the target graph state.
3. Backend validates the replacement graph.
4. If valid, backend persists it as the current working graph and returns it.
5. If invalid, backend returns `422` and leaves the current working graph unchanged.

## 14. Startup Behavior

On startup:

1. Ensure local data directory exists.
2. Use `DATA_DIR` for persistence. Local default is `.data/`; Docker default is `/graph-data`.
3. Load source graph from `$DATA_DIR/source_graph.json`.
4. If `$DATA_DIR/source_graph.json` does not exist, copy from `fixtures/source_graph.example.json` when available.
5. If no working graph exists, create working graph as a copy of source graph.
6. Load snapshot metadata.
7. Start API server.
8. If Pi direct JSON mode is enabled, ensure backend and `pi-agent` point at the same `DATA_DIR` path (`/graph-data` in Docker).

The first PoC should include a checked-in small fixture with no private vault content. The local 56-node graph can replace it in `.data/source_graph.json` during visual validation.

## 15. Import Boundary

Importing the Obsidian vault is not part of the frontend-first PoC backend unless already available.

For initial development, the backend should use `fixtures/source_graph.example.json` so the frontend can render immediately.

For visual validation, replace the fixture with a local `.data/source_graph.json` containing approximately the 56 concept nodes.

Acceptable source options:

1. A checked-in generated fixture graph with no private content.
2. A sanitized JSON export.
3. An existing local import from the private vault, stored outside git.

## 16. Acceptance Criteria

The backend is acceptable for the first PoC when:

- `GET /api/working/graph` returns a renderable graph.
- The frontend can show node/edge counts in the StatusBar.
- Inspector edits can update the working graph via patch apply or graph replace.
- Add node, add edge, delete, merge, and split can be represented as patches.
- Invalid patches are rejected without corrupting the graph.
- Snapshots can be saved, listed, loaded, duplicated, and reverted to source.
- Pi Coder chat can return either plain text or a typed patch.
- Pi Coder direct JSON mode can read/write the shared `working_graph.json` file.
- Backend reloads and validates Pi direct-file edits before returning them to the frontend.
- Invalid Pi direct-file edits are rejected or restored without corrupting the graph.
- Patch validation returns blockers and warnings for the frontend Raw/Actions tabs.
- Applying a patch returns changed element ids for visual highlighting.
- Source graph remains unchanged after all working graph edits.
- `PUT /api/working/graph` supports frontend-owned undo/redo by replacing the working graph with a valid prior graph state.
- A checked-in non-private fixture graph is available for first render and development.

## 17. First Implementation Order

1. Define TypeScript types shared with the frontend.
2. Add `fixtures/source_graph.example.json` using the canonical `GraphState` shape.
3. Implement local JSON persistence using `DATA_DIR`.
4. Implement source/working graph load from `.data/` or `/graph-data` with fixture fallback.
5. Implement graph validation helpers.
6. Implement patch validation.
7. Implement patch application.
8. Implement `PUT /api/working/graph` for frontend-owned undo/redo.
9. Implement snapshot save/list/load/duplicate/revert.
10. Implement mock `/api/pi/chat` returning a simple valid patch.
11. Add Docker Compose with backend and Pi sharing the same `/graph-data` mount.
12. Implement Pi direct JSON edit flow with backup, reload, validation, and restore-on-failure.
13. Connect frontend and visually validate graph updates.
14. Replace mock Pi Coder with real bridge.
