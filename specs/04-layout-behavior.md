# Layout Behavior

## JTBD

As a user, I need the graph layout to stay understandable so I can review structure across sessions.

## Topic

The graph layout stays reviewable across sessions.

## Phase

Phase 1.

## Acceptance Criteria

- When graph data includes saved positions, the initial arrangement reflects those positions.
- When graph data lacks saved positions, the initial arrangement is coherent enough for review.
- Reloading the same positioned graph produces a consistent arrangement.
- Resetting layout produces a coherent arrangement suitable for inspection.
- Layout behavior supports recognizing local neighborhoods or communities when the graph structure makes them apparent.
- Saving layout preserves moved positions when layout saving is available.
- Missing positions are accepted as recoverable graph data.
- Layout changes do not alter graph meaning.
- Layout behavior remains simple enough to support rapid iteration.

## Non-Goals

- Complex layout tuning is not required for the current release.
- Layout history is not required for the current release.
