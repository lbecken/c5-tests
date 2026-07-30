import { useMemo, useState } from 'react';

import type { Ref } from '@gitscope/core';

import { useRepoStore, type View } from '../store/repo';

interface Section {
  title: string;
  kind: Ref['kind'];
}

const SECTIONS: Section[] = [
  { title: 'Branches', kind: 'branch' },
  { title: 'Remotes', kind: 'remote' },
  { title: 'Tags', kind: 'tag' },
];

/** Left rail: the views, then the ref namespace. */
export function Sidebar() {
  const repo = useRepoStore((state) => state.repo);
  const state = useRepoStore((state) => state.state);
  const refs = useRepoStore((state) => state.refs);
  const view = useRepoStore((state) => state.view);
  const navigate = useRepoStore((state) => state.navigate);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(['remote']));
  const [filter, setFilter] = useState('');

  const grouped = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const map = new Map<Ref['kind'], Ref[]>();
    for (const ref of refs) {
      if (needle.length > 0 && !ref.name.toLowerCase().includes(needle)) continue;
      const bucket = map.get(ref.kind) ?? [];
      bucket.push(ref);
      map.set(ref.kind, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => (a.isHead ? -1 : b.isHead ? 1 : a.name.localeCompare(b.name)));
    }
    return map;
  }, [refs, filter]);

  const isActive = (candidate: View['kind']): boolean => view.kind === candidate;
  const conflictCount = state?.conflicted.length ?? 0;

  const toggle = (kind: string): void =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <nav className="sidebar">
      <div className="sidebar-repo">
        <div className="sidebar-repo-name" title={repo?.root}>
          {repo?.name}
        </div>
        <div className="sidebar-repo-branch">
          {state?.head.unborn
            ? 'no commits yet'
            : (state?.head.branch ?? `detached at ${state?.head.oid?.slice(0, 8)}`)}
          {state?.head.ahead ? <span className="track">↑{state.head.ahead}</span> : null}
          {state?.head.behind ? <span className="track">↓{state.head.behind}</span> : null}
        </div>
      </div>

      <div className="sidebar-section">
        <button
          type="button"
          className="sidebar-item"
          data-active={isActive('working') ? 'yes' : 'no'}
          onClick={() => navigate({ kind: 'working' })}
        >
          Working copy
        </button>
        <button
          type="button"
          className="sidebar-item"
          data-active={isActive('graph') ? 'yes' : 'no'}
          onClick={() => navigate({ kind: 'graph' })}
        >
          History
        </button>
        {conflictCount > 0 ? (
          <button
            type="button"
            className="sidebar-item conflict"
            data-active={isActive('conflicts') ? 'yes' : 'no'}
            onClick={() => navigate({ kind: 'conflicts' })}
          >
            Conflicts
            <span className="badge">{conflictCount}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="sidebar-item"
          data-active={isActive('compare') ? 'yes' : 'no'}
          onClick={() => navigate({ kind: 'compare' })}
        >
          Text compare
        </button>
        <button
          type="button"
          className="sidebar-item"
          data-active={isActive('directories') ? 'yes' : 'no'}
          onClick={() => navigate({ kind: 'directories' })}
        >
          Folder compare
        </button>
      </div>

      <div className="sidebar-filter">
        <input
          className="input small"
          type="search"
          placeholder="Filter refs…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="sidebar-refs">
        {SECTIONS.map((section) => {
          const items = grouped.get(section.kind) ?? [];
          if (items.length === 0) return null;
          const isCollapsed = collapsed.has(section.kind) && filter.length === 0;
          return (
            <div key={section.kind} className="sidebar-group">
              <button type="button" className="sidebar-group-title" onClick={() => toggle(section.kind)}>
                <span className="chevron" data-open={isCollapsed ? 'no' : 'yes'}>
                  ▸
                </span>
                {section.title}
                <span className="sidebar-group-count">{items.length}</span>
              </button>
              {!isCollapsed
                ? items.map((ref) => (
                    <button
                      type="button"
                      key={ref.fullName}
                      className="sidebar-ref"
                      data-head={ref.isHead ? 'yes' : 'no'}
                      onClick={() => navigate({ kind: 'graph', selected: ref.targetOid })}
                      title={`${ref.fullName}${ref.subject ? ` — ${ref.subject}` : ''}`}
                    >
                      <span className="sidebar-ref-name">{ref.name}</span>
                      {ref.ahead || ref.behind ? (
                        <span className="track">
                          {ref.ahead ? `↑${ref.ahead}` : ''}
                          {ref.behind ? `↓${ref.behind}` : ''}
                        </span>
                      ) : null}
                    </button>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
