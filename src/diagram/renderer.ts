/**
 * The diagram canvas: builds the SVG, handles pan/zoom/drag, spotlights
 * relationships, and exports the picture.
 *
 * Rendering is a full rebuild on schema change (fast enough for schemas far
 * larger than anyone hand-writes) but dragging is incremental — only the moved
 * node's transform and the edges touching it are recomputed, so a drag stays
 * smooth no matter how big the diagram is.
 */

import { Column, Schema, Span, Table, tableLabel } from '../dbml';
import { Rect } from './geometry';
import { Layout, PositionOverrides, layout } from './layout';
import { FONTS, NODE_METRICS, columnBadges, foreignKeyColumns, textWidth, wrapNote } from './metrics';
import { Edge, buildRowIndex, polylineToPath, routeEdges, routePoints } from './routing';
import { DIAGRAM_CSS } from './style';

const SVG_NS = 'http://www.w3.org/2000/svg';
const KEY_PATH =
  'M3.2 0C1.4 0 0 1.4 0 3.2s1.4 3.2 3.2 3.2c1.3 0 2.5-.8 3-2H9v1.6h1.6V4.4H12V2.4H6.2C5.7 1 4.5 0 3.2 0zm0 2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z';

export type Theme = 'light' | 'dark';

export interface DiagramEvents {
  /** A table header or column row was clicked; `span` points at its DBML. */
  onSelect?(payload: { kind: 'table' | 'column' | 'enum' | 'note'; id: string; span: Span }): void;
  onBackgroundClick?(): void;
  onPositionsChanged?(positions: PositionOverrides): void;
  onZoomChanged?(zoom: number): void;
}

interface Viewport {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

export class DiagramView {
  private readonly svg: SVGSVGElement;
  private readonly patternTransform: SVGPatternElement;
  private readonly viewportGroup: SVGGElement;
  private readonly groupLayer: SVGGElement;
  private readonly edgeLayer: SVGGElement;
  private readonly nodeLayer: SVGGElement;

  private schema: Schema = { tables: [], refs: [], enums: [], groups: [], stickyNotes: [] };
  private currentLayout: Layout = { nodes: new Map(), groups: [], bounds: zeroRect() };
  private edges: Edge[] = [];
  private overrides: PositionOverrides = {};
  private viewport: Viewport = { x: 0, y: 0, k: 1 };

  private readonly nodeElements = new Map<string, SVGGElement>();
  private readonly edgeElements = new Map<string, SVGGElement>();
  private readonly edgesByNode = new Map<string, Edge[]>();
  private focusId: string | null = null;

  private cleanups: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly events: DiagramEvents = {},
  ) {
    this.svg = svgEl<SVGSVGElement>('svg', { class: 'erd', width: '100%', height: '100%' });

    const defs = svgEl('defs');
    const style = svgEl('style');
    style.textContent = DIAGRAM_CSS;
    defs.append(style);

    this.patternTransform = svgEl<SVGPatternElement>('pattern', {
      id: 'erd-dots',
      width: '24',
      height: '24',
      patternUnits: 'userSpaceOnUse',
    });
    this.patternTransform.append(
      svgEl('circle', { cx: '1.5', cy: '1.5', r: '1.5', class: 'erd-grid' }),
    );
    defs.append(this.patternTransform);
    this.svg.append(defs);

    this.svg.append(
      svgEl('rect', { class: 'erd-bg', x: '0', y: '0', width: '100%', height: '100%', fill: 'url(#erd-dots)' }),
    );

    this.viewportGroup = svgEl<SVGGElement>('g', { class: 'viewport' });
    this.groupLayer = svgEl<SVGGElement>('g', { class: 'layer-groups' });
    this.edgeLayer = svgEl<SVGGElement>('g', { class: 'layer-edges' });
    this.nodeLayer = svgEl<SVGGElement>('g', { class: 'layer-nodes' });
    this.viewportGroup.append(this.groupLayer, this.edgeLayer, this.nodeLayer);
    this.svg.append(this.viewportGroup);

    container.append(this.svg);
    this.attachInteractions();
  }

