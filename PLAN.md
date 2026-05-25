# PLAN: Local Containerized Knowledge Graph Workbench

## Objective

Build the first proof of concept described in `README.md`, `frontend_PRD.md`, `frontend_spec.md`, and `backend_spec.md`:

```text
Human direction -> Pi Coder proposal -> validated graph patch -> updated graph -> optional snapshot
```

The graph visualization is the center of the product. The source graph remains immutable. The working graph and snapshots are mutable. Pi runs in a containerized environment with shared read/write access to the mutable graph JSON. The default safe path is still a typed `GraphPatch` validated and applied by the backend, but the Pi container must also reside beside the mutable data so it can read and modify `working_graph.json` and snapshot JSON files directly when direct-file mode is used.

## Target Local Architecture

Use a local Docker Compose stack with three app services plus ignored local data.

```text
Browser
  |
  v
frontend container: React/Vite + Cytoscape
  |
  v
backend container: Node.js/TypeScript API + JSON persistence
  |
  v
pi-agent container: HTTP bridge around Pi RPC/print mode
```

Shared local storage mounted read/write into both the backend and `pi-agent` containers:

```text
host ./.data/                  # ignored, local only
  source_graph.json            # optional local real/sanitized source graph; treated as immutable
  working_graph.json           # mutable current working graph
  snapshots.json               # snapshot metadata
  snapshots/<snapshotId>.json  # full graph snapshot states
fixtures/source_graph.example.json
```

In Docker, mount the same host `./.data` directory at the same container path, `/graph-data`, for both backend and Pi. That makes Pi physically colocated with the mutable JSON while still keeping it isolated from the host home directory.

Recommended repo structure:

```text
apps/
  backend/
  frontend/
  pi-agent/
packages/
  shared/                      # shared TypeScript graph/API/patch types
fixtures/
.data/                         # gitignored
Dockerfile or per-app Dockerfiles
docker-compose.yml
.env.example
```

## Containerization Requirements for Pi

1. Run Pi inside its own `pi-agent` container.
2. Do not mount the host home directory into the Pi container.
3. Use an isolated Pi config/session directory inside the container or a named Docker volume.
4. Pass model credentials through `.env`, never through committed files.
5. Mount the mutable graph-data directory into both backend and `pi-agent` as the same path:
   - host: `./.data`
   - backend: `/graph-data`
   - `pi-agent`: `/graph-data`
6. Pi must have read/write access to mutable graph JSON:
   - `/graph-data/working_graph.json`
   - `/graph-data/snapshots.json`
   - `/graph-data/snapshots/*.json`
7. Pi may read `/graph-data/source_graph.json`, but normal workflows must treat it as immutable. Prefer file permissions, source checksums, and backend validation to prevent accidental source mutation.
8. Support two graph mutation modes:

```text
Preferred validated mode:
Pi instruction -> typed GraphPatch proposal -> backend validation -> backend apply -> persisted working graph

Direct JSON mode:
Pi instruction -> Pi edits /graph-data/working_graph.json -> backend reloads/validates -> frontend refreshes
```

9. The backend must avoid stale cached graph state. It should either read the latest JSON from disk on each graph request or expose a validation/reload endpoint that is called immediately after Pi direct-file edits.
10. Direct JSON edits must be atomic where practical: write a temporary file, validate it, then rename over `working_graph.json` only if valid, or restore the last-known-valid file on failure.

## Phase 1: Project Scaffold

1. Choose package manager and workspace layout.
   - Recommended: `pnpm` workspace.
2. Add root project files:
   - `package.json`
   - `pnpm-workspace.yaml`
   - `tsconfig.base.json`
   - `.env.example`
3. Create app/package folders:
   - `apps/backend`
   - `apps/frontend`
   - `apps/pi-agent`
   - `packages/shared`
4. Keep `.data/` and private vault data ignored by git.

Acceptance:
- `pnpm install` works.
- Empty frontend/backend/pi-agent apps can start locally.

## Phase 2: Shared Types and Fixture Validation

1. In `packages/shared`, define canonical types from the specs:
   - `GraphNode`
   - `GraphEdge`
   - `GraphState`
   - `GraphMeta`
   - `SnapshotMeta`
   - `GraphPatch`
   - `GraphPatchOperation`
   - `ValidationResult`
   - `ActionSummary`
