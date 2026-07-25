/**
 * Context-aware autocomplete.
 *
 * Suggestions depend on where the cursor sits: block keywords at the top
 * level, column types inside a table body, setting names inside `[ … ]`,
 * table names after `Ref:`, and column names after `table.`.
 */

import {
  Completion,
  CompletionContext,
  CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { Schema, Table } from '../dbml';
import { COMMON_TYPES, REFERENTIAL_ACTIONS, SETTING_KEYWORDS } from './language';

export type SchemaSource = () => Schema;

const BLOCK_SNIPPETS: Completion[] = [
  snippetCompletion('Table ${name} {\n  ${id} ${integer} [pk]\n  ${}\n}', {
    label: 'Table',
    type: 'keyword',
    detail: 'table definition',
  }),
  snippetCompletion('Ref: ${table}.${column} > ${other}.${id}', {
    label: 'Ref',
    type: 'keyword',
    detail: 'relationship',
  }),
  snippetCompletion('Enum ${name} {\n  ${value}\n}', {
    label: 'Enum',
    type: 'keyword',
    detail: 'enum type',
  }),
  snippetCompletion('TableGroup ${name} {\n  ${table}\n}', {
    label: 'TableGroup',
    type: 'keyword',
    detail: 'group of tables',
  }),
  snippetCompletion("Note ${name} {\n  '${text}'\n}", {
    label: 'Note',
    type: 'keyword',
    detail: 'sticky note',
  }),
  snippetCompletion('TablePartial ${name} {\n  ${column} ${type}\n}', {
    label: 'TablePartial',
    type: 'keyword',
    detail: 'reusable columns',
  }),
  snippetCompletion("Project ${name} {\n  database_type: '${PostgreSQL}'\n}", {
    label: 'Project',
    type: 'keyword',
    detail: 'project metadata',
  }),
  snippetCompletion('indexes {\n  (${columns})\n}', {
    label: 'indexes',
    type: 'keyword',
    detail: 'index block',
  }),
];

const RELATION_COMPLETIONS: Completion[] = [
  { label: '>', type: 'operator', detail: 'many to one' },
  { label: '<', type: 'operator', detail: 'one to many' },
  { label: '-', type: 'operator', detail: 'one to one' },
  { label: '<>', type: 'operator', detail: 'many to many' },
];

interface Context {
  /** The keyword that opened the innermost block, lowercased. */
  block: string | null;
  /** Name written after that keyword, e.g. the table name. */
  blockName: string | null;
  inSettings: boolean;
  inIndexes: boolean;
  depth: number;
}

/**
 * Work out which block the cursor is inside by scanning the text before it.
 * Cheap and good enough: DBML blocks are always brace-delimited and one deep
 * (plus `indexes`).
 */
export function describeContext(state: EditorState, pos: number): Context {
  const text = state.doc.sliceString(0, pos);
  const stack: { keyword: string; name: string | null }[] = [];
  let depth = 0;
  let inString: string | null = null;
  let lineStart = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === inString && text[i - 1] !== '\\') inString = null;
      continue;
    }
    if (char === "'" || char === '`' || char === '"') {
      inString = char;
      continue;
    }
    if (char === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);
      i = newline === -1 ? text.length : newline;
      lineStart = i + 1;
      continue;
    }
    if (char === '\n') {
      lineStart = i + 1;
      continue;
    }
    if (char === '{') {
      const header = text.slice(lineStart, i).trim();
      const match = /^(\w+)\s*(?:"([^"]+)"|([\w.]+))?/.exec(header);
      stack.push({
        keyword: (match?.[1] ?? '').toLowerCase(),
        name: match?.[2] ?? match?.[3] ?? null,
      });
      depth++;
      continue;
    }
    if (char === '}') {
      stack.pop();
      depth = Math.max(0, depth - 1);
    }
  }

  const line = state.doc.lineAt(pos);
  const beforeOnLine = line.text.slice(0, pos - line.from);
  const opens = (beforeOnLine.match(/\[/g) ?? []).length;
  const closes = (beforeOnLine.match(/\]/g) ?? []).length;
  const top = stack[stack.length - 1];
  const parent = stack[stack.length - 2];

  return {
    block: top?.keyword === 'indexes' ? (parent?.keyword ?? null) : (top?.keyword ?? null),
    blockName: top?.keyword === 'indexes' ? (parent?.name ?? null) : (top?.name ?? null),
    inSettings: opens > closes,
    inIndexes: top?.keyword === 'indexes',
    depth,
  };
}

