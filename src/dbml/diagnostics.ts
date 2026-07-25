/**
 * Source positions and diagnostics shared by every stage of the compiler.
 *
 * Every token, AST node and model object carries a `Span` so the editor can map
 * a diagnostic (or a diagram element) back to the exact characters that
 * produced it.
 */

/** A zero-based offset into the source, plus the 1-based line/column at it. */
export interface Position {
  offset: number;
  line: number;
  column: number;
}

/** A half-open `[start, end)` range of source text. */
export interface Span {
  start: Position;
  end: Position;
}

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  span: Span;
  /** Short machine-readable identifier, handy in tests. */
  code?: string;
}

export function position(offset: number, line: number, column: number): Position {
  return { offset, line, column };
}

export function span(start: Position, end: Position): Span {
  return { start, end };
}

/** A span covering a single point, used when a construct has no width. */
export function pointSpan(at: Position): Span {
  return { start: at, end: at };
}

/** Widen `a` to also cover `b`. */
export function mergeSpans(a: Span, b: Span): Span {
  return {
    start: a.start.offset <= b.start.offset ? a.start : b.start,
    end: a.end.offset >= b.end.offset ? a.end : b.end,
  };
}

export function error(message: string, span: Span, code?: string): Diagnostic {
  return { severity: 'error', message, span, code };
}

export function warning(message: string, span: Span, code?: string): Diagnostic {
  return { severity: 'warning', message, span, code };
}

/** Thrown by the parser when it cannot recover; caught at the top level. */
export class DbmlSyntaxError extends Error {
  constructor(
    message: string,
    readonly span: Span,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'DbmlSyntaxError';
  }
}
