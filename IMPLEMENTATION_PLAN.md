# IMPLEMENTATION_PLAN.md

Plan-only snapshot for the first PoC, refreshed after the frontend read-only vertical slice. Requirements are in `specs/frontend_spec.md`, `specs/backend_spec.md`, `frontend_PRD.md`, and `README.md`.

## Completed in the latest BUILD iteration

- Replaced the frontend scaffold with a Vite/React/TypeScript browser app.
- Added a frontend API client for the implemented read endpoints: `GET /api/source/meta`, `GET /api/working/graph`, and `GET /api/snapshots`.
- Implemented the required single-screen shell regions: `TopToolbar`, `InspectorPanel`, `GraphCanvas`, `PiPanel`, and `StatusBar`.
- Added a read-only SVG graph display with node/edge rendering, click selection, background clear, inspector details, load/error states, active graph status, graph counts, snapshot count, and placeholder disabled mutation controls.
- Added Pi Panel tabs for Chat, Actions, and Raw in read-only/placeholder form.
- Added frontend API-client tests for base URL normalization, endpoint fetching, and backend `ApiError` detail preservation.
- Added a frontend `build` script backed by Vite.
- Updated the shared package exports/types so TypeScript consumers can import shared types from `@know-grow/shared`.
- Tightened the root Node engine to satisfy Vite's current runtime requirement.

## Confirmed current state

- The implementation lives under `apps/*` and `packages/*`; root `src/` and `src/lib/` are placeholders only.
- `apps/backend/src/app.ts` exposes a modular `createApp(...)`; `apps/backend/src/persistence.ts` owns disk-backed JSON initialization/read/write; `apps/backend/src/index.ts` only starts the server.
- Backend currently implements `GET /api/health`, `GET /api/source/meta`, `GET /api/source/graph`, `GET /api/working/graph`, `PUT /api/working/graph`, and `GET /api/snapshots`.
- Implemented backend routes already follow the desired conventions: spec-shaped `{ graph }` replacement requests, `{ graph, validationResults }` replacement responses, `{ snapshots }` list responses, and `{ error: { code, message, details? } }` API errors.
- Backend graph reads are disk-backed per request, which should be preserved so later Pi direct-file edits can be reloaded instead of hidden behind an in-memory cache.
- `packages/shared/src/index.ts` defines canonical graph, snapshot, patch-operation, validation-result, action-summary, and some API envelope schemas/types.
- `validateGraphState` covers malformed graph shape, duplicate node IDs, duplicate edge IDs, dangling edge endpoints, and layout entries for missing nodes.
- `fixtures/source_graph.example.json` is a checked-in non-private fixture for first render/startup fallback.
- Frontend now has a Vite/React/TypeScript read-only vertical slice and API-client behavior tests, but graph interaction is still the simple SVG implementation rather than Cytoscape/equivalent canvas behavior.
- `packages/shared/src/index.js` is still a stale Phase 1 placeholder runtime file while package exports point at `./src/index.ts`; settle runtime/browser consumption and remove or neutralize this stale file during shared packaging cleanup.
- `apps/pi-agent/src/index.js` is still a console-log scaffold; there is no Pi HTTP bridge, Docker stack, or direct-JSON workflow yet.
- Frontend tests now cover API-client behavior; pi-agent tests still execute zero behavior tests until the HTTP bridge lands.

## Prioritized remaining work

- **P0 - Implement central graph rendering and interaction.**
  - Add Cytoscape.js or an equivalent graph renderer with zoom, pan, drag, node selection, edge selection, multi-select, background clear, origin colors, selected outlines, warning/invalid styling hooks, and recent-change highlighting.
  - Resolve renderer ID handling for node and edge IDs before styling or highlighting depends on globally unique element IDs.
  - Decide how dragged layout coordinates are persisted in the MVP: full graph replacement, snapshot save, or a later dedicated layout flow.

- **P0 - Settle shared API runtime parsing and package cleanup.**
  - Add or reuse shared schemas/types for source meta, source graph, working graph reads, and snapshots if the frontend will runtime-parse API responses with shared contracts.
  - Choose whether `@know-grow/shared` remains source-imported by Vite or is compiled to JS/declarations for browser/runtime consumption.
  - Remove or neutralize the stale `packages/shared/src/index.js` placeholder as part of packaging cleanup.
  - Validate that backend and frontend import the same shared contracts without runtime ambiguity.

