# IMPLEMENTATION_PLAN.md

Plan-only snapshot for the first PoC, refreshed after the completed frontend P0 editing increment. Requirements are in `specs/frontend_spec.md`, `specs/backend_spec.md`, `frontend_PRD.md`, and `README.md`.

## Completed in the latest BUILD iteration

- Implemented the frontend P0 graph interaction slice in `apps/frontend/src/App.tsx` plus `apps/frontend/src/graphInteraction.ts`.
- The central SVG/equivalent renderer now supports zoom, pan, local node dragging, node selection, edge selection, additive multi-select, and background clear that does not clear selection after a pan.
- Added inspector graph summary, single-node/single-edge details, invalid/deleted selection messaging, and multi-selection summary/eligibility states.
- Added styling hooks for origin colors, selected outlines, recent-change highlighting, warning state, and invalid state; Raw now exposes selected and changed IDs for debugging.
- Completed the frontend P0 editing increment: API-client mutation methods, toolbar add/delete/merge/split/save/load/duplicate/revert wiring, inspector label/type/notes edits, frontend undo/redo restores via `PUT /api/working/graph`, and drag-end layout persistence with canvas-coordinate preservation.
- Added mutation feedback across Actions, Raw, and StatusBar so successful operations, warnings, backend errors, patch results, changed IDs, and active snapshot state are visible without corrupting the current UI graph.
- Added frontend tests for API mutations and graph mutation helpers, in addition to the existing graph-interaction helper coverage for selection behavior, node/edge ID namespace isolation, selection labels, persisted-layout fallback, and zoom clamping.
- Fixed reviewer findings from the editing increment: layout re-normalization, keyed inspector editors, serialized inspector saves, delete via patch warnings, active snapshot reset on undo/redo, and rejected drag reset.
- Removed stale `packages/shared/src/index.js`; `@know-grow/shared` continues to use the source TypeScript export model through `packages/shared/src/index.ts`.
- Final validation passed with `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm --filter @know-grow/frontend build`.

## Current follow-up focus

- Add DOM/App-level pointer tests for the actual React/SVG event wiring: zoom, pan, drag, drag-end persistence, selection, multi-select, and background clear.
- Add App-level flow tests for editing, undo/redo, snapshot save/load/duplicate/revert, mutation feedback, rejected mutations, and snapshot/selection state transitions.
- Keep the existing SVG renderer for the MVP; defer any Cytoscape.js switch until after MVP evidence shows the SVG path is insufficient.

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
- Frontend now has a Vite/React/TypeScript graph interaction and editing slice: the MVP SVG renderer supports zoom/pan/node drag, drag-end layout persistence, node/edge selection, additive multi-select, background clear, origin/selected/recent-change/warning/invalid styling hooks, inspector label/type/notes edits, toolbar graph/snapshot actions, undo/redo through full working-graph replacement, mutation feedback, and Raw selected/changed IDs.
- `@know-grow/shared` currently remains source-TypeScript exported from `packages/shared/src/index.ts`; the stale `packages/shared/src/index.js` placeholder has been removed.
- `apps/pi-agent/src/index.js` is still a console-log scaffold; there is no Pi HTTP bridge, Docker stack, or direct-JSON workflow yet.
- Shared tests now cover graph validation plus core patch validation/application behavior; backend tests cover patch endpoints, snapshot/source-revert endpoints, validation/no-mutation paths, source immutability, and existing replacement/error routes.
- Frontend tests now cover API-client mutation behavior, graph mutation helpers, and pure graph-interaction helpers; DOM/App-level pointer and flow tests for the actual React/SVG/UI wiring are still needed.
- Pi-agent tests still execute zero behavior tests until the HTTP bridge lands.

## Prioritized remaining work

- **P0 - Add DOM/App-level frontend behavior coverage.**
  - Cover actual React/SVG zoom, pan, drag, drag-end persistence, selection, multi-select, and background-clear behavior.
  - Cover editing, undo/redo, snapshot save/load/duplicate/revert, mutation feedback, warning/error display, and rejected mutation recovery at the App/UI level.
  - Keep `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm --filter @know-grow/frontend build` as the required validation gates.

- **P0 - Settle shared API runtime parsing and packaging only as needed.**
  - Confirm whether the frontend should runtime-parse source meta, source graph, working graph, and snapshot responses with shared schemas.
  - Validate that backend and frontend import the same shared contracts without runtime ambiguity.

- **P1 - Implement Pi integration after the frontend P0 test follow-through.**
  - Replace the pi-agent scaffold with a mockable HTTP bridge and backend health reporting.
  - Add patch-mode chat that proposes typed patches without mutation; apply accepted proposals through `/api/patch/apply`.
  - Add safe direct JSON mode with backups, disk reload, validation, source checksum protection, rollback on invalid output, and frontend acceptance only of backend-reloaded valid graph state.
  - Complete the frontend Pi Panel for Chat, Actions, Raw, status transitions, selected graph context, patch proposals, direct JSON results, and errors.

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
- Confirm generated ID formats and uniqueness scope for user-created nodes, edges, snapshots, and patch IDs.
- Clarify whether node IDs and edge IDs are separate namespaces or globally unique element IDs for renderer/API purposes.
- Decide whether shared Zod schemas should remain permissive to unknown fields and empty labels/instructions, or become stricter before user-authored graph edits land.
- Pick conservative warning thresholds for “many nodes,” “many source-derived edges,” disconnected components, and missing rationale.
- Choose one canonical frontend direct JSON call path: `/api/pi/direct-edit` versus `/api/pi/chat` with `mode: direct_json`.
- Define real pi-agent invocation protocol, timeout behavior, raw-output shape, and mock-to-real migration path.