  // ------------------------------------------------------------------ state

  setSchema(schema: Schema, options: { relayout?: boolean } = {}): void {
    this.schema = schema;
    if (options.relayout) this.overrides = {};
    // Forget positions for tables that no longer exist.
    const known = new Set<string>([
      ...schema.tables.map((table) => table.id),
      ...schema.enums.map((model) => model.id),
      ...schema.stickyNotes.map((note) => note.id),
    ]);
    for (const id of Object.keys(this.overrides)) {
      if (!known.has(id)) delete this.overrides[id];
    }
    this.render();
  }

  setPositions(positions: PositionOverrides): void {
    this.overrides = { ...positions };
    this.render();
  }

  getPositions(): PositionOverrides {
    return { ...this.overrides };
  }

  /** Throw away dragged positions and re-run the automatic layout. */
  relayout(): void {
    this.overrides = {};
    this.render();
    this.fit();
    this.events.onPositionsChanged?.(this.getPositions());
  }

  setTheme(theme: Theme): void {
    this.svg.classList.toggle('theme-dark', theme === 'dark');
  }

  get bounds(): Rect {
    return this.currentLayout.bounds;
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    this.currentLayout = layout(this.schema, this.overrides);
    const rowIndex = buildRowIndex(this.schema);
    this.edges = routeEdges({ schema: this.schema, layout: this.currentLayout, rowIndex });

    this.edgesByNode.clear();
    for (const edge of this.edges) {
      for (const nodeId of new Set(edge.nodeIds)) {
        const list = this.edgesByNode.get(nodeId) ?? [];
        list.push(edge);
        this.edgesByNode.set(nodeId, list);
      }
    }

    this.groupLayer.replaceChildren(...this.currentLayout.groups.map((group) => renderGroup(group)));

    this.edgeElements.clear();
    this.edgeLayer.replaceChildren(
      ...this.edges.map((edge) => {
        const element = renderEdge(edge);
        this.edgeElements.set(edge.id, element);
        return element;
      }),
    );

    this.nodeElements.clear();
    const foreignKeys = foreignKeyColumns(this.schema);
    const nodes: SVGGElement[] = [];
    for (const table of this.schema.tables) {
      const box = this.currentLayout.nodes.get(table.id);
      if (!box) continue;
      const element = renderTable(table, box, foreignKeys);
      this.nodeElements.set(table.id, element);
      nodes.push(element);
    }
    for (const model of this.schema.enums) {
      const box = this.currentLayout.nodes.get(model.id);
      if (!box) continue;
      const element = renderEnum(model, box);
      this.nodeElements.set(model.id, element);
      nodes.push(element);
    }
    for (const note of this.schema.stickyNotes) {
      const box = this.currentLayout.nodes.get(note.id);
      if (!box) continue;
      const element = renderNote(note, box);
      this.nodeElements.set(note.id, element);
      nodes.push(element);
    }
    this.nodeLayer.replaceChildren(...nodes);

    if (this.focusId) this.applyFocus(this.focusId);
  }

  // ------------------------------------------------------------ viewport

  private applyViewport(): void {
    const { x, y, k } = this.viewport;
    this.viewportGroup.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
    this.patternTransform.setAttribute('patternTransform', `translate(${x} ${y}) scale(${k})`);
    this.events.onZoomChanged?.(k);
  }

  get zoom(): number {
    return this.viewport.k;
  }

  zoomBy(factor: number, origin?: { x: number; y: number }): void {
    const rect = this.svg.getBoundingClientRect();
    const pivot = origin ?? { x: rect.width / 2, y: rect.height / 2 };
    const next = clamp(this.viewport.k * factor, MIN_ZOOM, MAX_ZOOM);
    const scale = next / this.viewport.k;
    this.viewport = {
      k: next,
      x: pivot.x - (pivot.x - this.viewport.x) * scale,
      y: pivot.y - (pivot.y - this.viewport.y) * scale,
    };
    this.applyViewport();
  }

