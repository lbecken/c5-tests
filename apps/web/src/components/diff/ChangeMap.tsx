import { memo, useMemo } from 'react';

import type { DiffRow } from '@gitscope/core';

interface Props {
  rows: readonly DiffRow[];
  onSeek: (fraction: number) => void;
}

interface Marker {
  top: number;
  height: number;
  kind: DiffRow['kind'];
}

/**
 * A whole-file map of where the changes are, drawn beside the scrollbar.
 *
 * Scrolling a long diff otherwise gives no sense of how much is left or where
 * the next cluster of edits sits; this turns that into a glance. Adjacent rows
 * of the same kind are merged so a 500-line change is one band rather than 500
 * hairlines.
 */
export const ChangeMap = memo(function ChangeMap({ rows, onSeek }: Props) {
  const markers = useMemo(() => {
    const result: Marker[] = [];
    const total = Math.max(rows.length, 1);
    let index = 0;
    while (index < rows.length) {
      const kind = rows[index]!.kind;
      if (kind === 'equal') {
        index++;
        continue;
      }
      let end = index + 1;
      while (end < rows.length && rows[end]!.kind !== 'equal') end++;
      result.push({
        top: (index / total) * 100,
        height: Math.max(((end - index) / total) * 100, 0.4),
        kind,
      });
      index = end;
    }
    return result;
  }, [rows]);

  if (markers.length === 0) return null;

  return (
    <div
      className="change-map"
      role="presentation"
      onMouseDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        onSeek((event.clientY - bounds.top) / bounds.height);
      }}
      title={`${markers.length} change ${markers.length === 1 ? 'block' : 'blocks'}`}
    >
      {markers.map((marker, index) => (
        <span
          key={index}
          className="change-map-marker"
          data-kind={marker.kind}
          style={{ top: `${marker.top}%`, height: `${marker.height}%` }}
        />
      ))}
    </div>
  );
});
