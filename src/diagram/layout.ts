/**
 * Automatic diagram layout.
 *
 * Tables are grouped into clusters (an explicit `TableGroup`, or a connected
 * component of the relationship graph), each cluster is laid out in columns by
 * breadth-first distance from its most-connected table, and the clusters are
 * then shelf-packed into a roughly square canvas.
 *
 * The result is deterministic: the same DBML always produces the same picture,
 * which matters because the diagram re-renders on every keystroke.
 */

import { Schema } from '../dbml';
import { Rect, unionRects } from './geometry';
import { measureEnum, measureTable, wrapNote } from './metrics';

export type NodeKind = 'table' | 'enum' | 'note';

export interface LayoutNode extends Rect {
  id: string;
  kind: NodeKind;
  groupId?: string;
}

export interface LayoutGroup {
  id: string;
  name: string;
  color?: string;
  note?: string;
  rect: Rect;
}

export interface Layout {
  nodes: Map<string, LayoutNode>;
  groups: LayoutGroup[];
  bounds: Rect;
}

/** Positions the user has dragged tables to, keyed by node id. */
export type PositionOverrides = Record<string, { x: number; y: number }>;

const LEVEL_GAP = 96;
const NODE_GAP = 36;
const CLUSTER_GAP = 72;
const GROUP_PADDING = 26;
const GROUP_HEADER = 20;
/** Clusters wrap to a new shelf past this width, keeping the canvas squarish. */
const TARGET_WIDTH = 1600;

interface SizedNode {
  id: string;
  kind: NodeKind;
  width: number;
  height: number;
  groupId?: string;
}

export function layout(schema: Schema, overrides: PositionOverrides = {}): Layout {
  const nodes = sizeNodes(schema);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = buildAdjacency(schema, byId);
  const clusters = buildClusters(schema, nodes, adjacency);

  const placed = new Map<string, LayoutNode>();

  // Lay out each cluster at the origin, then shelf-pack the cluster boxes.
  const laidOut = clusters.map((cluster) => ({
    cluster,
    ...layoutCluster(cluster, byId, adjacency),
  }));

  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;
  for (const entry of laidOut) {
    const padding = entry.cluster.groupId ? GROUP_PADDING : 0;
    const headroom = entry.cluster.groupId ? GROUP_HEADER : 0;
    const width = entry.size.width + padding * 2;
    const height = entry.size.height + padding * 2 + headroom;

    if (shelfX > 0 && shelfX + width > TARGET_WIDTH) {
      shelfX = 0;
      shelfY += shelfHeight + CLUSTER_GAP;
      shelfHeight = 0;
    }

    const originX = shelfX + padding;
    const originY = shelfY + padding + headroom;
    for (const [id, point] of entry.positions) {
      const node = byId.get(id)!;
      placed.set(id, {
        id,
        kind: node.kind,
        groupId: node.groupId,
        x: originX + point.x,
        y: originY + point.y,
        width: node.width,
        height: node.height,
      });
    }
    shelfX += width + CLUSTER_GAP;
    shelfHeight = Math.max(shelfHeight, height);
  }

  // User-dragged positions win over the automatic placement.
  for (const [id, point] of Object.entries(overrides)) {
    const node = placed.get(id);
    if (node) {
      node.x = point.x;
      node.y = point.y;
    }
  }

  const groups: LayoutGroup[] = [];
  for (const group of schema.groups) {
    const members = group.tableIds
      .map((id) => placed.get(id))
      .filter((node): node is LayoutNode => Boolean(node));
    if (!members.length) continue;
    const box = unionRects(members);
    groups.push({
      id: group.id,
      name: group.name,
      color: group.color,
      note: group.note,
      rect: {
        x: box.x - GROUP_PADDING,
        y: box.y - GROUP_PADDING - GROUP_HEADER,
        width: box.width + GROUP_PADDING * 2,
        height: box.height + GROUP_PADDING * 2 + GROUP_HEADER,
      },
    });
  }

  const all = [...placed.values(), ...groups.map((group) => group.rect)];
  return { nodes: placed, groups, bounds: unionRects(all) };
}

function sizeNodes(schema: Schema): SizedNode[] {
  const nodes: SizedNode[] = [];
  for (const table of schema.tables) {
    const size = measureTable(table);
    nodes.push({ id: table.id, kind: 'table', groupId: table.groupId, ...size });
  }
  for (const model of schema.enums) {
    const size = measureEnum(model);
    nodes.push({ id: model.id, kind: 'enum', ...size });
  }
  for (const note of schema.stickyNotes) {
    const { size } = wrapNote(note);
    nodes.push({ id: note.id, kind: 'note', ...size });
  }
  return nodes;
}

/** Undirected neighbour lists: relationships, plus column-to-enum links. */
function buildAdjacency(schema: Schema, byId: Map<string, SizedNode>): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };

  for (const ref of schema.refs) {
    link(ref.endpoints[0].tableId, ref.endpoints[1].tableId);
  }
  for (const table of schema.tables) {
    for (const column of table.columns) {
      if (column.enumId) link(table.id, column.enumId);
    }
  }
  return adjacency;
}

interface Cluster {
  ids: string[];
  groupId?: string;
}

/**
 * Explicit table groups form their own clusters so their bounding boxes never
 * swallow unrelated tables; everything else clusters by connectivity.
 */
