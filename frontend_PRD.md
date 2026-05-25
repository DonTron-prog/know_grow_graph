# Frontend PRD: Snapshot Multi-View Knowledge Graph Workbench

## 1. Product Summary

The frontend is a simple graph workbench for demonstrating LLM-directed knowledge graph transformation.

The centre of the interface is the knowledge graph visualization. The user inspects graph elements, gives Pi Coder natural-language directions, sees the graph change, and saves useful states as snapshots. Pi Coder can work through typed graph patches or, in local direct JSON mode, by editing the shared mutable graph JSON that the backend reloads and validates.

The first frontend does not need to look polished. It must be fast, legible, and clear enough to prove that Pi Coder can transform a graph according to human direction.

## 2. Frontend Goal

The frontend must make this loop visible:

```text
Human direction -> Pi Coder response -> graph operation -> updated visualization -> saved snapshot
```

For the local containerized build, it must also make this direct JSON loop safe and visible:

```text
Human direction -> Pi edits working_graph.json -> backend reload/validation -> updated visualization -> saved snapshot
```

The graph should remain the main artifact. Chat is the control surface for LLM work. The inspector is the explanation surface for selected graph data.

## 3. Layout

The first frontend uses a three-panel layout with a top toolbar.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Undo | Redo | Add Node | Add Edge | Merge Selected | Snapshot ▼     │
├──────────────────┬───────────────────────────────┬─────────────────┤
│ Inspector         │ Knowledge Graph Visualization │ Pi Panel        │
│                  │                               │ Chat | Actions  │
│ selected node     │ nodes, edges, labels          │ Raw             │
│ selected edge     │ zoom, pan, drag, select       │ scroll history  │
│ properties        │                               │ prompt input    │
└──────────────────┴───────────────────────────────┴─────────────────┘
```

### 3.1 Centre Panel: Knowledge Graph Visualization

The centre panel is the primary interface.

Required capabilities:

- display nodes and edges from the working graph
- zoom and pan
- drag nodes
- select one node
- select one edge
- select multiple nodes
- highlight selected elements
- update immediately after user operations, Pi Coder patches, or validated Pi direct JSON edits
- show readable labels at the 56-node concept graph scale

Useful visual encodings:

- source-derived nodes: neutral grey
- human-created nodes: blue
- LLM-created nodes: purple
- selected nodes: yellow outline
- recently added nodes or edges: green highlight
- recently deleted items: listed in Actions, not necessarily rendered

The graph should prioritize performance and legibility over visual beauty.

### 3.2 Left Panel: Inspector

The left panel shows information about the current selection.

For a selected node, show:

- label
- id
- type
- origin: source, human, LLM, imported, or unknown
- notes
- connected node count
- connected edges
- source references when available

For a selected edge, show:

- source node
- relation label
- target node
- origin
- notes
- source references when available

For multiple selected nodes, show:

- count
- labels
- available bulk actions from the toolbar, especially Merge Selected

If nothing is selected, show current graph state:

- working graph name
- node count
- edge count
- active snapshot, if any
- unsaved changes indicator

### 3.3 Right Panel: Pi Panel

The right panel exposes Pi Coder directly. It has three tabs.

#### Chat Tab

Shows the conversation with Pi Coder.

Required capabilities:

- scrollable message history
- prompt input
- submit prompt
- show Pi Coder response
- show status: thinking, validating, applying/reloading, failed, completed
- indicate whether the Pi operation used patch mode or direct JSON mode

The user may give natural-language instructions such as:

```text
Reorganize this graph into teaching units for an introductory agentic AI workshop.
```

```text
Add missing bridge concepts between evaluation and reliability.
```

```text
Make the current organization more causal and less tool-centric.
```

#### Actions Tab

Shows a human-readable summary of what Pi Coder proposed, applied, or changed through direct JSON editing.

Example:

```text
Transformation: organize into teaching units

Added nodes
- Prompt Control Surface
- Evaluation Harness

Merged nodes
- Prompt + Persona + Few-Shot -> Prompt Control Surface

Added edges
- Evaluation Harness -> supports -> Agent Reliability

