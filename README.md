# Snapshot Multi-View Knowledge Graph Workbench

A frontend-first proof of concept for visually reshaping a knowledge graph with human direction and Pi Coder assistance.

The first PoC is intentionally small. The frontend layout is the source of truth. The goal is to make the graph central, let the user manipulate it directly, ask Pi Coder for graph transformations, and visually validate whether the resulting graph state is useful.

## Current Direction

The PoC focuses on one primary screen:

```text
AppShell
├── TopToolbar
├── MainGrid
│   ├── InspectorPanel
│   ├── GraphCanvas
│   └── PiPanel
└── StatusBar
```

The working loop is:

```text
Human direction -> Pi Coder proposal -> validated graph patch -> updated graph -> optional snapshot
```

## First PoC Scope

The first build should support:

- a central interactive graph canvas
- node and edge selection
- multi-select for node operations
- left inspector for selected graph elements
- right Pi Panel with `Chat`, `Actions`, and `Raw` tabs
- top toolbar actions:
  - Undo
  - Redo
  - Add Node
  - Add Edge
  - Merge Selected
  - Split Selected
  - Delete Selected
  - Save Snapshot
  - Snapshot dropdown
- immutable source graph
- mutable working graph
- save, load, duplicate, and revert snapshots
- typed graph patches from Pi Coder
- patch validation before apply
- visual highlighting for changed elements

## Deferred Until After Visual Validation

These features are intentionally not part of the first PoC:

- side-by-side comparison
- branch management
- deterministic replay
- audit-grade lineage
- loss receipts
- group/ungroup as first-class UI operations
- separate change-summary panel outside the Pi Panel
- collaboration
- mobile layout
- polished design system

Some of these may be added later after the basic visual workflow is working.

## Documents

Current source documents:

- `frontend_PRD.md` — frontend product requirements and layout source of truth
- `frontend_spec.md` — detailed frontend technical specification
- `backend_spec.md` — backend API and persistence specification aligned to the frontend PoC

Older broader product specs have been removed to avoid conflicting with the frontend-first implementation direction.

## State Ownership

For the first PoC, undo and redo are frontend-owned.

- The frontend owns `AppState`, including `undoStack` and `redoStack`.
- The backend persists only the latest valid source graph, working graph, and snapshots.
- Undo/redo restores full graph states through `PUT /api/working/graph`.
- The backend does not implement action replay or undo/redo stacks.

## Seed Graph

The project includes a checked-in non-private fixture graph:

```text
fixtures/source_graph.example.json
```

The backend should use this fixture for first render if no local source graph exists.

For visual validation with the real concept graph, place a local source graph here:

```text
.data/source_graph.json
```

## Data Policy

The local `applied_agentic_ai_vault/` reference directory is private/local data and must stay excluded from git and GitHub.

Local generated data should also stay out of git, for example:

```text
.data/
```

## Implementation Principle

Build the smallest complete system that can be validated visually:

1. Load the fixture or local source graph.
2. Copy it into a mutable working graph.
3. Render it centrally.
4. Edit it directly or through Pi Coder patches.
5. Validate that invalid patches do not corrupt state.
6. Support frontend-owned undo/redo through full graph replacement.
7. Save and reload snapshots.
8. Revert to source when needed.
