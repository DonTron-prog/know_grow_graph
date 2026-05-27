import cytoscape from 'cytoscape';
import type { Core, EventObject, NodeSingular, EdgeSingular } from 'cytoscape';
import './styles/app.css';
import { toCytoscapeElements } from './graph/cytoscapeAdapter';
import { answerGraphQuestion } from './graph/agentQuestions';
import { canRedo, canUndo, emptyGraphHistory, redoGraph, rememberGraph, undoGraph } from './graph/history';
import { connectedEdges, relationshipCounts } from './graph/metrics';
import { createConcept, createConceptWithRelationships, createRelationship, deleteConcept, deleteRelationship, moveConcept, updateConcept, updateRelationship } from './graph/mutations';
import { loadGraph, saveGraph, saveLayout } from './graph/storage';
import { validateGraph } from './graph/validation';
import type { GraphQuestionAnswer } from './graph/agentQuestions';
import type { GraphHistory, GraphHistoryStep } from './graph/history';
import type { GraphMutationResult } from './graph/mutations';
import type { GraphPosition, KnowledgeGraph } from './graph/types';

interface AppState {
  graph: KnowledgeGraph;
  source: 'working' | 'fixture';
  selectedId?: string;
  selectedKind?: 'concept' | 'relationship';
  selectedConceptIds: string[];
  activeDialog?: 'concept' | 'relationship';
  layoutStatus: 'saved' | 'unsaved';
  loading: boolean;
  saving: boolean;
  editMode: boolean;
  warnings: string[];
  history: GraphHistory;
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
  selectedConceptIds: [],
  warnings: validationWarnings(initialLoad.validation),
  history: emptyGraphHistory(),
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
      selectedConceptIds: [],
      activeDialog: undefined,
      warnings: recoveredFromInvalidSavedGraph ? [] : validationWarnings(result.validation),
      history: emptyGraphHistory(),
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
        <button type="button" data-action="undo" ${state.editMode && canUndo(state.history) ? '' : 'disabled'} title="Undo recent edit (Ctrl/Cmd+Z)">Undo</button>
        <button type="button" data-action="redo" ${state.editMode && canRedo(state.history) ? '' : 'disabled'} title="Redo recent edit (Ctrl/Cmd+Shift+Z or Ctrl+Y)">Redo</button>
        <button type="button" data-action="toggle-edit-mode" class="${state.editMode ? 'active' : ''}">${state.editMode ? 'Content editing active' : 'Turn on content editing'}</button>
        <button type="button" data-action="add-concept">Add concept</button>
        <button type="button" data-action="add-relationship">Add relationship</button>
        <button type="button" data-action="edit-selected">Edit selected</button>
        <button type="button" data-action="delete-selected">Delete selected</button>
      </header>
      <section class="status-strip" aria-live="polite">
        <span>${state.loading ? 'Loading graph…' : `${state.graph.nodes.length} concepts`}</span>
        <span>${state.graph.edges.length} relationships</span>
        <span>${selectionCount()} selected</span>
        <span>Layout ${state.layoutStatus}</span>
        <span>Source: ${state.source}</span>
        <span>${state.editMode ? 'Content editing on' : 'Review mode'}</span>
        ${state.warnings.length > 0 ? `<span>${state.warnings.length} warning${state.warnings.length === 1 ? '' : 's'}</span>` : ''}
        ${state.editMode && canUndo(state.history) ? '<span>Undo available</span>' : ''}
        ${state.editMode && canRedo(state.history) ? '<span>Redo available</span>' : ''}
      </section>
      ${state.message ? `<p class="message">${escapeHtml(state.message)}</p>` : ''}
      ${renderWarnings()}
      ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)} Continue reviewing the visible graph, or retry loading. <button type="button" data-action="reload">Retry</button></p>` : ''}
      ${renderActiveDialog()}
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
  app.querySelector<HTMLFormElement>('[data-concept-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addConceptFromDialog(event.currentTarget as HTMLFormElement);
  });
  app.querySelector<HTMLFormElement>('[data-relationship-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addRelationshipFromDialog(event.currentTarget as HTMLFormElement);
  });
  app.querySelector<HTMLFormElement>('[data-concept-details-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    updateConceptFromDetails(event.currentTarget as HTMLFormElement);
  });
  app.querySelector<HTMLFormElement>('[data-relationship-details-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    updateRelationshipFromDetails(event.currentTarget as HTMLFormElement);
  });
}

function renderInspector(): string {
  if (state.selectedKind === 'concept' && state.selectedConceptIds.length > 1) {
    const selectedConcepts = state.selectedConceptIds
      .map((id) => state.graph.nodes.find((node) => node.id === id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    if (selectedConcepts.length === 0) return unavailableSelection();
    return `
      <h2>${selectedConcepts.length} concepts selected</h2>
      <p class="panel-note">Shift-click order is preserved for relationship defaults and selected-concept creation.</p>
      <ol>${selectedConcepts.map((concept) => `<li>${escapeHtml(concept.label)} <span class="muted">${escapeHtml(concept.id)}</span></li>`).join('')}</ol>
      <button type="button" data-action="add-relationship">Create relationship from selection</button>
      <button type="button" data-action="add-concept">Create connected concept</button>
      <button type="button" data-action="clear-selection">Clear selection</button>`;
  }

  if (state.selectedKind === 'concept' && state.selectedId) {
    const concept = state.graph.nodes.find((node) => node.id === state.selectedId);
    if (!concept) return unavailableSelection();
    const counts = relationshipCounts(state.graph);
    const relationships = connectedEdges(state.graph, concept.id);
    const readonlyDetails = `
      <dl>
        <dt>ID</dt><dd>${escapeHtml(concept.id)}</dd>
        <dt>Type</dt><dd>${escapeHtml(concept.type)}</dd>
        <dt>Origin</dt><dd>${escapeHtml(concept.origin ?? 'unknown')}</dd>
        <dt>Connected concepts</dt><dd>${counts.get(concept.id) ?? 0}</dd>
        <dt>Notes</dt><dd>${escapeHtml(concept.notes ?? 'No notes available.')}</dd>
      </dl>`;
    const editDetails = state.editMode ? `
      <form class="details-form" data-concept-details-form>
        <input type="hidden" name="id" value="${escapeHtml(concept.id)}">
        <label>Label <input name="label" value="${escapeHtml(concept.label)}" required></label>
        <label>Type <input name="type" list="concept-details-type-options" value="${escapeHtml(concept.type)}" required></label>
        <label>Notes <textarea name="notes" rows="4">${escapeHtml(concept.notes ?? '')}</textarea></label>
        ${renderConceptTypeDatalist('concept-details-type-options')}
        <button type="submit">Save details</button>
      </form>` : readonlyDetails;
    return `
      <h2>${escapeHtml(concept.label)}</h2>
      ${editDetails}
      <h3>Connected relationships</h3>
      <ul>${relationships.map((edge) => `<li>${escapeHtml(edge.source)} — ${escapeHtml(edge.label)} → ${escapeHtml(edge.target)}</li>`).join('')}</ul>
      <button type="button" data-action="clear-selection">Clear selection</button>`;
  }

  if (state.selectedKind === 'relationship' && state.selectedId) {
    const relationship = state.graph.edges.find((edge) => edge.id === state.selectedId);
    if (!relationship) return unavailableSelection();
    const source = state.graph.nodes.find((node) => node.id === relationship.source)?.label ?? relationship.source;
    const target = state.graph.nodes.find((node) => node.id === relationship.target)?.label ?? relationship.target;
    const readonlyDetails = `
      <dl>
        <dt>ID</dt><dd>${escapeHtml(relationship.id)}</dd>
        <dt>Source</dt><dd>${escapeHtml(source)}</dd>
        <dt>Target</dt><dd>${escapeHtml(target)}</dd>
        <dt>Origin</dt><dd>${escapeHtml(relationship.origin ?? 'unknown')}</dd>
        <dt>Notes</dt><dd>${escapeHtml(relationship.notes ?? 'No notes available.')}</dd>
      </dl>`;
    const editDetails = state.editMode ? `
      <form class="details-form" data-relationship-details-form>
        <input type="hidden" name="id" value="${escapeHtml(relationship.id)}">
        <dl>
          <dt>Source</dt><dd>${escapeHtml(source)}</dd>
          <dt>Target</dt><dd>${escapeHtml(target)}</dd>
          <dt>Origin</dt><dd>${escapeHtml(relationship.origin ?? 'unknown')}</dd>
        </dl>
        <label>Label <input name="label" value="${escapeHtml(relationship.label)}" required></label>
        <label>Notes <textarea name="notes" rows="4">${escapeHtml(relationship.notes ?? '')}</textarea></label>
        <button type="submit">Save details</button>
      </form>` : readonlyDetails;
    return `
      <h2>${escapeHtml(relationship.label)}</h2>
      ${editDetails}
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

