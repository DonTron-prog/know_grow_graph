# Frontend PRD: Incremental Sigma Knowledge Graph Workbench

## 1. Product Summary

The project remains a knowledge graph workbench, but the next major rewrite is intentionally narrower and more incremental.

The immediate goal is to prove that the graph can render well with Sigma (`sigma.js`) and that the layout/interaction model feels right. AI functionality, natural-language graph operations, lineage, branching, snapshots, and durable state history are not priorities for this phase.

## 2. Product Goal

Build in three phases:

1. **Render and layout**: load graph data and render it with Sigma in the desired visual layout.
2. **Manual operations**: add, delete, select, drag, and edit graph elements manually.
3. **Agent integration**: add AI-assisted question answering and natural-language graph manipulation once the manual graph experience is proven.

The first success condition is simple: the graph renders clearly and can be inspected/manipulated at the current concept-graph scale.

## 3. Phase 1: Sigma Render and Layout

Phase 1 is the highest priority.

Required capabilities:

- use Sigma (`sigma.js`) as the graph renderer
- load a working graph from the backend or a fixture
- render nodes and edges without a page reload
- show readable node labels at the initial concept-graph scale
- support zoom and pan
- support node click selection
- support node hover affordances
- support node dragging if feasible in the first Sigma pass; otherwise document it as the first Phase 2 task
- use a deterministic initial layout when graph data has coordinates
- compute a reasonable force/layout fallback when graph data has no coordinates
- persist or round-trip node coordinates only if needed to verify layout; do not build complex history/state management

Visual priorities:

- legible labels
- stable layout
- clear selection state
- clear hover state
- simple edge styling
- no polished design system required

## 4. Phase 2: Manual Graph Operations

After Sigma render/layout is validated, add manual operations incrementally.

Required operations:

- add node
- add edge
- delete selected node or edge
- edit node label/type/notes
- edit edge label/notes
- drag/reposition nodes
- select one node
- select one edge
- select multiple nodes if Sigma interaction work supports it cleanly

Nice-to-have operations after basics work:

- merge selected nodes
- split a node
- bulk delete
- layout reset
- save current layout

For this phase, state can remain simple. Do not build lineage, branching, deterministic replay, or audit history.

## 5. Phase 3: Agent and Natural Language Operations

Only after graph rendering and manual operations feel right, integrate AI.

Target capabilities:

- ask questions over the graph data
- ask the agent to propose graph edits
- apply validated agent edits to the graph
- use natural language to add, delete, connect, merge, or reorganize graph elements
- show a plain-language summary of what the agent changed

The exact agent contract may shift as Phases 1 and 2 are built. Keep Phase 3 specs flexible.

## 6. Layout

Use a simple desktop workbench layout.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Toolbar: Load | Layout | Add Node | Add Edge | Delete | Save Layout │
├──────────────────┬───────────────────────────────┬─────────────────┤
│ Inspector         │ Sigma Graph Canvas            │ Agent Panel      │
│ selected element  │ nodes, edges, labels          │ disabled/minimal │
│ properties        │ zoom, pan, drag, select       │ until Phase 3    │
└──────────────────┴───────────────────────────────┴─────────────────┘
```

For Phase 1, the right Agent Panel may be hidden, collapsed, or replaced by a debug panel.

## 7. Inspector

The inspector explains the current graph selection.

For a selected node, show:

- label
- id
- type
- notes
- connected node count
- connected edges

For a selected edge, show:

- source node
- relation label
- target node
- notes

If nothing is selected, show:

- graph name
- node count
- edge count
- layout status

Editing can wait until Phase 2.

## 8. Backend Expectations

The backend should be minimal during the Sigma-first rewrite.

Phase 1 backend needs only:

- health endpoint
- get working graph endpoint
- optional replace working graph endpoint if layout coordinates must be saved
- fixture fallback so the frontend can render immediately

Phase 2 backend adds mutation endpoints or graph replacement for manual edits.

Phase 3 backend adds agent endpoints.

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
- AI workflows before Sigma rendering is proven

## 10. Success Metrics

Phase 1 succeeds when:

1. Sigma renders the graph reliably.
2. The graph layout is legible and stable enough to evaluate.
3. Zoom, pan, hover, and selection work.
4. Labels are readable at the target graph scale.
5. The implementation is simple enough to iterate on manual operations next.

Phase 2 succeeds when manual add/delete/edit/reposition operations work.

Phase 3 succeeds when the agent can answer questions and manipulate the graph through validated operations.
