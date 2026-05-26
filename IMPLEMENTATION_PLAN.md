# IMPLEMENTATION_PLAN.md

Plan-only snapshot for the first PoC, refreshed after the completed safe P1 Pi direct JSON increment. Requirements are in `specs/frontend_spec.md`, `specs/backend_spec.md`, `frontend_PRD.md`, and `README.md`.

## Completed in the latest BUILD iteration

- Implemented the frontend P0 graph interaction slice in `apps/frontend/src/App.tsx` plus `apps/frontend/src/graphInteraction.ts`.
- The central SVG/equivalent renderer now supports zoom, pan, local node dragging, node selection, edge selection, additive multi-select, and background clear that does not clear selection after a pan.
- Added inspector graph summary, single-node/single-edge details, invalid/deleted selection messaging, and multi-selection summary/eligibility states.
- Added styling hooks for origin colors, selected outlines, recent-change highlighting, warning state, and invalid state; Raw now exposes selected and changed IDs for debugging.
- Completed the frontend P0 editing increment: API-client mutation methods, toolbar add/delete/merge/split/save/load/duplicate/revert wiring, inspector label/type/notes edits, frontend undo/redo restores via `PUT /api/working/graph`, and drag-end layout persistence with canvas-coordinate preservation.
- Added mutation feedback across Actions, Raw, and StatusBar so successful operations, warnings, backend errors, patch results, changed IDs, and active snapshot state are visible without corrupting the current UI graph.
- Added frontend tests for API mutations, graph mutation helpers, graph-interaction helpers, and App-level jsdom React behavior in `apps/frontend/test/App.test.ts`.
- Extended App-level coverage for Add Edge, Delete Selected, Merge Selected, and Split Selected toolbar wiring; tests now assert pan translate, deeper snapshot state/status behavior, prompt/confirm queue consumption, and visible rejected inspector edit rollback.
- Fixed reviewer findings from the editing increment: layout re-normalization, keyed inspector editors, serialized inspector saves, delete via patch warnings, active snapshot reset on undo/redo, rejected drag reset, and rejected inspector mutation remount/reset via `inspectorResetVersion` so uncontrolled inputs return to last accepted graph values.
- Removed stale `packages/shared/src/index.js`; `@know-grow/shared` continues to use the source TypeScript export model through `packages/shared/src/index.ts`.
- Root Node engine is now `>=22.13.0` because jsdom 29 requires Node 22.13+ or a compatible 20/24 line.
- After post-review refinements, `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm --filter @know-grow/frontend build` passed.
- Completed the P0 shared API runtime parsing increment: the frontend API client now parses successful backend responses with shared Zod schemas, exposes source graph fetch, preserves existing `ApiError` behavior, and has tests for malformed successful responses.
- Validation passed for the shared API runtime parsing increment: `pnpm --filter @know-grow/frontend test`, `pnpm --filter @know-grow/frontend typecheck`, `pnpm --filter @know-grow/frontend lint`, `pnpm --filter @know-grow/shared typecheck`, and `pnpm --filter @know-grow/frontend build`.
- Final full-workspace validation after the P0 runtime parsing changes passed: `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm --filter @know-grow/frontend build`.
- Completed the first P1 Pi patch-mode integration slice: shared Pi request/response schemas, backend `/api/pi/chat` patch-mode proposal route with mock fallback plus optional pi-agent forwarding/timeout/error handling, and a mockable `apps/pi-agent` HTTP bridge with `/health` and `/api/pi/chat`.
- Wired the frontend Pi Panel Chat flow for patch mode: prompt input with send-on-Enter/button, conversation history, selected graph context, pending typed patch proposals, Actions/Raw details, and apply-through-`/api/patch/apply` after confirmation.
- Added focused tests for backend Pi chat no-mutation behavior, frontend API/Pi Panel proposal-then-apply behavior, and pi-agent bridge behavior.
- Completed the Docker Compose/shared graph-data increment: added Dockerfiles for backend, frontend, and pi-agent; added `docker-compose.yml` with backend and pi-agent sharing host `./.data` at `/graph-data`; configured backend with `DATA_DIR=/graph-data` and `PI_AGENT_URL=http://pi-agent:4100`; configured pi-agent with `GRAPH_DATA_DIR=/graph-data` plus an isolated `pi-agent-state` volume.
- Frontend startup now pins Vite to `--port 5173` so Docker health checks, port mappings, and docs remain stable.
- Validation passed after the Docker increment: `docker-compose config`, `docker-compose build`, compose smoke with alternate host ports because `localhost:3001` was already in use (`BACKEND_HOST_PORT=3101 FRONTEND_HOST_PORT=5174 PI_AGENT_HOST_PORT=4101 VITE_API_BASE_URL=http://localhost:3101/api`), pi-agent `/health`, backend `/api/health`, backend `/api/working/graph`, backend-to-pi-agent `/api/pi/chat` forwarding, frontend root HTML, `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm --filter @know-grow/frontend build`.
- Completed safe P1 Pi direct JSON mode: shared Pi direct-edit schemas, backend `POST /api/pi/direct-edit`, pi-agent mock `/api/pi/direct-edit`, and frontend patch/direct JSON mode selection.
- Backend direct JSON now backs up mutable graph files, protects source graph by checksum, reloads and validates disk state after Pi edits, returns only valid graph/snapshot/action-summary results, and restores backups on invalid output or source mutation.
- Direct JSON validation now returns structured `422 invalid_direct_json_edit` errors for malformed `working_graph` JSON and missing/changed `source_graph`, with backup restore before responding.
- Frontend direct JSON mode calls `/api/pi/direct-edit` and accepts only the backend-reloaded valid graph state; focused tests cover backend reload/restore/source-checksum behavior, frontend API/Pi Panel acceptance/error paths, and pi-agent mock direct editing.
- Final validation after reviewer fixes passed: `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm --filter @know-grow/frontend build`.

