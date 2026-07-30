import { useState } from 'react';

import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { useRepoStore } from '../store/repo';

/**
 * Opening screen when no repository is loaded. Offers a typed path and a
 * directory browser, since the web build has no native file dialog; the desktop
 * build replaces this with the system picker.
 */
export function RepoPicker() {
  const openRepo = useRepoStore((state) => state.openRepo);
  const error = useRepoStore((state) => state.error);
  const [path, setPath] = useState('');
  const [browsePath, setBrowsePath] = useState<string | undefined>();

  const listing = useAsync(() => api.browse(browsePath), [browsePath], {
    keepPreviousData: true,
  });

  return (
    <div className="repo-picker">
      <div className="repo-picker-card">
        <h1>Gitscope</h1>
        <p className="text-muted">Open a repository to review, compare and merge.</p>

        <form
          className="repo-picker-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (path.trim().length > 0) void openRepo(path.trim()).catch(() => undefined);
          }}
        >
          <input
            className="input"
            placeholder="/path/to/repository"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            spellCheck={false}
            autoFocus
          />
          <button type="submit" className="button primary">
            Open
          </button>
        </form>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="browser">
          <div className="browser-path">
            <button
              type="button"
              className="link"
              onClick={() => setBrowsePath(listing.data?.parent)}
              disabled={!listing.data || listing.data.parent === listing.data.path}
            >
              ↑ Up
            </button>
            <code>{listing.data?.path ?? '…'}</code>
          </div>
          <div className="browser-list">
            {(listing.data?.entries ?? []).map((entry) => (
              <button
                type="button"
                key={entry.path}
                className="browser-entry"
                data-repo={entry.isRepo ? 'yes' : 'no'}
                onDoubleClick={() => setBrowsePath(entry.path)}
                onClick={() => {
                  if (entry.isRepo) void openRepo(entry.path).catch(() => undefined);
                  else setBrowsePath(entry.path);
                }}
                title={entry.isRepo ? 'Open this repository' : 'Browse'}
              >
                <span className="browser-icon">{entry.isRepo ? '◆' : '▸'}</span>
                {entry.name}
              </button>
            ))}
            {listing.data?.entries.length === 0 ? (
              <div className="empty-state small">No subdirectories here.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
