import { useEffect } from 'react';

import { api, subscribeToEvents } from './api/client';
import { RepoPicker } from './components/RepoPicker';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { ChangesetView } from './components/changeset/ChangesetView';
import { TextCompareView } from './components/compare/TextCompareView';
import { DirectoryCompareView } from './components/directories/DirectoryCompareView';
import { GraphView } from './components/graph/GraphView';
import { FileHistoryView } from './components/history/FileHistoryView';
import { ExternalMergeView } from './components/merge/ExternalMergeView';
import { MergeView } from './components/merge/MergeView';
import { CommitView } from './components/views/CommitView';
import { WorkingCopyView } from './components/views/WorkingCopyView';
import { useRepoStore, type View } from './store/repo';
import { applyTheme, useSettings } from './store/settings';
import type { PendingIntent } from '@gitscope/server/protocol';

export function App() {
  const repo = useRepoStore((state) => state.repo);
  const view = useRepoStore((state) => state.view);
  const revision = useRepoStore((state) => state.revision);
  const refresh = useRepoStore((state) => state.refresh);
  const theme = useSettings((state) => state.theme);

  useEffect(() => applyTheme(theme), [theme]);

  const navigate = useRepoStore((state) => state.navigate);
  const openRepo = useRepoStore((state) => state.openRepo);

  // Live updates plus command-line hand-offs, over the same socket.
  useEffect(() => {
    if (!repo) return;
    return subscribeToEvents([repo.id], (event) => {
      if (event.type === 'repo-changed') {
        void refresh(event.reasons);
      } else if (event.type === 'intent') {
        applyIntent(event.intent, navigate, openRepo);
      }
    });
  }, [repo, refresh, navigate, openRepo]);

  // A hand-off may already be waiting when the window opens, in which case
  // there was no event to hear.
  useEffect(() => {
    void api
      .pendingIntents()
      .then((pending) => {
        const latest = pending[pending.length - 1];
        if (latest) applyIntent(latest, navigate, openRepo);
      })
      .catch(() => undefined);
  }, [navigate, openRepo]);

  if (!repo) return <RepoPicker />;

  const platform = window.gitscopeDesktop?.platform;

  return (
    <div className="app" data-platform={platform}>
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
      return (
        <TextCompareView
          repoId={repoId}
          left={view.left}
          right={view.right}
          leftFile={view.leftFile}
          rightFile={view.rightFile}
        />
      );
    case 'directories':
      return <DirectoryCompareView left={view.left} right={view.right} />;
    case 'file-merge':
      return (
        <ExternalMergeView
          // A second hand-off must start clean rather than inherit the
          // "finished" state of the one before it.
          key={`${view.intentId ?? ''}:${view.output}`}
          base={view.base}
          local={view.local}
          remote={view.remote}
          output={view.output}
          intentId={view.intentId}
        />
      );
  }
}

/** Turn a command-line hand-off into a view. */
function applyIntent(
  intent: PendingIntent,
  navigate: (view: View) => void,
  openRepo: (path: string) => Promise<void>,
): void {
  const payload = intent.payload as Record<string, string>;
  switch (intent.kind) {
    case 'compare-files':
      navigate({ kind: 'compare', leftFile: payload.left, rightFile: payload.right });
      break;
    case 'merge-files':
      navigate({
        kind: 'file-merge',
        base: payload.base ?? '',
        local: payload.local ?? '',
        remote: payload.remote ?? '',
        output: payload.output ?? '',
        intentId: intent.id,
      });
      break;
    case 'open-repo':
      if (payload.path) void openRepo(payload.path).catch(() => undefined);
      break;
  }
}
