import { describe, expect, it } from 'vitest';
import { compile } from '../src/dbml';
import { layout } from '../src/diagram/layout';
import { buildRowIndex, polylineToPath, routeEdges } from '../src/diagram/routing';
import { Rect } from '../src/diagram/geometry';

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

const SHOP = `
  Table users { id int [pk] name varchar }
  Table orders { id int [pk] user_id int status order_status }
  Table order_items { id int [pk] order_id int product_id int }
  Table products { id int [pk] name varchar }
  Enum order_status { pending shipped }
  Ref: orders.user_id > users.id
  Ref: order_items.order_id > orders.id
  Ref: order_items.product_id > products.id
`;

describe('layout', () => {
  it('places every table, enum and sticky note exactly once', () => {
    const { schema } = compile(`${SHOP}\nNote hint { 'remember me' }`);
    const result = layout(schema);
    expect(result.nodes.size).toBe(4 + 1 + 1);
    for (const node of result.nodes.values()) {
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
  });

  it('never overlaps two nodes', () => {
    const { schema } = compile(SHOP);
    const boxes = [...layout(schema).nodes.values()];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it('is deterministic', () => {
    const { schema } = compile(SHOP);
    expect([...layout(schema).nodes]).toEqual([...layout(schema).nodes]);
  });

  it('puts related tables in different columns', () => {
    const { schema } = compile(SHOP);
    const result = layout(schema);
    const users = result.nodes.get('public.users')!;
    const orders = result.nodes.get('public.orders')!;
    expect(users.x).not.toBe(orders.x);
  });

  it('honours dragged positions', () => {
    const { schema } = compile(SHOP);
    const result = layout(schema, { 'public.users': { x: 900, y: 400 } });
    expect(result.nodes.get('public.users')).toMatchObject({ x: 900, y: 400 });
  });

  it('wraps a group box around its members only', () => {
    const { schema } = compile(`
      Table a { id int }
      Table b { id int }
      Table outsider { id int }
      TableGroup core { a b }
    `);
    const result = layout(schema);
    expect(result.groups).toHaveLength(1);
    const box = result.groups[0].rect;
    for (const id of ['public.a', 'public.b']) {
      const node = result.nodes.get(id)!;
      expect(node.x).toBeGreaterThanOrEqual(box.x);
      expect(node.x + node.width).toBeLessThanOrEqual(box.x + box.width);
    }
    expect(overlaps(box, result.nodes.get('public.outsider')!)).toBe(false);
  });

  it('keeps the whole diagram inside the reported bounds', () => {
    const { schema } = compile(SHOP);
    const result = layout(schema);
    for (const node of result.nodes.values()) {
      expect(node.x).toBeGreaterThanOrEqual(result.bounds.x);
      expect(node.y).toBeGreaterThanOrEqual(result.bounds.y);
      expect(node.x + node.width).toBeLessThanOrEqual(result.bounds.x + result.bounds.width);
      expect(node.y + node.height).toBeLessThanOrEqual(result.bounds.y + result.bounds.height);
    }
  });
});

describe('routing', () => {
  it('routes one edge per relationship plus one per enum link', () => {
    const { schema } = compile(SHOP);
    const result = layout(schema);
    const edges = routeEdges({ schema, layout: result, rowIndex: buildRowIndex(schema) });
    expect(edges.filter((edge) => edge.kind === 'relationship')).toHaveLength(3);
    expect(edges.filter((edge) => edge.kind === 'enum')).toHaveLength(1);
    for (const edge of edges) expect(edge.path.startsWith('M ')).toBe(true);
  });

  it('anchors an edge on the row of the column it references', () => {
    const { schema } = compile(`
      Table a { id int first int second int }
      Table b { id int [pk] }
      Ref: a.second > b.id
    `);
    const result = layout(schema);
    const [edge] = routeEdges({ schema, layout: result, rowIndex: buildRowIndex(schema) });
    const node = result.nodes.get('public.a')!;
    // Row 2 of the table: header + 2 rows + half a row.
    expect(edge.from.point.y).toBeCloseTo(node.y + 36 + 2 * 26 + 13, 5);
  });

  it('leaves from facing sides when the tables sit side by side', () => {
    const { schema } = compile(`
      Table a { id int [pk] }
      Table b { a_id int }
      Ref: b.a_id > a.id
    `);
    const result = layout(schema);
    const [edge] = routeEdges({ schema, layout: result, rowIndex: buildRowIndex(schema) });
    expect(edge.from.side).not.toBe(edge.to.side);
  });

  it('labels each end with its cardinality', () => {
    const { schema } = compile(`
      Table a { id int [pk] }
      Table b { a_id int }
      Ref: a.id < b.a_id
    `);
    const result = layout(schema);
    const [edge] = routeEdges({ schema, layout: result, rowIndex: buildRowIndex(schema) });
    expect([edge.from.cardinality, edge.to.cardinality]).toEqual(['1', '*']);
  });

  it('rounds corners without leaving the polyline', () => {
    const path = polylineToPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ]);
    expect(path).toMatch(/^M 0 0/);
    expect(path).toContain('Q');
    expect(path.trim().endsWith('L 100 40')).toBe(true);
  });
});
