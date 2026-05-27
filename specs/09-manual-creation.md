# Manual Creation

## JTBD

As a user, I need to add knowledge to the graph myself so I can expand it during review.

## Topic

Users create graph elements manually.

## Phase

Phase 2.

## Acceptance Criteria

- Users can create a concept when manual editing is active.
- Concept creation uses one dialog with all required and optional concept fields instead of multiple sequential prompts.
- The concept type field lets users choose from existing type values or enter a new value.
- When one or more concepts are selected, creating a concept can connect the new concept to every selected concept using relationship details confirmed in the same dialog.
- A created concept appears in the graph promptly.
- A created concept can be selected after creation.
- A created concept can be inspected after creation.
- Users can create a relationship between existing concepts when manual editing is active.
- Relationship creation uses one dialog with source, target, label, notes, and direction controls instead of multiple sequential prompts.
- Starting relationship creation from a two-concept shift-selection opens the relationship dialog with those concepts prefilled.
- The relationship dialog lets users choose or reverse direction before saving.
- A created relationship appears in the graph promptly.
- A created relationship can be inspected after creation when relationship inspection is supported.
- Invalid creations are rejected without damaging the graph.
- Creating a concept plus automatic relationships succeeds or fails as one accepted change.
- Successful creations reappear after reload when graph saving is available.
- Counts update after successful creation.

## Non-Goals

- Bulk import is not required for manual creation.
