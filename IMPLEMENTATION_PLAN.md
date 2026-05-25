# IMPLEMENTATION_PLAN.md

Plan-only snapshot for the first PoC, refreshed after the BUILD backend route-contract increment. Requirements are in `specs/frontend_spec.md`, `specs/backend_spec.md`, `frontend_PRD.md`, and `README.md`.

## Completed in the latest BUILD iteration

- Restored the `apps/*` and `packages/*` workspace files from `HEAD` after they appeared deleted during the iteration.
- Split the backend into testable modules: `apps/backend/src/app.ts` exports `createApp(...)`, `apps/backend/src/persistence.ts` owns paths/JSON persistence/initialization, and `apps/backend/src/index.ts` only initializes persistence and starts the server.
- Aligned `PUT /api/working/graph` to accept `{ graph }`, persist only valid replacements, force `stateType: "working"`, and return `{ graph, validationResults }`.
- Normalized `ApiError` envelopes for malformed JSON, invalid request bodies, validation failures, unknown routes, and internal errors.
- Changed `GET /api/snapshots` to return `{ snapshots }`.
- Added shared API envelope schemas/types for `ApiError`, health responses, replace-working-graph request/response, and list-snapshots responses.
- Added backend route tests for snapshots envelope, valid graph replacement persistence, legacy raw-body `400`, invalid replacement `422` without mutation, malformed JSON `400`, unknown route `404`, and representative internal-error `500` envelopes.
- Removed root spec duplicates in favor of `specs/*` and updated `README` references.
- Ignored local `.pi/`, `.ralph-runner/`, and `ralph-context/` artifacts.

## Confirmed current state

- `packages/shared/src/index.ts` defines graph, snapshot, patch-operation, validation-result, action-summary, and the newly added API envelope schemas/types.
- `validateGraphState` covers malformed graph shape, duplicate node IDs, duplicate edge IDs, dangling edge endpoints, and layout entries for missing nodes.
- Backend implements `GET /api/health`, `GET /api/source/meta`, `GET /api/source/graph`, `GET /api/working/graph`, `PUT /api/working/graph`, and `GET /api/snapshots` with disk-backed reads/writes.
- Backend route tests now cover the route-contract increment; frontend and pi-agent remain console-log scaffolds with no meaningful behavior tests.
- `packages/shared/src/index.js` is still a stale Phase 1 placeholder runtime file while package exports point at `./src/index.ts`; settle shared-package runtime/browser consumption before Vite frontend imports shared code.
- `apps/frontend/src/index.js` and `apps/pi-agent/src/index.js` are scaffolds only; no React/Vite frontend, graph canvas, Pi HTTP bridge, Docker stack, or direct-JSON workflow exists yet.
- `src/` and `src/lib/` remain placeholders; current implementation lives under `apps/*` and `packages/*`.

## Prioritized remaining work

- **P0 - Preserve backend contract conventions as new routes are added.**
  - Preserve disk-backed reads/writes so direct-file Pi edits can be reloaded later.
  - Continue using the `{ error: { code, message, details? } }` convention, with validation blockers in `error.details.validationResults`.

- **P0 - Settle shared API contracts and package consumption.**
  - Add schemas/types for source metadata/graph and working-graph read responses if the frontend needs response parsing.
  - Decide whether `@know-grow/shared` is compiled or source-imported for browser/Vite consumption.
  - Remove or neutralize the stale `packages/shared/src/index.js` placeholder as part of packaging cleanup.
  - Validation: backend and future frontend import the same shared contracts without runtime ambiguity.

- **P0 - Build the frontend read-only vertical slice.**
  - Replace the frontend scaffold with a React/Vite/TypeScript browser app and shared API client.
  - Implement the required shell regions: toolbar, main grid, graph canvas, inspector, Pi panel, and status bar.
  - Fetch source metadata, working graph, and snapshots using the spec-shaped API responses.
  - Render load/error states and graph node/edge counts before mutations.

