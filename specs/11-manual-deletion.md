# Manual Deletion

## JTBD

As a user, I need to remove graph knowledge safely so I can clean up mistakes without corrupting the graph.

## Topic

Users remove graph elements safely.

## Phase

Phase 2.

## Acceptance Criteria

- Users can delete a selected concept when manual editing is active.
- Users can delete a selected relationship when manual editing is active.
- Destructive actions are protected from accidental use.
- Deleting a concept never leaves relationships pointing to missing concepts.
- Deleting a relationship never removes unrelated concepts.
- Counts update after successful deletion.
- Selection state updates after successful deletion.
- Invalid deletion attempts are rejected without damaging the graph.
- Deleting a source-derived item changes only the working graph.

## Non-Goals

- Audit-grade deletion history is not required for the current release.