  zoomTo(k: number): void {
    this.zoomBy(clamp(k, MIN_ZOOM, MAX_ZOOM) / this.viewport.k);
  }

  /** Scale and centre so the whole diagram is visible. */
  fit(padding = 48): void {
    const rect = this.svg.getBoundingClientRect();
    const bounds = this.currentLayout.bounds;
    if (!bounds.width || !bounds.height || !rect.width) return;
    const k = clamp(
      Math.min(
        (rect.width - padding * 2) / bounds.width,
        (rect.height - padding * 2) / bounds.height,
      ),
      MIN_ZOOM,
      1.4,
    );
    this.viewport = {
      k,
      x: rect.width / 2 - (bounds.x + bounds.width / 2) * k,
      y: rect.height / 2 - (bounds.y + bounds.height / 2) * k,
    };
    this.applyViewport();
  }

  /** Centre the view on a node without changing zoom. */
  focus(nodeId: string): void {
    const box = this.currentLayout.nodes.get(nodeId);
    if (!box) return;
    const rect = this.svg.getBoundingClientRect();
    const { k } = this.viewport;
    this.viewport = {
      k,
      x: rect.width / 2 - (box.x + box.width / 2) * k,
      y: rect.height / 2 - (box.y + box.height / 2) * k,
    };
    this.applyViewport();
    this.setFocus(nodeId);
  }

  // ------------------------------------------------------------- highlight

  /** Spotlight a table (and its relationships), or clear with `null`. */
  setFocus(id: string | null): void {
    this.focusId = id;
    this.applyFocus(id);
  }

  private applyFocus(id: string | null): void {
    this.svg.classList.toggle('has-focus', Boolean(id));
    for (const element of this.nodeElements.values()) {
      element.classList.remove('is-focus', 'is-related');
    }
    for (const element of this.edgeElements.values()) {
      element.classList.remove('is-focus');
    }
    this.svg
      .querySelectorAll('.row.is-focus')
      .forEach((row) => row.classList.remove('is-focus'));
    if (!id) return;

    const nodeId = id.includes('.') && !this.currentLayout.nodes.has(id) ? ownerOf(id) : id;
    this.nodeElements.get(nodeId)?.classList.add('is-focus');
    if (nodeId !== id) {
      this.svg
        .querySelector(`.row[data-column-id="${cssEscape(id)}"]`)
        ?.classList.add('is-focus');
    }

    for (const edge of this.edges) {
      const touchesNode = edge.nodeIds.includes(nodeId);
      const touchesColumn = nodeId !== id && edge.columnIds.includes(id);
      if (!(nodeId === id ? touchesNode : touchesColumn)) continue;
      this.edgeElements.get(edge.id)?.classList.add('is-focus');
      for (const other of edge.nodeIds) {
        if (other !== nodeId) this.nodeElements.get(other)?.classList.add('is-related');
      }
    }
  }

  /** Outline the given nodes (used by the table search panel). */
  setSearchHits(ids: string[]): void {
    for (const element of this.nodeElements.values()) element.classList.remove('search-hit');
    for (const id of ids) this.nodeElements.get(id)?.classList.add('search-hit');
  }

  // ------------------------------------------------------------ interaction

