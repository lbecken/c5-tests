/**
 * Relationship routing.
 *
 * Every edge leaves a table horizontally from the row of the column it
 * references, travels as an orthogonal polyline with rounded corners, and
 * arrives at the matching row on the other table — the same shape dbdiagram
 * draws. Routing is recomputed on every drag, so it stays cheap and local:
 * no global path search, just a side choice and at most five segments.
 */

import { Cardinality, Ref, Schema } from '../dbml';
import { Point } from './geometry';
import { Layout, LayoutNode } from './layout';
import { NODE_METRICS } from './metrics';

export type Side = 'left' | 'right';

export interface EdgeAnchor {
  nodeId: string;
  columnIds: string[];
  side: Side;
  point: Point;
  cardinality: Cardinality;
  /** Where to paint the `1` / `*` label. */
  label: Point;
}

export interface Edge {
  id: string;
  refId: string;
  name?: string;
  color?: string;
  from: EdgeAnchor;
  to: EdgeAnchor;
  path: string;
  /** Ids of both endpoint tables, for highlight lookups. */
  nodeIds: [string, string];
  columnIds: string[];
  kind: 'relationship' | 'enum';
}

const STUB = 22;
const CORNER = 9;
const LABEL_OFFSET = 12;

/** Row centre for a column, or the node centre when the row is unknown. */
function anchorY(node: LayoutNode, rowIndex: number | undefined): number {
  if (rowIndex === undefined) return node.y + node.height / 2;
  return (
    node.y + NODE_METRICS.headerHeight + rowIndex * NODE_METRICS.rowHeight + NODE_METRICS.rowHeight / 2
  );
}

interface RowIndex {
  /** columnId -> row position inside its table. */
  rows: Map<string, number>;
}

export function buildRowIndex(schema: Schema): RowIndex {
  const rows = new Map<string, number>();
  for (const table of schema.tables) {
    table.columns.forEach((column, index) => rows.set(column.id, index));
  }
  for (const model of schema.enums) {
    model.values.forEach((value, index) => rows.set(`${model.id}.${value.name}`, index));
  }
  return { rows };
}

/** Pick which vertical edge of each box the connector should leave from. */
function chooseSides(from: LayoutNode, to: LayoutNode): [Side, Side] {
  const fromRight = from.x + from.width;
  const toRight = to.x + to.width;
  if (to.x > fromRight) return ['right', 'left'];
  if (from.x > toRight) return ['left', 'right'];
  // Boxes overlap horizontally: leave from the same side and loop around.
  const side: Side = from.x + from.width / 2 <= to.x + to.width / 2 ? 'right' : 'left';
  return [side, side];
}

function edgeX(node: LayoutNode, side: Side): number {
  return side === 'right' ? node.x + node.width : node.x;
}

function direction(side: Side): number {
  return side === 'right' ? 1 : -1;
}

/** Orthogonal polyline between two anchors, given the side each leaves from. */
export function routePoints(from: EdgeAnchor, to: EdgeAnchor): Point[] {
  const d1 = direction(from.side);
  const d2 = direction(to.side);
  const a = { x: from.point.x + d1 * STUB, y: from.point.y };
  const b = { x: to.point.x + d2 * STUB, y: to.point.y };

  if (Math.abs(from.point.y - to.point.y) < 0.5) {
    return [from.point, to.point];
  }

  if (d1 !== d2) {
    const facingEachOther = d1 > 0 ? b.x > a.x : b.x < a.x;
    if (facingEachOther) {
      const mid = (a.x + b.x) / 2;
      return [from.point, { x: mid, y: from.point.y }, { x: mid, y: to.point.y }, to.point];
    }
    // Not enough room between the boxes: step out, cross vertically, step in.
    const midY = (from.point.y + to.point.y) / 2;
    return [
      from.point,
      a,
      { x: a.x, y: midY },
      { x: b.x, y: midY },
      b,
      to.point,
    ];
  }

  // Same side: run around the outside of whichever box sticks out further.
  const outer = d1 > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x);
  return [from.point, { x: outer, y: from.point.y }, { x: outer, y: to.point.y }, to.point];
}

