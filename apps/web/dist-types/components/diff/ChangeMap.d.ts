import type { DiffRow } from '@gitscope/core';
interface Props {
    rows: readonly DiffRow[];
    onSeek: (fraction: number) => void;
}
/**
 * A whole-file map of where the changes are, drawn beside the scrollbar.
 *
 * Scrolling a long diff otherwise gives no sense of how much is left or where
 * the next cluster of edits sits; this turns that into a glance. Adjacent rows
 * of the same kind are merged so a 500-line change is one band rather than 500
 * hairlines.
 */
export declare const ChangeMap: import("react").NamedExoticComponent<Props>;
export {};
//# sourceMappingURL=ChangeMap.d.ts.map