import { useEffect, useMemo, useState } from "react";
import type { GraphEdge, GraphMeta, GraphNode, GraphState, SnapshotMeta } from "@know-grow/shared";
import { ApiClientError, type FrontendApiClient } from "./api.js";

type LoadStatus = "loading" | "ready" | "error";
type PiTab = "chat" | "actions" | "raw";
type Selection =
  | { kind: "none" }
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string };

type AppProps = {
  apiClient: FrontendApiClient;
};

type AppData = {
  sourceMeta: GraphMeta;
  workingGraph: GraphState;
  snapshots: SnapshotMeta[];
};

export function App({ apiClient }: AppProps) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<AppData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [activePiTab, setActivePiTab] = useState<PiTab>("chat");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    async function loadInitialData() {
      try {
        const [sourceMeta, workingGraph, snapshots] = await Promise.all([
          apiClient.fetchSourceMeta(),
          apiClient.fetchWorkingGraph(),
          apiClient.fetchSnapshots()
        ]);

        if (!cancelled) {
          setData({ sourceMeta, workingGraph, snapshots });
          setSelection({ kind: "none" });
          setStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(formatLoadError(error));
          setStatus("error");
        }
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const selectedNode = useMemo(() => {
    if (selection.kind !== "node") {
      return undefined;
    }
    return data?.workingGraph.nodes.find((node) => node.id === selection.id);
  }, [data?.workingGraph.nodes, selection]);

  const selectedEdge = useMemo(() => {
    if (selection.kind !== "edge") {
      return undefined;
    }
    return data?.workingGraph.edges.find((edge) => edge.id === selection.id);
  }, [data?.workingGraph.edges, selection]);

  return (
    <main className="app-shell" aria-label="Snapshot Multi-View Knowledge Graph Workbench">
      <TopToolbar snapshots={data?.snapshots ?? []} />
      <section className="main-grid" aria-label="Workbench regions">
        <InspectorPanel selection={selection} node={selectedNode} edge={selectedEdge} />
        <GraphCanvas graph={data?.workingGraph} status={status} selected={selection} errorMessage={errorMessage} onSelect={setSelection} />
        <PiPanel activeTab={activePiTab} onTabChange={setActivePiTab} status={status} graph={data?.workingGraph} errorMessage={errorMessage} />
      </section>
      <StatusBar
        status={status}
        graph={data?.workingGraph}
        sourceMeta={data?.sourceMeta}
        snapshots={data?.snapshots ?? []}
        selection={selection}
        errorMessage={errorMessage}
      />
    </main>
  );
}

function TopToolbar({ snapshots }: { snapshots: SnapshotMeta[] }) {
  const controls = ["Undo", "Redo", "Add Node", "Add Edge", "Merge Selected", "Split Selected", "Delete Selected", "Save Snapshot"];

  return (
    <header className="top-toolbar" aria-label="Top toolbar">
      <div className="brand">Know Grow Graph</div>
      <nav className="toolbar-actions" aria-label="Graph actions">
        {controls.map((label) => (
          <button key={label} type="button" disabled title="Mutation controls land after the read-only vertical slice">
            {label}
          </button>
        ))}
        <label className="snapshot-picker">
          Snapshot
          <select disabled defaultValue="" title="Snapshot loading actions land after the read-only vertical slice">
            <option value="">Current working graph</option>
            {snapshots.map((snapshot) => (
              <option key={snapshot.snapshotId} value={snapshot.snapshotId}>
                {snapshot.name}
              </option>
            ))}
          </select>
        </label>
      </nav>
    </header>
  );
}

function InspectorPanel({ selection, node, edge }: { selection: Selection; node?: GraphNode; edge?: GraphEdge }) {
  return (
    <aside className="panel inspector-panel" aria-label="Inspector panel">
      <h2>Inspector</h2>
      {selection.kind === "none" ? (
        <EmptyState title="No selection" body="Select a node or edge in the graph to inspect it." />
      ) : null}
      {selection.kind === "node" && !node ? <EmptyState title="Invalid selection" body={`Node '${selection.id}' is no longer present.`} /> : null}
      {selection.kind === "edge" && !edge ? <EmptyState title="Invalid selection" body={`Edge '${selection.id}' is no longer present.`} /> : null}
      {node ? (
        <dl className="details-list">
          <dt>Node</dt>
          <dd>{node.label}</dd>
          <dt>ID</dt>
          <dd>{node.id}</dd>
          <dt>Type</dt>
          <dd>{node.type}</dd>
          <dt>Origin</dt>
          <dd>{node.origin}</dd>
          <dt>Notes</dt>
          <dd>{node.notes || "—"}</dd>
        </dl>
      ) : null}
      {edge ? (
        <dl className="details-list">
          <dt>Edge</dt>
          <dd>{edge.label || "Unlabeled edge"}</dd>
          <dt>ID</dt>
          <dd>{edge.id}</dd>
          <dt>Source → Target</dt>
          <dd>
            {edge.source} → {edge.target}
          </dd>
          <dt>Origin</dt>
          <dd>{edge.origin}</dd>
          <dt>Notes</dt>
          <dd>{edge.notes || "—"}</dd>
        </dl>
      ) : null}
    </aside>
  );
}

function GraphCanvas({
  graph,
  status,
  selected,
  errorMessage,
  onSelect
}: {
  graph?: GraphState;
  status: LoadStatus;
  selected: Selection;
  errorMessage: string | null;
  onSelect: (selection: Selection) => void;
}) {
  const layout = useMemo(() => (graph ? calculateLayout(graph) : null), [graph]);

  return (
    <section className="graph-canvas" aria-label="Graph canvas" onClick={() => onSelect({ kind: "none" })}>
      <div className="graph-canvas-header">
        <h1>{graph?.name ?? "Working graph"}</h1>
        {graph ? <span>{graph.nodes.length} nodes · {graph.edges.length} edges</span> : null}
      </div>
      {status === "loading" ? <EmptyState title="Loading graph" body="Fetching source metadata, working graph, and snapshots from the backend." /> : null}
      {status === "error" ? <EmptyState title="Could not load graph" body={errorMessage ?? "Unknown loading error."} /> : null}
      {graph && layout ? (
        <svg className="graph-svg" viewBox="0 0 920 620" role="img" aria-label={`Graph '${graph.name}' with ${graph.nodes.length} nodes and ${graph.edges.length} edges`}>
          <g className="edge-layer">
            {graph.edges.map((edge) => {
              const source = layout.positions.get(edge.source);
              const target = layout.positions.get(edge.target);
              if (!source || !target) {
                return null;
              }
              const isSelected = selected.kind === "edge" && selected.id === edge.id;
              const labelX = (source.x + target.x) / 2;
              const labelY = (source.y + target.y) / 2;
              return (
                <g key={edge.id} className={isSelected ? "edge selected" : "edge"} onClick={(event) => { event.stopPropagation(); onSelect({ kind: "edge", id: edge.id }); }}>
                  <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
                  <text x={labelX} y={labelY}>{edge.label}</text>
                </g>
              );
            })}
          </g>
          <g className="node-layer">
            {graph.nodes.map((node) => {
              const position = layout.positions.get(node.id);
              if (!position) {
                return null;
              }
              const isSelected = selected.kind === "node" && selected.id === node.id;
              return (
                <g
                  key={node.id}
                  className={`node origin-${node.origin}${isSelected ? " selected" : ""}`}
                  transform={`translate(${position.x} ${position.y})`}
                  onClick={(event) => { event.stopPropagation(); onSelect({ kind: "node", id: node.id }); }}
                >
                  <circle r="34" />
                  <text>{node.label}</text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : null}
    </section>
  );
}

function PiPanel({
  activeTab,
  onTabChange,
  status,
  graph,
  errorMessage
}: {
  activeTab: PiTab;
  onTabChange: (tab: PiTab) => void;
  status: LoadStatus;
  graph?: GraphState;
  errorMessage: string | null;
}) {
  return (
    <aside className="panel pi-panel" aria-label="Pi panel">
      <h2>Pi Panel</h2>
      <div className="tab-list" role="tablist" aria-label="Pi panel tabs">
        {(["chat", "actions", "raw"] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}>
            {tab === "chat" ? "Chat" : tab === "actions" ? "Actions" : "Raw"}
          </button>
        ))}
      </div>
      {activeTab === "chat" ? (
        <div className="tab-panel">
          <EmptyState title="Pi chat not connected yet" body="The read-only slice loads graph context first; patch/direct JSON workflows will connect here next." />
          <textarea disabled placeholder="Ask Pi to transform the graph…" />
          <button type="button" disabled>Send to Pi</button>
        </div>
      ) : null}
      {activeTab === "actions" ? (
        <div className="tab-panel">
          <EmptyState title="No proposed actions" body="Patch summaries and validation warnings will appear here after Pi or toolbar mutations are implemented." />
        </div>
      ) : null}
      {activeTab === "raw" ? (
        <pre className="raw-output">{JSON.stringify({ status, graphId: graph?.graphId, nodeCount: graph?.nodes.length ?? 0, edgeCount: graph?.edges.length ?? 0, error: errorMessage }, null, 2)}</pre>
      ) : null}
    </aside>
  );
}

function StatusBar({
  status,
  graph,
  sourceMeta,
  snapshots,
  selection,
  errorMessage
}: {
  status: LoadStatus;
  graph?: GraphState;
  sourceMeta?: GraphMeta;
  snapshots: SnapshotMeta[];
  selection: Selection;
  errorMessage: string | null;
}) {
  const selectionLabel = selection.kind === "none" ? "0 selected" : `1 selected (${selection.kind}: ${selection.id})`;
  const activeGraphState = graph?.stateType ?? sourceMeta?.stateType ?? "unknown";

  return (
    <footer className="status-bar" aria-label="Status bar">
      <span>Status: {status}</span>
      <span>Graph: {activeGraphState}</span>
      <span>Nodes: {graph?.nodes.length ?? sourceMeta?.nodeCount ?? 0}</span>
      <span>Edges: {graph?.edges.length ?? sourceMeta?.edgeCount ?? 0}</span>
      <span>{selectionLabel}</span>
      <span>Snapshots: {snapshots.length}</span>
      <span>Unsaved changes: no</span>
      <span>Pi: idle</span>
      {errorMessage ? <span className="status-error">{errorMessage}</span> : null}
    </footer>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function formatLoadError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code ?? "backend_error"}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Unknown loading error.";
}

type CanvasPosition = { x: number; y: number };

function calculateLayout(graph: GraphState): { positions: Map<string, CanvasPosition> } {
  const positions = new Map<string, CanvasPosition>();
  const sourcePositions = graph.layout ?? {};
  const sourceValues = graph.nodes.map((node) => sourcePositions[node.id]).filter((position): position is CanvasPosition => Boolean(position));

  if (sourceValues.length > 0) {
    const minX = Math.min(...sourceValues.map((position) => position.x));
    const maxX = Math.max(...sourceValues.map((position) => position.x));
    const minY = Math.min(...sourceValues.map((position) => position.y));
    const maxY = Math.max(...sourceValues.map((position) => position.y));
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    graph.nodes.forEach((node, index) => {
      const position = sourcePositions[node.id];
      if (position) {
        positions.set(node.id, {
          x: 80 + ((position.x - minX) / width) * 760,
          y: 80 + ((position.y - minY) / height) * 460
        });
        return;
      }

      positions.set(node.id, fallbackPosition(index, graph.nodes.length));
    });
  } else {
    graph.nodes.forEach((node, index) => {
      positions.set(node.id, fallbackPosition(index, graph.nodes.length));
    });
  }

  return { positions };
}

function fallbackPosition(index: number, total: number): CanvasPosition {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  return {
    x: 460 + Math.cos(angle) * 260,
    y: 310 + Math.sin(angle) * 210
  };
}
