import type { Commit } from '../git/types.js';

/**
 * Commit-graph layout.
 *
 * Walking commits in topological order (children before parents), we keep a set
 * of "lanes", each waiting for a particular commit to appear. When it does, the
 * lane terminates at that node and the commit's parents claim lanes for the
 * rows below. Lanes are never shifted sideways once allocated, which keeps
 * branch lines straight and — more importantly — stable as you scroll or as new
 * commits arrive.
 */

export type SegmentKind =
  /** Passes through this row without touching the node. */
  | 'pass'
  /** Arrives from above and terminates at the node. */
  | 'in'
  /** Leaves the node toward a parent below. */
  | 'out';

export interface GraphSegment {
  fromLane: number;
  toLane: number;
  color: number;
  kind: SegmentKind;
}

export interface GraphRow {
  oid: string;
  /** Column the commit's node is drawn in. */
  lane: number;
  color: number;
  segments: GraphSegment[];
  /** Number of lanes in use at this row, for sizing the gutter. */
  width: number;
  isMerge: boolean;
  /** True when no lane was waiting for this commit — a branch tip. */
  isTip: boolean;
  /** True when the commit has no parents in the loaded window. */
  isRoot: boolean;
}

export interface GraphLayout {
  rows: GraphRow[];
  /** Widest row, so the UI can reserve gutter space once. */
  maxWidth: number;
}

function firstFreeLane(lanes: Array<string | null>, from = 0): number {
  for (let i = from; i < lanes.length; i++) {
    if (lanes[i] === null) return i;
  }
  return lanes.length;
}

function activeWidth(lanes: Array<string | null>): number {
  let width = 0;
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] !== null) width = i + 1;
  }
  return width;
}

/**
 * Lay out `commits`, which must be in topological order. Commits whose parents
 * are outside the loaded window simply end their lane; loading more commits
 * later extends the same layout because lane assignment only depends on what
 * came before.
 */
export function layoutGraph(commits: readonly Commit[], colorCount = 10): GraphLayout {
  const lanes: Array<string | null> = [];
  const colors: number[] = [];
  const rows: GraphRow[] = [];
  let nextColor = 0;
  let maxWidth = 0;

  for (const commit of commits) {
    const segments: GraphSegment[] = [];
    const incoming: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.oid) incoming.push(i);
    }

    let lane: number;
    let color: number;
    const isTip = incoming.length === 0;

    if (!isTip) {
      lane = incoming[0]!;
      color = colors[lane]!;
      // Additional lanes waiting for the same commit converge into it.
      for (let k = 1; k < incoming.length; k++) {
        const other = incoming[k]!;
        segments.push({ fromLane: other, toLane: lane, color: colors[other]!, kind: 'in' });
        lanes[other] = null;
      }
      segments.push({ fromLane: lane, toLane: lane, color, kind: 'in' });
    } else {
      lane = firstFreeLane(lanes);
      color = nextColor++ % colorCount;
      while (lanes.length <= lane) lanes.push(null);
      while (colors.length <= lane) colors.push(0);
      colors[lane] = color;
    }

    // Every other occupied lane simply passes this row by.
    for (let i = 0; i < lanes.length; i++) {
      if (i === lane) continue;
      if (lanes[i] === null) continue;
      segments.push({ fromLane: i, toLane: i, color: colors[i]!, kind: 'pass' });
    }

    const parents = commit.parents;
    if (parents.length === 0) {
      lanes[lane] = null;
    } else {
      // The first parent continues this commit's lane and colour, so the
      // mainline of any branch stays one straight column.
      lanes[lane] = parents[0]!;
      segments.push({ fromLane: lane, toLane: lane, color, kind: 'out' });

      for (let p = 1; p < parents.length; p++) {
        const parent = parents[p]!;
        let target = lanes.indexOf(parent);
        if (target === -1) {
          target = firstFreeLane(lanes);
          while (lanes.length <= target) lanes.push(null);
          while (colors.length <= target) colors.push(0);
          lanes[target] = parent;
          colors[target] = nextColor++ % colorCount;
        }
        segments.push({ fromLane: lane, toLane: target, color: colors[target]!, kind: 'out' });
      }
    }

    const width = Math.max(activeWidth(lanes), lane + 1);
    if (width > maxWidth) maxWidth = width;

    rows.push({
      oid: commit.oid,
      lane,
      color,
      segments,
      width,
      isMerge: parents.length > 1,
      isTip,
      isRoot: parents.length === 0,
    });
  }

  return { rows, maxWidth };
}
