import type { KnowledgeGraph } from './types';

const MAX_HISTORY_ENTRIES = 50;

export interface GraphHistory {
  undoStack: KnowledgeGraph[];
  redoStack: KnowledgeGraph[];
}

export interface GraphHistoryStep {
  graph: KnowledgeGraph;
  history: GraphHistory;
}

function cloneGraph(graph: KnowledgeGraph): KnowledgeGraph {
  return structuredClone(graph) as KnowledgeGraph;
}

function trimStack(stack: KnowledgeGraph[]): KnowledgeGraph[] {
  return stack.slice(Math.max(0, stack.length - MAX_HISTORY_ENTRIES));
}

export function emptyGraphHistory(): GraphHistory {
  return { undoStack: [], redoStack: [] };
}

export function canUndo(history: GraphHistory): boolean {
  return history.undoStack.length > 0;
}

export function canRedo(history: GraphHistory): boolean {
  return history.redoStack.length > 0;
}

export function rememberGraph(history: GraphHistory, currentGraph: KnowledgeGraph): GraphHistory {
  return {
    undoStack: trimStack([...history.undoStack, cloneGraph(currentGraph)]),
    redoStack: [],
  };
}

export function undoGraph(history: GraphHistory, currentGraph: KnowledgeGraph): GraphHistoryStep | undefined {
  const previousGraph = history.undoStack.at(-1);
  if (!previousGraph) return undefined;

  return {
    graph: cloneGraph(previousGraph),
    history: {
      undoStack: history.undoStack.slice(0, -1),
      redoStack: trimStack([...history.redoStack, cloneGraph(currentGraph)]),
    },
  };
}

export function redoGraph(history: GraphHistory, currentGraph: KnowledgeGraph): GraphHistoryStep | undefined {
  const nextGraph = history.redoStack.at(-1);
  if (!nextGraph) return undefined;

  return {
    graph: cloneGraph(nextGraph),
    history: {
      undoStack: trimStack([...history.undoStack, cloneGraph(currentGraph)]),
      redoStack: history.redoStack.slice(0, -1),
    },
  };
}
