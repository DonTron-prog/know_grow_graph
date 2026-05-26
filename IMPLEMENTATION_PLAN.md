# IMPLEMENTATION_PLAN.md

Plan-only snapshot for the first PoC, refreshed after the completed P0 shared API runtime parsing increment. Requirements are in `specs/frontend_spec.md`, `specs/backend_spec.md`, `frontend_PRD.md`, and `README.md`.

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

## Current follow-up focus

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
- The frontend API client parses successful backend response envelopes with shared schemas, exposes source graph fetch, preserves `ApiError` behavior for failed responses and network failures, and tests malformed successful response handling.
- `apps/pi-agent/src/index.js` now exposes a mock HTTP bridge with `/health` and `/api/pi/chat` that proposes typed patch-mode graph changes; there is still no Docker stack, direct-JSON workflow, or real Pi invocation protocol yet.
- Shared tests now cover graph validation plus core patch validation/application behavior; backend tests cover patch endpoints, snapshot/source-revert endpoints, validation/no-mutation paths, source immutability, and existing replacement/error routes.
- Frontend tests now cover API-client mutation behavior, graph mutation helpers, pure graph-interaction helpers, and App-level jsdom React coverage for actual SVG selection, edge selection, multi-select, pan translate, pan-safe background clear, zoom, drag-end layout persistence, inspector edit/rejected rollback, add node, add edge, delete selected, merge selected, split selected, undo/redo, save/load/duplicate/revert snapshots, prompt/confirm queue consumption, StatusBar feedback, and rejected replacement recovery.
- Pi-agent tests still execute zero behavior tests until the HTTP bridge lands.

## Prioritized remaining work

- **P1 - Complete Pi integration beyond the patch-mode mock.**
  - Replace the mock patch proposal behavior with the real Pi bridge protocol once the invocation contract, timeout behavior, and raw-output shape are finalized.
  - Add safe direct JSON mode with backups, disk reload, validation, source checksum protection, rollback on invalid output, and frontend acceptance only of backend-reloaded valid graph state.
  - Extend the frontend Pi Panel for direct JSON results/mode selection and richer error/status transitions; patch proposals already flow through Actions/Raw and apply via `/api/patch/apply`.

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
