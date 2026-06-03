# Source Grounding

## JTBD

As a user, I need to see where source-derived graph knowledge came from so I can judge whether the concept map reflects the material.

## Topic

The workbench preserves and presents source references when they are available.

## Phase

Phase 1, extended in Phase 2.

## Acceptance Criteria

- Source-derived concepts can expose available source context during inspection.
- Source-derived relationships can expose available source context during inspection.
- Source context may include source names, locations, excerpts, or other user-readable references when available.
- Missing source context is presented as unavailable rather than as an error.
- Simple manual changes preserve source context when the relationship between the changed graph element and the original source remains clear.
- Complex manual transformations are allowed even when source context cannot be preserved completely.
- User-created graph elements can exist without source context.
- Source grounding helps review but does not prevent users from reshaping the working graph to match their understanding.

## Non-Goals

- Audit-grade provenance is not required for the current release.
- Every manual change does not need a complete source lineage.
- Source document viewing is not required for the current release.
