/**
 * Turns a parsed document into a resolved `Schema`, reporting anything that
 * parses but doesn't make sense — duplicate tables, references to columns that
 * don't exist, unknown settings, and so on.
 *
 * Resolution is deliberately forgiving. A relationship pointing at a table you
 * haven't written yet produces a diagnostic and is dropped from the model, but
 * every other element still renders.
 */

import {
  ColumnDecl,
  Declaration,
  Document,
  IndexDecl,
  RefEndpoint,
  Setting,
  TableDecl,
  TablePartialDecl,
} from './ast';
import { Diagnostic, Span, error, warning } from './diagnostics';
import {
  Cardinality,
  Column,
  DEFAULT_SCHEMA,
  Endpoint,
  Enum,
  Index,
  Project,
  Schema,
  StickyNote,
  Table,
  TableGroup,
  emptySchema,
  tableId,
} from './model';

export interface AnalyzeResult {
  schema: Schema;
  diagnostics: Diagnostic[];
}

const COLUMN_FLAGS = new Set([
  'pk',
  'primary key',
  'increment',
  'unique',
  'not null',
  'null',
]);
const COLUMN_VALUE_SETTINGS = new Set(['note', 'default', 'ref', 'name']);
const TABLE_SETTINGS = new Set(['headercolor', 'note']);
const REF_SETTINGS = new Set(['delete', 'update', 'color', 'name']);
const INDEX_SETTINGS = new Set(['name', 'type', 'unique', 'pk', 'note']);
const GROUP_SETTINGS = new Set(['color', 'note']);
const REFERENTIAL_ACTIONS = new Set(['cascade', 'restrict', 'set null', 'set default', 'no action']);

/** DBML relation operators expand to a cardinality on each side. */
const CARDINALITIES: Record<string, [Cardinality, Cardinality]> = {
  '<': ['1', '*'],
  '>': ['*', '1'],
  '-': ['1', '1'],
  '<>': ['*', '*'],
};

class Analyzer {
  private readonly schema: Schema = emptySchema();
  private readonly diagnostics: Diagnostic[] = [];
  /** Lookup by `schema.name` and by bare alias. */
  private readonly tablesByKey = new Map<string, Table>();
  private readonly partials = new Map<string, TablePartialDecl>();
  private readonly enumsByKey = new Map<string, Enum>();
  private refCounter = 0;

  constructor(private readonly document: Document) {}

  analyze(): AnalyzeResult {
    // Partials and enums must exist before tables that reference them.
    for (const declaration of this.document.declarations) {
      if (declaration.kind === 'table-partial') this.declarePartial(declaration);
      if (declaration.kind === 'enum') this.declareEnum(declaration);
    }
    for (const declaration of this.document.declarations) {
      if (declaration.kind === 'table') this.declareTable(declaration);
    }
    // Relationships, groups and notes resolve against the finished table set.
    this.resolveInlineRefs();
    for (const declaration of this.document.declarations) {
      this.declareRest(declaration);
    }
    this.linkEnums();
    return { schema: this.schema, diagnostics: this.diagnostics };
  }

  // ---------------------------------------------------------------- helpers

  private err(message: string, span: Span, code?: string): void {
    this.diagnostics.push(error(message, span, code));
  }

  private warn(message: string, span: Span, code?: string): void {
    this.diagnostics.push(warning(message, span, code));
  }

  /** Reject settings that aren't valid in this position. */
  private checkSettings(settings: Setting[], allowed: Set<string>, context: string): void {
    for (const setting of settings) {
      if (!allowed.has(setting.name)) {
        this.warn(
          `Unknown ${context} setting "${setting.rawName}"`,
          setting.nameSpan,
          'unknown-setting',
        );
      }
    }
  }

  private settingString(settings: Setting[], name: string): string | undefined {
    const setting = findSetting(settings, name);
    if (!setting) return undefined;
    const { value } = setting;
    if (value.kind === 'string' || value.kind === 'identifier' || value.kind === 'color') {
      return value.value;
    }
    if (value.kind === 'number') return String(value.value);
    return undefined;
  }

  private settingColor(settings: Setting[], name: string, context: string): string | undefined {
    const setting = findSetting(settings, name);
    if (!setting) return undefined;
    if (setting.value.kind !== 'color') {
      this.warn(
        `${context} "${setting.rawName}" expects a colour like #3498db`,
        setting.span,
        'invalid-color-setting',
      );
      return undefined;
    }
    return setting.value.value;
  }

  // --------------------------------------------------------------- partials

