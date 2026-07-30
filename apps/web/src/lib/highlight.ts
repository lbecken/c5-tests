/**
 * A small, synchronous syntax highlighter.
 *
 * A diff view needs token *positions* so syntax colour can be composed with the
 * character-level change highlight underneath it, and it needs them fast enough
 * to run during scrolling. Grammar-based highlighters give neither cheaply, so
 * this is a hand-rolled lexer covering the constructs that actually carry
 * meaning when you are reading a diff: comments, strings, numbers, keywords,
 * types and call sites. It is deliberately approximate — a mis-coloured token
 * costs nothing, a slow scroll costs everything.
 */

export type TokenKind =
  | 'plain'
  | 'keyword'
  | 'type'
  | 'string'
  | 'number'
  | 'comment'
  | 'func'
  | 'punct';

export interface Token {
  start: number;
  end: number;
  kind: TokenKind;
}

interface LanguageSpec {
  keywords: ReadonlySet<string>;
  types?: ReadonlySet<string>;
  lineComments: readonly string[];
  blockComment?: readonly [string, string];
  quotes: readonly string[];
  /** Python-style `"""` and `'''` blocks. */
  tripleQuotes?: boolean;
  /** Identifiers may contain these beyond letters, digits and underscore. */
  extraIdentifier?: readonly string[];
}

const words = (text: string): ReadonlySet<string> => new Set(text.split(/\s+/).filter(Boolean));

const C_LIKE_TYPES = words(`
  int long short char float double void bool unsigned signed size_t
  string String number boolean object symbol bigint any unknown never
  Array Map Set Promise Record Partial Readonly
`);

const JS_KEYWORDS = words(`
  abstract as async await break case catch class const continue debugger declare default delete do
  else enum export extends false finally for from function get if implements import in infer
  instanceof interface is keyof let new null of package private protected public readonly return
  satisfies set static super switch this throw true try type typeof undefined var void while with
  yield
`);

const PYTHON_KEYWORDS = words(`
  and as assert async await break class continue def del elif else except False finally for from
  global if import in is lambda None nonlocal not or pass raise return True try while with yield
  match case self
`);

const GO_KEYWORDS = words(`
  break case chan const continue default defer else fallthrough for func go goto if import
  interface map package range return select struct switch type var nil true false
`);

const RUST_KEYWORDS = words(`
  as async await break const continue crate dyn else enum extern false fn for if impl in let loop
  match mod move mut pub ref return self Self static struct super trait true type unsafe use where
  while
`);

const C_KEYWORDS = words(`
  auto break case const continue default do else enum extern for goto if inline register restrict
  return sizeof static struct switch typedef union volatile while class namespace template public
  private protected virtual override new delete this nullptr true false using constexpr
`);

const JAVA_KEYWORDS = words(`
  abstract assert boolean break byte case catch char class const continue default do double else
  enum extends final finally float for goto if implements import instanceof int interface long
  native new package private protected public return short static strictfp super switch
  synchronized this throw throws transient try var void volatile while true false null record
  sealed yield
`);

const SHELL_KEYWORDS = words(`
  if then else elif fi case esac for while until do done function return local export readonly
  declare source alias unset set trap exit in select time
`);

const SQL_KEYWORDS = words(`
  select from where group by having order limit offset insert into values update set delete create
  table alter drop index view join left right inner outer on as and or not null distinct union all
  primary key foreign references default constraint begin commit rollback with returning
`);

const RUBY_KEYWORDS = words(`
  alias and begin break case class def defined do else elsif end ensure false for if in module next
  nil not or redo rescue retry return self super then true undef unless until when while yield
  require require_relative attr_accessor attr_reader attr_writer
`);

const CSS_KEYWORDS = words(`
  important media supports keyframes import charset font-face include mixin extend use forward
`);

const DEFAULT_SPEC: LanguageSpec = {
  keywords: new Set(),
  lineComments: ['#', '//'],
  quotes: ['"', "'"],
};

