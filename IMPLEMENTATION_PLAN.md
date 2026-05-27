# IMPLEMENTATION_PLAN.md

Plan-only tracker for the greenfield Cytoscape-first knowledge graph workbench. Current canonical requirements are the numbered behavioral specs in `specs/` plus implementation direction in `frontend_PRD.md`.

## Confirmed current state

- Present: behavioral specs `specs/01-graph-availability.md` through `specs/17-keyboard-operations.md`, `specs/README.md`, `frontend_PRD.md`, and `fixtures/source_graph.example.json`. The latest Phase 2 requirements include keyboard operations, shift-click multi-selection/relation creation, single creation dialogs, concept type choose-or-new entry, auto-connecting new concepts to selected concepts, and details-panel editing.
- Present: the fixture is a non-private Agentic AI graph seed with concepts, relationships, labels, concept notes, origins, and saved positions.
- Present: a single-package pnpm/Vite/TypeScript/Cytoscape scaffold with `src/app.ts`, graph canonical types/validation/storage/metrics/mutations/Cytoscape adapter modules, CSS workbench shell, and Vitest tests.
- Present: validation commands are known passing for the current increment: focused app integration test, `pnpm test` (7 files, 33 tests), and `pnpm build`.
- Present: non-blocking recoverable graph warnings for layout/origin issues are surfaced in the app status/message area, and fallback-position confidence tests are in place.
- Present in `src/app.ts`/`src/graph/mutations.ts`: Phase 1 selection, inspector, fit/reset layout, explicit save-layout controls, edit-mode gated Phase 2 manual graph operations, toolbar/keyboard undo-redo for accepted manual edits, and a secondary Phase 3 agent question panel.
- Present in Phase 2 UI: single concept/relationship creation dialogs, concept type datalist choose-or-new entry, ordered shift-click concept multi-selection with count/visual distinction and relationship endpoint defaults, optional selected-concept auto-connect as one atomic validated persisted undoable mutation, relationship direction/reverse controls, edit-mode details-panel forms for concept label/type/notes and relationship label/notes with source/target read-only, and guarded Delete/Backspace deletion outside editable controls.
- Present: automated app-level/jsdom frontend integration coverage for key Phase 2 UI flows: edit-mode gating, ordered shift-click multi-selection with visual class assertions, relationship dialog endpoint prefill/reverse direction, selected-concept auto-connect creation, details-panel edits, guarded Delete/Backspace deletion, undo/redo, and Reload graph UI localStorage round trip after deletion.
- Still missing: manual browser smoke evidence for the Phase 2 UI flows.
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

- [x] Add graph metrics and Cytoscape adapter.
  - Converts canonical graph data to Cytoscape elements with stable ids, labels, source/target edge data, saved positions, origin/state classes, and direct relationship counts.
  - Keeps Cytoscape JSON as adapter output, not the canonical storage contract.
  - Adapter tests cover fixture output expectations for concepts, relationships, positions, labels, and relationship-count metadata.

- [x] Implement Phase 1 graph loading and recovery.
  - Loads a saved working graph from browser localStorage when available; otherwise loads `fixtures/source_graph.example.json`.
  - Validates before replacing the current graph.
  - Preserves the last valid graph on recoverable failures.
  - Phase 1 persistence decision for now: browser localStorage with explicit layout save, not autosave or backend persistence.

- [x] Implement the focused desktop workbench shell.
  - Provides the core toolbar/action area, primary Cytoscape graph view, inspector, and minimal activity/status feedback.
  - Keeps graph review central and avoids a general dashboard feel.
  - Current shell is sufficient for initial fixture review and iteration.

- [ ] Partially completed: implement Phase 1 graph visualization, layout, and navigation.
  - Completed baseline rendering of concepts and relationships with labels, saved coordinates, simple styling, and Cytoscape navigation affordances.
  - Completed initial fit/reset-style navigation hooks sufficient for current workbench evaluation.
  - Remaining: polish interaction details after more manual smoke testing at desktop size.

- [ ] Partially completed: implement Phase 1 focus, inspector, and activity feedback.
  - Completed baseline concept/relationship inspection, graph summary/count feedback, selection feedback, and user-actionable load/recovery messaging.
  - Completed activity/status surface for loading, saving, layout state, and recoverable validation warnings.
  - Remaining: refine invalid/unavailable selection states and any relationship-selection edge cases found during manual smoke testing.

- [ ] Partially completed: add Phase 1 layout saving only after rendering/layout are stable.
  - Persistence boundary decided for now: fixture fallback plus browser localStorage working graph.
  - Layout persistence semantics decided for now: explicit save layout, not autosave.
  - Remaining: finish confidence/polish around saved-position round trip and save-failure handling after layout interactions are stable.

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

- [ ] Partially completed: add frontend integration/UI validation for current Phase 2 UI flows.
  - Completed: automated app-level/jsdom coverage for edit-mode gating, ordered shift-click multi-selection with visual class behavior, relationship dialog endpoint prefill/reverse direction, selected-concept auto-connect creation, details-panel edits, guarded Delete/Backspace deletion, undo/redo UI effects, and Reload graph UI localStorage round trip after deletion.
  - Remaining: manual browser smoke evidence for these flows.

