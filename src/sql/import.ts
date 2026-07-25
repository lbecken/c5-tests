/**
 * SQL → DBML.
 *
 * Handles the DDL subset that describes a schema: `CREATE TABLE` (with inline
 * and table-level constraints), `ALTER TABLE … ADD FOREIGN KEY`, `CREATE
 * INDEX`, PostgreSQL's `CREATE TYPE … AS ENUM`, and `COMMENT ON`. Anything
 * else is skipped and reported so you know what didn't survive the trip.
 */

export interface ImportResult {
  dbml: string;
  /** Statements that were recognised but not representable in DBML. */
  skipped: string[];
}

interface ImportedColumn {
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  unique: boolean;
  increment: boolean;
  default?: string;
  defaultIsExpression?: boolean;
  note?: string;
}

interface ImportedIndex {
  columns: string[];
  unique: boolean;
  name?: string;
  type?: string;
}

interface ImportedTable {
  schema?: string;
  name: string;
  columns: ImportedColumn[];
  indexes: ImportedIndex[];
  note?: string;
  compositePk: string[];
}

interface ImportedRef {
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export function fromSQL(sql: string): ImportResult {
  const tables = new Map<string, ImportedTable>();
  const enums: { name: string; values: string[] }[] = [];
  const refs: ImportedRef[] = [];
  const skipped: string[] = [];

  for (const statement of splitStatements(stripComments(sql))) {
    const head = statement.replace(/\s+/g, ' ').trim();
    if (!head) continue;

    if (/^CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE/i.test(head)) {
      const table = parseCreateTable(statement, refs);
      if (table) tables.set(tableKey(table.schema, table.name), table);
      else skipped.push(head);
      continue;
    }
    if (/^CREATE\s+TYPE/i.test(head)) {
      const model = parseCreateEnum(head);
      if (model) enums.push(model);
      else skipped.push(head);
      continue;
    }
    if (/^ALTER\s+TABLE/i.test(head)) {
      if (!parseAlterTable(head, tables, refs)) skipped.push(head);
      continue;
    }
    if (/^CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(head)) {
      if (!parseCreateIndex(head, tables)) skipped.push(head);
      continue;
    }
    if (/^COMMENT\s+ON/i.test(head)) {
      if (!parseComment(head, tables)) skipped.push(head);
      continue;
    }
    skipped.push(head);
  }

  return { dbml: render([...tables.values()], enums, refs), skipped };
}

// ------------------------------------------------------------------ parsing

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Split on semicolons that aren't inside quotes or parentheses. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (quote) {
      current += char;
      if (char === quote && sql[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ';' && depth === 0) {
      statements.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current);
  return statements;
}

/** Split a comma-separated list, ignoring commas inside parens or quotes. */
function splitTopLevel(text: string, separator = ','): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** One identifier: bare, `back-quoted`, "double-quoted" or [bracketed]. */
const IDENT = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\]|\\w+)';
/** A possibly schema-qualified identifier. */
const QUALIFIED = `${IDENT}(?:\\s*\\.\\s*${IDENT})*`;

function unquote(identifier: string): string {
  const trimmed = identifier.trim();
  if (/^["`[].*["`\]]$/.test(trimmed)) return trimmed.slice(1, -1).replace(/""|``/g, (m) => m[0]);
  return trimmed;
}

function splitQualified(name: string): { schema?: string; name: string } {
  const parts = splitTopLevel(name.trim(), '.').map(unquote);
  return parts.length > 1
    ? { schema: parts[parts.length - 2], name: parts[parts.length - 1] }
    : { name: parts[0] };
}

function tableKey(schema: string | undefined, name: string): string {
  return `${schema ?? 'public'}.${name}`;
}

function parseCreateTable(statement: string, refs: ImportedRef[]): ImportedTable | null {
  const open = statement.indexOf('(');
  const close = statement.lastIndexOf(')');
  if (open === -1 || close < open) return null;

  const header = statement.slice(0, open);
  const nameMatch = new RegExp(`TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED})`, 'i').exec(
    header,
  );
  if (!nameMatch) return null;
  const { schema, name } = splitQualified(nameMatch[1]);

  const table: ImportedTable = { schema, name, columns: [], indexes: [], compositePk: [] };
  const tableName = tableKey(schema, name);

  for (const rawEntry of splitTopLevel(statement.slice(open + 1, close))) {
    const entry = rawEntry.trim().replace(/\s+/g, ' ');
    if (!entry) continue;

    const constraint = /^(?:CONSTRAINT\s+([\w."`]+)\s+)?(PRIMARY KEY|UNIQUE|FOREIGN KEY|KEY|INDEX|CHECK)\b/i.exec(
      entry,
    );
    if (constraint) {
      applyTableConstraint(entry, constraint, table, tableName, refs);
      continue;
    }

    const column = parseColumn(entry, tableName, refs);
    if (column) table.columns.push(column);
  }

  // A single-column PRIMARY KEY constraint is nicer expressed on the column.
  if (table.compositePk.length === 1) {
    const column = table.columns.find((candidate) => candidate.name === table.compositePk[0]);
    if (column) {
      column.pk = true;
      table.compositePk = [];
    }
  }
  return table;
}

