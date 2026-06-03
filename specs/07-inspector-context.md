# Inspector Context

## JTBD

As a user, I need details for the current graph focus so I can understand selected concepts or relationships and judge how they relate to the source material.

## Topic

The inspector explains the current graph focus.

## Phase

Phase 1.

## Acceptance Criteria

- With no selection, the inspector summarizes the graph.
- The graph summary includes the graph name, concept count, relationship count, plus layout state.
- Selecting a concept shows its label, stable identifier, type, notes, connected concept count, plus connected relationships when available.
- Selecting a concept shows available source context when the concept is source-derived.
- Selecting a concept can show available structural context such as importance or community when that context is available.
- Selecting a relationship shows its source concept, relationship meaning, target concept, plus notes when available.
- Selecting a relationship shows available source context when the relationship is source-derived.
- When manual editing is active, the details panel for a selected concept or relationship can present supported fields as editable controls.
- Changing selection updates inspector content promptly.
- Clearing selection returns the inspector to graph-level context.
- If the selected element becomes invalid or unavailable, the inspector explains the state.
- Inspector details remain readable without requiring a separate page.

## Non-Goals

- Editing unsupported or advanced fields in the inspector is not required.
- Full source document reading is not required in the inspector.
