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
export type TokenKind = 'plain' | 'keyword' | 'type' | 'string' | 'number' | 'comment' | 'func' | 'punct';
export interface Token {
    start: number;
    end: number;
    kind: TokenKind;
}
/**
 * Highlight a whole file at once so constructs that span lines — block
 * comments, template literals, docstrings — resolve correctly. Returns one
 * token array per input line.
 */
export declare function highlightLines(lines: readonly string[], language: string): Token[][];
export declare const TOKEN_CLASS: Record<TokenKind, string>;
//# sourceMappingURL=highlight.d.ts.map