function renderActiveDialog(): string {
  if (!state.activeDialog) return '';
  return state.activeDialog === 'concept' ? renderConceptDialog() : renderRelationshipDialog();
}

function renderConceptDialog(): string {
  const selectedConcepts = selectedConceptsInOrder();
  return `
    <section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="concept-dialog-title">
      <form class="dialog-form" data-concept-form>
        <div class="dialog-header">
          <h2 id="concept-dialog-title">Create concept</h2>
          <button type="button" data-action="close-dialog" aria-label="Close concept dialog">×</button>
        </div>
        <label>Label <input name="label" required autofocus></label>
        <label>Type <input name="type" list="concept-dialog-type-options" value="concept" required></label>
        ${renderConceptTypeDatalist('concept-dialog-type-options')}
        <label>Notes <textarea name="notes" rows="3"></textarea></label>
        ${selectedConcepts.length > 0 ? `
          <fieldset>
            <legend>Connect to selected concepts</legend>
            <p class="panel-note">Optionally creates one relationship to each selected concept as the same accepted, undoable graph change.</p>
            <ol>${selectedConcepts.map((concept) => `<li>${escapeHtml(concept.label)}</li>`).join('')}</ol>
            <label class="inline-field"><input type="checkbox" name="connectSelected" checked> Connect the new concept to every selected concept</label>
            <label>Relationship label <input name="relationshipLabel"></label>
            <label>Direction
              <select name="relationshipDirection">
                <option value="existing-to-new">Selected concepts → new concept</option>
                <option value="new-to-existing">New concept → selected concepts</option>
              </select>
            </label>
            <label>Relationship notes <textarea name="relationshipNotes" rows="2"></textarea></label>
          </fieldset>` : '<p class="panel-note">Select one or more concepts first to create automatic relationships in this same dialog.</p>'}
        <div class="dialog-actions">
          <button type="submit">Create concept</button>
          <button type="button" data-action="close-dialog">Cancel</button>
        </div>
      </form>
    </section>`;
}

