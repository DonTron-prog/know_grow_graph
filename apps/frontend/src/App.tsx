import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { GraphEdge, GraphMeta, GraphNode, GraphState, SnapshotMeta } from "@know-grow/shared";
import { ApiClientError, type FrontendApiClient } from "./api.js";
import {
  calculateLayout,
  clampZoom,
  EMPTY_SELECTION,
  isSelected,
  selectElement,
  selectionCount,
  selectionLabel,
  type CanvasPosition,
  type ElementSelection
} from "./graphInteraction.js";

type LoadStatus = "loading" | "ready" | "error";
type PiTab = "chat" | "actions" | "raw";

type AppProps = {
  apiClient: FrontendApiClient;
};

type AppData = {
  sourceMeta: GraphMeta;
  workingGraph: GraphState;
  snapshots: SnapshotMeta[];
};

type Viewport = { x: number; y: number; scale: number };
type CanvasInteraction =
  | { type: "pan"; pointerId: number; startClient: CanvasPosition; startViewport: Viewport }
  | { type: "drag-node"; pointerId: number; nodeId: string; pointerOffset: CanvasPosition };

const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 620;

export function App({ apiClient }: AppProps) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<AppData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<ElementSelection>(EMPTY_SELECTION);
  const [changedElementIds, setChangedElementIds] = useState<string[]>([]);
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
          setSelection(EMPTY_SELECTION);
          setChangedElementIds([]);
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

  const selectedNodes = useMemo(() => {
    const nodes = data?.workingGraph.nodes ?? [];
    return selection.nodeIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is GraphNode => Boolean(node));
  }, [data?.workingGraph.nodes, selection.nodeIds]);

  const selectedEdges = useMemo(() => {
    const edges = data?.workingGraph.edges ?? [];
    return selection.edgeIds.map((id) => edges.find((edge) => edge.id === id)).filter((edge): edge is GraphEdge => Boolean(edge));
  }, [data?.workingGraph.edges, selection.edgeIds]);

  return (
    <main className="app-shell" aria-label="Snapshot Multi-View Knowledge Graph Workbench">
      <TopToolbar snapshots={data?.snapshots ?? []} selection={selection} />
      <section className="main-grid" aria-label="Workbench regions">
        <InspectorPanel selection={selection} graph={data?.workingGraph} nodes={selectedNodes} edges={selectedEdges} />
        <GraphCanvas graph={data?.workingGraph} status={status} selected={selection} changedElementIds={changedElementIds} errorMessage={errorMessage} onSelect={setSelection} />
        <PiPanel activeTab={activePiTab} onTabChange={setActivePiTab} status={status} graph={data?.workingGraph} selection={selection} changedElementIds={changedElementIds} errorMessage={errorMessage} />
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

function TopToolbar({ snapshots, selection }: { snapshots: SnapshotMeta[]; selection: ElementSelection }) {
  const hasSelection = selectionCount(selection) > 0;
  const canAddEdge = selection.nodeIds.length >= 1 && selection.nodeIds.length <= 2;
  const canMerge = selection.nodeIds.length >= 2;
  const canSplit = selection.nodeIds.length === 1 && selection.edgeIds.length === 0;
  const controls = [
    { label: "Undo", title: "Undo lands with frontend-owned mutation history." },
    { label: "Redo", title: "Redo lands with frontend-owned mutation history." },
    { label: "Add Node", title: "Mutation controls land after graph interaction." },
    { label: "Add Edge", title: canAddEdge ? "Add-edge form lands with toolbar patch operations." : "Select one or two nodes to add an edge." },
    { label: "Merge Selected", title: canMerge ? "Merge confirmation lands with toolbar patch operations." : "Select two or more nodes to merge." },
    { label: "Split Selected", title: canSplit ? "Split form lands with toolbar patch operations." : "Select exactly one node to split." },
    { label: "Delete Selected", title: hasSelection ? "Delete confirmation lands with toolbar patch operations." : "Select a node or edge to delete." },
    { label: "Save Snapshot", title: "Snapshot saving lands with frontend mutation flows." }
  ];

  return (
    <header className="top-toolbar" aria-label="Top toolbar">
      <div className="brand">Know Grow Graph</div>
      <nav className="toolbar-actions" aria-label="Graph actions">
        {controls.map((control) => (
          <button key={control.label} type="button" disabled title={control.title}>
            {control.label}
          </button>
        ))}
        <label className="snapshot-picker">
          Snapshot
          <select disabled defaultValue="" title="Snapshot loading actions land after the interaction slice">
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

function InspectorPanel({
  selection,
  graph,
  nodes,
  edges
}: {
  selection: ElementSelection;
  graph?: GraphState;
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const selectedCount = selectionCount(selection);
  const missingNodeIds = selection.nodeIds.filter((id) => !nodes.some((node) => node.id === id));
  const missingEdgeIds = selection.edgeIds.filter((id) => !edges.some((edge) => edge.id === id));

  return (
    <aside className="panel inspector-panel" aria-label="Inspector panel">
      <h2>Inspector</h2>
      {selectedCount === 0 ? <GraphSummary graph={graph} /> : null}
      {missingNodeIds.length > 0 || missingEdgeIds.length > 0 ? (
        <EmptyState title="Invalid or deleted selection" body={`Missing ${[...missingNodeIds, ...missingEdgeIds].join(", ")}.`} />
      ) : null}
      {selectedCount === 1 && nodes.length === 1 ? <NodeDetails node={nodes[0]} graph={graph} /> : null}
      {selectedCount === 1 && edges.length === 1 ? <EdgeDetails edge={edges[0]} graph={graph} /> : null}
      {selectedCount > 1 ? <MultiSelectionDetails selection={selection} nodes={nodes} edges={edges} /> : null}
    </aside>
  );
}

function GraphSummary({ graph }: { graph?: GraphState }) {
  return graph ? (
    <dl className="details-list">
      <dt>Graph</dt>
      <dd>{graph.name}</dd>
      <dt>State</dt>
      <dd>{graph.stateType}</dd>
      <dt>Nodes</dt>
      <dd>{graph.nodes.length}</dd>
      <dt>Edges</dt>
      <dd>{graph.edges.length}</dd>
      <dt>Active snapshot</dt>
      <dd>{graph.stateType === "snapshot" ? graph.name : "Current working graph"}</dd>
      <dt>Unsaved changes</dt>
      <dd>No</dd>
    </dl>
  ) : (
    <EmptyState title="No graph loaded" body="The inspector will show graph details after the working graph loads." />
  );
}

function NodeDetails({ node, graph }: { node: GraphNode; graph?: GraphState }) {
  const connectedEdges = graph?.edges.filter((edge) => edge.source === node.id || edge.target === node.id) ?? [];
  return (
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
      <dt>Source refs</dt>
      <dd>{node.sourceNodeIds?.join(", ") || "—"}</dd>
      <dt>Connected edges</dt>
      <dd>{connectedEdges.length > 0 ? connectedEdges.map((edge) => edge.label || edge.id).join(", ") : "—"}</dd>
    </dl>
  );
}

function EdgeDetails({ edge, graph }: { edge: GraphEdge; graph?: GraphState }) {
  const source = graph?.nodes.find((node) => node.id === edge.source);
  const target = graph?.nodes.find((node) => node.id === edge.target);
  return (
    <dl className="details-list">
      <dt>Edge</dt>
      <dd>{edge.label || "Unlabeled edge"}</dd>
      <dt>ID</dt>
      <dd>{edge.id}</dd>
      <dt>Source → Target</dt>
      <dd>
        {source?.label ?? edge.source} → {target?.label ?? edge.target}
      </dd>
      <dt>Origin</dt>
      <dd>{edge.origin}</dd>
      <dt>Notes</dt>
      <dd>{edge.notes || "—"}</dd>
      <dt>Source refs</dt>
      <dd>{edge.sourceEdgeIds?.join(", ") || "—"}</dd>
    </dl>
  );
}

function MultiSelectionDetails({ selection, nodes, edges }: { selection: ElementSelection; nodes: GraphNode[]; edges: GraphEdge[] }) {
  return (
    <dl className="details-list">
      <dt>Selected</dt>
      <dd>{selectionLabel(selection)}</dd>
      <dt>Nodes</dt>
      <dd>{nodes.length > 0 ? nodes.map((node) => node.label).join(", ") : "—"}</dd>
      <dt>Edges</dt>
      <dd>{edges.length > 0 ? edges.map((edge) => edge.label || edge.id).join(", ") : "—"}</dd>
      <dt>Merge eligibility</dt>
      <dd>{selection.nodeIds.length >= 2 ? "Eligible" : "Select at least two nodes"}</dd>
      <dt>Delete eligibility</dt>
      <dd>{selectionCount(selection) > 0 ? "Eligible" : "No selection"}</dd>
    </dl>
  );
}

function GraphCanvas({
  graph,
  status,
  selected,
  changedElementIds,
  errorMessage,
  onSelect
}: {
  graph?: GraphState;
  status: LoadStatus;
  selected: ElementSelection;
  changedElementIds: string[];
  errorMessage: string | null;
  onSelect: (selection: ElementSelection) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const backgroundPointerMovedRef = useRef(false);
  const layout = useMemo(() => (graph ? calculateLayout(graph) : null), [graph]);
  const [positions, setPositions] = useState<Map<string, CanvasPosition>>(new Map());
  const changedElementIdSet = useMemo(() => new Set(changedElementIds), [changedElementIds]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [interaction, setInteraction] = useState<CanvasInteraction | null>(null);

  useEffect(() => {
    setPositions(new Map(layout?.positions ?? []));
    setViewport({ x: 0, y: 0, scale: 1 });
    setInteraction(null);
  }, [layout]);

  function screenToCanvas(clientX: number, clientY: number): CanvasPosition {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    const rawX = ((clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const rawY = ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    return {
      x: (rawX - viewport.x) / viewport.scale,
      y: (rawY - viewport.y) / viewport.scale
    };
  }

  function screenToRaw(clientX: number, clientY: number): CanvasPosition {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT
    };
  }

  function handleSelect(target: { kind: "node" | "edge"; id: string }, event: Pick<PointerEvent, "shiftKey" | "metaKey" | "ctrlKey">) {
    onSelect(selectElement(selected, target, event.shiftKey || event.metaKey || event.ctrlKey));
  }

  function handleNodePointerDown(nodeId: string, event: PointerEvent<SVGGElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    handleSelect({ kind: "node", id: nodeId }, event);
    const pointer = screenToCanvas(event.clientX, event.clientY);
    const nodePosition = positions.get(nodeId) ?? pointer;
    setInteraction({ type: "drag-node", pointerId: event.pointerId, nodeId, pointerOffset: { x: pointer.x - nodePosition.x, y: pointer.y - nodePosition.y } });
  }

  function handlePanPointerDown(event: PointerEvent<SVGRectElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    backgroundPointerMovedRef.current = false;
    setInteraction({ type: "pan", pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, startViewport: viewport });
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!interaction || event.pointerId !== interaction.pointerId) {
      return;
    }

    if (interaction.type === "drag-node") {
      const pointer = screenToCanvas(event.clientX, event.clientY);
      setPositions((current) => {
        const next = new Map(current);
        next.set(interaction.nodeId, { x: pointer.x - interaction.pointerOffset.x, y: pointer.y - interaction.pointerOffset.y });
        return next;
      });
      return;
    }

    const rawDx = event.clientX - interaction.startClient.x;
    const rawDy = event.clientY - interaction.startClient.y;
    if (Math.hypot(rawDx, rawDy) > 3) {
      backgroundPointerMovedRef.current = true;
    }
    const dx = (rawDx / (svgRef.current?.getBoundingClientRect().width || CANVAS_WIDTH)) * CANVAS_WIDTH;
    const dy = (rawDy / (svgRef.current?.getBoundingClientRect().height || CANVAS_HEIGHT)) * CANVAS_HEIGHT;
    setViewport({ ...interaction.startViewport, x: interaction.startViewport.x + dx, y: interaction.startViewport.y + dy });
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (interaction && event.pointerId === interaction.pointerId) {
      setInteraction(null);
    }
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const raw = screenToRaw(event.clientX, event.clientY);
    const beforeZoom = { x: (raw.x - viewport.x) / viewport.scale, y: (raw.y - viewport.y) / viewport.scale };
    const scale = clampZoom(viewport.scale * (event.deltaY > 0 ? 0.9 : 1.1));
    setViewport({
      scale,
      x: raw.x - beforeZoom.x * scale,
      y: raw.y - beforeZoom.y * scale
    });
  }

  function resetView() {
    setViewport({ x: 0, y: 0, scale: 1 });
  }

  return (
    <section className="graph-canvas" aria-label="Graph canvas">
      <div className="graph-canvas-header">
        <div>
          <h1>{graph?.name ?? "Working graph"}</h1>
          <p>Scroll to zoom, drag the background to pan, drag nodes to adjust the working layout, Shift/Ctrl-click to multi-select.</p>
        </div>
        <div className="graph-canvas-meta">
          {graph ? <span>{graph.nodes.length} nodes · {graph.edges.length} edges</span> : null}
          <button type="button" onClick={resetView}>Reset view</button>
        </div>
      </div>
      {status === "loading" ? <EmptyState title="Loading graph" body="Fetching source metadata, working graph, and snapshots from the backend." /> : null}
      {status === "error" ? <EmptyState title="Could not load graph" body={errorMessage ?? "Unknown loading error."} /> : null}
      {graph && layout ? (
        <svg
          ref={svgRef}
          className="graph-svg"
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          role="img"
          aria-label={`Graph '${graph.name}' with ${graph.nodes.length} nodes and ${graph.edges.length} edges`}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <rect
            className="canvas-hitbox"
            x="0"
            y="0"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerDown={handlePanPointerDown}
            onClick={() => {
              if (backgroundPointerMovedRef.current) {
                backgroundPointerMovedRef.current = false;
                return;
              }
              onSelect(EMPTY_SELECTION);
            }}
          />
          <g className="graph-viewport" transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            <g className="edge-layer">
              {graph.edges.map((edge) => {
                const source = positions.get(edge.source);
                const target = positions.get(edge.target);
                if (!source || !target) {
                  return null;
                }
                const edgeSelected = isSelected(selected, { kind: "edge", id: edge.id });
                const edgeChanged = changedElementIdSet.has(edge.id);
                const labelX = (source.x + target.x) / 2;
                const labelY = (source.y + target.y) / 2;
                return (
                  <g
                    key={edge.id}
                    className={`edge${edgeSelected ? " selected" : ""}${edgeChanged ? " changed" : ""}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      handleSelect({ kind: "edge", id: edge.id }, event);
                    }}
                  >
                    <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
                    <text x={labelX} y={labelY}>{edge.label}</text>
                  </g>
                );
              })}
            </g>
            <g className="node-layer">
              {graph.nodes.map((node) => {
                const position = positions.get(node.id);
                if (!position) {
                  return null;
                }
                const nodeSelected = isSelected(selected, { kind: "node", id: node.id });
                const nodeChanged = changedElementIdSet.has(node.id);
                return (
                  <g
                    key={node.id}
                    className={`node origin-${node.origin}${nodeSelected ? " selected" : ""}${nodeChanged ? " changed" : ""}`}
                    transform={`translate(${position.x} ${position.y})`}
                    onPointerDown={(event) => handleNodePointerDown(node.id, event)}
                  >
                    <circle r="34" />
                    <text>{node.label}</text>
                  </g>
                );
              })}
            </g>
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
  selection,
  changedElementIds,
  errorMessage
}: {
  activeTab: PiTab;
  onTabChange: (tab: PiTab) => void;
  status: LoadStatus;
  graph?: GraphState;
  selection: ElementSelection;
  changedElementIds: string[];
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
          <EmptyState title="Pi chat not connected yet" body="Graph context and selection now load here; patch/direct JSON workflows will connect next." />
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
        <pre className="raw-output">{JSON.stringify({ status, graphId: graph?.graphId, nodeCount: graph?.nodes.length ?? 0, edgeCount: graph?.edges.length ?? 0, selectedNodeIds: selection.nodeIds, selectedEdgeIds: selection.edgeIds, changedElementIds, error: errorMessage }, null, 2)}</pre>
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
  selection: ElementSelection;
  errorMessage: string | null;
}) {
  const activeGraphState = graph?.stateType ?? sourceMeta?.stateType ?? "unknown";

  return (
    <footer className="status-bar" aria-label="Status bar">
      <span>Status: {status}</span>
      <span>Graph: {activeGraphState}</span>
      <span>Nodes: {graph?.nodes.length ?? sourceMeta?.nodeCount ?? 0}</span>
      <span>Edges: {graph?.edges.length ?? sourceMeta?.edgeCount ?? 0}</span>
      <span>{selectionLabel(selection)}</span>
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
