# IMPLEMENTATION_PLAN.md

Plan-only tracker for the greenfield Cytoscape-first knowledge graph workbench. Current canonical requirements are the numbered behavioral specs in `specs/` plus implementation direction in `frontend_PRD.md`.

## Confirmed current state

- Present: behavioral specs `specs/01-graph-availability.md` through `specs/19-graph-insights-and-filtering.md`, `specs/README.md`, `frontend_PRD.md`, and `fixtures/source_graph.example.json`. The latest direction frames the product as a single working source-derived concept-map workbench for improving user understanding, with Phase 2 requirements including keyboard operations, shift-click multi-selection/relation creation, single creation dialogs, concept type choose-or-new entry, auto-connecting new concepts to selected concepts, and details-panel editing.
- Present: the fixture is a non-private Agentic AI graph seed with concepts, relationships, labels, concept notes, origins, saved positions, first-class `sourceRefs` examples on concepts/relationships, and an unavailable source-origin example.
- Present: a single-package pnpm/Vite/TypeScript/Cytoscape scaffold with `src/app.ts`, graph canonical types/validation/storage/metrics/mutations/Cytoscape adapter modules, CSS workbench shell, and Vitest tests.
- No `src/lib` directory exists. Current app/UI code is in `src/app.ts`, renderer-neutral graph logic is in `src/graph/*`, styles are in `src/styles/app.css`, and app integration coverage is in `src/__tests__/app.integration.test.ts`.
- Present: validation commands are known passing for the current source-grounding increment: focused `pnpm test src/graph/__tests__/validation.test.ts src/graph/__tests__/mutations.test.ts src/graph/__tests__/agentChanges.test.ts src/__tests__/app.integration.test.ts` passed (4 files, 22 tests), full `pnpm test` passed (8 files, 39 tests), and `pnpm build` passed.
- Present: non-blocking recoverable graph warnings for layout/origin/source-reference issues are surfaced in the app status/message area, and fallback-position confidence tests are in place.
- Present in `src/app.ts`/`src/graph/mutations.ts`: Phase 1 selection, inspector with source context/unavailable-state rendering, fit/reset layout, explicit save-layout controls, edit-mode gated Phase 2 manual graph operations, toolbar/keyboard undo-redo for accepted manual edits, and a secondary Phase 3 agent panel.
- Present in Phase 2 UI: single concept/relationship creation dialogs, concept type datalist choose-or-new entry, ordered shift-click concept multi-selection with count/visual distinction and relationship endpoint defaults, optional selected-concept auto-connect as one atomic validated persisted undoable mutation, relationship direction/reverse controls, edit-mode details-panel forms for concept label/type/notes and relationship label/notes with source/target read-only, and guarded Delete/Backspace deletion outside editable controls.
- Present: automated app-level/jsdom frontend integration coverage for key Phase 2 UI flows: edit-mode gating, ordered shift-click multi-selection with visual class assertions, relationship dialog endpoint prefill/reverse direction, selected-concept auto-connect creation, details-panel edits, guarded Delete/Backspace deletion, undo/redo, Reload graph UI localStorage round trip after deletion, and basic agent question/proposal flows.
- Still missing: graph insights/filtering controls, richer visual state distinctions, observable saving feedback, and manual browser smoke evidence for the Phase 2/Phase 3 UI flows.
- Present: `specs/10-manual-editing.md` requires current-session undo/redo for recent accepted manual edits without historical replay, branching, reload persistence, or audit-grade provenance.
- Treat ignored `.data/`, `ralph-context/`, and historical `pre-sigma-rewrite` code as reference only, not current implementation.

## Prioritized implementation plan

- [x] Reconcile repository source of truth for the greenfield rewrite.
  - Deleted legacy files (`README.md`, `PLAN.md`, `specs/backend_spec.md`, `specs/frontend_spec.md`) are intentionally retired for this branch.
  - Numbered specs are the canonical behavioral specs.
  - Keep numbered specs behavioral; record technical/API/storage choices in this plan or a technical note.

