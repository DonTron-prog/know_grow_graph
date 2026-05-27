# Element Focus

## JTBD

As a user, I need clear focus feedback so I know which graph element I am examining.

## Topic

Users focus graph elements through hover or selection.

## Phase

Phase 1.

## Acceptance Criteria

- Hovering a concept gives clear interactive feedback.
- Hovering a relationship gives clear interactive feedback when relationship hover is supported.
- Selecting a concept makes it visibly distinct from unselected concepts.
- Selecting a relationship makes it visibly distinct from unselected relationships when relationship selection is supported.
- Changing focus updates the highlighted element promptly.
- Clearing focus returns the graph to an unselected review state.
- Focus changes do not mutate graph content.
- Deleted or unavailable focused elements are handled gracefully.

## Non-Goals

- Multi-selection is optional until single-element focus is dependable.