  private attachInteractions(): void {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      const pivot = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        this.viewport.x -= event.deltaY;
        this.applyViewport();
        return;
      }
      const factor = Math.exp(-event.deltaY * 0.0016);
      this.zoomBy(factor, pivot);
    };
    this.svg.addEventListener('wheel', onWheel, { passive: false });
    this.cleanups.push(() => this.svg.removeEventListener('wheel', onWheel));

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Element;
      const nodeElement = target.closest<SVGGElement>('.node');
      if (nodeElement) {
        this.beginNodeDrag(event, nodeElement);
        return;
      }
      this.beginPan(event);
    };
    this.svg.addEventListener('pointerdown', onPointerDown);
    this.cleanups.push(() => this.svg.removeEventListener('pointerdown', onPointerDown));

    const onDoubleClick = (event: MouseEvent) => {
      if ((event.target as Element).closest('.node')) return;
      this.fit();
    };
    this.svg.addEventListener('dblclick', onDoubleClick);
    this.cleanups.push(() => this.svg.removeEventListener('dblclick', onDoubleClick));
  }

  /**
   * Turn a press that didn't turn into a drag into a selection.
   *
   * This runs from `pointerup` rather than a `click` listener on purpose:
   * capturing the pointer (which dragging needs) retargets the subsequent
   * click to the `<svg>` itself, losing the node that was actually pressed.
   */
  private selectFrom(target: Element): void {
    const node = target.closest<SVGGElement>('.node');
    if (!node) {
      this.setFocus(null);
      this.events.onBackgroundClick?.();
      return;
    }

    const row = target.closest<SVGGElement>('.row');
    if (row?.dataset.columnId && row.dataset.span) {
      this.setFocus(row.dataset.columnId);
      this.events.onSelect?.({
        kind: 'column',
        id: row.dataset.columnId,
        span: JSON.parse(row.dataset.span),
      });
      return;
    }

    const id = node.dataset.id!;
    this.setFocus(id);
    this.events.onSelect?.({
      kind: (node.dataset.kind ?? 'table') as 'table' | 'enum' | 'note',
      id,
      span: JSON.parse(node.dataset.span!),
    });
  }

  private beginPan(event: PointerEvent): void {
    const pressed = event.target as Element;
    const start = { x: event.clientX, y: event.clientY };
    const origin = { ...this.viewport };
    let moved = false;
    this.svg.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      this.viewport = { k: origin.k, x: origin.x + dx, y: origin.y + dy };
      this.applyViewport();
    };
    const up = (upEvent: PointerEvent) => {
      this.svg.releasePointerCapture(upEvent.pointerId);
      this.svg.removeEventListener('pointermove', move);
      this.svg.removeEventListener('pointerup', up);
      this.svg.removeEventListener('pointercancel', up);
      if (!moved) this.selectFrom(pressed);
    };
    this.svg.addEventListener('pointermove', move);
    this.svg.addEventListener('pointerup', up);
    this.svg.addEventListener('pointercancel', up);
  }

  private beginNodeDrag(event: PointerEvent, element: SVGGElement): void {
    const pressed = event.target as Element;
    const id = element.dataset.id!;
    const box = this.currentLayout.nodes.get(id);
    if (!box) return;
    const start = { x: event.clientX, y: event.clientY };
    const origin = { x: box.x, y: box.y };
    let moved = false;
    element.classList.add('is-dragging');
    this.svg.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.x) / this.viewport.k;
      const dy = (moveEvent.clientY - start.y) / this.viewport.k;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      box.x = origin.x + dx;
      box.y = origin.y + dy;
      element.setAttribute('transform', `translate(${box.x} ${box.y})`);
      this.reroute(id);
      this.updateGroupBoxes();
    };
    const up = (upEvent: PointerEvent) => {
      this.svg.releasePointerCapture(upEvent.pointerId);
      this.svg.removeEventListener('pointermove', move);
      this.svg.removeEventListener('pointerup', up);
      this.svg.removeEventListener('pointercancel', up);
      element.classList.remove('is-dragging');
      if (!moved) {
        this.selectFrom(pressed);
        return;
      }
      this.overrides[id] = { x: box.x, y: box.y };
      this.events.onPositionsChanged?.(this.getPositions());
    };
    this.svg.addEventListener('pointermove', move);
    this.svg.addEventListener('pointerup', up);
    this.svg.addEventListener('pointercancel', up);
  }

  /** Recompute only the edges attached to the node being dragged. */
  private reroute(nodeId: string): void {
    const rowIndex = buildRowIndex(this.schema);
    const fresh = routeEdges({ schema: this.schema, layout: this.currentLayout, rowIndex });
    const byId = new Map(fresh.map((edge) => [edge.id, edge]));
    for (const edge of this.edgesByNode.get(nodeId) ?? []) {
      const updated = byId.get(edge.id);
      const element = this.edgeElements.get(edge.id);
      if (!updated || !element) continue;
      updateEdgeElement(element, updated);
      Object.assign(edge, updated);
    }
  }

  private updateGroupBoxes(): void {
    const boxes = new Map(this.currentLayout.groups.map((group) => [group.id, group]));
    for (const group of this.schema.groups) {
      const target = boxes.get(group.id);
      if (!target) continue;
      const members = group.tableIds
        .map((id) => this.currentLayout.nodes.get(id))
        .filter(Boolean) as Rect[];
      if (!members.length) continue;
      const padding = 26;
      const header = 20;
      const minX = Math.min(...members.map((m) => m.x));
      const minY = Math.min(...members.map((m) => m.y));
      const maxX = Math.max(...members.map((m) => m.x + m.width));
      const maxY = Math.max(...members.map((m) => m.y + m.height));
      target.rect = {
        x: minX - padding,
        y: minY - padding - header,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2 + header,
      };
      const element = this.groupLayer.querySelector<SVGGElement>(
        `.group[data-id="${cssEscape(group.id)}"]`,
      );
      if (element) updateGroupElement(element, target.rect);
    }
  }

  // ---------------------------------------------------------------- export

  /** Serialise the diagram as a standalone SVG document. */
  toSVGString(padding = 32): string {
    const clone = this.svg.cloneNode(true) as SVGSVGElement;
    clone.querySelector('.erd-bg')?.remove();
    clone.querySelector('.viewport')?.setAttribute('transform', 'translate(0 0) scale(1)');
    clone.querySelectorAll('.is-focus, .is-related, .search-hit').forEach((element) => {
      element.classList.remove('is-focus', 'is-related', 'search-hit');
    });
    clone.classList.remove('has-focus');

    const bounds = this.currentLayout.bounds;
    const width = Math.max(bounds.width + padding * 2, 1);
    const height = Math.max(bounds.height + padding * 2, 1);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('width', String(Math.round(width)));
    clone.setAttribute('height', String(Math.round(height)));
    clone.setAttribute(
      'viewBox',
      `${bounds.x - padding} ${bounds.y - padding} ${width} ${height}`,
    );

    const background = svgEl<SVGGElement>('rect', {
      x: String(bounds.x - padding),
      y: String(bounds.y - padding),
      width: String(width),
      height: String(height),
      fill: this.svg.classList.contains('theme-dark') ? '#14171c' : '#f6f7f9',
    });
    clone.insertBefore(background, clone.querySelector('.viewport'));

    return new XMLSerializer().serializeToString(clone);
  }

  /** Rasterise the diagram; `scale` 2 gives a retina-quality PNG. */
  async toPNGBlob(scale = 2): Promise<Blob> {
    const svgText = this.toSVGString();
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not rasterise the diagram'));
      image.src = source;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode the PNG'));
      }, 'image/png');
    });
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.svg.remove();
    void this.container;
  }
}

