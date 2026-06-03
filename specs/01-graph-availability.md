# Graph Availability

## JTBD

As a user, I need a concept map to appear without private setup so I can start evaluating how the workbench supports understanding source-derived material.

## Topic

The workbench opens with a valid graph ready for review.

## Phase

Phase 1.

## Acceptance Criteria

- Opening the workbench shows a graph without requiring private data.
- When a saved working graph exists, the workbench loads that graph.
- When no saved working graph exists, the workbench loads a non-private example graph.
- The example graph identifies itself as an Agentic AI concept graph.
- The example graph behaves like a source-derived concept map rather than an ontology-first model.
- The example graph includes meaningful concepts, relationships, labels, notes, plus positions sufficient for first-run evaluation.
- Malformed graph data is reported clearly.
- Malformed graph data does not replace the last valid graph.
- A load failure leaves the user with a visible recovery state rather than a blank or misleading workspace.

## Non-Goals

- Private vault data is not required for first-run evaluation.
- Audit-grade history is not required for graph availability.
