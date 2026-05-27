# Keyboard Operations

## JTBD

As a keyboard user, I need common shortcuts for graph changes so I can work quickly without leaving the graph context.

## Topic

Users operate accepted manual graph actions with familiar keyboard input.

## Phase

Phase 2.

## Acceptance Criteria

- Keyboard shortcuts are available for supported manual graph operations when manual editing is active.
- Delete or Backspace can remove the selected concept or relationship through the same deletion protections as toolbar deletion.
- Ctrl+Z on Windows/Linux and Command+Z on macOS undo the most recent accepted manual edit in the current editing session.
- Ctrl+Shift+Z, Command+Shift+Z, or Ctrl+Y redo the most recently undone accepted manual edit in the current editing session.
- Undo and redo include accepted creation, deletion, repositioning, and details-panel edits.
- Keyboard operations update the graph, selection, inspector, and counts promptly.
- Keyboard shortcuts do not override normal text editing while a dialog field or details-panel input has focus.
- Unsupported or unavailable keyboard actions leave the graph unchanged and provide clear feedback when feedback is needed.

## Non-Goals

- Customizable keyboard shortcuts are not required for the current release.
- Persisting undo and redo history across reloads is not required.