// ------------------------------------------------------------------ drawing

function renderTable(table: Table, box: Rect, foreignKeys: Set<string>): SVGGElement {
  const group = svgEl<SVGGElement>('g', {
    class: 'node node-table',
    'data-id': table.id,
    'data-kind': 'table',
    'data-span': JSON.stringify(table.nameSpan),
    transform: `translate(${box.x} ${box.y})`,
  });

  const headerColor = table.headerColor ?? 'var(--header)';
  group.append(
    svgEl<SVGGElement>('rect', {
      class: 'node-shadow',
      x: '0',
      y: '3',
      width: String(box.width),
      height: String(box.height),
      rx: String(NODE_METRICS.cornerRadius),
    }),
    svgEl('rect', {
      class: 'node-body',
      width: String(box.width),
      height: String(box.height),
      rx: String(NODE_METRICS.cornerRadius),
    }),
    svgEl('path', {
      class: 'node-header',
      fill: headerColor,
      d: topRoundedPath(box.width, NODE_METRICS.headerHeight, NODE_METRICS.cornerRadius),
    }),
  );

  const title = svgEl('text', {
    class: `node-header-text${isLightColor(table.headerColor) ? ' on-light' : ''}`,
    x: String(NODE_METRICS.paddingX),
    y: String(NODE_METRICS.headerHeight / 2 + 5),
  });
  title.textContent = tableLabel(table);
  group.append(title);
  group.append(tooltip(tableTooltip(table)));

  table.columns.forEach((column, index) => {
    group.append(renderColumnRow(column, index, box.width, foreignKeys));
  });

  group.append(outline(box));
  return group;
}

