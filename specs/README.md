# Specifications

These files describe user-facing behavior for the knowledge graph workbench. Each numbered file covers one topic of concern for Ralph to implement.

## Current phase order

1. Graph availability, workbench focus, visualization, layout, navigation, focus, inspection, and feedback.
2. Manual creation, editing, deletion, repositioning, keyboard operations, and graph validity protection.
3. Agent question answering and validated agent-assisted graph changes that reuse graph validity protection.

## Rules for numbered specs

- Describe observable outcomes only.
- Avoid implementation approach, storage design, API naming, type naming, or variable naming.
- Keep numbered specs renderer/model-library agnostic; implementation choices belong in the PRD or implementation plan.
- Prefer product terms such as concept and relationship over library-specific terms.
- Keep acceptance criteria behavioral.
- Keep each topic narrow enough to summarize in one sentence.
