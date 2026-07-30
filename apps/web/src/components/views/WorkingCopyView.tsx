import { useState } from 'react';

import { ChangesetView } from '../changeset/ChangesetView';
import { REV_INDEX, REV_WORKTREE } from '../../store/repo';

interface Props {
  repoId: string;
  path?: string;
  revision: number;
}

type Scope = 'all' | 'staged' | 'unstaged';

const SCOPES: Array<{ value: Scope; label: string; hint: string }> = [
  { value: 'all', label: 'All changes', hint: 'HEAD compared with the working copy' },
  { value: 'staged', label: 'Staged', hint: 'HEAD compared with the index' },
  { value: 'unstaged', label: 'Unstaged', hint: 'Index compared with the working copy' },
];

/**
 * What you have changed but not yet committed, as a changeset. The three scopes
 * map onto the three comparisons git can express, named the way people think
 * about them rather than the way the flags are spelled.
 */
export function WorkingCopyView({ repoId, path, revision }: Props) {
  const [scope, setScope] = useState<Scope>('all');

  const range =
    scope === 'staged'
      ? { from: 'HEAD', to: REV_INDEX, left: 'HEAD', right: 'Staged' }
      : scope === 'unstaged'
        ? { from: REV_INDEX, to: REV_WORKTREE, left: 'Staged', right: 'Working copy' }
        : { from: 'HEAD', to: REV_WORKTREE, left: 'HEAD', right: 'Working copy' };

  return (
    <ChangesetView
      key={scope}
      repoId={repoId}
      from={range.from}
      to={range.to}
      labels={{ left: range.left, right: range.right }}
      initialPath={path}
      revision={revision}
      header={
        <div className="changeset-header">
          <div className="segmented full">
            {SCOPES.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={scope === option.value ? 'yes' : 'no'}
                onClick={() => setScope(option.value)}
                title={option.hint}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}