/** Border drawn above the rows so column backgrounds can't cover it. */
function outline(box: Rect): SVGElement {
  return svgEl('rect', {
    class: 'node-outline',
    width: String(box.width),
    height: String(box.height),
    rx: String(NODE_METRICS.cornerRadius),
    'pointer-events': 'none',
  });
}

function renderColumnRow(
  column: Column,
  index: number,
  width: number,
  foreignKeys: Set<string>,
): SVGGElement {
  const y = NODE_METRICS.headerHeight + index * NODE_METRICS.rowHeight;
  const row = svgEl<SVGGElement>('g', {
    class: 'row',
    'data-column-id': column.id,
    'data-span': JSON.stringify(column.span),
    transform: `translate(0 ${y})`,
  });

  row.append(
    svgEl<SVGGElement>('rect', {
      class: 'row-hit',
      width: String(width),
      height: String(NODE_METRICS.rowHeight),
    }),
  );
  if (index > 0) {
    row.append(
      svgEl('line', {
        class: 'row-divider',
        x1: '0',
        y1: '0',
        x2: String(width),
        y2: '0',
      }),
    );
  }

  const name = svgEl('text', {
    class: `col-name${column.pk ? ' is-pk' : ''}`,
    x: String(NODE_METRICS.paddingX),
    y: String(NODE_METRICS.rowHeight / 2 + 4.5),
  });
  name.textContent = column.name;
  row.append(name);

  if (column.pk) {
    const nameWidth = textWidth(column.name, FONTS.columnName);
    const icon = svgEl('path', {
      class: 'key-icon',
      d: KEY_PATH,
      transform: `translate(${NODE_METRICS.paddingX + nameWidth + 6} ${NODE_METRICS.rowHeight / 2 - 3.2})`,
    });
    row.append(icon);
  }

  const type = svgEl('text', {
    class: 'col-type',
    x: String(width - NODE_METRICS.paddingX),
    y: String(NODE_METRICS.rowHeight / 2 + 4),
    'text-anchor': 'end',
  });
  type.textContent = column.type;
  row.append(type);
  row.append(tooltip(columnTooltip(column, foreignKeys)));

  return row;
}

function renderEnum(model: Schema['enums'][number], box: Rect): SVGGElement {
  const group = svgEl<SVGGElement>('g', {
    class: 'node node-enum',
    'data-id': model.id,
    'data-kind': 'enum',
    'data-span': JSON.stringify(model.span),
    transform: `translate(${box.x} ${box.y})`,
  });

  group.append(
    svgEl<SVGGElement>('rect', {
      class: 'node-shadow',
      x: '0',
      y: '3',
      width: String(box.width),
      height: String(box.height),
      rx: String(NODE_METRICS.cornerRadius),
    }),
    svgEl('rect', {
      class: 'node-body',
      width: String(box.width),
      height: String(box.height),
      rx: String(NODE_METRICS.cornerRadius),
    }),
    svgEl('path', {
      class: 'node-header',
      fill: 'var(--enum-header)',
      d: topRoundedPath(box.width, NODE_METRICS.headerHeight, NODE_METRICS.cornerRadius),
    }),
  );

  const title = svgEl('text', {
    class: 'node-header-text',
    x: String(NODE_METRICS.paddingX),
    y: String(NODE_METRICS.headerHeight / 2 + 5),
  });
  title.textContent = `enum ${model.name}`;
  group.append(title);
  if (model.note) group.append(tooltip(model.note));

  model.values.forEach((value, index) => {
    const y = NODE_METRICS.headerHeight + index * NODE_METRICS.rowHeight;
    const row = svgEl<SVGGElement>('g', { class: 'row', transform: `translate(0 ${y})` });
    row.append(
      svgEl<SVGGElement>('rect', {
        class: 'row-hit',
        width: String(box.width),
        height: String(NODE_METRICS.rowHeight),
      }),
    );
    if (index > 0) {
      row.append(
        svgEl('line', { class: 'row-divider', x1: '0', y1: '0', x2: String(box.width), y2: '0' }),
      );
    }
    const label = svgEl('text', {
      class: 'col-name',
      x: String(NODE_METRICS.paddingX),
      y: String(NODE_METRICS.rowHeight / 2 + 4.5),
    });
    label.textContent = value.name;
    row.append(label);
    if (value.note) row.append(tooltip(value.note));
    group.append(row);
  });

  group.append(outline(box));
  return group;
}

