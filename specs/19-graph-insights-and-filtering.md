# Graph Insights and Filtering

## JTBD

As a user, I need the workbench to surface structure in the concept map so I can understand dense material without inspecting every element manually.

## Topic

The graph view helps users see important concepts, communities, and useful subsets of the working graph.

## Phase

Phase 1, extended in Phase 2.

## Acceptance Criteria

- The workbench can visually emphasize concepts that appear structurally important in the current graph.
- Structural importance reflects graph connectivity or centrality rather than only whether a concept was recently selected.
- The graph view can visually distinguish communities or clusters when grouping information is available.
- Community or cluster distinctions help comprehension without replacing the single working graph.
- Users can reduce clutter by filtering or hiding concepts below an importance or centrality threshold.
- Users can filter or hide concepts by community or cluster when community information is available.
- Users can filter or hide concepts by concept type when type information is available.
- Filtering changes what is visible without deleting graph content.
- Users can return from a filtered view to the full working graph.
- Accepted graph changes update the visible insight state enough that emphasis and filters do not become misleading.
- When imported or generated insight metadata is unavailable, the workbench still provides useful graph-derived emphasis or filtering where possible.

## Non-Goals

- Multiple competing graph representations are not required for the current release.
- Side-by-side graph comparison is not required for the current release.
- User-managed cluster editing is not required for the current release.
- Advanced analytics explanations are not required for the current release.