2. Add schema validation helpers using `zod` or equivalent.
3. Validate `fixtures/source_graph.example.json` against the shared schema.
4. Add ID uniqueness and edge endpoint checks.

Acceptance:
- Fixture graph passes validation.
- Invalid duplicate IDs and dangling edges fail validation.

## Phase 3: Backend Persistence and Startup

1. Build `apps/backend` with Node.js + TypeScript + Express or Fastify.
2. Implement local JSON persistence under `DATA_DIR`.
   - local default: `.data/`
   - Docker path: `/graph-data`
3. Startup behavior:
   - create `.data/` if missing
   - load `.data/source_graph.json` if present
   - otherwise copy/use `fixtures/source_graph.example.json`
   - create `.data/working_graph.json` as a working copy if missing
   - load or initialize snapshot metadata
4. Implement health and graph endpoints:
   - `GET /api/health`
   - `GET /api/source/meta`
   - `GET /api/source/graph`
   - `GET /api/working/graph`
   - `PUT /api/working/graph`

Acceptance:
- `GET /api/working/graph` returns a renderable graph.
- Replacing the working graph validates before persisting.
- Backend can see Pi direct-file edits after reload/read-through validation.
- Source graph remains unchanged.

## Phase 4: Backend Patch Validation and Application

1. Implement patch validation for all required operations:
   - `add_node`
   - `update_node`
   - `delete_node`
   - `add_edge`
   - `update_edge`
   - `delete_edge`
   - `merge_nodes`
   - `split_node`
2. Block malformed or corrupting patches:
   - duplicate node/edge IDs
   - missing referenced nodes
   - deleting nodes without deleting incident edges
   - updating/deleting missing elements
   - unknown operation types
3. Return warnings without blocking for exploratory graph edits.
4. Implement patch application as a pure transform first, then persist only after validation.
5. Add endpoints:
   - `POST /api/patch/validate`
   - `POST /api/patch/apply`
6. Return `changedElementIds` and `ActionSummary` from apply.

Acceptance:
- Valid patches mutate the working graph.
- Invalid patches return `422` and do not mutate files.
- Changed elements can be highlighted by the frontend.

## Phase 5: Snapshot API

1. Implement snapshot persistence:
   - metadata in `.data/snapshots.json`
   - full graph state in `.data/snapshots/<snapshotId>.json`
2. Add endpoints:
   - `GET /api/snapshots`
   - `POST /api/snapshots`
   - `GET /api/snapshots/:snapshotId`
   - `POST /api/snapshots/:snapshotId/load`
   - `POST /api/snapshots/:snapshotId/duplicate`
   - `POST /api/working/revert-to-source`
3. Loading a snapshot replaces the working graph.
4. Revert copies source into working graph.

Acceptance:
- Save, list, load, duplicate, and revert all work.
- Snapshots load without calling Pi.

## Phase 6: Frontend App Shell

1. Build `apps/frontend` with Vite + React + TypeScript.
2. Implement the required single-screen layout:

```text
AppShell
├── TopToolbar
├── MainGrid
│   ├── InspectorPanel
│   ├── GraphCanvas
│   └── PiPanel
└── StatusBar
```

3. Fetch initial data:
   - source meta
   - working graph
   - snapshots
4. Store frontend-owned state:
   - selected IDs
   - undo stack
   - redo stack
   - Pi messages
   - last patch/action/validation details

Acceptance:
- The app loads the working graph and shows node/edge counts.
- Layout matches the specs with graph centered.

## Phase 7: Graph Canvas and Inspector

1. Add Cytoscape.js graph rendering.
2. Render nodes and edges from `workingGraph`.
3. Use simple visual encoding:
   - source: grey
   - human: blue
   - llm: purple
   - selected: yellow outline
   - changed: green highlight
   - warning/invalid: orange/red outline when needed
4. Implement:
   - zoom/pan
   - drag nodes
   - node selection
   - edge selection
   - multi-select nodes
   - background click clears selection
5. Implement `InspectorPanel` states:
   - no selection
   - single node
   - single edge
   - multiple nodes
   - invalid/deleted selection
6. Inspector edits should create patch operations and call backend apply.

Acceptance:
- Selecting graph elements updates inspector.
- Editing labels/types/notes updates working graph through validation.

