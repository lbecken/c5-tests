import { memo, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

import type { FileChange } from '@gitscope/core';

import { directoryName, fileExtension, fileName } from '../../lib/format';

interface Props {
  changes: readonly FileChange[];
  selected?: string;
  onSelect: (change: FileChange) => void;
  onOpenHistory?: (path: string) => void;
}

const STATUS_LABEL: Record<FileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechange: 'T',
  unmerged: '!',
  untracked: '?',
  ignored: 'I',
};

type StatusFilter = 'all' | 'added' | 'modified' | 'deleted' | 'renamed' | 'conflicted';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'modified', label: 'Modified' },
  { value: 'added', label: 'Added' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'renamed', label: 'Renamed' },
  { value: 'conflicted', label: 'Conflicted' },
];

function matchesStatus(change: FileChange, filter: StatusFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'added':
      return change.status === 'added' || change.status === 'untracked';
    case 'renamed':
      return change.status === 'renamed' || change.status === 'copied';
    case 'conflicted':
      return change.status === 'unmerged';
    default:
      return change.status === filter;
  }
}

/**
 * The file list for a changeset, with the three filters that actually get used:
 * what kind of change it was, what type of file it is, and a name search.
 * Filtering happens here rather than server-side so it stays instant.
 */
export const FileList = memo(function FileList({
  changes,
  selected,
  onSelect,
  onOpenHistory,
}: Props) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [extension, setExtension] = useState('all');
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const extensions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const change of changes) {
      const ext = fileExtension(change.path) || '(none)';
      counts.set(ext, (counts.get(ext) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [changes]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return changes.filter((change) => {
      if (!matchesStatus(change, status)) return false;
      if (extension !== 'all' && (fileExtension(change.path) || '(none)') !== extension) return false;
      if (needle.length > 0 && !change.path.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [changes, status, extension, search]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 12,
  });

  return (
    <div className="file-list">
      <div className="file-list-filters">
        <input
          className="input"
          type="search"
          placeholder="Filter by name…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          spellCheck={false}
        />
        <div className="filter-row">
          <select
            className="select"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            aria-label="Filter by change type"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={extension}
            onChange={(event) => setExtension(event.target.value)}
            aria-label="Filter by file type"
          >
            <option value="all">Any type</option>
            {extensions.map(([ext, count]) => (
              <option key={ext} value={ext}>
                {ext} ({count})
              </option>
            ))}
          </select>
        </div>
        {filtered.length !== changes.length ? (
          <div className="filter-summary">
            {filtered.length} of {changes.length} files
          </div>
        ) : null}
      </div>

      <div className="file-list-scroll" ref={scrollRef}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const change = filtered[virtualRow.index]!;
            const isSelected = change.path === selected;
            return (
              <button
                type="button"
                key={change.path}
                className="file-entry"
                data-selected={isSelected ? 'yes' : 'no'}
                style={{ transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size }}
                onClick={() => onSelect(change)}
                onDoubleClick={() => onOpenHistory?.(change.path)}
                title={change.oldPath ? `${change.oldPath} → ${change.path}` : change.path}
              >
                <span className="file-status" data-status={change.status}>
                  {STATUS_LABEL[change.status]}
                </span>
                <span className="file-names">
                  <span className="file-name">{fileName(change.path)}</span>
                  <span className="file-dir">
                    {change.status === 'renamed' && change.oldPath
                      ? `${change.oldPath} → ${directoryName(change.path) || '.'}`
                      : directoryName(change.path)}
                  </span>
                </span>
                <span className="file-counts">
                  {change.isBinary ? (
                    <span className="count-binary">bin</span>
                  ) : (
                    <>
                      {change.additions ? <span className="count-add">+{change.additions}</span> : null}
                      {change.deletions ? <span className="count-del">−{change.deletions}</span> : null}
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state small">No files match these filters.</div>
        ) : null}
      </div>
    </div>
  );
});
