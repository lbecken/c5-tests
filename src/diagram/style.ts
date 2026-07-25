/**
 * Diagram styling.
 *
 * These rules live inside the `<svg>` itself rather than the page stylesheet so
 * that an exported SVG is completely self-contained — open the downloaded file
 * anywhere and it looks exactly like the canvas it came from.
 */

export const DIAGRAM_CSS = `
svg.erd {
  --canvas: #f6f7f9;
  --dot: #d9dee6;
  --surface: #ffffff;
  --surface-alt: #fafbfc;
  --border: #d5dbe3;
  --text: #1f2933;
  --muted: #6b7684;
  --accent: #2563eb;
  --accent-soft: #dbe6ff;
  --edge: #93a0b1;
  --header: #4a5a6a;
  --enum-header: #7c5cbf;
  --note-fill: #fff6d6;
  --note-border: #e6d08a;
  --note-text: #5c4a12;
  --group-stroke: #9aa6b6;
  --dim: 0.16;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--canvas);
}
svg.erd.theme-dark {
  --canvas: #14171c;
  --dot: #262c35;
  --surface: #1b1f26;
  --surface-alt: #20252d;
  --border: #2f3742;
  --text: #e6e9ee;
  --muted: #939fae;
  --accent: #6ea8ff;
  --accent-soft: #24344f;
  --edge: #5d6875;
  --header: #3a4756;
  --enum-header: #6b53a6;
  --note-fill: #3a3320;
  --note-border: #6b5f33;
  --note-text: #f0e2b6;
  --group-stroke: #48525f;
  --dim: 0.2;
}

.erd-grid { fill: var(--dot); }

.node-body {
  fill: var(--surface);
  stroke: none;
}
.node-outline {
  fill: none;
  stroke: var(--border);
  stroke-width: 1;
}
.node-header-text { fill: #ffffff; font-size: 14px; font-weight: 600; }
.node-header-text.on-light { fill: #17212b; }
.node-title-count { font-size: 11px; font-weight: 500; opacity: 0.75; }

.row-hit { fill: transparent; }
.node .row:hover .row-hit { fill: var(--surface-alt); }
.col-name { fill: var(--text); font-size: 13px; }
.col-name.is-pk { font-weight: 600; }
.col-type {
  fill: var(--muted);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.row-divider { stroke: var(--border); stroke-width: 1; opacity: 0.6; }
.key-icon { fill: #e2b93b; }
.enum-icon { fill: var(--enum-header); }

.edge-line {
  fill: none;
  stroke: var(--edge);
  stroke-width: 1.6;
  stroke-linecap: round;
}
.edge.is-enum .edge-line { stroke-dasharray: 4 4; opacity: 0.75; }
.edge-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; }
.edge-dot { fill: var(--edge); }
.edge-label {
  fill: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-anchor: middle;
}

.group-box {
  fill: var(--accent-soft);
  fill-opacity: 0.14;
  stroke: var(--group-stroke);
  stroke-width: 1.5;
  stroke-dasharray: 6 5;
}
.group-label { fill: var(--muted); font-size: 12px; font-weight: 600; }

.note-body {
  fill: var(--note-fill);
  stroke: var(--note-border);
  stroke-width: 1;
}
.note-fold { fill: var(--note-border); opacity: 0.45; }
.note-title { fill: var(--note-text); font-size: 12px; font-weight: 700; }
.note-line { fill: var(--note-text); font-size: 12px; }

/* Spotlight: everything unrelated to the selection fades back. */
svg.erd.has-focus .node:not(.is-focus):not(.is-related),
svg.erd.has-focus .edge:not(.is-focus),
svg.erd.has-focus .group { opacity: var(--dim); }

.node.is-focus .node-outline { stroke: var(--accent); stroke-width: 2; }
.node.is-related .node-outline { stroke: var(--accent); stroke-width: 1.5; }
.edge.is-focus .edge-line { stroke: var(--accent); stroke-width: 2.2; }
.edge.is-focus .edge-dot { fill: var(--accent); }
.edge.is-focus .edge-label { fill: var(--accent); }
.row.is-focus .row-hit { fill: var(--accent-soft); }

.node { cursor: grab; }
.node.is-dragging { cursor: grabbing; }
.node-shadow { fill: rgba(15, 23, 42, 0.1); }
svg.erd.theme-dark .node-shadow { fill: rgba(0, 0, 0, 0.35); }

.search-hit .node-outline { stroke: #f59e0b; stroke-width: 2.5; }
`;
