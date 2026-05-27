# Graph Validity Protection

## JTBD

As a user, I need graph changes to be safe so invalid data cannot replace my last valid graph.

## Topic

The system protects the graph from invalid changes.

## Phase

Phase 2, extended in Phase 3 for agent-proposed changes.

## Acceptance Criteria

- Duplicate concept identities are rejected.
- Duplicate relationship identities are rejected.
- Relationships that refer to missing concepts are rejected.
- Changes targeting unavailable elements are rejected.
- Malformed graph changes are rejected.
- Blocked changes leave the previous valid graph unchanged.
- Non-blocking warnings are visible without preventing exploratory work.
- The displayed graph remains valid after every accepted change.
- The same validity rules apply to loaded, manual, imported, and saved changes.
- The same validity rules apply to agent-proposed changes when agent change features are active.
- Invalid agent-proposed changes are rejected before application when agent change features are active.
- Invalid manual changes are rejected before application.

## Non-Goals

- Warnings do not need to become audit records.
- Advanced graph analytics are not required for validity protection.
