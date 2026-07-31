import { useEffect, useMemo, useState } from 'react';

import type { FileChange, StatusEntry } from '@gitscope/core';

import { api } from '../../api/client';
import { FilePane } from '../changeset/FilePane';
import { CommitPanel } from '../working/CommitPanel';
import { OperationBanner } from '../working/OperationBanner';
import { directoryName, fileName } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { REV_INDEX, REV_WORKTREE, useRepoStore } from '../../store/repo';

interface Props {
  repoId: string;
  path?: string;
  revision: number;
}

/** Which side of the index a selected file is being viewed from. */
type Section = 'staged' | 'unstaged';

interface Selection {
  section: Section;
  path: string;
}

const STATUS_LABEL: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechange: 'T',
  untracked: '?',
  unmerged: '!',
  ignored: 'I',
};

/**
 * The working copy as a staging area: what is staged, what is not, and a
 * commit box — with every file still opening in the same diff view used
 * everywhere else.
 */
export function WorkingCopyView({ repoId, path, revision }: Props) {
  const state = useRepoStore((store) => store.state);
  const refresh = useRepoStore((store) => store.refresh);
  const navigate = useRepoStore((store) => store.navigate);
  const [selection, setSelection] = useState<Selection | null>(
    path ? { section: 'unstaged', path } : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const status = useAsync(() => api.status(repoId), [repoId, revision], {
    keepPreviousData: true,
  });

  const entries = useMemo(() => status.data?.entries ?? [], [status.data]);

  const staged = useMemo(
    () => entries.filter((entry) => entry.indexStatus !== 'unchanged' && !entry.isConflicted),
    [entries],
  );
  const unstaged = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.worktreeStatus !== 'unchanged' &&
          entry.worktreeStatus !== 'ignored' &&
          !entry.isConflicted,
      ),
    [entries],
  );
  const conflicted = useMemo(() => entries.filter((entry) => entry.isConflicted), [entries]);

  // Keep the selection pointing at something that still exists.
  useEffect(() => {
    setSelection((current) => {
      if (current) {
        const pool = current.section === 'staged' ? staged : unstaged;
        if (pool.some((entry) => entry.path === current.path)) return current;
      }
      if (unstaged[0]) return { section: 'unstaged', path: unstaged[0].path };
      if (staged[0]) return { section: 'staged', path: staged[0].path };
      return null;
    });
  }, [staged, unstaged]);

  const run = async (payload: Record<string, unknown> & { op: string }): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.operation(repoId, payload);
      if (!result.ok) setError(result.message);
      await refresh(['index', 'worktree']);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const selectedEntry = selection
    ? (selection.section === 'staged' ? staged : unstaged).find(
        (entry) => entry.path === selection.path,
      )
    : undefined;

  const change: FileChange | undefined = selectedEntry
    ? {
        path: selectedEntry.path,
        oldPath: selectedEntry.oldPath,
        status: (selection!.section === 'staged'
          ? selectedEntry.indexStatus
          : selectedEntry.worktreeStatus) as FileChange['status'],
      }
    : undefined;

  const range =
    selection?.section === 'staged'
      ? { from: 'HEAD', to: REV_INDEX, left: 'HEAD', right: 'Staged' }
      : { from: REV_INDEX, to: REV_WORKTREE, left: 'Staged', right: 'Working copy' };

  return (
    <div className="changeset">
      <aside className="changeset-sidebar">
        <OperationBanner repoId={repoId} />

        {conflicted.length > 0 ? (
          <button
            type="button"
            className="conflict-callout"
            onClick={() => navigate({ kind: 'conflicts' })}
          >
            {conflicted.length} conflicted {conflicted.length === 1 ? 'file' : 'files'} — resolve
          </button>
        ) : null}

        {error ? <div className="commit-error">{error}</div> : null}

        <Section
          title="Staged"
          entries={staged}
          section="staged"
          selection={selection}
          onSelect={setSelection}
          busy={busy}
          actionLabel="Unstage"
          onAction={(paths) => void run({ op: 'unstage', paths })}
          onActionAll={
            staged.length > 0
              ? () => void run({ op: 'unstage', paths: staged.map((entry) => entry.path) })
              : undefined
          }
          statusOf={(entry) => entry.indexStatus}
        />

        <Section
          title="Changed"
          entries={unstaged}
          section="unstaged"
          selection={selection}
          onSelect={setSelection}
          busy={busy}
          actionLabel="Stage"
          onAction={(paths) => void run({ op: 'stage', paths })}
          onActionAll={
            unstaged.length > 0
              ? () => void run({ op: 'stage', paths: unstaged.map((entry) => entry.path) })
              : undefined
          }
          onDiscard={(paths) => {
            // Discarding is the one action here that destroys work.
            const label = paths.length === 1 ? paths[0]! : `${paths.length} files`;
            if (window.confirm(`Discard all uncommitted changes to ${label}? This cannot be undone.`)) {
              void run({ op: 'discard', paths });
            }
          }}
          statusOf={(entry) => entry.worktreeStatus}
        />

        <CommitPanel
          repoId={repoId}
          stagedCount={staged.length}
          concluding={state?.operation === 'merge' || state?.operation === 'cherry-pick'}
        />
      </aside>

      <section className="changeset-main">
        {change ? (
          <FilePane
            repoId={repoId}
            from={range.from}
            to={range.to}
            change={change}
            labels={{ left: range.left, right: range.right }}
            revision={revision}
          />
        ) : (
          <div className="empty-state">
            Nothing to commit.
            <div className="empty-detail">The working copy matches HEAD.</div>
          </div>
        )}
      </section>
    </div>
  );
}

