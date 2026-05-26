import type { GraphState } from "@know-grow/shared";

export type ElementSelection = {
  nodeIds: string[];
  edgeIds: string[];
};

export type SelectionTarget =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string };

export type CanvasPosition = { x: number; y: number };

export const EMPTY_SELECTION: ElementSelection = { nodeIds: [], edgeIds: [] };

export function selectionCount(selection: ElementSelection): number {
  return selection.nodeIds.length + selection.edgeIds.length;
}

export function isSelected(selection: ElementSelection, target: SelectionTarget): boolean {
  return target.kind === "node" ? selection.nodeIds.includes(target.id) : selection.edgeIds.includes(target.id);
}

export function selectElement(selection: ElementSelection, target: SelectionTarget, additive = false): ElementSelection {
  if (!additive) {
    return target.kind === "node" ? { nodeIds: [target.id], edgeIds: [] } : { nodeIds: [], edgeIds: [target.id] };
  }

  if (target.kind === "node") {
    return {
      nodeIds: toggleId(selection.nodeIds, target.id),
      edgeIds: selection.edgeIds
    };
  }

  return {
    nodeIds: selection.nodeIds,
    edgeIds: toggleId(selection.edgeIds, target.id)
  };
}

export function selectionLabel(selection: ElementSelection): string {
  const count = selectionCount(selection);
  if (count === 0) {
    return "0 selected";
  }
  const parts = [];
  if (selection.nodeIds.length > 0) {
    parts.push(`${selection.nodeIds.length} node${selection.nodeIds.length === 1 ? "" : "s"}`);
  }
  if (selection.edgeIds.length > 0) {
    parts.push(`${selection.edgeIds.length} edge${selection.edgeIds.length === 1 ? "" : "s"}`);
  }
  return `${count} selected (${parts.join(", ")})`;
}

export function calculateLayout(graph: GraphState): { positions: Map<string, CanvasPosition> } {
  const positions = new Map<string, CanvasPosition>();
  const sourcePositions = graph.layout ?? {};
  const sourceValues = graph.nodes.map((node) => sourcePositions[node.id]).filter((position): position is CanvasPosition => Boolean(position));

  if (sourceValues.length > 0) {
    const minX = Math.min(...sourceValues.map((position) => position.x));
    const maxX = Math.max(...sourceValues.map((position) => position.x));
    const minY = Math.min(...sourceValues.map((position) => position.y));
    const maxY = Math.max(...sourceValues.map((position) => position.y));
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    graph.nodes.forEach((node, index) => {
      const position = sourcePositions[node.id];
      if (position) {
        positions.set(node.id, {
          x: 80 + ((position.x - minX) / width) * 760,
          y: 80 + ((position.y - minY) / height) * 460
        });
        return;
      }

      positions.set(node.id, fallbackPosition(index, graph.nodes.length));
    });
  } else {
    graph.nodes.forEach((node, index) => {
      positions.set(node.id, fallbackPosition(index, graph.nodes.length));
    });
  }

  return { positions };
}

export function clampZoom(value: number): number {
  return Math.min(Math.max(value, 0.35), 2.8);
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

function fallbackPosition(index: number, total: number): CanvasPosition {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  return {
    x: 460 + Math.cos(angle) * 260,
    y: 310 + Math.sin(angle) * 210
  };
}
