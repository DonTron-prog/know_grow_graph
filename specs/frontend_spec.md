# Frontend Specification: Sigma-First Knowledge Graph Workbench

## 1. Scope

This specification replaces the previous snapshot/Pi-first frontend plan with an incremental Sigma-first rewrite.

The immediate objective is to render the graph with Sigma (`sigma.js`) and validate the desired layout and interaction model. Manual graph operations come next. Agent functionality comes last.

## 2. Phases

### Phase 1: Render and Layout

Primary goal: get Sigma rendering the graph clearly.

Required:

- use Sigma as the graph renderer
- use Graphology or Sigma-compatible graph data internally
- load the working graph from the backend or a local fixture
- render nodes and edges
- render readable node labels
- support zoom and pan
- support node hover
- support click selection for nodes
- support click selection for edges if practical with Sigma event handling
- display selected element details in the inspector
- compute an initial layout when coordinates are missing
- preserve coordinates from graph data when available
- expose a layout reset/recompute control

Acceptance for Phase 1:

- the graph renders without code changes to the data
- the layout is stable enough to review visually
- selection updates the inspector
- labels are readable at the current concept-graph scale
- no AI, snapshot, lineage, or branching functionality is required

### Phase 2: Manual Operations

Primary goal: manipulate the graph directly.

Required:

- add node
- add edge
- delete selected node or edge
- edit node label/type/notes
- edit edge label/notes
- drag/reposition nodes
- save layout coordinates if needed

Optional after basics:

- multi-select nodes
- merge selected nodes
- split node
- bulk delete
- duplicate node

Acceptance for Phase 2:

- the user can manually create, edit, connect, move, and delete graph elements
- graph changes immediately re-render in Sigma
- invalid graph states are blocked or recovered without corrupting the displayed graph

### Phase 3: Agent Integration

Primary goal: ask questions over the graph and manipulate it with natural language.

Target capabilities:

- send graph context and a user instruction to the agent
- ask questions over the current graph
- ask the agent to propose graph operations
- validate proposed operations before applying them
- apply valid operations to the graph
- show a plain-language summary of agent changes

Phase 3 contracts are expected to shift as Phases 1 and 2 reveal what graph operations are actually needed.

## 3. Screen Structure

Desktop-first layout:

```text
AppShell
├── TopToolbar
├── MainGrid
│   ├── InspectorPanel
│   ├── SigmaGraphCanvas
│   └── SidePanel
└── StatusBar
```

Recommended proportions:

- InspectorPanel: 20 percent width
- SigmaGraphCanvas: 60 percent width
- SidePanel: 20 percent width, optional/collapsible in Phase 1

The graph canvas is always the center of the product.

## 4. TopToolbar

Phase 1 controls:

| Control | Enabled When | Behaviour |
|---|---|---|
| Load Graph | always | reloads current working graph |
| Reset Layout | graph loaded | recomputes layout |
| Save Layout | graph loaded and layout persistence available | persists node coordinates |
| Fit View | graph loaded | fits graph to viewport |

Phase 2 controls:

| Control | Enabled When | Behaviour |
|---|---|---|
| Add Node | graph loaded | opens minimal node creation form |
| Add Edge | graph loaded, preferably node selected | opens minimal edge creation form |
| Delete Selected | node or edge selected | deletes selected graph elements after confirmation |
| Merge Selected | multiple nodes selected | optional after multi-select works |

Phase 3 controls should not be added to the top toolbar unless they are core graph actions. Agent controls belong in the SidePanel.

## 5. SigmaGraphCanvas

Implementation requirements:

- render using Sigma (`sigma.js`)
- maintain a Graphology graph or equivalent Sigma-compatible graph model
- map API graph nodes/edges into renderer attributes
- update Sigma when graph data changes
- avoid full page reloads for graph updates
- cleanly destroy/recreate Sigma instances when component lifecycle requires it

Required node fields at the app boundary:

