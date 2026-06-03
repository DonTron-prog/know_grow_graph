# Graph Workbench Architecture Pipeline

This note captures the intended finished architecture for the knowledge graph workbench once an AI agent is attached, while keeping the current development focus on the manual Phase 1/2 workbench.

## High-level pipeline

```text
Source Material
  research docs / codebases / project files
        |
        v
Graph Generation Pipeline
  extracts initial concept map
  creates concepts, relationships, source references
        |
        v
Canonical Graph Store
  one working graph representation
  concepts, relationships, notes, types, origins, positions
        |
        +-----------------------------+
        |                             |
        v                             v
Graph Analysis Layer              AI Agent Layer
  computes centrality              asks questions about graph
  detects communities              proposes merges/splits
  ranks importance                 suggests missing concepts
  supports filters                 suggests new relationships
        |                             |
        +-------------+---------------+
                      |
                      v
Validated Mutation Pipeline
  accepts/rejects graph changes
  preserves validity
  preserves source refs when simple
  records undo/history
                      |
                      v
Workbench UI
  canvas-first graph editing
  inspector/details panel
  filters/clusters/importance controls
  save/undo/redo
  later: review/apply AI proposals
```

## Major architectural boundaries

## 1. Canonical graph model

The canonical graph model is the source of truth for the current working graph.

It should contain:

- concepts
- relationships
- layout positions
- metadata
- optional source references
- optional computed/imported analysis metadata

Concepts may include:

- id
- label
- type/category
- notes
- source references
- origin: extracted, user, or agent
- importance metadata
- community/cluster metadata

Relationships may include:

- id
- source concept
- target concept
- label/type
- notes
- source references
- origin
- strength/confidence, possibly later

Important design principle:

> Cytoscape should remain a renderer, not the canonical data model.

## 2. Graph analysis layer

The graph analysis layer computes derived information from the current graph.

It can answer questions such as:

- Which nodes are central?
- Which concepts belong to the same community?
- Which nodes are peripheral?
- What concept types exist?
- What would the graph look like if low-centrality nodes were hidden?

This layer should be independent from AI. Before an agent exists, the app can compute:

- centrality scores
- graph communities
- direct connection counts
- type counts
- visible/hidden subsets

This supports graph readability priorities:

- clustering/grouping by topic or graph community
- filtering/hiding low-importance graph elements
- emphasizing important/central concepts

## 3. Workbench UI

The UI is the user-facing editor and reviewer.

It should support:

- one working graph
- visual clusters/communities
- important nodes emphasized
- filters for centrality, community, and concept type
- canvas-first manipulation
- structured inspector/details panel
- undo/save/redo
- validity-safe editing

The UI should not need to know how communities are computed or how the AI reasons. It should consume canonical graph state plus derived analysis state.

## 4. AI agent layer

The AI agent layer is a later-phase capability.

The agent should not directly mutate the graph. Instead, it should produce proposals such as:

- merge concepts
- split concepts
- add missing concepts
- add missing relationships
- rename or retype concepts
- suggest different ontology/category structures
- explain why a cluster exists
- identify underconnected concepts
- answer questions grounded in the graph

A proposal should include:

- plain-language summary
- rationale
- affected concepts and relationships
- source/evidence when available
- expected mutation

The agent should interact with the graph through a controlled API/tool layer, not by editing raw graph state.

## 5. Validated mutation pipeline

The validated mutation pipeline is the safety boundary for all graph changes.

Every change should pass through the same validation path, whether it comes from:

- the user
- local graph analysis actions
- the future AI agent
- an import
- a regeneration step

```text
Proposed change
    |
validate graph rules
    |
check affected relationships
    |
preserve source refs where reasonable
    |
apply to working graph
    |
record undo/history
    |
update UI
```

This allows the project to add AI later without rewriting the core graph editor.

## Computed vs stored graph insights

For centrality, importance, and community membership, the preferred direction is a hybrid architecture:

- compute local defaults from the current working graph
- leave room for stored/imported metadata from a generation pipeline or future AI system
- use computed centrality for visual emphasis
- preserve imported metadata for future explanation/comparison
- recompute local values when the graph changes

Example future metadata distinction:

```text
concept.importedImportance = 0.82
concept.currentCentrality = computed locally
concept.importedCommunity = "cluster-3"
concept.currentCommunity = computed locally
```

## Current-phase recommendation

For the current Phase 1/2 workbench:

- focus on a single working concept map
- compute centrality from the current graph
- compute communities from the current graph
- use computed values for emphasis and filtering
- preserve room in the data model for imported/stored values later
- do not require AI or stored analysis metadata yet
