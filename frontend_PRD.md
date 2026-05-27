# Frontend PRD: Incremental Cytoscape.js Knowledge Graph Workbench

## 1. Product Summary

The project is a greenfield knowledge graph workbench, intentionally narrow and incremental.

The immediate goal is to prove that the graph can render well with Cytoscape.js and that the layout/interaction model feels right. The graph data should remain renderer-neutral, with adapters into Cytoscape.js for browser rendering and headless Node.js graph operations. AI functionality, natural-language graph operations, lineage, branching, snapshots, and durable state history are not priorities for the first phase.

## 2. Product Goal

Build in three phases:

1. **Render and layout**: load graph data and render it with Cytoscape.js in the desired visual layout.
2. **Manual operations**: add, delete, select, drag, and edit graph elements manually.
3. **Agent integration**: add AI-assisted question answering and natural-language graph manipulation once the manual graph experience is proven.

The first success condition is simple: the graph renders clearly and can be inspected/manipulated at the current concept-graph scale.

## 3. Phase 1: Cytoscape.js Render and Layout

Phase 1 is the highest priority.

Required capabilities:

- use Cytoscape.js as the graph renderer and interaction layer
- keep a project-owned, renderer-neutral graph shape as the source of truth
- adapt validated graph data into Cytoscape.js elements for rendering
- load a working graph from the backend or a fixture
- render concept nodes and relationship edges without a page reload
- show readable concept labels at the initial concept-graph scale
- size or visually emphasize concept nodes based on their number of direct relationships
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

- legible labels
- stable layout
- clear selection state
- clear hover state
- relationship-count-aware node sizing that improves comprehension without overwhelming labels
- simple edge styling
- no polished design system required

## 4. Phase 2: Manual Graph Operations

After Cytoscape.js render/layout is validated, add manual operations incrementally.

Required operations:

- add concept node
- add relationship edge
- delete selected concept or relationship
- edit concept label/type/notes
- edit relationship label/notes
- drag/reposition concept nodes if not already completed in Phase 1
- select one concept
- select one relationship
- select multiple concepts if the interaction model supports it cleanly

Nice-to-have operations after basics work:

- merge selected concepts
- split a concept
- bulk delete
- additional layout presets
- layout polish controls

For this phase, state can remain simple. Do not build lineage, branching, deterministic replay, or audit history.

## 5. Phase 3: Agent and Natural Language Operations

Only after graph rendering and manual operations feel right, integrate AI.

Target capabilities:

- ask questions over the graph data
- ask the agent to propose graph edits
- apply validated agent edits to the graph
- use natural language to add, delete, connect, merge, or reorganize graph elements
- run graph validation, traversal, and mutation helpers in Node.js without requiring a browser DOM
- show a plain-language summary of what the agent changed

The exact agent contract may shift as Phases 1 and 2 are built. Keep Phase 3 specs flexible.

## 6. Layout

Use a simple desktop workbench layout.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Toolbar: Load | Layout | Add Concept | Add Relation | Delete | Save │
├──────────────────┬───────────────────────────────┬─────────────────┤
│ Inspector         │ Cytoscape.js Graph View       │ Agent Panel      │
│ selected element  │ concepts, relations, labels   │ disabled/minimal │
│ properties        │ zoom, pan, drag, select       │ until Phase 3    │
└──────────────────┴───────────────────────────────┴─────────────────┘
```

For Phase 1, the right Agent Panel may be hidden, collapsed, or replaced by a debug panel.

## 7. Inspector

The inspector explains the current graph selection.

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

Editing can wait until Phase 2.

## 8. Graph Model and Backend Expectations

The backend should be minimal during the Cytoscape.js-first build.

Keep the stored/working graph model independent from the rendered DOM. Cytoscape.js can be used in two modes:

- browser mode for interactive graph rendering and exploration
- headless Node.js mode for graph validation, traversal, relation-count calculation, and future agent-safe graph operations

The project should still own the canonical graph schema. Cytoscape.js element JSON is an adapter format, not the only storage contract, unless that decision is made explicitly later.

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
3. Concept size or prominence reflects relationship count clearly enough to identify highly connected notes.
4. Zoom, pan, hover, and selection work.
5. Labels are readable at the target graph scale.
6. The implementation is simple enough to iterate on manual operations next.

Phase 2 succeeds when manual add/delete/edit/reposition operations work.

Phase 3 succeeds when the agent can answer questions and manipulate the graph through validated operations that do not depend on a browser DOM.
