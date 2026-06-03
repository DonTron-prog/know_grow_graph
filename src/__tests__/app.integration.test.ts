/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { WORKING_GRAPH_STORAGE_KEY } from '../graph/storage';
import type { GraphPosition, KnowledgeGraph } from '../graph/types';

type CytoscapeElementDefinition = {
  group?: 'nodes' | 'edges';
  data: { id: string; source?: string; target?: string; label?: string };
  position?: GraphPosition;
};

type CytoscapeEvent = {
  target: FakeElement | FakeCore;
  originalEvent?: { shiftKey?: boolean };
};

type CytoscapeHandler = (event: CytoscapeEvent) => void;

class FakeElement {
  private readonly classes = new Set<string>();
  private selected = false;

  constructor(readonly definition: CytoscapeElementDefinition) {}

  id(): string {
    return this.definition.data.id;
  }

  position(): GraphPosition {
    return this.definition.position ?? { x: 0, y: 0 };
  }

  select(): void {
    this.selected = true;
  }

  unselect(): void {
    this.selected = false;
  }

  addClass(className: string): void {
    this.classes.add(className);
  }

  removeClass(className: string): void {
    this.classes.delete(className);
  }

  isSelected(): boolean {
    return this.selected;
  }

  hasClass(className: string): boolean {
    return this.classes.has(className);
  }
}

class FakeCollection extends Array<FakeElement> {
  unselect(): this {
    this.forEach((element) => element.unselect());
    return this;
  }

  removeClass(className: string): this {
    this.forEach((element) => element.removeClass(className));
    return this;
  }
}

class FakeCore {
  private readonly nodeHandlers = new Map<string, CytoscapeHandler[]>();
  private readonly edgeHandlers = new Map<string, CytoscapeHandler[]>();
  private readonly coreHandlers = new Map<string, CytoscapeHandler[]>();
  private zoomLevel = 1;
  private panPosition: GraphPosition = { x: 0, y: 0 };
  readonly nodeElements: FakeElement[];
  readonly edgeElements: FakeElement[];

  constructor(elements: CytoscapeElementDefinition[]) {
    this.nodeElements = elements.filter((element) => element.group === 'nodes').map((element) => new FakeElement(element));
    this.edgeElements = elements.filter((element) => element.group === 'edges').map((element) => new FakeElement(element));
  }

  on(eventName: string, selectorOrHandler: string | CytoscapeHandler, maybeHandler?: CytoscapeHandler): void {
    if (typeof selectorOrHandler === 'function') {
      this.addHandler(this.coreHandlers, eventName, selectorOrHandler);
      return;
    }

    if (!maybeHandler) return;
    if (selectorOrHandler === 'node') this.addHandler(this.nodeHandlers, eventName, maybeHandler);
    if (selectorOrHandler === 'edge') this.addHandler(this.edgeHandlers, eventName, maybeHandler);
  }

  triggerNodeTap(id: string, shiftKey = false): void {
    const target = this.nodeElements.find((element) => element.id() === id);
    if (!target) throw new Error(`Missing fake node ${id}`);
    this.nodeHandlers.get('tap')?.forEach((handler) => handler({ target, originalEvent: { shiftKey } }));
  }

  triggerEdgeTap(id: string): void {
    const target = this.edgeElements.find((element) => element.id() === id);
    if (!target) throw new Error(`Missing fake edge ${id}`);
    this.edgeHandlers.get('tap')?.forEach((handler) => handler({ target }));
  }

  destroy(): void {}

  fit(): void {}

  layout(): { run: () => void } {
    return { run: () => undefined };
  }

  extent(): { x1: number; x2: number; y1: number; y2: number } {
    return { x1: 0, x2: 100, y1: 0, y2: 100 };
  }

  zoom(value?: number): number {
    if (value !== undefined) this.zoomLevel = value;
    return this.zoomLevel;
  }

  pan(value?: GraphPosition): GraphPosition {
    if (value !== undefined) this.panPosition = value;
    return this.panPosition;
  }

  nodes(): FakeCollection {
    return FakeCollection.from(this.nodeElements) as FakeCollection;
  }

  elements(): FakeCollection {
    return FakeCollection.from([...this.nodeElements, ...this.edgeElements]) as FakeCollection;
  }

  getElementById(id: string): FakeElement | undefined {
    return [...this.nodeElements, ...this.edgeElements].find((element) => element.id() === id);
  }

