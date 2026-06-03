# Agent Questions

## JTBD

As a user, I need help understanding the concept map and its source-derived knowledge after the graph experience works.

## Topic

Users ask questions about graph knowledge.

## Phase

Phase 3.

## Acceptance Criteria

- Agent question features stay secondary until graph review is dependable.
- Users can ask questions about the current graph when agent features are active.
- Answers are grounded in currently available graph content.
- Answers use available source context when it helps explain source-derived concepts or relationships.
- Answers are understandable without reading raw tool output.
- Question answering does not mutate graph content.
- The workbench communicates when the agent cannot answer from the graph.
- Agent failures leave the graph review experience usable.

## Non-Goals

- Agent question answering is not required for Phase 1.
- Agent question answering is not required before manual graph operations are usable.
