import type { GraphRow } from '@gitscope/core';
interface Props {
    row: GraphRow;
    width: number;
    rowHeight: number;
    laneWidth: number;
    dimmed?: boolean;
}
/**
 * The lane drawing for a single commit row.
 *
 * Each row draws only its own cell: lines that pass through go edge to edge,
 * lines that terminate at the commit stop at its node, and lines that leave for
 * a parent start there. Because nothing is drawn outside its own row, the graph
 * can be virtualized — rows render identically whether or not their neighbours
 * exist.
 */
export declare const GraphLanes: import("react").NamedExoticComponent<Props>;
export {};
//# sourceMappingURL=GraphLanes.d.ts.map