  private declarePartial(declaration: TablePartialDecl): void {
    const key = declaration.name.value;
    if (this.partials.has(key)) {
      this.err(
        `Table partial "${key}" is already defined`,
        declaration.name.span,
        'duplicate-partial',
      );
      return;
    }
    this.checkSettings(declaration.settings, TABLE_SETTINGS, 'table partial');
    this.partials.set(key, declaration);
  }

  // ------------------------------------------------------------------ enums

  private declareEnum(declaration: Extract<Declaration, { kind: 'enum' }>): void {
    const schemaName = declaration.schema?.value ?? DEFAULT_SCHEMA;
    const id = tableId(schemaName, declaration.name.value);
    if (this.enumsByKey.has(id)) {
      this.err(`Enum "${id}" is already defined`, declaration.name.span, 'duplicate-enum');
      return;
    }
    const model: Enum = {
      id,
      schema: schemaName,
      name: declaration.name.value,
      values: declaration.values.map((value) => ({
        name: value.name.value,
        note: this.settingString(value.settings, 'note'),
      })),
      note: declaration.note?.value,
      span: declaration.span,
    };
    if (!model.values.length) {
      this.warn(`Enum "${model.name}" has no values`, declaration.name.span, 'empty-enum');
    }
    this.enumsByKey.set(id, model);
    this.schema.enums.push(model);
  }

  /** Point columns whose type names a declared enum at that enum. */
  private linkEnums(): void {
    for (const table of this.schema.tables) {
      for (const column of table.columns) {
        const key = tableId(column.typeSchema ?? table.schema, column.typeName);
        const fallback = tableId(DEFAULT_SCHEMA, column.typeName);
        const match = this.enumsByKey.get(key) ?? this.enumsByKey.get(fallback);
        if (match) column.enumId = match.id;
      }
    }
  }

  // ----------------------------------------------------------------- tables

  private declareTable(declaration: TableDecl): void {
    const schemaName = declaration.schema?.value ?? DEFAULT_SCHEMA;
    const id = tableId(schemaName, declaration.name.value);
    if (this.tablesByKey.has(id)) {
      this.err(`Table "${id}" is already defined`, declaration.name.span, 'duplicate-table');
      return;
    }
    this.checkSettings(declaration.settings, TABLE_SETTINGS, 'table');

    const table: Table = {
      id,
      schema: schemaName,
      name: declaration.name.value,
      alias: declaration.alias?.value,
      note: declaration.note?.value ?? this.settingString(declaration.settings, 'note'),
      headerColor: this.settingColor(declaration.settings, 'headercolor', 'Table setting'),
      columns: [],
      indexes: [],
      span: declaration.span,
      nameSpan: declaration.name.span,
    };

    for (const entry of declaration.body) {
      if (entry.kind === 'column') {
        this.addColumn(table, entry);
        continue;
      }
      const partial = this.partials.get(entry.name.value);
      if (!partial) {
        this.err(
          `Unknown table partial "${entry.name.value}"`,
          entry.name.span,
          'unknown-partial',
        );
        continue;
      }
      if (!table.headerColor) {
        table.headerColor = this.settingColor(partial.settings, 'headercolor', 'Table setting');
      }
      for (const column of partial.body) {
        this.addColumn(table, column, partial.name.value);
      }
      for (const index of partial.indexes) {
        this.addIndex(table, index);
      }
    }

    for (const index of declaration.indexes) {
      this.addIndex(table, index);
    }

    if (!table.columns.length) {
      this.warn(`Table "${table.name}" has no columns`, declaration.name.span, 'empty-table');
    }

    this.tablesByKey.set(id, table);
    if (table.alias) {
      if (this.tablesByKey.has(table.alias)) {
        this.err(
          `Alias "${table.alias}" is already used`,
          declaration.alias!.span,
          'duplicate-alias',
        );
      } else {
        this.tablesByKey.set(table.alias, table);
      }
    }
    this.schema.tables.push(table);
  }

