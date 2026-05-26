import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  applyGraphPatch,
  type ActionSummary,
  type ApplyPatchResponse,
  type CreateSnapshotRequest,
  type CreateSnapshotResponse,
  type DuplicateSnapshotRequest,
  type DuplicateSnapshotResponse,
  type GraphMeta,
  type GraphPatch,
  type GraphState,
  type HealthResponse,
  type LoadSnapshotResponse,
  type ReplaceWorkingGraphResponse,
  type RevertToSourceResponse,
  type SnapshotMeta
} from "@know-grow/shared";
import { App } from "../src/App.tsx";
import { ApiClientError, type FrontendApiClient } from "../src/api.ts";

const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 620;

test("App-level SVG wiring supports selection, multi-select, pan-safe background clicks, zoom, and drag persistence", async () => {
  const harness = await renderHarness();
  try {
    const svg = harness.svg();
    mockSvgRect(svg);
    const background = harness.background();
    const [firstNode, secondNode] = harness.nodes();
    const edge = harness.edge();

    await dispatchPointer(firstNode, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    assert.match(harness.inspectorText(), /ID\s*n1/);
    assert.match(harness.inspectorText(), /Connected edges\s*connects/);

    await dispatchPointer(secondNode, "pointerdown", { pointerId: 2, clientX: 300, clientY: 100, shiftKey: true });
    assert.match(harness.inspectorText(), /2 selected \(2 nodes\)/);
    assert.match(harness.inspectorText(), /Alpha, Beta/);

    await dispatchPointer(edge, "pointerdown", { pointerId: 3, clientX: 200, clientY: 100 });
    assert.match(harness.inspectorText(), /Source → Target/);
    assert.match(harness.inspectorText(), /Alpha → Beta/);

    await dispatchPointer(firstNode, "pointerdown", { pointerId: 4, clientX: 100, clientY: 100 });
    await dispatchPointer(background, "pointerdown", { pointerId: 5, clientX: 10, clientY: 10 });
    await dispatchPointer(svg, "pointermove", { pointerId: 5, clientX: 70, clientY: 55 });
    await dispatchPointer(svg, "pointerup", { pointerId: 5, clientX: 70, clientY: 55 });
    assert.match(harness.viewport().getAttribute("transform") ?? "", /translate\(60 45\) scale\(1\)/);
    await dispatchClick(background);
    assert.match(harness.inspectorText(), /ID\s*n1/, "click after a pan must not clear selection");

    await dispatchClick(background);
    assert.match(harness.inspectorText(), /Graph\s*Working Test/);
    assert.doesNotMatch(harness.inspectorText(), /ID\s*n1/);

    await dispatchWheel(svg, { clientX: CANVAS_WIDTH / 2, clientY: CANVAS_HEIGHT / 2, deltaY: -100 });
    await waitFor(() => assert.match(harness.viewport().getAttribute("transform") ?? "", /scale\(1\.1/));

    await dispatchPointer(firstNode, "pointerdown", { pointerId: 6, clientX: 100, clientY: 100 });
    await dispatchPointer(svg, "pointermove", { pointerId: 6, clientX: 140, clientY: 150 });
    await dispatchPointer(svg, "pointerup", { pointerId: 6, clientX: 140, clientY: 150 });

    await waitFor(() => assert.equal(harness.api.replaceCalls.length, 1));
    assertPositionClose(harness.api.replaceCalls[0]?.layout?.n1, { x: 136.36363636363637, y: 145.45454545454544 });
    assert.match(harness.statusText(), /Pi: complete/);
  } finally {
    await harness.cleanup();
  }
});

test("App-level editing flow covers toolbar mutations, undo/redo, snapshots, and rejected mutation recovery", async () => {
  const harness = await renderHarness();
  try {
    const [firstNode] = harness.nodes();
    await dispatchPointer(firstNode, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });

    const labelInput = harness.inspectorInput("Label");
    await changeAndBlur(labelInput, "Alpha renamed");
    await waitFor(() => assert.equal(harness.api.replaceCalls.length, 1));
    assert.equal(harness.api.graph.nodes.find((node) => node.id === "n1")?.label, "Alpha renamed");
    assert.match(harness.statusText(), /Unsaved changes: yes/);

    await clickButton("Undo");
    await waitFor(() => assert.equal(harness.api.replaceCalls.length, 2));
    assert.equal(harness.api.graph.nodes.find((node) => node.id === "n1")?.label, "Alpha");

    await clickButton("Redo");
    await waitFor(() => assert.equal(harness.api.replaceCalls.length, 3));
    assert.equal(harness.api.graph.nodes.find((node) => node.id === "n1")?.label, "Alpha renamed");

    harness.promptResponses.push("Gamma", "concept");
    await clickButton("Add Node");
    await waitFor(() => assert.equal(harness.api.replaceCalls.length, 4));
    assert.ok(harness.api.graph.nodes.some((node) => node.label === "Gamma" && node.origin === "human"));

    harness.promptResponses.push("Checkpoint");
    await clickButton("Save Snapshot");
    await waitFor(() => assert.equal(harness.api.snapshots.length, 2));
    assert.match(harness.statusText(), /Unsaved changes: no/);
    assert.match(harness.statusText(), /Active snapshot: Checkpoint/);

    harness.promptResponses.push("Snapshot One copy");
    await chooseSnapshotAction("duplicate:snap-1");
    await waitFor(() => assert.equal(harness.api.snapshots.length, 3));
    assert.equal(harness.promptCalls.at(-1), "Duplicate snapshot name?");

    harness.confirmResponses.push(true);
    await chooseSnapshotAction("load:snap-1");
    await waitFor(() => assert.equal(harness.api.loadCalls, 1));
    assert.match(harness.statusText(), /Active snapshot: Snapshot One/);
    assert.match(harness.statusText(), /Nodes: 1/);
    assert.match(harness.statusText(), /Unsaved changes: no/);

    harness.confirmResponses.push(true);
    await chooseSnapshotAction("revert-source");
    await waitFor(() => assert.equal(harness.api.revertCalls, 1));
    assert.match(harness.statusText(), /Active snapshot: working/);
    assert.match(harness.statusText(), /Nodes: 2/);
    assert.match(harness.statusText(), /Unsaved changes: yes/);

    await dispatchPointer(harness.nodes()[0]!, "pointerdown", { pointerId: 2, clientX: 100, clientY: 100 });
    harness.api.rejectNextReplace = new ApiClientError("Invalid graph", 422, "invalid_working_graph", { validationResults: [] });
    await changeAndBlur(harness.inspectorInput("Label"), "Rejected label");
    await waitFor(() => assert.match(harness.statusText(), /invalid_working_graph: Invalid graph/));
    assert.notEqual(harness.api.graph.nodes.find((node) => node.id === "n1")?.label, "Rejected label");
    assert.equal(harness.inspectorInput("Label").value, "Alpha");
    assert.deepEqual(harness.confirmResponses, []);
  } finally {
    await harness.cleanup();
  }
});

test("App-level toolbar wiring covers add edge, delete, merge, and split actions", async () => {
  const harness = await renderHarness();
  try {
    mockSvgRect(harness.svg());
    let [firstNode, secondNode] = harness.nodes();

    await dispatchPointer(firstNode!, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    await dispatchPointer(secondNode!, "pointerdown", { pointerId: 2, clientX: 300, clientY: 100, shiftKey: true });
    harness.promptResponses.push("supports");
    await clickButton("Add Edge");
    await waitFor(() => assert.equal(harness.api.replaceCalls.length, 1));
    assert.ok(harness.api.graph.edges.some((edge) => edge.label === "supports" && edge.source === "n1" && edge.target === "n2"));

    assert.match(harness.inspectorText(), /2 selected \(2 nodes\)/);
    harness.promptResponses.push("Merged AB", "concept");
    await clickButton("Merge Selected");
    await waitFor(() => assert.equal(harness.api.applyPatchCalls.length, 1));
    assert.deepEqual(harness.api.graph.nodes.map((node) => node.label), ["Merged AB"]);

    await dispatchPointer(harness.nodes()[0]!, "pointerdown", { pointerId: 5, clientX: 100, clientY: 100 });
    harness.promptResponses.push("Part A, Part B", "concept");
    await clickButton("Split Selected");
    await waitFor(() => assert.equal(harness.api.applyPatchCalls.length, 2));
    assert.deepEqual(harness.api.graph.nodes.map((node) => node.label).sort(), ["Part A", "Part B"]);

    await dispatchPointer(harness.nodes()[0]!, "pointerdown", { pointerId: 6, clientX: 100, clientY: 100 });
    harness.confirmResponses.push(true);
    await clickButton("Delete Selected");
    await waitFor(() => assert.equal(harness.api.applyPatchCalls.length, 3));
    assert.equal(harness.api.graph.nodes.length, 1);
    assert.equal(harness.api.graph.edges.length, 0);
    assert.match(harness.statusText(), /Pi: complete/);
    assert.deepEqual(harness.confirmResponses, []);
  } finally {
    await harness.cleanup();
  }
});

async function renderHarness() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { pretendToBeVisual: true });
  const previous = installDomGlobals(dom);
  const api = new MockApiClient();
  const promptResponses: string[] = [];
  const confirmResponses: boolean[] = [];
  const promptCalls: string[] = [];
  const confirmCalls: string[] = [];
  const previousPrompt = globalThis.prompt;
  const previousConfirm = globalThis.confirm;
  globalThis.prompt = (message) => {
    promptCalls.push(String(message));
    if (promptResponses.length === 0) {
      throw new Error(`Unexpected prompt: ${String(message)}`);
    }
    return promptResponses.shift() ?? null;
  };
  globalThis.confirm = (message) => {
    confirmCalls.push(String(message));
    if (confirmResponses.length === 0) {
      throw new Error(`Unexpected confirm: ${String(message)}`);
    }
    return confirmResponses.shift() ?? false;
  };

  let root: Root | null = null;
  await act(async () => {
    root = createRoot(document.getElementById("root")!);
    root.render(React.createElement(App, { apiClient: api }));
  });
  await waitFor(() => assert.match(document.body.textContent ?? "", /Status: ready/));

  return {
    api,
    promptResponses,
    confirmResponses,
    promptCalls,
    confirmCalls,
    svg: () => document.querySelector("svg.graph-svg") as SVGSVGElement,
    background: () => document.querySelector("rect.canvas-hitbox") as SVGRectElement,
    viewport: () => document.querySelector("g.graph-viewport") as SVGGElement,
    nodes: () => Array.from(document.querySelectorAll("g.node")) as SVGGElement[],
    edge: () => document.querySelector("g.edge") as SVGGElement,
    inspectorText: () => normalizedText(document.querySelector(".inspector-panel")?.textContent ?? ""),
    statusText: () => normalizedText(document.querySelector(".status-bar")?.textContent ?? ""),
    inspectorInput: (label: string) => inputAfterLabel(label),
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      globalThis.prompt = previousPrompt;
      globalThis.confirm = previousConfirm;
      restoreDomGlobals(previous);
      dom.window.close();
    }
  };
}