/** Render a polyline as an SVG path with rounded corners. */
export function polylineToPath(points: Point[], radius = CORNER): string {
  if (points.length < 2) return '';
  const parts = [`M ${round(points[0].x)} ${round(points[0].y)}`];

  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inLength = distance(previous, corner);
    const outLength = distance(corner, next);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    if (r < 0.5) {
      parts.push(`L ${round(corner.x)} ${round(corner.y)}`);
      continue;
    }
    const entry = lerpTowards(corner, previous, r);
    const exit = lerpTowards(corner, next, r);
    parts.push(`L ${round(entry.x)} ${round(entry.y)}`);
    parts.push(`Q ${round(corner.x)} ${round(corner.y)} ${round(exit.x)} ${round(exit.y)}`);
  }

  const last = points[points.length - 1];
  parts.push(`L ${round(last.x)} ${round(last.y)}`);
  return parts.join(' ');
}

export interface RouteOptions {
  schema: Schema;
  layout: Layout;
  rowIndex: RowIndex;
}

export function routeEdges({ schema, layout, rowIndex }: RouteOptions): Edge[] {
  const edges: Edge[] = [];

  for (const ref of schema.refs) {
    const edge = routeRef(ref, layout, rowIndex);
    if (edge) edges.push(edge);
  }

  // Dashed links from a column to the enum that types it.
  for (const table of schema.tables) {
    const node = layout.nodes.get(table.id);
    if (!node) continue;
    for (const column of table.columns) {
      if (!column.enumId) continue;
      const target = layout.nodes.get(column.enumId);
      if (!target) continue;
      const [fromSide, toSide] = chooseSides(node, target);
      const from: EdgeAnchor = anchor(node, fromSide, rowIndex.rows.get(column.id), '*');
      const to: EdgeAnchor = anchor(target, toSide, undefined, '1');
      edges.push({
        id: `enum:${column.id}`,
        refId: `enum:${column.enumId}`,
        from,
        to,
        path: polylineToPath(routePoints(from, to)),
        nodeIds: [table.id, column.enumId],
        columnIds: [column.id],
        kind: 'enum',
      });
    }
  }

  return edges;
}

function routeRef(ref: Ref, layout: Layout, rowIndex: RowIndex): Edge | null {
  const [left, right] = ref.endpoints;
  const fromNode = layout.nodes.get(left.tableId);
  const toNode = layout.nodes.get(right.tableId);
  if (!fromNode || !toNode) return null;

  if (fromNode === toNode) {
    return selfReference(ref, fromNode, rowIndex);
  }

  const [fromSide, toSide] = chooseSides(fromNode, toNode);
  const from = anchor(fromNode, fromSide, rowIndex.rows.get(left.columnIds[0]), left.relation);
  const to = anchor(toNode, toSide, rowIndex.rows.get(right.columnIds[0]), right.relation);

  return {
    id: ref.id,
    refId: ref.id,
    name: ref.name,
    color: ref.color,
    from,
    to,
    path: polylineToPath(routePoints(from, to)),
    nodeIds: [left.tableId, right.tableId],
    columnIds: [...left.columnIds, ...right.columnIds],
    kind: 'relationship',
  };
}

/** A table referencing itself loops out of the right edge and back again. */
function selfReference(ref: Ref, node: LayoutNode, rowIndex: RowIndex): Edge {
  const [left, right] = ref.endpoints;
  const from = anchor(node, 'right', rowIndex.rows.get(left.columnIds[0]), left.relation);
  const to = anchor(node, 'right', rowIndex.rows.get(right.columnIds[0]), right.relation);
  const outer = node.x + node.width + STUB * 2;
  const points: Point[] = [
    from.point,
    { x: outer, y: from.point.y },
    { x: outer, y: to.point.y },
    to.point,
  ];
  return {
    id: ref.id,
    refId: ref.id,
    name: ref.name,
    color: ref.color,
    from,
    to,
    path: polylineToPath(points),
    nodeIds: [node.id, node.id],
    columnIds: [...left.columnIds, ...right.columnIds],
    kind: 'relationship',
  };
}

function anchor(
  node: LayoutNode,
  side: Side,
  rowIndex: number | undefined,
  cardinality: Cardinality,
): EdgeAnchor {
  const x = edgeX(node, side);
  const y = anchorY(node, rowIndex);
  return {
    nodeId: node.id,
    columnIds: [],
    side,
    point: { x, y },
    cardinality,
    label: { x: x + direction(side) * LABEL_OFFSET, y: y - 7 },
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerpTowards(from: Point, to: Point, amount: number): Point {
  const length = distance(from, to) || 1;
  const t = amount / length;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
