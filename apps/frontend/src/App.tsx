import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { ActionSummary, GraphEdge, GraphMeta, GraphNode, GraphPatch, GraphState, SnapshotMeta } from "@know-grow/shared";
import { ApiClientError, type FrontendApiClient } from "./api.js";
import {
  addEdgeToGraph,
  addNodeToGraph,
  buildDeleteSelectionPatch,
  buildMergeSelectedPatch,
  buildSplitNodePatch,
  createEmptyFrontendSummary,
  updateEdgeInGraph,
  updateNodeInGraph,
  type GraphMutationResult
} from "./graphMutations.js";
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
type PiStatus = "idle" | "thinking" | "validating" | "applying/reloading" | "failed" | "complete";
type PiMessage = { role: "user" | "assistant"; content: string };

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
  const [piStatus, setPiStatus] = useState<PiStatus>("idle");
  const [undoStack, setUndoStack] = useState<GraphState[]>([]);
  const [redoStack, setRedoStack] = useState<GraphState[]>([]);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [activeSnapshotName, setActiveSnapshotName] = useState<string | null>(null);
  const [lastActionSummary, setLastActionSummary] = useState<ActionSummary | null>(null);
  const [rawDetails, setRawDetails] = useState<unknown>(null);
  const [piPrompt, setPiPrompt] = useState("");
  const [piMessages, setPiMessages] = useState<PiMessage[]>([]);
  const [pendingPiPatch, setPendingPiPatch] = useState<GraphPatch | null>(null);
  const [inspectorResetVersion, setInspectorResetVersion] = useState(0);
  const graphRef = useRef<GraphState | null>(null);
  const mutationQueueRef = useRef(Promise.resolve());

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
          setUndoStack([]);
          setRedoStack([]);
          setUnsavedChanges(false);
          setActiveSnapshotName(workingGraph.stateType === "snapshot" ? workingGraph.name : null);
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

  useEffect(() => {
    graphRef.current = data?.workingGraph ?? null;
  }, [data?.workingGraph]);

  const selectedNodes = useMemo(() => {
    const nodes = data?.workingGraph.nodes ?? [];
    return selection.nodeIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is GraphNode => Boolean(node));
  }, [data?.workingGraph.nodes, selection.nodeIds]);

  const selectedEdges = useMemo(() => {
    const edges = data?.workingGraph.edges ?? [];
    return selection.edgeIds.map((id) => edges.find((edge) => edge.id === id)).filter((edge): edge is GraphEdge => Boolean(edge));
  }, [data?.workingGraph.edges, selection.edgeIds]);

  async function refreshSnapshots(): Promise<SnapshotMeta[]> {
    const snapshots = await apiClient.fetchSnapshots();
    setData((current) => (current ? { ...current, snapshots } : current));
    return snapshots;
  }

  function rememberError(error: unknown): void {
    const message = formatLoadError(error);
    setErrorMessage(message);
    setRawDetails(error instanceof ApiClientError ? { code: error.code, status: error.status, message: error.message, details: error.details } : { message });
    setPiStatus("failed");
    setInspectorResetVersion((version) => version + 1);
  }

  function acceptWorkingGraph(graph: GraphState, options: { pushUndo?: boolean; redoGraph?: GraphState | null; changedIds?: string[]; actionSummary?: ActionSummary | null; raw?: unknown; unsaved?: boolean } = {}): void {
    const previousGraph = graphRef.current;
    graphRef.current = graph;
    setData((current) => (current ? { ...current, workingGraph: graph } : current));
    setChangedElementIds(options.changedIds ?? []);
    setLastActionSummary(options.actionSummary ?? null);
    setRawDetails(options.raw ?? null);
    setErrorMessage(null);
    setStatus("ready");
    setPiStatus("complete");
    setUnsavedChanges(options.unsaved ?? true);
    if (options.pushUndo && previousGraph) {
      setUndoStack((stack) => [...stack, previousGraph]);
      setRedoStack([]);
    }
    if (options.redoGraph) {
      setRedoStack((stack) => [...stack, options.redoGraph as GraphState]);
    }
  }

  async function enqueueMutation(work: () => Promise<void>): Promise<void> {
    const run = mutationQueueRef.current.then(work, work);
    mutationQueueRef.current = run.catch(() => undefined);
    await run;
  }

  async function persistMutation(result: GraphMutationResult, instructionRaw?: unknown): Promise<void> {
    await enqueueMutation(async () => {
      if (!data) {
        return;
      }
      setPiStatus("validating");
      try {
        const response = await apiClient.replaceWorkingGraph(result.graph);
        acceptWorkingGraph(response.graph, {
          pushUndo: true,
          changedIds: result.changedElementIds,
          actionSummary: result.actionSummary,
          raw: { request: instructionRaw ?? result.actionSummary.instruction, response },
          unsaved: true
        });
      } catch (error) {
        rememberError(error);
      }
    });
  }

  async function applyPatchMutation(patchResult: ReturnType<typeof buildMergeSelectedPatch> | ReturnType<typeof buildSplitNodePatch>): Promise<void> {
    if (!patchResult || !data) {
      return;
    }
    setPiStatus("validating");
    try {
      const response = await apiClient.applyPatch(patchResult);
      acceptWorkingGraph(response.graph, {
        pushUndo: true,
        changedIds: response.changedElementIds,
        actionSummary: response.actionSummary,
        raw: response,
        unsaved: true
      });
      setSelection(EMPTY_SELECTION);
    } catch (error) {
      rememberError(error);
    }
  }

  async function handleUndo(): Promise<void> {
    if (!data || undoStack.length === 0) {
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    setPiStatus("validating");
    try {
      const response = await apiClient.replaceWorkingGraph(previous);
      setUndoStack((stack) => stack.slice(0, -1));
      acceptWorkingGraph(response.graph, {
        redoGraph: data.workingGraph,
        changedIds: [],
        actionSummary: createEmptyFrontendSummary("Undo last change", "Undid graph change"),
        raw: response,
        unsaved: true
      });
      setActiveSnapshotName(null);
    } catch (error) {
      rememberError(error);
    }
  }

  async function handleRedo(): Promise<void> {
    if (!data || redoStack.length === 0) {
      return;
    }
    const next = redoStack[redoStack.length - 1];
    setPiStatus("validating");
    try {
      const response = await apiClient.replaceWorkingGraph(next);
      setRedoStack((stack) => stack.slice(0, -1));
      setUndoStack((stack) => [...stack, data.workingGraph]);
      acceptWorkingGraph(response.graph, {
        changedIds: [],
        actionSummary: createEmptyFrontendSummary("Redo graph change", "Redid graph change"),
        raw: response,
        unsaved: true
      });
      setActiveSnapshotName(null);
    } catch (error) {
      rememberError(error);
    }
  }

  async function handleAddNode(): Promise<void> {
    if (!data) return;
    const label = prompt("Node label?")?.trim();
    if (!label) return;
    const type = prompt("Node type?", "concept")?.trim() || "concept";
    await persistMutation(addNodeToGraph(data.workingGraph, { label, type, position: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 } }));
  }

  async function handleAddEdge(): Promise<void> {
    if (!data || selection.nodeIds.length < 1 || selection.nodeIds.length > 2) return;
    const [firstNodeId, secondNodeId] = selection.nodeIds;
    const source = firstNodeId;
    const target = secondNodeId ?? prompt("Target node id?")?.trim();
    if (!source || !target) return;
    const label = prompt("Edge label?", "relates to")?.trim() || "relates to";
    await persistMutation(addEdgeToGraph(data.workingGraph, { source, target, label }));
  }

  async function handleMergeSelected(): Promise<void> {
    if (!data || selection.nodeIds.length < 2) return;
    const defaultLabel = selectedNodes.map((node) => node.label).join(" + ");
    const label = prompt("Merged node label?", defaultLabel)?.trim();
    if (!label) return;
    const type = prompt("Merged node type?", selectedNodes[0]?.type ?? "concept")?.trim() || selectedNodes[0]?.type || "concept";
    await applyPatchMutation(buildMergeSelectedPatch(data.workingGraph, selection.nodeIds, label, type));
  }

  async function handleSplitSelected(): Promise<void> {
    if (!data || selection.nodeIds.length !== 1 || selection.edgeIds.length > 0) return;
    const node = selectedNodes[0];
    const labels = prompt("New node labels separated by commas?", node ? `${node.label} A, ${node.label} B` : "Part A, Part B")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!labels || labels.length < 2) return;
    const type = prompt("New node type?", node?.type ?? "concept")?.trim() || node?.type || "concept";
    await applyPatchMutation(buildSplitNodePatch(data.workingGraph, selection.nodeIds[0], labels, type));
  }

  async function handleDeleteSelected(): Promise<void> {
    if (!data || selectionCount(selection) === 0) return;
    if (!confirm(`Delete ${selectionLabel(selection)} from the working graph? Incident edges for deleted nodes are removed too.`)) return;
    await applyPatchMutation(buildDeleteSelectionPatch(data.workingGraph, selection));
    setSelection(EMPTY_SELECTION);
  }

  async function handleSaveSnapshot(): Promise<void> {
    if (!data) return;
    const name = prompt("Snapshot name?", `${data.workingGraph.name} snapshot`)?.trim();
    if (!name) return;
    try {
      const response = await apiClient.createSnapshot({ name, layout: data.workingGraph.layout });
      const snapshots = await refreshSnapshots();
      setActiveSnapshotName(response.snapshot.name);
      setUnsavedChanges(false);
      setLastActionSummary(createEmptyFrontendSummary(`Save snapshot '${response.snapshot.name}'`, "Saved snapshot"));
      setRawDetails({ response, snapshots });
      setErrorMessage(null);
      setPiStatus("complete");
    } catch (error) {
      rememberError(error);
    }
  }

  async function handleSnapshotAction(value: string): Promise<void> {
    if (!value || !data) return;
    try {
      if (value === "revert-source") {
        if (!confirm("Revert the working graph to the immutable source graph?")) return;
        const response = await apiClient.revertToSource();
        acceptWorkingGraph(response.graph, { pushUndo: true, changedIds: [...response.actionSummary.addedNodes, ...response.actionSummary.updatedNodes, ...response.actionSummary.deletedNodes, ...response.actionSummary.addedEdges, ...response.actionSummary.updatedEdges, ...response.actionSummary.deletedEdges], actionSummary: response.actionSummary, raw: response, unsaved: true });
        setActiveSnapshotName(null);
        setSelection(EMPTY_SELECTION);
        return;
      }

      const [action, snapshotId] = value.split(":");
      const snapshot = data.snapshots.find((candidate) => candidate.snapshotId === snapshotId);
      if (!snapshotId || !snapshot) return;

      if (action === "load") {
        if (!confirm(`Load snapshot '${snapshot.name}' into the working graph?`)) return;
        const response = await apiClient.loadSnapshot(snapshotId);
        acceptWorkingGraph(response.graph, { pushUndo: true, changedIds: [...response.actionSummary.addedNodes, ...response.actionSummary.updatedNodes, ...response.actionSummary.deletedNodes, ...response.actionSummary.addedEdges, ...response.actionSummary.updatedEdges, ...response.actionSummary.deletedEdges], actionSummary: response.actionSummary, raw: response, unsaved: false });
        setActiveSnapshotName(response.snapshot.name);
        setSelection(EMPTY_SELECTION);
      }

      if (action === "duplicate") {
        const name = prompt("Duplicate snapshot name?", `${snapshot.name} copy`)?.trim();
        if (!name) return;
        const response = await apiClient.duplicateSnapshot(snapshotId, { name });
        await refreshSnapshots();
        setLastActionSummary(createEmptyFrontendSummary(`Duplicate snapshot '${snapshot.name}'`, "Duplicated snapshot"));
        setRawDetails(response);
        setPiStatus("complete");
      }
    } catch (error) {
      rememberError(error);
    }
  }

  async function handleNodeUpdate(nodeId: string, changes: Partial<Pick<GraphNode, "label" | "type" | "notes">>): Promise<void> {
    await enqueueMutation(async () => {
      const graph = graphRef.current;
      if (!graph) return;
      const result = updateNodeInGraph(graph, nodeId, changes);
      if (result) {
        setPiStatus("validating");
        try {
          const response = await apiClient.replaceWorkingGraph(result.graph);
          acceptWorkingGraph(response.graph, { pushUndo: true, changedIds: result.changedElementIds, actionSummary: result.actionSummary, raw: response, unsaved: true });
        } catch (error) {
          rememberError(error);
        }
      }
    });
  }

  async function handleEdgeUpdate(edgeId: string, changes: Partial<Pick<GraphEdge, "label" | "notes">>): Promise<void> {
    await enqueueMutation(async () => {
      const graph = graphRef.current;
      if (!graph) return;
      const result = updateEdgeInGraph(graph, edgeId, changes);
      if (result) {
        setPiStatus("validating");
        try {
          const response = await apiClient.replaceWorkingGraph(result.graph);
          acceptWorkingGraph(response.graph, { pushUndo: true, changedIds: result.changedElementIds, actionSummary: result.actionSummary, raw: response, unsaved: true });
        } catch (error) {
          rememberError(error);
        }
      }
    });
  }

  async function handleLayoutChange(layout: Record<string, CanvasPosition>): Promise<void> {
    if (!data) return;
    const graph = { ...data.workingGraph, layout };
    const actionSummary = createEmptyFrontendSummary("Persist dragged node layout", "Updated layout");
    await persistMutation({ graph, actionSummary, changedElementIds: [] });
  }

  async function handleSendPiPrompt(): Promise<void> {
    if (!data) return;
    const instruction = piPrompt.trim();
    if (!instruction) return;

    setPiStatus("thinking");
    setPiMessages((messages) => [...messages, { role: "user", content: instruction }]);
    setPiPrompt("");
    try {
      const response = await apiClient.piChat({
        instruction,
        selectedNodeIds: selection.nodeIds,
        selectedEdgeIds: selection.edgeIds,
        graph: {
          nodes: data.workingGraph.nodes,
          edges: data.workingGraph.edges
        },
        mode: "patch"
      });
      setPiMessages((messages) => [...messages, { role: "assistant", content: response.message }]);
      setPendingPiPatch(response.patch ?? null);
      setLastActionSummary(response.actionSummary ?? null);
      setRawDetails(response);
      setErrorMessage(null);
      setPiStatus("complete");
      if (response.patch || response.actionSummary) {
        setActivePiTab("actions");
      }
    } catch (error) {
      rememberError(error);
    }
  }

  async function handleApplyPiPatch(): Promise<void> {
    if (!pendingPiPatch) return;
    if (!confirm("Apply the latest Pi patch proposal to the working graph?")) return;

    setPiStatus("validating");
    try {
      const response = await apiClient.applyPatch(pendingPiPatch);
      acceptWorkingGraph(response.graph, {
        pushUndo: true,
        changedIds: response.changedElementIds,
        actionSummary: response.actionSummary,
        raw: { proposal: rawDetails, response },
        unsaved: true
      });
      setPendingPiPatch(null);
      setSelection(EMPTY_SELECTION);
      setActivePiTab("actions");
    } catch (error) {
      rememberError(error);
    }
  }

  return (
    <main className="app-shell" aria-label="Snapshot Multi-View Knowledge Graph Workbench">
      <TopToolbar
        snapshots={data?.snapshots ?? []}
        selection={selection}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAddNode={handleAddNode}
        onAddEdge={handleAddEdge}
        onMergeSelected={handleMergeSelected}
        onSplitSelected={handleSplitSelected}
        onDeleteSelected={handleDeleteSelected}
        onSaveSnapshot={handleSaveSnapshot}
        onSnapshotAction={handleSnapshotAction}
      />
      <section className="main-grid" aria-label="Workbench regions">
        <InspectorPanel key={inspectorResetVersion} selection={selection} graph={data?.workingGraph} nodes={selectedNodes} edges={selectedEdges} unsavedChanges={unsavedChanges} activeSnapshotName={activeSnapshotName} onNodeUpdate={handleNodeUpdate} onEdgeUpdate={handleEdgeUpdate} />
        <GraphCanvas graph={data?.workingGraph} status={status} selected={selection} changedElementIds={changedElementIds} errorMessage={errorMessage} onSelect={setSelection} onLayoutChange={handleLayoutChange} />
        <PiPanel activeTab={activePiTab} onTabChange={setActivePiTab} piStatus={piStatus} status={status} graph={data?.workingGraph} selection={selection} changedElementIds={changedElementIds} errorMessage={errorMessage} actionSummary={lastActionSummary} rawDetails={rawDetails} piPrompt={piPrompt} piMessages={piMessages} pendingPiPatch={pendingPiPatch} onPiPromptChange={setPiPrompt} onSendPiPrompt={handleSendPiPrompt} onApplyPiPatch={handleApplyPiPatch} />
      </section>
      <StatusBar
        status={status}
        piStatus={piStatus}
        graph={data?.workingGraph}
        sourceMeta={data?.sourceMeta}
        snapshots={data?.snapshots ?? []}
        selection={selection}
        errorMessage={errorMessage}
        unsavedChanges={unsavedChanges}
        activeSnapshotName={activeSnapshotName}
      />
    </main>
  );
}

