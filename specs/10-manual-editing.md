# Manual Editing

## JTBD

As a user, I need to reshape existing graph knowledge so the workbench reflects my understanding and mental model.

## Topic

Users revise graph element details manually.

## Phase

Phase 2.

## Acceptance Criteria

- Users can edit supported concept details when manual editing is active.
- Selecting a concept while manual editing is active exposes editable supported fields in the details panel.
- Concept edits appear in the graph or inspector wherever those details are shown.
- Users can edit supported relationship details when manual editing is active.
- Selecting a relationship while manual editing is active exposes editable supported fields in the details panel.
- Relationship edits appear in inspection wherever those details are shown.
- Valid edits reappear after reload when graph saving is available.
- Users can undo and redo recent accepted manual edits during the current editing session.
- Undo and redo include accepted edits made from the details panel.
- Undo and redo update the graph, inspector, and counts promptly without leaving invalid graph content visible.
- Invalid edits are rejected without replacing valid graph content.
- Editing a source-derived item changes only the working graph.
- Simple edits preserve available source context when the source relationship remains clear.
- Edits are allowed even when preserving complete source context is not practical.
- Editing does not require historical replay.
- Editing does not require branching.

## Non-Goals

- Rich text authoring is not required for the current release.
- Undo and redo do not need to preserve history across reloads.
- Audit-grade provenance is not required for manual editing.
- Complete source lineage for every edit is not required for manual editing.
