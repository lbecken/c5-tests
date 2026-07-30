import { useEffect, useRef } from 'react';

import type { FileChange } from '@gitscope/core';

import { api } from '../../api/client';
import { DiffView, type DiffViewHandle } from '../diff/DiffView';
import { formatBytes } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useRepoStore } from '../../store/repo';
import { useSettings } from '../../store/settings';

interface Props {
  repoId: string;
  from: string;
  to: string;
  change?: FileChange;
  labels: { left: string; right: string };
  /** Bumped by the caller when the repository changes, to refetch. */
  revision: number;
  onOpenHistory?: (path: string) => void;
}

/**
 * The diff for one file, with the toolbar that governs how it is displayed.
 * Kept separate from the changeset so switching files re-renders only this
 * side of the split.
 */
export function FilePane({ repoId, from, to, change, labels, revision, onOpenHistory }: Props) {
  const diffMode = useSettings((state) => state.diffMode);
  const setDiffMode = useSettings((state) => state.setDiffMode);
  const whitespace = useSettings((state) => state.whitespace);
  const setWhitespace = useSettings((state) => state.setWhitespace);
  const showWhitespace = useSettings((state) => state.showWhitespace);
  const setShowWhitespace = useSettings((state) => state.setShowWhitespace);
  const context = useSettings((state) => state.context);
  const setContext = useSettings((state) => state.setContext);
  const navigate = useRepoStore((state) => state.navigate);
  const viewRef = useRef<DiffViewHandle>(null);

  const result = useAsync(
    () =>
      api.diff(
        repoId,
        {
          from,
          to,
          path: change!.path,
          oldPath: change!.oldPath,
          status: change!.status,
        },
        { whitespace, context },
      ),
    [repoId, from, to, change?.path, change?.status, whitespace, context, revision],
    { enabled: change !== undefined, keepPreviousData: false },
  );

  // Alt+Down / Alt+Up walk the changes without touching the mouse, matching the
  // muscle memory of every other diff tool.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        viewRef.current?.nextChange();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        viewRef.current?.previousChange();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!change) {
    return <div className="empty-state">Select a file to see its changes.</div>;
  }

  const diff = result.data;

  return (
    <div className="file-pane">
      <div className="file-pane-header">
        <div className="file-pane-title">
          <span className="file-pane-path" title={change.path}>
            {change.oldPath && change.oldPath !== change.path ? (
              <>
                <span className="path-old">{change.oldPath}</span>
                <span className="path-arrow">→</span>
              </>
            ) : null}
            {change.path}
          </span>
          {diff?.diff ? (
            <span className="file-pane-stats">
              <span className="count-add">+{diff.diff.stats.additions}</span>
              <span className="count-del">−{diff.diff.stats.deletions}</span>
            </span>
          ) : null}
        </div>

        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Diff layout">
            <button
              type="button"
              data-active={diffMode === 'split' ? 'yes' : 'no'}
              onClick={() => setDiffMode('split')}
              title="Side by side"
            >
              Split
            </button>
            <button
              type="button"
              data-active={diffMode === 'unified' ? 'yes' : 'no'}
              onClick={() => setDiffMode('unified')}
              title="Unified"
            >
              Unified
            </button>
          </div>

          <select
            className="select"
            value={whitespace}
            onChange={(event) => setWhitespace(event.target.value as typeof whitespace)}
            title="Whitespace handling"
          >
            <option value="none">Whitespace: exact</option>
            <option value="change">Ignore amount</option>
            <option value="leading">Ignore leading</option>
            <option value="trailing">Ignore trailing</option>
            <option value="all">Ignore all</option>
          </select>

          <select
            className="select"
            value={String(context)}
            onChange={(event) => setContext(Number(event.target.value))}
            title="Lines of context kept around each change"
          >
            <option value="0">0 context</option>
            <option value="3">3 context</option>
            <option value="8">8 context</option>
            <option value="25">25 context</option>
            <option value="100000">Full file</option>
          </select>

          <button
            type="button"
            className="icon-button"
            data-active={showWhitespace ? 'yes' : 'no'}
            onClick={() => setShowWhitespace(!showWhitespace)}
            title="Show trailing whitespace"
          >
            ␣
          </button>

          <div className="toolbar-spacer" />

          <button
            type="button"
            className="button"
            onClick={() => viewRef.current?.previousChange()}
            title="Previous change (Alt+Up)"
          >
            ↑
          </button>
          <button
            type="button"
            className="button"
            onClick={() => viewRef.current?.nextChange()}
            title="Next change (Alt+Down)"
          >
            ↓
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              onOpenHistory
                ? onOpenHistory(change.path)
                : navigate({ kind: 'history', path: change.path })
            }
            title="Show every revision of this file"
          >
            File history
          </button>
        </div>
      </div>

      {result.error ? <div className="empty-state error">{result.error}</div> : null}
      {result.loading && !diff ? <div className="empty-state">Loading diff…</div> : null}

      {diff && diff.kind === 'text' && diff.diff ? (
        diff.diff.rows.length === 0 ? (
          <div className="empty-state">This file is empty on both sides.</div>
        ) : diff.diff.stats.additions === 0 && diff.diff.stats.deletions === 0 ? (
          <div className="empty-state">
            No differences with the current settings.
            {whitespace !== 'none' ? ' Whitespace changes are being ignored.' : ''}
          </div>
        ) : (
          <DiffView
            ref={viewRef}
            diff={diff.diff}
            language={diff.language ?? 'plaintext'}
            labels={labels}
          />
        )
      ) : null}

      {diff && diff.kind === 'binary' ? (
        <div className="empty-state">
          Binary file.
          <div className="empty-detail">
            {formatBytes(diff.oldSize ?? 0)} → {formatBytes(diff.newSize ?? 0)}
          </div>
        </div>
      ) : null}
      {diff && diff.kind === 'too-large' ? (
        <div className="empty-state">This file is too large to diff line by line.</div>
      ) : null}
      {diff && diff.kind === 'missing' ? (
        <div className="empty-state">This file does not exist on either side.</div>
      ) : null}
    </div>
  );
}
