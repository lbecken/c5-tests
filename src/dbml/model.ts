/**
 * The resolved schema model — what the renderer, the SQL exporter and the
 * editor's autocomplete all consume.
 *
 * Unlike the AST, everything here is resolved: aliases point at real tables,
 * relationship endpoints carry the ids of the columns they attach to, and
 * partial columns have been injected into their host tables.
 */

import { Span } from './diagnostics';

export const DEFAULT_SCHEMA = 'public';

export interface ColumnDefault {
  type: 'string' | 'number' | 'boolean' | 'expression' | 'null';
  value: string;
}

export interface Column {
  /** `schema.table.column`, unique across the model. */
  id: string;
  name: string;
  /** Fully rendered type, e.g. `varchar(255)` or `ecommerce.job_status`. */
  type: string;
  typeName: string;
  typeSchema?: string;
  typeArgs?: string;
  pk: boolean;
  increment: boolean;
  unique: boolean;
  notNull: boolean;
  default?: ColumnDefault;
  note?: string;
  /** Set when the column's type resolves to a declared enum. */
  enumId?: string;
  /** Name of the TablePartial this column was injected from, if any. */
  fromPartial?: string;
  span: Span;
  tableId: string;
}

export interface Index {
  columns: { kind: 'column' | 'expression'; value: string }[];
  name?: string;
  type?: string;
  unique: boolean;
  pk: boolean;
  note?: string;
  span: Span;
}

export interface Table {
  /** `schema.name`, unique across the model. */
  id: string;
  schema: string;
  name: string;
  alias?: string;
  note?: string;
  headerColor?: string;
  columns: Column[];
  indexes: Index[];
  groupId?: string;
  span: Span;
  /** Span of just the table's name, for jump-to-code. */
  nameSpan: Span;
}

export type Cardinality = '1' | '*';

export interface Endpoint {
  tableId: string;
  columnNames: string[];
  columnIds: string[];
  relation: Cardinality;
  span: Span;
}

export interface Ref {
  id: string;
  name?: string;
  endpoints: [Endpoint, Endpoint];
  onDelete?: string;
  onUpdate?: string;
  color?: string;
  span: Span;
}

export interface EnumValue {
  name: string;
  note?: string;
}

export interface Enum {
  id: string;
  schema: string;
  name: string;
  values: EnumValue[];
  note?: string;
  span: Span;
}

export interface TableGroup {
  id: string;
  name: string;
  color?: string;
  note?: string;
  tableIds: string[];
  span: Span;
}

export interface StickyNote {
  id: string;
  name: string;
  content: string;
  color?: string;
  span: Span;
}

export interface Project {
  name?: string;
  databaseType?: string;
  note?: string;
  properties: Record<string, string>;
}

export interface Schema {
  project?: Project;
  tables: Table[];
  refs: Ref[];
  enums: Enum[];
  groups: TableGroup[];
  stickyNotes: StickyNote[];
}

export function emptySchema(): Schema {
  return { tables: [], refs: [], enums: [], groups: [], stickyNotes: [] };
}

export function tableId(schema: string, name: string): string {
  return `${schema}.${name}`;
}

export function columnId(table: Table, columnName: string): string {
  return `${table.id}.${columnName}`;
}

/** Display label: schema-qualified only when it isn't the default schema. */
export function tableLabel(table: Table): string {
  return table.schema === DEFAULT_SCHEMA ? table.name : `${table.schema}.${table.name}`;
}

export function findTable(schema: Schema, id: string): Table | undefined {
  return schema.tables.find((table) => table.id === id);
}

export function findColumn(table: Table, name: string): Column | undefined {
  return table.columns.find((column) => column.name === name);
}
