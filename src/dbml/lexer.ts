/**
 * DBML tokenizer.
 *
 * DBML is only *partly* line-oriented: table bodies delimit columns by newline,
 * while everything else is free-form. Rather than emitting newline tokens (which
 * the free-form parts would have to skip constantly), each token records whether
 * a line break appeared before it via `startsLine`. The parser reads that flag
 * when it needs to know a column definition ended.
 */

import { DbmlSyntaxError, Position, Span, position } from './diagnostics';

export enum TokenKind {
  /** Bare word: `Table`, `users`, `varchar`, `pk`. */
  Identifier = 'identifier',
  /** Double-quoted name: `"order items"`. Preserved as an identifier. */
  QuotedIdentifier = 'quoted-identifier',
  /** Single-quoted or triple-quoted text: `'a note'`. */
  String = 'string',
  /** Backtick-delimited raw SQL: `` `now()` ``. */
  Expression = 'expression',
  Number = 'number',
  /** Hex colour literal: `#3498db`. */
  Color = 'color',
  LBrace = '{',
  RBrace = '}',
  LBracket = '[',
  RBracket = ']',
  LParen = '(',
  RParen = ')',
  Comma = ',',
  Colon = ':',
  Dot = '.',
  Semicolon = ';',
  Tilde = '~',
  /** `<`, `>`, `-` or `<>` — the relationship operators. */
  Relation = 'relation',
  EOF = 'eof',
}

export interface Token {
  kind: TokenKind;
  /** Source text as written (without quotes/backticks for literal kinds). */
  value: string;
  span: Span;
  /** True when a line break separates this token from the previous one. */
  startsLine: boolean;
  /** True when the string literal used `'''` (multi-line) delimiters. */
  multiline?: boolean;
}

const PUNCTUATION: Record<string, TokenKind> = {
  '{': TokenKind.LBrace,
  '}': TokenKind.RBrace,
  '[': TokenKind.LBracket,
  ']': TokenKind.RBracket,
  '(': TokenKind.LParen,
  ')': TokenKind.RParen,
  ',': TokenKind.Comma,
  ':': TokenKind.Colon,
  '.': TokenKind.Dot,
  ';': TokenKind.Semicolon,
  '~': TokenKind.Tilde,
};

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isHex(ch: string): boolean {
  return /[0-9a-fA-F]/.test(ch);
}

class Lexer {
  private offset = 0;
  private line = 1;
  private column = 1;
  private pendingNewline = true;

  constructor(private readonly source: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    for (;;) {
      const token = this.next();
      tokens.push(token);
      if (token.kind === TokenKind.EOF) return tokens;
    }
  }

  private get atEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private peek(ahead = 0): string {
    return this.source[this.offset + ahead] ?? '';
  }

  private here(): Position {
    return position(this.offset, this.line, this.column);
  }

