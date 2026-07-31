import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { MergeResolver } from './MergeResolver';
import { fileName } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useRepoStore } from '../../store/repo';

interface Props {
  repoId: string;
  path?: string;
  revision: number;
}

/** Conflict resolution for the files git has left unmerged in this repository. */
export function MergeView({ repoId, path, revision }: Props) {
  const state = useRepoStore((store) => store.state);
  const refresh = useRepoStore((store) => store.refresh);
  const conflicted = state?.conflicted ?? [];
  const [selected, setSelected] = useState<string | undefined>(path ?? conflicted[0]);

  useEffect(() => {
    if (!selected || !conflicted.includes(selected)) setSelected(conflicted[0]);
  }, [conflicted, selected]);

  // Only ask for a file that is still conflicted. After a resolution the state
  // refresh and this component's effects settle a render apart, and requesting
  // a file git no longer considers conflicted would surface a 404 as an error
  // exactly when the user has just succeeded.
  const stillConflicted = selected !== undefined && conflicted.includes(selected);
  const conflict = useAsync(() => api.conflict(repoId, selected!), [repoId, selected, revision], {
    enabled: stillConflicted,
  });

  if (conflicted.length === 0) {
    return (
      <div className="empty-state">
        Nothing is conflicted.
        <div className="empty-detail">
          {state?.operation === 'none'
            ? 'There is no merge, rebase or cherry-pick in progress.'
            : `A ${state?.operation} is in progress but every file is resolved.`}
        </div>
      </div>
    );
  }

  return (
    <div className="merge-view">
      <div className="merge-files">
        {conflicted.map((candidate) => (
          <button
            type="button"
            key={candidate}
            className="merge-file"
            data-selected={candidate === selected ? 'yes' : 'no'}
            onClick={() => setSelected(candidate)}
            title={candidate}
          >
            {fileName(candidate)}
          </button>
        ))}
      </div>

      {conflict.error ? <div className="empty-state error">{conflict.error}</div> : null}
      {!conflict.data && !conflict.error ? (
        <div className="empty-state">Loading conflict…</div>
      ) : null}

      {conflict.data ? (
        <MergeResolver
          key={conflict.data.path}
          data={conflict.data}
          onSave={async (content) => {
            const result = await api.operation(repoId, {
              op: 'resolve',
              path: selected!,
              content,
            });
            if (result.ok) await refresh(['index', 'worktree']);
            return result;
          }}
        />
      ) : null}
    </div>
  );
}
