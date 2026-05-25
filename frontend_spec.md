# Frontend Specification: Snapshot Multi-View Knowledge Graph Workbench

## 1. Scope

This specification defines the first frontend for the Snapshot Multi-View Knowledge Graph Workbench.

The frontend is a proof-of-concept interface. It should demonstrate that Pi Coder can transform a knowledge graph from human direction while keeping the graph visualization central.

## 2. Screen Structure

The application has one primary screen.

```text
AppShell
├── TopToolbar
├── MainGrid
│   ├── InspectorPanel
│   ├── GraphCanvas
│   └── PiPanel
└── StatusBar
```

Recommended proportions on desktop:

- InspectorPanel: 20 percent width
- GraphCanvas: 55 percent width
- PiPanel: 25 percent width
- TopToolbar: fixed height
- StatusBar: compact fixed height

The first prototype targets desktop only.

## 3. Components

### 3.1 TopToolbar

Required controls:

| Control | Enabled When | Behaviour |
|---|---|---|
| Undo | undo stack not empty | restores previous working graph state |
| Redo | redo stack not empty | reapplies next working graph state |
| Add Node | always | opens minimal node creation form |
| Add Edge | one or two nodes selected | opens minimal edge creation form |
| Merge Selected | two or more nodes selected | opens merge confirmation or delegates to Pi Coder |
| Split Selected | one node selected | opens split form or delegates to Pi Coder |
| Delete Selected | node or edge selected | deletes from working graph after confirmation |
| Save Snapshot | working graph loaded | saves named snapshot |
| Snapshot dropdown | always | lists snapshots and source revert action |

No extra primary buttons should be added for the first prototype.

### 3.2 GraphCanvas

Recommended dependency: Cytoscape.js.

Required behaviours:

- render working graph nodes and edges
- zoom and pan
- drag nodes
- click-select node
- click-select edge
- multi-select nodes
- clear selection by clicking background
- emit selection events to InspectorPanel
- accept graph updates from direct manipulation and Pi Coder patches
- highlight recently changed elements

Required node fields:

```ts
type GraphNode = {
  id: string;
  label: string;
  type: string;
  origin: 'source' | 'human' | 'llm' | 'imported' | 'unknown';
  notes?: string;
  sourceNodeIds?: string[];
  properties?: Record<string, unknown>;
};
```

Required edge fields:

```ts
type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  origin: 'source' | 'human' | 'llm' | 'imported' | 'unknown';
  notes?: string;
  sourceEdgeIds?: string[];
  properties?: Record<string, unknown>;
};
```

Visual defaults:

- source nodes: grey
- human nodes: blue
- LLM nodes: purple
- selected nodes: yellow outline
- recently added: green pulse or border
- warning state: orange outline
- invalid state: red outline

Performance rule: use simple styling first. Avoid expensive animations until the 56-node graph is smooth.

### 3.3 InspectorPanel

The inspector is read/write for working graph elements and read-only for source graph elements.

States:

1. No selection
2. Single node selected
3. Single edge selected
4. Multiple nodes selected
5. Invalid or deleted selection

No selection view:

- graph name
- graph state: source, working, or snapshot
- node count
- edge count
- active snapshot name
- unsaved changes flag

Node view:

- label input
- id read-only
- type input or dropdown
- origin read-only
- notes textarea
- source refs list when available
- connected edges list

Edge view:

- source node read-only link
- relation label input
- target node read-only link
- origin read-only
- notes textarea
- source refs list when available

Multi-select view:

- selected node count
- selected labels
- merge eligibility
- delete eligibility

Inspector edits create working graph updates and push prior state to undo stack.

### 3.4 PiPanel

The Pi Panel has three tabs: Chat, Actions, Raw.

#### Chat Tab

Required elements:

- scrollable conversation history
- user prompt input
- submit on Enter or send control
- status display: idle, thinking, validating, applying, failed, complete

The Chat tab sends the current graph context and user instruction to Pi Coder.

Minimal prompt context should include:

- selected nodes and edges
- visible working graph node cards
- visible working graph edge cards
- current snapshot name
- user instruction

#### Actions Tab

The Actions tab displays the human-readable result of the most recent Pi Coder proposal or applied patch.

Action summary model:

```ts
type ActionSummary = {
  title: string;
  instruction: string;
  addedNodes: string[];
  updatedNodes: string[];
  deletedNodes: string[];
  addedEdges: string[];
  updatedEdges: string[];
  deletedEdges: string[];
  mergedNodes: string[];
  splitNodes: string[];
  warnings: string[];
};
```

The Actions tab becomes active after Pi Coder returns a patch or after a patch is applied.

#### Raw Tab

The Raw tab displays developer details:

- raw Pi Coder response
- parsed graph patch
- validation results
- application result
- error stack or error message when available

Raw is for debugging. It should not be the default user view.

## 4. Graph Patch Contract

Pi Coder should return a typed patch. The frontend or backend validates it before applying it.

### 4.1 Patch Shape

```ts
type GraphPatch = {
  patchId: string;
  instruction: string;
  summary: string;
  operations: GraphPatchOperation[];
};
```

### 4.2 Operations

```ts
type GraphPatchOperation =
  | AddNodeOp
  | UpdateNodeOp
  | DeleteNodeOp
  | AddEdgeOp
  | UpdateEdgeOp
  | DeleteEdgeOp
  | MergeNodesOp
  | SplitNodeOp;
```

