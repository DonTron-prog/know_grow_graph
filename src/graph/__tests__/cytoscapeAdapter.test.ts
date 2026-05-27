import { describe, expect, it } from 'vitest';
import fixtureGraph from '../../../fixtures/source_graph.example.json';
import { graphPositions, toCytoscapeElements } from '../cytoscapeAdapter';
import { requireValidGraph } from '../validation';

describe('toCytoscapeElements', () => {
  const graph = requireValidGraph(fixtureGraph);
  const elements = toCytoscapeElements(graph);

  it('converts the fixture into Cytoscape node and edge elements', () => {
    expect(elements.filter((element) => element.group === 'nodes')).toHaveLength(10);
    expect(elements.filter((element) => element.group === 'edges')).toHaveLength(11);
  });

  it('preserves stable concept ids, labels, positions, and origin classes', () => {
    const prompting = elements.find((element) => element.data.id === 'prompting');

    expect(prompting).toMatchObject({
      group: 'nodes',
      data: {
        id: 'prompting',
        label: 'Prompting',
        origin: 'source',
        relationshipCount: 3,
      },
      position: { x: 0, y: 0 },
    });
    expect(prompting?.classes).toContain('origin-source');
  });

  it('preserves relationship endpoints and labels', () => {
    const edge = elements.find((element) => element.data.id === 'edge-agent-loop-tool-use');

    expect(edge).toMatchObject({
      group: 'edges',
      data: {
        source: 'agent-loop',
        target: 'tool-use',
        label: 'orchestrates',
      },
    });
    expect(edge?.classes).toContain('relationship');
  });

  it('adds direct relationship counts for visual prominence', () => {
    const agentLoop = elements.find((element) => element.data.id === 'agent-loop');

    expect(agentLoop?.data.relationshipCount).toBe(4);
    expect(agentLoop?.classes).toContain('degree-4');
  });

  it('uses coherent fallback positions for concepts without saved layout entries', () => {
    const graphWithoutSomeLayout = requireValidGraph({
      ...fixtureGraph,
      layout: { prompting: fixtureGraph.layout.prompting },
    });

    const positions = graphPositions(graphWithoutSomeLayout);

    expect(positions.prompting).toEqual({ x: 0, y: 0 });
    expect(positions.persona).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(Number.isFinite(positions.persona.x)).toBe(true);
    expect(Number.isFinite(positions.persona.y)).toBe(true);
    expect(Object.keys(positions)).toHaveLength(graphWithoutSomeLayout.nodes.length);
  });
});