## Current follow-up focus

- Keep the existing SVG renderer for the MVP; defer any Cytoscape.js switch until after MVP evidence shows the SVG path is insufficient.

## Confirmed current state

- The implementation lives under `apps/*` and `packages/*`; root `src/` and `src/lib/` are placeholders only.
- `apps/backend/src/app.ts` exposes a modular `createApp(...)`; `apps/backend/src/persistence.ts` owns disk-backed JSON initialization/read/write; `apps/backend/src/index.ts` only starts the server.
- Backend currently implements `GET /api/health`, `GET /api/source/meta`, `GET /api/source/graph`, `GET /api/working/graph`, `PUT /api/working/graph`, `POST /api/working/revert-to-source`, `GET /api/snapshots`, `POST /api/snapshots`, `GET /api/snapshots/:snapshotId`, `POST /api/snapshots/:snapshotId/load`, `POST /api/snapshots/:snapshotId/duplicate`, `POST /api/patch/validate`, `POST /api/patch/apply`, `POST /api/pi/chat`, and `POST /api/pi/direct-edit`.
- Implemented backend routes already follow the desired conventions: spec-shaped replacement and patch requests, validation/action-summary responses, `{ snapshots }` list responses, and `{ error: { code, message, details? } }` API errors.
- Backend graph reads are disk-backed per request, and snapshot graph files are persisted separately under `snapshots/<snapshotId>.json`; Pi direct JSON edits are reloaded and validated from disk rather than hidden behind an in-memory cache.
- Source graph immutability is preserved by working-graph edits, source revert, snapshot load/duplicate flows, and validation/no-mutation failure paths.
- `packages/shared/src/index.ts` defines canonical graph, snapshot, patch-operation, validation-result, action-summary, source/working graph, source revert, snapshot API envelope, and Pi patch/direct-edit schemas/types.
- `validateGraphState` covers malformed graph shape, duplicate node IDs, duplicate edge IDs, dangling edge endpoints, and layout entries for missing nodes.
- `validateGraphPatch`/`applyGraphPatch` now cover patch blocker/warning generation, immutable application, action summaries, changed IDs, merge/split semantics, and direct source-graph mutation blocking.
- `fixtures/source_graph.example.json` is a checked-in non-private fixture for first render/startup fallback.
- Frontend now has a Vite/React/TypeScript graph interaction and editing slice: the MVP SVG renderer supports zoom/pan/node drag, drag-end layout persistence, node/edge selection, additive multi-select, background clear, origin/selected/recent-change/warning/invalid styling hooks, inspector label/type/notes edits, toolbar graph/snapshot actions, undo/redo through full working-graph replacement, mutation feedback, and Raw selected/changed IDs.
- `@know-grow/shared` currently remains source-TypeScript exported from `packages/shared/src/index.ts`; the stale `packages/shared/src/index.js` placeholder has been removed.
- The frontend API client parses successful backend response envelopes with shared schemas, exposes source graph fetch, preserves `ApiError` behavior for failed responses and network failures, and tests malformed successful response handling.
- `apps/pi-agent/src/index.js` now exposes a mock HTTP bridge with `/health`, `/api/pi/chat`, and `/api/pi/direct-edit`; patch mode proposes typed graph changes, and direct JSON mode edits the shared mutable graph file for local testing. The real Pi invocation protocol is still not implemented.
- Dockerfiles exist for backend, frontend, and pi-agent. `docker-compose.yml` runs the stack with backend and pi-agent sharing host `./.data` at `/graph-data`; backend uses `DATA_DIR=/graph-data` and `PI_AGENT_URL=http://pi-agent:4100`; pi-agent uses `GRAPH_DATA_DIR=/graph-data` plus an isolated `pi-agent-state` volume.
- Shared tests now cover graph validation plus core patch validation/application behavior; backend tests cover patch endpoints, snapshot/source-revert endpoints, validation/no-mutation paths, source immutability, and existing replacement/error routes.
- Frontend tests now cover API-client mutation behavior, graph mutation helpers, pure graph-interaction helpers, and App-level jsdom React coverage for actual SVG selection, edge selection, multi-select, pan translate, pan-safe background clear, zoom, drag-end layout persistence, inspector edit/rejected rollback, add node, add edge, delete selected, merge selected, split selected, undo/redo, save/load/duplicate/revert snapshots, prompt/confirm queue consumption, StatusBar feedback, rejected replacement recovery, and Pi patch/direct JSON flows.
- Pi-agent bridge behavior has focused test coverage for health, patch chat, and direct JSON mock editing.