- [x] Create a minimal runnable greenfield scaffold.
  - Added root package/tooling with pnpm, Vite, TypeScript, build/test scripts, and Vitest.
  - Added a browser app shell with Cytoscape integration.
  - Added renderer-neutral graph logic under `src/graph`.
  - Acceptance met for the current increment: install/dev/test/build commands exist; tests and build are passing per handoff.

- [x] Define the initial renderer-neutral graph schema and validation layer.
  - Modeled graph id/name/state type, concepts, relationships, layout, notes, origins, and timestamps from the fixture shape.
  - Added validation for malformed graph data, duplicate ids, dangling relationship endpoints, and recoverable layout issues.
  - Treats missing positions as recoverable and ignores/warns on layout entries for unavailable concepts safely.
  - Phase 2 mutation targets now route through shared renderer-neutral validation before accepted graph replacement.
  - Source grounding now uses first-class `sourceRefs` on concepts and relationships; validation preserves readable refs and reports missing/malformed refs as non-fatal warnings.

- [x] Add graph metrics and Cytoscape adapter.
  - Converts canonical graph data to Cytoscape elements with stable ids, labels, source/target edge data, saved positions, origin/state classes, and direct relationship counts.
  - Keeps Cytoscape JSON as adapter output, not the canonical storage contract.
  - Adapter tests cover fixture output expectations for concepts, relationships, positions, labels, and relationship-count metadata.
  - Remaining insight/filtering gaps are tracked as P0/P1 items below.

- [x] Implement Phase 1 graph loading and recovery.
  - Loads a saved working graph from browser localStorage when available; otherwise loads `fixtures/source_graph.example.json`.
  - Validates before replacing the current graph.
  - Preserves the last valid graph on recoverable failures.
  - Phase 1 persistence decision for now: browser localStorage with explicit layout save, not autosave or backend persistence.

- [x] Implement the focused desktop workbench shell.
  - Provides the core toolbar/action area, primary Cytoscape graph view, inspector, and minimal activity/status feedback.
  - Keeps graph review central and avoids a general dashboard feel.
  - Current shell is sufficient for initial fixture review and iteration, but the always-visible agent panel should be reduced until active.

- [x] P0: Implement source grounding in graph data conventions and the inspector.
  - Completed: concepts and relationships support first-class `sourceRefs` for readable source name/location/excerpt/reference context.
  - Completed: validation preserves readable source refs and treats missing or malformed refs as non-fatal recoverable warnings.
  - Completed: the fixture includes available concept/relationship source-reference examples and an unavailable source-origin example.
  - Completed: the inspector renders source context when available and an explicit “Source context unavailable” state for source-origin elements without readable details.
  - Completed: simple manual edits and accepted agent changes preserve source refs when the source relationship remains clear.
  - Evidence: focused `pnpm test src/graph/__tests__/validation.test.ts src/graph/__tests__/mutations.test.ts src/graph/__tests__/agentChanges.test.ts src/__tests__/app.integration.test.ts` passed (4 files, 22 tests); full `pnpm test` passed (8 files, 39 tests); `pnpm build` passed.

- [ ] P0: Implement graph insights and filtering controls.
  - Add graph-derived importance/centrality state beyond direct degree classes where useful, with visual emphasis for structurally important concepts.
  - Add filter UI/state for concept type, importance/degree threshold, and community/cluster when available.
  - Show visible-vs-total concept/relationship counts while filtered.
  - Hide filtered elements without deleting graph content, and provide a clear return-to-full-graph action.
  - Keep insight state and active filters coherent after accepted manual or agent graph changes.
  - Add focused tests for filtering, full restore, mutation-after-filter behavior, and graph-content preservation.
  - Evidence: `specs/19-graph-insights-and-filtering.md`; current `src/graph/metrics.ts` only computes direct relationship counts and the toolbar has no filter controls.

- [ ] P1: Expand graph visual distinction states.
  - Add visible treatment for source/user/imported/agent origins for nodes and, if useful, edges; currently only source-origin node styling is explicit.
  - Add treatment for ordinary, hovered, selected, multi-selected, newly/last-changed, and warning-related elements.
  - Add community/type/importance classes or styling once insight/filter state exists.
  - Verify the visual language helps comprehension without turning the app into a general dashboard.

