import { diffLines } from '../diff/text.js';
import type { DiffOptions, Edit } from '../diff/types.js';

/**
 * Three-way merge.
 *
 * The merge is derived from two independent diffs against the common base —
 * base→ours and base→theirs. Walking both edit scripts in lockstep over the
 * base yields regions where at most one side changed (take that side), where
 * both sides made the same change (take it once), and where both changed the
 * same base lines differently (a conflict).
 *
 * Regions carry their base line range so the UI can show what each side did to
 * the *same* original text, which is the context that makes a conflict
 * resolvable.
 */

export type MergeRegionKind =
  /** All three sides agree. */
  | 'stable'
  /** Only one side changed; that change is taken automatically. */
  | 'ours'
  | 'theirs'
  /** Both sides made an identical change. */
  | 'both'
  /** Both sides changed the same base region differently. */
  | 'conflict';

export interface MergeRegion {
  kind: MergeRegionKind;
  /** Base line range this region derives from, half-open. */
  baseStart: number;
  baseEnd: number;
  oursStart: number;
  oursEnd: number;
  theirsStart: number;
  theirsEnd: number;
}

export interface MergeResult {
  regions: MergeRegion[];
  conflictCount: number;
  /** True when every region resolved without human input. */
  clean: boolean;
}

interface Change {
  baseStart: number;
  baseEnd: number;
  sideStart: number;
  sideEnd: number;
}

/** Reduce an edit script to just the changed regions, in base coordinates. */
function changesOf(edits: Edit[]): Change[] {
  const changes: Change[] = [];
  for (const edit of edits) {
    if (edit.kind === 'equal') continue;
    changes.push({
      baseStart: edit.aStart,
      baseEnd: edit.aEnd,
      sideStart: edit.bStart,
      sideEnd: edit.bEnd,
    });
  }
  return changes;
}

function sameLines(
  x: readonly string[],
  xStart: number,
  xEnd: number,
  y: readonly string[],
  yStart: number,
  yEnd: number,
): boolean {
  if (xEnd - xStart !== yEnd - yStart) return false;
  for (let i = 0; i < xEnd - xStart; i++) {
    if (x[xStart + i] !== y[yStart + i]) return false;
  }
  return true;
}

/**
 * Compute the merge regions for `ours` and `theirs` against their common
 * `base`.
 */