function tableCompletions(schema: Schema): Completion[] {
  const completions: Completion[] = [];
  for (const table of schema.tables) {
    completions.push({
      label: table.name,
      type: 'class',
      detail: table.schema === 'public' ? 'table' : `table in ${table.schema}`,
      info: table.note,
    });
    if (table.alias) {
      completions.push({ label: table.alias, type: 'class', detail: `alias of ${table.name}` });
    }
  }
  return completions;
}

function columnCompletions(table: Table): Completion[] {
  return table.columns.map((column) => ({
    label: column.name,
    type: column.pk ? 'constant' : 'property',
    detail: column.type,
    info: column.note,
  }));
}

function typeCompletions(schema: Schema): Completion[] {
  return [
    ...COMMON_TYPES.map((type) => ({ label: type, type: 'type' as const })),
    ...schema.enums.map((model) => ({
      label: model.name,
      type: 'enum',
      detail: `enum (${model.values.length} values)`,
    })),
  ];
}

function findTable(schema: Schema, name: string): Table | undefined {
  return schema.tables.find(
    (table) => table.name === name || table.alias === name || table.id === name,
  );
}

export function dbmlCompletion(getSchema: SchemaSource) {
  return (context: CompletionContext): CompletionResult | null => {
    const schema = getSchema();
    const where = describeContext(context.state, context.pos);
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    // `table.` → that table's columns.
    const dotted = /(?:^|[\s:,(<>~-])([A-Za-z_][\w]*)\.([\w]*)$/.exec(before);
    if (dotted && !where.inSettings) {
      const table = findTable(schema, dotted[1]);
      if (table) {
        return {
          from: context.pos - dotted[2].length,
          options: columnCompletions(table),
          validFor: /^\w*$/,
        };
      }
    }

    const word = context.matchBefore(/[\w.]*/);
    const from = word ? word.from : context.pos;

    if (where.inSettings) {
      if (/\bref:\s*[<>~-]*\s*[\w]*$/i.test(before)) {
        return { from, options: [...RELATION_COMPLETIONS, ...tableCompletions(schema)] };
      }
      if (/\b(delete|update):\s*\w*$/i.test(before)) {
        return {
          from,
          options: REFERENTIAL_ACTIONS.map((action) => ({ label: action, type: 'constant' })),
        };
      }
      if (/\bdefault:\s*\w*$/i.test(before)) {
        return {
          from,
          options: ['null', 'true', 'false'].map((value) => ({ label: value, type: 'constant' })),
        };
      }
      if (!word && !context.explicit) return null;
      return {
        from,
        options: SETTING_KEYWORDS.map((setting) => ({
          label: setting,
          type: 'property',
          detail: 'setting',
        })),
        validFor: /^[\w ]*$/,
      };
    }

    if (where.inIndexes) {
      const table = where.blockName ? findTable(schema, where.blockName) : undefined;
      if (table) return { from, options: columnCompletions(table), validFor: /^\w*$/ };
    }

    if (where.block === 'table' || where.block === 'tablepartial') {
      // Second word on the line is the column's type.
      if (/^\s*[\w"]+\s+[\w]*$/.test(before)) {
        return { from, options: typeCompletions(schema), validFor: /^\w*$/ };
      }
      if (!word?.text && !context.explicit) return null;
      return {
        from,
        options: [
          { label: 'Note', type: 'keyword', detail: 'table note' },
          snippetCompletion('indexes {\n  (${columns})\n}', {
            label: 'indexes',
            type: 'keyword',
          }),
        ],
        validFor: /^\w*$/,
      };
    }

    if (where.block === 'tablegroup' || where.block === 'ref') {
      return { from, options: tableCompletions(schema), validFor: /^[\w.]*$/ };
    }

    if (where.depth === 0) {
      // Top level: either a new block, or a table name right after `Ref:`.
      if (/\bref\b[^:]*:\s*[\w.]*$/i.test(before)) {
        return { from, options: tableCompletions(schema), validFor: /^[\w.]*$/ };
      }
      if (!word?.text && !context.explicit) return null;
      return { from, options: BLOCK_SNIPPETS, validFor: /^\w*$/ };
    }

    return null;
  };
}