class MockApiClient implements FrontendApiClient {
  graph = sampleGraph();
  snapshots: SnapshotMeta[] = [{ snapshotId: "snap-1", name: "Snapshot One", nodeCount: 1, edgeCount: 0, createdAt: "2026-05-24T00:00:00.000Z" }];
  replaceCalls: GraphState[] = [];
  applyPatchCalls: GraphPatch[] = [];
  loadCalls = 0;
  revertCalls = 0;
  rejectNextReplace: ApiClientError | null = null;

  async fetchHealth(): Promise<HealthResponse> {
    return { ok: true, version: "test", piCoderAvailable: false };
  }

  async fetchSourceMeta(): Promise<GraphMeta> {
    return { graphId: "source-test", name: "Source Test", stateType: "source", nodeCount: 2, edgeCount: 1, readOnly: true };
  }

  async fetchSourceGraph(): Promise<GraphState> {
    return { ...sampleGraph(), graphId: "source-test", name: "Source Test", stateType: "source" };
  }

  async fetchWorkingGraph(): Promise<GraphState> {
    return structuredClone(this.graph);
  }

  async fetchSnapshots(): Promise<SnapshotMeta[]> {
    return structuredClone(this.snapshots);
  }

  async replaceWorkingGraph(graph: GraphState): Promise<ReplaceWorkingGraphResponse> {
    this.replaceCalls.push(structuredClone(graph));
    if (this.rejectNextReplace) {
      const error = this.rejectNextReplace;
      this.rejectNextReplace = null;
      throw error;
    }
    this.graph = { ...structuredClone(graph), updatedAt: "2026-05-24T00:00:01.000Z" };
    return { graph: structuredClone(this.graph), validationResults: [] };
  }