## Prioritized remaining work

- **P1 - Complete Pi integration beyond the mock Pi bridge.**
  - Replace mock patch/direct JSON behavior with the real Pi bridge protocol once the invocation contract, timeout behavior, and raw-output shape are finalized.
  - Continue hardening Pi Panel error/status transitions as real bridge failures become observable; patch proposals already flow through Actions/Raw and apply via `/api/patch/apply`, and direct JSON accepts only backend-reloaded valid graph state.

- **P2 - Document and run a manual visual smoke path.**
  - Document load, select, drag, add, edit, delete, merge, split, undo/redo, snapshot save/load/duplicate/revert, mock Pi patch, direct JSON edit, and invalid edit recovery steps.
  - Use local/private graph data only under ignored `.data/`; do not commit private vault content.

- **P2 - Resolve documentation drift and historical placeholders.**
  - Keep `README`, `frontend_PRD.md`, `specs/*`, and this plan aligned.
  - Mark root `PLAN.md` as historical/superseded if retained, or update it only when it remains useful.
  - Decide whether root `src/`/`src/lib/` placeholders should remain for Ralph conventions or be documented as unused because the monorepo implementation lives in `apps/*` and `packages/*`.

- **P2 - Harden validation and observability after functional coverage exists.**
  - Introduce structured persisted-graph validation errors where non-Pi disk corruption still surfaces as generic `500 internal_error`.
  - Add logging sufficient to debug Pi failures and validation recovery without leaking private vault data.

## Open decisions / spec clarifications

- Confirm whether the implemented merge/split edge remapping, replacement-edge conflict handling, source-ref preservation, output node defaults, and changed-element ID conventions are final before broader UI/Pi usage.
- Confirm generated ID formats and uniqueness scope for user-created nodes, edges, snapshots, and patch IDs.
- Clarify whether node IDs and edge IDs are separate namespaces or globally unique element IDs for renderer/API purposes.
- Decide whether shared Zod schemas should remain permissive to unknown fields and empty labels/instructions, or become stricter before user-authored graph edits land.
- Pick conservative warning thresholds for “many nodes,” “many source-derived edges,” disconnected components, and missing rationale.
- Define real pi-agent invocation protocol, timeout behavior, raw-output shape, and mock-to-real migration path for both patch and direct JSON modes.
