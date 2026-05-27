import { describe, expect, it } from 'vitest';
import fixtureGraph from '../../../fixtures/source_graph.example.json';
import { validateGraph } from '../validation';

interface MutableGraphFixture {
  graphId?: unknown;
  name?: unknown;
  stateType?: unknown;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  layout: Record<string, { x: number; y: number }>;
  [key: string]: unknown;
}

function cloneFixture(): MutableGraphFixture {
  return structuredClone(fixtureGraph) as MutableGraphFixture;
}

describe('validateGraph', () => {
  it('accepts the checked-in example graph', () => {
    const result = validateGraph(fixtureGraph);

    expect(result.ok).toBe(true);
    expect(result.graph?.nodes).toHaveLength(10);
    expect(result.graph?.edges).toHaveLength(11);
    expect(result.graph?.name).toContain('Agentic AI');
    expect(result.errors).toHaveLength(0);
  });

  it('rejects duplicate concept ids without replacing valid graph content', () => {
    const graph = cloneFixture();
    graph.nodes[1] = { ...graph.nodes[1], id: graph.nodes[0].id };

    const result = validateGraph(graph);

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('duplicate_node_id');
  });

  it('rejects duplicate relationship ids', () => {
    const graph = cloneFixture();
    graph.edges[1] = { ...graph.edges[1], id: graph.edges[0].id };

    const result = validateGraph(graph);

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('duplicate_edge_id');
  });

  it('rejects relationships that point to missing concepts', () => {
    const graph = cloneFixture();
    graph.edges[0] = { ...graph.edges[0], target: 'missing-concept' };

    const result = validateGraph(graph);

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('edge_target_missing_node');
  });

  it('treats missing positions as recoverable warnings', () => {
    const graph = cloneFixture();
    delete graph.layout['prompting'];

    const result = validateGraph(graph);

    expect(result.ok).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toContain('layout_position_missing');
  });

  it('ignores layout entries for unavailable concepts', () => {
    const graph = cloneFixture();
    graph.layout['not-in-graph'] = { x: 1, y: 2 };

    const result = validateGraph(graph);

    expect(result.ok).toBe(true);
    expect(result.graph?.layout?.['not-in-graph']).toBeUndefined();
    expect(result.warnings.map((warning) => warning.code)).toContain('layout_unknown_node');
  });

  it('rejects malformed graph data clearly', () => {
    const result = validateGraph({ graphId: '', nodes: 'nope', edges: [] });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['graph_id_missing', 'nodes_not_array']));
  });
});
