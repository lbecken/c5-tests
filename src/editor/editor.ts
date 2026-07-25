/**
 * The code pane.
 *
 * Wraps CodeMirror with the DBML language, autocomplete, and diagnostics fed
 * straight from the compiler, plus the two navigation moves that make a
 * code-driven diagram feel connected: reveal a span (diagram → code) and
 * report the element under the cursor (code → diagram).
 */

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { Diagnostic as LintDiagnostic, lintGutter, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { Diagnostic, Span } from '../dbml';
import { Schema } from '../dbml/model';
import { SchemaSource, dbmlCompletion } from './completion';
import { dbml } from './language';
import { darkTheme, lightTheme } from './theme';

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  getSchema: SchemaSource;
  onChange(value: string): void;
  /** Fires when the cursor moves to a different line. */
  onCursorLine?(line: number): void;
}

export class DbmlEditor {
  readonly view: EditorView;
  private readonly themeCompartment = new Compartment();
  private lastLine = -1;

  constructor(private readonly options: EditorOptions) {
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      rectangularSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      lintGutter(),
      search({ top: true }),
      highlightSelectionMatches(),
      autocompletion({ override: [dbmlCompletion(options.getSchema)], activateOnTyping: true }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      dbml(),
      EditorView.lineWrapping,
      this.themeCompartment.of(lightTheme),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
        if (update.selectionSet || update.docChanged) this.reportCursorLine(update.state);
      }),
    ];

    this.view = new EditorView({
      state: EditorState.create({ doc: options.doc, extensions }),
      parent: options.parent,
    });
  }

  private reportCursorLine(state: EditorState): void {
    const line = state.doc.lineAt(state.selection.main.head).number;
    if (line === this.lastLine) return;
    this.lastLine = line;
    this.options.onCursorLine?.(line);
  }

  get value(): string {
    return this.view.state.doc.toString();
  }

  setValue(next: string): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: next },
    });
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.view.dispatch({
      effects: this.themeCompartment.reconfigure(theme === 'dark' ? darkTheme : lightTheme),
    });
  }

  /** Show compiler errors and warnings in the gutter and under the text. */
  setDiagnostics(diagnostics: Diagnostic[]): void {
    const docLength = this.view.state.doc.length;
    const lint: LintDiagnostic[] = diagnostics.map((diagnostic) => {
      const from = Math.min(diagnostic.span.start.offset, docLength);
      const to = Math.min(Math.max(diagnostic.span.end.offset, from + 1), docLength);
      return {
        from,
        to,
        severity: diagnostic.severity,
        message: diagnostic.message,
        source: 'dbml',
      };
    });
    this.view.dispatch(setDiagnostics(this.view.state, lint));
  }

  /** Scroll to a span and select it — used when you click the diagram. */
  reveal(span: Span): void {
    const docLength = this.view.state.doc.length;
    const from = Math.min(span.start.offset, docLength);
    const to = Math.min(Math.max(span.end.offset, from), docLength);
    this.view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}

/**
 * Which schema element covers a given line — the code-to-diagram direction of
 * the two-way link.
 */
export function elementAtLine(schema: Schema, line: number): string | null {
  for (const table of schema.tables) {
    if (line < table.span.start.line || line > table.span.end.line) continue;
    for (const column of table.columns) {
      if (line >= column.span.start.line && line <= column.span.end.line) return column.id;
    }
    return table.id;
  }
  for (const model of schema.enums) {
    if (line >= model.span.start.line && line <= model.span.end.line) return model.id;
  }
  for (const note of schema.stickyNotes) {
    if (line >= note.span.start.line && line <= note.span.end.line) return note.id;
  }
  for (const ref of schema.refs) {
    if (line >= ref.span.start.line && line <= ref.span.end.line) return ref.endpoints[0].tableId;
  }
  return null;
}
