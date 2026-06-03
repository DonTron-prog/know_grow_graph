import { describe, expect, it } from 'vitest';
import fixtureGraph from '../../../fixtures/source_graph.example.json';
import { createConcept, createConceptWithRelationships, createRelationship, deleteConcept, deleteRelationship, moveConcept, updateConcept, updateRelationship } from '../mutations';
import { loadGraph, saveGraph, saveLayout, WORKING_GRAPH_STORAGE_KEY } from '../storage';
import { requireValidGraph } from '../validation';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function fixture() {
  return requireValidGraph(structuredClone(fixtureGraph));
}

describe('graph mutations', () => {
  it('creates a validated user concept with a stable unique id and position', () => {
    const graph = fixture();

    const result = createConcept(graph, { label: 'Prompting', type: 'practice', notes: 'Duplicate label is allowed with a unique id.', position: { x: 10, y: 20 } });

    expect(result.changedId).toBe('prompting-2');
    expect(result.graph.nodes).toHaveLength(graph.nodes.length + 1);
    expect(result.graph.nodes.find((node) => node.id === result.changedId)).toMatchObject({ label: 'Prompting', type: 'practice', origin: 'user' });
    expect(result.graph.nodes.find((node) => node.id === result.changedId)?.sourceRefs).toBeUndefined();
    expect(result.graph.layout?.[result.changedId]).toEqual({ x: 10, y: 20 });
    expect(result.graph.stateType).toBe('working');
    expect(graph.nodes).toHaveLength(10);
  });

  it('creates a relationship only between available concepts', () => {
    const graph = fixture();

    const result = createRelationship(graph, { source: 'prompting', target: 'evaluation', label: 'supports' });

    expect(result.graph.edges).toHaveLength(graph.edges.length + 1);
    expect(result.graph.edges.find((edge) => edge.id === result.changedId)).toMatchObject({ source: 'prompting', target: 'evaluation', label: 'supports', origin: 'user' });
    expect(result.graph.edges.find((edge) => edge.id === result.changedId)?.sourceRefs).toBeUndefined();
    expect(() => createRelationship(graph, { source: 'prompting', target: 'missing', label: 'breaks' })).toThrow(/not available/);
    expect(graph.edges).toHaveLength(11);
  });

  it('creates a concept and selected-concept relationships as one validated change', () => {
    const graph = fixture();

    const result = createConceptWithRelationships(
      graph,
      { label: 'Manual synthesis', type: 'practice', notes: 'Added during review.', position: { x: 5, y: 6 } },
      [
        { existingConceptId: 'prompting', direction: 'existing-to-new', label: 'informs', notes: 'Prompting informs synthesis.' },
        { existingConceptId: 'evaluation', direction: 'new-to-existing', label: 'requires' },
      ],
    );

    expect(result.changedId).toBe('manual-synthesis');
    expect(result.graph.nodes.find((node) => node.id === 'manual-synthesis')).toMatchObject({ label: 'Manual synthesis', type: 'practice', origin: 'user' });
    expect(result.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'prompting', target: 'manual-synthesis', label: 'informs', origin: 'user' }),
      expect.objectContaining({ source: 'manual-synthesis', target: 'evaluation', label: 'requires', origin: 'user' }),
    ]));
    expect(result.graph.layout?.['manual-synthesis']).toEqual({ x: 5, y: 6 });
    expect(graph.nodes.some((node) => node.id === 'manual-synthesis')).toBe(false);
    expect(() => createConceptWithRelationships(graph, { label: 'Broken', type: 'practice' }, [{ existingConceptId: 'missing', direction: 'existing-to-new', label: 'breaks' }])).toThrow(/not available/);
    expect(() => createConceptWithRelationships(graph, { label: 'Broken', type: 'practice' }, [{ existingConceptId: 'prompting', direction: 'existing-to-new', label: '   ' }])).toThrow(/Relationship label is required/);
  });

  it('updates supported concept and relationship fields without mutating source-derived inputs', () => {
    const graph = fixture();

    const updatedConcept = updateConcept(graph, 'prompting', { label: 'Prompt design', type: 'skill', notes: 'Refined by the user.' }).graph;
    const updatedRelationship = updateRelationship(updatedConcept, 'edge-prompting-persona', { label: 'frames', notes: 'Manual relationship note.' }).graph;

    expect(updatedRelationship.nodes.find((node) => node.id === 'prompting')).toMatchObject({ label: 'Prompt design', type: 'skill', notes: 'Refined by the user.' });
    expect(updatedRelationship.nodes.find((node) => node.id === 'prompting')?.sourceRefs?.[0]?.reference).toBe('applied_agentic_ai_vault/prompting.md#prompting');
    expect(updatedRelationship.edges.find((edge) => edge.id === 'edge-prompting-persona')).toMatchObject({ label: 'frames', notes: 'Manual relationship note.' });
    expect(updatedRelationship.edges.find((edge) => edge.id === 'edge-prompting-persona')?.sourceRefs?.[0]?.reference).toBe('applied_agentic_ai_vault/prompting.md#persona');
    expect(graph.nodes.find((node) => node.id === 'prompting')?.label).toBe('Prompting');
    expect(() => updateConcept(graph, 'prompting', { label: '   ' })).toThrow(/Concept label is required/);
  });

  it('deletes concepts safely by removing connected relationships and deletes relationships without removing concepts', () => {
    const graph = fixture();

    const withoutPrompting = deleteConcept(graph, 'prompting').graph;
    expect(withoutPrompting.nodes.some((node) => node.id === 'prompting')).toBe(false);
    expect(withoutPrompting.edges.some((edge) => edge.source === 'prompting' || edge.target === 'prompting')).toBe(false);
    expect(withoutPrompting.layout?.prompting).toBeUndefined();

    const withoutRelationship = deleteRelationship(graph, 'edge-agent-loop-tool-use').graph;
    expect(withoutRelationship.edges.some((edge) => edge.id === 'edge-agent-loop-tool-use')).toBe(false);
    expect(withoutRelationship.nodes).toHaveLength(graph.nodes.length);
    expect(() => deleteRelationship(graph, 'missing-edge')).toThrow(/not available/);
  });

  it('repositions concepts by changing layout only and rejects malformed positions', () => {
    const graph = fixture();

    const moved = moveConcept(graph, 'prompting', { x: 123, y: -456 }).graph;

    expect(moved.layout?.prompting).toEqual({ x: 123, y: -456 });
    expect(moved.nodes).toEqual(graph.nodes);
    expect(moved.edges).toEqual(graph.edges);
    expect(() => moveConcept(graph, 'prompting', { x: Number.NaN, y: 0 })).toThrow(/finite x and y/);
  });

  it('persists accepted manual changes through the working graph storage path', () => {
    const storage = new MemoryStorage();
    const graph = createConcept(loadGraph(storage).graph, { label: 'Human review', type: 'practice', position: { x: 1, y: 2 } }).graph;

    const saved = saveGraph(graph, storage);
    const persisted = loadGraph(storage);

    expect(storage.getItem(WORKING_GRAPH_STORAGE_KEY)).toContain('Human review');
    expect(saved.stateType).toBe('working');
    expect(persisted.source).toBe('working');
    expect(persisted.graph.nodes.some((node) => node.label === 'Human review')).toBe(true);
  });

  it('rejects malformed saved layout positions before replacing stored graph content', () => {
    const storage = new MemoryStorage();
    saveGraph(fixture(), storage);
    const before = storage.getItem(WORKING_GRAPH_STORAGE_KEY);

    expect(() => saveLayout(fixture(), { prompting: { x: Number.POSITIVE_INFINITY, y: 0 } }, storage)).toThrow(/finite x and y/);
    expect(storage.getItem(WORKING_GRAPH_STORAGE_KEY)).toBe(before);
  });
});