- [ ] Partially completed: extend validity protection across all graph changes.
  - Completed for loaded graphs, manual mutations, generic `saveGraph`, `saveLayout` finite-coordinate rejection, recoverable layout/origin warning surfacing, and fallback-position confidence coverage.
  - Remaining: carry the same checks into future imported or agent-proposed changes.
  - Acceptance for current manual mutations: every accepted mutation goes through validation and the displayed graph remains valid.

- [x] Implement Phase 3 grounded agent questions as a secondary feature.
  - Added a secondary agent question panel that answers from current graph content without mutating graph content.
  - Added renderer-neutral `answerGraphQuestion` coverage; tests and build pass for this increment.

- [ ] Implement Phase 3 validated agent graph changes after manual editing is dependable.
  - Do not start agent graph-change application until Phase 2 manual editing is dependable under the current dialog, multi-selection, details-panel, keyboard, undo/redo, and validity-protection requirements.
  - Return proposed graph changes for user review.
  - Validate proposals before application using the same graph validity layer.
  - Apply valid proposals promptly, reject invalid proposals safely, and summarize applied changes in plain language.

## Validation plan

- [x] Tooling smoke: build and test scripts exist and current handoff commands pass.
  - Current handoff validation: focused app integration test passes; `pnpm test` passes with 7 files / 33 tests; `pnpm build` passes.
  - Run commands documented in `AGENTS.md`: `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`.
- [x] Graph unit tests: valid fixture passes; duplicate ids, dangling relationships, malformed graph data, invalid/recoverable layout cases, and fallback-position confidence are covered for the initial validation layer.
- [x] Adapter tests: canonical graph converts to Cytoscape elements with expected ids, labels, source/target endpoints, positions, origin/state classes, and relationship counts.
- [x] Loader/recovery tests: working graph wins over fixture, missing working graph falls back to fixture, malformed graph reports an error and preserves the last valid graph.
- [ ] Partially covered frontend integration/manual smoke: automated app-level coverage exists for key Phase 2 UI flows; manual browser smoke is still needed for fresh checkout graph display, readable labels, zoom/pan/fit/reset, selection/inspector behavior, review-mode action guidance, and recoverable-error usability.
- [x] Phase 2 focused tests: validated mutation helpers cover valid add/edit/delete/reposition behavior, current-session undo/redo history, persistence to working graph storage, and rejection of invalid changes without replacing the previous valid graph.
- [x] Phase 2 app-level/jsdom UI tests: cover edit-mode gating, ordered shift-click multi-selection including visual class behavior, relationship dialog endpoint prefill/reverse direction, concept creation with selected-concept auto-connect, details-panel edits, Delete/Backspace focus guard and deletion, undo/redo, and Reload graph UI localStorage round trip after deletion.
- [ ] Phase 2 manual browser smoke: confirm the same dialog, multi-selection, details-panel, keyboard, undo/redo, and localStorage flows in a real browser.
- [x] Phase 3 question tests: renderer-neutral agent answers are graph-grounded and non-mutating.
- [ ] Phase 3 graph-change tests later: proposed edits are previewed, validated, applied/rejected safely, and summarized.

## Open decisions

- Manual smoke gaps: confirm desktop edit-mode flow, drag behavior, Phase 2 dialog/multi-selection/details-panel/keyboard flows, undo/redo controls, localStorage round trips, and the secondary agent question panel in the browser; automated jsdom coverage now covers the key Phase 2 UI paths.
- Remaining Phase 3 agent graph changes: proposal preview, shared validation, safe apply/reject behavior, and plain-language summaries.
- Fixture completeness: decide whether relationship notes should be added now or remain optional when unavailable.

## Decisions recorded

- Package/tooling: single-package pnpm/Vite/TypeScript scaffold.
- Phase 1 persistence: fixture fallback plus browser localStorage working graph.
- Layout persistence semantics: explicit save layout, not autosave, for Phase 1.
- Phase 2 editing safety: explicit edit mode with validated mutations before state/storage replacement.
- Phase 2 undo/redo: current-session history for accepted manual edits is gated by edit mode and does not require replay, branching, reload persistence, or audit-grade provenance.
- Phase 2 keyboard scope: current supported shortcuts are Delete/Backspace for guarded deletion plus Ctrl/Cmd undo/redo; no additional creation/edit shortcuts until a future spec explicitly adds them.
- Phase 2 details-panel edit scope: concept label/type/notes and relationship label/notes are editable now; relationship source/target are read-only after creation.

## Non-goals to preserve

- Do not block Phase 1 on lineage, branching, deterministic replay, snapshots, authentication, collaboration, mobile layout, polished design system, complex persistence, or AI workflows.
- Do not expose manual or agent mutations that bypass shared graph validity protection.
