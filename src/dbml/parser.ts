/**
 * Recursive-descent parser for DBML.
 *
 * The parser is error-tolerant: a broken declaration produces a diagnostic and
 * is skipped, so the rest of the document still reaches the diagram. That
 * matters a lot for a live editor — you type `Table users {` and the tables you
 * already wrote should stay on the canvas instead of blinking out.
 */

import {
  ColumnDecl,
  Declaration,
  Document,
  EnumDecl,
  EnumValueDecl,
  IndexColumn,
  IndexDecl,
  Name,
  NoteDecl,
  PartialInjectionDecl,
  ProjectDecl,
  RefDecl,
  RefEndpoint,
  RelationOp,
  Setting,
  SettingValue,
  StickyNoteDecl,
  TableDecl,
  TableGroupDecl,
  TablePartialDecl,
  TypeRef,
} from './ast';
import { Diagnostic, DbmlSyntaxError, Span, error, mergeSpans } from './diagnostics';
import { Token, TokenKind, tokenize } from './lexer';

export interface ParseResult {
  document: Document;
  diagnostics: Diagnostic[];
}

/** Top-level keywords, used both for dispatch and for error recovery. */
const TOP_LEVEL_KEYWORDS = new Set([
  'project',
  'table',
  'tablepartial',
  'ref',
  'enum',
  'tablegroup',
  'note',
]);

