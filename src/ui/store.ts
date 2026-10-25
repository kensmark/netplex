import {
  cloneDesign,
  parseDesignFile,
  validateDesign,
  applyDesignFile,
  themePackage,
} from '../design/core';
import type { Design, ThemePackage, SavedTheme } from '../design/types';
import premiere from '../../designs/premiere.json';
import obsidian from '../../designs/obsidian.json';
import archive from '../../designs/archive.json';
import velvet from '../../designs/velvet.netplex.json';
export const presets = [premiere, obsidian, archive, velvet].map(validateDesign);
export const builtinThemes = presets.map((design) => themePackage(design));
function normalizeDesign(design: Design): Design {
  if (design.library.layout === 'list') design.library.layout = 'grid';
  for (const item of design.navigation.items) {
    if (item.route === 'home') item.label = 'Forside';
    if (item.route === 'saved') item.label = 'Din liste';
  }
  const visit = (node: Design['pages']['home']) => {
    if (node.type === 'collection' && node.layout === 'list') node.layout = 'column';
    if (
      node.type === 'collection' &&
      node.query.source === 'saved' &&
      node.title === 'Til en anden aften'
    )
      node.title = 'Din liste';
    if (node.type === 'container') node.children.forEach(visit);
  };
  visit(design.pages.home);
  return design;
}
type API = (
  path: string,
  options?: { method?: string; body?: unknown; signal?: AbortSignal },
) => Promise<any>;
export class DesignStore {
  design = cloneDesign(presets[0]);
  committed = cloneDesign(this.design);
  listeners = new Set<() => void>();
  recovery = '';
  past: Design[] = [];
  future: Design[] = [];
  constructor(public api: API) {}
  async load() {
    const result = await this.api('/api/design');
    this.design = normalizeDesign(validateDesign(result.design));
    this.committed = cloneDesign(this.design);
    this.recovery = result.recovery || '';
    this.notify();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.design;
  notify() {
    this.listeners.forEach((listener) => listener());
  }
  preview(value: unknown) {
    const next = normalizeDesign(cloneDesign(validateDesign(value)));
    this.past.push(this.design);
    if (this.past.length > 60) this.past.shift();
    this.future = [];
    this.design = next;
    this.notify();
  }
  edit(mutator: (draft: Design) => void) {
    const draft = cloneDesign(this.design);
    mutator(draft);
    this.preview(draft);
  }
  import(text: string) {
    this.preview(applyDesignFile(this.design, parseDesignFile(text)));
  }
  applyTheme(theme: ThemePackage) {
    this.preview(applyDesignFile(this.design, theme));
  }
  async themes(): Promise<SavedTheme[]> {
    return (await this.api('/api/themes')).themes;
  }
  async saveTheme(theme: ThemePackage): Promise<SavedTheme> {
    return this.api('/api/themes', { method: 'POST', body: { theme } });
  }
  async deleteTheme(id: string) {
    await this.api(`/api/themes/${id}`, { method: 'DELETE' });
  }
  discard() {
    this.design = cloneDesign(this.committed);
    this.past = [];
    this.future = [];
    this.notify();
  }
  undo() {
    const previous = this.past.pop();
    if (previous) {
      this.future.push(this.design);
      this.design = previous;
      this.notify();
    }
  }
  redo() {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.design);
      this.design = next;
      this.notify();
    }
  }
  async save() {
    const draft = cloneDesign(this.design);
    await this.api('/api/design', { method: 'POST', body: { design: draft } });
    this.committed = draft;
  }
}
