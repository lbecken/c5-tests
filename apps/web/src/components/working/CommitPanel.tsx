import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { useRepoStore } from '../../store/repo';

interface Props {
  repoId: string;
  stagedCount: number;
  /** True when a merge or cherry-pick is waiting to be concluded. */
  concluding: boolean;
}

/**
 * Compose and create a commit. The subject line is measured against the
 * 50-character convention as a hint, never as a restriction — it is a
 * convention, not a rule, and a tool that refuses your commit message is a tool
 * you stop using.
 */
export function CommitPanel({ repoId, stagedCount, concluding }: Props) {
  const refresh = useRepoStore((state) => state.refresh);
  const state = useRepoStore((store) => store.state);
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Amending starts from the existing message rather than a blank box.
  useEffect(() => {
    if (!amend) return;
    let cancelled = false;
    void api
      .log(repoId, { limit: 1 })
      .then((log) => {
        const head = log.commits[0];
        if (!cancelled && head && message.trim().length === 0) {
          setMessage(head.body ? `${head.subject}\n\n${head.body}` : head.subject);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amend, repoId]);

  const subject = message.split('\n', 1)[0] ?? '';
  const canCommit = message.trim().length > 0 && (stagedCount > 0 || amend || concluding) && !busy;

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.operation(repoId, { op: 'commit', message, amend });
      if (!result.ok) {
        setError(result.message);
      } else {
        setMessage('');
        setAmend(false);
        await refresh();
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="commit-panel">
      <textarea
        className="commit-message"
        placeholder={concluding ? `Conclude the ${state?.operation}…` : 'Commit message'}
        value={message}
        spellCheck
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canCommit) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className="commit-panel-foot">
        <label className="checkbox" title="Replace the previous commit">
          <input type="checkbox" checked={amend} onChange={(event) => setAmend(event.target.checked)} />
          Amend
        </label>
        <span className="commit-length" data-long={subject.length > 50 ? 'yes' : 'no'}>
          {subject.length}
        </span>
        <div className="toolbar-spacer" />
        <button
          type="button"
          className="button primary"
          disabled={!canCommit}
          onClick={() => void submit()}
          title={
            stagedCount === 0 && !amend && !concluding
              ? 'Stage something first'
              : 'Commit (⌘⏎)'
          }
        >
          {busy ? 'Committing…' : amend ? 'Amend commit' : `Commit ${stagedCount || ''}`.trim()}
        </button>
      </div>
      {error ? <div className="commit-error">{error}</div> : null}
    </div>
  );
}