- [ ] P1: Reduce agent panel prominence until agent work is active.
  - Make the graph and inspector remain visually dominant before users intentionally use agent features.
  - Consider collapsed/default-secondary presentation, activation affordance, or layout changes that keep Phase 3 panels from distracting from Phase 1 graph review.
  - Keep current agent functionality accessible and secondary.

- [ ] P1: Strengthen layout, navigation, and focus validation.
  - Current implementation has baseline rendering, labels, saved coordinates, Cytoscape pan/zoom affordances, Fit, Reset layout, selection, multi-selection, clear-selection, and unavailable-selection reconciliation.
  - Add app/browser validation for zoom, pan, fit, reset layout, hover states, relationship selection, clear selection, drag repositioning, and reset-layout viewport behavior.
  - Decide whether reset layout should also fit/orient the viewport after creating the fallback layout.
  - Remaining implementation polish should be driven by manual desktop smoke findings rather than assumed gaps.

- [ ] P1: Make loading/saving feedback observable and tested.
  - Existing status/message/warning surfaces report counts, layout state, load source, edit mode, recoverable warnings, and layout save completion/errors.
  - Content-saving in `applyMutation()` does not currently surface a distinct saving state.
  - Layout save sets `state.saving` around synchronous persistence, so “Saving…” may not be user-observable without an intermediate render or async boundary.
  - Add tests or browser evidence for content-save feedback, layout-save feedback, malformed saved-data recovery, and save-failure UX.

- [ ] P1: Complete manual browser smoke for the current Phase 1/2/3 workbench.
  - Smoke fresh checkout graph display, readable labels, zoom/pan/fit/reset, concept and relationship selection/inspector, source-context states, filters once implemented, edit-mode guidance, dialog flows, shift-click multi-selection, details-panel editing, Delete/Backspace guards, undo/redo shortcuts, drag/save layout, reload/localStorage round trips, recoverable-error usability, and secondary agent panel behavior.
  - Record commands/browser path and findings in the handoff; do not mark the related partial items complete until this evidence exists.

- [x] Implement Phase 2 manual graph operations behind an explicit editing affordance.
  - Completed: renderer-neutral validated mutations for add concept, add relationship, edit concept/relationship fields, delete selected concept/relationship, and layout/reposition updates.
  - Completed: explicit content editing mode keeps review mode safe by default; drag repositioning is active only while content editing is enabled.
  - Completed: review-mode content action buttons explain that content editing must be enabled, and edit/delete without a selection shows actionable messages.
  - Completed: accepted manual changes persist to the existing working graph localStorage path.
  - Completed: current-session undo/redo helpers are available while edit mode is active through toolbar controls and Ctrl/Cmd keyboard shortcuts.
  - Completed: single concept and relationship creation dialogs replaced sequential `window.prompt` creation flows.
  - Completed: concept creation captures label, type, and notes; type uses a datalist so users can choose an existing graph type or enter a new value.
  - Completed: ordered edit-mode multi-selection via shift-click includes selection count display, visual distinction for multi-selected concepts, clear/unavailable-selection behavior, and ordered two-concept defaults for relationship creation.
  - Completed: concept creation can optionally connect the new concept to every selected concept with relationship details as one validated, persisted, undoable, atomic graph mutation.
  - Completed: relationship creation dialog includes source, target, label, notes, direction/reverse controls, and ordered endpoint prefill from shift-selection.
  - Completed: edit-mode details-panel forms support concept label/type/notes and relationship label/notes edits; relationship source/target remain read-only.
  - Completed: Delete/Backspace deletion uses the protected deletion path outside editable controls, while dialogs, details-panel inputs, textareas, selects, and contenteditable elements keep normal editing behavior.
  - Source refs are preserved by simple manual edits when the source relationship remains clear.

