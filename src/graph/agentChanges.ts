import { createConcept, createRelationship, deleteConcept, deleteRelationship, updateConcept, updateRelationship } from './mutations';
import { requireValidGraph } from './validation';
import type { KnowledgeGraph } from './types';

export type AgentGraphChangeOperation =
  | { kind: 'create-concept'; label: string; type?: string; notes?: string }
  | { kind: 'create-relationship'; source: string; target: string; label: string; notes?: string }
  | { kind: 'update-concept'; conceptId: string; label?: string; type?: string; notes?: string }
  | { kind: 'update-relationship'; relationshipId: string; label?: string; notes?: string }
  | { kind: 'delete-concept'; conceptId: string }
  | { kind: 'delete-relationship'; relationshipId: string };

export interface AgentGraphChangeProposal {
  request: string;
  summary: string;
  operations: AgentGraphChangeOperation[];
}

export interface AgentGraphChangeApplication {
  graph: KnowledgeGraph;
  changedId?: string;
  changedKind?: 'concept' | 'relationship';
  summary: string;
  operationSummaries: string[];
}

type ConceptReference = { id: string; label: string };

function trimmedRequired(value: string, fieldName: string): string {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!trimmed) throw new Error(`${fieldName} is required.`);
  return trimmed;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalize(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '').trim().toLowerCase();
}

function findConcept(graph: KnowledgeGraph, reference: string): ConceptReference {
  const normalized = normalize(reference);
  const concept = graph.nodes.find((node) => node.id.toLowerCase() === normalized || node.label.toLowerCase() === normalized);
  if (!concept) throw new Error(`Concept "${reference.trim()}" is not available for the proposed change.`);
  return { id: concept.id, label: concept.label };
}

function parseCreateConcept(request: string): AgentGraphChangeProposal | undefined {
  const match = request.match(/^add\s+concept\s+(.+)$/i);
  if (!match) return undefined;

  let remainder = match[1].trim();
  let notes: string | undefined;
  const notesMatch = remainder.match(/\s+notes?\s+(.+)$/i);
  if (notesMatch?.index !== undefined) {
    notes = optionalTrimmed(notesMatch[1]);
    remainder = remainder.slice(0, notesMatch.index).trim();
  }

  let type = 'concept';
  const typeMatch = remainder.match(/\s+type\s+(.+)$/i);
  if (typeMatch?.index !== undefined) {
    type = trimmedRequired(typeMatch[1], 'Concept type');
    remainder = remainder.slice(0, typeMatch.index).trim();
  }

  const label = trimmedRequired(remainder, 'Concept label');
  const operation: AgentGraphChangeOperation = { kind: 'create-concept', label, type, notes };
  return {
    request,
    summary: `Add concept "${label}" as type "${type}".`,
    operations: [operation],
  };
}

function parseCreateRelationship(graph: KnowledgeGraph, request: string): AgentGraphChangeProposal | undefined {
  const match = request.match(/^connect\s+(.+?)\s+to\s+(.+?)\s+(?:as|labeled|with\s+label)\s+(.+)$/i);
  if (!match) return undefined;

  const source = findConcept(graph, match[1]);
  const target = findConcept(graph, match[2]);
  const label = trimmedRequired(match[3], 'Relationship label');
  const operation: AgentGraphChangeOperation = { kind: 'create-relationship', source: source.id, target: target.id, label };
  return {
    request,
    summary: `Connect "${source.label}" to "${target.label}" with relationship "${label}".`,
    operations: [operation],
  };
}

function parseRenameConcept(graph: KnowledgeGraph, request: string): AgentGraphChangeProposal | undefined {
  const match = request.match(/^rename\s+concept\s+(.+?)\s+to\s+(.+)$/i);
  if (!match) return undefined;

  const concept = findConcept(graph, match[1]);
  const label = trimmedRequired(match[2], 'Concept label');
  const operation: AgentGraphChangeOperation = { kind: 'update-concept', conceptId: concept.id, label };
  return {
    request,
    summary: `Rename concept "${concept.label}" to "${label}".`,
    operations: [operation],
  };
}

