import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { api } from '../../api/client';
import { ChangesetView } from '../changeset/ChangesetView';
import { GraphLanes } from './GraphLanes';
import { Splitter } from '../Splitter';
import { CommitCard } from '../commit/CommitCard';
import { relativeTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useRepoStore } from '../../store/repo';

interface Props {
  repoId: string;
  selected?: string;
  revision: number;
}

const ROW_HEIGHT = 30;
const LANE_WIDTH = 14;
const PAGE_SIZE = 500;

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

type SearchMode = 'message' | 'content' | 'author';

/**
 * The commit graph as the navigation surface: lanes on the left, refs and
 * subject in the middle, and the selected commit's full changeset below.
 */
export function GraphView({ repoId, selected, revision }: Props) {
  const navigate = useRepoStore((state) => state.navigate);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('message');
  const [activeSearch, setActiveSearch] = useState('');
  const [allRefs, setAllRefs] = useState(true);
  const [active, setActive] = useState<string | undefined>(selected);
  const [detailHeight, setDetailHeight] = useState(360);

  const log = useAsync(
    () =>
      api.log(repoId, {
        limit,
        all: allRefs,
        ...(activeSearch.length > 0
          ? searchMode === 'message'
            ? { grep: activeSearch }
            : searchMode === 'content'
              ? { search: activeSearch }
              : { author: activeSearch }
          : {}),
      }),
    [repoId, limit, allRefs, activeSearch, searchMode, revision],
    { keepPreviousData: true },
  );

  const commits = log.data?.commits ?? [];
  const graph = log.data?.graph ?? [];
  const refsByCommit = useMemo(() => log.data?.refsByCommit ?? {}, [log.data]);

  useEffect(() => {
    if (selected) setActive(selected);
  }, [selected]);

  // Fall back to the newest commit so the detail pane is never blank.
  const activeOid = active && commits.some((commit) => commit.oid === active) ? active : commits[0]?.oid;

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // Bring a commit selected elsewhere (a ref click, a parent link) into view.
  useEffect(() => {
    if (!selected) return;
    const index = commits.findIndex((commit) => commit.oid === selected);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, commits.length]);

  const activeCommit = commits.find((commit) => commit.oid === activeOid);
  const parent = activeCommit?.parents[0] ?? EMPTY_TREE;

  return (
    <div className="graph-view">
      <div className="graph-top">
        <div className="graph-toolbar">
          <form
            className="graph-search"
            onSubmit={(event) => {
              event.preventDefault();
              setActiveSearch(search.trim());
            }}
          >
            <input
              className="input"
              type="search"
              placeholder={
                searchMode === 'message'
                  ? 'Search commit messages…'
                  : searchMode === 'content'
                    ? 'Search changed content…'
                    : 'Search authors…'
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              spellCheck={false}
            />
            <select
              className="select"
              value={searchMode}
              onChange={(event) => setSearchMode(event.target.value as SearchMode)}
            >
              <option value="message">Message</option>
              <option value="content">Content</option>
              <option value="author">Author</option>
            </select>
            <button type="submit" className="button">
              Search
            </button>
            {activeSearch ? (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setSearch('');
                  setActiveSearch('');
                }}
              >
                Clear
              </button>
            ) : null}
          </form>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={allRefs}
              onChange={(event) => setAllRefs(event.target.checked)}
            />
            All branches
          </label>

          <span className="graph-count">
            {commits.length} commit{commits.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="graph-scroll" ref={scrollRef}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const commit = commits[virtualRow.index]!;
              const lanes = graph[virtualRow.index];
              const refs = refsByCommit[commit.oid] ?? [];
              return (
                <button
                  type="button"
                  key={commit.oid}
                  className="graph-row"
                  data-selected={commit.oid === activeOid ? 'yes' : 'no'}
                  style={{ transform: `translateY(${virtualRow.start}px)`, height: ROW_HEIGHT }}
                  onClick={() => setActive(commit.oid)}
                  onDoubleClick={() => navigate({ kind: 'commit', oid: commit.oid })}
                  title={commit.subject}
                >
                  <span
                    className="graph-lane-cell"
                    style={{ width: (log.data?.graphWidth ?? 1) * LANE_WIDTH }}
                  >
                    {lanes ? (
                      <GraphLanes
                        row={lanes}
                        width={log.data?.graphWidth ?? 1}
                        rowHeight={ROW_HEIGHT}
                        laneWidth={LANE_WIDTH}
                      />
                    ) : null}
                  </span>

                  <span className="graph-refs">
                    {refs.map((ref) => (
                      <span key={ref.fullName} className="ref-badge" data-kind={ref.kind}>
                        {ref.name}
                      </span>
                    ))}
                  </span>

                  <span className="graph-subject">{commit.subject || '(no message)'}</span>
                  <span className="graph-author">{commit.author.name}</span>
                  <span className="graph-date">{relativeTime(commit.author.date)}</span>
                  <code className="graph-oid">{commit.shortOid}</code>
                </button>
              );
            })}
          </div>

          {log.loading && commits.length === 0 ? (
            <div className="empty-state small">Loading history…</div>
          ) : null}
          {!log.loading && commits.length === 0 ? (
            <div className="empty-state small">No commits match.</div>
          ) : null}
          {log.data?.hasMore ? (
            <div className="graph-more">
              <button type="button" className="button" onClick={() => setLimit(limit + PAGE_SIZE)}>
                Load {PAGE_SIZE} more
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Splitter
        orientation="vertical"
        size={detailHeight}
        onResize={(next) => setDetailHeight(next)}
        min={120}
        max={900}
      />

      <div className="graph-bottom" style={{ height: detailHeight }}>
        {activeCommit ? (
          <ChangesetView
            key={activeCommit.oid}
            repoId={repoId}
            from={parent}
            to={activeCommit.oid}
            labels={{ left: parent.slice(0, 8), right: activeCommit.shortOid }}
            revision={revision}
            header={
              <div className="changeset-header">
                <CommitCard
                  commit={activeCommit}
                  refs={refsByCommit[activeCommit.oid]}
                  compact
                  onSelectParent={(oid) => setActive(oid)}
                />
              </div>
            }
          />
        ) : (
          <div className="empty-state">Select a commit.</div>
        )}
      </div>
    </div>
  );
}