  async createSnapshot(request: CreateSnapshotRequest): Promise<CreateSnapshotResponse> {
    const snapshot = { snapshotId: `snap-${this.snapshots.length + 1}`, name: request.name, notes: request.notes, nodeCount: this.graph.nodes.length, edgeCount: this.graph.edges.length, createdAt: "2026-05-24T00:00:00.000Z" };
    this.snapshots = [...this.snapshots, snapshot];
    return { snapshot };
  }

  async loadSnapshot(snapshotId: string): Promise<LoadSnapshotResponse> {
    this.loadCalls += 1;
    const snapshot = this.snapshots.find((candidate) => candidate.snapshotId === snapshotId) ?? this.snapshots[0]!;
    this.graph = { ...sampleGraph(), graphId: `working-${snapshot.snapshotId}`, name: snapshot.name, stateType: "snapshot", nodes: [{ id: "n1", label: snapshot.name, type: "concept", origin: "human" }], edges: [] };
    return { graph: structuredClone(this.graph), snapshot, actionSummary: summary(`Load snapshot '${snapshot.name}'`, "Loaded snapshot", { updatedNodes: ["n1"] }) };
  }

  async duplicateSnapshot(snapshotId: string, request: DuplicateSnapshotRequest): Promise<DuplicateSnapshotResponse> {
    const source = this.snapshots.find((candidate) => candidate.snapshotId === snapshotId) ?? this.snapshots[0]!;
    const snapshot = { ...source, snapshotId: `snap-${this.snapshots.length + 1}`, name: request.name, notes: request.notes ?? source.notes };
    this.snapshots = [...this.snapshots, snapshot];
    return { snapshot };
  }

