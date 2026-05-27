import { connectedEdges, relationshipCounts } from './metrics';
import type { KnowledgeGraph, RelationshipEdge } from './types';

export interface GraphQuestionAnswer {
  question: string;
  answered: boolean;
  answer: string;
  evidence: string[];
}

interface ScoredConcept {
  id: string;
  label: string;
  score: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'about', 'between', 'can', 'concept', 'concepts', 'current', 'do', 'does', 'explain',
  'for', 'from', 'graph', 'help', 'how', 'i', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'please', 'show', 'tell',
  'the', 'there', 'this', 'to', 'what', 'which', 'who', 'why', 'with', 'work', 'works', 'relationship', 'relationships',
  'related', 'connect', 'connected', 'connection', 'connections', 'link', 'links', 'node', 'nodes', 'edge', 'edges',
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function questionTokens(question: string): string[] {
  return [...new Set(normalize(question).split(/\s+/).filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
}

function conceptSearchText(graph: KnowledgeGraph, conceptId: string): string {
  const concept = graph.nodes.find((node) => node.id === conceptId);
  return normalize([concept?.id, concept?.label, concept?.type, concept?.notes].filter(Boolean).join(' '));
}

function edgeSearchText(graph: KnowledgeGraph, edge: RelationshipEdge): string {
  const source = graph.nodes.find((node) => node.id === edge.source);
  const target = graph.nodes.find((node) => node.id === edge.target);
  return normalize([edge.id, edge.label, edge.notes, source?.label, target?.label, edge.source, edge.target].filter(Boolean).join(' '));
}

function conceptScores(graph: KnowledgeGraph, question: string, tokens: string[]): ScoredConcept[] {
  const normalizedQuestion = normalize(question);

  return graph.nodes
    .map((concept) => {
      const label = normalize(concept.label);
      const id = normalize(concept.id);
      const search = conceptSearchText(graph, concept.id);
      const phraseBoost = normalizedQuestion.includes(label) || normalizedQuestion.includes(id) ? 6 : 0;
      const tokenScore = tokens.reduce((score, token) => score + (search.includes(token) ? 1 : 0), 0);
      return { id: concept.id, label: concept.label, score: phraseBoost + tokenScore };
    })
    .filter((concept) => concept.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function matchingEdges(graph: KnowledgeGraph, tokens: string[]): RelationshipEdge[] {
  if (tokens.length === 0) return [];
  return graph.edges.filter((edge) => tokens.some((token) => edgeSearchText(graph, edge).includes(token)));
}

function relationshipSentence(graph: KnowledgeGraph, edge: RelationshipEdge): string {
  const source = graph.nodes.find((node) => node.id === edge.source)?.label ?? edge.source;
  const target = graph.nodes.find((node) => node.id === edge.target)?.label ?? edge.target;
  return `${source} ${edge.label.replace(/_/g, ' ')} ${target}`;
}

function evidenceForConcept(id: string, label: string): string {
  return `concept:${id} (${label})`;
}

function evidenceForEdge(edge: RelationshipEdge): string {
  return `relationship:${edge.id} (${edge.source} -${edge.label}-> ${edge.target})`;
}

function graphSummary(graph: KnowledgeGraph, question: string): GraphQuestionAnswer {
  const counts = relationshipCounts(graph);
  const mostConnected = [...counts.entries()]
    .map(([id, count]) => ({ concept: graph.nodes.find((node) => node.id === id), count }))
    .filter((entry): entry is { concept: NonNullable<typeof entry.concept>; count: number } => Boolean(entry.concept))
    .sort((a, b) => b.count - a.count || a.concept.label.localeCompare(b.concept.label))
    .slice(0, 3);

  return {
    question,
    answered: true,
    answer: `${graph.name} currently contains ${graph.nodes.length} concepts and ${graph.edges.length} relationships. Most connected concepts: ${mostConnected.map(({ concept, count }) => `${concept.label} (${count})`).join(', ')}.`,
    evidence: ['graph:nodes', 'graph:edges', ...mostConnected.map(({ concept }) => evidenceForConcept(concept.id, concept.label))],
  };
}

function mostConnectedAnswer(graph: KnowledgeGraph, question: string): GraphQuestionAnswer {
  const counts = relationshipCounts(graph);
  const ranked = [...counts.entries()]
    .map(([id, count]) => ({ concept: graph.nodes.find((node) => node.id === id), count }))
    .filter((entry): entry is { concept: NonNullable<typeof entry.concept>; count: number } => Boolean(entry.concept))
    .sort((a, b) => b.count - a.count || a.concept.label.localeCompare(b.concept.label))
    .slice(0, 5);

  return {
    question,
    answered: true,
    answer: `The most connected concepts in the current graph are ${ranked.map(({ concept, count }) => `${concept.label} with ${count} direct relationship${count === 1 ? '' : 's'}`).join('; ')}.`,
    evidence: ranked.map(({ concept }) => evidenceForConcept(concept.id, concept.label)),
  };
}

function conceptAnswer(graph: KnowledgeGraph, question: string, concept: ScoredConcept, matchedEdges: RelationshipEdge[]): GraphQuestionAnswer {
  const node = graph.nodes.find((candidate) => candidate.id === concept.id);
  if (!node) {
    return unanswered(question, 'The matching concept is no longer available in the current graph.');
  }

  const relationships = connectedEdges(graph, node.id);
  const relevantEdges = [...new Map([...matchedEdges, ...relationships].map((edge) => [edge.id, edge])).values()].slice(0, 6);
  const relationshipText = relevantEdges.length > 0
    ? ` Related graph facts: ${relevantEdges.map((edge) => relationshipSentence(graph, edge)).join('; ')}.`
    : ' No direct relationships are available for this concept in the current graph.';

  return {
    question,
    answered: true,
    answer: `${node.label} is a ${node.type}. ${node.notes ?? 'No notes are available for this concept.'}${relationshipText}`,
    evidence: [evidenceForConcept(node.id, node.label), ...relevantEdges.map(evidenceForEdge)],
  };
}

function relationshipAnswer(graph: KnowledgeGraph, question: string, edges: RelationshipEdge[]): GraphQuestionAnswer {
  const visibleEdges = edges.slice(0, 6);
  return {
    question,
    answered: true,
    answer: `I found these relationships in the current graph: ${visibleEdges.map((edge) => relationshipSentence(graph, edge)).join('; ')}.`,
    evidence: visibleEdges.map(evidenceForEdge),
  };
}

function unanswered(question: string, reason = 'I could not find enough matching graph content to answer that from the current graph.'): GraphQuestionAnswer {
  return {
    question,
    answered: false,
    answer: `${reason} Try asking about a visible concept label, relationship, or graph summary.`,
    evidence: [],
  };
}

export function answerGraphQuestion(graph: KnowledgeGraph, question: string): GraphQuestionAnswer {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) return unanswered(question, 'Ask a question about the current graph first.');

  const normalizedQuestion = normalize(trimmedQuestion);
  if (/\b(summary|overview|how many|count|counts)\b/.test(normalizedQuestion)) {
    return graphSummary(graph, trimmedQuestion);
  }
  if (/\b(most connected|highly connected|central|hub|important)\b/.test(normalizedQuestion)) {
    return mostConnectedAnswer(graph, trimmedQuestion);
  }

  const tokens = questionTokens(trimmedQuestion);
  const scoredConcepts = conceptScores(graph, trimmedQuestion, tokens);
  const edges = matchingEdges(graph, tokens);

  if (scoredConcepts.length > 0) {
    return conceptAnswer(graph, trimmedQuestion, scoredConcepts[0], edges);
  }
  if (edges.length > 0) {
    return relationshipAnswer(graph, trimmedQuestion, edges);
  }

  return unanswered(trimmedQuestion);
}
