import type cytoscape from 'cytoscape';
import { relationshipCounts } from './metrics';
import type { GraphPosition, KnowledgeGraph } from './types';

function className(value: string | undefined): string {
  return (value ?? 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

export function fallbackLayoutPositions(graph: KnowledgeGraph, radius = 260): Record<string, GraphPosition> {
  const centerOffset = graph.nodes.length <= 1 ? 0 : Math.PI / Math.max(graph.nodes.length, 1);
  return Object.fromEntries(
    graph.nodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(graph.nodes.length, 1) - centerOffset;
      return [node.id, { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) }];
    }),
  );
}

export function graphPositions(graph: KnowledgeGraph): Record<string, GraphPosition> {
  const fallback = fallbackLayoutPositions(graph);
  return Object.fromEntries(graph.nodes.map((node) => [node.id, graph.layout?.[node.id] ?? fallback[node.id]]));
}

export function toCytoscapeElements(graph: KnowledgeGraph): cytoscape.ElementDefinition[] {
  const counts = relationshipCounts(graph);
  const positions = graphPositions(graph);
  const nodeElements: cytoscape.ElementDefinition[] = graph.nodes.map((node) => {
    const relationshipCount = counts.get(node.id) ?? 0;
    return {
      group: 'nodes',
      data: {
        id: node.id,
        label: node.label,
        type: node.type,
        origin: node.origin ?? 'unknown',
        notes: node.notes ?? '',
        relationshipCount,
      },
      position: positions[node.id],
      classes: ['concept', `origin-${className(node.origin)}`, `type-${className(node.type)}`, `degree-${Math.min(relationshipCount, 5)}`].join(' '),
    };
  });

  const edgeElements: cytoscape.ElementDefinition[] = graph.edges.map((edge) => ({
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      origin: edge.origin ?? 'unknown',
      notes: edge.notes ?? '',
    },
    classes: ['relationship', `origin-${className(edge.origin)}`].join(' '),
  }));

  return [...nodeElements, ...edgeElements];
}
