import { useState } from 'react';

import { api } from '../api/client';
import { useRepoStore } from '../store/repo';

interface Props {
  repoId: string;
}

/**
 * Fetch, pull and push, with the ahead/behind counts that tell you whether any
 * of them are worth doing.
 */
export function RemoteActions({ repoId }: Props) {
  const state = useRepoStore((store) => store.state);
  const refresh = useRepoStore((store) => store.refresh);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const head = state?.head;
  const ahead = head?.ahead ?? 0;
  const behind = head?.behind ?? 0;
  const hasUpstream = Boolean(head?.upstream);

  const run = async (name: string, payload: Record<string, unknown> & { op: string }): Promise<void> => {
    setBusy(name);
    setError(undefined);
    try {
      const result = await api.operation(repoId, payload);
      if (!result.ok) setError(result.message);
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="remote-actions">
      <button
        type="button"
        className="button"
        disabled={busy !== null}
        onClick={() => void run('fetch', { op: 'fetch' })}
        title="Fetch all remotes"
      >
        {busy === 'fetch' ? '…' : 'Fetch'}
      </button>
      <button
        type="button"
        className="button"
        disabled={busy !== null || !hasUpstream}
        onClick={() => void run('pull', { op: 'pull' })}
        title={hasUpstream ? 'Pull from the upstream branch' : 'No upstream branch is configured'}
      >
        Pull{behind > 0 ? ` ${behind}` : ''}
      </button>
      <button
        type="button"
        className="button"
        disabled={busy !== null || head?.unborn}
        onClick={() =>
          void run('push', {
            op: 'push',
            // A branch with no upstream needs one; git will not guess.
            setUpstream: !hasUpstream,
            ...(hasUpstream ? {} : { remote: 'origin', branch: head?.branch ?? undefined }),
          })
        }
        title={hasUpstream ? 'Push to the upstream branch' : 'Push and set the upstream branch'}
      >
        Push{ahead > 0 ? ` ${ahead}` : ''}
      </button>
      {error ? (
        <button
          type="button"
          className="remote-error"
          onClick={() => setError(undefined)}
          title={error}
        >
          {error.split('\n')[0]}
        </button>
      ) : null}
    </div>
  );
}