  private addColumn(table: Table, declaration: ColumnDecl, fromPartial?: string): void {
    const name = declaration.name.value;
    if (table.columns.some((column) => column.name === name)) {
      this.err(
        `Column "${name}" is already defined on table "${table.name}"`,
        declaration.name.span,
        'duplicate-column',
      );
      return;
    }
    this.checkSettings(
      declaration.settings,
      new Set([...COLUMN_FLAGS, ...COLUMN_VALUE_SETTINGS]),
      'column',
    );

    const typeArgs = declaration.type.args;
    const typeSchema = declaration.type.schema?.value;
    const qualified = typeSchema ? `${typeSchema}.${declaration.type.name}` : declaration.type.name;

    const column: Column = {
      id: `${table.id}.${name}`,
      name,
      type: typeArgs ? `${qualified}(${typeArgs})` : qualified,
      typeName: declaration.type.name,
      typeSchema,
      typeArgs,
      pk: hasFlag(declaration.settings, 'pk') || hasFlag(declaration.settings, 'primary key'),
      increment: hasFlag(declaration.settings, 'increment'),
      unique: hasFlag(declaration.settings, 'unique'),
      notNull: hasFlag(declaration.settings, 'not null'),
      note: this.settingString(declaration.settings, 'note'),
      default: this.columnDefault(declaration.settings),
      fromPartial,
      span: declaration.span,
      tableId: table.id,
    };
    table.columns.push(column);

    const inlineRef = findSetting(declaration.settings, 'ref');
    if (inlineRef && inlineRef.value.kind === 'ref') {
      this.pendingInlineRefs.push({
        table,
        column,
        relation: inlineRef.value.relation,
        target: inlineRef.value.endpoint,
        span: inlineRef.span,
      });
    }
  }

  private readonly pendingInlineRefs: {
    table: Table;
    column: Column;
    relation: string;
    target: RefEndpoint;
    span: Span;
  }[] = [];

  private columnDefault(settings: Setting[]): Column['default'] {
    const setting = findSetting(settings, 'default');
    if (!setting) return undefined;
    switch (setting.value.kind) {
      case 'string':
        return { type: 'string', value: setting.value.value };
      case 'number':
        return { type: 'number', value: String(setting.value.value) };
      case 'expression':
        return { type: 'expression', value: setting.value.value };
      case 'identifier': {
        const raw = setting.value.value.toLowerCase();
        if (raw === 'true' || raw === 'false') return { type: 'boolean', value: raw };
        if (raw === 'null') return { type: 'null', value: 'null' };
        return { type: 'string', value: setting.value.value };
      }
      default:
        return undefined;
    }
  }

  private addIndex(table: Table, declaration: IndexDecl): void {
    this.checkSettings(declaration.settings, INDEX_SETTINGS, 'index');
    for (const column of declaration.columns) {
      if (column.kind !== 'column') continue;
      if (!table.columns.some((existing) => existing.name === column.value)) {
        this.err(
          `Index references unknown column "${column.value}" on table "${table.name}"`,
          column.span,
          'unknown-index-column',
        );
      }
    }
    const index: Index = {
      columns: declaration.columns.map(({ kind, value }) => ({ kind, value })),
      name: this.settingString(declaration.settings, 'name'),
      type: this.settingString(declaration.settings, 'type'),
      unique: hasFlag(declaration.settings, 'unique'),
      pk: hasFlag(declaration.settings, 'pk'),
      note: this.settingString(declaration.settings, 'note'),
      span: declaration.span,
    };
    table.indexes.push(index);
  }

  // --------------------------------------------------- refs, groups, notes

  private declareRest(declaration: Declaration): void {
    switch (declaration.kind) {
      case 'project':
        this.declareProject(declaration);
        break;
      case 'ref':
        this.declareRef(declaration);
        break;
      case 'table-group':
        this.declareGroup(declaration);
        break;
      case 'sticky-note':
        this.declareStickyNote(declaration);
        break;
      default:
        break;
    }
  }

  private declareProject(declaration: Extract<Declaration, { kind: 'project' }>): void {
    if (this.schema.project) {
      this.err('Only one Project block is allowed', declaration.span, 'duplicate-project');
      return;
    }
    const properties: Record<string, string> = {};
    for (const property of declaration.properties) {
      properties[property.name] = property.value;
    }
    const project: Project = {
      name: declaration.name?.value,
      databaseType: properties.database_type,
      note: declaration.note?.value,
      properties,
    };
    this.schema.project = project;
  }

  private resolveInlineRefs(): void {
    for (const pending of this.pendingInlineRefs) {
      const [leftCardinality, rightCardinality] =
        CARDINALITIES[pending.relation] ?? CARDINALITIES['>'];
      const target = this.resolveEndpoint(pending.target, rightCardinality);
      if (!target) continue;
      const left: Endpoint = {
        tableId: pending.table.id,
        columnNames: [pending.column.name],
        columnIds: [pending.column.id],
        relation: leftCardinality,
        span: pending.span,
      };
      this.schema.refs.push({
        id: `ref-${this.refCounter++}`,
        endpoints: [left, target],
        span: pending.span,
      });
    }
    this.pendingInlineRefs.length = 0;
  }

