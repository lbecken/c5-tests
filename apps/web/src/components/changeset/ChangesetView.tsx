import { useEffect, useMemo, useState } from 'react';

import type { FileChange } from '@gitscope/core';

import { api } from '../../api/client';
import { FileList } from './FileList';
import { FilePane } from './FilePane';
import { useAsync } from '../../lib/useAsync';
import { useRepoStore } from '../../store/repo';
import { useSettings } from '../../store/settings';

interface Props {
  repoId: string;
  from: string;
  to: string;
  labels: { left: string; right: string };
  /** Path to select on mount, if any. */
  initialPath?: string;
  revision: number;
  /** Extra content shown above the file list, e.g. commit metadata. */
  header?: React.ReactNode;
  onSelectPath?: (path: string) => void;
}

/**
 * Every change between two points, in one place: the file list on the left, the
 * selected file's diff on the right, and the totals in between. Live updates
 * arrive through `revision`, so a changeset that includes the working copy
 * refreshes as you edit without losing your place.
 */
export function ChangesetView({
  repoId,
  from,
  to,
  labels,
  initialPath,
  revision,
  header,
  onSelectPath,
}: Props) {
  const navigate = useRepoStore((state) => state.navigate);
  const [selectedPath, setSelectedPath] = useState<string | undefined>(initialPath);

  // The line counts must be produced by the same algorithm the diff will be
  // rendered with, or the file list disagrees with the file it opens.
  const algorithm = useSettings((state) => state.algorithm);

  const changeset = useAsync(
    () => api.changeset(repoId, from, to, undefined, { algorithm }),
    [repoId, from, to, revision, algorithm],
    { keepPreviousData: true },
  );

  const changes = useMemo(() => changeset.data?.changes ?? [], [changeset.data]);

  // Keep a selection alive across refreshes: prefer the current file, fall back
  // to the requested one, and only then to the first file in the list.
  useEffect(() => {
    if (changes.length === 0) {
      setSelectedPath(undefined);
      return;
    }
    setSelectedPath((current) => {
      if (current && changes.some((change) => change.path === current)) return current;
      if (initialPath && changes.some((change) => change.path === initialPath)) return initialPath;
      return changes[0]!.path;
    });
  }, [changes, initialPath]);

  const selected = changes.find((change) => change.path === selectedPath);

  const select = (change: FileChange): void => {
    setSelectedPath(change.path);
    onSelectPath?.(change.path);
  };

  const totals = changeset.data?.totals;

  return (
    <div className="changeset">
      <aside className="changeset-sidebar">
        {header}
        <div className="changeset-totals">
          {totals ? (
            <>
              <strong>{totals.files}</strong> {totals.files === 1 ? 'file' : 'files'}
              <span className="count-add">+{totals.additions}</span>
              <span className="count-del">−{totals.deletions}</span>
            </>
          ) : (
            'Loading…'
          )}
        </div>
        <FileList
          changes={changes}
          selected={selectedPath}
          onSelect={select}
          onOpenHistory={(path) => navigate({ kind: 'history', path })}
        />
      </aside>

      <section className="changeset-main">
        {changeset.error ? <div className="empty-state error">{changeset.error}</div> : null}
        {!changeset.error && changes.length === 0 && !changeset.loading ? (
          <div className="empty-state">
            No differences between these two points.
            <div className="empty-detail">
              {labels.left} and {labels.right} have identical contents.
            </div>
          </div>
        ) : (
          <FilePane
            repoId={repoId}
            from={from}
            to={to}
            change={selected}
            labels={labels}
            revision={revision}
            onOpenHistory={(path) => navigate({ kind: 'history', path })}
          />
        )}
      </section>
    </div>
  );
}
