import cytoscape from 'cytoscape';
import type { Core, EventObject, NodeSingular, EdgeSingular } from 'cytoscape';
import './styles/app.css';
import { toCytoscapeElements } from './graph/cytoscapeAdapter';
import { answerGraphQuestion } from './graph/agentQuestions';
import { connectedEdges, relationshipCounts } from './graph/metrics';
import { createConcept, createRelationship, deleteConcept, deleteRelationship, moveConcept, updateConcept, updateRelationship } from './graph/mutations';
import { loadGraph, saveGraph, saveLayout } from './graph/storage';
import { validateGraph } from './graph/validation';
import type { GraphQuestionAnswer } from './graph/agentQuestions';
import type { GraphMutationResult } from './graph/mutations';
import type { GraphPosition, KnowledgeGraph } from './graph/types';

interface AppState {
  graph: KnowledgeGraph;
  source: 'working' | 'fixture';
  selectedId?: string;
  selectedKind?: 'concept' | 'relationship';
  layoutStatus: 'saved' | 'unsaved';
  loading: boolean;
  saving: boolean;
  editMode: boolean;
  warnings: string[];
  agentQuestion: string;
  agentAnswer?: GraphQuestionAnswer;
  message?: string;
  error?: string;
}

interface GraphViewport {
  zoom: number;
  pan: GraphPosition;
}

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('App root not found.');
}

const app = appRoot;

const initialLoad = loadGraph();