function renderNote(note: Schema['stickyNotes'][number], box: Rect): SVGGElement {
  const { lines } = wrapNote(note);
  const group = svgEl<SVGGElement>('g', {
    class: 'node node-note',
    'data-id': note.id,
    'data-kind': 'note',
    'data-span': JSON.stringify(note.span),
    transform: `translate(${box.x} ${box.y})`,
  });

  const fold = 16;
  group.append(
    svgEl<SVGGElement>('path', {
      class: 'note-body',
      style: note.color ? `fill:${note.color}` : '',
      d: [
        `M 0 6`,
        `q 0 -6 6 -6`,
        `H ${box.width - fold}`,
        `L ${box.width} ${fold}`,
        `V ${box.height - 6}`,
        `q 0 6 -6 6`,
        `H 6`,
        `q -6 0 -6 -6`,
        'Z',
      ].join(' '),
    }),
    svgEl('path', {
      class: 'note-fold',
      d: `M ${box.width - fold} 0 L ${box.width} ${fold} H ${box.width - fold} Z`,
    }),
  );

  const title = svgEl('text', {
    class: 'note-title',
    x: String(NODE_METRICS.notePadding),
    y: String(NODE_METRICS.notePadding + 8),
  });
  title.textContent = note.name;
  group.append(title);

  lines.forEach((line, index) => {
    const text = svgEl('text', {
      class: 'note-line',
      x: String(NODE_METRICS.notePadding),
      y: String(NODE_METRICS.notePadding + 30 + index * NODE_METRICS.noteLineHeight),
    });
    text.textContent = line;
    group.append(text);
  });

  return group;
}

function renderGroup(group: Layout['groups'][number]): SVGGElement {
  const element = svgEl<SVGGElement>('g', { class: 'group', 'data-id': group.id });
  const box = svgEl<SVGGElement>('rect', {
    class: 'group-box',
    x: String(group.rect.x),
    y: String(group.rect.y),
    width: String(group.rect.width),
    height: String(group.rect.height),
    rx: '12',
  });
  if (group.color) box.setAttribute('style', `stroke:${group.color}; fill:${group.color}`);
  element.append(box);

  const label = svgEl('text', {
    class: 'group-label',
    x: String(group.rect.x + 14),
    y: String(group.rect.y + 18),
  });
  label.textContent = group.name;
  element.append(label);
  if (group.note) element.append(tooltip(group.note));
  return element;
}

function renderEdge(edge: Edge): SVGGElement {
  const element = svgEl<SVGGElement>('g', {
    class: `edge${edge.kind === 'enum' ? ' is-enum' : ''}`,
    'data-id': edge.id,
  });

  element.append(svgEl('path', { class: 'edge-hit', d: edge.path }));
  const line = svgEl('path', { class: 'edge-line', d: edge.path });
  if (edge.color) line.setAttribute('style', `stroke:${edge.color}`);
  element.append(line);

  for (const anchor of [edge.from, edge.to]) {
    element.append(
      svgEl('circle', {
        class: 'edge-dot',
        cx: String(anchor.point.x),
        cy: String(anchor.point.y),
        r: '3',
      }),
    );
  }

  if (edge.kind === 'relationship') {
    for (const anchor of [edge.from, edge.to]) {
      const label = svgEl('text', {
        class: 'edge-label',
        x: String(anchor.label.x),
        y: String(anchor.label.y),
      });
      label.textContent = anchor.cardinality;
      element.append(label);
    }
  }

  const description =
    edge.kind === 'enum'
      ? 'enum type'
      : `${edge.from.cardinality} → ${edge.to.cardinality}${edge.name ? ` (${edge.name})` : ''}`;
  element.append(tooltip(description));
  return element;
}

