import { useState } from 'react';

import { api } from '../../api/client';
import { useRepoStore } from '../../store/repo';

interface Props {
  repoId: string;
}

const CONTINUABLE = new Set(['merge', 'rebase', 'rebase-interactive', 'cherry-pick', 'revert']);

/**
 * A standing reminder that the repository is mid-operation, with the two
 * actions that matter. Without this, a half-finished rebase is invisible until
 * something else fails confusingly.
 */
export function OperationBanner({ repoId }: Props) {
  const state = useRepoStore((store) => store.state);
  const refresh = useRepoStore((store) => store.refresh);
  const navigate = useRepoStore((store) => store.navigate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const operation = state?.operation ?? 'none';
  if (operation === 'none' || !CONTINUABLE.has(operation)) return null;

  const family = operation === 'rebase-interactive' ? 'rebase' : operation;
  const conflicts = state?.conflicted.length ?? 0;

  const act = async (action: 'continue' | 'abort' | 'skip'): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.operation(repoId, {
        op: 'operation-action',
        operation: family,
        action,
      });
      if (!result.ok) setError(result.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="operation-banner">
      <div className="operation-banner-text">
        <strong>{label(operation)} in progress</strong>
        {conflicts > 0 ? (
          <button type="button" className="link" onClick={() => navigate({ kind: 'conflicts' })}>
            {conflicts} conflicted {conflicts === 1 ? 'file' : 'files'}
          </button>
        ) : (
          <span className="text-muted">no conflicts remaining</span>
        )}
      </div>
      <div className="operation-banner-actions">
        <button
          type="button"
          className="button"
          disabled={busy || conflicts > 0}
          onClick={() => void act('continue')}
          title={conflicts > 0 ? 'Resolve the conflicts first' : 'Continue'}
        >
          Continue
        </button>
        {family === 'rebase' || family === 'cherry-pick' ? (
          <button type="button" className="button" disabled={busy} onClick={() => void act('skip')}>
            Skip
          </button>
        ) : null}
        <button type="button" className="button" disabled={busy} onClick={() => void act('abort')}>
          Abort
        </button>
      </div>
      {error ? <div className="commit-error">{error}</div> : null}
    </div>
  );
}

function label(operation: string): string {
  switch (operation) {
    case 'rebase-interactive':
      return 'Interactive rebase';
    case 'cherry-pick':
      return 'Cherry-pick';
    default:
      return operation.charAt(0).toUpperCase() + operation.slice(1);
  }
}
