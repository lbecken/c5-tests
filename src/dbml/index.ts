/**
 * Public surface of the DBML compiler: source text in, resolved schema and
 * diagnostics out. Nothing in `src/dbml` touches the DOM, so the compiler runs
 * just as happily in tests or a Node script as it does in the app.
 */

import { analyze } from './analyzer';
import { Diagnostic } from './diagnostics';
import { Schema, emptySchema } from './model';
import { parse } from './parser';
import type { Document } from './ast';

export interface CompileResult {
  schema: Schema;
  document: Document;
  diagnostics: Diagnostic[];
  /** True when nothing worse than a warning was reported. */
  ok: boolean;
}

export function compile(source: string): CompileResult {
  const { document, diagnostics: syntax } = parse(source);
  const { schema, diagnostics: semantic } = analyze(document);
  const diagnostics = [...syntax, ...semantic].sort(
    (a, b) => a.span.start.offset - b.span.start.offset,
  );
  return {
    schema,
    document,
    diagnostics,
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
  };
}

export { emptySchema };
export * from './model';
export * from './diagnostics';
export { parse } from './parser';
export { analyze } from './analyzer';
export { tokenize, TokenKind } from './lexer';
export type { Token } from './lexer';
export type { Document } from './ast';