function renderRelationshipDialog(): string {
  const [firstSelected, secondSelected] = selectedConceptsInOrder();
  const defaultSource = firstSelected?.id ?? (state.selectedKind === 'concept' ? state.selectedId : undefined) ?? state.graph.nodes[0]?.id ?? '';
  const defaultTarget = secondSelected?.id ?? state.graph.nodes.find((node) => node.id !== defaultSource)?.id ?? '';
  return `
    <section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="relationship-dialog-title">
      <form class="dialog-form" data-relationship-form>
        <div class="dialog-header">
          <h2 id="relationship-dialog-title">Create relationship</h2>
          <button type="button" data-action="close-dialog" aria-label="Close relationship dialog">×</button>
        </div>
        <label>Source ${renderConceptSelect('source', defaultSource)}</label>
        <label>Target ${renderConceptSelect('target', defaultTarget)}</label>
        <label class="inline-field"><input type="checkbox" name="reverseDirection"> Reverse direction on save</label>
        <label>Label <input name="label" required autofocus></label>
        <label>Notes <textarea name="notes" rows="3"></textarea></label>
        <div class="dialog-actions">
          <button type="submit">Create relationship</button>
          <button type="button" data-action="close-dialog">Cancel</button>
        </div>
      </form>
    </section>`;
}

