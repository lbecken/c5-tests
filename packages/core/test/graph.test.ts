import { describe, expect, it } from 'vitest';

import { layoutGraph } from '../src/graph/layout.js';
import type { Commit } from '../src/git/types.js';

/** Minimal commit stub; layout only reads `oid` and `parents`. */
function commit(oid: string, ...parents: string[]): Commit {
  return {
    oid,
    shortOid: oid.slice(0, 7),
    parents,
    author: { name: 'a', email: 'a@example.com', date: '2024-01-01T00:00:00Z' },
    committer: { name: 'a', email: 'a@example.com', date: '2024-01-01T00:00:00Z' },
    subject: oid,
    body: '',
  };
}

describe('layoutGraph', () => {
  it('draws linear history as a single lane', () => {
    const layout = layoutGraph([commit('c', 'b'), commit('b', 'a'), commit('a')]);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(layout.maxWidth).toBe(1);
    expect(layout.rows[0]!.isTip).toBe(true);
    expect(layout.rows[2]!.isRoot).toBe(true);
  });

  it('gives a diverging branch its own lane and rejoins at the merge base', () => {
    //   m
    //  / \
    // f   t
    //  \ /
    //   b
    const layout = layoutGraph([
      commit('m', 'f', 't'),
      commit('f', 'b'),
      commit('t', 'b'),
      commit('b'),
    ]);
    const [merge, feature, topic, base] = layout.rows;
    expect(merge!.isMerge).toBe(true);
    expect(merge!.lane).toBe(0);
    expect(feature!.lane).toBe(0);
    // The second parent had to open a new lane.
    expect(topic!.lane).toBe(1);
    expect(layout.maxWidth).toBe(2);
    // Both lanes converge on the shared base commit.
    expect(base!.lane).toBe(0);
    expect(base!.segments.filter((segment) => segment.kind === 'in')).toHaveLength(2);
  });

  it('keeps the first parent in the same lane and colour', () => {
    const layout = layoutGraph([commit('m', 'f', 't'), commit('f', 'b'), commit('t', 'b'), commit('b')]);
    expect(layout.rows[1]!.color).toBe(layout.rows[0]!.color);
  });

  it('reuses a lane freed by a completed branch', () => {
    const layout = layoutGraph([
      commit('x', 'r'),
      commit('side'),
      commit('r'),
    ]);
    // `side` is a tip with no relation to `x`; it takes lane 1 while `x`'s lane
    // is still waiting for `r`.
    expect(layout.rows[1]!.lane).toBe(1);
    expect(layout.rows[2]!.lane).toBe(0);
  });

  it('emits pass-through segments for lanes that skip a row', () => {
    const layout = layoutGraph([
      commit('a', 'c'),
      commit('b', 'd'),
      commit('c'),
      commit('d'),
    ]);
    const rowB = layout.rows[1]!;
    // Lane 0 is still waiting for `c`, so it must be drawn passing row `b`.
    expect(rowB.segments.some((segment) => segment.kind === 'pass' && segment.fromLane === 0)).toBe(
      true,
    );
  });

  it('handles an octopus merge', () => {
    const layout = layoutGraph([
      commit('o', 'p1', 'p2', 'p3'),
      commit('p1'),
      commit('p2'),
      commit('p3'),
    ]);
    expect(layout.rows[0]!.isMerge).toBe(true);
    expect(layout.rows[0]!.segments.filter((segment) => segment.kind === 'out')).toHaveLength(3);
    expect(layout.maxWidth).toBe(3);
  });

  it('produces segments whose lanes stay within the row width', () => {
    const commits = [
      commit('h', 'g', 'e'),
      commit('g', 'f'),
      commit('e', 'd'),
      commit('f', 'd'),
      commit('d', 'c'),
      commit('c'),
    ];
    const layout = layoutGraph(commits);
    for (const row of layout.rows) {
      for (const segment of row.segments) {
        expect(segment.fromLane).toBeLessThan(layout.maxWidth);
        expect(segment.toLane).toBeLessThan(layout.maxWidth);
        expect(segment.fromLane).toBeGreaterThanOrEqual(0);
        expect(segment.toLane).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