export function createAgentGraphChangeProposal(graph: KnowledgeGraph, request: string): AgentGraphChangeProposal {
  const cleanRequest = trimmedRequired(request, 'Agent change request');
  const proposal = parseCreateConcept(cleanRequest)
    ?? parseCreateRelationship(graph, cleanRequest)
    ?? parseRenameConcept(graph, cleanRequest);

  if (!proposal) {
    throw new Error('Could not propose a graph change from that request. Try "Add concept Review Lens type method", "Connect Prompting to Evaluation as validates", or "Rename concept Prompting to Prompt Design".');
  }

  return proposal;
}

export function describeAgentOperation(operation: AgentGraphChangeOperation): string {
  switch (operation.kind) {
    case 'create-concept':
      return `Add concept "${operation.label}" with type "${operation.type ?? 'concept'}".`;
    case 'create-relationship':
      return `Add relationship "${operation.label}" from ${operation.source} to ${operation.target}.`;
    case 'update-concept':
      return `Update concept ${operation.conceptId}${operation.label ? ` label to "${operation.label}"` : ''}${operation.type ? ` type to "${operation.type}"` : ''}${operation.notes !== undefined ? ' notes' : ''}.`;
    case 'update-relationship':
      return `Update relationship ${operation.relationshipId}${operation.label ? ` label to "${operation.label}"` : ''}${operation.notes !== undefined ? ' notes' : ''}.`;
    case 'delete-concept':
      return `Delete concept ${operation.conceptId} and its connected relationships.`;
    case 'delete-relationship':
      return `Delete relationship ${operation.relationshipId}.`;
  }
}

export function applyAgentGraphChangeProposal(graph: KnowledgeGraph, proposal: AgentGraphChangeProposal): AgentGraphChangeApplication {
  if (proposal.operations.length === 0) throw new Error('Agent proposal has no graph changes to apply.');

  let nextGraph = graph;
  let changedId: string | undefined;
  let changedKind: 'concept' | 'relationship' | undefined;
  const operationSummaries: string[] = [];

  for (const operation of proposal.operations) {
    switch (operation.kind) {
      case 'create-concept': {
        const result = createConcept(nextGraph, { label: operation.label, type: operation.type ?? 'concept', notes: operation.notes, origin: 'agent' });
        nextGraph = result.graph;
        changedId = result.changedId;
        changedKind = 'concept';
        break;
      }
      case 'create-relationship': {
        const result = createRelationship(nextGraph, { source: operation.source, target: operation.target, label: operation.label, notes: operation.notes, origin: 'agent' });
        nextGraph = result.graph;
        changedId = result.changedId;
        changedKind = 'relationship';
        break;
      }
      case 'update-concept': {
        const result = updateConcept(nextGraph, operation.conceptId, { label: operation.label, type: operation.type, notes: operation.notes });
        nextGraph = result.graph;
        changedId = result.changedId;
        changedKind = 'concept';
        break;
      }
      case 'update-relationship': {
        const result = updateRelationship(nextGraph, operation.relationshipId, { label: operation.label, notes: operation.notes });
        nextGraph = result.graph;
        changedId = result.changedId;
        changedKind = 'relationship';
        break;
      }
      case 'delete-concept': {
        const result = deleteConcept(nextGraph, operation.conceptId);
        nextGraph = result.graph;
        changedId = result.changedId;
        changedKind = undefined;
        break;
      }
      case 'delete-relationship': {
        const result = deleteRelationship(nextGraph, operation.relationshipId);
        nextGraph = result.graph;
        changedId = result.changedId;
        changedKind = undefined;
        break;
      }
    }
    operationSummaries.push(describeAgentOperation(operation));
  }

  nextGraph = requireValidGraph(nextGraph);
  const summary = `Applied ${proposal.operations.length} agent-proposed graph change${proposal.operations.length === 1 ? '' : 's'}. ${operationSummaries.join(' ')}`;
  return { graph: nextGraph, changedId, changedKind, summary, operationSummaries };
}