  async revertToSource(): Promise<RevertToSourceResponse> {
    this.revertCalls += 1;
    this.graph = sampleGraph();
    return { graph: structuredClone(this.graph), actionSummary: summary("Revert to source", "Reverted to source", { updatedNodes: this.graph.nodes.map((node) => node.id), updatedEdges: this.graph.edges.map((edge) => edge.id) }) };
  }

  async applyPatch(patch: GraphPatch): Promise<ApplyPatchResponse> {
    this.applyPatchCalls.push(structuredClone(patch));
    const result = applyGraphPatch(this.graph, patch);
    if (result.validationResults.some((validationResult) => validationResult.level === "blocker")) {
      throw new ApiClientError("Invalid patch", 422, "invalid_patch", { validationResults: result.validationResults });
    }
    this.graph = structuredClone(result.graph);
    return { graph: structuredClone(this.graph), appliedPatch: patch, validationResults: result.validationResults, actionSummary: result.actionSummary, changedElementIds: result.changedElementIds };
  }
}

function sampleGraph(): GraphState {
  return {
    graphId: "working-test",
    name: "Working Test",
    stateType: "working",
    nodes: [
      { id: "n1", label: "Alpha", type: "concept", origin: "source", notes: "First node" },
      { id: "n2", label: "Beta", type: "concept", origin: "human" }
    ],
    edges: [{ id: "e1", source: "n1", target: "n2", label: "connects", origin: "source" }],
    layout: {
      n1: { x: 100, y: 100 },
      n2: { x: 300, y: 100 }
    },
    updatedAt: "2026-05-24T00:00:00.000Z"
  };
}