  private declareRef(declaration: Extract<Declaration, { kind: 'ref' }>): void {
    this.checkSettings(declaration.settings, REF_SETTINGS, 'relationship');
    const [leftCardinality, rightCardinality] = CARDINALITIES[declaration.relation];
    const left = this.resolveEndpoint(declaration.left, leftCardinality);
    const right = this.resolveEndpoint(declaration.right, rightCardinality);
    if (!left || !right) return;

    if (left.columnNames.length !== right.columnNames.length) {
      this.err(
        'Both sides of a composite relationship must list the same number of columns',
        declaration.span,
        'endpoint-arity-mismatch',
      );
      return;
    }

    const onDelete = this.referentialAction(declaration.settings, 'delete');
    const onUpdate = this.referentialAction(declaration.settings, 'update');

    this.schema.refs.push({
      id: `ref-${this.refCounter++}`,
      name: declaration.name?.value,
      endpoints: [left, right],
      onDelete,
      onUpdate,
      color: this.settingColor(declaration.settings, 'color', 'Relationship setting'),
      span: declaration.span,
    });
  }

  private referentialAction(settings: Setting[], name: string): string | undefined {
    const raw = this.settingString(settings, name);
    if (!raw) return undefined;
    const normalized = raw.toLowerCase();
    if (!REFERENTIAL_ACTIONS.has(normalized)) {
      const setting = findSetting(settings, name)!;
      this.warn(
        `"${raw}" is not a referential action (cascade, restrict, set null, set default, no action)`,
        setting.span,
        'unknown-referential-action',
      );
      return undefined;
    }
    return normalized;
  }

  private resolveEndpoint(endpoint: RefEndpoint, relation: Cardinality): Endpoint | null {
    const table = this.lookupTable(endpoint);
    if (!table) {
      this.err(
        `Unknown table "${qualify(endpoint)}"`,
        endpoint.table.span,
        'unknown-table',
      );
      return null;
    }
    const columnIds: string[] = [];
    for (const column of endpoint.columns) {
      const match = table.columns.find((candidate) => candidate.name === column.value);
      if (!match) {
        this.err(
          `Table "${table.name}" has no column "${column.value}"`,
          column.span,
          'unknown-column',
        );
        return null;
      }
      columnIds.push(match.id);
    }
    if (!columnIds.length) return null;
    return {
      tableId: table.id,
      columnNames: endpoint.columns.map((column) => column.value),
      columnIds,
      relation,
      span: endpoint.span,
    };
  }

  /** Resolve `schema.table`, bare `table` (default schema) or an alias. */
  private lookupTable(endpoint: RefEndpoint): Table | undefined {
    if (endpoint.schema) {
      return this.tablesByKey.get(tableId(endpoint.schema.value, endpoint.table.value));
    }
    return (
      this.tablesByKey.get(tableId(DEFAULT_SCHEMA, endpoint.table.value)) ??
      this.tablesByKey.get(endpoint.table.value)
    );
  }

  private declareGroup(declaration: Extract<Declaration, { kind: 'table-group' }>): void {
    this.checkSettings(declaration.settings, GROUP_SETTINGS, 'table group');
    const group: TableGroup = {
      id: `group-${declaration.name.value}`,
      name: declaration.name.value,
      color: this.settingColor(declaration.settings, 'color', 'Table group setting'),
      note: declaration.note?.value ?? this.settingString(declaration.settings, 'note'),
      tableIds: [],
      span: declaration.span,
    };
    for (const entry of declaration.tables) {
      const table = this.lookupTable(entry);
      if (!table) {
        this.err(`Unknown table "${qualify(entry)}"`, entry.table.span, 'unknown-table');
        continue;
      }
      if (table.groupId && table.groupId !== group.id) {
        this.warn(
          `Table "${table.name}" is already in group "${table.groupId.replace('group-', '')}"`,
          entry.table.span,
          'table-in-multiple-groups',
        );
        continue;
      }
      table.groupId = group.id;
      group.tableIds.push(table.id);
    }
    this.schema.groups.push(group);
  }

  private declareStickyNote(declaration: Extract<Declaration, { kind: 'sticky-note' }>): void {
    const note: StickyNote = {
      id: `note-${declaration.name.value}`,
      name: declaration.name.value,
      content: declaration.content,
      color: this.settingColor(declaration.settings, 'color', 'Note setting'),
      span: declaration.span,
    };
    this.schema.stickyNotes.push(note);
  }
}

function findSetting(settings: Setting[], name: string): Setting | undefined {
  return settings.find((setting) => setting.name === name);
}

function hasFlag(settings: Setting[], name: string): boolean {
  const setting = findSetting(settings, name);
  return Boolean(setting && setting.value.kind === 'flag');
}

function qualify(endpoint: RefEndpoint): string {
  return endpoint.schema ? `${endpoint.schema.value}.${endpoint.table.value}` : endpoint.table.value;
}

export function analyze(document: Document): AnalyzeResult {
  return new Analyzer(document).analyze();
}