  private advance(): string {
    const ch = this.source[this.offset++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  /** Consume whitespace and comments, remembering whether a line broke. */
  private skipTrivia(): void {
    for (;;) {
      const ch = this.peek();
      if (ch === '') return;
      if (ch === '\n') {
        this.pendingNewline = true;
        this.advance();
        continue;
      }
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }
      if (ch === '/' && this.peek(1) === '/') {
        while (!this.atEnd && this.peek() !== '\n') this.advance();
        continue;
      }
      if (ch === '/' && this.peek(1) === '*') {
        const start = this.here();
        this.advance();
        this.advance();
        for (;;) {
          if (this.atEnd) {
            throw new DbmlSyntaxError(
              'Unterminated block comment',
              { start, end: this.here() },
              'unterminated-comment',
            );
          }
          if (this.peek() === '*' && this.peek(1) === '/') {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
        continue;
      }
      return;
    }
  }

  private make(kind: TokenKind, value: string, start: Position, multiline?: boolean): Token {
    const token: Token = {
      kind,
      value,
      span: { start, end: this.here() },
      startsLine: this.pendingNewline,
    };
    if (multiline) token.multiline = true;
    this.pendingNewline = false;
    return token;
  }

  private next(): Token {
    this.skipTrivia();
    const start = this.here();
    if (this.atEnd) return this.make(TokenKind.EOF, '', start);

    const ch = this.peek();

    if (ch === '<' && this.peek(1) === '>') {
      this.advance();
      this.advance();
      return this.make(TokenKind.Relation, '<>', start);
    }
    if (ch === '<' || ch === '>') {
      this.advance();
      return this.make(TokenKind.Relation, ch, start);
    }
    // A lone `-` is the one-to-one relation; `-1` is a negative number.
    if (ch === '-') {
      if (isDigit(this.peek(1))) return this.number(start);
      this.advance();
      return this.make(TokenKind.Relation, '-', start);
    }

    const punct = PUNCTUATION[ch];
    if (punct) {
      this.advance();
      return this.make(punct, ch, start);
    }

    if (ch === '#') return this.color(start);
    if (ch === '"') return this.quotedIdentifier(start);
    if (ch === "'") return this.string(start);
    if (ch === '`') return this.expression(start);
    if (isDigit(ch)) return this.number(start);
    if (isIdentifierStart(ch)) {
      while (!this.atEnd && isIdentifierPart(this.peek())) this.advance();
      return this.make(
        TokenKind.Identifier,
        this.source.slice(start.offset, this.offset),
        start,
      );
    }

    this.advance();
    throw new DbmlSyntaxError(
      `Unexpected character ${JSON.stringify(ch)}`,
      { start, end: this.here() },
      'unexpected-character',
    );
  }

  private color(start: Position): Token {
    this.advance(); // '#'
    while (!this.atEnd && isHex(this.peek())) this.advance();
    const value = this.source.slice(start.offset, this.offset);
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
      throw new DbmlSyntaxError(
        `Invalid colour literal "${value}" — expected #rgb or #rrggbb`,
        { start, end: this.here() },
        'invalid-color',
      );
    }
    return this.make(TokenKind.Color, value, start);
  }

  private quotedIdentifier(start: Position): Token {
    this.advance(); // opening quote
    let value = '';
    for (;;) {
      if (this.atEnd || this.peek() === '\n') {
        throw new DbmlSyntaxError(
          'Unterminated quoted identifier',
          { start, end: this.here() },
          'unterminated-identifier',
        );
      }
      if (this.peek() === '\\' && this.peek(1) === '"') {
        this.advance();
        value += this.advance();
        continue;
      }
      if (this.peek() === '"') {
        this.advance();
        break;
      }
      value += this.advance();
    }
    return this.make(TokenKind.QuotedIdentifier, value, start);
  }

  private string(start: Position): Token {
    const triple = this.peek(1) === "'" && this.peek(2) === "'";
    if (triple) {
      this.advance();
      this.advance();
      this.advance();
      let raw = '';
      for (;;) {
        if (this.atEnd) {
          throw new DbmlSyntaxError(
            'Unterminated multi-line string',
            { start, end: this.here() },
            'unterminated-string',
          );
        }
        if (this.peek() === "'" && this.peek(1) === "'" && this.peek(2) === "'") {
          this.advance();
          this.advance();
          this.advance();
          break;
        }
        if (this.peek() === '\\' && this.peek(1) === "'") {
          this.advance();
          raw += this.advance();
          continue;
        }
        raw += this.advance();
      }
      return this.make(TokenKind.String, dedent(raw), start, true);
    }

    this.advance(); // opening quote
    let value = '';
    for (;;) {
      if (this.atEnd || this.peek() === '\n') {
        throw new DbmlSyntaxError(
          'Unterminated string',
          { start, end: this.here() },
          'unterminated-string',
        );
      }
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
        continue;
      }
      if (this.peek() === "'") {
        this.advance();
        break;
      }
      value += this.advance();
    }
    return this.make(TokenKind.String, value, start);
  }

  private expression(start: Position): Token {
    this.advance(); // opening backtick
    let value = '';
    for (;;) {
      if (this.atEnd) {
        throw new DbmlSyntaxError(
          'Unterminated expression',
          { start, end: this.here() },
          'unterminated-expression',
        );
      }
      if (this.peek() === '`') {
        this.advance();
        break;
      }
      value += this.advance();
    }
    return this.make(TokenKind.Expression, value, start);
  }

  private number(start: Position): Token {
    if (this.peek() === '-') this.advance();
    while (!this.atEnd && isDigit(this.peek())) this.advance();
    if (this.peek() === '.' && isDigit(this.peek(1))) {
      this.advance();
      while (!this.atEnd && isDigit(this.peek())) this.advance();
    }
    return this.make(TokenKind.Number, this.source.slice(start.offset, this.offset), start);
  }
}

/**
 * Strip the common leading indentation from a `'''` block so notes written
 * inside an indented table body do not carry the code's indentation.
 */
function dedent(raw: string): string {
  const lines = raw.replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '').split(/\r?\n/);
  let common = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    common = Math.min(common, line.length - line.trimStart().length);
  }
  if (!isFinite(common) || common === 0) return lines.join('\n');
  return lines.map((line) => (line.trim() ? line.slice(common) : line.trim())).join('\n');
}

export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}
