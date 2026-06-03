# Frontend PRD: Incremental Cytoscape.js Concept Map Workbench

## 1. Product Summary

The project is a greenfield concept-map workbench, intentionally narrow and incremental.

Users come to the workbench to examine source-derived material such as research documents, codebases, and projects. The initial graph is a concept map: a representation of concepts and relationships extracted from the material. The user’s goal is not only to correct extraction mistakes, but to reshape the working graph into a representation that improves understanding and matches their mental model.

The immediate goal is to prove that the graph can render well with Cytoscape.js and that the layout/interaction model feels right for one working concept map. The graph data should remain renderer-neutral, with adapters into Cytoscape.js for browser rendering and headless Node.js graph operations. AI functionality, natural-language graph operations, lineage, branching, snapshots, multiple competing graph representations, and durable state history are not priorities for the first phase.

## 2. Product Goal

Build in three phases:

1. **Render and layout**: load graph data and render it with Cytoscape.js in the desired visual layout.
2. **Manual operations**: add, delete, select, drag, and edit graph elements manually.
3. **Agent integration**: add AI-assisted question answering and natural-language graph manipulation once the manual graph experience is proven.

The first success condition is simple: the source-derived concept map renders clearly, surfaces useful structure, and can be inspected/manipulated at the current concept-graph scale.

## 3. Phase 1: Cytoscape.js Render and Layout

Phase 1 is the highest priority.

Required capabilities:

- use Cytoscape.js as the graph renderer and interaction layer
- keep a project-owned, renderer-neutral graph shape as the source of truth
- adapt validated graph data into Cytoscape.js elements for rendering
- load a working graph from the backend or a fixture
- render concept nodes and relationship edges without a page reload
- show readable concept labels at the initial concept-graph scale
- size or visually emphasize concept nodes based on graph-derived structural importance
- visually distinguish graph communities or clusters when useful
- provide first-pass clutter reduction through centrality, community, and concept-type filtering
- preserve and display source context for source-derived concepts and relationships when available
- support zoom and pan
- support concept click selection
- support concept hover affordances
- support relationship inspection, with direct edge selection if it is straightforward in the Cytoscape.js pass
- use a deterministic initial layout when graph data has coordinates
- compute a reasonable force/layout fallback when graph data has no coordinates
- reset the layout to a coherent reviewable arrangement
- save current layout when layout saving is available
- support concept dragging/repositioning in Phase 1 only if it stays simple and intentional; otherwise keep it as the first Phase 2 task
- persist or round-trip concept coordinates only if needed to verify layout; do not build complex history/state management

Visual priorities:

- graph communities or clusters that help reveal structure
- filtering or hiding low-importance concepts to reduce clutter
- centrality-aware visual emphasis for important concepts
- legible labels
- stable layout
- clear selection state
- clear hover state
- simple edge styling
- no polished design system required

## 4. Phase 2: Manual Graph Operations

After Cytoscape.js render/layout is validated, add manual operations incrementally. Manual editing should feel like a hybrid workbench: common changes should be canvas-first and fast, while richer details remain available through structured dialogs and the details panel. The purpose is to let users shape the concept map around their understanding, not only to correct errors.

Required operations:

- add concept node through a single creation dialog
- allow user-created concepts and relationships without source context
- add relationship edge through a single creation dialog
- shift-click two concepts to open relationship creation with those concepts prefilled
- choose relationship direction in the relationship creation dialog
- connect a new concept to every selected concept when confirmed in the creation dialog
- delete selected concept or relationship, including Delete/Backspace keyboard deletion when safe
- edit concept label/type/notes from the selected-element details panel
- edit relationship label/notes from the selected-element details panel
- undo and redo accepted manual changes, including details-panel edits, with common keyboard shortcuts
- drag/reposition concept nodes if not already completed in Phase 1
- select one concept
- select one relationship
- select multiple concepts with shift-click

Nice-to-have operations after basics work:

- merge selected concepts
- split a concept
- bulk delete
- additional layout presets
- layout polish controls

For this phase, state can remain simple. Do not build lineage, branching, deterministic replay, or audit history. Preserve source context for simple edits when the source relationship remains clear, but do not block useful graph reshaping when complete provenance cannot be preserved.