function Section({
  title,
  entries,
  section,
  selection,
  onSelect,
  busy,
  actionLabel,
  onAction,
  onActionAll,
  onDiscard,
  statusOf,
}: {
  title: string;
  entries: readonly StatusEntry[];
  section: Section;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  busy: boolean;
  actionLabel: string;
  onAction: (paths: string[]) => void;
  onActionAll?: () => void;
  onDiscard?: (paths: string[]) => void;
  statusOf: (entry: StatusEntry) => string;
}) {
  return (
    <div className="staging-section">
      <div className="staging-head">
        <span className="staging-title">
          {title} <span className="staging-count">{entries.length}</span>
        </span>
        {onActionAll ? (
          <button type="button" className="link" disabled={busy} onClick={onActionAll}>
            {actionLabel} all
          </button>
        ) : null}
      </div>
      <div className="staging-list">
        {entries.map((entry) => {
          const isSelected = selection?.section === section && selection.path === entry.path;
          const status = statusOf(entry);
          return (
            <div key={entry.path} className="file-entry static" data-selected={isSelected ? 'yes' : 'no'}>
              <button
                type="button"
                className="file-entry-main"
                onClick={() => onSelect({ section, path: entry.path })}
                title={entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
              >
                <span className="file-status" data-status={status}>
                  {STATUS_LABEL[status] ?? '·'}
                </span>
                <span className="file-names">
                  <span className="file-name">{fileName(entry.path)}</span>
                  <span className="file-dir">{directoryName(entry.path)}</span>
                </span>
              </button>
              <span className="file-actions">
                {onDiscard ? (
                  <button
                    type="button"
                    className="icon-button danger"
                    disabled={busy}
                    onClick={() => onDiscard([entry.path])}
                    title="Discard changes to this file"
                  >
                    ⌫
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  onClick={() => onAction([entry.path])}
                  title={`${actionLabel} this file`}
                >
                  {actionLabel === 'Stage' ? '+' : '−'}
                </button>
              </span>
            </div>
          );
        })}
        {entries.length === 0 ? <div className="staging-empty">Nothing here.</div> : null}
      </div>
    </div>
  );
}