function summary(title: string, instruction: string, changes: Partial<ActionSummary> = {}): ActionSummary {
  return {
    title,
    instruction,
    addedNodes: [],
    updatedNodes: [],
    deletedNodes: [],
    addedEdges: [],
    updatedEdges: [],
    deletedEdges: [],
    mergedNodes: [],
    splitNodes: [],
    warnings: [],
    ...changes
  };
}

function installDomGlobals(dom: JSDOM) {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    SVGElement: globalThis.SVGElement,
    Element: globalThis.Element,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    FocusEvent: globalThis.FocusEvent,
    WheelEvent: globalThis.WheelEvent,
    PointerEvent: globalThis.PointerEvent,
    IS_REACT_ACT_ENVIRONMENT: (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  };

  setGlobal("window", dom.window);
  setGlobal("document", dom.window.document);
  setGlobal("navigator", dom.window.navigator);
  setGlobal("HTMLElement", dom.window.HTMLElement);
  setGlobal("SVGElement", dom.window.SVGElement);
  setGlobal("Element", dom.window.Element);
  setGlobal("Event", dom.window.Event);
  setGlobal("MouseEvent", dom.window.MouseEvent);
  setGlobal("FocusEvent", dom.window.FocusEvent);
  setGlobal("WheelEvent", dom.window.WheelEvent);
  setGlobal("PointerEvent", dom.window.PointerEvent ?? TestPointerEvent);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(dom.window.Element.prototype, "setPointerCapture", { value: () => undefined, configurable: true });
  return previous;
}

function restoreDomGlobals(previous: ReturnType<typeof installDomGlobals>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      Reflect.deleteProperty(globalThis, key);
    } else {
      setGlobal(key, value);
    }
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

class TestPointerEvent extends Event {
  pointerId: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.shiftKey = init.shiftKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
  }
}

function mockSvgRect(svg: SVGSVGElement): void {
  Object.defineProperty(svg, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT, x: 0, y: 0, toJSON: () => undefined }),
    configurable: true
  });
}

async function dispatchPointer(target: Element, type: string, init: PointerEventInit): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init }));
  });
}

async function dispatchClick(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function dispatchWheel(target: Element, init: WheelEventInit): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }));
  });
}

async function clickButton(name: string): Promise<void> {
  const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent === name) as HTMLButtonElement | undefined;
  assert.ok(button, `Missing button '${name}'`);
  await dispatchClick(button);
}

async function chooseSnapshotAction(value: string): Promise<void> {
  const select = document.querySelector(".snapshot-picker select") as HTMLSelectElement | null;
  assert.ok(select, "Missing snapshot select");
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeAndBlur(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

function inputAfterLabel(label: string): HTMLInputElement {
  const labels = Array.from(document.querySelectorAll(".inspector-panel label"));
  const matching = labels.find((candidate) => normalizedText(candidate.textContent ?? "").startsWith(label));
  assert.ok(matching, `Missing inspector label '${label}'`);
  const input = matching.querySelector("input") as HTMLInputElement | null;
  assert.ok(input, `Missing input for '${label}'`);
  return input;
}

function assertPositionClose(actual: { x: number; y: number } | undefined, expected: { x: number; y: number }): void {
  assert.ok(actual, "Expected a persisted node layout position");
  assert.ok(Math.abs(actual.x - expected.x) < 0.000001, `Expected x ${actual.x} to be close to ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 0.000001, `Expected y ${actual.y} to be close to ${expected.y}`);
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function waitFor(assertion: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (lastError) {
    throw lastError;
  }
}