function renderConceptSelect(name: string, selectedId: string): string {
  return `<select name="${name}" required>${state.graph.nodes.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === selectedId ? 'selected' : ''}>${escapeHtml(node.label)} (${escapeHtml(node.id)})</option>`).join('')}</select>`;
}

function renderConceptTypeDatalist(id: string): string {
  const types = [...new Set(state.graph.nodes.map((node) => node.type).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return `<datalist id="${escapeHtml(id)}">${types.map((type) => `<option value="${escapeHtml(type)}"></option>`).join('')}</datalist>`;
}

function selectedConceptsInOrder() {
  return state.selectedConceptIds
    .map((id) => state.graph.nodes.find((node) => node.id === id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
}

function selectionCount(): number {
  return state.selectedKind === 'concept' ? state.selectedConceptIds.length : state.selectedId ? 1 : 0;
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
        { selector: 'node.multi-selected', style: { 'background-color': '#bbf7d0', 'border-color': '#15803d', 'border-width': '5px' } },
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

    cy.on('tap', 'node', (event) => selectConcept(event.target as NodeSingular, Boolean(event.originalEvent?.shiftKey)));
    cy.on('tap', 'edge', (event) => selectRelationship(event.target as EdgeSingular));
    cy.on('tap', (event: EventObject) => {
      if (event.target === cy) clearSelection();
    });
    cy.on('mouseover', 'node, edge', (event) => event.target.addClass('hovered'));
    cy.on('mouseout', 'node, edge', (event) => event.target.removeClass('hovered'));
    cy.on('dragfree', 'node', (event) => {
      if (!state.editMode) return;
      const previousGraph = state.graph;
      const viewportAfterDrag = currentViewport();
      try {
        state.graph = moveConcept(state.graph, event.target.id(), event.target.position()).graph;
        state.history = rememberGraph(state.history, previousGraph);
        state.layoutStatus = 'unsaved';
        state.message = 'Concept position updated. Use Save layout to keep it after reload.';
        state.error = undefined;
        renderShell();
        mountGraph(viewportAfterDrag);
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Concept repositioning failed.';
        renderShell();
        mountGraph(viewportAfterDrag);
      }
    });
    if (viewport) {
      cy.zoom(viewport.zoom);
      cy.pan(viewport.pan);
    }
    applyGraphSelectionClasses();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Graph rendering failed.';
    renderShell();
  }
}

function currentViewport(): GraphViewport | undefined {
  if (!cy) return undefined;
  return { zoom: cy.zoom(), pan: cy.pan() };
}

function selectConcept(node: NodeSingular, addToSelection = false): void {
  if (state.activeDialog) return;
  const viewport = currentViewport();
  const conceptId = node.id();
  if (state.editMode && addToSelection) {
    state.selectedConceptIds = state.selectedConceptIds.includes(conceptId)
      ? state.selectedConceptIds.filter((id) => id !== conceptId)
      : [...state.selectedConceptIds, conceptId];
    if (state.selectedConceptIds.length === 0) {
      state.selectedId = undefined;
      state.selectedKind = undefined;
    } else {
      state.selectedId = state.selectedConceptIds[state.selectedConceptIds.length - 1];
      state.selectedKind = 'concept';
    }
  } else {
    state.selectedId = conceptId;
    state.selectedKind = 'concept';
    state.selectedConceptIds = [conceptId];
  }
  renderShell();
  mountGraph(viewport);
}

function selectRelationship(edge: EdgeSingular): void {
  if (state.activeDialog) return;
  const viewport = currentViewport();
  state.selectedId = edge.id();
  state.selectedKind = 'relationship';
  state.selectedConceptIds = [];
  renderShell();
  mountGraph(viewport);
}

function clearSelection(): void {
  if (state.activeDialog) return;
  const viewport = currentViewport();
  clearSelectionState();
  cy?.elements().unselect();
  renderShell();
  mountGraph(viewport);
}

function clearSelectionState(): void {
  state.selectedId = undefined;
  state.selectedKind = undefined;
  state.selectedConceptIds = [];
}

function applyGraphSelectionClasses(): void {
  if (!cy) return;
  cy.elements().unselect();
  cy.nodes().removeClass('multi-selected');
  if (state.selectedKind === 'concept') {
    state.selectedConceptIds.forEach((id) => {
      const node = cy?.getElementById(id);
      node?.select();
      if (state.selectedConceptIds.length > 1) node?.addClass('multi-selected');
    });
    return;
  }
  if (state.selectedId) cy.getElementById(state.selectedId).select();
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
      resetLayoutWithHistory();
      break;
    case 'save-layout':
      saveCurrentLayout();
      break;
    case 'undo':
      undoLastGraphChange();
      break;
    case 'redo':
      redoLastGraphChange();
      break;
    case 'toggle-edit-mode':
      state.editMode = !state.editMode;
      state.activeDialog = undefined;
      if (!state.editMode && state.selectedConceptIds.length > 1) clearSelectionState();
      state.message = state.editMode ? 'Content editing is active. Changes are validated before replacing the working graph. Undo and redo are available for this session.' : 'Review mode is active. Content changes, undo/redo, multi-selection, and direct concept dragging are disabled.';
      renderShell();
      mountGraph();
      break;
    case 'add-concept':
      openConceptDialog();
      break;
    case 'add-relationship':
      openRelationshipDialog();
      break;
    case 'edit-selected':
      focusDetailsPanelForEditing();
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
    case 'close-dialog':
      closeDialog();
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
    const previousGraph = state.graph;
    const result = mutation();
    const savedGraph = saveGraph(result.graph);
    state.graph = savedGraph;
    state.history = rememberGraph(state.history, previousGraph);
    state.source = 'working';
    state.layoutStatus = 'saved';
    state.message = message;
    state.error = undefined;
    state.warnings = graphWarnings(savedGraph);
    state.agentAnswer = undefined;
    state.activeDialog = undefined;
    state.selectedKind = selectKind;
    state.selectedId = selectKind ? result.changedId : undefined;
    state.selectedConceptIds = selectKind === 'concept' ? [result.changedId] : [];
    renderShell();
    mountGraph();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Graph change was rejected.';
    state.message = undefined;
    renderShell();
    mountGraph();
  }
}

function openConceptDialog(): void {
  if (!ensureEditing()) return;
  const viewport = currentViewport();
  state.activeDialog = 'concept';
  state.message = selectedConceptsInOrder().length > 0 ? 'Create a concept and optionally connect it to the selected concepts.' : 'Create a concept with label, type, and notes in one dialog.';
  state.error = undefined;
  renderShell();
  mountGraph(viewport);
}

function openRelationshipDialog(): void {
  if (!ensureEditing()) return;
  const viewport = currentViewport();
  if (state.graph.nodes.length < 2) {
    state.error = 'At least two concepts are required before creating a relationship.';
    renderShell();
    mountGraph();
    return;
  }
  state.activeDialog = 'relationship';
  state.message = selectedConceptsInOrder().length >= 2 ? 'Relationship endpoints were prefilled from the ordered shift-selection.' : 'Create a relationship with source, target, label, notes, and direction in one dialog.';
  state.error = undefined;
  renderShell();
  mountGraph(viewport);
}

function closeDialog(): void {
  const viewport = currentViewport();
  state.activeDialog = undefined;
  state.message = undefined;
  state.error = undefined;
  renderShell();
  mountGraph(viewport);
}

function addConceptFromDialog(form: HTMLFormElement): void {
  const values = new FormData(form);
  const label = stringFormValue(values, 'label');
  const type = stringFormValue(values, 'type');
  const notes = stringFormValue(values, 'notes');
  const selectedConcepts = selectedConceptsInOrder();
  const relationshipLabel = stringFormValue(values, 'relationshipLabel');
  const relationshipNotes = stringFormValue(values, 'relationshipNotes');
  const relationshipDirection = stringFormValue(values, 'relationshipDirection') === 'new-to-existing' ? 'new-to-existing' : 'existing-to-new';
  const shouldConnectSelected = selectedConcepts.length > 0 && values.get('connectSelected') === 'on';

  applyMutation(
    shouldConnectSelected ? 'Concept and selected-concept relationships added to the working graph.' : 'Concept added to the working graph.',
    () => shouldConnectSelected
      ? createConceptWithRelationships(
        state.graph,
        { label, type, notes, position: visibleCenter() },
        selectedConcepts.map((concept) => ({ existingConceptId: concept.id, direction: relationshipDirection, label: relationshipLabel, notes: relationshipNotes })),
      )
      : createConcept(state.graph, { label, type, notes, position: visibleCenter() }),
    'concept',
  );
  if (!state.error) state.activeDialog = undefined;
}

function addRelationshipFromDialog(form: HTMLFormElement): void {
  const values = new FormData(form);
  const reverseDirection = values.get('reverseDirection') === 'on';
  const firstEndpoint = stringFormValue(values, 'source');
  const secondEndpoint = stringFormValue(values, 'target');
  const source = reverseDirection ? secondEndpoint : firstEndpoint;
  const target = reverseDirection ? firstEndpoint : secondEndpoint;
  const label = stringFormValue(values, 'label');
  const notes = stringFormValue(values, 'notes');

  applyMutation('Relationship added to the working graph.', () => createRelationship(state.graph, { source, target, label, notes }), 'relationship');
  if (!state.error) state.activeDialog = undefined;
}

function updateConceptFromDetails(form: HTMLFormElement): void {
  const values = new FormData(form);
  const conceptId = stringFormValue(values, 'id');
  applyMutation(
    'Concept details updated in the working graph.',
    () => updateConcept(state.graph, conceptId, {
      label: stringFormValue(values, 'label'),
      type: stringFormValue(values, 'type'),
      notes: stringFormValue(values, 'notes'),
    }),
    'concept',
  );
}

function updateRelationshipFromDetails(form: HTMLFormElement): void {
  const values = new FormData(form);
  const relationshipId = stringFormValue(values, 'id');
  applyMutation(
    'Relationship details updated in the working graph.',
    () => updateRelationship(state.graph, relationshipId, {
      label: stringFormValue(values, 'label'),
      notes: stringFormValue(values, 'notes'),
    }),
    'relationship',
  );
}

function focusDetailsPanelForEditing(): void {
  if (!ensureEditing()) return;
  if (!state.selectedId || !state.selectedKind) {
    state.error = 'Select a concept or relationship before editing details.';
    renderShell();
    mountGraph();
    return;
  }
  state.message = 'Edit supported fields directly in the details panel, then save details.';
  state.error = undefined;
  renderShell();
  mountGraph();
  app.querySelector<HTMLInputElement | HTMLTextAreaElement>('.details-form input:not([type="hidden"]), .details-form textarea')?.focus();
}

function stringFormValue(values: FormData, name: string): string {
  const value = values.get(name);
  return typeof value === 'string' ? value : '';
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

function resetLayoutWithHistory(): void {
  if (!cy) return;

  const previousGraph = state.graph;
  const viewport = currentViewport();
  try {
    cy.layout({ name: 'cose', animate: false, padding: 50 }).run();
    rememberCurrentLayout();
    state.history = rememberGraph(state.history, previousGraph);
    state.layoutStatus = 'unsaved';
    state.message = 'Layout reset. Use Save layout to keep it after reload.';
    state.error = undefined;
    renderShell();
    mountGraph(viewport);
  } catch (error) {
    state.graph = previousGraph;
    state.error = error instanceof Error ? error.message : 'Layout update failed.';
    renderShell();
    mountGraph(viewport);
  }
}

function rememberCurrentLayout(): void {
  if (!cy) return;
  cy.nodes().forEach((node) => {
    state.graph = moveConcept(state.graph, node.id(), node.position()).graph;
  });
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

function undoLastGraphChange(): void {
  if (!ensureEditing()) return;
  const step = undoGraph(state.history, state.graph);
  if (!step) {
    state.message = undefined;
    state.error = 'No edits are available to undo.';
    renderShell();
    mountGraph();
    return;
  }
  restoreHistoryStep(step, 'Undid the most recent graph change.');
}

function redoLastGraphChange(): void {
  if (!ensureEditing()) return;
  const step = redoGraph(state.history, state.graph);
  if (!step) {
    state.message = undefined;
    state.error = 'No edits are available to redo.';
    renderShell();
    mountGraph();
    return;
  }
  restoreHistoryStep(step, 'Redid the most recent graph change.');
}

function restoreHistoryStep(step: GraphHistoryStep, message: string): void {
  const viewport = currentViewport();
  try {
    const savedGraph = saveGraph(step.graph);
    state.graph = savedGraph;
    state.history = step.history;
    state.source = 'working';
    state.layoutStatus = 'saved';
    state.message = message;
    state.error = undefined;
    state.warnings = graphWarnings(savedGraph);
    state.agentAnswer = undefined;
    reconcileSelection();
  } catch (error) {
    state.message = undefined;
    state.error = error instanceof Error ? error.message : 'Undo or redo was rejected.';
  }
  renderShell();
  mountGraph(viewport);
}

function reconcileSelection(): void {
  if (state.selectedKind === 'concept') {
    state.selectedConceptIds = state.selectedConceptIds.filter((id) => state.graph.nodes.some((node) => node.id === id));
    if (state.selectedConceptIds.length === 0) {
      clearSelectionState();
      return;
    }
    state.selectedId = state.selectedConceptIds[state.selectedConceptIds.length - 1];
    return;
  }

  if (!state.selectedId || !state.selectedKind) return;
  const selectionIsAvailable = state.graph.edges.some((edge) => edge.id === state.selectedId);
  if (!selectionIsAvailable) clearSelectionState();
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

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (isEditableTarget(event.target)) return;
  const key = event.key.toLowerCase();

  if (!event.metaKey && !event.ctrlKey && !event.altKey && (key === 'delete' || key === 'backspace')) {
    event.preventDefault();
    if (!state.editMode || !state.selectedId || !state.selectedKind) {
      state.error = state.editMode ? 'Select a concept or relationship before using Delete or Backspace.' : 'Enable content editing before deleting from the keyboard.';
      state.message = undefined;
      renderShell();
      mountGraph();
      return;
    }
    deleteSelectedFromPrompt();
    return;
  }

  const usesShortcutModifier = event.metaKey || event.ctrlKey;
  if (!usesShortcutModifier || event.altKey) return;

  if (key === 'z' && event.shiftKey) {
    event.preventDefault();
    redoLastGraphChange();
    return;
  }
  if (key === 'z') {
    event.preventDefault();
    undoLastGraphChange();
    return;
  }
  if (key === 'y') {
    event.preventDefault();
    redoLastGraphChange();
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
    || Boolean(target.closest('.dialog-panel, .details-form'));
}

document.addEventListener('keydown', handleKeyboardShortcut);

loadIntoState();
