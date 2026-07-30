import { useEffect, useMemo, useState } from 'react';

import { buildTextDiff } from '@gitscope/core/diff';
import type { MergeRegion } from '@gitscope/core/merge';

import { api } from '../../api/client';
import { CommitCard } from '../commit/CommitCard';
import { DiffView } from '../diff/DiffView';
import { highlightLines } from '../../lib/highlight';
import { fileName } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useRepoStore } from '../../store/repo';

interface Props {
  repoId: string;
  path?: string;
  revision: number;
}

type Choice = 'ours' | 'theirs' | 'ours-theirs' | 'theirs-ours' | 'base' | 'custom';

interface Resolution {
  choice: Choice;
  /** Only set when `choice` is `custom`. */
  text?: string;
}

/**
 * Three-way merge.
 *
 * The three stages are shown side by side, but the part that actually resolves
 * a conflict is the context above them: which commits each side contributed
 * since the merge base, and what each side did to the *same* base text. A
 * conflict is a disagreement between two intentions, and you cannot pick a
 * winner without seeing both.
 */
export function MergeView({ repoId, path, revision }: Props) {
  const state = useRepoStore((store) => store.state);
  const refresh = useRepoStore((store) => store.refresh);
  const conflicted = state?.conflicted ?? [];
  const [selected, setSelected] = useState<string | undefined>(path ?? conflicted[0]);
  const [resolutions, setResolutions] = useState<Map<number, Resolution>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [showContext, setShowContext] = useState(true);
  const [sideDiff, setSideDiff] = useState<'none' | 'ours' | 'theirs'>('none');

  useEffect(() => {
    if (!selected || !conflicted.includes(selected)) setSelected(conflicted[0]);
  }, [conflicted, selected]);

  // Only ask for a file that is still conflicted. After a resolution the state
  // refresh and this component's effects settle a render apart, and requesting
  // a file git no longer considers conflicted would surface a 404 as an error
  // exactly when the user has just succeeded.
  const stillConflicted = selected !== undefined && conflicted.includes(selected);
  const conflict = useAsync(
    () => api.conflict(repoId, selected!),
    [repoId, selected, revision],
    { enabled: stillConflicted },
  );

  // A new file means new region indices; carrying resolutions across would
  // silently apply one file's choices to another.
  useEffect(() => {
    setResolutions(new Map());
    setSaveError(undefined);
  }, [selected]);

  const data = conflict.data;

  const highlighted = useMemo(() => {
    if (!data) return { ours: [], theirs: [], base: [] };
    const language = guessLanguage(data.path);
    return {
      ours: highlightLines(data.ours, language),
      theirs: highlightLines(data.theirs, language),
      base: highlightLines(data.base, language),
    };
  }, [data]);

  const linesFor = (region: MergeRegion, resolution: Resolution | undefined): string[] => {
    if (!data) return [];
    const ours = data.ours.slice(region.oursStart, region.oursEnd);
    const theirs = data.theirs.slice(region.theirsStart, region.theirsEnd);
    const base = data.base.slice(region.baseStart, region.baseEnd);

    if (region.kind === 'stable') return base;
    if (region.kind === 'ours' || region.kind === 'both') return ours;
    if (region.kind === 'theirs') return theirs;

    switch (resolution?.choice) {
      case 'ours':
        return ours;
      case 'theirs':
        return theirs;
      case 'ours-theirs':
        return [...ours, ...theirs];
      case 'theirs-ours':
        return [...theirs, ...ours];
      case 'base':
        return base;
      case 'custom':
        return (resolution.text ?? '').split('\n');
      default:
        return [];
    }
  };

  const unresolved = useMemo(() => {
    if (!data) return 0;
    let count = 0;
    data.regions.forEach((region, index) => {
      if (region.kind === 'conflict' && !resolutions.has(index)) count++;
    });
    return count;
  }, [data, resolutions]);

  const resolvedText = useMemo(() => {
    if (!data) return '';
    const out: string[] = [];
    data.regions.forEach((region, index) => {
      out.push(...linesFor(region, resolutions.get(index)));
    });
    return out.length > 0 ? `${out.join('\n')}\n` : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, resolutions]);

  const choose = (index: number, choice: Choice, text?: string): void => {
    setResolutions((previous) => {
      const next = new Map(previous);
      next.set(index, { choice, text });
      return next;
    });
  };

  const resolveAll = (choice: Choice): void => {
    if (!data) return;
    setResolutions(() => {
      const next = new Map<number, Resolution>();
      data.regions.forEach((region, index) => {
        if (region.kind === 'conflict') next.set(index, { choice });
      });
      return next;
    });
  };

  const save = async (): Promise<void> => {
    if (!selected) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const result = await api.operation(repoId, {
        op: 'resolve',
        path: selected,
        content: resolvedText,
      });
      if (!result.ok) setSaveError(result.message);
      else await refresh(['index', 'worktree']);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

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
      {!data && !conflict.error ? <div className="empty-state">Loading conflict…</div> : null}

      {data ? (
        <>
          <div className="merge-toolbar">
            <span className="merge-status" data-clean={unresolved === 0 ? 'yes' : 'no'}>
              {unresolved === 0
                ? 'All conflicts resolved'
                : `${unresolved} of ${data.conflictCount} conflicts left`}
            </span>
            <div className="toolbar-spacer" />
            <button type="button" className="button" onClick={() => resolveAll('ours')}>
              Take all {data.labels.ours}
            </button>
            <button type="button" className="button" onClick={() => resolveAll('theirs')}>
              Take all {data.labels.theirs}
            </button>
            <button
              type="button"
              className="button"
              data-active={showContext ? 'yes' : 'no'}
              onClick={() => setShowContext(!showContext)}
            >
              {showContext ? 'Hide context' : 'Show context'}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void save()}
              disabled={unresolved > 0 || saving}
              title={
                unresolved > 0 ? 'Resolve every conflict first' : 'Write the file and mark it resolved'
              }
            >
              {saving ? 'Saving…' : 'Save and mark resolved'}
            </button>
          </div>

          {saveError ? <div className="merge-error">{saveError}</div> : null}

          {showContext ? (
            <div className="merge-context">
              <section>
                <h3>
                  {data.labels.ours} <span className="text-muted">(ours)</span>
                </h3>
                {data.oursCommits.length === 0 ? (
                  <p className="text-muted">No commits touched this file on this side.</p>
                ) : (
                  data.oursCommits.map((entry) => <CommitCard key={entry.oid} commit={entry} compact />)
                )}
                <button
                  type="button"
                  className="link"
                  onClick={() => setSideDiff(sideDiff === 'ours' ? 'none' : 'ours')}
                >
                  {sideDiff === 'ours' ? 'Hide' : 'Show'} what this side changed
                </button>
              </section>
              <section>
                <h3>
                  {data.labels.theirs} <span className="text-muted">(theirs)</span>
                </h3>
                {data.theirsCommits.length === 0 ? (
                  <p className="text-muted">No commits touched this file on this side.</p>
                ) : (
                  data.theirsCommits.map((entry) => (
                    <CommitCard key={entry.oid} commit={entry} compact />
                  ))
                )}
                <button
                  type="button"
                  className="link"
                  onClick={() => setSideDiff(sideDiff === 'theirs' ? 'none' : 'theirs')}
                >
                  {sideDiff === 'theirs' ? 'Hide' : 'Show'} what this side changed
                </button>
              </section>
            </div>
          ) : null}

          {sideDiff !== 'none' ? (
            <div className="merge-side-diff">
              <DiffView
                diff={buildTextDiff(
                  data.base,
                  sideDiff === 'ours' ? data.ours : data.theirs,
                  { context: 3 },
                )}
                language={guessLanguage(data.path)}
                labels={{
                  left: data.labels.base,
                  right: sideDiff === 'ours' ? data.labels.ours : data.labels.theirs,
                }}
              />
            </div>
          ) : null}

          <div className="merge-regions">
            {data.regions.map((region, index) => {
              const resolution = resolutions.get(index);
              const resolved = linesFor(region, resolution);

              if (region.kind !== 'conflict') {
                if (resolved.length === 0) return null;
                return (
                  <pre key={index} className="merge-stable" data-kind={region.kind}>
                    {resolved.map((line, offset) => (
                      <span key={offset} className="merge-line">
                        {line || ' '}
                      </span>
                    ))}
                  </pre>
                );
              }

              return (
                <div key={index} className="merge-conflict" data-resolved={resolution ? 'yes' : 'no'}>
                  <div className="merge-conflict-head">
                    <span className="merge-conflict-label">
                      Conflict {countConflictsBefore(data.regions, index) + 1}
                    </span>
                    <div className="toolbar-spacer" />
                    <div className="segmented small">
                      {(
                        [
                          ['ours', data.labels.ours],
                          ['theirs', data.labels.theirs],
                          ['ours-theirs', 'Both'],
                          ['base', 'Base'],
                        ] as Array<[Choice, string]>
                      ).map(([choice, label]) => (
                        <button
                          key={choice}
                          type="button"
                          data-active={resolution?.choice === choice ? 'yes' : 'no'}
                          onClick={() => choose(index, choice)}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        data-active={resolution?.choice === 'custom' ? 'yes' : 'no'}
                        onClick={() =>
                          choose(
                            index,
                            'custom',
                            (resolution?.choice && resolution.choice !== 'custom'
                              ? resolved
                              : data.ours.slice(region.oursStart, region.oursEnd)
                            ).join('\n'),
                          )
                        }
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  <div className="merge-panes">
                    <MergePane
                      title={data.labels.ours}
                      lines={data.ours.slice(region.oursStart, region.oursEnd)}
                      tokens={highlighted.ours.slice(region.oursStart, region.oursEnd)}
                      side="ours"
                      onTake={() => choose(index, 'ours')}
                    />
                    <MergePane
                      title={data.labels.base}
                      lines={data.base.slice(region.baseStart, region.baseEnd)}
                      tokens={highlighted.base.slice(region.baseStart, region.baseEnd)}
                      side="base"
                      onTake={() => choose(index, 'base')}
                    />
                    <MergePane
                      title={data.labels.theirs}
                      lines={data.theirs.slice(region.theirsStart, region.theirsEnd)}
                      tokens={highlighted.theirs.slice(region.theirsStart, region.theirsEnd)}
                      side="theirs"
                      onTake={() => choose(index, 'theirs')}
                    />
                  </div>

                  {resolution?.choice === 'custom' ? (
                    <textarea
                      className="merge-editor"
                      value={resolution.text ?? ''}
                      spellCheck={false}
                      onChange={(event) => choose(index, 'custom', event.target.value)}
                    />
                  ) : resolution ? (
                    <pre className="merge-result">
                      {resolved.length === 0 ? (
                        <span className="merge-line empty">(nothing — this region is removed)</span>
                      ) : (
                        resolved.map((line, offset) => (
                          <span key={offset} className="merge-line">
                            {line || ' '}
                          </span>
                        ))
                      )}
                    </pre>
                  ) : (
                    <div className="merge-unresolved">Choose which side wins, or edit the result.</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MergePane({
  title,
  lines,
  tokens,
  side,
  onTake,
}: {
  title: string;
  lines: string[];
  tokens: ReturnType<typeof highlightLines>;
  side: 'ours' | 'base' | 'theirs';
  onTake: () => void;
}) {
  return (
    <div className="merge-pane" data-side={side}>
      <div className="merge-pane-head">
        <span className="merge-pane-title" title={title}>
          {title}
        </span>
        <button type="button" className="link" onClick={onTake}>
          Take
        </button>
      </div>
      <pre className="merge-pane-body">
        {lines.length === 0 ? (
          <span className="merge-line empty">(empty)</span>
        ) : (
          lines.map((line, index) => (
            <span key={index} className="merge-line">
              {renderTokens(line, tokens[index])}
            </span>
          ))
        )}
      </pre>
    </div>
  );
}

function renderTokens(
  line: string,
  tokens: ReturnType<typeof highlightLines>[number] | undefined,
): React.ReactNode {
  if (!tokens || tokens.length === 0) return line || ' ';
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) parts.push(line.slice(cursor, token.start));
    parts.push(
      <span key={token.start} className={`tk-${token.kind}`}>
        {line.slice(token.start, token.end)}
      </span>,
    );
    cursor = token.end;
  }
  if (cursor < line.length) parts.push(line.slice(cursor));
  return parts;
}

function countConflictsBefore(regions: readonly MergeRegion[], index: number): number {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (regions[i]!.kind === 'conflict') count++;
  }
  return count;
}

function guessLanguage(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    css: 'css',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
  };
  return map[extension] ?? 'plaintext';
}