- **P0 - Implement shared graph patch validation/application.**
  - Add pure helpers in `packages/shared` for validating and applying `add_node`, `update_node`, `delete_node`, `add_edge`, `update_edge`, `delete_edge`, `merge_nodes`, and `split_node` without mutating inputs.
  - Include blockers for malformed patches, unknown operation types, duplicate IDs, missing references, deleting nodes with incident edges unless allowed, missing update/delete targets, direct source-graph mutation, post-apply duplicate IDs, and post-apply dangling edges.
  - Include warnings for LLM nodes without source refs, deleting source-origin working elements, many deletions/source-edge removals, disconnected components, and operations without notes/rationale.
  - Generate `ActionSummary` and `changedElementIds` consistently; cover merge/split semantics, source-ref preservation, replacement-edge conflicts, warning thresholds, and changed-ID conventions with tests.

- **P0 - Add backend patch endpoints.**
  - Implement `POST /api/patch/validate` and `POST /api/patch/apply` using the shared patch engine.
  - Return the specified validation results, action summary, applied patch, updated graph, and changed IDs.
  - Persist only accepted patches; return `422` and leave `working_graph.json` unchanged when blockers exist.
  - Keep API errors in `{ error: { code, message, details? } }`, with validation blockers under `error.details.validationResults`.
  - Test valid mutation, invalid no-mutation, and warning-not-blocking behavior.

- **P0 - Implement backend snapshot mutation and source-revert routes.**
  - Add snapshot graph-file persistence under `snapshots/<snapshotId>.json` plus metadata updates in `snapshots.json`.
  - Implement `POST /api/working/revert-to-source`, `POST /api/snapshots`, `GET /api/snapshots/:snapshotId`, `POST /api/snapshots/:snapshotId/load`, and `POST /api/snapshots/:snapshotId/duplicate`.
  - Validate loaded/replaced graph states, preserve source immutability, and return action summaries for load/revert flows.
  - Test save/list/get/load/duplicate/revert, missing snapshot `404`, invalid snapshot no-mutation, and source graph unchanged after working edits.

- **P0 - Implement frontend editing, toolbar operations, undo/redo, and snapshots.**
  - Wire inspector edits and toolbar add/delete/merge/split through backend patch apply where possible.
  - Keep frontend-owned `undoStack`/`redoStack` of full `GraphState` values; call `PUT /api/working/graph` for undo/redo restores.
  - Push the prior graph before toolbar edits, inspector edits, snapshot load, source revert, applied Pi patch, and accepted Pi direct JSON edit.
  - Connect save/load/duplicate/revert snapshot UI to backend routes; surface backend errors in StatusBar/Raw without corrupting the current UI graph.

- **P0 - Expand automated validation for implemented P0 behavior.**
  - Add shared tests for duplicate edge IDs, malformed graph input, layout warnings, patch blockers, warnings, application immutability, action summaries, and changed IDs.
  - Add backend tests for health/source/working reads, fixture fallback, source immutability, patch endpoints, snapshot/revert endpoints, and no mutation on `422`.
  - Expand frontend tests beyond the API client as renderer interaction, selection state, editing, undo/redo, and snapshot flows land.
  - Add pi-agent behavior tests once the HTTP bridge exists; avoid misleading green zero-test packages as functionality lands.
  - Keep `pnpm -r test`, `pnpm -r typecheck`, and `pnpm -r lint` as the required validation gates.

- **P1 - Implement Pi patch-mode chat.**
  - Add mockable `POST /api/pi/chat` that defaults to patch mode, can return plain text without mutation, and can return a typed patch proposal.
  - Do not mutate the graph in patch mode; proposal application must continue through `/api/patch/apply` after frontend/user confirmation.
  - Surface proposed patch, validation results, action summary, raw output, and errors in the frontend Pi Panel.

