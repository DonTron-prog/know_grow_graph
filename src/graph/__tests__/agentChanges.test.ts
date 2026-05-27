import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/source_graph.example.json';
import { applyAgentGraphChangeProposal, createAgentGraphChangeProposal, type AgentGraphChangeProposal } from '../agentChanges';
import { requireValidGraph } from '../validation';
import type { KnowledgeGraph } from '../types';

function graph(): KnowledgeGraph {
  return requireValidGraph(structuredClone(fixture));
}

describe('agent graph changes', () => {
  it('proposes understandable graph changes from plain language', () => {
    const proposal = createAgentGraphChangeProposal(graph(), 'Add concept Review Lens type method notes Used to inspect graph quality.');

    expect(proposal.summary).toContain('Review Lens');
    expect(proposal.operations).toEqual([
      { kind: 'create-concept', label: 'Review Lens', type: 'method', notes: 'Used to inspect graph quality.' },
    ]);
  });

  it('applies valid proposals with agent provenance through graph validation', () => {
    const proposal = createAgentGraphChangeProposal(graph(), 'Connect Prompting to Evaluation as validates');
    const result = applyAgentGraphChangeProposal(graph(), proposal);

    expect(result.summary).toContain('Applied 1 agent-proposed graph change');
    expect(result.changedKind).toBe('relationship');
    expect(result.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'prompting', target: 'evaluation', label: 'validates', origin: 'agent' }),
    ]));
  });

  it('updates existing graph content without mutating the source graph', () => {
    const sourceGraph = graph();
    const proposal = createAgentGraphChangeProposal(sourceGraph, 'Rename concept Prompting to Prompt Design');
    const result = applyAgentGraphChangeProposal(sourceGraph, proposal);

    expect(sourceGraph.nodes.find((node) => node.id === 'prompting')?.label).toBe('Prompting');
    expect(result.graph.nodes.find((node) => node.id === 'prompting')?.label).toBe('Prompt Design');
  });

  it('rejects invalid proposals safely before replacing the previous valid graph', () => {
    const sourceGraph = graph();
    const invalidProposal: AgentGraphChangeProposal = {
      request: 'Connect missing concepts',
      summary: 'Invalid relationship proposal.',
      operations: [{ kind: 'create-relationship', source: 'missing-source', target: 'prompting', label: 'breaks' }],
    };

    expect(() => applyAgentGraphChangeProposal(sourceGraph, invalidProposal)).toThrow('missing-source');
    expect(sourceGraph.edges.some((edge) => edge.label === 'breaks')).toBe(false);
  });

  it('communicates unsupported natural-language requests instead of inventing changes', () => {
    expect(() => createAgentGraphChangeProposal(graph(), 'Please make the graph better somehow')).toThrow('Could not propose');
  });
});
