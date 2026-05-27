# Activity Feedback

## JTBD

As a user, I need clear activity feedback so I can trust what the workbench is doing.

## Topic

The workbench reports current graph activity.

## Phase

Phase 1.

## Acceptance Criteria

- The workbench shows concept count while a graph is loaded.
- The workbench shows relationship count while a graph is loaded.
- The workbench shows current selection count.
- The workbench communicates whether layout changes are saved or unsaved when layout saving is available.
- Loading state is visible during graph retrieval.
- Saving state is visible while graph changes are being saved.
- Rendering or data errors are visible to the user.
- Recoverable failures keep the last valid graph available.
- Error messages help the user decide whether to retry, reload, or continue reviewing.

## Non-Goals

- Audit-grade event logs are not required for the current release.