const SPECS: Record<string, LanguageSpec> = {
  typescript: {
    keywords: JS_KEYWORDS,
    types: C_LIKE_TYPES,
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'", '`'],
    extraIdentifier: ['$'],
  },
  javascript: {
    keywords: JS_KEYWORDS,
    types: C_LIKE_TYPES,
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'", '`'],
    extraIdentifier: ['$'],
  },
  python: {
    keywords: PYTHON_KEYWORDS,
    lineComments: ['#'],
    quotes: ['"', "'"],
    tripleQuotes: true,
  },
  go: {
    keywords: GO_KEYWORDS,
    types: C_LIKE_TYPES,
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'", '`'],
  },
  rust: {
    keywords: RUST_KEYWORDS,
    types: C_LIKE_TYPES,
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'"],
  },
  c: {
    keywords: C_KEYWORDS,
    types: C_LIKE_TYPES,
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'"],
  },
  java: {
    keywords: JAVA_KEYWORDS,
    types: C_LIKE_TYPES,
    lineComments: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'"],
  },
  bash: { keywords: SHELL_KEYWORDS, lineComments: ['#'], quotes: ['"', "'"] },
  sql: { keywords: SQL_KEYWORDS, lineComments: ['--'], blockComment: ['/*', '*/'], quotes: ['"', "'"] },
  ruby: { keywords: RUBY_KEYWORDS, lineComments: ['#'], quotes: ['"', "'"] },
  css: {
    keywords: CSS_KEYWORDS,
    lineComments: [],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'"],
    extraIdentifier: ['-', '@'],
  },
  json: { keywords: words('true false null'), lineComments: [], quotes: ['"'] },
  yaml: { keywords: words('true false null yes no on off'), lineComments: ['#'], quotes: ['"', "'"] },
  markdown: { keywords: new Set(), lineComments: [], quotes: ['`'] },
  plaintext: { keywords: new Set(), lineComments: [], quotes: [] },
};

const ALIASES: Record<string, string> = {
  tsx: 'typescript',
  jsx: 'javascript',
  scss: 'css',
  less: 'css',
  cpp: 'c',
  csharp: 'java',
  kotlin: 'java',
  swift: 'java',
  scala: 'java',
  objectivec: 'c',
  php: 'c',
  dart: 'java',
  groovy: 'java',
  toml: 'ini',
  ini: 'yaml',
  hcl: 'yaml',
  dockerfile: 'bash',
  makefile: 'bash',
  cmake: 'bash',
  powershell: 'bash',
  perl: 'ruby',
  elixir: 'ruby',
  erlang: 'ruby',
  haskell: 'rust',
  lua: 'ruby',
  r: 'ruby',
  clojure: 'ruby',
  protobuf: 'c',
  graphql: 'c',
  xml: 'markdown',
  html: 'markdown',
  diff: 'plaintext',
};

function specFor(language: string): LanguageSpec {
  const resolved = ALIASES[language] ?? language;
  return SPECS[resolved] ?? SPECS[ALIASES[resolved] ?? ''] ?? DEFAULT_SPEC;
}

/** Lexer state that survives a line break. */
interface CarryState {
  inBlockComment: boolean;
  /** Quote character of an unterminated multi-line string, if any. */
  inString: string | null;
  tripleQuote: string | null;
}

function isIdentifierStart(ch: string, spec: LanguageSpec): boolean {
  return /[A-Za-z_]/.test(ch) || (spec.extraIdentifier?.includes(ch) ?? false);
}

function isIdentifierPart(ch: string, spec: LanguageSpec): boolean {
  return /[A-Za-z0-9_]/.test(ch) || (spec.extraIdentifier?.includes(ch) ?? false);
}

function tokenizeLine(line: string, spec: LanguageSpec, state: CarryState): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (start: number, end: number, kind: TokenKind): void => {
    if (end > start && kind !== 'plain') tokens.push({ start, end, kind });
  };

  // Continue a construct that began on an earlier line.
  if (state.inBlockComment && spec.blockComment) {
    const close = line.indexOf(spec.blockComment[1]);
    if (close === -1) {
      push(0, line.length, 'comment');
      return tokens;
    }
    push(0, close + spec.blockComment[1].length, 'comment');
    state.inBlockComment = false;
    i = close + spec.blockComment[1].length;
  } else if (state.tripleQuote) {
    const close = line.indexOf(state.tripleQuote);
    if (close === -1) {
      push(0, line.length, 'string');
      return tokens;
    }
    push(0, close + 3, 'string');
    state.tripleQuote = null;
    i = close + 3;
  } else if (state.inString) {
    const end = scanString(line, 0, state.inString);
    push(0, end.index, 'string');
    if (!end.continues) state.inString = null;
    if (end.continues) return tokens;
    i = end.index;
  }

  while (i < line.length) {
    const ch = line[i]!;

    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    const lineComment = spec.lineComments.find((marker) => line.startsWith(marker, i));
    if (lineComment) {
      push(i, line.length, 'comment');
      return tokens;
    }

    if (spec.blockComment && line.startsWith(spec.blockComment[0], i)) {
      const close = line.indexOf(spec.blockComment[1], i + spec.blockComment[0].length);
      if (close === -1) {
        push(i, line.length, 'comment');
        state.inBlockComment = true;
        return tokens;
      }
      push(i, close + spec.blockComment[1].length, 'comment');
      i = close + spec.blockComment[1].length;
      continue;
    }

    if (spec.tripleQuotes && (line.startsWith('"""', i) || line.startsWith("'''", i))) {
      const marker = line.slice(i, i + 3);
      const close = line.indexOf(marker, i + 3);
      if (close === -1) {
        push(i, line.length, 'string');
        state.tripleQuote = marker;
        return tokens;
      }
      push(i, close + 3, 'string');
      i = close + 3;
      continue;
    }

    if (spec.quotes.includes(ch)) {
      const result = scanString(line, i + 1, ch);
      push(i, result.index, 'string');
      if (result.continues) {
        // Only backticks and triple quotes legitimately span lines; an
        // unterminated regular quote is far more likely to be a typo or an
        // escape we do not model, so we do not carry it forward.
        if (ch === '`') state.inString = ch;
        return tokens;
      }
      i = result.index;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < line.length && /[0-9a-fA-FxXoObB_.eE+-]/.test(line[j]!)) {
        // Stop at a `-` or `+` that is not part of an exponent.
        if ((line[j] === '-' || line[j] === '+') && !/[eE]/.test(line[j - 1]!)) break;
        j++;
      }
      push(i, j, 'number');
      i = j;
      continue;
    }

    if (isIdentifierStart(ch, spec)) {
      let j = i + 1;
      while (j < line.length && isIdentifierPart(line[j]!, spec)) j++;
      const word = line.slice(i, j);
      let kind: TokenKind = 'plain';
      if (spec.keywords.has(word)) kind = 'keyword';
      else if (spec.types?.has(word)) kind = 'type';
      else if (line[j] === '(') kind = 'func';
      else if (/^[A-Z]/.test(word) && word.length > 1) kind = 'type';
      push(i, j, kind);
      i = j;
      continue;
    }

    let j = i;
    while (j < line.length && /[^\w\s]/.test(line[j]!) && !spec.quotes.includes(line[j]!)) {
      if (spec.lineComments.some((marker) => line.startsWith(marker, j))) break;
      if (spec.blockComment && line.startsWith(spec.blockComment[0], j)) break;
      j++;
    }
    if (j === i) j++;
    push(i, j, 'punct');
    i = j;
  }

  return tokens;
}

function scanString(line: string, from: number, quote: string): { index: number; continues: boolean } {
  let i = from;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return { index: i + 1, continues: false };
    i++;
  }
  return { index: line.length, continues: true };
}

/**
 * Highlight a whole file at once so constructs that span lines — block
 * comments, template literals, docstrings — resolve correctly. Returns one
 * token array per input line.
 */
export function highlightLines(lines: readonly string[], language: string): Token[][] {
  const spec = specFor(language);
  const state: CarryState = { inBlockComment: false, inString: null, tripleQuote: null };
  const result: Token[][] = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    result[i] = tokenizeLine(lines[i]!, spec, state);
  }
  return result;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: '',
  keyword: 'tk-keyword',
  type: 'tk-type',
  string: 'tk-string',
  number: 'tk-number',
  comment: 'tk-comment',
  func: 'tk-func',
  punct: 'tk-punct',
};
