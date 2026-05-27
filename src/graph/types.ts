export type GraphOrigin = 'source' | 'user' | 'imported' | 'agent' | 'unknown';

export type GraphStateType = 'source' | 'working' | 'snapshot';

export interface GraphPosition {
  x: number;
  y: number;
}

export interface ConceptNode {
  id: string;
  label: string;
  type: string;
  origin?: GraphOrigin;
  notes?: string;
  properties?: Record<string, unknown>;
}

export interface RelationshipEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  origin?: GraphOrigin;
  notes?: string;
  properties?: Record<string, unknown>;
}

export interface KnowledgeGraph {
  graphId: string;
  name: string;
  stateType: GraphStateType;
  nodes: ConceptNode[];
  edges: RelationshipEdge[];
  layout?: Record<string, GraphPosition>;
  updatedAt?: string;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
}

export interface GraphValidationResult {
  ok: boolean;
  graph?: KnowledgeGraph;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
