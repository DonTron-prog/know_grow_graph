# IMPLEMENTATION_PLAN.md

Plan-only tracker for the greenfield Cytoscape-first knowledge graph workbench. Current canonical requirements are the numbered behavioral specs in `specs/` plus implementation direction in `frontend_PRD.md`.

## Confirmed current state

- Present: behavioral specs `specs/01-graph-availability.md` through `specs/16-scope-boundaries.md`, `specs/README.md`, `frontend_PRD.md`, and `fixtures/source_graph.example.json`.
- Present: the fixture is a non-private Agentic AI graph seed with concepts, relationships, labels, concept notes, origins, and saved positions.
- Present: a single-package pnpm/Vite/TypeScript/Cytoscape scaffold with `src/app.ts`, graph canonical types/validation/storage/metrics/mutations/Cytoscape adapter modules, CSS workbench shell, and Vitest tests.
- Present: validation commands are known passing for the current increment: `pnpm test` (4 files, 22 tests) and `pnpm build`.
- Current implementation increment: Phase 2 manual graph operations and validity protection have landed; remaining near-term work is polish and manual smoke.
- Present in `src/app.ts`: Phase 1 selection, inspector, fit/reset layout, and explicit save-layout controls plus explicit content editing mode, prompt-driven add concept/add relationship/edit selected/delete selected with confirmation, edit-gated drag repositioning, and accepted mutation persistence to the localStorage working graph.
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
  - Remaining: polish layout fallback behavior and interaction details after more manual smoke testing at desktop size.

- [ ] Partially completed: implement Phase 1 focus, inspector, and activity feedback.
  - Completed baseline concept/relationship inspection, graph summary/count feedback, selection feedback, and user-actionable load/recovery messaging.
  - Completed initial activity/status surface for loading/saving/layout state.
  - Remaining: refine invalid/unavailable selection states and any relationship-selection edge cases found during manual smoke testing.

- [ ] Partially completed: add Phase 1 layout saving only after rendering/layout are stable.
  - Persistence boundary decided for now: fixture fallback plus browser localStorage working graph.
  - Layout persistence semantics decided for now: explicit save layout, not autosave.
  - Remaining: finish confidence/polish around saved-position round trip and save-failure handling after layout interactions are stable.

- [x] Implement Phase 2 manual graph operations behind an explicit editing affordance.
  - Added renderer-neutral validated mutations for add concept, add relationship, edit concept/relationship fields, delete selected concept/relationship, and layout/reposition updates.
  - Added explicit content editing mode so review mode remains safe by default; drag repositioning is active only while content editing is enabled.
  - Resolved screenshot issue: review-mode content action buttons are no longer disabled/gray; clicking them explains that content editing must be enabled, and edit/delete without a selection now shows actionable messages.
  - Accepted manual changes persist to the existing working graph localStorage path.
  - Acceptance met in automated coverage: valid changes update graph/storage; invalid changes leave the previous valid graph unchanged.

- [ ] Partially completed: extend validity protection across all graph changes.
  - Completed for loaded graphs, manual mutations, generic `saveGraph`, and `saveLayout` finite-coordinate rejection.
  - Remaining: improve warning/error surface for recoverable issues and carry the same checks into future imported or agent-proposed changes.
  - Acceptance for current manual mutations: every accepted mutation goes through validation and the displayed graph remains valid.

- [ ] Implement Phase 3 agent questions only after graph review and manual operations are dependable.
  - Keep agent features secondary.
  - Ground answers in current graph content.
  - Ensure question answering never mutates graph content and failures leave graph review usable.

- [ ] Implement Phase 3 validated agent graph changes after manual editing is dependable.
  - Return proposed graph changes for user review.
  - Validate proposals before application using the same graph validity layer.
  - Apply valid proposals promptly, reject invalid proposals safely, and summarize applied changes in plain language.

## Validation plan

- [x] Tooling smoke: build and test scripts exist and current handoff commands pass.
  - Current handoff validation: `pnpm test` passes with 4 files / 22 tests; `pnpm build` passes.
  - Run commands documented in `AGENTS.md`: `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`.
- [x] Graph unit tests: valid fixture passes; duplicate ids, dangling relationships, malformed graph data, and invalid/recoverable layout cases are covered for the initial validation layer.
- [x] Adapter tests: canonical graph converts to Cytoscape elements with expected ids, labels, source/target endpoints, positions, origin/state classes, and relationship counts.
- [x] Loader/recovery tests: working graph wins over fixture, missing working graph falls back to fixture, malformed graph reports an error and preserves the last valid graph.
- [ ] Frontend integration/manual smoke: fresh checkout shows the example graph; labels are readable; zoom/pan/fit/reset work; selection updates the inspector; clearing selection returns to graph summary; review-mode content actions explain how to enable editing; recoverable errors keep graph review usable.
- [x] Phase 2 focused tests: validated mutation helpers cover valid add/edit/delete/reposition behavior, persistence to working graph storage, and rejection of invalid changes without replacing the previous valid graph.
- [ ] Phase 3 tests later: agent answers are non-mutating; proposed edits are previewed, validated, applied/rejected safely, and summarized.

## Open decisions

- Manual smoke findings: confirm desktop edit-mode flow, drag behavior, selection states, and localStorage round trips in the browser.
- Better forms/warning surface: replace prompt-first editing and basic alerts with clearer forms and warning presentation.
- Fixture completeness: decide whether relationship notes should be added now or remain optional when unavailable.

## Decisions recorded

- Package/tooling: single-package pnpm/Vite/TypeScript scaffold.
- Phase 1 persistence: fixture fallback plus browser localStorage working graph.
- Layout persistence semantics: explicit save layout, not autosave, for Phase 1.
- Phase 2 editing safety: explicit edit mode with validated mutations before state/storage replacement.

## Non-goals to preserve

- Do not block Phase 1 on lineage, branching, deterministic replay, snapshots, authentication, collaboration, mobile layout, polished design system, complex persistence, or AI workflows.
- Do not expose manual or agent mutations that bypass shared graph validity protection.