```ts
type AddNodeOp = {
  op: 'add_node';
  id: string;
  label: string;
  nodeType: string;
  origin: 'llm' | 'human';
  notes?: string;
  sourceNodeIds?: string[];
};
```

```ts
type AddEdgeOp = {
  op: 'add_edge';
  id: string;
  source: string;
  target: string;
  label: string;
  origin: 'llm' | 'human';
  notes?: string;
  sourceEdgeIds?: string[];
};
```

```ts
type MergeNodesOp = {
  op: 'merge_nodes';
  inputNodeIds: string[];
  outputNode: GraphNode;
  replacementEdges?: GraphEdge[];
  deleteInputNodes: boolean;
};
```

```ts
type SplitNodeOp = {
  op: 'split_node';
  inputNodeId: string;
  outputNodes: GraphNode[];
  replacementEdges?: GraphEdge[];
  deleteInputNode: boolean;
};
```

Update and delete operations should use existing ids and minimal changed fields.

### 4.3 Validation

Blockers:

- malformed patch
- duplicate node id
- duplicate edge id
- edge references missing node
- delete operation references missing element
- update operation references missing element
- patch attempts to mutate source graph instead of working graph

Warnings:

- LLM-created node has no source refs
- patch deletes many nodes
- patch creates disconnected components
- patch removes many source-derived edges
- operation has no notes or rationale

Warnings should be displayed in Actions and Raw. Warnings should not block exploratory work.

## 5. State Management

Frontend state:

```ts
type AppState = {
  sourceGraphMeta: GraphMeta;
  workingGraph: GraphState;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  snapshots: SnapshotMeta[];
  activeSnapshotId?: string;
  undoStack: GraphState[];
  redoStack: GraphState[];
  piMessages: PiMessage[];
  lastPatch?: GraphPatch;
  lastActionSummary?: ActionSummary;
  validationResults?: ValidationResult[];
};
```

Undo and redo store whole working graph states for the first prototype. This is acceptable for the 56-node concept graph.

### 5.1 State Ownership

For the first PoC, undo and redo are frontend-owned.

Rules:

- The frontend owns `AppState`, including `undoStack` and `redoStack`.
- The backend persists only the latest valid working graph, source graph, and snapshots.
- Before any user-applied mutation, the frontend pushes the current `workingGraph` onto `undoStack` and clears `redoStack`.
- A mutation may be a toolbar operation, inspector edit, snapshot load, source revert, or applied Pi Coder patch.
- The frontend sends mutations to the backend as `GraphPatch` operations when possible.
- The backend validates, applies, persists, and returns the updated `GraphState`.
- Undo pops a previous `GraphState` from `undoStack`, pushes the current graph onto `redoStack`, and replaces the backend working graph with that previous state.
- Redo does the reverse.
- Undo and redo must not require backend action replay.

## 6. Snapshot Behaviour

Snapshot dropdown actions:

- Save current as snapshot
- Load snapshot
- Duplicate snapshot
- Revert to source

Save snapshot stores:

- nodes
- edges
- layout metadata
- snapshot name
- notes, optional
- created timestamp

Loading a snapshot replaces the working graph and pushes the previous state to undo stack.

Revert to source replaces the working graph with a fresh copy of the immutable source graph.

## 7. Pi Coder Integration

The frontend should call a Pi Coder endpoint or local bridge with:

```ts
type PiCoderRequest = {
  instruction: string;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  snapshot?: SnapshotMeta;
};
```

Expected response:

```ts
type PiCoderResponse = {
  message: string;
  patch?: GraphPatch;
  actionSummary?: ActionSummary;
  warnings?: string[];
};
```

If Pi Coder returns plain text without a patch, the Chat tab displays it but the graph is not mutated.

## 8. Error Handling

Common errors:

- Pi Coder timeout
- invalid JSON patch
- patch validation failure
- save snapshot failure
- load snapshot failure
- graph render failure

Errors should appear in the Pi Panel Raw tab and in the StatusBar. The graph should remain in the last valid state.

## 9. StatusBar

The StatusBar should show compact runtime state:

- node count
- edge count
- selected count
- active snapshot
- unsaved changes
- Pi status

Example:

```text
56 nodes | 84 edges | 3 selected | working graph | unsaved | Pi idle
```

## 10. Implementation Order

1. Render static working graph in GraphCanvas.
2. Add selection and InspectorPanel.
3. Add top toolbar direct operations.
4. Add undo/redo using full graph state snapshots.
5. Add save/load/revert snapshots.
6. Add PiPanel Chat with mocked Pi Coder response.
7. Add GraphPatch validation.
8. Apply Pi Coder graph patches to the working graph.
9. Add Actions and Raw tabs.
10. Add visual highlights for recent changes.

## 11. Acceptance Criteria

The frontend is acceptable when:

- the graph loads and remains central
- clicking nodes and edges updates the inspector
- direct add, delete, merge, and edit operations work
- snapshots save and reload
- revert to source works
- Pi Coder can return a typed patch
- valid Pi Coder patches update the graph
- invalid patches do not corrupt graph state
- Actions summarizes Pi Coder changes
- Raw exposes patch and validation details