function applyTableConstraint(
  entry: string,
  constraint: RegExpExecArray,
  table: ImportedTable,
  tableName: string,
  refs: ImportedRef[],
): void {
  const kind = constraint[2].toUpperCase();
  const columns = columnList(entry);

  if (kind === 'PRIMARY KEY') {
    table.compositePk = columns;
    return;
  }
  if (kind === 'UNIQUE') {
    if (columns.length === 1) {
      const column = table.columns.find((candidate) => candidate.name === columns[0]);
      if (column) {
        column.unique = true;
        return;
      }
    }
    table.indexes.push({ columns, unique: true, name: constraint[1] && unquote(constraint[1]) });
    return;
  }
  if (kind === 'KEY' || kind === 'INDEX') {
    table.indexes.push({ columns, unique: false, name: constraint[1] && unquote(constraint[1]) });
    return;
  }
  if (kind === 'FOREIGN KEY') {
    const target = new RegExp(`REFERENCES\\s+(${QUALIFIED})\\s*\\(([^)]*)\\)`, 'i').exec(entry);
    if (!target) return;
    const { schema, name } = splitQualified(target[1]);
    refs.push({
      fromTable: tableName,
      fromColumns: columns,
      toTable: tableKey(schema, name),
      toColumns: splitTopLevel(target[2]).map(unquote),
      onDelete: referentialAction(entry, 'DELETE'),
      onUpdate: referentialAction(entry, 'UPDATE'),
    });
  }
}

/** First parenthesised identifier list in a constraint clause. */
function columnList(entry: string): string[] {
  const match = /\(([^)]*)\)/.exec(entry);
  return match ? splitTopLevel(match[1]).map((part) => unquote(part.replace(/\s+(ASC|DESC)$/i, ''))) : [];
}

function referentialAction(entry: string, kind: 'DELETE' | 'UPDATE'): string | undefined {
  const match = new RegExp(
    `ON\\s+${kind}\\s+(CASCADE|RESTRICT|SET NULL|SET DEFAULT|NO ACTION)`,
    'i',
  ).exec(entry);
  return match ? match[1].toLowerCase() : undefined;
}

function parseColumn(
  entry: string,
  tableName: string,
  refs: ImportedRef[],
): ImportedColumn | null {
  const match = new RegExp(`^(${IDENT})\\s+(.+)$`).exec(entry);
  if (!match) return null;
  const name = unquote(match[1]);
  const rest = match[2];

  // The type is everything up to the first constraint keyword.
  const typeMatch =
    /^([A-Za-z_][\w ]*?(?:\s*\([^)]*\))?(?:\s*\[\])?)(?=\s+(?:NOT NULL|NULL|PRIMARY|UNIQUE|DEFAULT|REFERENCES|AUTO_INCREMENT|GENERATED|COMMENT|CHECK|COLLATE|CONSTRAINT)|$)/i.exec(
      rest,
    );
  const type = (typeMatch ? typeMatch[1] : rest.split(/\s+/)[0]).trim();

  const column: ImportedColumn = {
    name,
    type: normalizeType(type),
    pk: /\bPRIMARY\s+KEY\b/i.test(rest),
    notNull: /\bNOT\s+NULL\b/i.test(rest),
    unique: /\bUNIQUE\b/i.test(rest),
    increment:
      /\bAUTO_INCREMENT\b/i.test(rest) ||
      /\bGENERATED\s+(?:ALWAYS|BY DEFAULT)\s+AS\s+IDENTITY\b/i.test(rest) ||
      /^(big|small)?serial$/i.test(type),
  };

  const defaultMatch = /\bDEFAULT\s+('(?:[^']|'')*'|\([^)]*\)|[\w.]+(?:\([^)]*\))?)/i.exec(rest);
  if (defaultMatch) {
    const raw = defaultMatch[1].trim();
    if (raw.startsWith("'")) {
      column.default = raw.slice(1, -1).replace(/''/g, "'");
    } else if (/^(true|false|null|-?\d+(\.\d+)?)$/i.test(raw)) {
      column.default = raw.toLowerCase();
    } else {
      column.default = raw.replace(/^\((.*)\)$/, '$1');
      column.defaultIsExpression = true;
    }
  }

  const comment = /\bCOMMENT\s+'((?:[^']|'')*)'/i.exec(rest);
  if (comment) column.note = comment[1].replace(/''/g, "'");

  const reference = new RegExp(`\\bREFERENCES\\s+(${QUALIFIED})\\s*(?:\\(([^)]*)\\))?`, 'i').exec(
    rest,
  );
  if (reference) {
    const { schema, name: target } = splitQualified(reference[1]);
    refs.push({
      fromTable: tableName,
      fromColumns: [name],
      toTable: tableKey(schema, target),
      toColumns: reference[2] ? splitTopLevel(reference[2]).map(unquote) : ['id'],
      onDelete: referentialAction(rest, 'DELETE'),
      onUpdate: referentialAction(rest, 'UPDATE'),
    });
  }

  return column;
}

