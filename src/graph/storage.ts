import fixtureGraph from '../../fixtures/source_graph.example.json';
import { requireValidGraph, validateGraph } from './validation';
import type { GraphPosition, GraphValidationResult, KnowledgeGraph } from './types';

export const WORKING_GRAPH_STORAGE_KEY = 'know-grow-graph:workingGraph';

export interface GraphLoadResult {
  graph: KnowledgeGraph;
  source: 'working' | 'fixture';
  validation: GraphValidationResult;
  recoveryMessage?: string;
}

export interface GraphStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const exampleGraph = requireValidGraph(fixtureGraph);

export function loadGraph(storage: GraphStorageLike | undefined = globalThis.localStorage): GraphLoadResult {
  const fallback = validateGraph(fixtureGraph);
  if (!fallback.ok || !fallback.graph) {
    throw new Error('Bundled example graph is invalid.');
  }

  const saved = storage?.getItem(WORKING_GRAPH_STORAGE_KEY);
  if (!saved) {
    return { graph: fallback.graph, source: 'fixture', validation: fallback };
  }

  try {
    const parsed = JSON.parse(saved) as unknown;
    const validation = validateGraph(parsed);
    if (validation.ok && validation.graph) {
      return { graph: validation.graph, source: 'working', validation };
    }

    return {
      graph: fallback.graph,
      source: 'fixture',
      validation,
      recoveryMessage: 'Saved working graph is malformed, so the bundled example graph is still visible.',
    };
  } catch {
    return {
      graph: fallback.graph,
      source: 'fixture',
      validation: { ok: false, errors: [{ severity: 'error', code: 'saved_graph_parse_failed', message: 'Saved working graph could not be parsed.' }], warnings: [] },
      recoveryMessage: 'Saved working graph could not be parsed, so the bundled example graph is still visible.',
    };
  }
}

export function saveLayout(graph: KnowledgeGraph, positions: Record<string, GraphPosition>, storage: GraphStorageLike | undefined = globalThis.localStorage): KnowledgeGraph {
  const nextGraph: KnowledgeGraph = {
    ...graph,
    stateType: 'working',
    layout: Object.fromEntries(graph.nodes.map((node) => [node.id, positions[node.id] ?? graph.layout?.[node.id] ?? { x: 0, y: 0 }])),
    updatedAt: new Date().toISOString(),
  };

  const validation = validateGraph(nextGraph);
  if (!validation.ok || !validation.graph) {
    throw new Error(validation.errors.map((error) => error.message).join(' '));
  }

  storage?.setItem(WORKING_GRAPH_STORAGE_KEY, JSON.stringify(validation.graph, null, 2));
  return validation.graph;
}