function TopToolbar({
  snapshots,
  selection,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddNode,
  onAddEdge,
  onMergeSelected,
  onSplitSelected,
  onDeleteSelected,
  onSaveSnapshot,
  onSnapshotAction
}: {
  snapshots: SnapshotMeta[];
  selection: ElementSelection;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddNode: () => void;
  onAddEdge: () => void;
  onMergeSelected: () => void;
  onSplitSelected: () => void;
  onDeleteSelected: () => void;
  onSaveSnapshot: () => void;
  onSnapshotAction: (value: string) => void;
}) {
  const hasSelection = selectionCount(selection) > 0;
  const canAddEdge = selection.nodeIds.length >= 1 && selection.nodeIds.length <= 2 && selection.edgeIds.length === 0;
  const canMerge = selection.nodeIds.length >= 2;
  const canSplit = selection.nodeIds.length === 1 && selection.edgeIds.length === 0;

  return (
    <header className="top-toolbar" aria-label="Top toolbar">
      <div className="brand">Know Grow Graph</div>
      <nav className="toolbar-actions" aria-label="Graph actions">
        <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>Redo</button>
        <button type="button" onClick={onAddNode}>Add Node</button>
        <button type="button" disabled={!canAddEdge} onClick={onAddEdge} title={canAddEdge ? "Add a human-origin edge between selected nodes." : "Select one or two nodes to add an edge."}>Add Edge</button>
        <button type="button" disabled={!canMerge} onClick={onMergeSelected}>Merge Selected</button>
        <button type="button" disabled={!canSplit} onClick={onSplitSelected}>Split Selected</button>
        <button type="button" disabled={!hasSelection} onClick={onDeleteSelected}>Delete Selected</button>
        <button type="button" onClick={onSaveSnapshot}>Save Snapshot</button>
        <label className="snapshot-picker">
          Snapshot
          <select defaultValue="" onChange={(event) => { void onSnapshotAction(event.target.value); event.currentTarget.value = ""; }}>
            <option value="">Current working graph</option>
            <option value="revert-source">Revert to source</option>
            {snapshots.length > 0 ? <option disabled>──────────</option> : null}
            {snapshots.map((snapshot) => (
              <option key={`load-${snapshot.snapshotId}`} value={`load:${snapshot.snapshotId}`}>
                Load: {snapshot.name}
              </option>
            ))}
            {snapshots.map((snapshot) => (
              <option key={`duplicate-${snapshot.snapshotId}`} value={`duplicate:${snapshot.snapshotId}`}>
                Duplicate: {snapshot.name}
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
  edges,
  unsavedChanges,
  activeSnapshotName,
  onNodeUpdate,
  onEdgeUpdate
}: {
  selection: ElementSelection;
  graph?: GraphState;
  nodes: GraphNode[];
  edges: GraphEdge[];
  unsavedChanges: boolean;
  activeSnapshotName: string | null;
  onNodeUpdate: (nodeId: string, changes: Partial<Pick<GraphNode, "label" | "type" | "notes">>) => void;
  onEdgeUpdate: (edgeId: string, changes: Partial<Pick<GraphEdge, "label" | "notes">>) => void;
}) {
  const selectedCount = selectionCount(selection);
  const missingNodeIds = selection.nodeIds.filter((id) => !nodes.some((node) => node.id === id));
  const missingEdgeIds = selection.edgeIds.filter((id) => !edges.some((edge) => edge.id === id));

  return (
    <aside className="panel inspector-panel" aria-label="Inspector panel">
      <h2>Inspector</h2>
      {selectedCount === 0 ? <GraphSummary graph={graph} unsavedChanges={unsavedChanges} activeSnapshotName={activeSnapshotName} /> : null}
      {missingNodeIds.length > 0 || missingEdgeIds.length > 0 ? (
        <EmptyState title="Invalid or deleted selection" body={`Missing ${[...missingNodeIds, ...missingEdgeIds].join(", ")}.`} />
      ) : null}
      {selectedCount === 1 && nodes.length === 1 ? <NodeDetails key={`${nodes[0].id}:${nodes[0].label}:${nodes[0].type}:${nodes[0].notes ?? ""}`} node={nodes[0]} graph={graph} onUpdate={onNodeUpdate} /> : null}
      {selectedCount === 1 && edges.length === 1 ? <EdgeDetails key={`${edges[0].id}:${edges[0].label}:${edges[0].notes ?? ""}`} edge={edges[0]} graph={graph} onUpdate={onEdgeUpdate} /> : null}
      {selectedCount > 1 ? <MultiSelectionDetails selection={selection} nodes={nodes} edges={edges} /> : null}
    </aside>
  );
}

function GraphSummary({ graph, unsavedChanges, activeSnapshotName }: { graph?: GraphState; unsavedChanges: boolean; activeSnapshotName: string | null }) {
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
      <dd>{activeSnapshotName ?? "Current working graph"}</dd>
      <dt>Unsaved changes</dt>
      <dd>{unsavedChanges ? "Yes" : "No"}</dd>
    </dl>
  ) : (
    <EmptyState title="No graph loaded" body="The inspector will show graph details after the working graph loads." />
  );
}

function NodeDetails({ node, graph, onUpdate }: { node: GraphNode; graph?: GraphState; onUpdate: (nodeId: string, changes: Partial<Pick<GraphNode, "label" | "type" | "notes">>) => void }) {
  const connectedEdges = graph?.edges.filter((edge) => edge.source === node.id || edge.target === node.id) ?? [];
  const readOnly = graph?.stateType === "source";
  return (
    <div className="details-editor">
      <label>
        Label
        <input disabled={readOnly} defaultValue={node.label} onBlur={(event) => onUpdate(node.id, { label: event.currentTarget.value })} />
      </label>
      <dl className="details-list">
        <dt>ID</dt>
        <dd>{node.id}</dd>
      </dl>
      <label>
        Type
        <input disabled={readOnly} defaultValue={node.type} onBlur={(event) => onUpdate(node.id, { type: event.currentTarget.value || "concept" })} />
      </label>
      <dl className="details-list">
        <dt>Origin</dt>
        <dd>{node.origin}</dd>
      </dl>
      <label>
        Notes
        <textarea disabled={readOnly} defaultValue={node.notes ?? ""} onBlur={(event) => onUpdate(node.id, { notes: event.currentTarget.value })} />
      </label>
      <dl className="details-list">
        <dt>Source refs</dt>
        <dd>{node.sourceNodeIds?.join(", ") || "—"}</dd>
        <dt>Connected edges</dt>
        <dd>{connectedEdges.length > 0 ? connectedEdges.map((edge) => edge.label || edge.id).join(", ") : "—"}</dd>
      </dl>
    </div>
  );
}

function EdgeDetails({ edge, graph, onUpdate }: { edge: GraphEdge; graph?: GraphState; onUpdate: (edgeId: string, changes: Partial<Pick<GraphEdge, "label" | "notes">>) => void }) {
  const source = graph?.nodes.find((node) => node.id === edge.source);
  const target = graph?.nodes.find((node) => node.id === edge.target);
  const readOnly = graph?.stateType === "source";
  return (
    <div className="details-editor">
      <label>
        Relation label
        <input disabled={readOnly} defaultValue={edge.label} onBlur={(event) => onUpdate(edge.id, { label: event.currentTarget.value })} />
      </label>
      <dl className="details-list">
        <dt>ID</dt>
        <dd>{edge.id}</dd>
        <dt>Source → Target</dt>
        <dd>
          {source?.label ?? edge.source} → {target?.label ?? edge.target}
        </dd>
        <dt>Origin</dt>
        <dd>{edge.origin}</dd>
      </dl>
      <label>
        Notes
        <textarea disabled={readOnly} defaultValue={edge.notes ?? ""} onBlur={(event) => onUpdate(edge.id, { notes: event.currentTarget.value })} />
      </label>
      <dl className="details-list">
        <dt>Source refs</dt>
        <dd>{edge.sourceEdgeIds?.join(", ") || "—"}</dd>
      </dl>
    </div>
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
  onSelect,
  onLayoutChange
}: {
  graph?: GraphState;
  status: LoadStatus;
  selected: ElementSelection;
  changedElementIds: string[];
  errorMessage: string | null;
  onSelect: (selection: ElementSelection) => void;
  onLayoutChange: (layout: Record<string, CanvasPosition>) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const backgroundPointerMovedRef = useRef(false);
  const nodePointerMovedRef = useRef(false);
  const layout = useMemo(() => (graph ? calculateLayout(graph, { preserveCanvasLayout: true }) : null), [graph]);
  const [positions, setPositions] = useState<Map<string, CanvasPosition>>(new Map());
  const positionsRef = useRef<Map<string, CanvasPosition>>(new Map());
  const changedElementIdSet = useMemo(() => new Set(changedElementIds), [changedElementIds]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [interaction, setInteraction] = useState<CanvasInteraction | null>(null);

  useEffect(() => {
    const nextPositions = new Map(layout?.positions ?? []);
    positionsRef.current = nextPositions;
    setPositions(nextPositions);
    setViewport({ x: 0, y: 0, scale: 1 });
    setInteraction(null);
  }, [layout]);

  useEffect(() => {
    if (errorMessage && layout) {
      const nextPositions = new Map(layout.positions);
      positionsRef.current = nextPositions;
      setPositions(nextPositions);
      setInteraction(null);
    }
  }, [errorMessage, layout]);

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
    nodePointerMovedRef.current = false;
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
      nodePointerMovedRef.current = true;
      const pointer = screenToCanvas(event.clientX, event.clientY);
      const next = new Map(positionsRef.current);
      next.set(interaction.nodeId, { x: pointer.x - interaction.pointerOffset.x, y: pointer.y - interaction.pointerOffset.y });
      positionsRef.current = next;
      setPositions(next);
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
      const completedInteraction = interaction;
      setInteraction(null);
      if (completedInteraction.type === "drag-node" && graph && nodePointerMovedRef.current) {
        nodePointerMovedRef.current = false;
        onLayoutChange(Object.fromEntries(positionsRef.current));
      }
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
          <p>Scroll to zoom, drag the background to pan, drag nodes to persist working layout, Shift/Ctrl-click to multi-select.</p>
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
  piStatus,
  status,
  graph,
  selection,
  changedElementIds,
  errorMessage,
  actionSummary,
  rawDetails,
  piPrompt,
  piMessages,
  pendingPiPatch,
  onPiPromptChange,
  onSendPiPrompt,
  onApplyPiPatch
}: {
  activeTab: PiTab;
  onTabChange: (tab: PiTab) => void;
  piStatus: PiStatus;
  status: LoadStatus;
  graph?: GraphState;
  selection: ElementSelection;
  changedElementIds: string[];
  errorMessage: string | null;
  actionSummary: ActionSummary | null;
  rawDetails: unknown;
  piPrompt: string;
  piMessages: PiMessage[];
  pendingPiPatch: GraphPatch | null;
  onPiPromptChange: (value: string) => void;
  onSendPiPrompt: () => void;
  onApplyPiPatch: () => void;
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
          <div className="pi-message-list" aria-label="Pi conversation history">
            {piMessages.length === 0 ? (
              <EmptyState title="Ask Pi for a graph patch" body="Patch mode proposes typed graph changes without mutating the working graph until you apply them." />
            ) : (
              piMessages.map((message, index) => (
                <p key={`${message.role}-${index}`} className={`pi-message ${message.role}`}>
                  <strong>{message.role === "user" ? "You" : "Pi"}:</strong> {message.content}
                </p>
              ))
            )}
          </div>
          <textarea
            value={piPrompt}
            onChange={(event) => onPiPromptChange(event.target.value)}
            onInput={(event) => onPiPromptChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSendPiPrompt();
              }
            }}
            placeholder="Ask Pi to transform the graph…"
            aria-label="Pi prompt"
          />
          <div className="pi-controls">
            <button type="button" onClick={onSendPiPrompt} disabled={!graph || !piPrompt.trim() || piStatus === "thinking"}>Send to Pi</button>
            <button type="button" onClick={onApplyPiPatch} disabled={!pendingPiPatch || piStatus === "thinking"}>Apply latest Pi patch</button>
          </div>
          <span>Pi status: {piStatus}</span>
        </div>
      ) : null}
      {activeTab === "actions" ? (
        <div className="tab-panel">
          {actionSummary ? <ActionSummaryView actionSummary={actionSummary} /> : <EmptyState title="No proposed actions" body="Patch summaries and validation warnings appear here after toolbar, inspector, snapshot, or Pi mutations." />}
          {pendingPiPatch ? <button type="button" onClick={onApplyPiPatch} disabled={piStatus === "thinking"}>Apply latest Pi patch</button> : null}
        </div>
      ) : null}
      {activeTab === "raw" ? (
        <pre className="raw-output">{JSON.stringify({ status, piStatus, graphId: graph?.graphId, nodeCount: graph?.nodes.length ?? 0, edgeCount: graph?.edges.length ?? 0, selectedNodeIds: selection.nodeIds, selectedEdgeIds: selection.edgeIds, changedElementIds, error: errorMessage, details: rawDetails }, null, 2)}</pre>
      ) : null}
    </aside>
  );
}

