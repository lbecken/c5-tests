import type { Commit, Ref } from '@gitscope/core';

import { absoluteTime, hashIndex, initials, relativeTime } from '../../lib/format';

interface Props {
  commit: Commit;
  refs?: readonly Ref[];
  compact?: boolean;
  onSelectParent?: (oid: string) => void;
}

const LANE_COUNT = 10;

/**
 * The context that turns a hash into a decision: who changed it, when, why, and
 * what it descends from. Shown beside every changeset and every revision in a
 * file's history.
 */
export function CommitCard({ commit, refs, compact, onSelectParent }: Props) {
  const authorColor = `var(--lane-${hashIndex(commit.author.email, LANE_COUNT)})`;
  const committerDiffers =
    commit.committer.email !== commit.author.email || commit.committer.date !== commit.author.date;

  return (
    <article className="commit-card" data-compact={compact ? 'yes' : 'no'}>
      <header className="commit-card-head">
        <span className="avatar" style={{ background: authorColor }} aria-hidden="true">
          {initials(commit.author.name)}
        </span>
        <div className="commit-card-who">
          <div className="commit-subject">{commit.subject || '(no commit message)'}</div>
          <div className="commit-meta">
            <span className="commit-author">{commit.author.name}</span>
            <span className="dot">·</span>
            <time dateTime={commit.author.date} title={absoluteTime(commit.author.date)}>
              {relativeTime(commit.author.date)}
            </time>
            <span className="dot">·</span>
            <code className="commit-oid" title={commit.oid}>
              {commit.shortOid}
            </code>
          </div>
        </div>
      </header>

      {refs && refs.length > 0 ? (
        <div className="ref-badges">
          {refs.map((ref) => (
            <span key={ref.fullName} className="ref-badge" data-kind={ref.kind} title={ref.fullName}>
              {ref.name}
            </span>
          ))}
        </div>
      ) : null}

      {!compact && commit.body ? <pre className="commit-body">{commit.body}</pre> : null}

      {!compact ? (
        <dl className="commit-details">
          <div>
            <dt>Author</dt>
            <dd>
              {commit.author.name} &lt;{commit.author.email}&gt; — {absoluteTime(commit.author.date)}
            </dd>
          </div>
          {committerDiffers ? (
            <div>
              <dt>Committer</dt>
              <dd>
                {commit.committer.name} &lt;{commit.committer.email}&gt; —{' '}
                {absoluteTime(commit.committer.date)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{commit.parents.length === 1 ? 'Parent' : 'Parents'}</dt>
            <dd>
              {commit.parents.length === 0 ? (
                <span className="text-muted">root commit</span>
              ) : (
                commit.parents.map((parent) => (
                  <button
                    key={parent}
                    type="button"
                    className="link"
                    onClick={() => onSelectParent?.(parent)}
                    title={parent}
                  >
                    {parent.slice(0, 8)}
                  </button>
                ))
              )}
            </dd>
          </div>
        </dl>
      ) : null}
    </article>
  );
}
