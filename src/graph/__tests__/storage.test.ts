import { describe, expect, it } from 'vitest';
import fixtureGraph from '../../../fixtures/source_graph.example.json';
import { loadGraph, saveLayout, WORKING_GRAPH_STORAGE_KEY } from '../storage';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('graph storage', () => {
  it('loads the example graph when no saved working graph exists', () => {
    const result = loadGraph(new MemoryStorage());

    expect(result.source).toBe('fixture');
    expect(result.graph.graphId).toBe('source-example');
    expect(result.graph.name).toContain('Agentic AI');
  });

  it('loads a valid saved working graph before the fixture', () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKING_GRAPH_STORAGE_KEY, JSON.stringify({ ...fixtureGraph, graphId: 'working-example', stateType: 'working' }));

    const result = loadGraph(storage);

    expect(result.source).toBe('working');
    expect(result.graph.graphId).toBe('working-example');
  });

  it('falls back to the fixture with a recovery message when saved graph data is malformed', () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKING_GRAPH_STORAGE_KEY, '{not json');

    const result = loadGraph(storage);

    expect(result.source).toBe('fixture');
    expect(result.graph.graphId).toBe('source-example');
    expect(result.validation.ok).toBe(false);
    expect(result.recoveryMessage).toContain('bundled example graph is still visible');
  });

  it('saves layout as a validated working graph', () => {
    const storage = new MemoryStorage();
    const saved = saveLayout(
      loadGraph(storage).graph,
      Object.fromEntries(fixtureGraph.nodes.map((node, index) => [node.id, { x: index * 10, y: (index + 1) * -10 }])),
      storage,
    );

    const persisted = loadGraph(storage);

    expect(saved.stateType).toBe('working');
    expect(persisted.source).toBe('working');
    expect(persisted.graph.layout?.prompting).toEqual({ x: 0, y: -10 });
    expect(persisted.graph.layout?.persona).toEqual({ x: 10, y: -20 });
  });
});
