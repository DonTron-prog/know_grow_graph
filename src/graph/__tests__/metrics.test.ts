import { describe, expect, it } from 'vitest';
import fixtureGraph from '../../../fixtures/source_graph.example.json';
import { filteredGraph, graphInsights, graphVisibility } from '../metrics';
import { requireValidGraph } from '../validation';
import type { KnowledgeGraph } from '../types';

function fixture() {
  return requireValidGraph(structuredClone(fixtureGraph));
}

describe('graph insights and visibility', () => {
  it('derives stable importance levels from graph connectivity without mutating the graph', () => {
    const graph = fixture();
    const before = structuredClone(graph);

    const insights = graphInsights(graph);

    expect(insights.maxRelationshipCount).toBe(4);
    expect(insights.concepts.get('agent-loop')).toMatchObject({ relationshipCount: 4, importanceScore: 1, importanceLevel: 'high' });
    expect(insights.concepts.get('few-shot-examples')).toMatchObject({ relationshipCount: 1, importanceLevel: 'low' });
    expect(graph).toEqual(before);
  });

  it('uses explicit community metadata when available', () => {
    const graph: KnowledgeGraph = {
      ...fixture(),
      nodes: fixture().nodes.map((node) => ({
        ...node,
        properties: { community: node.id === 'guardrails' || node.id === 'reliability' ? 'Safety' : 'Prompting' },
      })),
    };

    const insights = graphInsights(graph);

    expect(insights.communities).toEqual(['Prompting', 'Safety']);
    expect(insights.concepts.get('guardrails')?.community).toBe('Safety');
  });

  it('falls back to connected components as communities when useful', () => {
    const graph: KnowledgeGraph = {
      ...fixture(),
      nodes: [
        { id: 'a', label: 'A', type: 'concept' },
        { id: 'b', label: 'B', type: 'concept' },
        { id: 'c', label: 'C', type: 'concept' },
      ],
      edges: [{ id: 'a-b', source: 'a', target: 'b', label: 'relates' }],
      layout: {},
    };

    const insights = graphInsights(graph);

    expect(insights.communities).toEqual(['Component 1', 'Component 2']);
    expect(insights.concepts.get('a')?.community).toBe('Component 1');
    expect(insights.concepts.get('c')?.community).toBe('Component 2');
  });

  it('filters visible concepts and incident relationships without deleting graph content', () => {
    const graph = fixture();
    const insights = graphInsights(graph);
    const visibility = graphVisibility(graph, { minImportanceScore: 0.66 }, insights);
    const visibleGraph = filteredGraph(graph, visibility);

    expect(visibility.active).toBe(true);
    expect(visibility.visibleConceptIds.has('agent-loop')).toBe(true);
    expect(visibility.visibleConceptIds.has('few-shot-examples')).toBe(false);
    expect(visibleGraph.nodes.length).toBeLessThan(graph.nodes.length);
    expect(visibleGraph.edges.every((edge) => visibility.visibleConceptIds.has(edge.source) && visibility.visibleConceptIds.has(edge.target))).toBe(true);
    expect(graph.nodes).toHaveLength(10);
    expect(graph.edges).toHaveLength(11);
  });

  it('filters by community metadata when available', () => {
    const base = fixture();
    const graph: KnowledgeGraph = {
      ...base,
      nodes: base.nodes.map((node) => ({
        ...node,
        properties: { community: node.id === 'guardrails' || node.id === 'reliability' ? 'Safety' : 'Prompting' },
      })),
    };

    const insights = graphInsights(graph);
    const visibility = graphVisibility(graph, { community: 'Safety' }, insights);

    expect(visibility.active).toBe(true);
    expect(Array.from(visibility.visibleConceptIds).sort()).toEqual(['guardrails', 'reliability']);
    expect(filteredGraph(graph, visibility).nodes.map((node) => node.id).sort()).toEqual(['guardrails', 'reliability']);
  });
});
