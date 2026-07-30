import { memo } from 'react';

import type { GraphRow } from '@gitscope/core';

interface Props {
  row: GraphRow;
  width: number;
  rowHeight: number;
  laneWidth: number;
  dimmed?: boolean;
}

const RADIUS = 3.5;

/**
 * The lane drawing for a single commit row.
 *
 * Each row draws only its own cell: lines that pass through go edge to edge,
 * lines that terminate at the commit stop at its node, and lines that leave for
 * a parent start there. Because nothing is drawn outside its own row, the graph
 * can be virtualized — rows render identically whether or not their neighbours
 * exist.
 */
export const GraphLanes = memo(function GraphLanes({
  row,
  width,
  rowHeight,
  laneWidth,
  dimmed,
}: Props) {
  const x = (lane: number): number => lane * laneWidth + laneWidth / 2;
  const middle = rowHeight / 2;
  const totalWidth = Math.max(width, 1) * laneWidth;

  return (
    <svg
      className="graph-lanes"
      width={totalWidth}
      height={rowHeight}
      viewBox={`0 0 ${totalWidth} ${rowHeight}`}
      aria-hidden="true"
      style={{ opacity: dimmed ? 0.35 : 1 }}
    >
      {row.segments.map((segment, index) => {
        const stroke = `var(--lane-${segment.color % 10})`;
        const from = x(segment.fromLane);
        const to = x(segment.toLane);

        if (segment.kind === 'pass') {
          return from === to ? (
            <line key={index} x1={from} y1={0} x2={to} y2={rowHeight} stroke={stroke} strokeWidth={1.6} />
          ) : (
            <path
              key={index}
              d={`M ${from} 0 C ${from} ${middle}, ${to} ${middle}, ${to} ${rowHeight}`}
              fill="none"
              stroke={stroke}
              strokeWidth={1.6}
            />
          );
        }

        if (segment.kind === 'in') {
          return from === to ? (
            <line key={index} x1={from} y1={0} x2={to} y2={middle} stroke={stroke} strokeWidth={1.6} />
          ) : (
            <path
              key={index}
              d={`M ${from} 0 C ${from} ${middle * 0.7}, ${to} ${middle * 0.4}, ${to} ${middle}`}
              fill="none"
              stroke={stroke}
              strokeWidth={1.6}
            />
          );
        }

        return from === to ? (
          <line
            key={index}
            x1={from}
            y1={middle}
            x2={to}
            y2={rowHeight}
            stroke={stroke}
            strokeWidth={1.6}
          />
        ) : (
          <path
            key={index}
            d={`M ${from} ${middle} C ${from} ${rowHeight * 0.8}, ${to} ${rowHeight * 0.6}, ${to} ${rowHeight}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.6}
          />
        );
      })}

      <circle
        cx={x(row.lane)}
        cy={middle}
        r={row.isMerge ? RADIUS + 1 : RADIUS}
        fill={row.isMerge ? 'var(--bg)' : `var(--lane-${row.color % 10})`}
        stroke={`var(--lane-${row.color % 10})`}
        strokeWidth={row.isMerge ? 2 : 1}
      />
    </svg>
  );
});
