import type { DiffRow, TextDiff } from '@gitscope/core';
export interface DiffViewHandle {
    nextChange: () => void;
    previousChange: () => void;
    scrollToRow: (row: number) => void;
}
interface Props {
    diff: TextDiff;
    language: string;
    /** Column headings, typically the two revisions being compared. */
    labels?: {
        left: string;
        right: string;
    };
    /** Called when the user clicks a line, e.g. to stage a hunk. */
    onLineAction?: (row: DiffRow, index: number) => void;
    className?: string;
}
export declare const DiffView: import("react").ForwardRefExoticComponent<Props & import("react").RefAttributes<DiffViewHandle>>;
export {};
//# sourceMappingURL=DiffView.d.ts.map