class Parser {
  private index = 0;
  readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly tokens: Token[]) {}

  // ---------------------------------------------------------------- helpers

  private peek(ahead = 0): Token {
    return this.tokens[Math.min(this.index + ahead, this.tokens.length - 1)];
  }

  private get current(): Token {
    return this.peek();
  }

  private get atEnd(): boolean {
    return this.current.kind === TokenKind.EOF;
  }

  private advance(): Token {
    const token = this.current;
    if (!this.atEnd) this.index++;
    return token;
  }

  private check(kind: TokenKind): boolean {
    return this.current.kind === kind;
  }

  private match(kind: TokenKind): Token | null {
    return this.check(kind) ? this.advance() : null;
  }

  private expect(kind: TokenKind, what: string = kind): Token {
    if (this.check(kind)) return this.advance();
    throw new DbmlSyntaxError(
      `Expected ${what} but found ${describe(this.current)}`,
      this.current.span,
      'unexpected-token',
    );
  }

  /** True when the current token is the given bare word (case-insensitive). */
  private isKeyword(word: string): boolean {
    return (
      this.current.kind === TokenKind.Identifier &&
      this.current.value.toLowerCase() === word
    );
  }

  private nameFromToken(token: Token): Name {
    return token.kind === TokenKind.QuotedIdentifier
      ? { value: token.value, span: token.span, quoted: true }
      : { value: token.value, span: token.span };
  }

  private expectName(what = 'a name'): Name {
    if (this.check(TokenKind.Identifier) || this.check(TokenKind.QuotedIdentifier)) {
      return this.nameFromToken(this.advance());
    }
    throw new DbmlSyntaxError(
      `Expected ${what} but found ${describe(this.current)}`,
      this.current.span,
      'expected-name',
    );
  }

  /** `name` or `schema.name`. */
  private qualifiedName(what?: string): { schema?: Name; name: Name } {
    const first = this.expectName(what);
    if (this.check(TokenKind.Dot)) {
      this.advance();
      return { schema: first, name: this.expectName(what) };
    }
    return { name: first };
  }

  /** Skip forward to the next plausible declaration start after an error. */
  private synchronize(): void {
    let depth = 0;
    while (!this.atEnd) {
      if (this.check(TokenKind.LBrace)) depth++;
      if (this.check(TokenKind.RBrace)) {
        depth--;
        this.advance();
        if (depth <= 0) return;
        continue;
      }
      if (
        depth <= 0 &&
        this.current.kind === TokenKind.Identifier &&
        this.current.startsLine &&
        TOP_LEVEL_KEYWORDS.has(this.current.value.toLowerCase())
      ) {
        return;
      }
      this.advance();
    }
  }

  private report(err: unknown): void {
    if (err instanceof DbmlSyntaxError) {
      this.diagnostics.push(error(err.message, err.span, err.code));
      return;
    }
    throw err;
  }

  // ----------------------------------------------------------------- entry

  parse(): Document {
    const start = this.current.span.start;
    const declarations: Declaration[] = [];
    while (!this.atEnd) {
      const before = this.index;
      try {
        const declaration = this.declaration();
        if (declaration) declarations.push(declaration);
      } catch (err) {
        this.report(err);
        this.synchronize();
      }
      // Guarantee forward progress even if a branch consumed nothing.
      if (this.index === before) this.advance();
    }
    return {
      declarations,
      span: { start, end: this.tokens[this.tokens.length - 1].span.end },
    };
  }

  private declaration(): Declaration | null {
    if (this.current.kind !== TokenKind.Identifier) {
      throw new DbmlSyntaxError(
        `Expected a declaration (Table, Ref, Enum, TableGroup, Note, Project) but found ${describe(this.current)}`,
        this.current.span,
        'expected-declaration',
      );
    }
    switch (this.current.value.toLowerCase()) {
      case 'project':
        return this.project();
      case 'table':
        return this.table();
      case 'tablepartial':
        return this.tablePartial();
      case 'ref':
        return this.ref();
      case 'enum':
        return this.enum();
      case 'tablegroup':
        return this.tableGroup();
      case 'note':
        return this.stickyNote();
      default:
        throw new DbmlSyntaxError(
          `Unknown declaration "${this.current.value}"`,
          this.current.span,
          'unknown-declaration',
        );
    }
  }

  // ------------------------------------------------------------- settings

  /** `[pk, name: 'x', default: `now()`, ref: > users.id]` */
  private settings(): Setting[] {
    const settings: Setting[] = [];
    if (!this.check(TokenKind.LBracket)) return settings;
    this.advance();
    if (this.match(TokenKind.RBracket)) return settings;

    for (;;) {
      settings.push(this.setting());
      if (this.match(TokenKind.Comma)) continue;
      this.expect(TokenKind.RBracket, '"]"');
      return settings;
    }
  }

  private setting(): Setting {
    const start = this.current.span;
    // Setting names may be several words: `not null`, `primary key`.
    const words: string[] = [];
    while (this.check(TokenKind.Identifier) || this.check(TokenKind.QuotedIdentifier)) {
      words.push(this.advance().value);
    }
    if (!words.length) {
      throw new DbmlSyntaxError(
        `Expected a setting name but found ${describe(this.current)}`,
        this.current.span,
        'expected-setting',
      );
    }
    const rawName = words.join(' ');
    const nameSpan = mergeSpans(start, this.tokens[this.index - 1].span);

    if (!this.match(TokenKind.Colon)) {
      return { name: rawName.toLowerCase(), rawName, value: { kind: 'flag' }, span: nameSpan, nameSpan };
    }
    const value = this.settingValue(rawName.toLowerCase());
    return {
      name: rawName.toLowerCase(),
      rawName,
      value,
      span: mergeSpans(nameSpan, this.tokens[this.index - 1].span),
      nameSpan,
    };
  }

  private settingValue(settingName: string): SettingValue {
    const token = this.current;
    if (settingName === 'ref') {
      const relation = this.relationOp();
      return { kind: 'ref', relation, endpoint: this.refEndpoint() };
    }
    switch (token.kind) {
      case TokenKind.String:
        this.advance();
        return token.multiline
          ? { kind: 'string', value: token.value, multiline: true }
          : { kind: 'string', value: token.value };
      case TokenKind.Number:
        this.advance();
        return { kind: 'number', value: Number(token.value) };
      case TokenKind.Expression:
        this.advance();
        return { kind: 'expression', value: token.value };
      case TokenKind.Color:
        this.advance();
        return { kind: 'color', value: token.value };
      case TokenKind.Identifier:
      case TokenKind.QuotedIdentifier: {
        // Multi-word values such as `delete: no action`.
        const words = [this.advance().value];
        while (this.check(TokenKind.Identifier)) {
          words.push(this.advance().value);
        }
        return { kind: 'identifier', value: words.join(' ') };
      }
      default:
        throw new DbmlSyntaxError(
          `Expected a value for setting "${settingName}" but found ${describe(token)}`,
          token.span,
          'expected-setting-value',
        );
    }
  }

  private relationOp(): RelationOp {
    const token = this.expect(TokenKind.Relation, 'a relationship operator (<, >, - or <>)');
    return token.value as RelationOp;
  }

  /** `users.id`, `schema.users.id` or `schema.users.(a, b)`. */
  private refEndpoint(): RefEndpoint {
    const start = this.current.span;
    const parts: Name[] = [this.expectName('a table name')];
    let columns: Name[] | null = null;

    while (this.check(TokenKind.Dot)) {
      this.advance();
      if (this.check(TokenKind.LParen)) {
        this.advance();
        columns = [];
        if (!this.check(TokenKind.RParen)) {
          do {
            columns.push(this.expectName('a column name'));
          } while (this.match(TokenKind.Comma));
        }
        this.expect(TokenKind.RParen, '")"');
        break;
      }
      parts.push(this.expectName('a name'));
    }

    const span = mergeSpans(start, this.tokens[this.index - 1].span);
    if (columns) {
      const table = parts[parts.length - 1];
      const schema = parts.length > 1 ? parts[parts.length - 2] : undefined;
      return { schema, table, columns, span };
    }
    if (parts.length < 2) {
      throw new DbmlSyntaxError(
        'A relationship endpoint needs a table and a column, e.g. `users.id`',
        span,
        'incomplete-endpoint',
      );
    }
    return {
      schema: parts.length > 2 ? parts[parts.length - 3] : undefined,
      table: parts[parts.length - 2],
      columns: [parts[parts.length - 1]],
      span,
    };
  }

  // ------------------------------------------------------------ note bodies

  /** `Note: 'text'` or `Note { 'text' }`. Assumes `Note` is current. */
  private noteBody(): NoteDecl {
    const start = this.advance().span; // `Note`
    if (this.match(TokenKind.Colon)) {
      const token = this.expect(TokenKind.String, 'a note string');
      return { value: token.value, span: mergeSpans(start, token.span) };
    }
    this.expect(TokenKind.LBrace, '":" or "{" after Note');
    const token = this.expect(TokenKind.String, 'a note string');
    const end = this.expect(TokenKind.RBrace, '"}"');
    return { value: token.value, span: mergeSpans(start, end.span) };
  }

  private isNoteAhead(): boolean {
    return (
      this.isKeyword('note') &&
      (this.peek(1).kind === TokenKind.Colon || this.peek(1).kind === TokenKind.LBrace)
    );
  }

  // ---------------------------------------------------------------- project

  private project(): ProjectDecl {
    const start = this.advance().span; // `Project`
    const name =
      this.check(TokenKind.Identifier) || this.check(TokenKind.QuotedIdentifier)
        ? this.expectName()
        : undefined;
    this.expect(TokenKind.LBrace, '"{"');

    const properties: ProjectDecl['properties'] = [];
    let note: NoteDecl | undefined;
    while (!this.check(TokenKind.RBrace) && !this.atEnd) {
      if (this.isNoteAhead()) {
        note = this.noteBody();
        continue;
      }
      const key = this.expectName('a project property');
      this.expect(TokenKind.Colon, '":"');
      const valueToken = this.advance();
      properties.push({
        name: key.value.toLowerCase(),
        value: valueToken.value,
        span: mergeSpans(key.span, valueToken.span),
      });
    }
    const end = this.expect(TokenKind.RBrace, '"}"');
    return { kind: 'project', name, properties, note, span: mergeSpans(start, end.span) };
  }

  // ------------------------------------------------------------------ table

  private table(): TableDecl {
    const start = this.advance().span; // `Table`
    const { schema, name } = this.qualifiedName('a table name');

    let alias: Name | undefined;
    if (this.isKeyword('as')) {
      this.advance();
      alias = this.expectName('an alias');
    }

    const settings = this.settings();
    this.expect(TokenKind.LBrace, '"{"');

    const body: (ColumnDecl | PartialInjectionDecl)[] = [];
    const indexes: IndexDecl[] = [];
    let note: NoteDecl | undefined;

    while (!this.check(TokenKind.RBrace) && !this.atEnd) {
      if (this.isNoteAhead()) {
        note = this.noteBody();
        continue;
      }
      if (this.isKeyword('indexes') && this.peek(1).kind === TokenKind.LBrace) {
        indexes.push(...this.indexesBlock());
        continue;
      }
      if (this.check(TokenKind.Tilde)) {
        const tilde = this.advance();
        const partial = this.expectName('a table partial name');
        body.push({
          kind: 'partial-injection',
          name: partial,
          span: mergeSpans(tilde.span, partial.span),
        });
        continue;
      }
      const column = this.recoverableColumn();
      if (column) body.push(column);
    }

    const end = this.expect(TokenKind.RBrace, '"}"');
    return {
      kind: 'table',
      schema,
      name,
      alias,
      settings,
      body,
      indexes,
      note,
      span: mergeSpans(start, end.span),
    };
  }

  private tablePartial(): TablePartialDecl {
    const start = this.advance().span; // `TablePartial`
    const name = this.expectName('a table partial name');
    const settings = this.settings();
    this.expect(TokenKind.LBrace, '"{"');

    const body: ColumnDecl[] = [];
    const indexes: IndexDecl[] = [];
    let note: NoteDecl | undefined;

    while (!this.check(TokenKind.RBrace) && !this.atEnd) {
      if (this.isNoteAhead()) {
        note = this.noteBody();
        continue;
      }
      if (this.isKeyword('indexes') && this.peek(1).kind === TokenKind.LBrace) {
        indexes.push(...this.indexesBlock());
        continue;
      }
      const column = this.recoverableColumn();
      if (column) body.push(column);
    }

    const end = this.expect(TokenKind.RBrace, '"}"');
    return {
      kind: 'table-partial',
      name,
      settings,
      body,
      indexes,
      note,
      span: mergeSpans(start, end.span),
    };
  }

  /**
   * Parse one column, containing any failure to that column's line. Table
   * bodies are line-oriented, so a typo on one row shouldn't cost you the
   * whole table while you're mid-keystroke.
   */
  private recoverableColumn(): ColumnDecl | null {
    const before = this.index;
    try {
      return this.column();
    } catch (err) {
      this.report(err);
      if (this.index === before) this.advance();
      while (!this.atEnd && !this.check(TokenKind.RBrace) && !this.current.startsLine) {
        this.advance();
      }
      return null;
    }
  }

  private column(): ColumnDecl {
    const name = this.expectName('a column name');
    const type = this.columnType(name);
    const settings = this.settings();
    return {
      kind: 'column',
      name,
      type,
      settings,
      span: mergeSpans(name.span, this.tokens[this.index - 1].span),
    };
  }

  private columnType(columnName: Name): TypeRef {
    if (
      this.current.startsLine ||
      this.check(TokenKind.RBrace) ||
      (!this.check(TokenKind.Identifier) && !this.check(TokenKind.QuotedIdentifier))
    ) {
      throw new DbmlSyntaxError(
        `Column "${columnName.value}" is missing a type`,
        columnName.span,
        'missing-column-type',
      );
    }
    const first = this.advance();
    let schema: Name | undefined;
    let nameToken = first;
    if (this.check(TokenKind.Dot)) {
      this.advance();
      schema = this.nameFromToken(first);
      nameToken = this.expect(TokenKind.Identifier, 'a type name');
    }

    let typeName = nameToken.value;
    let args: string | undefined;
    if (this.check(TokenKind.LParen)) {
      this.advance();
      const parts: string[] = [];
      while (!this.check(TokenKind.RParen) && !this.atEnd) {
        const token = this.advance();
        parts.push(token.kind === TokenKind.String ? `'${token.value}'` : token.value);
      }
      this.expect(TokenKind.RParen, '")"');
      args = parts.join('');
    }
    // Array suffix: `int[]`. Only when the brackets are empty, otherwise this
    // is a settings list.
    while (this.check(TokenKind.LBracket) && this.peek(1).kind === TokenKind.RBracket) {
      this.advance();
      this.advance();
      typeName += '[]';
    }

    return {
      schema,
      name: typeName,
      args,
      span: mergeSpans(first.span, this.tokens[this.index - 1].span),
    };
  }

  private indexesBlock(): IndexDecl[] {
    this.advance(); // `indexes`
    this.expect(TokenKind.LBrace, '"{"');
    const indexes: IndexDecl[] = [];

    while (!this.check(TokenKind.RBrace) && !this.atEnd) {
      const start = this.current.span;
      const columns: IndexColumn[] = [];
      if (this.match(TokenKind.LParen)) {
        if (!this.check(TokenKind.RParen)) {
          do {
            columns.push(this.indexColumn());
          } while (this.match(TokenKind.Comma));
        }
        this.expect(TokenKind.RParen, '")"');
      } else {
        columns.push(this.indexColumn());
      }
      const settings = this.settings();
      indexes.push({
        columns,
        settings,
        span: mergeSpans(start, this.tokens[this.index - 1].span),
      });
    }

    this.expect(TokenKind.RBrace, '"}"');
    return indexes;
  }

  private indexColumn(): IndexColumn {
    if (this.check(TokenKind.Expression)) {
      const token = this.advance();
      return { kind: 'expression', value: token.value, span: token.span };
    }
    const name = this.expectName('an index column');
    return { kind: 'column', value: name.value, span: name.span };
  }

  // -------------------------------------------------------------------- ref

  private ref(): RefDecl {
    const start = this.advance().span; // `Ref`
    let name: Name | undefined;
    if (this.check(TokenKind.Identifier) || this.check(TokenKind.QuotedIdentifier)) {
      name = this.expectName();
    }

    if (this.match(TokenKind.Colon)) {
      const body = this.refBody();
      return {
        kind: 'ref',
        name,
        ...body,
        span: mergeSpans(start, this.tokens[this.index - 1].span),
      };
    }

    this.expect(TokenKind.LBrace, '":" or "{"');
    const body = this.refBody();
    const end = this.expect(TokenKind.RBrace, '"}"');
    return { kind: 'ref', name, ...body, span: mergeSpans(start, end.span) };
  }

  private refBody(): { left: RefEndpoint; right: RefEndpoint; relation: RelationOp; settings: Setting[] } {
    const left = this.refEndpoint();
    const relation = this.relationOp();
    const right = this.refEndpoint();
    const settings = this.settings();
    return { left, right, relation, settings };
  }

  // ------------------------------------------------------------------- enum

  private enum(): EnumDecl {
    const start = this.advance().span; // `Enum`
    const { schema, name } = this.qualifiedName('an enum name');
    this.expect(TokenKind.LBrace, '"{"');

    const values: EnumValueDecl[] = [];
    let note: NoteDecl | undefined;
    while (!this.check(TokenKind.RBrace) && !this.atEnd) {
      if (this.isNoteAhead()) {
        note = this.noteBody();
        continue;
      }
      const value = this.expectName('an enum value');
      const settings = this.settings();
      values.push({
        name: value,
        settings,
        span: mergeSpans(value.span, this.tokens[this.index - 1].span),
      });
    }

    const end = this.expect(TokenKind.RBrace, '"}"');
    return { kind: 'enum', schema, name, values, note, span: mergeSpans(start, end.span) };
  }

  // ------------------------------------------------------------- tablegroup

  private tableGroup(): TableGroupDecl {
    const start = this.advance().span; // `TableGroup`
    const name = this.expectName('a table group name');
    const settings = this.settings();
    this.expect(TokenKind.LBrace, '"{"');

    const tables: RefEndpoint[] = [];
    let note: NoteDecl | undefined;
    while (!this.check(TokenKind.RBrace) && !this.atEnd) {
      if (this.isNoteAhead()) {
        note = this.noteBody();
        continue;
      }
      const first = this.expectName('a table name');
      let schema: Name | undefined;
      let table = first;
      if (this.check(TokenKind.Dot)) {
        this.advance();
        schema = first;
        table = this.expectName('a table name');
      }
      tables.push({ schema, table, columns: [], span: mergeSpans(first.span, table.span) });
    }

    const end = this.expect(TokenKind.RBrace, '"}"');
    return {
      kind: 'table-group',
      name,
      settings,
      tables,
      note,
      span: mergeSpans(start, end.span),
    };
  }

  // ------------------------------------------------------------ sticky note

  private stickyNote(): StickyNoteDecl {
    const start = this.advance().span; // `Note`
    const name = this.expectName('a note name');
    const settings = this.settings();
    this.expect(TokenKind.LBrace, '"{"');
    const content = this.expect(TokenKind.String, 'the note text');
    const end = this.expect(TokenKind.RBrace, '"}"');
    return {
      kind: 'sticky-note',
      name,
      content: content.value,
      settings,
      span: mergeSpans(start, end.span),
    };
  }
}

function describe(token: Token): string {
  if (token.kind === TokenKind.EOF) return 'the end of the file';
  if (token.kind === TokenKind.String) return `the text '${truncate(token.value)}'`;
  return `"${truncate(token.value)}"`;
}

function truncate(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function parse(source: string): ParseResult {
  let tokens: Token[];
  try {
    tokens = tokenize(source);
  } catch (err) {
    if (err instanceof DbmlSyntaxError) {
      const emptySpan: Span = err.span;
      return {
        document: { declarations: [], span: emptySpan },
        diagnostics: [error(err.message, err.span, err.code)],
      };
    }
    throw err;
  }
  const parser = new Parser(tokens);
  const document = parser.parse();
  return { document, diagnostics: parser.diagnostics };
}
