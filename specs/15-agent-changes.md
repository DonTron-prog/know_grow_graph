# Agent Changes

## JTBD

As a user, I need help changing the graph through natural language so I can improve knowledge structure faster.

## Topic

Users apply validated agent-proposed graph changes.

## Phase

Phase 3.

## Acceptance Criteria

- Agent change features stay secondary until manual editing is dependable.
- Users can request graph changes in plain language when agent change features are active.
- The agent can return proposed graph changes for review.
- Proposed changes are understandable before application.
- Proposed changes are validated before application.
- Valid proposed changes can be applied to the graph.
- Agent changes do not depend on a transient hover or selection unless the user request explicitly targets that focus.
- Invalid proposed changes are rejected safely.
- Applied agent changes appear in the graph promptly.
- Applied agent changes are summarized in plain language.
- Agent change failures leave the previous valid graph available.

## Non-Goals

- Agent changes are not required for Phase 1.
- Agent changes are not required before manual graph operations are usable.
