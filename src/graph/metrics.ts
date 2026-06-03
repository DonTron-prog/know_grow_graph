import type { ConceptNode, KnowledgeGraph } from './types';

export type ImportanceLevel = 'isolated' | 'low' | 'medium' | 'high';

export interface ConceptInsight {
  id: string;
  relationshipCount: number;
  importanceScore: number;
  importanceLevel: ImportanceLevel;
  community?: string;
}

export interface GraphInsights {
  concepts: Map<string, ConceptInsight>;
  maxRelationshipCount: number;
  types: string[];
  communities: string[];
}

export interface GraphFilters {
  type?: string;
  minImportanceScore?: number;
  community?: string;
}

export interface GraphVisibility {
  visibleConceptIds: Set<string>;
  visibleRelationshipIds: Set<string>;
  visibleConceptCount: number;
  totalConceptCount: number;
  visibleRelationshipCount: number;
  totalRelationshipCount: number;
  active: boolean;
}

const COMMUNITY_PROPERTY_KEYS = ['community', 'communityId', 'communityName', 'cluster', 'clusterId', 'clusterName', 'group'];

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

export function graphInsights(graph: KnowledgeGraph): GraphInsights {
  const counts = relationshipCounts(graph);
  const maxRelationshipCount = Math.max(0, ...Array.from(counts.values()));
  const communities = communityAssignments(graph);
  const concepts = new Map<string, ConceptInsight>();

  for (const node of graph.nodes) {
    const relationshipCount = counts.get(node.id) ?? 0;
    const importanceScore = maxRelationshipCount === 0 ? 0 : relationshipCount / maxRelationshipCount;
    concepts.set(node.id, {
      id: node.id,
      relationshipCount,
      importanceScore,
      importanceLevel: importanceLevel(relationshipCount, importanceScore),
      community: communities.get(node.id),
    });
  }

  return {
    concepts,
    maxRelationshipCount,
    types: uniqueSorted(graph.nodes.map((node) => node.type).filter(Boolean)),
    communities: uniqueSorted(Array.from(communities.values()).filter((community): community is string => Boolean(community))),
  };
}

export function graphVisibility(graph: KnowledgeGraph, filters: GraphFilters = {}, insights = graphInsights(graph)): GraphVisibility {
  const visibleConceptIds = new Set<string>();
  const minImportanceScore = Math.max(0, filters.minImportanceScore ?? 0);
  const activeType = filters.type?.trim();
  const activeCommunity = filters.community?.trim();

  for (const node of graph.nodes) {
    const insight = insights.concepts.get(node.id);
    if (activeType && node.type !== activeType) continue;
    if (activeCommunity && insight?.community !== activeCommunity) continue;
    if ((insight?.importanceScore ?? 0) < minImportanceScore) continue;
    visibleConceptIds.add(node.id);
  }

  const visibleRelationshipIds = new Set(
    graph.edges
      .filter((edge) => visibleConceptIds.has(edge.source) && visibleConceptIds.has(edge.target))
      .map((edge) => edge.id),
  );

  return {
    visibleConceptIds,
    visibleRelationshipIds,
    visibleConceptCount: visibleConceptIds.size,
    totalConceptCount: graph.nodes.length,
    visibleRelationshipCount: visibleRelationshipIds.size,
    totalRelationshipCount: graph.edges.length,
    active: Boolean(activeType) || Boolean(activeCommunity) || minImportanceScore > 0,
  };
}

export function filteredGraph(graph: KnowledgeGraph, visibility: GraphVisibility): KnowledgeGraph {
  if (!visibility.active) return graph;
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => visibility.visibleConceptIds.has(node.id)),
    edges: graph.edges.filter((edge) => visibility.visibleRelationshipIds.has(edge.id)),
  };
}

function importanceLevel(relationshipCount: number, importanceScore: number): ImportanceLevel {
  if (relationshipCount === 0) return 'isolated';
  if (importanceScore >= 0.66) return 'high';
  if (importanceScore >= 0.34) return 'medium';
  return 'low';
}

function communityAssignments(graph: KnowledgeGraph): Map<string, string | undefined> {
  const explicit = new Map<string, string | undefined>();
  for (const node of graph.nodes) explicit.set(node.id, explicitCommunity(node));
  if (Array.from(explicit.values()).some(Boolean)) return explicit;

  const components = connectedComponents(graph);
  if (components.length <= 1) return explicit;

  const assignments = new Map<string, string | undefined>();
  components.forEach((component, index) => {
    const label = `Component ${index + 1}`;
    component.forEach((nodeId) => assignments.set(nodeId, label));
  });
  return assignments;
}

function explicitCommunity(node: ConceptNode): string | undefined {
  for (const key of COMMUNITY_PROPERTY_KEYS) {
    const value = node.properties?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function connectedComponents(graph: KnowledgeGraph): string[][] {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    const component = collectComponent(node.id, adjacency, visited);
    components.push(component);
  }

  return components;
}

function collectComponent(startId: string, adjacency: Map<string, Set<string>>, visited: Set<string>): string[] {
  const component: string[] = [];
  const queue = [startId];
  visited.add(startId);

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    component.push(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return component;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
