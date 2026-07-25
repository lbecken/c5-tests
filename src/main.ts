/**
 * Application entry point: wires the editor, the compiler and the diagram
 * together, and owns the toolbar, search panel and persistence.
 */

import './style.css';
import exampleSchema from '../examples/ecommerce.dbml?raw';
import { CompileResult, Schema, compile, emptySchema, tableLabel } from './dbml';
import { DiagramView } from './diagram/renderer';
import { DbmlEditor, elementAtLine } from './editor/editor';
import { downloadBlob, downloadText, slugify } from './app/download';
import { storage } from './app/storage';
import { toSQL } from './sql/export';
import { fromSQL } from './sql/import';

const COMPILE_DEBOUNCE_MS = 120;

class App {
  private readonly editor: DbmlEditor;
  private readonly diagram: DiagramView;
  private schema: Schema = emptySchema();
  private theme: 'light' | 'dark' = storage.getTheme();
  private compileTimer: number | undefined;
  private toastTimer: number | undefined;
  /** Set while the diagram drives the editor, to avoid a selection ping-pong. */
  private syncingSelection = false;

  private readonly statusEl = query<HTMLElement>('[data-status]');
  private readonly countsEl = query<HTMLElement>('[data-counts]');
  private readonly zoomEl = query<HTMLElement>('[data-action="zoom-level"]');
  private readonly searchPanel = query<HTMLElement>('[data-search]');
  private readonly searchInput = query<HTMLInputElement>('[data-search-input]');
  private readonly searchResults = query<HTMLElement>('[data-search-results]');
  private readonly toastEl = query<HTMLElement>('[data-toast]');

  constructor() {
    this.applyTheme(this.theme);

    const width = storage.getEditorWidth();
    if (width) document.documentElement.style.setProperty('--editor-width', `${width}px`);

    this.diagram = new DiagramView(query<HTMLElement>('[data-diagram]'), {
      onSelect: ({ span }) => {
        this.syncingSelection = true;
        this.editor.reveal(span);
        this.syncingSelection = false;
      },
      onPositionsChanged: (positions) => storage.setPositions(positions),
      onZoomChanged: (zoom) => {
        this.zoomEl.textContent = `${Math.round(zoom * 100)}%`;
      },
    });
    this.diagram.setTheme(this.theme);

    this.editor = new DbmlEditor({
      parent: query<HTMLElement>('[data-editor]'),
      doc: storage.getDoc(exampleSchema),
      getSchema: () => this.schema,
      onChange: (value) => {
        storage.setDoc(value);
        this.scheduleCompile();
      },
      onCursorLine: (line) => {
        if (this.syncingSelection) return;
        this.diagram.setFocus(elementAtLine(this.schema, line));
      },
    });
    this.editor.setTheme(this.theme);

    this.diagram.setPositions(storage.getPositions());
    this.compileNow();
    requestAnimationFrame(() => this.diagram.fit());

    this.bindToolbar();
    this.bindSearch();
    this.bindSplitter();
    this.bindShortcuts();
  }

  // --------------------------------------------------------------- compile

  private scheduleCompile(): void {
    window.clearTimeout(this.compileTimer);
    this.compileTimer = window.setTimeout(() => this.compileNow(), COMPILE_DEBOUNCE_MS);
  }

  private compileNow(): void {
    const result = compile(this.editor.value);
    this.schema = result.schema;
    this.diagram.setSchema(result.schema);
    this.editor.setDiagnostics(result.diagnostics);
    this.updateStatus(result);
    this.renderSearchResults(this.searchInput.value);
  }

  private updateStatus(result: CompileResult): void {
    const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = result.diagnostics.length - errors;

    this.statusEl.classList.toggle('has-errors', errors > 0);
    this.statusEl.classList.toggle('has-warnings', errors === 0 && warnings > 0);
    this.statusEl.textContent = errors
      ? `${errors} ${plural(errors, 'error')}${warnings ? `, ${warnings} ${plural(warnings, 'warning')}` : ''}`
      : warnings
        ? `${warnings} ${plural(warnings, 'warning')}`
        : 'No problems';

    const { tables, refs, enums } = result.schema;
    this.countsEl.textContent = `${tables.length} ${plural(tables.length, 'table')} · ${
      refs.length
    } ${plural(refs.length, 'relationship')}${
      enums.length ? ` · ${enums.length} ${plural(enums.length, 'enum')}` : ''
    }`;
  }