let state: AppState = {
  graph: initialLoad.graph,
  source: initialLoad.source,
  layoutStatus: 'saved',
  loading: false,
  saving: false,
  editMode: false,
  warnings: validationWarnings(initialLoad.validation),
  agentQuestion: '',
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
      editMode: state.editMode,
      warnings: recoveredFromInvalidSavedGraph ? [] : validationWarnings(result.validation),
      agentQuestion: state.agentQuestion,
      agentAnswer: undefined,
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
          <span>${escapeHtml(state.graph.name)}</span>
        </div>
        <button type="button" data-action="reload">Reload graph</button>
        <button type="button" data-action="fit">Fit</button>
        <button type="button" data-action="reset-layout">Reset layout</button>
        <button type="button" data-action="save-layout" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Saving…' : 'Save layout'}</button>
        <button type="button" data-action="toggle-edit-mode" class="${state.editMode ? 'active' : ''}">${state.editMode ? 'Content editing active' : 'Turn on content editing'}</button>
        <button type="button" data-action="add-concept">Add concept</button>
        <button type="button" data-action="add-relationship">Add relationship</button>
        <button type="button" data-action="edit-selected">Edit selected</button>
        <button type="button" data-action="delete-selected">Delete selected</button>
      </header>
      <section class="status-strip" aria-live="polite">
        <span>${state.loading ? 'Loading graph…' : `${state.graph.nodes.length} concepts`}</span>
        <span>${state.graph.edges.length} relationships</span>
        <span>${state.selectedId ? '1 selected' : '0 selected'}</span>
        <span>Layout ${state.layoutStatus}</span>
        <span>Source: ${state.source}</span>
        <span>${state.editMode ? 'Content editing on' : 'Review mode'}</span>
        ${state.warnings.length > 0 ? `<span>${state.warnings.length} warning${state.warnings.length === 1 ? '' : 's'}</span>` : ''}
      </section>
      ${state.message ? `<p class="message">${escapeHtml(state.message)}</p>` : ''}
      ${renderWarnings()}
      ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)} Continue reviewing the visible graph, or retry loading. <button type="button" data-action="reload">Retry</button></p>` : ''}
      <section class="workspace">
        <aside class="inspector" aria-label="Graph inspector">${renderInspector()}</aside>
        <div class="graph-panel">
          <div id="cy" aria-label="Concept graph"></div>
        </div>
        <aside class="agent-panel" aria-label="Agent graph question panel">${renderAgentPanel()}</aside>
      </section>
    </main>`;

  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('click', () => handleAction(button.dataset.action));
  });
  app.querySelector<HTMLFormElement>('[data-agent-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    askAgentQuestion();
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

function renderAgentPanel(): string {
  const answer = state.agentAnswer;
  return `
    <h2>Graph questions</h2>
    <p class="panel-note">Ask about visible concepts or relationships. Answers are grounded in the current graph and do not change graph content.</p>
    <form class="agent-form" data-agent-form>
      <label for="agent-question">Question</label>
      <textarea id="agent-question" rows="4" placeholder="What is Agent Loop connected to?">${escapeHtml(state.agentQuestion)}</textarea>
      <button type="submit">Ask from graph</button>
    </form>
    ${answer ? `
      <section class="agent-answer ${answer.answered ? '' : 'unanswered'}" aria-live="polite">
        <h3>${answer.answered ? 'Grounded answer' : 'Cannot answer from graph'}</h3>
        <p>${escapeHtml(answer.answer)}</p>
        ${answer.evidence.length > 0 ? `<h4>Evidence</h4><ul>${answer.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      </section>` : '<p class="panel-note">Try a summary question, a concept label, or a relationship label.</p>'}`;
}

function updateStatusStrip(): void {
  const statusStrip = document.querySelector<HTMLElement>('.status-strip');
  if (!statusStrip) return;
  statusStrip.innerHTML = `
    <span>${state.graph.nodes.length} concepts</span>
    <span>${state.graph.edges.length} relationships</span>
    <span>${state.selectedId ? '1 selected' : '0 selected'}</span>
    <span>Layout ${state.layoutStatus}</span>
    <span>Source: ${state.source}</span>
    <span>${state.editMode ? 'Content editing on' : 'Review mode'}</span>
    ${state.warnings.length > 0 ? `<span>${state.warnings.length} warning${state.warnings.length === 1 ? '' : 's'}</span>` : ''}`;
}

function mountGraph(viewport?: GraphViewport): void {
  const container = document.querySelector<HTMLDivElement>('#cy');
  if (!container) return;

  try {
    cy?.destroy();
    cy = cytoscape({
      container,
      elements: toCytoscapeElements(state.graph),
      layout: { name: 'preset', fit: viewport ? false : true, padding: 50 },
      wheelSensitivity: 0.2,
      autoungrabify: !state.editMode,
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
    cy.on('dragfree', 'node', (event) => {
      if (!state.editMode) return;
      try {
        state.graph = moveConcept(state.graph, event.target.id(), event.target.position()).graph;
        state.layoutStatus = 'unsaved';
        updateStatusStrip();
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Concept repositioning failed.';
        renderShell();
        mountGraph();
      }
    });
    if (viewport) {
      cy.zoom(viewport.zoom);
      cy.pan(viewport.pan);
    }
    if (state.selectedId) cy.getElementById(state.selectedId).select();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Graph rendering failed.';
    renderShell();
  }
}

function currentViewport(): GraphViewport | undefined {
  if (!cy) return undefined;
  return { zoom: cy.zoom(), pan: cy.pan() };
}

function selectConcept(node: NodeSingular): void {
  const viewport = currentViewport();
  state.selectedId = node.id();
  state.selectedKind = 'concept';
  renderShell();
  mountGraph(viewport);
  cy?.getElementById(state.selectedId).select();
}

function selectRelationship(edge: EdgeSingular): void {
  const viewport = currentViewport();
  state.selectedId = edge.id();
  state.selectedKind = 'relationship';
  renderShell();
  mountGraph(viewport);
  cy?.getElementById(state.selectedId).select();
}

function clearSelection(): void {
  const viewport = currentViewport();
  state.selectedId = undefined;
  state.selectedKind = undefined;
  cy?.elements().unselect();
  renderShell();
  mountGraph(viewport);
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
      rememberCurrentLayout();
      state.layoutStatus = 'unsaved';
      updateStatusStrip();
      break;
    case 'save-layout':
      saveCurrentLayout();
      break;
    case 'toggle-edit-mode':
      state.editMode = !state.editMode;
      state.message = state.editMode ? 'Content editing is active. Changes are validated before replacing the working graph.' : 'Review mode is active. Content changes and direct concept dragging are disabled.';
      renderShell();
      mountGraph();
      break;
    case 'add-concept':
      addConceptFromPrompt();
      break;
    case 'add-relationship':
      addRelationshipFromPrompt();
      break;
    case 'edit-selected':
      editSelectedFromPrompt();
      break;
    case 'delete-selected':
      deleteSelectedFromPrompt();
      break;
    case 'ask-agent':
      askAgentQuestion();
      break;
    case 'clear-selection':
      clearSelection();
      break;
  }
}

function askAgentQuestion(): void {
  const viewport = currentViewport();
  const input = document.querySelector<HTMLTextAreaElement>('#agent-question');
  const question = input?.value ?? state.agentQuestion;
  state.agentQuestion = question;

  try {
    state.agentAnswer = answerGraphQuestion(state.graph, question);
    state.message = state.agentAnswer.answered ? 'Answered from the current graph.' : undefined;
    state.error = undefined;
  } catch (error) {
    state.agentAnswer = {
      question,
      answered: false,
      answer: 'The graph question helper failed, but the graph remains available for review.',
      evidence: [],
    };
    state.error = error instanceof Error ? error.message : state.agentAnswer.answer;
  }

  renderShell();
  mountGraph(viewport);
}

function ensureEditing(): boolean {
  if (state.editMode) return true;
  state.error = 'Enable content editing before changing the graph.';
  renderShell();
  mountGraph();
  return false;
}

function visibleCenter(): GraphPosition {
  if (!cy) return { x: 0, y: 0 };
  const extent = cy.extent();
  return { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };
}

function applyMutation(message: string, mutation: () => GraphMutationResult, selectKind?: 'concept' | 'relationship'): void {
  if (!ensureEditing()) return;

  try {
    const result = mutation();
    const savedGraph = saveGraph(result.graph);
    state.graph = savedGraph;
    state.source = 'working';
    state.layoutStatus = 'saved';
    state.message = message;
    state.error = undefined;
    state.warnings = graphWarnings(savedGraph);
    state.selectedKind = selectKind;
    state.selectedId = selectKind ? result.changedId : undefined;
    renderShell();
    mountGraph();
    if (state.selectedId) cy?.getElementById(state.selectedId).select();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Graph change was rejected.';
    state.message = undefined;
    renderShell();
    mountGraph();
  }
}

function addConceptFromPrompt(): void {
  if (!ensureEditing()) return;
  const label = window.prompt('Concept label');
  if (label === null) return;
  const type = window.prompt('Concept type', 'concept');
  if (type === null) return;
  const notes = window.prompt('Concept notes (optional)', '') ?? undefined;
  applyMutation('Concept added to the working graph.', () => createConcept(state.graph, { label, type, notes, position: visibleCenter() }), 'concept');
}

function addRelationshipFromPrompt(): void {
  if (!ensureEditing()) return;
  const defaultSource = state.selectedKind === 'concept' ? state.selectedId : state.graph.nodes[0]?.id;
  const source = window.prompt('Source concept id', defaultSource ?? '');
  if (source === null) return;
  const target = window.prompt('Target concept id', state.graph.nodes.find((node) => node.id !== source)?.id ?? '');
  if (target === null) return;
  const label = window.prompt('Relationship label');
  if (label === null) return;
  const notes = window.prompt('Relationship notes (optional)', '') ?? undefined;
  applyMutation('Relationship added to the working graph.', () => createRelationship(state.graph, { source, target, label, notes }), 'relationship');
}

function editSelectedFromPrompt(): void {
  if (!ensureEditing()) return;
  if (!state.selectedId || !state.selectedKind) {
    state.error = 'Select a concept or relationship before editing.';
    renderShell();
    mountGraph();
    return;
  }

  if (state.selectedKind === 'concept') {
    const concept = state.graph.nodes.find((node) => node.id === state.selectedId);
    if (!concept) {
      state.error = 'Selected concept is no longer available.';
      renderShell();
      mountGraph();
      return;
    }
    const label = window.prompt('Concept label', concept.label);
    if (label === null) return;
    const type = window.prompt('Concept type', concept.type);
    if (type === null) return;
    const notes = window.prompt('Concept notes (optional)', concept.notes ?? '') ?? undefined;
    applyMutation('Concept updated in the working graph.', () => updateConcept(state.graph, concept.id, { label, type, notes }), 'concept');
    return;
  }

  const relationship = state.graph.edges.find((edge) => edge.id === state.selectedId);
  if (!relationship) {
    state.error = 'Selected relationship is no longer available.';
    renderShell();
    mountGraph();
    return;
  }
  const label = window.prompt('Relationship label', relationship.label);
  if (label === null) return;
  const notes = window.prompt('Relationship notes (optional)', relationship.notes ?? '') ?? undefined;
  applyMutation('Relationship updated in the working graph.', () => updateRelationship(state.graph, relationship.id, { label, notes }), 'relationship');
}

function deleteSelectedFromPrompt(): void {
  if (!ensureEditing()) return;
  if (!state.selectedId || !state.selectedKind) {
    state.error = 'Select a concept or relationship before deleting.';
    renderShell();
    mountGraph();
    return;
  }
  const selectedId = state.selectedId;
  const selectedKind = state.selectedKind;
  const connectedCount = selectedKind === 'concept' ? connectedEdges(state.graph, selectedId).length : 0;
  const warning = selectedKind === 'concept' && connectedCount > 0 ? ` This will also remove ${connectedCount} connected relationship${connectedCount === 1 ? '' : 's'} to prevent dangling references.` : '';
  if (!window.confirm(`Delete selected ${selectedKind}?${warning}`)) return;

  applyMutation(
    `${selectedKind === 'concept' ? 'Concept' : 'Relationship'} deleted from the working graph.`,
    () => selectedKind === 'concept' ? deleteConcept(state.graph, selectedId) : deleteRelationship(state.graph, selectedId),
  );
}

function rememberCurrentLayout(): void {
  if (!cy) return;
  try {
    cy.nodes().forEach((node) => {
      state.graph = moveConcept(state.graph, node.id(), node.position()).graph;
    });
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Layout update failed.';
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
    state.warnings = graphWarnings(state.graph);
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Layout save failed.';
  } finally {
    state.saving = false;
    renderShell();
    mountGraph();
  }
}

function validationWarnings(validation: { warnings: Array<{ message: string }> }): string[] {
  return validation.warnings.map((warning) => warning.message);
}

function graphWarnings(graph: KnowledgeGraph): string[] {
  return validationWarnings(validateGraph(graph));
}

function renderWarnings(): string {
  if (state.warnings.length === 0) return '';

  const visibleWarnings = state.warnings.slice(0, 3);
  const hiddenCount = state.warnings.length - visibleWarnings.length;
  return `
    <section class="warning" role="status" aria-label="Recoverable graph warnings">
      <strong>Recoverable graph warning${state.warnings.length === 1 ? '' : 's'}</strong>
      <ul>
        ${visibleWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}
        ${hiddenCount > 0 ? `<li>${hiddenCount} more warning${hiddenCount === 1 ? '' : 's'} hidden to keep review focused.</li>` : ''}
      </ul>
      <p>The graph remains available; continue reviewing or save a corrected working graph.</p>
    </section>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

loadIntoState();