export function merge3(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
  options: DiffOptions = {},
): MergeResult {
  const oursChanges = changesOf(diffLines(base, ours, options));
  const theirsChanges = changesOf(diffLines(base, theirs, options));

  const regions: MergeRegion[] = [];
  let basePos = 0;
  let oursPos = 0;
  let theirsPos = 0;
  let oi = 0;
  let ti = 0;
  let conflictCount = 0;

  const pushStable = (untilBase: number): void => {
    if (untilBase <= basePos) return;
    const length = untilBase - basePos;
    regions.push({
      kind: 'stable',
      baseStart: basePos,
      baseEnd: untilBase,
      oursStart: oursPos,
      oursEnd: oursPos + length,
      theirsStart: theirsPos,
      theirsEnd: theirsPos + length,
    });
    basePos += length;
    oursPos += length;
    theirsPos += length;
  };

  while (oi < oursChanges.length || ti < theirsChanges.length) {
    const o = oursChanges[oi];
    const t = theirsChanges[ti];

    // Advance through base text that neither side touched.
    const nextChangeStart = Math.min(
      o ? o.baseStart : Number.MAX_SAFE_INTEGER,
      t ? t.baseStart : Number.MAX_SAFE_INTEGER,
    );
    pushStable(nextChangeStart);

    // Collect the maximal run of changes from both sides that overlap each
    // other in base coordinates; they must be resolved together.
    let baseEnd = -1;
    let oEnd = oi;
    let tEnd = ti;
    if (o && o.baseStart === basePos) baseEnd = Math.max(baseEnd, o.baseEnd);
    if (t && t.baseStart === basePos) baseEnd = Math.max(baseEnd, t.baseEnd);

    for (;;) {
      let grew = false;
      while (oEnd < oursChanges.length && oursChanges[oEnd]!.baseStart <= baseEnd) {
        baseEnd = Math.max(baseEnd, oursChanges[oEnd]!.baseEnd);
        oEnd++;
        grew = true;
      }
      while (tEnd < theirsChanges.length && theirsChanges[tEnd]!.baseStart <= baseEnd) {
        baseEnd = Math.max(baseEnd, theirsChanges[tEnd]!.baseEnd);
        tEnd++;
        grew = true;
      }
      if (!grew) break;
    }

    const oursTouched = oEnd > oi;
    const theirsTouched = tEnd > ti;

    // Map the base range onto each side's coordinates. A side that did not
    // change this range simply copies it through.
    const oursEnd = oursTouched
      ? oursChanges[oEnd - 1]!.sideEnd + (baseEnd - oursChanges[oEnd - 1]!.baseEnd)
      : oursPos + (baseEnd - basePos);
    const theirsEnd = theirsTouched
      ? theirsChanges[tEnd - 1]!.sideEnd + (baseEnd - theirsChanges[tEnd - 1]!.baseEnd)
      : theirsPos + (baseEnd - basePos);

    let kind: MergeRegionKind;
    if (oursTouched && theirsTouched) {
      if (sameLines(ours, oursPos, oursEnd, theirs, theirsPos, theirsEnd)) {
        kind = 'both';
      } else {
        kind = 'conflict';
        conflictCount++;
      }
    } else if (oursTouched) {
      kind = 'ours';
    } else {
      kind = 'theirs';
    }

    regions.push({
      kind,
      baseStart: basePos,
      baseEnd,
      oursStart: oursPos,
      oursEnd,
      theirsStart: theirsPos,
      theirsEnd,
    });

    basePos = baseEnd;
    oursPos = oursEnd;
    theirsPos = theirsEnd;
    oi = oEnd;
    ti = tEnd;
  }

  pushStable(base.length);

  return { regions, conflictCount, clean: conflictCount === 0 };
}

export interface ConflictMarkers {
  ours: string;
  base: string;
  theirs: string;
  end: string;
}

export const DEFAULT_MARKERS: ConflictMarkers = {
  ours: '<<<<<<<',
  base: '|||||||',
  theirs: '=======',
  end: '>>>>>>>',
};

/**
 * Render a merge result as text, taking the automatic side for every region
 * that resolved and emitting conflict markers for the rest.
 */
export function renderMerge(
  result: MergeResult,
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
  opts: {
    labels?: { ours?: string; base?: string; theirs?: string };
    style?: 'merge' | 'diff3';
    markers?: ConflictMarkers;
  } = {},
): string[] {
  const markers = opts.markers ?? DEFAULT_MARKERS;
  const labels = opts.labels ?? {};
  const out: string[] = [];

  for (const region of result.regions) {
    switch (region.kind) {
      case 'stable':
        for (let i = region.baseStart; i < region.baseEnd; i++) out.push(base[i]!);
        break;
      case 'ours':
      case 'both':
        for (let i = region.oursStart; i < region.oursEnd; i++) out.push(ours[i]!);
        break;
      case 'theirs':
        for (let i = region.theirsStart; i < region.theirsEnd; i++) out.push(theirs[i]!);
        break;
      case 'conflict': {
        out.push(labels.ours ? `${markers.ours} ${labels.ours}` : markers.ours);
        for (let i = region.oursStart; i < region.oursEnd; i++) out.push(ours[i]!);
        if (opts.style === 'diff3') {
          out.push(labels.base ? `${markers.base} ${labels.base}` : markers.base);
          for (let i = region.baseStart; i < region.baseEnd; i++) out.push(base[i]!);
        }
        out.push(markers.theirs);
        for (let i = region.theirsStart; i < region.theirsEnd; i++) out.push(theirs[i]!);
        out.push(labels.theirs ? `${markers.end} ${labels.theirs}` : markers.end);
        break;
      }
    }
  }
  return out;
}