## Phase 8: Direct Toolbar Operations and Undo/Redo

1. Add toolbar controls exactly from the specs:
   - Undo
   - Redo
   - Add Node
   - Add Edge
   - Merge Selected
   - Split Selected
   - Delete Selected
   - Save Snapshot
   - Snapshot dropdown
2. Model direct operations as `GraphPatch` whenever possible.
3. Before every successful mutation:
   - push current `workingGraph` to `undoStack`
   - clear `redoStack`
4. Undo/redo flow:
   - restore full prior graph state through `PUT /api/working/graph`
   - backend validates and persists replacement
5. Store layout positions in `GraphState.layout` after node drag and before snapshots.

Acceptance:
- Add, delete, merge, split, and inspector edits work.
- Undo/redo works without backend action replay.

## Phase 9: Pi Panel With Mock Pi Endpoint

1. Implement `PiPanel` tabs:
   - Chat
   - Actions
   - Raw
2. Add backend mock endpoint first:
   - `POST /api/pi/chat`
   - returns either plain text or a simple valid `GraphPatch`
3. Frontend flow:
   - send instruction, selected IDs, current graph context, active snapshot
   - display response in Chat
   - display summary in Actions
   - display raw response/patch/validation in Raw
   - require user confirmation before applying a proposed patch, or clearly separate proposal from apply
4. Apply proposed patch through `POST /api/patch/apply`.

Acceptance:
- Mock Pi can propose a patch.
- User can apply it and see graph changes.
- Invalid mock/test patches are rejected safely.

## Phase 10: Containerized Local Stack

1. Add Dockerfiles for:
   - frontend
   - backend
   - pi-agent
2. Add `docker-compose.yml` similar to:

```yaml
services:
  backend:
    build: ./apps/backend
    ports:
      - "3001:3001"
    volumes:
      - ./.data:/graph-data
      - ./fixtures:/app/fixtures:ro
    environment:
      DATA_DIR: /graph-data
      FIXTURE_GRAPH_PATH: /app/fixtures/source_graph.example.json
      PI_AGENT_URL: http://pi-agent:4100

  frontend:
    build: ./apps/frontend
    ports:
      - "5173:5173"
    environment:
      VITE_API_BASE_URL: http://localhost:3001/api
    depends_on:
      - backend

  pi-agent:
    build: ./apps/pi-agent
    ports:
      - "4100:4100"
    working_dir: /graph-data
    volumes:
      - ./.data:/graph-data
      - pi-agent-home:/home/piagent/.pi/agent
    environment:
      GRAPH_DATA_DIR: /graph-data
      PI_CODING_AGENT_DIR: /home/piagent/.pi/agent
      PI_OFFLINE: "0"
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      GEMINI_API_KEY: ${GEMINI_API_KEY:-}

volumes:
  pi-agent-home:
```

3. Keep default frontend/backend development possible outside Docker if desired.
4. Add healthchecks for backend and pi-agent.

Acceptance:
- `docker compose up --build` starts the full local stack.
- Frontend reaches backend.
- Backend reaches pi-agent.
- Backend and Pi both see the same `/graph-data/working_graph.json` file.
- Pi can read/write mutable graph JSON in `/graph-data`.
- `.data/` is persisted locally and ignored by git.

## Phase 11: Real Pi Agent Bridge and Direct JSON Access

1. In `apps/pi-agent`, implement a small HTTP service:
   - `GET /health`
   - `POST /chat`
   - optional `POST /direct-edit` for instructions that explicitly allow Pi to edit JSON files
2. The service wraps Pi in headless mode with working directory `/graph-data`.
   - Preferred integration: `pi --mode rpc --no-session` with JSONL stdin/stdout.
   - Simpler fallback: `pi -p` for one-shot prompts.
   - Ensure Pi has tools enabled for file access inside the container, especially `read`, `write`, `edit`, and `bash`.
3. Build a strict graph-transformation prompt that includes:
   - user instruction
   - selected node/edge IDs
   - graph nodes/edges or paths to `/graph-data/working_graph.json`
   - required `GraphPatch` JSON shape for validated mode
   - direct-edit rules when direct JSON mode is used
4. Support two Pi output modes:
   - patch proposal mode: Pi returns a `GraphPatch`; backend validates and applies it
   - direct JSON mode: Pi reads and edits `/graph-data/working_graph.json` directly, then backend reloads and validates the edited file
