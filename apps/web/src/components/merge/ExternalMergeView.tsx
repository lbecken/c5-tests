import { useState } from 'react';

import { api } from '../../api/client';
import { MergeResolver } from './MergeResolver';
import { useAsync } from '../../lib/useAsync';
import { useRepoStore } from '../../store/repo';

interface Props {
  base: string;
  local: string;
  remote: string;
  output: string;
  /** Identifies the waiting `git mergetool` invocation, if there is one. */
  intentId?: string;
}

/**
 * Resolve three files handed over by `git mergetool`.
 *
 * The invoking command is blocked until this view reports back, so both exits
 * have to be explicit: saving writes the output file and reports success, and
 * cancelling reports that nothing was written — which is what tells git to keep
 * the conflict markers in place rather than assuming the file is resolved.
 */
export function ExternalMergeView({ base, local, remote, output, intentId }: Props) {
  const navigate = useRepoStore((store) => store.navigate);
  const [finished, setFinished] = useState<'saved' | 'cancelled' | null>(null);

  const conflict = useAsync(
    () => api.mergeFiles({ base, local, remote, output }),
    [base, local, remote, output],
  );

  if (finished) {
    return (
      <div className="empty-state">
        {finished === 'saved' ? 'Resolution written.' : 'Merge cancelled.'}
        <div className="empty-detail">
          {finished === 'saved'
            ? `${output} was written and git was told the merge succeeded.`
            : 'git was told nothing was resolved, so the conflict markers remain.'}
        </div>
        <button type="button" className="button" onClick={() => navigate({ kind: 'working' })}>
          Back to the working copy
        </button>
      </div>
    );
  }

  if (conflict.error) return <div className="empty-state error">{conflict.error}</div>;
  if (!conflict.data) return <div className="empty-state">Loading files…</div>;

  return (
    <div className="merge-view">
      <div className="merge-files">
        <span className="merge-external-label">
          Resolving <code>{output}</code> for git mergetool
        </span>
      </div>
      <MergeResolver
        data={conflict.data}
        saveLabel="Save and finish"
        extraActions={
          <button
            type="button"
            className="button"
            onClick={async () => {
              if (intentId) await api.completeIntent(intentId, false);
              setFinished('cancelled');
            }}
            title="Leave the conflict unresolved"
          >
            Cancel
          </button>
        }
        onSave={async (content) => {
          const written = await api.writeFile(output, content);
          if (!written.ok) return written;
          if (intentId) await api.completeIntent(intentId, true);
          setFinished('saved');
          return written;
        }}
      />
    </div>
  );
}