## 5. Phase 3: Agent and Natural Language Operations

Only after graph rendering and manual operations feel right, integrate AI.

Target capabilities:

- ask questions over the graph data
- ask the agent to propose graph edits
- apply validated agent edits to the graph
- use natural language to add, delete, connect, merge, split, or reorganize graph elements
- recommend missing concepts and relationships
- recommend concept type/category changes
- preserve source context for simple transformations when practical
- run graph validation, traversal, and mutation helpers in Node.js without requiring a browser DOM
- show a plain-language summary of what the agent changed

The exact agent contract may shift as Phases 1 and 2 are built. Keep Phase 3 specs flexible.

## 6. Layout

Use a simple desktop workbench layout.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Toolbar: Load | Layout | Add | Relate | Delete | Undo | Save       │
├──────────────────┬───────────────────────────────┬─────────────────┤
│ Graph/summary     │ Cytoscape.js Graph View       │ Details panel    │
│ context           │ concepts, relations, labels   │ inspect/edit     │
│                   │ zoom, pan, drag, select       │ selected element │
└──────────────────┴───────────────────────────────┴─────────────────┘
```

For Phase 1, the details panel may be read-only. The Agent Panel may be hidden, collapsed, or deferred until Phase 3.

## 7. Details Panel / Inspector

The details panel explains the current graph selection and becomes the selected-element editor in Phase 2.

For a selected concept node, show:

- label
- id
- type
- notes
- connected concept count
- connected relationships

For a selected relationship edge, show:

- source concept
- relation label
- target concept
- notes

If nothing is selected, show:

- graph name
- concept count
- relationship count
- layout status

In Phase 2, supported concept and relationship fields are editable from the selected-element details panel when manual editing is active.

## 8. Graph Model and Backend Expectations

The backend should be minimal during the Cytoscape.js-first build.

Keep the stored/working graph model independent from the rendered DOM. Cytoscape.js can be used in two modes:

- browser mode for interactive graph rendering and exploration
- headless Node.js mode for graph validation, traversal, relation-count calculation, and future agent-safe graph operations

The project should still own the canonical graph schema. Cytoscape.js element JSON is an adapter format, not the only storage contract, unless that decision is made explicitly later.

Use a hybrid insight model. The current workbench should derive importance, centrality, communities, and filter state from the current working graph where practical. The graph model may also preserve imported or generated insight metadata for future explanation and agent workflows, but stored metadata should not be required for the current UI to provide useful emphasis or filtering.

Use lightweight source grounding. Source-derived concepts and relationships may carry source names, locations, excerpts, or similar references. User-created or heavily transformed graph elements may have no source context. Missing provenance should not make graph content invalid.

Phase 1 backend needs only:

- health endpoint
- get working graph endpoint
- optional replace working graph endpoint if layout coordinates must be saved
- fixture fallback so the frontend can render immediately

Phase 2 backend adds mutation endpoints or graph replacement for manual edits.

Phase 3 backend adds agent endpoints that validate proposed changes before applying them.

## 9. Non-Goals for the Rewrite Phase

Do not prioritize:

- lineage tracking
- branching
- deterministic replay
- snapshot history
- audit-grade action logs
- side-by-side comparison
- collaboration
- polished design system
- mobile layout
- complex persistence
- AI workflows before graph rendering and manual validation are proven

## 10. Success Metrics

Phase 1 succeeds when:

1. Cytoscape.js renders the graph reliably.
2. The graph layout is legible and stable enough to evaluate.
3. Concept prominence makes structurally important concepts easier to notice.
4. Communities, centrality, and concept types can support first-pass clutter reduction.
5. Available source context can be inspected for source-derived graph elements.
6. Zoom, pan, hover, and selection work.
7. Labels are readable at the target graph scale.
8. The implementation is simple enough to iterate on manual operations next.

Phase 2 succeeds when manual add/delete/edit/reposition operations, selected-element details editing, relationship creation from shift-selection, and undo/redo keyboard operations work.

Phase 3 succeeds when the agent can answer questions and manipulate the graph through validated operations that do not depend on a browser DOM.