function updateEdgeElement(element: SVGGElement, edge: Edge): void {
  const path = polylineToPath(routePoints(edge.from, edge.to));
  element.querySelectorAll('path').forEach((node) => node.setAttribute('d', path));
  const dots = element.querySelectorAll('circle');
  [edge.from, edge.to].forEach((anchor, index) => {
    const dot = dots[index];
    if (dot) {
      dot.setAttribute('cx', String(anchor.point.x));
      dot.setAttribute('cy', String(anchor.point.y));
    }
  });
  const labels = element.querySelectorAll('.edge-label');
  [edge.from, edge.to].forEach((anchor, index) => {
    const label = labels[index];
    if (label) {
      label.setAttribute('x', String(anchor.label.x));
      label.setAttribute('y', String(anchor.label.y));
      label.textContent = anchor.cardinality;
    }
  });
}

function updateGroupElement(element: SVGGElement, rect: Rect): void {
  const box = element.querySelector('rect');
  box?.setAttribute('x', String(rect.x));
  box?.setAttribute('y', String(rect.y));
  box?.setAttribute('width', String(rect.width));
  box?.setAttribute('height', String(rect.height));
  const label = element.querySelector('text');
  label?.setAttribute('x', String(rect.x + 14));
  label?.setAttribute('y', String(rect.y + 18));
}

// ------------------------------------------------------------------- helpers

function tableTooltip(table: Table): string {
  const parts = [tableLabel(table)];
  if (table.alias) parts.push(`alias: ${table.alias}`);
  if (table.note) parts.push(table.note);
  if (table.indexes.length) {
    parts.push(
      `indexes: ${table.indexes
        .map((index) => `(${index.columns.map((column) => column.value).join(', ')})`)
        .join(' ')}`,
    );
  }
  return parts.join('\n');
}

function columnTooltip(column: Column, foreignKeys: Set<string>): string {
  const badges = columnBadges(column, foreignKeys);
  const parts = [`${column.name} ${column.type}`];
  if (badges.length) parts.push(badges.join(', '));
  if (column.default) parts.push(`default: ${column.default.value}`);
  if (column.fromPartial) parts.push(`from partial: ${column.fromPartial}`);
  if (column.note) parts.push(column.note);
  return parts.join('\n');
}

function tooltip(text: string): SVGTitleElement {
  const element = svgEl<SVGTitleElement>('title');
  element.textContent = text;
  return element;
}

function topRoundedPath(width: number, height: number, radius: number): string {
  return [
    `M 0 ${height}`,
    `V ${radius}`,
    `q 0 -${radius} ${radius} -${radius}`,
    `H ${width - radius}`,
    `q ${radius} 0 ${radius} ${radius}`,
    `V ${height}`,
    'Z',
  ].join(' ');
}

/** Header text flips to dark when the author picked a pale header colour. */
function isLightColor(color: string | undefined): boolean {
  if (!color) return false;
  const hex = color.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  if (full.length !== 6) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.65;
}

function svgEl<T extends SVGElement = SVGElement>(
  tag: string,
  attributes: Record<string, string> = {},
): T {
  const element = document.createElementNS(SVG_NS, tag) as T;
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== '') element.setAttribute(name, value);
  }
  return element;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** `public.users.id` -> `public.users` */
function ownerOf(columnId: string): string {
  return columnId.split('.').slice(0, -1).join('.');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function zeroRect(): Rect {
  return { x: 0, y: 0, width: 0, height: 0 };
}
