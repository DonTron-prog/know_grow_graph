import cytoscape from 'cytoscape';
import type { Core, EventObject, NodeSingular, EdgeSingular } from 'cytoscape';
import './styles/app.css';
import { toCytoscapeElements } from './graph/cytoscapeAdapter';
import { connectedEdges, relationshipCounts } from './graph/metrics';
import { loadGraph, saveLayout } from './graph/storage';
import type { GraphPosition, KnowledgeGraph } from './graph/types';

interface AppState {
  graph: KnowledgeGraph;
  source: 'working' | 'fixture';
  selectedId?: string;
  selectedKind?: 'concept' | 'relationship';
  layoutStatus: 'saved' | 'unsaved';
  loading: boolean;
  saving: boolean;
  message?: string;
  error?: string;
}

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('App root not found.');
}

const app = appRoot;

let state: AppState = {
  graph: loadGraph().graph,
  source: 'fixture',
  layoutStatus: 'saved',
  loading: false,
  saving: false,
};
let cy: Core | undefined;

function loadIntoState(): void {
  const lastValidGraph = state.graph;
  const lastValidSource = state.source;
  state = { ...state, loading: true, error: undefined, message: undefined };
  renderShell();
  try {
    const result = loadGraph();
    const recoveredFromInvalidSavedGraph = !result.validation.ok;
    state = {
      graph: recoveredFromInvalidSavedGraph ? lastValidGraph : result.graph,
      source: recoveredFromInvalidSavedGraph ? lastValidSource : result.source,
      layoutStatus: 'saved',
      loading: false,
      saving: false,
      message: result.recoveryMessage ?? `Loaded ${result.source === 'working' ? 'saved working graph' : 'example Agentic AI graph'}.`,
      error: result.validation.errors.length > 0 ? result.validation.errors.map((error) => error.message).join(' ') : undefined,
    };
  } catch (error) {
    state = { ...state, graph: lastValidGraph, source: lastValidSource, loading: false, error: error instanceof Error ? error.message : 'Graph load failed.' };
  }
  renderShell();
  mountGraph();
}

