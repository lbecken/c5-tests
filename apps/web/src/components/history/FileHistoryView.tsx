import { useEffect, useMemo, useState } from 'react';

import { api } from '../../api/client';
import { CommitCard } from '../commit/CommitCard';
import { FilePane } from '../changeset/FilePane';
import { fileName, relativeTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { REV_WORKTREE, useRepoStore } from '../../store/repo';

interface Props {
  repoId: string;
  path: string;
  revision: number;
}

interface Selection {
  /** Older side of the comparison. */
  from: string;
  fromLabel: string;
  fromPath: string;
  /** Newer side. */
  to: string;
  toLabel: string;
  toPath: string;
}

const WORKING_COPY = '__working__';

/**
 * Every revision of one file, with any two of them comparable.
 *
 * Clicking a revision compares it against the revision immediately older in
 * this list, which is what you want nine times out of ten. Pinning one revision
 * and clicking another compares exactly those two — including across renames,
 * because each entry carries the path the file had at that commit.
 */
export function FileHistoryView({ repoId, path, revision }: Props) {
  const navigate = useRepoStore((state) => state.navigate);
  const [pinned, setPinned] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const history = useAsync(
    () => api.history(repoId, path, { limit: 200 }),
    [repoId, path, revision],
    { keepPreviousData: true },
  );

  const entries = history.data?.entries ?? [];

  useEffect(() => {
    setPinned(null);
    setActive(null);
  }, [path]);

  const pathAt = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) map.set(entry.commit.oid, entry.path);
    return map;
  }, [entries]);

  const selection = useMemo<Selection | null>(() => {
    if (entries.length === 0) return null;
    const activeOid = active ?? WORKING_COPY;

    const resolve = (oid: string): { rev: string; label: string; path: string } => {
      if (oid === WORKING_COPY) {
        return { rev: REV_WORKTREE, label: 'Working copy', path };
      }
      const entry = entries.find((candidate) => candidate.commit.oid === oid);
      return {
        rev: oid,
        label: entry ? `${entry.commit.shortOid} ${entry.commit.subject}` : oid.slice(0, 8),
        path: pathAt.get(oid) ?? path,
      };
    };

    if (pinned && pinned !== activeOid) {
      // Order the pair oldest-first so the diff always reads forward in time.
      const order = [WORKING_COPY, ...entries.map((entry) => entry.commit.oid)];
      const pinnedIndex = order.indexOf(pinned);
      const activeIndex = order.indexOf(activeOid);
      const [olderOid, newerOid] =
        pinnedIndex > activeIndex ? [pinned, activeOid] : [activeOid, pinned];
      const older = resolve(olderOid);
      const newer = resolve(newerOid);
      return {
        from: older.rev,
        fromLabel: older.label,
        fromPath: older.path,
        to: newer.rev,
        toLabel: newer.label,
        toPath: newer.path,
      };
    }

    if (activeOid === WORKING_COPY) {
      const head = entries[0];
      if (!head) return null;
      return {
        from: head.commit.oid,
        fromLabel: `${head.commit.shortOid} ${head.commit.subject}`,
        fromPath: pathAt.get(head.commit.oid) ?? path,
        to: REV_WORKTREE,
        toLabel: 'Working copy',
        toPath: path,
      };
    }

    const index = entries.findIndex((entry) => entry.commit.oid === activeOid);
    const entry = entries[index];
    if (!entry) return null;
    const older = entries[index + 1];
    return {
      from: older ? older.commit.oid : `${entry.commit.oid}^`,
      fromLabel: older ? `${older.commit.shortOid} ${older.commit.subject}` : 'Parent commit',
      fromPath: older ? older.path : entry.oldPath ?? entry.path,
      to: entry.commit.oid,
      toLabel: `${entry.commit.shortOid} ${entry.commit.subject}`,
      toPath: entry.path,
    };
  }, [entries, active, pinned, path, pathAt]);

  const activeEntry = entries.find((entry) => entry.commit.oid === active);

  return (
    <div className="history-view">
      <aside className="history-sidebar">
        <div className="pane-header">
          <div className="pane-title" title={path}>
            {fileName(path)}
          </div>
          <div className="pane-subtitle">{path}</div>
        </div>

        <div className="history-hint">
          {pinned ? (
            <>
              Comparing against a pinned revision.
              <button type="button" className="link" onClick={() => setPinned(null)}>
                Clear
              </button>
            </>
          ) : (
            'Click a revision to compare it with the one below. Shift-click to pin one side.'
          )}
        </div>

        <div className="history-list">
          <button
            type="button"
            className="history-entry"
            data-selected={(active ?? WORKING_COPY) === WORKING_COPY ? 'yes' : 'no'}
            data-pinned={pinned === WORKING_COPY ? 'yes' : 'no'}
            onClick={(event) => {
              if (event.shiftKey) setPinned(WORKING_COPY);
              else setActive(null);
            }}
          >
            <span className="history-subject">Working copy</span>
            <span className="history-meta">uncommitted changes</span>
          </button>

          {entries.map((entry) => (
            <button
              type="button"
              key={entry.commit.oid}
              className="history-entry"
              data-selected={active === entry.commit.oid ? 'yes' : 'no'}
              data-pinned={pinned === entry.commit.oid ? 'yes' : 'no'}
              onClick={(event) => {
                if (event.shiftKey) setPinned(entry.commit.oid);
                else setActive(entry.commit.oid);
              }}
              title={entry.commit.subject}
            >
              <span className="history-subject">
                {entry.status.startsWith('R') ? <span className="rename-chip">renamed</span> : null}
                {entry.status.startsWith('A') ? <span className="add-chip">added</span> : null}
                {entry.commit.subject || '(no message)'}
              </span>
              <span className="history-meta">
                {entry.commit.author.name} · {relativeTime(entry.commit.author.date)} ·{' '}
                <code>{entry.commit.shortOid}</code>
              </span>
              {entry.path !== path ? <span className="history-path">{entry.path}</span> : null}
            </button>
          ))}

          {history.loading && entries.length === 0 ? (
            <div className="empty-state small">Loading history…</div>
          ) : null}
          {!history.loading && entries.length === 0 ? (
            <div className="empty-state small">No commits touched this file.</div>
          ) : null}
        </div>
      </aside>

      <section className="history-main">
        {activeEntry ? (
          <div className="history-commit">
            <CommitCard
              commit={activeEntry.commit}
              onSelectParent={(oid) => navigate({ kind: 'commit', oid })}
            />
          </div>
        ) : null}

        {selection ? (
          <FilePane
            repoId={repoId}
            from={selection.from}
            to={selection.to}
            change={{
              path: selection.toPath,
              oldPath: selection.fromPath !== selection.toPath ? selection.fromPath : undefined,
              status: selection.fromPath !== selection.toPath ? 'renamed' : 'modified',
            }}
            labels={{ left: selection.fromLabel, right: selection.toLabel }}
            revision={revision}
          />
        ) : (
          <div className="empty-state">Select a revision.</div>
        )}
      </section>
    </div>
  );
}
