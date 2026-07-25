/**
 * DBML language support for CodeMirror.
 *
 * A stream tokenizer rather than a Lezer grammar: DBML's shape is simple enough
 * that a line-oriented tokenizer highlights it accurately, and it can't fail on
 * half-written code the way a strict grammar would.
 */

import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  StringStream,
  bracketMatching,
  foldService,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';

const BLOCK_KEYWORDS = new Set([
  'project',
  'table',
  'tablepartial',
  'ref',
  'enum',
  'tablegroup',
  'note',
  'indexes',
]);

const MODIFIERS = new Set(['as']);

/** Column and element settings that live inside `[ ... ]`. */
export const SETTING_KEYWORDS = [
  'pk',
  'primary key',
  'increment',
  'unique',
  'not null',
  'null',
  'note',
  'default',
  'ref',
  'name',
  'type',
  'headercolor',
  'color',
  'delete',
  'update',
];

export const REFERENTIAL_ACTIONS = ['cascade', 'restrict', 'set null', 'set default', 'no action'];

/** Types offered by autocomplete; not a restriction on what you may write. */
export const COMMON_TYPES = [
  'int',
  'integer',
  'bigint',
  'smallint',
  'serial',
  'bigserial',
  'decimal',
  'numeric',
  'real',
  'double',
  'float',
  'boolean',
  'bool',
  'char',
  'varchar',
  'text',
  'uuid',
  'json',
  'jsonb',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'datetime',
  'binary',
  'blob',
  'bytea',
];

interface DbmlState {
  /** Depth of `[ ... ]` nesting, so settings highlight differently. */
  inSettings: number;
  inBlockComment: boolean;
  inMultilineString: boolean;
  /** Set right after a column name so the next word highlights as a type. */
  expectType: boolean;
  lineStart: boolean;
}

export const dbmlStreamLanguage = StreamLanguage.define<DbmlState>({
  name: 'dbml',

  startState: () => ({
    inSettings: 0,
    inBlockComment: false,
    inMultilineString: false,
    expectType: false,
    lineStart: true,
  }),

  token(stream: StringStream, state: DbmlState): string | null {
    if (state.inBlockComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    if (state.inMultilineString) {
      if (stream.skipTo("'''")) {
        stream.match("'''");
        state.inMultilineString = false;
      } else {
        stream.skipToEnd();
      }
      return 'string';
    }

    if (stream.sol()) state.lineStart = true;
    if (stream.eatSpace()) return null;

    // Comments
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      state.inBlockComment = true;
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    // Strings and raw SQL expressions
    if (stream.match("'''")) {
      state.inMultilineString = true;
      if (stream.skipTo("'''")) {
        stream.match("'''");
        state.inMultilineString = false;
      } else {
        stream.skipToEnd();
      }
      return 'string';
    }
    if (stream.peek() === "'") {
      consumeQuoted(stream, "'");
      return 'string';
    }
    if (stream.peek() === '`') {
      consumeQuoted(stream, '`');
      return 'string2';
    }
    if (stream.peek() === '"') {
      consumeQuoted(stream, '"');
      state.expectType = state.lineStart && !state.inSettings;
      state.lineStart = false;
      return 'variableName';
    }

    // Colours
    if (stream.match(/^#[0-9a-fA-F]{3,6}/)) return 'color';

    // Punctuation and operators
    if (stream.match(/^<>|^[<>]|^-(?![0-9])/)) return 'operator';
    if (stream.eat('[')) {
      state.inSettings++;
      state.expectType = false;
      return 'squareBracket';
    }
    if (stream.eat(']')) {
      state.inSettings = Math.max(0, state.inSettings - 1);
      return 'squareBracket';
    }
    if (stream.eat('{') || stream.eat('}')) {
      state.expectType = false;
      state.lineStart = true;
      return 'brace';
    }
    if (stream.eat('~')) return 'operator';
    if (stream.match(/^[(),.:;]/)) return 'punctuation';

    if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';

    const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (!word || word === true) {
      stream.next();
      return null;
    }
    const text = word[0].toLowerCase();

    if (state.inSettings) {
      // Inside `[ ... ]` the first word of each entry is a setting name.
      const isValue = /^\s*[,\]]/.test(stream.string.slice(stream.pos)) === false;
      return SETTING_KEYWORDS.includes(text) || !isValue ? 'attributeName' : 'attributeValue';
    }

    if (state.lineStart && BLOCK_KEYWORDS.has(text)) {
      state.lineStart = false;
      state.expectType = false;
      return 'keyword';
    }
    if (MODIFIERS.has(text)) return 'modifier';

    if (state.expectType) {
      state.expectType = false;
      return 'typeName';
    }
    if (state.lineStart) {
      state.lineStart = false;
      state.expectType = true;
      return 'variableName';
    }
    return 'name';
  },

  blankLine(state: DbmlState) {
    state.lineStart = true;
    state.expectType = false;
  },

  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['{', '[', '(', "'", '`', '"'] },
    indentOnInput: /^\s*[}\]]$/,
  },

  tokenTable: {
    color: tags.color,
    attributeName: tags.attributeName,
    attributeValue: tags.attributeValue,
    modifier: tags.modifier,
    name: tags.name,
    punctuation: tags.punctuation,
    brace: tags.brace,
    squareBracket: tags.squareBracket,
  },
});

/**
 * Fold table/enum/group bodies: a line ending in `{` folds down to its
 * matching `}`.
 */
const dbmlFolding = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.lineAt(lineStart);
  const open = line.text.lastIndexOf('{');
  if (open < 0 || line.text.slice(open + 1).trim()) return null;

  const from = line.from + open;
  const rest = state.doc.sliceString(from, state.doc.length);
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '{') depth++;
    else if (rest[i] === '}') {
      depth--;
      if (depth === 0) {
        const close = from + i;
        return close > lineEnd ? { from: lineEnd, to: close } : null;
      }
    }
  }
  return null;
});

export const dbmlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.special(tags.string), color: 'var(--syntax-expression)' },
  { tag: tags.variableName, color: 'var(--syntax-name)' },
  { tag: tags.typeName, color: 'var(--syntax-type)' },
  { tag: tags.attributeName, color: 'var(--syntax-setting)' },
  { tag: tags.attributeValue, color: 'var(--syntax-value)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: tags.color, color: 'var(--syntax-color)' },
  { tag: tags.operator, color: 'var(--syntax-operator)', fontWeight: '600' },
  { tag: tags.modifier, color: 'var(--syntax-keyword)' },
  { tag: tags.punctuation, color: 'var(--syntax-punctuation)' },
  { tag: tags.brace, color: 'var(--syntax-punctuation)' },
  { tag: tags.squareBracket, color: 'var(--syntax-punctuation)' },
  { tag: tags.name, color: 'var(--syntax-name)' },
]);

export function dbml(): LanguageSupport {
  return new LanguageSupport(dbmlStreamLanguage, [
    dbmlFolding,
    indentUnit.of('  '),
    bracketMatching(),
    syntaxHighlighting(dbmlHighlightStyle),
  ]);
}

function consumeQuoted(stream: StringStream, quote: string): void {
  stream.next();
  let escaped = false;
  let next: string | void;
  while ((next = stream.next()) !== undefined) {
    if (next === quote && !escaped) return;
    escaped = !escaped && next === '\\';
  }
}
