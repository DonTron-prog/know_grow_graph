# IMPLEMENTATION_PLAN.md

Plan-only snapshot for the first PoC, refreshed after the frontend graph interaction/shared cleanup increment landed. Requirements are in `specs/frontend_spec.md`, `specs/backend_spec.md`, `frontend_PRD.md`, and `README.md`.

## Completed in the latest BUILD iteration

- Implemented the frontend P0 graph interaction slice in `apps/frontend/src/App.tsx` plus `apps/frontend/src/graphInteraction.ts`.
- The central SVG/equivalent renderer now supports zoom, pan, local node dragging, node selection, edge selection, additive multi-select, and background clear that does not clear selection after a pan.
- Added inspector graph summary, single-node/single-edge details, invalid/deleted selection messaging, and multi-selection summary/eligibility states.
- Added styling hooks for origin colors, selected outlines, recent-change highlighting, warning state, and invalid state; Raw now exposes selected and changed IDs for debugging.
- Added frontend graph-interaction helper tests for selection behavior, node/edge ID namespace isolation, selection labels, persisted-layout fallback, and zoom clamping.
- Removed stale `packages/shared/src/index.js`; `@know-grow/shared` continues to use the source TypeScript export model through `packages/shared/src/index.ts`.
- Final validation passed with `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm --filter @know-grow/frontend build`.

## Confirmed current state

- The implementation lives under `apps/*` and `packages/*`; root `src/` and `src/lib/` are placeholders only.
- `apps/backend/src/app.ts` exposes a modular `createApp(...)`; `apps/backend/src/persistence.ts` owns disk-backed JSON initialization/read/write; `apps/backend/src/index.ts` only starts the server.
- Backend currently implements `GET /api/health`, `GET /api/source/meta`, `GET /api/source/graph`, `GET /api/working/graph`, `PUT /api/working/graph`, `POST /api/working/revert-to-source`, `GET /api/snapshots`, `POST /api/snapshots`, `GET /api/snapshots/:snapshotId`, `POST /api/snapshots/:snapshotId/load`, `POST /api/snapshots/:snapshotId/duplicate`, `POST /api/patch/validate`, and `POST /api/patch/apply`.
- Implemented backend routes already follow the desired conventions: spec-shaped replacement and patch requests, validation/action-summary responses, `{ snapshots }` list responses, and `{ error: { code, message, details? } }` API errors.
- Backend graph reads are disk-backed per request, and snapshot graph files are persisted separately under `snapshots/<snapshotId>.json`; this should be preserved so later Pi direct-file edits can be reloaded instead of hidden behind an in-memory cache.
- Source graph immutability is preserved by working-graph edits, source revert, snapshot load/duplicate flows, and validation/no-mutation failure paths.
- `packages/shared/src/index.ts` defines canonical graph, snapshot, patch-operation, validation-result, action-summary, source/working graph, source revert, and snapshot API envelope schemas/types.
- `validateGraphState` covers malformed graph shape, duplicate node IDs, duplicate edge IDs, dangling edge endpoints, and layout entries for missing nodes.
- `validateGraphPatch`/`applyGraphPatch` now cover patch blocker/warning generation, immutable application, action summaries, changed IDs, merge/split semantics, and direct source-graph mutation blocking.
- `fixtures/source_graph.example.json` is a checked-in non-private fixture for first render/startup fallback.
- Frontend now has a Vite/React/TypeScript graph interaction slice: the central SVG/equivalent renderer supports zoom/pan/local node drag, node/edge selection, additive multi-select, background clear, origin/selected/recent-change/warning/invalid styling hooks, inspector selection states, and Raw selected/changed IDs.
- `@know-grow/shared` currently remains source-TypeScript exported from `packages/shared/src/index.ts`; the stale `packages/shared/src/index.js` placeholder has been removed.
- `apps/pi-agent/src/index.js` is still a console-log scaffold; there is no Pi HTTP bridge, Docker stack, or direct-JSON workflow yet.
- Shared tests now cover graph validation plus core patch validation/application behavior; backend tests cover patch endpoints, snapshot/source-revert endpoints, validation/no-mutation paths, source immutability, and existing replacement/error routes.
- Frontend tests now cover API-client behavior and pure graph-interaction helpers; DOM/pointer interaction tests for the actual React/SVG event wiring are still needed as renderer behavior expands.
- Pi-agent tests still execute zero behavior tests until the HTTP bridge lands.

## Prioritized remaining work

- **P0 - Complete central graph rendering and interaction follow-through.**
  - Decide whether the current SVG/equivalent renderer is sufficient for the MVP or whether to replace it with Cytoscape.js before broader editing/Pi flows.
  - Decide how dragged layout coordinates are persisted in the MVP: full graph replacement, snapshot save, or a later dedicated layout flow.
  - Add DOM/pointer interaction tests for actual React/SVG zoom, pan, drag, selection, multi-select, and background-clear behavior.

- **P0 - Settle shared API runtime parsing and packaging direction.**
  - Add or reuse shared schemas/types for source meta, source graph, working graph reads, and snapshots if the frontend will runtime-parse API responses with shared contracts.
  - Decide whether `@know-grow/shared` remains source-imported by Vite/backend `tsx` or is compiled to JS/declarations for browser/runtime consumption.
  - Validate that backend and frontend import the same shared contracts without runtime ambiguity.

- **P0 - Implement frontend editing, toolbar operations, undo/redo, and snapshots.**
  - Wire inspector edits and toolbar add/delete/merge/split through backend patch apply where possible.
  - Keep frontend-owned `undoStack`/`redoStack` of full `GraphState` values; call `PUT /api/working/graph` for undo/redo restores.
  - Push the prior graph before toolbar edits, inspector edits, snapshot load, source revert, applied Pi patch, and accepted Pi direct JSON edit.
  - Connect save/load/duplicate/revert snapshot UI to backend routes; surface backend errors in StatusBar/Raw without corrupting the current UI graph.

- **P0 - Expand automated validation for implemented P0 behavior.**
  - Continue shared validation coverage for malformed graph edge cases, layout warnings, patch warning thresholds, replacement-edge conflicts, and changed-ID/source-ref conventions not yet pinned by tests.
  - Add backend tests for health/source/working reads, fixture fallback, and no mutation on any remaining uncovered `422` paths.
  - Expand frontend tests beyond the API client and pure helpers; add actual DOM/pointer interaction coverage for renderer zoom/pan/drag/selection/background clear, then editing, undo/redo, and snapshot flows as they land.
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

- Confirm whether the implemented merge/split edge remapping, replacement-edge conflict handling, source-ref preservation, output node defaults, and changed-element ID conventions are final before broader UI/Pi usage.
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