Deleted edges
- Tool Use -> loosely_related_to -> Guardrails
```

The Actions tab is the default tab after each Pi Coder operation. It proves what the model did without forcing the user to read raw JSON.

#### Raw Tab

Shows the typed graph patch used by the application, or the direct JSON edit/reload details when direct mode is used.

Raw display is for debugging and developer inspection. It is not the primary user experience.

The Raw tab may show:

- proposed patch
- validation result
- applied patch
- direct JSON edit result
- backend reload result
- error messages

## 4. Top Toolbar

The top toolbar contains the only always-visible buttons.

Required controls:

- Undo
- Redo
- Add Node
- Add Edge
- Merge Selected
- Split Selected
- Delete Selected
- Save Snapshot
- Snapshot dropdown

### 4.1 Snapshot Dropdown

The snapshot dropdown should contain:

- current working graph
- saved snapshot list
- Save current as snapshot
- Load selected snapshot
- Duplicate selected snapshot
- Revert to source

The source graph must be visually marked as read-only.

## 5. Interaction Requirements

### 5.1 Selection

- Clicking a node selects it and updates the left inspector.
- Clicking an edge selects it and updates the left inspector.
- Shift-click or box-select selects multiple nodes.
- Multi-select enables Merge Selected and Delete Selected.

### 5.2 Direct Manipulation

The user can manually:

- add a node
- add an edge
- delete selected nodes or edges
- merge selected nodes
- split a selected node
- edit labels, types, and notes from the inspector
- drag nodes on the canvas

### 5.3 Pi Coder Manipulation

The user can ask Pi Coder to transform the working graph.

Preferred/default mode: Pi Coder returns a typed graph patch internally. The frontend or backend validates the patch before applying it.

Local direct JSON mode: the containerized Pi Coder has read/write access to the mutable graph JSON, edits `working_graph.json`, and the backend reloads and validates the result before the frontend accepts it.

The user does not need to see raw JSON by default. The Actions tab should summarize the patch or direct JSON edit in plain language.

### 5.4 Undo and Redo

Undo and redo operate on user-applied graph changes, including Pi Coder-applied patches and validated Pi direct JSON edits.

For the first PoC, undo and redo are frontend-owned. The frontend stores full working graph state snapshots in memory and restores them through the backend working graph replacement endpoint. The backend does not maintain undo/redo stacks or replay action history.

## 6. Graph Patch Contract

The frontend should treat Pi Coder output as a proposed graph patch in the preferred/default mode, not as arbitrary UI mutation. Direct JSON mode is an explicit local mode where Pi edits `working_graph.json`; the backend must reload and validate the full graph before the frontend updates state.

Patch operations should include:

- add_node
- update_node
- delete_node
- add_edge
- update_edge
- delete_edge
- merge_nodes
- split_node

Validation blocks only structural corruption:

- duplicate node ids
- duplicate edge ids
- edges pointing to missing nodes
- malformed operation fields
- attempted source graph mutation

Validation warns, but does not block, for:

- new LLM-created nodes without source references
- deleted source-derived nodes in the working graph
- sparse or disconnected graph states
- missing rationale

## 7. Performance Requirements

The frontend must handle the 56-node concept graph interactively.

Target behaviour:

- graph renders in under one second after load
- common operations feel immediate at 56 nodes
- Pi Coder operations may take longer, but the UI must show status
- graph updates should not require a full page reload
- backend reload after Pi direct JSON edits should feel like a normal graph update

## 8. Non-Goals

The first frontend will not include:

- polished visual design
- complex onboarding
- audit-grade lineage graph
- deterministic replay UI
- side-by-side branch comparison
- collaboration features
- mobile layout
- advanced graph analytics

## 9. Frontend Success Metrics

The frontend is successful when:

1. The graph is clearly the centre of the product.
2. Clicking graph elements updates the inspector correctly.
3. Pi Coder can receive direction through the chat panel.
4. Pi Coder actions visibly change the graph.
5. Pi direct JSON edits visibly update the graph after backend validation.
6. The Actions tab summarizes what changed.
7. The Raw tab exposes the graph patch or direct JSON edit details for debugging.
8. The user can save and reload snapshots.
9. The user can revert to source.

## 10. First Implementation Recommendation

Use a practical stack:

- React or Vite for the frontend
- Cytoscape.js for the graph canvas
- a simple local API for graph state and Pi Coder calls
- JSON-file persistence under `.data/` first
- a containerized Pi Coder service sharing the mutable graph-data directory with the backend
- optional DuckDB-backed persistence later if needed

Do not build a complex design system first. The priority is graph manipulation, Pi Coder integration, and reliable snapshot state.
