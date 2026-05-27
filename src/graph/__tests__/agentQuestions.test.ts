import { describe, expect, it } from 'vitest';
import fixtureGraph from '../../../fixtures/source_graph.example.json';
import { answerGraphQuestion } from '../agentQuestions';
import { requireValidGraph } from '../validation';

function fixture() {
  return requireValidGraph(structuredClone(fixtureGraph));
}

describe('answerGraphQuestion', () => {
  it('answers concept questions using only current graph content and evidence', () => {
    const answer = answerGraphQuestion(fixture(), 'What is prompting connected to?');

    expect(answer.answered).toBe(true);
    expect(answer.answer).toContain('Prompting is a concept');
    expect(answer.answer).toContain('How instructions shape model behavior.');
    expect(answer.answer).toContain('Prompting uses Persona');
    expect(answer.evidence).toEqual(expect.arrayContaining(['concept:prompting (Prompting)', 'relationship:edge-prompting-persona (prompting -uses-> persona)']));
  });

  it('summarizes graph counts and connected concepts', () => {
    const answer = answerGraphQuestion(fixture(), 'Give me a graph summary and counts');

    expect(answer.answered).toBe(true);
    expect(answer.answer).toContain('10 concepts');
    expect(answer.answer).toContain('11 relationships');
    expect(answer.answer).toContain('Agent Loop (4)');
  });

  it('reports when the graph cannot ground an answer', () => {
    const answer = answerGraphQuestion(fixture(), 'What does Kubernetes scheduling do here?');

    expect(answer.answered).toBe(false);
    expect(answer.answer).toContain('current graph');
    expect(answer.evidence).toEqual([]);
  });

  it('does not mutate the graph while answering', () => {
    const graph = fixture();
    const before = structuredClone(graph);

    answerGraphQuestion(graph, 'Which concept is most connected?');

    expect(graph).toEqual(before);
  });
});
