import type { TextDiff } from '@gitscope/core';
import { type Token } from '../../lib/highlight';
/**
 * One entry in the virtualized list. A `gap` stands in for a run of unchanged
 * rows that is folded away; expanding it replaces it with the rows it hides.
 */
export type VisualItem = {
    kind: 'row';
    row: number;
} | {
    kind: 'gap';
    range: number;
    start: number;
    end: number;
    header?: string;
    skipped?: number;
};
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
export declare function useDiffModel(diff: TextDiff | undefined, language: string): DiffModel;
//# sourceMappingURL=useDiffModel.d.ts.map