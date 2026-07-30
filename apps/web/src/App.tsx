import { useEffect } from 'react';

import { subscribeToEvents } from './api/client';
import { RepoPicker } from './components/RepoPicker';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { ChangesetView } from './components/changeset/ChangesetView';
import { TextCompareView } from './components/compare/TextCompareView';
import { DirectoryCompareView } from './components/directories/DirectoryCompareView';
import { GraphView } from './components/graph/GraphView';
import { FileHistoryView } from './components/history/FileHistoryView';
import { MergeView } from './components/merge/MergeView';
import { CommitView } from './components/views/CommitView';
import { WorkingCopyView } from './components/views/WorkingCopyView';
import { useRepoStore } from './store/repo';
import { applyTheme, useSettings } from './store/settings';

export function App() {
  const repo = useRepoStore((state) => state.repo);
  const view = useRepoStore((state) => state.view);
  const revision = useRepoStore((state) => state.revision);
  const refresh = useRepoStore((state) => state.refresh);
  const theme = useSettings((state) => state.theme);

  useEffect(() => applyTheme(theme), [theme]);

  // Live updates: one subscription per open repository, torn down on change.
  useEffect(() => {
    if (!repo) return;
    return subscribeToEvents([repo.id], (event) => {
      if (event.type === 'repo-changed') void refresh(event.reasons);
    });
  }, [repo, refresh]);

  if (!repo) return <RepoPicker />;

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <ViewSwitch repoId={repo.id} revision={revision} view={view} />
        </main>
      </div>
    </div>
  );
}

function ViewSwitch({
  repoId,
  revision,
  view,
}: {
  repoId: string;
  revision: number;
  view: ReturnType<typeof useRepoStore.getState>['view'];
}) {
  switch (view.kind) {
    case 'working':
      return <WorkingCopyView repoId={repoId} path={view.path} revision={revision} />;
    case 'commit':
      return (
        <CommitView
          repoId={repoId}
          oid={view.oid}
          parent={view.parent}
          path={view.path}
          revision={revision}
        />
      );
    case 'changeset':
      return (
        <ChangesetView
          repoId={repoId}
          from={view.from}
          to={view.to}
          labels={{ left: view.from.slice(0, 8), right: view.to.slice(0, 8) }}
          initialPath={view.path}
          revision={revision}
        />
      );
    case 'history':
      return <FileHistoryView repoId={repoId} path={view.path} revision={revision} />;
    case 'graph':
      return <GraphView repoId={repoId} selected={view.selected} revision={revision} />;
    case 'conflicts':
      return <MergeView repoId={repoId} path={view.path} revision={revision} />;
    case 'compare':
      return <TextCompareView repoId={repoId} left={view.left} right={view.right} />;
    case 'directories':
      return <DirectoryCompareView left={view.left} right={view.right} />;
  }
}