- [ ] Partially completed: add frontend integration/UI validation for current Phase 2 UI flows.
  - Completed: automated app-level/jsdom coverage for edit-mode gating, ordered shift-click multi-selection with visual class behavior, relationship dialog endpoint prefill/reverse direction, selected-concept auto-connect creation, details-panel edits, guarded Delete/Backspace deletion, undo/redo UI effects, and Reload graph UI localStorage round trip after deletion.
  - Remaining: focused browser smoke evidence and any additional narrow tests that fall out of smoke findings.

- [ ] Partially completed: extend validity protection across all graph changes.
  - Completed for loaded graphs, manual mutations, accepted agent proposals, generic `saveGraph`, `saveLayout` finite-coordinate rejection, recoverable layout/origin warning surfacing, and fallback-position confidence coverage.
  - Remaining: carry the same checks into any future imported graph-change pathway, or explicitly scope import out for the current release.
  - Acceptance for current manual mutations and accepted agent proposals: every accepted mutation goes through validation and the displayed graph remains valid.

- [x] Implement Phase 3 current-graph-grounded heuristic agent questions as a secondary feature.
  - Added a secondary agent question panel that answers from current graph content without mutating graph content.
  - Added renderer-neutral `answerGraphQuestion` coverage; tests and build pass for this increment.
  - Do not claim full source-grounded answers until agent answers use available `sourceRefs` where helpful.

- [ ] Partially completed: implement Phase 3 validated agent graph changes after manual editing is dependable.
  - Completed: renderer-neutral `agentChanges` proposal/apply helper exists.
  - Completed: secondary agent panel supports plain-language proposal review, edit-mode-gated apply, and reject.
  - Completed: accepted proposals use shared validation/save/history with agent origin; invalid or unsupported proposals are rejected safely during apply.
  - Completed: valid applied changes are summarized in plain language.
  - Remaining: broaden supported proposal types and complete manual browser smoke after Phase 2 smoke coverage.
  - Remaining: add proposal preflight validation if strict “reject before application” behavior is required by the active UX.

- [ ] P2: Broaden validated agent change proposals.
  - Current parser supports a small plain-language subset such as add/connect/rename while the operation application layer is broader.
  - Add parsers/tests for type changes, relationship updates/deletes, concept deletes, and merge/split only if explicitly in scope.
  - Preserve `sourceRefs` for simple agent transformations when the source relationship remains clear.

- [ ] P2: Add an import pathway or explicitly scope imported graph changes out.
  - If import is added, run imported graph replacement through shared validation/recovery before replacing the visible graph.
  - If import is not part of the current release, record that scope boundary so validity-protection wording does not imply an unavailable pathway.

## Validation plan

- [x] Tooling smoke: build and test scripts exist and current handoff commands pass.
  - Current handoff validation: focused `pnpm test src/graph/__tests__/validation.test.ts src/graph/__tests__/mutations.test.ts src/graph/__tests__/agentChanges.test.ts src/__tests__/app.integration.test.ts` passed with 4 files / 22 tests; full `pnpm test` passed with 8 files / 39 tests; `pnpm build` passed.
  - Run commands documented in `AGENTS.md`: `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`.
