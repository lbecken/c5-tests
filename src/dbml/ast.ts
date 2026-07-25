/**
 * DBML syntax tree.
 *
 * The AST mirrors the source closely (it keeps every setting the author wrote,
 * even ones the analyzer later rejects) so that formatting, editor tooling and
 * error reporting all have something faithful to work with. Meaning is applied
 * later, in `analyzer.ts`.
 */

import { Span } from './diagnostics';

/** An identifier as written, with the span of the token it came from. */
export interface Name {
  value: string;
  span: Span;
  /** True when written as `"quoted"`, which permits spaces and keywords. */
  quoted?: boolean;
}

export type SettingValue =
  | { kind: 'flag' }
  | { kind: 'string'; value: string; multiline?: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; value: string }
  | { kind: 'expression'; value: string }
  | { kind: 'color'; value: string }
  | { kind: 'ref'; relation: RelationOp; endpoint: RefEndpoint };

export interface Setting {
  name: string;
  /** Setting name exactly as written, for error messages. */
  rawName: string;
  value: SettingValue;
  span: Span;
  nameSpan: Span;
}

export type RelationOp = '<' | '>' | '-' | '<>';

export interface RefEndpoint {
  schema?: Name;
  table: Name;
  columns: Name[];
  span: Span;
}

export interface TypeRef {
  schema?: Name;
  name: string;
  /** Contents of the parentheses, e.g. `255` in `varchar(255)`. */
  args?: string;
  span: Span;
}

export interface ColumnDecl {
  kind: 'column';
  name: Name;
  type: TypeRef;
  settings: Setting[];
  span: Span;
}

/** `~partial_name` inside a table body. */
export interface PartialInjectionDecl {
  kind: 'partial-injection';
  name: Name;
  span: Span;
}

export interface IndexColumn {
  kind: 'column' | 'expression';
  value: string;
  span: Span;
}

export interface IndexDecl {
  columns: IndexColumn[];
  settings: Setting[];
  span: Span;
}

export interface NoteDecl {
  value: string;
  span: Span;
}

export interface TableDecl {
  kind: 'table';
  schema?: Name;
  name: Name;
  alias?: Name;
  settings: Setting[];
  body: (ColumnDecl | PartialInjectionDecl)[];
  indexes: IndexDecl[];
  note?: NoteDecl;
  span: Span;
}

export interface TablePartialDecl {
  kind: 'table-partial';
  name: Name;
  settings: Setting[];
  body: ColumnDecl[];
  indexes: IndexDecl[];
  note?: NoteDecl;
  span: Span;
}

export interface RefDecl {
  kind: 'ref';
  name?: Name;
  left: RefEndpoint;
  right: RefEndpoint;
  relation: RelationOp;
  settings: Setting[];
  span: Span;
}

export interface EnumValueDecl {
  name: Name;
  settings: Setting[];
  span: Span;
}

export interface EnumDecl {
  kind: 'enum';
  schema?: Name;
  name: Name;
  values: EnumValueDecl[];
  note?: NoteDecl;
  span: Span;
}

export interface TableGroupDecl {
  kind: 'table-group';
  name: Name;
  settings: Setting[];
  tables: RefEndpoint[];
  note?: NoteDecl;
  span: Span;
}

/** Standalone `Note name { '...' }` — a sticky note on the canvas. */
export interface StickyNoteDecl {
  kind: 'sticky-note';
  name: Name;
  content: string;
  settings: Setting[];
  span: Span;
}

export interface ProjectDecl {
  kind: 'project';
  name?: Name;
  properties: { name: string; value: string; span: Span }[];
  note?: NoteDecl;
  span: Span;
}

export type Declaration =
  | ProjectDecl
  | TableDecl
  | TablePartialDecl
  | RefDecl
  | EnumDecl
  | TableGroupDecl
  | StickyNoteDecl;

export interface Document {
  declarations: Declaration[];
  span: Span;
}