- **P0 - Implement central graph rendering and selection.**
  - Add Cytoscape.js or equivalent graph renderer with zoom, pan, drag, selection, multi-select, clear selection, origin colors, selected outlines, warning/invalid hooks, and recent-change highlighting.
  - Resolve node/edge ID namespace handling for renderer IDs versus API IDs.
  - Persist dragged layout positions through supported backend flows.

- **P0 - Implement shared graph patch validation/application.**
  - Add pure helpers in `packages/shared` for parsing, validating, and applying all patch operations without mutating inputs.
  - Encode merge/split semantics, edge remapping, conflict handling, source-ref preservation, warning thresholds, action summaries, and changed-element ID conventions.
  - Cover malformed patches, blockers, warnings, result graph validation, immutability, and summaries with shared tests.

- **P0 - Add backend patch endpoints.**
  - Implement `POST /api/patch/validate` and `POST /api/patch/apply` using the shared patch engine.
  - Persist only accepted patches and return the specified graph, patch, validation, action summary, and changed-ID envelopes.
  - Test valid mutation, invalid no-mutation, and warning-not-blocking behavior.

- **P0 - Implement editing, toolbar operations, undo/redo, and snapshots in the UI/backend.**
  - Wire inspector edits and toolbar add/delete/merge/split through patch apply.
  - Implement frontend-owned undo/redo via `PUT /api/working/graph`.
  - Add backend snapshot/source-revert routes: save, list, get, load, duplicate, and revert-to-source.
  - Connect snapshot dropdown actions to backend routes and preserve undo/state semantics.

- **P1 - Implement Pi integration.**
  - Add mock Pi patch-mode chat, proposal display, validation, and explicit apply flow.
  - Replace pi-agent scaffold with `GET /health` and `POST /chat`; have backend report Pi availability and handle plain text, invalid JSON, and patch responses.
  - Add direct JSON mode with backups, checksums, reload validation, restore-on-failure, and frontend state handling.

- **P1 - Add Docker Compose and shared graph-data mount.**
  - Add Dockerfiles for frontend, backend, and pi-agent plus `docker-compose.yml`.
  - Mount host `./.data` into backend and pi-agent at `/graph-data`; keep pi-agent config/session storage isolated.
  - Validate the containerized direct-JSON workflow against shared `working_graph.json`.

- **P1 - Expand automated validation.**
  - Keep adding backend route/persistence tests as each endpoint lands.
  - Add frontend tests for API client/state helpers and pi-agent tests for request/response parsing when those modules exist.
  - Run `pnpm -r test`, `pnpm -r typecheck`, and `pnpm -r lint` before claiming acceptance.

- **P2 - Resolve documentation drift and manual validation.**
  - Keep `README`, `specs/*`, and this plan aligned; mark `PLAN.md` as historical/superseded if retained.
  - Document a manual smoke path for load, select, add, edit, delete, merge, split, undo/redo, snapshots, mock Pi patch, direct JSON mode, and invalid edit recovery.
  - Validate with local/private graph data only under ignored `.data/`; do not commit private vault content.

## Open decisions / spec clarifications

- Define merge/split edge remapping semantics, replacement-edge conflict handling, source-ref preservation, and changed-element ID conventions before finalizing patch tests.
- Choose the first MVP UX for toolbar `Merge Selected` and `Split Selected`: minimal local form/confirmation versus Pi delegation.
- Pick conservative warning thresholds for “many nodes,” “many source-derived edges,” and disconnected components.
- Choose one canonical frontend call path for direct JSON mode (`/api/pi/direct-edit` vs `/api/pi/chat` with `mode: direct_json`).
- Decide active snapshot and unsaved-change semantics after edit, undo/redo, duplicate, load, and source revert.
- Confirm generated ID conventions for user-created nodes, edges, snapshots, and patch IDs.
- Clarify whether node IDs and edge IDs are separate namespaces or globally unique element IDs for renderer/API purposes.