- [x] Graph unit tests: valid fixture passes; duplicate ids, dangling relationships, malformed graph data, invalid/recoverable layout cases, and fallback-position confidence are covered for the initial validation layer.
- [x] Adapter tests: canonical graph converts to Cytoscape elements with expected ids, labels, source/target endpoints, positions, origin classes, type classes, degree classes, and relationship counts.
- [x] Loader/recovery tests: working graph wins over fixture, missing working graph falls back to fixture, malformed graph reports an error and preserves the last valid graph.
- [x] Source-grounding tests: `sourceRefs` validation/preservation, inspector rendering for available context, unavailable-context messaging for source-origin elements, and preservation through simple manual/agent edits.
- [ ] Graph insights/filtering tests: importance/degree emphasis, type/community/importance filters, visible-vs-total counts, full restore, mutation while filtered, and no graph-content deletion.
- [ ] Visual/workbench tests or smoke: origin styling across source/user/imported/agent, selected/multi-selected/hover/newly-changed/warning states, and agent panel secondary/collapsed behavior.
- [ ] Loading/saving feedback tests: content-save feedback, layout-save feedback, malformed saved-data UI recovery, save-failure UX, and render timing if localStorage persistence remains synchronous.
- [ ] Partially covered frontend integration/manual smoke: automated app-level coverage exists for key Phase 2 UI flows and source-context rendering; manual browser smoke is still needed for fresh checkout graph display, readable labels, zoom/pan/fit/reset, selection/inspector behavior, review-mode action guidance, source context, filters, and recoverable-error usability.
- [x] Phase 2 focused tests: validated mutation helpers cover valid add/edit/delete/reposition behavior, current-session undo/redo history, persistence to working graph storage, and rejection of invalid changes without replacing the previous valid graph.
- [x] Phase 2 app-level/jsdom UI tests: cover edit-mode gating, ordered shift-click multi-selection including visual class behavior, relationship dialog endpoint prefill/reverse direction, concept creation with selected-concept auto-connect, details-panel edits, Delete/Backspace focus guard and deletion, undo/redo, and Reload graph UI localStorage round trip after deletion.
- [ ] Phase 2 manual browser smoke: confirm the same dialog, multi-selection, details-panel, keyboard, undo/redo, deletion, drag/save layout, and localStorage flows in a real browser.
- [x] Phase 3 question tests: renderer-neutral agent answers are graph-grounded and non-mutating.
- [x] Phase 3 graph-change tests: `agentChanges` unit coverage and app integration coverage confirm proposal preview, validation, safe apply/reject behavior, and plain-language summaries for the currently supported subset.
- [ ] Phase 3 expansion tests: source-aware answers using `sourceRefs`, broader proposal parsing, strict proposal preflight if needed, and agent panel secondary UX.

## Open decisions

- Community/cluster data: decide whether to support imported metadata first, derive a simple fallback, or both.
- Graph insight UX: decide how visibly to expose community names/labels versus using communities mainly for color, layout, and filters.
- Repositioning mode: decide whether edit-mode dragging is sufficient or whether a distinct layout/reposition mode is needed for safer review-mode behavior.
- Agent panel prominence: decide on collapsed/default-secondary presentation versus the current always-visible panel.
- Import scope: decide whether imported graph changes are in scope now or explicitly deferred.
- Manual smoke gaps: confirm desktop edit-mode flow, drag behavior, Phase 2 dialog/multi-selection/details-panel/keyboard flows, undo/redo controls, localStorage round trips, source/filter flows, and the secondary agent panel in the browser.

## Decisions recorded

- Package/tooling: single-package pnpm/Vite/TypeScript scaffold.
- Phase 1 persistence: fixture fallback plus browser localStorage working graph.
- Layout persistence semantics: explicit save layout, not autosave, for Phase 1.
- Phase 2 editing safety: explicit edit mode with validated mutations before state/storage replacement.
- Phase 2 undo/redo: current-session history for accepted manual edits is gated by edit mode and does not require replay, branching, reload persistence, or audit-grade provenance.
- Phase 2 keyboard scope: current supported shortcuts are Delete/Backspace for guarded deletion plus Ctrl/Cmd undo/redo; no additional creation/edit shortcuts until a future spec explicitly adds them.
- Phase 2 details-panel edit scope: concept label/type/notes and relationship label/notes are editable now; relationship source/target are read-only after creation.
- Product framing: current work centers on one working source-derived concept map that users reshape to match their mental model; multiple competing representations remain out of scope.
- Graph insights: use a hybrid model with local graph-derived centrality/community/importance for current UI behavior while leaving room for imported or AI-generated metadata later.
- Source grounding: use first-class `sourceRefs` on concepts and relationships; preserve refs for simple transformations where practical; missing or malformed refs are non-fatal warnings and should not block useful manual graph reshaping.

## Non-goals to preserve

- Do not block Phase 1 on lineage, branching, deterministic replay, snapshots, authentication, collaboration, mobile layout, polished design system, complex persistence, multiple-representation workflows, or AI workflows.
- Do not expose manual or agent mutations that bypass shared graph validity protection.
