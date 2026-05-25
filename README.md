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

The preferred working loop is:

```text
Human direction -> Pi Coder proposal -> validated graph patch -> updated graph -> optional snapshot
```

The local build must also support a direct JSON mode where the containerized Pi Coder is colocated with the mutable graph data:

```text
Human direction -> Pi edits .data/working_graph.json -> backend reloads/validates -> updated graph -> optional snapshot
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
- a containerized Pi Coder with read/write access to mutable graph JSON
- direct JSON edit validation/reload after Pi modifies `.data/working_graph.json`
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
- `specs/frontend_spec.md` — detailed frontend technical specification
- `specs/backend_spec.md` — backend API and persistence specification aligned to the frontend PoC

Older broader product specs have been removed to avoid conflicting with the frontend-first implementation direction.

## State Ownership

For the first PoC, undo and redo are frontend-owned.

- The frontend owns `AppState`, including `undoStack` and `redoStack`.
- The backend persists only the latest valid source graph, working graph, and snapshots.
- The backend and Pi container share the same mutable graph-data directory.
- The backend must reload or read through current JSON after Pi direct-file edits.
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

For the containerized local stack, mount this host directory into both backend and Pi at a shared path such as:

```text
./.data -> backend:/graph-data
./.data -> pi-agent:/graph-data
```

Pi may read and write the mutable files in `/graph-data`, especially `working_graph.json` and snapshot JSON files. `source_graph.json` remains immutable by application rule and should be protected by backend checksum/restore checks during direct JSON mode.

## Implementation Principle

Build the smallest complete system that can be validated visually:

1. Load the fixture or local source graph.
2. Copy it into a mutable working graph.
3. Render it centrally.
4. Edit it directly, through Pi Coder patches, or through explicit Pi direct JSON edits.
5. Validate that invalid patches or invalid direct JSON edits do not corrupt state.
6. Keep Pi colocated with mutable graph JSON in a containerized `/graph-data` mount.
7. Support frontend-owned undo/redo through full graph replacement.
8. Save and reload snapshots.
9. Revert to source when needed.
