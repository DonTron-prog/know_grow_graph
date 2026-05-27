import type {
  ConceptNode,
  GraphOrigin,
  GraphPosition,
  GraphStateType,
  GraphValidationResult,
  KnowledgeGraph,
  RelationshipEdge,
  ValidationIssue,
} from './types';

const GRAPH_ORIGINS = new Set<GraphOrigin>(['source', 'user', 'imported', 'agent', 'unknown']);
const GRAPH_STATE_TYPES = new Set<GraphStateType>(['source', 'working', 'snapshot']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function issue(severity: ValidationIssue['severity'], code: string, message: string, path?: string): ValidationIssue {
  return { severity, code, message, path };
}

function optionalOrigin(value: unknown, path: string, warnings: ValidationIssue[]): GraphOrigin | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && GRAPH_ORIGINS.has(value as GraphOrigin)) return value as GraphOrigin;
  warnings.push(issue('warning', 'unknown_origin', `Unknown origin at ${path}; rendering it as unknown.`, path));
  return 'unknown';
}

function optionalNotes(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalProperties(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function validateNodes(value: unknown, errors: ValidationIssue[], warnings: ValidationIssue[]): ConceptNode[] {
  if (!Array.isArray(value)) {
    errors.push(issue('error', 'nodes_not_array', 'Graph nodes must be an array.', 'nodes'));
    return [];
  }

  const seen = new Set<string>();
  return value.flatMap((node, index) => {
    const path = `nodes[${index}]`;
    if (!isRecord(node)) {
      errors.push(issue('error', 'node_not_object', `Concept at ${path} must be an object.`, path));
      return [];
    }

    const id = node.id;
    const label = node.label;
    const type = node.type;

    if (!isNonEmptyString(id)) errors.push(issue('error', 'node_id_missing', `Concept at ${path} needs a stable id.`, `${path}.id`));
    if (!isNonEmptyString(label)) errors.push(issue('error', 'node_label_missing', `Concept at ${path} needs a readable label.`, `${path}.label`));
    if (!isNonEmptyString(type)) errors.push(issue('error', 'node_type_missing', `Concept at ${path} needs a type.`, `${path}.type`));

    if (!isNonEmptyString(id) || !isNonEmptyString(label) || !isNonEmptyString(type)) return [];

    if (seen.has(id)) {
      errors.push(issue('error', 'duplicate_node_id', `Duplicate concept id "${id}" is not allowed.`, `${path}.id`));
      return [];
    }
    seen.add(id);

    return [{
      id,
      label,
      type,
      origin: optionalOrigin(node.origin, `${path}.origin`, warnings),
      notes: optionalNotes(node.notes),
      properties: optionalProperties(node.properties),
    }];
  });
}

function validateEdges(value: unknown, errors: ValidationIssue[], warnings: ValidationIssue[]): RelationshipEdge[] {
  if (!Array.isArray(value)) {
    errors.push(issue('error', 'edges_not_array', 'Graph edges must be an array.', 'edges'));
    return [];
  }

  const seen = new Set<string>();
  return value.flatMap((edge, index) => {
    const path = `edges[${index}]`;
    if (!isRecord(edge)) {
      errors.push(issue('error', 'edge_not_object', `Relationship at ${path} must be an object.`, path));
      return [];
    }

    const id = edge.id;
    const source = edge.source;
    const target = edge.target;
    const label = edge.label;

    if (!isNonEmptyString(id)) errors.push(issue('error', 'edge_id_missing', `Relationship at ${path} needs a stable id.`, `${path}.id`));
    if (!isNonEmptyString(source)) errors.push(issue('error', 'edge_source_missing', `Relationship at ${path} needs a source concept.`, `${path}.source`));
    if (!isNonEmptyString(target)) errors.push(issue('error', 'edge_target_missing', `Relationship at ${path} needs a target concept.`, `${path}.target`));
    if (!isNonEmptyString(label)) errors.push(issue('error', 'edge_label_missing', `Relationship at ${path} needs a readable label.`, `${path}.label`));

    if (!isNonEmptyString(id) || !isNonEmptyString(source) || !isNonEmptyString(target) || !isNonEmptyString(label)) return [];

    if (seen.has(id)) {
      errors.push(issue('error', 'duplicate_edge_id', `Duplicate relationship id "${id}" is not allowed.`, `${path}.id`));
      return [];
    }
    seen.add(id);

    return [{
      id,
      source,
      target,
      label,
      origin: optionalOrigin(edge.origin, `${path}.origin`, warnings),
      notes: optionalNotes(edge.notes),
      properties: optionalProperties(edge.properties),
    }];
  });
}

function validateLayout(value: unknown, nodes: ConceptNode[], warnings: ValidationIssue[]): Record<string, GraphPosition> | undefined {
  if (value === undefined) {
    warnings.push(issue('warning', 'layout_missing', 'Graph has no saved positions; a fallback layout will be used.', 'layout'));
    return undefined;
  }
  if (!isRecord(value)) {
    warnings.push(issue('warning', 'layout_invalid', 'Graph layout is malformed; a fallback layout will be used.', 'layout'));
    return undefined;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const layout: Record<string, GraphPosition> = {};

  for (const [nodeId, position] of Object.entries(value)) {
    const path = `layout.${nodeId}`;
    if (!nodeIds.has(nodeId)) {
      warnings.push(issue('warning', 'layout_unknown_node', `Layout position for unavailable concept "${nodeId}" will be ignored.`, path));
      continue;
    }
    if (!isRecord(position) || typeof position.x !== 'number' || typeof position.y !== 'number' || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      warnings.push(issue('warning', 'layout_position_invalid', `Layout position for "${nodeId}" is invalid and will be ignored.`, path));
      continue;
    }
    layout[nodeId] = { x: position.x, y: position.y };
  }

  const missing = nodes.filter((node) => layout[node.id] === undefined);
  for (const node of missing) {
    warnings.push(issue('warning', 'layout_position_missing', `Concept "${node.label}" has no saved position; a fallback position may be used.`, `layout.${node.id}`));
  }

  return Object.keys(layout).length > 0 ? layout : undefined;
}

export function validateGraph(input: unknown): GraphValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isRecord(input)) {
    errors.push(issue('error', 'graph_not_object', 'Graph data must be an object.'));
    return { ok: false, errors, warnings };
  }

  const graphId = input.graphId;
  const name = input.name;
  const stateType = input.stateType;

  if (!isNonEmptyString(graphId)) errors.push(issue('error', 'graph_id_missing', 'Graph needs a stable id.', 'graphId'));
  if (!isNonEmptyString(name)) errors.push(issue('error', 'graph_name_missing', 'Graph needs a readable name.', 'name'));
  if (!(typeof stateType === 'string' && GRAPH_STATE_TYPES.has(stateType as GraphStateType))) {
    errors.push(issue('error', 'graph_state_invalid', 'Graph stateType must be source, working, or snapshot.', 'stateType'));
  }

  const nodes = validateNodes(input.nodes, errors, warnings);
  const edges = validateEdges(input.edges, errors, warnings);
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const [index, edge] of edges.entries()) {
    if (!nodeIds.has(edge.source)) {
      errors.push(issue('error', 'edge_source_missing_node', `Relationship "${edge.id}" points to missing source concept "${edge.source}".`, `edges[${index}].source`));
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(issue('error', 'edge_target_missing_node', `Relationship "${edge.id}" points to missing target concept "${edge.target}".`, `edges[${index}].target`));
    }
  }

  const layout = validateLayout(input.layout, nodes, warnings);

  if (errors.length > 0 || !isNonEmptyString(graphId) || !isNonEmptyString(name) || !(typeof stateType === 'string' && GRAPH_STATE_TYPES.has(stateType as GraphStateType))) {
    return { ok: false, errors, warnings };
  }

  const graph: KnowledgeGraph = {
    graphId,
    name,
    stateType: stateType as GraphStateType,
    nodes,
    edges,
    layout,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : undefined,
  };

  return { ok: true, graph, errors, warnings };
}

export function requireValidGraph(input: unknown): KnowledgeGraph {
  const result = validateGraph(input);
  if (!result.ok || !result.graph) {
    throw new Error(result.errors.map((error) => error.message).join(' '));
  }
  return result.graph;
}