- **P1 - Replace the pi-agent scaffold with an HTTP bridge.**
  - Add `GET /health` and `POST /chat` or equivalent request/response routes to `apps/pi-agent`.
  - Pass `GRAPH_DATA_DIR=/graph-data`, capture raw Pi output, parse structured patch/direct-edit responses, and handle timeouts/errors.
  - Have backend health report Pi availability from the bridge instead of the current static false default when configured.

- **P1 - Implement Pi direct JSON mode safely.**
  - Add `POST /api/pi/direct-edit` with backups of `working_graph.json`, `snapshots.json`, snapshot graph files as needed, and `source_graph.json` checksum protection.
  - Invoke the pi-agent against the shared graph-data directory, then reload and validate touched graph files from disk.
  - If output is invalid or source changed, restore backups, return `422`, and never expose corrupted graph state to the frontend.
  - Return validated graph, snapshot metadata when changed, validation results, changed IDs, action summary/warnings, and raw Pi output.

- **P1 - Complete frontend Pi Panel behavior for patch and direct JSON modes.**
  - Implement Chat, Actions, and Raw tabs with Pi status transitions: idle, thinking, validating, applying/reloading, failed, complete.
  - Send selected nodes/edges and current graph context to backend Pi endpoints.
  - In direct JSON mode, push undo state before invocation and accept only the backend-reloaded validated graph; keep the last valid graph on failure.

- **P1 - Add Docker Compose and shared graph-data mount.**
  - Add Dockerfiles for frontend, backend, and pi-agent plus `docker-compose.yml`.
  - Mount host `./.data` into backend and pi-agent at `/graph-data`; keep Pi config/session storage isolated from host home and committed files.
  - Smoke-test backend and pi-agent against the same `working_graph.json` path.

- **P2 - Document and run a manual visual smoke path.**
  - Document load, select, drag, add, edit, delete, merge, split, undo/redo, snapshot save/load/duplicate/revert, mock Pi patch, direct JSON edit, and invalid edit recovery steps.
  - Use local/private graph data only under ignored `.data/`; do not commit private vault content.

- **P2 - Resolve documentation drift and historical placeholders.**
  - Keep `README`, `frontend_PRD.md`, `specs/*`, and this plan aligned.
  - Mark root `PLAN.md` as historical/superseded if retained, or update it only when it remains useful.
  - Decide whether root `src/`/`src/lib/` placeholders should remain for Ralph conventions or be documented as unused because the monorepo implementation lives in `apps/*` and `packages/*`.

- **P2 - Harden validation and observability after functional coverage exists.**
  - Introduce structured persisted-graph/direct-edit validation errors rather than generic `500 internal_error` when direct JSON recovery needs detailed Raw-tab output.
  - Add logging sufficient to debug Pi failures and validation recovery without leaking private vault data.

## Open decisions / spec clarifications

- Define merge/split edge remapping semantics, replacement-edge conflict handling, source-ref preservation, output node defaults, and changed-element ID conventions before final patch tests.
- Choose the first MVP UX for toolbar `Merge Selected` and `Split Selected`: minimal local form/confirmation versus Pi delegation.
- Confirm generated ID formats and uniqueness scope for user-created nodes, edges, snapshots, and patch IDs.
- Clarify whether node IDs and edge IDs are separate namespaces or globally unique element IDs for renderer/API purposes.
- Decide whether shared Zod schemas should remain permissive to unknown fields and empty labels/instructions, or become stricter before user-authored graph edits land.
- Pick conservative warning thresholds for “many nodes,” “many source-derived edges,” disconnected components, and missing rationale.
- Choose one canonical frontend direct JSON call path: `/api/pi/direct-edit` versus `/api/pi/chat` with `mode: direct_json`.
- Decide active snapshot and unsaved-change semantics after edit, undo/redo, duplicate, load, save, source revert, patch apply, and direct JSON edit.
- Decide whether drag/layout persistence is only through full graph replace/snapshot save or needs a dedicated layout update flow.
- Ensure UI distinguishes immutable source graph records from editable/deletable source-origin elements inside the mutable working graph.
- Define real pi-agent invocation protocol, timeout behavior, raw-output shape, and mock-to-real migration path.
