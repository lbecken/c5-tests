/** Core diff data model shared by the engine, the server API and the UI. */

export type EditKind = 'equal' | 'insert' | 'delete' | 'replace';

/**
 * A contiguous edit between two token sequences. Ranges are half-open and
 * expressed in the coordinate space of their own side.
 */
export interface Edit {
  kind: EditKind;
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

export type WhitespaceMode =
  /** Every byte counts. */
  | 'none'
  /** Ignore differences in the amount of horizontal whitespace. */
  | 'change'
  /** Ignore leading whitespace. */
  | 'leading'
  /** Ignore trailing whitespace. */
  | 'trailing'
  /** Ignore all whitespace, including line-internal. */
  | 'all';

export interface DiffOptions {
  /**
   * `histogram` matches git's default-quality algorithm and produces the most
   * readable hunks for source code. `myers` is the classic minimal-edit
   * algorithm and is used automatically as a fallback for regions histogram
   * cannot anchor.
   */
  algorithm?: 'histogram' | 'myers';
  whitespace?: WhitespaceMode;
  ignoreCase?: boolean;
  /** Shift change groups to the most human-readable position (git's default). */
  indentHeuristic?: boolean;
  /** Lines of unchanged context kept around each hunk. */
  context?: number;
}

export const DEFAULT_DIFF_OPTIONS: Required<DiffOptions> = {
  algorithm: 'histogram',
  whitespace: 'none',
  ignoreCase: false,
  indentHeuristic: true,
  context: 3,
};

/** A character range within a single line that differs from the other side. */
export interface InlineSpan {
  start: number;
  end: number;
  /** `strong` marks a genuinely different word; `weak` marks whitespace-only drift. */
  emphasis?: 'strong' | 'weak';
}

export interface DiffLineRef {
  /** 1-based line number within its own file. */
  number: number;
  text: string;
  /** Character ranges that differ from the paired line, if any. */
  spans?: InlineSpan[];
  /** True when the file does not end with a newline after this line. */
  noNewlineAtEof?: boolean;
}

export type RowKind = 'equal' | 'insert' | 'delete' | 'replace';

/**
 * One rendered row. Side-by-side views draw `a` on the left and `b` on the
 * right (either may be absent); unified views expand `replace` into a delete
 * row followed by an insert row.
 */
export interface DiffRow {
  kind: RowKind;
  a?: DiffLineRef;
  b?: DiffLineRef;
}

/** A run of equal rows long enough to be worth collapsing in the UI. */
export interface CollapsedRange {
  /** Inclusive row index of the first hidden row. */
  start: number;
  /** Exclusive row index after the last hidden row. */
  end: number;
  /** Nearest enclosing declaration above the range, for the collapsed label. */
  header?: string;
  /**
   * Set only for pathologically large files, where the unchanged rows were
   * never materialised. The UI shows the count but cannot expand in place.
   */
  skipped?: number;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  /** Rows that changed on both sides simultaneously. */
  modifications: number;
}

export interface TextDiff {
  rows: DiffRow[];
  /** Ranges of `rows` the UI should fold away by default. */
  collapsed: CollapsedRange[];
  /** Row indices where a change block starts, for next/previous navigation. */
  changeAnchors: number[];
  stats: DiffStats;
  aLineCount: number;
  bLineCount: number;
  /** Set when the inputs were too large to align in full detail. */
  truncated?: boolean;
}
