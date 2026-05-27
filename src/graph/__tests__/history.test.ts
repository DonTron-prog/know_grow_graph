import { describe, expect, it } from 'vitest';
import fixtureGraph from '../../../fixtures/source_graph.example.json';
import { createConcept, updateConcept } from '../mutations';
import { canRedo, canUndo, emptyGraphHistory, redoGraph, rememberGraph, undoGraph } from '../history';
import { requireValidGraph } from '../validation';

function fixture() {
  return requireValidGraph(structuredClone(fixtureGraph));
}

describe('graph history', () => {
  it('tracks current-session undo and redo for accepted graph changes', () => {
    const graph = fixture();
    let history = emptyGraphHistory();

    const withUndo = rememberGraph(history, graph);
    const changed = createConcept(graph, { label: 'Undoable concept', type: 'practice', position: { x: 1, y: 2 } }).graph;

    expect(canUndo(withUndo)).toBe(true);
    expect(canRedo(withUndo)).toBe(false);

    const undone = undoGraph(withUndo, changed);
    expect(undone?.graph.nodes.some((node) => node.label === 'Undoable concept')).toBe(false);
    expect(canUndo(undone!.history)).toBe(false);
    expect(canRedo(undone!.history)).toBe(true);

    const redone = redoGraph(undone!.history, undone!.graph);
    expect(redone?.graph.nodes.some((node) => node.label === 'Undoable concept')).toBe(true);
    expect(canUndo(redone!.history)).toBe(true);
    expect(canRedo(redone!.history)).toBe(false);
  });

  it('clears redo history when a new graph change is remembered', () => {
    const graph = fixture();
    const firstHistory = rememberGraph(emptyGraphHistory(), graph);
    const changed = updateConcept(graph, 'prompting', { label: 'Prompt design' }).graph;
    const undone = undoGraph(firstHistory, changed)!;

    const divergentHistory = rememberGraph(undone.history, undone.graph);

    expect(canRedo(undone.history)).toBe(true);
    expect(canRedo(divergentHistory)).toBe(false);
  });

  it('stores snapshots so later object changes do not rewrite history', () => {
    const graph = fixture();
    const history = rememberGraph(emptyGraphHistory(), graph);
    const changed = updateConcept(graph, 'prompting', { label: 'Prompt design' }).graph;
    changed.nodes[0] = { ...changed.nodes[0], label: 'Mutated after change' };

    const undone = undoGraph(history, changed);

    expect(undone?.graph.nodes.find((node) => node.id === 'prompting')?.label).toBe('Prompting');
  });
});