function renderShell(): void {
  app.innerHTML = `
    <main class="workbench">
      <header class="toolbar" aria-label="Graph actions">
        <div class="brand">
          <strong>Know Grow Graph</strong>
          <span>${state.graph.name}</span>
        </div>
        <button type="button" data-action="reload">Reload graph</button>
        <button type="button" data-action="fit">Fit</button>
        <button type="button" data-action="reset-layout">Reset layout</button>
        <button type="button" data-action="save-layout" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Saving…' : 'Save layout'}</button>
      </header>
      <section class="status-strip" aria-live="polite">
        <span>${state.loading ? 'Loading graph…' : `${state.graph.nodes.length} concepts`}</span>
        <span>${state.graph.edges.length} relationships</span>
        <span>${state.selectedId ? '1 selected' : '0 selected'}</span>
        <span>Layout ${state.layoutStatus}</span>
        <span>Source: ${state.source}</span>
      </section>
      ${state.message ? `<p class="message">${escapeHtml(state.message)}</p>` : ''}
      ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)} <button type="button" data-action="reload">Retry</button></p>` : ''}
      <section class="workspace">
        <aside class="inspector" aria-label="Graph inspector">${renderInspector()}</aside>
        <div class="graph-panel">
          <div id="cy" aria-label="Concept graph"></div>
        </div>
        <aside class="agent-panel" aria-label="Future agent panel">
          <h2>Agent panel</h2>
          <p>Disabled until graph review and manual editing are dependable.</p>
        </aside>
      </section>
    </main>`;

  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('click', () => handleAction(button.dataset.action));
  });
}

function renderInspector(): string {
  if (state.selectedKind === 'concept' && state.selectedId) {
    const concept = state.graph.nodes.find((node) => node.id === state.selectedId);
    if (!concept) return unavailableSelection();
    const counts = relationshipCounts(state.graph);
    const relationships = connectedEdges(state.graph, concept.id);
    return `
      <h2>${escapeHtml(concept.label)}</h2>
      <dl>
        <dt>ID</dt><dd>${escapeHtml(concept.id)}</dd>
        <dt>Type</dt><dd>${escapeHtml(concept.type)}</dd>
        <dt>Origin</dt><dd>${escapeHtml(concept.origin ?? 'unknown')}</dd>
        <dt>Connected concepts</dt><dd>${counts.get(concept.id) ?? 0}</dd>
        <dt>Notes</dt><dd>${escapeHtml(concept.notes ?? 'No notes available.')}</dd>
      </dl>
      <h3>Connected relationships</h3>
      <ul>${relationships.map((edge) => `<li>${escapeHtml(edge.source)} — ${escapeHtml(edge.label)} → ${escapeHtml(edge.target)}</li>`).join('')}</ul>
      <button type="button" data-action="clear-selection">Clear selection</button>`;
  }

  if (state.selectedKind === 'relationship' && state.selectedId) {
    const relationship = state.graph.edges.find((edge) => edge.id === state.selectedId);
    if (!relationship) return unavailableSelection();
    const source = state.graph.nodes.find((node) => node.id === relationship.source)?.label ?? relationship.source;
    const target = state.graph.nodes.find((node) => node.id === relationship.target)?.label ?? relationship.target;
    return `
      <h2>${escapeHtml(relationship.label)}</h2>
      <dl>
        <dt>ID</dt><dd>${escapeHtml(relationship.id)}</dd>
        <dt>Source</dt><dd>${escapeHtml(source)}</dd>
        <dt>Target</dt><dd>${escapeHtml(target)}</dd>
        <dt>Origin</dt><dd>${escapeHtml(relationship.origin ?? 'unknown')}</dd>
        <dt>Notes</dt><dd>${escapeHtml(relationship.notes ?? 'No notes available.')}</dd>
      </dl>
      <button type="button" data-action="clear-selection">Clear selection</button>`;
  }

  return `
    <h2>Graph summary</h2>
    <dl>
      <dt>Name</dt><dd>${escapeHtml(state.graph.name)}</dd>
      <dt>ID</dt><dd>${escapeHtml(state.graph.graphId)}</dd>
      <dt>Concepts</dt><dd>${state.graph.nodes.length}</dd>
      <dt>Relationships</dt><dd>${state.graph.edges.length}</dd>
      <dt>Layout</dt><dd>${state.layoutStatus}</dd>
    </dl>
    <p>Select a concept or relationship to inspect details.</p>`;
}

function unavailableSelection(): string {
  return `
    <h2>Selection unavailable</h2>
    <p>The selected element is no longer available in the current graph.</p>
    <button type="button" data-action="clear-selection">Clear selection</button>`;
}

function updateStatusStrip(): void {
  const statusStrip = document.querySelector<HTMLElement>('.status-strip');
  if (!statusStrip) return;
  statusStrip.innerHTML = `
    <span>${state.graph.nodes.length} concepts</span>
    <span>${state.graph.edges.length} relationships</span>
    <span>${state.selectedId ? '1 selected' : '0 selected'}</span>
    <span>Layout ${state.layoutStatus}</span>
    <span>Source: ${state.source}</span>`;
}

function mountGraph(): void {
  const container = document.querySelector<HTMLDivElement>('#cy');
  if (!container) return;

  try {
    cy?.destroy();
    cy = cytoscape({
      container,
      elements: toCytoscapeElements(state.graph),
      layout: { name: 'preset', fit: true, padding: 50 },
      wheelSensitivity: 0.2,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': '13px',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '120px',
            color: '#172033',
            'background-color': '#f8fafc',
            'border-color': '#315d9b',
            'border-width': '2px',
            width: 'mapData(relationshipCount, 0, 5, 54, 96)',
            height: 'mapData(relationshipCount, 0, 5, 54, 96)',
          },
        },
        { selector: 'node.origin-source', style: { 'background-color': '#e0f2fe', 'border-color': '#0369a1' } },
        { selector: 'node:selected', style: { 'background-color': '#fde68a', 'border-color': '#92400e', 'border-width': '4px' } },
        { selector: 'node.hovered', style: { 'border-width': '5px', 'border-color': '#2563eb' } },
        {
          selector: 'edge',
          style: {
            label: 'data(label)',
            'font-size': '11px',
            color: '#475569',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#64748b',
            'line-color': '#94a3b8',
            width: '2px',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
          },
        },
        { selector: 'edge:selected', style: { 'line-color': '#ca8a04', 'target-arrow-color': '#ca8a04', width: '4px' } },
        { selector: 'edge.hovered', style: { 'line-color': '#2563eb', 'target-arrow-color': '#2563eb', width: '4px' } },
      ],
    });

    cy.on('tap', 'node', (event) => selectConcept(event.target as NodeSingular));
    cy.on('tap', 'edge', (event) => selectRelationship(event.target as EdgeSingular));
    cy.on('tap', (event: EventObject) => {
      if (event.target === cy) clearSelection();
    });
    cy.on('mouseover', 'node, edge', (event) => event.target.addClass('hovered'));
    cy.on('mouseout', 'node, edge', (event) => event.target.removeClass('hovered'));
    cy.on('dragfree', 'node', () => {
      state.layoutStatus = 'unsaved';
      updateStatusStrip();
    });
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Graph rendering failed.';
    renderShell();
  }
}

function selectConcept(node: NodeSingular): void {
  state.selectedId = node.id();
  state.selectedKind = 'concept';
  renderShell();
  mountGraph();
  cy?.getElementById(state.selectedId).select();
}

function selectRelationship(edge: EdgeSingular): void {
  state.selectedId = edge.id();
  state.selectedKind = 'relationship';
  renderShell();
  mountGraph();
  cy?.getElementById(state.selectedId).select();
}

function clearSelection(): void {
  state.selectedId = undefined;
  state.selectedKind = undefined;
  cy?.elements().unselect();
  renderShell();
  mountGraph();
}

function handleAction(action: string | undefined): void {
  switch (action) {
    case 'reload':
      loadIntoState();
      break;
    case 'fit':
      cy?.fit(undefined, 50);
      break;
    case 'reset-layout':
      cy?.layout({ name: 'cose', animate: false, padding: 50 }).run();
      state.layoutStatus = 'unsaved';
      updateStatusStrip();
      break;
    case 'save-layout':
      saveCurrentLayout();
      break;
    case 'clear-selection':
      clearSelection();
      break;
  }
}

function saveCurrentLayout(): void {
  if (!cy) return;

  const positions: Record<string, GraphPosition> = {};
  cy.nodes().forEach((node) => {
    positions[node.id()] = node.position();
  });

  state.saving = true;

  try {
    state.graph = saveLayout(state.graph, positions);
    state.source = 'working';
    state.layoutStatus = 'saved';
    state.message = 'Layout saved in this browser.';
    state.error = undefined;
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Layout save failed.';
  } finally {
    state.saving = false;
    renderShell();
    mountGraph();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

loadIntoState();