function normalizeType(type: string): string {
  const cleaned = type.replace(/\s+/g, ' ').trim();
  const serial = /^(big|small)?serial$/i.exec(cleaned);
  if (serial) return serial[1] ? `${serial[1]}int` : 'int';
  return cleaned;
}

function parseCreateEnum(statement: string): { name: string; values: string[] } | null {
  const match = new RegExp(`CREATE\\s+TYPE\\s+(${QUALIFIED})\\s+AS\\s+ENUM\\s*\\(([^)]*)\\)`, 'i').exec(
    statement,
  );
  if (!match) return null;
  const { name } = splitQualified(match[1]);
  const values = splitTopLevel(match[2])
    .map((value) => value.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  return { name, values };
}

function parseAlterTable(
  statement: string,
  tables: Map<string, ImportedTable>,
  refs: ImportedRef[],
): boolean {
  const match = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(${QUALIFIED})\\s+ADD\\s+(.*)$`, 'i').exec(
    statement,
  );
  if (!match) return false;
  const { schema, name } = splitQualified(match[1]);
  const key = tableKey(schema, name);
  const clause = match[2];

  const foreignKey = new RegExp(
    `FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*REFERENCES\\s+(${QUALIFIED})\\s*\\(([^)]*)\\)`,
    'i',
  ).exec(clause);
  if (foreignKey) {
    const target = splitQualified(foreignKey[2]);
    refs.push({
      fromTable: key,
      fromColumns: splitTopLevel(foreignKey[1]).map(unquote),
      toTable: tableKey(target.schema, target.name),
      toColumns: splitTopLevel(foreignKey[3]).map(unquote),
      onDelete: referentialAction(clause, 'DELETE'),
      onUpdate: referentialAction(clause, 'UPDATE'),
    });
    return true;
  }

  const table = tables.get(key);
  const primaryKey = /PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(clause);
  if (primaryKey && table) {
    const columns = splitTopLevel(primaryKey[1]).map(unquote);
    if (columns.length === 1) {
      const column = table.columns.find((candidate) => candidate.name === columns[0]);
      if (column) column.pk = true;
    } else {
      table.compositePk = columns;
    }
    return true;
  }

  const unique = /UNIQUE\s*\(([^)]*)\)/i.exec(clause);
  if (unique && table) {
    table.indexes.push({ columns: splitTopLevel(unique[1]).map(unquote), unique: true });
    return true;
  }
  return false;
}

function parseCreateIndex(statement: string, tables: Map<string, ImportedTable>): boolean {
  const match = new RegExp(
    `CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})?\\s*ON\\s+(${QUALIFIED})\\s*(?:USING\\s+(\\w+)\\s*)?\\(([^)]*)\\)`,
    'i',
  ).exec(statement);
  if (!match) return false;
  const { schema, name } = splitQualified(match[3]);
  const table = tables.get(tableKey(schema, name));
  if (!table) return false;
  table.indexes.push({
    columns: splitTopLevel(match[5]).map((column) => unquote(column.replace(/\s+(ASC|DESC)$/i, ''))),
    unique: Boolean(match[1]),
    name: match[2] ? unquote(match[2]) : undefined,
    type: match[4]?.toLowerCase(),
  });
  return true;
}

function parseComment(statement: string, tables: Map<string, ImportedTable>): boolean {
  const table = new RegExp(
    `COMMENT\\s+ON\\s+TABLE\\s+(${QUALIFIED})\\s+IS\\s+'((?:[^']|'')*)'`,
    'i',
  ).exec(statement);
  if (table) {
    const { schema, name } = splitQualified(table[1]);
    const target = tables.get(tableKey(schema, name));
    if (target) target.note = table[2].replace(/''/g, "'");
    return Boolean(target);
  }
  const column = new RegExp(
    `COMMENT\\s+ON\\s+COLUMN\\s+(${QUALIFIED})\\s+IS\\s+'((?:[^']|'')*)'`,
    'i',
  ).exec(statement);
  if (column) {
    const parts = splitTopLevel(column[1], '.').map(unquote);
    const columnName = parts.pop()!;
    const tableName = parts.pop()!;
    const target = tables.get(tableKey(parts.pop(), tableName));
    const field = target?.columns.find((candidate) => candidate.name === columnName);
    if (field) field.note = column[2].replace(/''/g, "'");
    return Boolean(field);
  }
  return false;
}