function buildClusters(
  schema: Schema,
  nodes: SizedNode[],
  adjacency: Map<string, Set<string>>,
): Cluster[] {
  const clusters: Cluster[] = [];
  const claimed = new Set<string>();
  const present = new Set(nodes.map((node) => node.id));

  for (const group of schema.groups) {
    const ids = group.tableIds.filter((id) => present.has(id) && !claimed.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => claimed.add(id));
    clusters.push({ ids, groupId: group.id });
  }

  for (const node of nodes) {
    if (claimed.has(node.id) || node.kind === 'note') continue;
    // Flood fill this component, skipping anything already inside a group.
    const ids: string[] = [];
    const queue = [node.id];
    claimed.add(node.id);
    while (queue.length) {
      const id = queue.shift()!;
      ids.push(id);
      for (const neighbour of adjacency.get(id) ?? []) {
        if (claimed.has(neighbour)) continue;
        claimed.add(neighbour);
        queue.push(neighbour);
      }
    }
    clusters.push({ ids });
  }

  // Sticky notes float on their own, packed after the schema itself.
  for (const node of nodes) {
    if (node.kind === 'note') clusters.push({ ids: [node.id] });
  }

  // Bigger clusters first so the shelf packing stays tight.
  return clusters.sort((a, b) => b.ids.length - a.ids.length);
}

interface ClusterLayout {
  positions: Map<string, { x: number; y: number }>;
  size: { width: number; height: number };
}

/** Breadth-first layering, then barycentre ordering inside each column. */
function layoutCluster(
  cluster: Cluster,
  byId: Map<string, SizedNode>,
  adjacency: Map<string, Set<string>>,
): ClusterLayout {
  const members = new Set(cluster.ids);
  const degree = (id: string) =>
    [...(adjacency.get(id) ?? [])].filter((neighbour) => members.has(neighbour)).length;

  const remaining = [...cluster.ids].sort((a, b) => degree(b) - degree(a) || a.localeCompare(b));
  const level = new Map<string, number>();
  const seen = new Set<string>();

  for (const seed of remaining) {
    if (seen.has(seed)) continue;
    seen.add(seed);
    level.set(seed, 0);
    const queue = [seed];
    while (queue.length) {
      const id = queue.shift()!;
      const next = (level.get(id) ?? 0) + 1;
      const neighbours = [...(adjacency.get(id) ?? [])]
        .filter((neighbour) => members.has(neighbour) && !seen.has(neighbour))
        .sort();
      for (const neighbour of neighbours) {
        seen.add(neighbour);
        level.set(neighbour, next);
        queue.push(neighbour);
      }
    }
  }

  const columns: string[][] = [];
  for (const id of cluster.ids) {
    const index = level.get(id) ?? 0;
    (columns[index] ??= []).push(id);
  }
  for (let i = 0; i < columns.length; i++) columns[i] ??= [];

  orderColumns(columns, adjacency);

  // Column x positions from the widest node in each column.
  const columnWidths = columns.map((column) =>
    column.reduce((max, id) => Math.max(max, byId.get(id)!.width), 0),
  );
  const columnX: number[] = [];
  let cursor = 0;
  for (let i = 0; i < columns.length; i++) {
    columnX[i] = cursor;
    cursor += columnWidths[i] + LEVEL_GAP;
  }
  const totalWidth = Math.max(cursor - LEVEL_GAP, 0);

  const columnHeights = columns.map((column) =>
    column.reduce((sum, id) => sum + byId.get(id)!.height + NODE_GAP, -NODE_GAP),
  );
  const totalHeight = Math.max(0, ...columnHeights);

  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((column, index) => {
    // Centre each column vertically so the cluster reads as one block.
    let y = (totalHeight - columnHeights[index]) / 2;
    for (const id of column) {
      const node = byId.get(id)!;
      positions.set(id, {
        x: columnX[index] + (columnWidths[index] - node.width) / 2,
        y,
      });
      y += node.height + NODE_GAP;
    }
  });

  return { positions, size: { width: totalWidth, height: totalHeight } };
}

/**
 * Reduce edge crossings by repeatedly sorting each column on the average
 * position of its neighbours in the adjacent column.
 */
function orderColumns(columns: string[][], adjacency: Map<string, Set<string>>): void {
  const indexOf = new Map<string, number>();
  const reindex = () => {
    indexOf.clear();
    columns.forEach((column) => column.forEach((id, i) => indexOf.set(id, i)));
  };
  reindex();

  const sortAgainst = (column: string[], reference: string[]) => {
    if (!reference.length) return;
    const referenceIndex = new Map(reference.map((id, i) => [id, i]));
    const barycentre = new Map<string, number>();
    column.forEach((id, fallback) => {
      const neighbours = [...(adjacency.get(id) ?? [])]
        .map((neighbour) => referenceIndex.get(neighbour))
        .filter((value): value is number => value !== undefined);
      barycentre.set(
        id,
        neighbours.length
          ? neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length
          : fallback,
      );
    });
    column.sort((a, b) => barycentre.get(a)! - barycentre.get(b)!);
  };

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < columns.length; i++) sortAgainst(columns[i], columns[i - 1]);
    for (let i = columns.length - 2; i >= 0; i--) sortAgainst(columns[i], columns[i + 1]);
  }
  reindex();
}
