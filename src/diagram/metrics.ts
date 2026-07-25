/**
 * Node sizing.
 *
 * Box widths must match what the SVG actually paints, so text is measured with
 * a canvas when one is available and falls back to a per-character estimate in
 * Node (tests, headless export).
 */

import { Column, Enum, Schema, StickyNote, Table, tableLabel } from '../dbml';
import { Size } from './geometry';

export const NODE_METRICS = {
  headerHeight: 36,
  rowHeight: 26,
  paddingX: 12,
  /** Gap between the column name and its type within a row. */
  columnGap: 24,
  keyIconWidth: 18,
  minWidth: 160,
  maxWidth: 420,
  cornerRadius: 8,
  noteWidth: 240,
  noteLineHeight: 18,
  notePadding: 14,
} as const;

export const FONTS = {
  tableName: '600 14px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  columnName: '13px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  columnType: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
  note: '12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

let measureContext: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (measureContext !== undefined) return measureContext;
  measureContext =
    typeof document === 'undefined'
      ? null
      : (document.createElement('canvas').getContext('2d') ?? null);
  return measureContext;
}

/** Width of `text` in px when painted with `font`. */
export function textWidth(text: string, font: string): number {
  const ctx = context();
  if (ctx) {
    ctx.font = font;
    return ctx.measureText(text).width;
  }
  // Headless estimate: average glyph width relative to the font size.
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 13);
  const ratio = font.includes('monospace') ? 0.6 : 0.54;
  return text.length * size * ratio;
}

/** Label shown on the right of a column row (its type, plus key markers). */
export function columnTypeLabel(column: Column): string {
  return column.type;
}

/** Suffix markers shown after a column name: primary key, FK, etc. */
export function columnBadges(column: Column, foreignKeys: Set<string>): string[] {
  const badges: string[] = [];
  if (column.pk) badges.push('pk');
  else if (foreignKeys.has(column.id)) badges.push('fk');
  if (column.notNull && !column.pk) badges.push('not null');
  if (column.unique && !column.pk) badges.push('unique');
  return badges;
}

export function measureTable(table: Table): Size {
  const header = textWidth(tableLabel(table), FONTS.tableName) + 40;
  let widest = header;
  for (const column of table.columns) {
    const width =
      textWidth(column.name, FONTS.columnName) +
      // Room for the key glyph drawn after primary-key column names.
      (column.pk ? NODE_METRICS.keyIconWidth : 0) +
      NODE_METRICS.columnGap +
      textWidth(columnTypeLabel(column), FONTS.columnType);
    widest = Math.max(widest, width);
  }
  return {
    width: clamp(widest + NODE_METRICS.paddingX * 2, NODE_METRICS.minWidth, NODE_METRICS.maxWidth),
    height: NODE_METRICS.headerHeight + table.columns.length * NODE_METRICS.rowHeight,
  };
}

export function measureEnum(model: Enum): Size {
  const header = textWidth(`${model.name}`, FONTS.tableName) + 56;
  let widest = header;
  for (const value of model.values) {
    widest = Math.max(widest, textWidth(value.name, FONTS.columnName));
  }
  return {
    width: clamp(widest + NODE_METRICS.paddingX * 2, NODE_METRICS.minWidth, NODE_METRICS.maxWidth),
    height: NODE_METRICS.headerHeight + model.values.length * NODE_METRICS.rowHeight,
  };
}

/** Wrap sticky-note text to the note width, returning the laid-out lines. */
export function wrapNote(note: StickyNote): { lines: string[]; size: Size } {
  const maxWidth = NODE_METRICS.noteWidth - NODE_METRICS.notePadding * 2;
  const lines: string[] = [];
  for (const paragraph of note.content.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, FONTS.note) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return {
    lines,
    size: {
      width: NODE_METRICS.noteWidth,
      height:
        NODE_METRICS.notePadding * 2 +
        24 +
        Math.max(lines.length, 1) * NODE_METRICS.noteLineHeight,
    },
  };
}

/** Every column that sits on the many-side (or any side) of a relationship. */
export function foreignKeyColumns(schema: Schema): Set<string> {
  const ids = new Set<string>();
  for (const ref of schema.refs) {
    for (const endpoint of ref.endpoints) {
      for (const id of endpoint.columnIds) ids.add(id);
    }
  }
  return ids;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
