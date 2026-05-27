import type { KnowledgeGraph } from './types';

export function relationshipCounts(graph: KnowledgeGraph): Map<string, number> {
  const counts = new Map(graph.nodes.map((node) => [node.id, 0]));

  for (const edge of graph.edges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  }

  return counts;
}

export function connectedEdges(graph: KnowledgeGraph, conceptId: string) {
  return graph.edges.filter((edge) => edge.source === conceptId || edge.target === conceptId);
}