  private addHandler(map: Map<string, CytoscapeHandler[]>, eventName: string, handler: CytoscapeHandler): void {
    map.set(eventName, [...(map.get(eventName) ?? []), handler]);
  }
}

let currentCore: FakeCore | undefined;

function core(): FakeCore {
  if (!currentCore) throw new Error('Expected Cytoscape fake core to be mounted.');
  return currentCore;
}

function clickButton(text: string): void {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(text));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${text}`);
  button.click();
}

function form(name: string): HTMLFormElement {
  const element = document.querySelector<HTMLFormElement>(`[${name}]`);
  if (!element) throw new Error(`Form not found: ${name}`);
  return element;
}

function setField(formElement: HTMLFormElement, name: string, value: string): void {
  const field = formElement.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
    throw new Error(`Field not found: ${name}`);
  }
  field.value = value;
}

function checkedField(formElement: HTMLFormElement, name: string, checked: boolean): void {
  const field = formElement.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) throw new Error(`Checkbox not found: ${name}`);
  field.checked = checked;
}

function submit(formElement: HTMLFormElement): void {
  formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function savedGraph(): KnowledgeGraph {
  const saved = localStorage.getItem(WORKING_GRAPH_STORAGE_KEY);
  if (!saved) throw new Error('Expected saved working graph.');
  return JSON.parse(saved) as KnowledgeGraph;
}

function selectedOptions(formElement: HTMLFormElement, name: string): string[] {
  const field = formElement.elements.namedItem(name);
  if (!(field instanceof HTMLSelectElement)) throw new Error(`Select not found: ${name}`);
  return Array.from(field.selectedOptions).map((option) => option.value);
}

describe('app UI integration', () => {
  it('gates editing and exercises manual edit plus agent question/proposal flows', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    currentCore = undefined;
    vi.doMock('cytoscape', () => ({
      default: vi.fn((options: { elements: CytoscapeElementDefinition[] }) => {
        currentCore = new FakeCore(options.elements);
        return currentCore;
      }),
    }));

    await import('../app');

    expect(document.body.textContent).toContain('Review mode');
    core().triggerNodeTap('prompting');
    expect(document.body.textContent).toContain('Source context');
    expect(document.body.textContent).toContain('Applied Agentic AI notes');
    expect(document.body.textContent).toContain('Prompting section');
    expect(document.body.textContent).toContain('Prompting defines the task');
    core().triggerEdgeTap('edge-prompting-persona');
    expect(document.body.textContent).toContain('Persona prompting section');
    expect(document.body.textContent).toContain('Persona framing is one prompting technique');
    core().triggerNodeTap('persona');
    expect(document.body.textContent).toContain('Source context unavailable.');

    clickButton('Add concept');
    expect(document.body.textContent).toContain('Enable content editing before changing the graph.');
    expect(document.querySelector('[data-concept-form]')).toBeNull();

    clickButton('Turn on content editing');
    expect(document.body.textContent).toContain('Content editing on');

    core().triggerNodeTap('prompting');
    core().triggerNodeTap('evaluation', true);
    expect(document.body.textContent).toContain('2 concepts selected');
    expect(document.body.textContent).toContain('Shift-click order is preserved');
    expect(core().getElementById('prompting')?.hasClass('multi-selected')).toBe(true);
    expect(core().getElementById('evaluation')?.hasClass('multi-selected')).toBe(true);

    clickButton('Add relationship');
    const relationshipForm = form('data-relationship-form');
    expect(selectedOptions(relationshipForm, 'source')).toEqual(['prompting']);
    expect(selectedOptions(relationshipForm, 'target')).toEqual(['evaluation']);
    checkedField(relationshipForm, 'reverseDirection', true);
    setField(relationshipForm, 'label', 'validates with');
    setField(relationshipForm, 'notes', 'Created from the ordered selection.');
    submit(relationshipForm);

    let graph = savedGraph();
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'evaluation', target: 'prompting', label: 'validates with', notes: 'Created from the ordered selection.' }),
    ]));

    const relationshipDetailsForm = form('data-relationship-details-form');
    setField(relationshipDetailsForm, 'label', 'validates through');
    setField(relationshipDetailsForm, 'notes', 'Updated through the relationship details panel.');
    submit(relationshipDetailsForm);
    graph = savedGraph();
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'evaluation', target: 'prompting', label: 'validates through', notes: 'Updated through the relationship details panel.' }),
    ]));

    core().triggerNodeTap('prompting');
    core().triggerNodeTap('evaluation', true);
    clickButton('Add concept');
    const conceptForm = form('data-concept-form');
    const typeOptions = Array.from(document.querySelectorAll<HTMLOptionElement>('#concept-dialog-type-options option')).map((option) => option.value);
    expect(typeOptions).toContain('concept');
    setField(conceptForm, 'label', 'Review Lens');
    setField(conceptForm, 'type', 'review-method');
    setField(conceptForm, 'notes', 'Added through the app-level creation dialog.');
    setField(conceptForm, 'relationshipLabel', 'contextualizes');
    setField(conceptForm, 'relationshipNotes', 'Created atomically with the concept.');
    submit(conceptForm);

    graph = savedGraph();
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'review-lens', label: 'Review Lens', type: 'review-method', notes: 'Added through the app-level creation dialog.' }),
    ]));
    expect(graph.nodes.find((node) => node.id === 'review-lens')?.sourceRefs).toBeUndefined();
    expect(document.body.textContent).not.toContain('Source context unavailable.');
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'prompting', target: 'review-lens', label: 'contextualizes' }),
      expect.objectContaining({ source: 'evaluation', target: 'review-lens', label: 'contextualizes' }),
    ]));

    const detailsForm = form('data-concept-details-form');
    setField(detailsForm, 'label', 'Review Lens Updated');
    setField(detailsForm, 'type', 'analysis-method');
    setField(detailsForm, 'notes', 'Updated from the details panel.');
    submit(detailsForm);
    graph = savedGraph();
    expect(graph.nodes.find((node) => node.id === 'review-lens')).toMatchObject({ label: 'Review Lens Updated', type: 'analysis-method', notes: 'Updated from the details panel.' });

    clickButton('Undo');
    graph = savedGraph();
    expect(graph.nodes.find((node) => node.id === 'review-lens')).toMatchObject({ label: 'Review Lens', type: 'review-method' });

    clickButton('Redo');
    graph = savedGraph();
    expect(graph.nodes.find((node) => node.id === 'review-lens')).toMatchObject({ label: 'Review Lens Updated', type: 'analysis-method' });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const activeDetailsForm = form('data-concept-details-form');
    const labelInput = activeDetailsForm.elements.namedItem('label');
    if (!(labelInput instanceof HTMLInputElement)) throw new Error('Expected label input.');
    labelInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(savedGraph().nodes.some((node) => node.id === 'review-lens')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    graph = savedGraph();
    expect(graph.nodes.some((node) => node.id === 'review-lens')).toBe(false);
    expect(graph.edges.some((edge) => edge.source === 'review-lens' || edge.target === 'review-lens')).toBe(false);

    clickButton('Reload graph');
    expect(document.body.textContent).toContain('Source: working');
    expect(document.body.textContent).not.toContain('Review Lens Updated');

    const questionInput = document.querySelector<HTMLTextAreaElement>('#agent-question');
    if (!questionInput) throw new Error('Expected agent question input.');
    questionInput.value = 'What is Prompting connected to?';
    submit(form('data-agent-form'));
    expect(document.body.textContent).toContain('Grounded answer');
    expect(document.body.textContent).toContain('Prompting');

    const changeInput = document.querySelector<HTMLTextAreaElement>('#agent-change-request');
    if (!changeInput) throw new Error('Expected agent change request input.');
    changeInput.value = 'Add concept Agent Review type method notes Proposed by the agent helper.';
    submit(form('data-agent-change-form'));
    expect(document.body.textContent).toContain('Proposed graph change');
    expect(document.body.textContent).toContain('Review before applying');

    clickButton('Apply proposed change');
    graph = savedGraph();
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agent-review', label: 'Agent Review', type: 'method', notes: 'Proposed by the agent helper.', origin: 'agent' }),
    ]));
    expect(document.body.textContent).toContain('Applied agent change');

    const nodeCountAfterAgentApply = graph.nodes.length;
    const unsupportedChangeInput = document.querySelector<HTMLTextAreaElement>('#agent-change-request');
    if (!unsupportedChangeInput) throw new Error('Expected agent change request input after apply.');
    unsupportedChangeInput.value = 'Make the graph better somehow';
    submit(form('data-agent-change-form'));
    expect(document.body.textContent).toContain('Could not propose a graph change');
    expect(savedGraph().nodes).toHaveLength(nodeCountAfterAgentApply);
  });
});
