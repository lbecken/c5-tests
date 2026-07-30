import { useRepoStore } from '../store/repo';
import { useSettings, type Theme } from '../store/settings';

const THEMES: Array<{ value: Theme; label: string }> = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Back/forward, the current location, and global preferences. */
export function TitleBar() {
  const view = useRepoStore((state) => state.view);
  const back = useRepoStore((state) => state.back);
  const forward = useRepoStore((state) => state.forward);
  const canGoBack = useRepoStore((state) => state.historyIndex > 0);
  const canGoForward = useRepoStore((state) => state.historyIndex < state.history.length - 1);
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);

  return (
    <header className="title-bar">
      <div className="title-bar-nav">
        <button
          type="button"
          className="icon-button"
          onClick={back}
          disabled={!canGoBack}
          title="Back"
        >
          ‹
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={forward}
          disabled={!canGoForward}
          title="Forward"
        >
          ›
        </button>
      </div>

      <div className="title-bar-location">{describe(view)}</div>

      <div className="title-bar-actions">
        <div className="segmented small">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              data-active={theme === option.value ? 'yes' : 'no'}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function describe(view: ReturnType<typeof useRepoStore.getState>['view']): string {
  switch (view.kind) {
    case 'working':
      return 'Working copy';
    case 'graph':
      return 'History';
    case 'commit':
      return `Commit ${view.oid.slice(0, 8)}`;
    case 'changeset':
      return `${view.from.slice(0, 8)} → ${view.to.slice(0, 8)}`;
    case 'history':
      return `File history — ${view.path}`;
    case 'conflicts':
      return 'Conflicts';
    case 'compare':
      return 'Text compare';
    case 'directories':
      return 'Folder compare';
  }
}