// ----------------------------------------------------------------- rendering

function render(
  tables: ImportedTable[],
  enums: { name: string; values: string[] }[],
  refs: ImportedRef[],
): string {
  const blocks: string[] = [];

  for (const model of enums) {
    blocks.push(`Enum ${identifier(model.name)} {\n${model.values
      .map((value) => `  ${identifier(value)}`)
      .join('\n')}\n}`);
  }

  for (const table of tables) {
    const lines = table.columns.map((column) => `  ${renderColumn(column)}`);
    if (table.compositePk.length || table.indexes.length) {
      const indexLines: string[] = [];
      if (table.compositePk.length) {
        indexLines.push(`    (${table.compositePk.map(identifier).join(', ')}) [pk]`);
      }
      for (const index of table.indexes) {
        const settings: string[] = [];
        if (index.name) settings.push(`name: '${escape(index.name)}'`);
        if (index.unique) settings.push('unique');
        if (index.type) settings.push(`type: ${index.type}`);
        const columns =
          index.columns.length === 1
            ? identifier(index.columns[0])
            : `(${index.columns.map(identifier).join(', ')})`;
        indexLines.push(`    ${columns}${settings.length ? ` [${settings.join(', ')}]` : ''}`);
      }
      lines.push(`\n  indexes {\n${indexLines.join('\n')}\n  }`);
    }
    if (table.note) lines.push(`\n  Note: '${escape(table.note)}'`);

    const name = table.schema
      ? `${identifier(table.schema)}.${identifier(table.name)}`
      : identifier(table.name);
    blocks.push(`Table ${name} {\n${lines.join('\n')}\n}`);
  }

  for (const ref of refs) {
    const settings: string[] = [];
    if (ref.onDelete) settings.push(`delete: ${ref.onDelete}`);
    if (ref.onUpdate) settings.push(`update: ${ref.onUpdate}`);
    blocks.push(
      `Ref: ${endpoint(ref.fromTable, ref.fromColumns)} > ${endpoint(ref.toTable, ref.toColumns)}${
        settings.length ? ` [${settings.join(', ')}]` : ''
      }`,
    );
  }

  return `${blocks.join('\n\n')}\n`;
}

function renderColumn(column: ImportedColumn): string {
  const settings: string[] = [];
  if (column.pk) settings.push('pk');
  if (column.increment) settings.push('increment');
  if (column.unique && !column.pk) settings.push('unique');
  if (column.notNull && !column.pk) settings.push('not null');
  if (column.default !== undefined) {
    settings.push(
      column.defaultIsExpression
        ? `default: \`${column.default}\``
        : /^(true|false|null|-?\d+(\.\d+)?)$/.test(column.default)
          ? `default: ${column.default}`
          : `default: '${escape(column.default)}'`,
    );
  }
  if (column.note) settings.push(`note: '${escape(column.note)}'`);

  return `${identifier(column.name)} ${column.type}${
    settings.length ? ` [${settings.join(', ')}]` : ''
  }`;
}

function endpoint(table: string, columns: string[]): string {
  const [schema, ...rest] = table.split('.');
  const name = rest.join('.');
  const qualified = schema === 'public' ? identifier(name) : `${identifier(schema)}.${identifier(name)}`;
  return columns.length === 1
    ? `${qualified}.${identifier(columns[0])}`
    : `${qualified}.(${columns.map(identifier).join(', ')})`;
}

/** Quote a name only when DBML needs it. */
function identifier(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name}"`;
}

function escape(value: string): string {
  return value.replace(/'/g, "\\'");
}