function ActionSummaryView({ actionSummary }: { actionSummary: ActionSummary }) {
  return (
    <dl className="details-list">
      <dt>Title</dt>
      <dd>{actionSummary.title}</dd>
      <dt>Instruction</dt>
      <dd>{actionSummary.instruction || "—"}</dd>
      <dt>Added nodes</dt>
      <dd>{actionSummary.addedNodes.join(", ") || "—"}</dd>
      <dt>Updated nodes</dt>
      <dd>{actionSummary.updatedNodes.join(", ") || "—"}</dd>
      <dt>Deleted nodes</dt>
      <dd>{actionSummary.deletedNodes.join(", ") || "—"}</dd>
      <dt>Added edges</dt>
      <dd>{actionSummary.addedEdges.join(", ") || "—"}</dd>
      <dt>Updated edges</dt>
      <dd>{actionSummary.updatedEdges.join(", ") || "—"}</dd>
      <dt>Deleted edges</dt>
      <dd>{actionSummary.deletedEdges.join(", ") || "—"}</dd>
      <dt>Warnings</dt>
      <dd>{actionSummary.warnings.join("; ") || "—"}</dd>
    </dl>
  );
}

function StatusBar({
  status,
  piStatus,
  graph,
  sourceMeta,
  snapshots,
  selection,
  errorMessage,
  unsavedChanges,
  activeSnapshotName
}: {
  status: LoadStatus;
  piStatus: PiStatus;
  graph?: GraphState;
  sourceMeta?: GraphMeta;
  snapshots: SnapshotMeta[];
  selection: ElementSelection;
  errorMessage: string | null;
  unsavedChanges: boolean;
  activeSnapshotName: string | null;
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
      <span>Active snapshot: {activeSnapshotName ?? "working"}</span>
      <span>Unsaved changes: {unsavedChanges ? "yes" : "no"}</span>
      <span>Pi: {piStatus}</span>
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
