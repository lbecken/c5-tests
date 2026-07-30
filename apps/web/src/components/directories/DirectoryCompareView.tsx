import { useMemo, useState } from 'react';

import { buildTextDiff, splitLines } from '@gitscope/core/diff';
import type { TreeCompareEntry } from '@gitscope/server/protocol';

import { DiffView } from '../diff/DiffView';
import { api } from '../../api/client';
import { formatBytes } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useSettings } from '../../store/settings';

interface Props {
  left?: string;
  right?: string;
}

type StatusFilter = 'all' | 'differences' | 'added' | 'removed' | 'modified';

/**
 * Compare two folder trees, with the same diff view used everywhere else for
 * whatever file is selected, and copy-across in either direction.
 */
export function DirectoryCompareView({ left: initialLeft, right: initialRight }: Props) {
  const [left, setLeft] = useState(initialLeft ?? '');
  const [right, setRight] = useState(initialRight ?? '');
  const [submitted, setSubmitted] = useState<{ left: string; right: string } | null>(
    initialLeft && initialRight ? { left: initialLeft, right: initialRight } : null,
  );
  const [selected, setSelected] = useState<TreeCompareEntry | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('differences');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);
  const options = useSettings((state) => state.diffOptions);

  const comparison = useAsync(
    () => api.compareDirectories(submitted!.left, submitted!.right),
    [submitted?.left, submitted?.right, nonce],
    { enabled: submitted !== null, keepPreviousData: true },
  );

  const visible = useMemo(
    () => flatten(comparison.data?.entries ?? [], expanded, filter, 0),
    [comparison.data, expanded, filter],
  );

  const fileContents = useAsync(
    async () => {
      if (!selected || selected.type !== 'blob' || !submitted) return null;
      const read = async (root: string, exists: boolean): Promise<string> => {
        if (!exists) return '';
        try {
          const blob = await api.readFsFile(`${root}/${selected.path}`);
          return blob.text ?? '';
        } catch {
          return '';
        }
      };
      const [a, b] = await Promise.all([
        read(submitted.left, selected.status !== 'added'),
        read(submitted.right, selected.status !== 'removed'),
      ]);
      return { a, b };
    },
    [selected?.path, selected?.status, submitted?.left, submitted?.right, nonce],
    { enabled: selected?.type === 'blob' },
  );

  const diff = useMemo(() => {
    if (!fileContents.data) return undefined;
    const a = splitLines(fileContents.data.a);
    const b = splitLines(fileContents.data.b);
    return buildTextDiff(a.lines, b.lines, options(), a.noFinalNewline, b.noFinalNewline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileContents.data]);

  const copy = async (entry: TreeCompareEntry, direction: 'to-right' | 'to-left'): Promise<void> => {
    if (!submitted) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await api.copyPath({
        left: submitted.left,
        right: submitted.right,
        path: entry.path,
        direction,
      });
      setMessage(result.message);
      if (result.ok) setNonce((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dir-compare">
      <form
        className="dir-inputs"
        onSubmit={(event) => {
          event.preventDefault();
          if (left.trim() && right.trim()) {
            setSubmitted({ left: left.trim(), right: right.trim() });
            setSelected(null);
          }
        }}
      >
        <input
          className="input"
          placeholder="Left folder"
          value={left}
          spellCheck={false}
          onChange={(event) => setLeft(event.target.value)}
        />
        <input
          className="input"
          placeholder="Right folder"
          value={right}
          spellCheck={false}
          onChange={(event) => setRight(event.target.value)}
        />
        <button type="submit" className="button primary">
          Compare
        </button>
      </form>

      {comparison.error ? <div className="empty-state error">{comparison.error}</div> : null}
      {message ? <div className="dir-message">{message}</div> : null}

      {comparison.data ? (
        <div className="dir-body">
          <div className="dir-tree">
            <div className="dir-tree-head">
              <select
                className="select"
                value={filter}
                onChange={(event) => setFilter(event.target.value as StatusFilter)}
              >
                <option value="differences">Differences only</option>
                <option value="all">Everything</option>
                <option value="modified">Modified</option>
                <option value="added">Only on the right</option>
                <option value="removed">Only on the left</option>
              </select>
              <span className="dir-totals">
                <span className="count-add">+{comparison.data.totals.added}</span>
                <span className="count-del">−{comparison.data.totals.removed}</span>
                <span className="count-mod">~{comparison.data.totals.modified}</span>
                <span className="text-muted">{comparison.data.totals.same} identical</span>
              </span>
            </div>

            <div className="dir-tree-list">
              {visible.map(({ entry, depth }) => (
                <div
                  key={entry.path}
                  className="dir-entry"
                  data-status={entry.status}
                  data-selected={selected?.path === entry.path ? 'yes' : 'no'}
                >
                  <button
                    type="button"
                    className="dir-entry-main"
                    style={{ paddingLeft: 8 + depth * 14 }}
                    onClick={() => {
                      if (entry.type === 'tree') {
                        setExpanded((previous) => {
                          const next = new Set(previous);
                          if (next.has(entry.path)) next.delete(entry.path);
                          else next.add(entry.path);
                          return next;
                        });
                      } else {
                        setSelected(entry);
                      }
                    }}
                    title={entry.path}
                  >
                    <span className="dir-icon">
                      {entry.type === 'tree' ? (expanded.has(entry.path) ? '▾' : '▸') : '·'}
                    </span>
                    <span className="dir-name">{entry.name}</span>
                    <span className="dir-size">
                      {entry.type === 'blob'
                        ? entry.status === 'added'
                          ? formatBytes(entry.rightSize ?? 0)
                          : entry.status === 'removed'
                            ? formatBytes(entry.leftSize ?? 0)
                            : `${formatBytes(entry.leftSize ?? 0)} → ${formatBytes(entry.rightSize ?? 0)}`
                        : ''}
                    </span>
                  </button>
                  {entry.status !== 'same' ? (
                    <span className="dir-actions">
                      <button
                        type="button"
                        className="icon-button"
                        disabled={busy || entry.status === 'added'}
                        onClick={() => void copy(entry, 'to-right')}
                        title="Copy to the right folder"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={busy || entry.status === 'removed'}
                        onClick={() => void copy(entry, 'to-left')}
                        title="Copy to the left folder"
                      >
                        ←
                      </button>
                    </span>
                  ) : null}
                </div>
              ))}
              {visible.length === 0 ? (
                <div className="empty-state small">
                  {filter === 'differences' ? 'These folders are identical.' : 'Nothing to show.'}
                </div>
              ) : null}
            </div>
          </div>

          <div className="dir-preview">
            {selected && diff ? (
              <DiffView
                diff={diff}
                language="plaintext"
                labels={{
                  left: `${comparison.data.left}/${selected.path}`,
                  right: `${comparison.data.right}/${selected.path}`,
                }}
              />
            ) : (
              <div className="empty-state">Select a file to see how the two copies differ.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="empty-state">Enter two folders to compare.</div>
      )}
    </div>
  );
}

/** Depth-first flatten of the tree, applying the current filter. */
function flatten(
  entries: readonly TreeCompareEntry[],
  expanded: ReadonlySet<string>,
  filter: StatusFilter,
  depth: number,
): Array<{ entry: TreeCompareEntry; depth: number }> {
  const out: Array<{ entry: TreeCompareEntry; depth: number }> = [];
  for (const entry of entries) {
    const keep =
      filter === 'all' ||
      (filter === 'differences' ? entry.status !== 'same' : entry.status === filter);
    if (entry.type === 'tree') {
      const children = flatten(entry.children ?? [], expanded, filter, depth + 1);
      // Hide a directory entirely when nothing inside it survives the filter.
      if (children.length === 0 && !keep) continue;
      out.push({ entry, depth });
      if (expanded.has(entry.path)) out.push(...children);
    } else if (keep) {
      out.push({ entry, depth });
    }
  }
  return out;
}