```ts
type GraphNode = {
  id: string;
  label: string;
  type?: string;
  origin?: 'source' | 'human' | 'llm' | 'imported' | 'unknown';
  notes?: string;
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  properties?: Record<string, unknown>;
};
```

Required edge fields at the app boundary:

```ts
type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  origin?: 'source' | 'human' | 'llm' | 'imported' | 'unknown';
  notes?: string;
  size?: number;
  color?: string;
  properties?: Record<string, unknown>;
};
```

Graph state:

```ts
type GraphState = {
  graphId: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: Record<string, { x: number; y: number }>;
  updatedAt?: string;
};
```

Visual defaults:

- source/unknown nodes: grey
- human-created nodes: blue
- LLM-created nodes: purple, used later
- selected node/edge: yellow highlight
- hovered node/edge: brighter outline or color
- recently changed: green highlight, Phase 2+

Layout:

- if `layout` or node `x/y` exists, use those coordinates
- otherwise run a simple layout suitable for the current graph size
- provide a way to reset/recompute layout
- prioritize stability and readability over visual beauty

## 6. InspectorPanel

Phase 1 read-only inspector states:

1. No selection
2. Single node selected
3. Single edge selected
4. Invalid/deleted selection

No selection view:

- graph name
- node count
- edge count
- layout status

Node view:

- label
- id
- type
- notes
- connected edge count
- connected nodes if easy to compute

Edge view:

- source node
- relation label
- target node
- notes

Phase 2 makes supported fields editable.

## 7. SidePanel

Phase 1:

- may be hidden, collapsed, or used for graph/debug information
- must not distract from Sigma rendering work

Phase 2:

- may contain forms for add/edit operations if not handled in dialogs

Phase 3:

- contains agent chat/question input
- contains proposed operation summary
- contains raw/debug agent output if useful

## 8. State Management

Keep state simple.

```ts
type AppState = {
  workingGraph?: GraphState;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  hoveredNodeId?: string;
  hoveredEdgeId?: string;
  layoutDirty: boolean;
  status: 'idle' | 'loading' | 'rendering' | 'saving' | 'error';
  error?: string;
};
```

Phase 2 may add a lightweight undo stack if it helps manual editing, but lineage, branching, replay, and snapshot history are explicitly out of scope for now.

## 9. Manual Operation Contract

Phase 2 operations can be implemented as either individual endpoints or full graph replacement. Keep the contract small.

Minimum operation names if using patches:

- `add_node`
- `update_node`
- `delete_node`
- `add_edge`
- `update_edge`
- `delete_edge`

Optional later:

- `merge_nodes`
- `split_node`

Validation blockers:

- duplicate node id
- duplicate edge id
- edge references missing node
- update/delete references missing element
- malformed operation

## 10. Agent Integration Placeholder

Do not implement agent workflows until Phase 3.

Expected future flow:

```text
User instruction -> backend agent endpoint -> proposed graph operation(s) -> validation -> apply -> Sigma re-render
```

The eventual agent should be able to:

- answer questions about graph data
- propose additions/deletions/edits
- manipulate graph structure through validated operations

## 11. Error Handling

Errors should appear in the StatusBar and, when helpful, the SidePanel.

Common Phase 1 errors:

- graph load failed
- graph data malformed
- Sigma render failed
- layout computation failed

The graph should remain in the last valid renderable state.

## 12. StatusBar

Phase 1 status bar:

```text
56 nodes | 84 edges | 1 selected | layout saved | idle
```

Show:

- node count
- edge count
- selected count
- layout dirty/saved state
- runtime status

## 13. Implementation Order

1. Install and wire Sigma/Graphology dependencies.
2. Define shared graph types.
3. Load a fixture or backend working graph.
4. Render nodes and edges with Sigma.
5. Add layout fallback for missing coordinates.
6. Add zoom/pan/fit controls.
7. Add hover and click node selection.
8. Add inspector updates from selection.
9. Add edge selection if practical.
10. Add drag/reposition support.
11. Add save/reset layout.
12. Begin Phase 2 manual add/delete/edit operations.
13. Begin Phase 3 agent integration only after manual operations are usable.
