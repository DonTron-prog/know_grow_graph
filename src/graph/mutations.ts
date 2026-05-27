import { requireFinitePosition } from './positions';
import { requireValidGraph } from './validation';
import type { ConceptNode, GraphOrigin, GraphPosition, KnowledgeGraph, RelationshipEdge } from './types';

export interface CreateConceptInput {
  label: string;
  type: string;
  notes?: string;
  position?: GraphPosition;
  origin?: GraphOrigin;
}

export interface CreateRelationshipInput {
  source: string;
  target: string;
  label: string;
  notes?: string;
  origin?: GraphOrigin;
}

export interface CreateConceptRelationshipInput {
  existingConceptId: string;
  direction: 'existing-to-new' | 'new-to-existing';
  label: string;
  notes?: string;
}

export interface UpdateConceptInput {
  label?: string;
  type?: string;
  notes?: string;
}

export interface UpdateRelationshipInput {
  label?: string;
  notes?: string;
}

export interface GraphMutationResult {
  graph: KnowledgeGraph;
  changedId: string;
}

function trimmedRequired(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${fieldName} is required.`);
  return trimmed;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

function uniqueId(base: string, usedIds: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function withWorkingMetadata(graph: KnowledgeGraph): KnowledgeGraph {
  return {
    ...graph,
    stateType: 'working',
    updatedAt: new Date().toISOString(),
  };
}

function validateMutation(nextGraph: KnowledgeGraph): KnowledgeGraph {
  return requireValidGraph(nextGraph);
}

function ensureConceptExists(graph: KnowledgeGraph, conceptId: string): ConceptNode {
  const concept = graph.nodes.find((node) => node.id === conceptId);
  if (!concept) throw new Error(`Concept "${conceptId}" is not available.`);
  return concept;
}

function ensureRelationshipExists(graph: KnowledgeGraph, relationshipId: string): RelationshipEdge {
  const relationship = graph.edges.find((edge) => edge.id === relationshipId);
  if (!relationship) throw new Error(`Relationship "${relationshipId}" is not available.`);
  return relationship;
}

function nextConceptPosition(graph: KnowledgeGraph): GraphPosition {
  const positions = graph.layout ? Object.values(graph.layout) : [];
  if (positions.length === 0) return { x: 0, y: 0 };
  const maxX = Math.max(...positions.map((position) => position.x));
  const maxY = Math.max(...positions.map((position) => position.y));
  return { x: maxX + 120, y: maxY + 80 };
}

export function createConcept(graph: KnowledgeGraph, input: CreateConceptInput): GraphMutationResult {
  const label = trimmedRequired(input.label, 'Concept label');
  const type = trimmedRequired(input.type, 'Concept type');
  const usedIds = new Set(graph.nodes.map((node) => node.id));
  const id = uniqueId(slugify(label), usedIds);
  const position = requireFinitePosition(input.position ?? nextConceptPosition(graph), 'Concept position');

  const nextGraph = validateMutation(withWorkingMetadata({
    ...graph,
    nodes: [
      ...graph.nodes,
      { id, label, type, origin: input.origin ?? 'user', notes: optionalTrimmed(input.notes), properties: {} },
    ],
    layout: { ...(graph.layout ?? {}), [id]: position },
  }));

  return { graph: nextGraph, changedId: id };
}

export function createRelationship(graph: KnowledgeGraph, input: CreateRelationshipInput): GraphMutationResult {
  const source = trimmedRequired(input.source, 'Relationship source');
  const target = trimmedRequired(input.target, 'Relationship target');
  const label = trimmedRequired(input.label, 'Relationship label');
  ensureConceptExists(graph, source);
  ensureConceptExists(graph, target);

  const usedIds = new Set(graph.edges.map((edge) => edge.id));
  const id = uniqueId(`edge-${slugify(source)}-${slugify(label)}-${slugify(target)}`, usedIds);

  const nextGraph = validateMutation(withWorkingMetadata({
    ...graph,
    edges: [
      ...graph.edges,
      { id, source, target, label, origin: input.origin ?? 'user', notes: optionalTrimmed(input.notes), properties: {} },
    ],
  }));

  return { graph: nextGraph, changedId: id };
}

export function createConceptWithRelationships(
  graph: KnowledgeGraph,
  conceptInput: CreateConceptInput,
  relationshipInputs: CreateConceptRelationshipInput[],
): GraphMutationResult {
  const label = trimmedRequired(conceptInput.label, 'Concept label');
  const type = trimmedRequired(conceptInput.type, 'Concept type');
  const usedConceptIds = new Set(graph.nodes.map((node) => node.id));
  const conceptId = uniqueId(slugify(label), usedConceptIds);
  const position = requireFinitePosition(conceptInput.position ?? nextConceptPosition(graph), 'Concept position');
  const usedRelationshipIds = new Set(graph.edges.map((edge) => edge.id));

  const relationships = relationshipInputs.map((relationship) => {
    const existingConceptId = trimmedRequired(relationship.existingConceptId, 'Selected concept');
    ensureConceptExists(graph, existingConceptId);
    const relationshipLabel = trimmedRequired(relationship.label, 'Relationship label');
    const source = relationship.direction === 'new-to-existing' ? conceptId : existingConceptId;
    const target = relationship.direction === 'new-to-existing' ? existingConceptId : conceptId;
    const id = uniqueId(`edge-${slugify(source)}-${slugify(relationshipLabel)}-${slugify(target)}`, usedRelationshipIds);
    usedRelationshipIds.add(id);
    return { id, source, target, label: relationshipLabel, origin: 'user' as const, notes: optionalTrimmed(relationship.notes), properties: {} };
  });

  const nextGraph = validateMutation(withWorkingMetadata({
    ...graph,
    nodes: [
      ...graph.nodes,
      { id: conceptId, label, type, origin: 'user', notes: optionalTrimmed(conceptInput.notes), properties: {} },
    ],
    edges: [...graph.edges, ...relationships],
    layout: { ...(graph.layout ?? {}), [conceptId]: position },
  }));

  return { graph: nextGraph, changedId: conceptId };
}

export function updateConcept(graph: KnowledgeGraph, conceptId: string, input: UpdateConceptInput): GraphMutationResult {
  ensureConceptExists(graph, conceptId);
  const nextGraph = validateMutation(withWorkingMetadata({
    ...graph,
    nodes: graph.nodes.map((node) => node.id === conceptId ? {
      ...node,
      label: input.label === undefined ? node.label : trimmedRequired(input.label, 'Concept label'),
      type: input.type === undefined ? node.type : trimmedRequired(input.type, 'Concept type'),
      notes: input.notes === undefined ? node.notes : optionalTrimmed(input.notes),
    } : node),
  }));

  return { graph: nextGraph, changedId: conceptId };
}

export function updateRelationship(graph: KnowledgeGraph, relationshipId: string, input: UpdateRelationshipInput): GraphMutationResult {
  ensureRelationshipExists(graph, relationshipId);
  const nextGraph = validateMutation(withWorkingMetadata({
    ...graph,
    edges: graph.edges.map((edge) => edge.id === relationshipId ? {
      ...edge,
      label: input.label === undefined ? edge.label : trimmedRequired(input.label, 'Relationship label'),
      notes: input.notes === undefined ? edge.notes : optionalTrimmed(input.notes),
    } : edge),
  }));

  return { graph: nextGraph, changedId: relationshipId };
}

export function deleteConcept(graph: KnowledgeGraph, conceptId: string): GraphMutationResult {
  ensureConceptExists(graph, conceptId);
  const nextGraph = validateMutation(withWorkingMetadata({
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== conceptId),
    edges: graph.edges.filter((edge) => edge.source !== conceptId && edge.target !== conceptId),
    layout: graph.layout ? Object.fromEntries(Object.entries(graph.layout).filter(([nodeId]) => nodeId !== conceptId)) : undefined,
  }));

  return { graph: nextGraph, changedId: conceptId };
}

export function deleteRelationship(graph: KnowledgeGraph, relationshipId: string): GraphMutationResult {
  ensureRelationshipExists(graph, relationshipId);
  const nextGraph = validateMutation(withWorkingMetadata({
    ...graph,
    edges: graph.edges.filter((edge) => edge.id !== relationshipId),
  }));

  return { graph: nextGraph, changedId: relationshipId };
}

export function moveConcept(graph: KnowledgeGraph, conceptId: string, position: GraphPosition): GraphMutationResult {
  ensureConceptExists(graph, conceptId);
  const nextGraph = validateMutation(withWorkingMetadata({
    ...graph,
    layout: { ...(graph.layout ?? {}), [conceptId]: requireFinitePosition(position, `Layout position for "${conceptId}"`) },
  }));

  return { graph: nextGraph, changedId: conceptId };
}
