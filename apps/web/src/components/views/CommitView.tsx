import { api } from '../../api/client';
import { ChangesetView } from '../changeset/ChangesetView';
import { CommitCard } from '../commit/CommitCard';
import { useAsync } from '../../lib/useAsync';
import { useRepoStore } from '../../store/repo';

interface Props {
  repoId: string;
  oid: string;
  parent?: string;
  path?: string;
  revision: number;
}

/** The empty tree, so a root commit still shows its files as additions. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export function CommitView({ repoId, oid, parent, path, revision }: Props) {
  const navigate = useRepoStore((state) => state.navigate);
  const refs = useRepoStore((state) => state.refs);

  const detail = useAsync(() => api.commit(repoId, oid), [repoId, oid, revision]);

  if (detail.error) return <div className="empty-state error">{detail.error}</div>;
  if (!detail.data) return <div className="empty-state">Loading commit…</div>;

  const commit = detail.data.commit;
  const parents = detail.data.parents;
  const from = parent ?? parents[0]?.oid ?? EMPTY_TREE;
  const commitRefs = refs.filter((ref) => ref.targetOid === commit.oid);

  return (
    <ChangesetView
      repoId={repoId}
      from={from}
      to={oid}
      labels={{
        left: parents.find((candidate) => candidate.oid === from)?.shortOid ?? from.slice(0, 8),
        right: commit.shortOid,
      }}
      initialPath={path}
      revision={revision}
      header={
        <div className="changeset-header">
          <CommitCard
            commit={commit}
            refs={commitRefs}
            onSelectParent={(target) => navigate({ kind: 'commit', oid: target })}
          />
          {parents.length > 1 ? (
            <div className="parent-picker">
              <span className="parent-picker-label">Compare against parent</span>
              <div className="segmented">
                {parents.map((candidate, index) => (
                  <button
                    key={candidate.oid}
                    type="button"
                    data-active={candidate.oid === from ? 'yes' : 'no'}
                    onClick={() =>
                      navigate({ kind: 'commit', oid, parent: candidate.oid }, { replace: true })
                    }
                    title={candidate.subject}
                  >
                    #{index + 1} {candidate.shortOid}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