5. Direct JSON mode safety protocol:
   - create backups of `working_graph.json`, `snapshots.json`, and `source_graph.json` before invoking Pi
   - record a checksum of `source_graph.json`
   - instruct Pi not to edit `source_graph.json`
   - prefer temp-file plus rename for large rewrites
   - after Pi finishes, backend validates the resulting `working_graph.json` and any touched snapshots
   - if validation fails or the source checksum changes, restore backups and return blockers to the frontend
6. Backend `/api/pi/chat` calls `PI_AGENT_URL` and then validates the proposed patch or direct JSON result against the current working graph.
7. If validation has blockers, return the blockers to the frontend and do not promote invalid graph state.

Acceptance:
- Pi runs in its own container.
- Pi resides on the same mutable graph-data volume as the backend.
- Pi can read and modify `/graph-data/working_graph.json` and snapshot JSON files.
- Pi can propose typed graph patches from natural-language instructions.
- Backend validation still protects the app from invalid graph state.

## Phase 12: Visual Validation With Real/Sanitized Graph

1. Put the local visual-validation graph at:

```text
.data/source_graph.json
```

2. Restart backend so it initializes from the local source graph.
3. Test with the approximately 56-node graph:
   - initial render under one second
   - selection remains responsive
   - Pi proposals are understandable
   - patch validation catches bad IDs/dangling edges
   - snapshots can save/load/revert
4. Do not commit `.data/source_graph.json` or private vault content.

Acceptance:
- The graph workbench is usable for visual validation on the local concept graph.

## Phase 13: Testing and Safety Checks

1. Backend tests:
   - graph validation
   - patch validation blockers
   - patch apply transforms
   - snapshot save/load/duplicate
   - source immutability
   - `PUT /api/working/graph` undo/redo replacement validation
2. Frontend tests where practical:
   - API client functions
   - state reducer or mutation helpers
   - selection and undo/redo logic
3. Manual smoke tests:
   - load app
   - add node
   - add edge
   - edit inspector fields
   - merge nodes
   - split node
   - delete selected
   - undo/redo
   - save snapshot
   - load snapshot
   - revert to source
   - mock Pi patch
   - real Pi patch
4. Add a script such as:

```bash
pnpm test
pnpm lint
pnpm typecheck
```

Acceptance:
- Invalid graph states cannot be persisted through normal APIs.
- Source graph remains immutable after all tests.

## Phase 14: Developer Documentation

1. Update `README.md` with local run instructions:
   - install dependencies
   - run frontend/backend locally
   - run full Docker Compose stack
   - configure model API keys
   - reset `.data/`
2. Add examples:
   - example Pi prompts
   - example GraphPatch request
   - example invalid patch response
3. Add troubleshooting:
   - Pi credentials missing
   - backend cannot reach pi-agent
   - graph validation failure
   - snapshot files not writable

Acceptance:
- A fresh local developer can start the app and validate graph changes.

## Suggested Build Order Summary

1. Shared types and validation.
2. Backend graph load/persist with fixture fallback.
3. Backend patch validation/apply.
4. Backend snapshots and revert.
5. Frontend shell and graph canvas.
6. Inspector and selection.
7. Toolbar direct operations.
8. Frontend-owned undo/redo.
9. Pi Panel with mock `/api/pi/chat`.
10. Docker Compose for frontend/backend/pi-agent with shared `/graph-data` mount.
11. Real pi-agent HTTP bridge around Pi RPC/print mode with direct JSON access.
12. Visual validation using local `.data/source_graph.json`.

## Key Design Decisions

- Frontend owns undo/redo stacks.
- Backend owns validation and persistence.
- Source graph is immutable.
- Working graph is mutable, even for elements with `origin: "source"`.
- Snapshots are full graph states, not replay logs.
- Pi is colocated with mutable graph JSON through the shared `/graph-data` mount.
- Preferred mode: Pi proposes patches and backend applies patches.
- Direct JSON mode: Pi can edit `working_graph.json`, then backend validates/reloads or restores from backup.
- Pi is containerized for local safety and reproducibility.
- First PoC avoids deferred features: branches, side-by-side comparison, audit lineage, collaboration, mobile layout, and advanced analytics.
