import { useCallback, useMemo, useState } from 'react';

import type { TextDiff } from '@gitscope/core';

import { highlightLines, type Token } from '../../lib/highlight';

/**
 * One entry in the virtualized list. A `gap` stands in for a run of unchanged
 * rows that is folded away; expanding it replaces it with the rows it hides.
 */
export type VisualItem =
  | { kind: 'row'; row: number }
  | { kind: 'gap'; range: number; start: number; end: number; header?: string; skipped?: number };

export interface DiffModel {
  items: VisualItem[];
  /** Syntax tokens per row for each side, aligned with `diff.rows`. */
  tokensA: Token[][];
  tokensB: Token[][];
  /** Longest displayed line, used to size the horizontal scroll area. */
  maxLineLength: number;
  /** Visual index of each change block, for next/previous navigation. */
  anchors: number[];
  expand: (range: number) => void;
  expandAll: () => void;
  collapseAll: () => void;
  expandedCount: number;
}

/**
 * Syntax highlighting needs each side as a continuous document — a block
 * comment opened on one line colours the next — but the diff hands us
 * interleaved rows. Rebuild each side's line sequence, highlight it once, then
 * map the results back onto rows.
 */
function highlightSides(
  diff: TextDiff,
  language: string,
): { tokensA: Token[][]; tokensB: Token[][]; maxLineLength: number } {
  const aLines: string[] = [];
  const bLines: string[] = [];
  const aRowOf: number[] = [];
  const bRowOf: number[] = [];
  let maxLineLength = 0;

  for (let i = 0; i < diff.rows.length; i++) {
    const row = diff.rows[i]!;
    if (row.a) {
      aRowOf[aLines.length] = i;
      aLines.push(row.a.text);
      if (row.a.text.length > maxLineLength) maxLineLength = row.a.text.length;
    }
    if (row.b) {
      bRowOf[bLines.length] = i;
      bLines.push(row.b.text);
      if (row.b.text.length > maxLineLength) maxLineLength = row.b.text.length;
    }
  }

  const aTokens = highlightLines(aLines, language);
  const bTokens = highlightLines(bLines, language);
  const tokensA: Token[][] = new Array(diff.rows.length);
  const tokensB: Token[][] = new Array(diff.rows.length);
  for (let i = 0; i < aTokens.length; i++) tokensA[aRowOf[i]!] = aTokens[i]!;
  for (let i = 0; i < bTokens.length; i++) tokensB[bRowOf[i]!] = bTokens[i]!;

  return { tokensA, tokensB, maxLineLength };
}

function gapOf(
  range: { start: number; end: number; header?: string },
  index: number,
): Extract<VisualItem, { kind: 'gap' }> {
  return { kind: 'gap', range: index, start: range.start, end: range.end, header: range.header };
}

export function useDiffModel(diff: TextDiff | undefined, language: string): DiffModel {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());

  const highlighted = useMemo(
    () =>
      diff
        ? highlightSides(diff, language)
        : { tokensA: [] as Token[][], tokensB: [] as Token[][], maxLineLength: 0 },
    [diff, language],
  );

  const { items, anchors } = useMemo(() => {
    const list: VisualItem[] = [];
    const anchorIndices: number[] = [];
    if (!diff) return { items: list, anchors: anchorIndices };

    const anchorSet = new Set(diff.changeAnchors);
    // Collapsed ranges are sorted and non-overlapping, so one cursor over them
    // keeps this linear in the number of rows.
    let rangeIndex = 0;
    let row = 0;

    while (row < diff.rows.length) {
      const range = diff.collapsed[rangeIndex];
      if (range && range.start === row) {
        const index = rangeIndex++;
        if (range.skipped !== undefined) {
          // Rows for very large files are never materialised: show the count
          // as an un-expandable marker and carry on from the same row.
          list.push({ ...gapOf(range, index), skipped: range.skipped });
          continue;
        }
        if (!expanded.has(index) && range.end > range.start) {
          list.push(gapOf(range, index));
          row = range.end;
          continue;
        }
      }
      if (anchorSet.has(row)) anchorIndices.push(list.length);
      list.push({ kind: 'row', row });
      row++;
    }

    return { items: list, anchors: anchorIndices };
  }, [diff, expanded]);

  const expand = useCallback((range: number) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      next.add(range);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded(new Set((diff?.collapsed ?? []).map((_, index) => index)));
  }, [diff]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return {
    items,
    tokensA: highlighted.tokensA,
    tokensB: highlighted.tokensB,
    maxLineLength: highlighted.maxLineLength,
    anchors,
    expand,
    expandAll,
    collapseAll,
    expandedCount: expanded.size,
  };
}