  // --------------------------------------------------------------- toolbar

  private bindToolbar(): void {
    document.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      const menu = query<HTMLElement>('[data-menu]');
      const list = menu.querySelector<HTMLElement>('.menu-list')!;

      if (!target || !menu.contains(target)) {
        list.hidden = true;
        menu.querySelector('button')?.setAttribute('aria-expanded', 'false');
      }
      if (!target) return;

      switch (target.dataset.action) {
        case 'zoom-in':
          this.diagram.zoomBy(1.2);
          break;
        case 'zoom-out':
          this.diagram.zoomBy(1 / 1.2);
          break;
        case 'zoom-level':
          this.diagram.zoomTo(1);
          break;
        case 'fit':
          this.diagram.fit();
          break;
        case 'relayout':
          this.diagram.relayout();
          this.toast('Diagram re-laid out');
          break;
        case 'search':
          this.toggleSearch();
          break;
        case 'theme':
          this.toggleTheme();
          break;
        case 'export-menu': {
          const open = list.hidden;
          list.hidden = !open;
          target.setAttribute('aria-expanded', String(open));
          break;
        }
        case 'export-svg':
          this.exportSVG();
          break;
        case 'export-png':
          void this.exportPNG();
          break;
        case 'export-dbml':
          downloadText(this.editor.value, `${this.filename()}.dbml`, 'text/plain');
          break;
        case 'export-postgres':
          this.exportSQL('postgres');
          break;
        case 'export-mysql':
          this.exportSQL('mysql');
          break;
        case 'load-example':
          this.loadExample();
          break;
        default:
          break;
      }
    });

    query<HTMLInputElement>('[data-action="import"]').addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file) void this.importFile(file);
      input.value = '';
    });
  }

  private filename(): string {
    return slugify(this.schema.project?.name, 'schema');
  }

  private exportSVG(): void {
    downloadText(this.diagram.toSVGString(), `${this.filename()}.svg`, 'image/svg+xml');
    this.toast('Saved SVG');
  }

  private async exportPNG(): Promise<void> {
    try {
      const blob = await this.diagram.toPNGBlob(2);
      downloadBlob(blob, `${this.filename()}.png`);
      this.toast('Saved PNG');
    } catch (error) {
      this.toast(`Could not export PNG: ${(error as Error).message}`, true);
    }
  }

  private exportSQL(dialect: 'postgres' | 'mysql'): void {
    if (!this.schema.tables.length) {
      this.toast('Nothing to export yet', true);
      return;
    }
    const sql = toSQL(this.schema, { dialect });
    downloadText(sql, `${this.filename()}.${dialect}.sql`, 'application/sql');
    this.toast(`Saved ${dialect === 'postgres' ? 'PostgreSQL' : 'MySQL'} DDL`);
  }

  private async importFile(file: File): Promise<void> {
    const text = await file.text();
    if (/\.sql$/i.test(file.name)) {
      const { dbml, skipped } = fromSQL(text);
      if (!dbml.trim()) {
        this.toast('No CREATE TABLE statements found in that file', true);
        return;
      }
      this.replaceDocument(dbml);
      this.toast(
        skipped.length
          ? `Imported SQL — skipped ${skipped.length} ${plural(skipped.length, 'statement')}`
          : 'Imported SQL',
      );
      return;
    }
    this.replaceDocument(text);
    this.toast(`Loaded ${file.name}`);
  }

  private loadExample(): void {
    this.replaceDocument(exampleSchema);
    this.toast('Loaded the example schema');
  }

  /** Swap the document and start from a fresh automatic layout. */
  private replaceDocument(text: string): void {
    this.editor.setValue(text);
    storage.setPositions({});
    this.compileNow();
    this.diagram.relayout();
  }

  private toggleTheme(): void {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    storage.setTheme(theme);
    const button = document.querySelector<HTMLElement>('[data-action="theme"]');
    if (button) button.textContent = theme === 'dark' ? 'Light' : 'Dark';
    this.diagram?.setTheme(theme);
    this.editor?.setTheme(theme);
  }

  // ---------------------------------------------------------------- search

  private bindSearch(): void {
    this.searchInput.addEventListener('input', () => {
      this.renderSearchResults(this.searchInput.value);
    });
    this.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.toggleSearch(false);
        return;
      }
      if (event.key === 'Enter') {
        this.searchResults.querySelector<HTMLButtonElement>('button')?.click();
      }
    });
  }

  private toggleSearch(force?: boolean): void {
    const show = force ?? this.searchPanel.hidden;
    this.searchPanel.hidden = !show;
    if (show) {
      this.searchInput.focus();
      this.searchInput.select();
      this.renderSearchResults(this.searchInput.value);
    } else {
      this.diagram.setSearchHits([]);
    }
  }

  private renderSearchResults(term: string): void {
    if (this.searchPanel.hidden) return;
    const needle = term.trim().toLowerCase();
    const matches = this.schema.tables.filter((table) => {
      if (!needle) return true;
      return (
        table.name.toLowerCase().includes(needle) ||
        table.alias?.toLowerCase().includes(needle) ||
        table.columns.some((column) => column.name.toLowerCase().includes(needle))
      );
    });

    this.searchResults.replaceChildren(
      ...matches.slice(0, 40).map((table) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';

        const name = document.createElement('span');
        name.textContent = tableLabel(table);
        const meta = document.createElement('span');
        meta.className = 'result-meta';
        meta.textContent = `${table.columns.length} ${plural(table.columns.length, 'column')}`;

        button.append(name, meta);
        button.addEventListener('click', () => {
          this.diagram.focus(table.id);
          this.editor.reveal(table.nameSpan);
        });
        item.append(button);
        return item;
      }),
    );

    if (!matches.length) {
      const empty = document.createElement('li');
      empty.className = 'result-meta';
      empty.textContent = 'No matching tables';
      this.searchResults.append(empty);
    }
    this.diagram.setSearchHits(needle ? matches.map((table) => table.id) : []);
  }

  // -------------------------------------------------------------- splitter

  private bindSplitter(): void {
    const splitter = query<HTMLElement>('[data-splitter]');
    const pane = query<HTMLElement>('.pane-editor');

    const startDrag = (event: PointerEvent) => {
      event.preventDefault();
      splitter.classList.add('is-dragging');
      splitter.setPointerCapture(event.pointerId);

      const move = (moveEvent: PointerEvent) => {
        const width = Math.min(
          Math.max(moveEvent.clientX - pane.getBoundingClientRect().left, 280),
          window.innerWidth - 320,
        );
        document.documentElement.style.setProperty('--editor-width', `${width}px`);
      };
      const stop = () => {
        splitter.classList.remove('is-dragging');
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', stop);
        storage.setEditorWidth(pane.getBoundingClientRect().width);
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', stop);
    };

    splitter.addEventListener('pointerdown', startDrag);
    splitter.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 48 : 16;
      const current = pane.getBoundingClientRect().width;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const next = current + (event.key === 'ArrowLeft' ? -step : step);
        document.documentElement.style.setProperty('--editor-width', `${next}px`);
        storage.setEditorWidth(next);
      }
    });
  }

  // ------------------------------------------------------------- shortcuts

  private bindShortcuts(): void {
    window.addEventListener('keydown', (event) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;

      // Cmd/Ctrl+F searches the code when the editor has focus, and the
      // diagram's tables otherwise.
      if (event.key === 'f' && !this.editor.view.hasFocus) {
        event.preventDefault();
        this.toggleSearch(true);
        return;
      }
      switch (event.key) {
        case '=':
        case '+':
          event.preventDefault();
          this.diagram.zoomBy(1.2);
          break;
        case '-':
          event.preventDefault();
          this.diagram.zoomBy(1 / 1.2);
          break;
        case '0':
          event.preventDefault();
          this.diagram.fit();
          break;
        default:
          break;
      }
    });

    window.addEventListener('resize', () => {
      this.zoomEl.textContent = `${Math.round(this.diagram.zoom * 100)}%`;
    });
  }

  // ------------------------------------------------------------------ misc

  private toast(message: string, isError = false): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle('is-error', isError);
    this.toastEl.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, 2600);
  }
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

new App();
