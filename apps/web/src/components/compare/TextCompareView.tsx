import { useMemo, useRef, useState } from 'react';

import { buildTextDiff, splitLines } from '@gitscope/core/diff';

import { api } from '../../api/client';
import { DiffView, type DiffViewHandle } from '../diff/DiffView';
import { useAsync } from '../../lib/useAsync';
import { useSettings } from '../../store/settings';

interface Props {
  repoId?: string;
  left?: string;
  right?: string;
}

type Source =
  | { kind: 'text'; value: string }
  | { kind: 'revision'; rev: string; path: string };

/**
 * Compare any two pieces of text: pasted content, or any path at any revision.
 *
 * Pasted text is diffed in the browser with the same engine the server uses, so
 * there is no round trip and nothing leaves the machine; revisions are fetched
 * and then diffed the same way, which keeps both halves of this view identical
 * below the input controls.
 */
export function TextCompareView({ repoId, left, right }: Props) {
  const [leftSource, setLeftSource] = useState<Source>(
    left ? { kind: 'revision', rev: 'HEAD', path: left } : { kind: 'text', value: '' },
  );
  const [rightSource, setRightSource] = useState<Source>(
    right ? { kind: 'revision', rev: ':worktree', path: right } : { kind: 'text', value: '' },
  );
  const options = useSettings((state) => state.diffOptions);
  const whitespace = useSettings((state) => state.whitespace);
  const context = useSettings((state) => state.context);
  const viewRef = useRef<DiffViewHandle>(null);

  const loaded = useAsync(
    async () => {
      const read = async (source: Source): Promise<string> => {
        if (source.kind === 'text') return source.value;
        if (!repoId) return '';
        const blob = await api.file(repoId, source.rev, source.path);
        return blob.text ?? '';
      };
      const [a, b] = await Promise.all([read(leftSource), read(rightSource)]);
      return { a, b };
    },
    [repoId, JSON.stringify(leftSource), JSON.stringify(rightSource)],
    { keepPreviousData: true },
  );

  const diff = useMemo(() => {
    if (!loaded.data) return undefined;
    const a = splitLines(loaded.data.a);
    const b = splitLines(loaded.data.b);
    return buildTextDiff(a.lines, b.lines, options(), a.noFinalNewline, b.noFinalNewline);
    // Recompute when the diff settings change, not only when the text does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded.data, whitespace, context]);

  const language = useMemo(() => {
    const path =
      rightSource.kind === 'revision'
        ? rightSource.path
        : leftSource.kind === 'revision'
          ? leftSource.path
          : '';
    return guessLanguage(path);
  }, [leftSource, rightSource]);

  return (
    <div className="text-compare">
      <div className="compare-inputs">
        <SourceInput
          label="Left"
          source={leftSource}
          onChange={setLeftSource}
          repoAvailable={repoId !== undefined}
        />
        <SourceInput
          label="Right"
          source={rightSource}
          onChange={setRightSource}
          repoAvailable={repoId !== undefined}
        />
      </div>

      {loaded.error ? <div className="empty-state error">{loaded.error}</div> : null}

      {diff && (diff.aLineCount > 0 || diff.bLineCount > 0) ? (
        <>
          <div className="compare-summary">
            <span className="count-add">+{diff.stats.additions}</span>
            <span className="count-del">−{diff.stats.deletions}</span>
            <span className="text-muted">
              {diff.changeAnchors.length} change block
              {diff.changeAnchors.length === 1 ? '' : 's'}
            </span>
            <div className="toolbar-spacer" />
            <button type="button" className="button" onClick={() => viewRef.current?.previousChange()}>
              ↑
            </button>
            <button type="button" className="button" onClick={() => viewRef.current?.nextChange()}>
              ↓
            </button>
          </div>
          <DiffView
            ref={viewRef}
            diff={diff}
            language={language}
            labels={{ left: describe(leftSource), right: describe(rightSource) }}
          />
        </>
      ) : (
        <div className="empty-state">
          Paste text on both sides, or point each side at a file in the repository.
        </div>
      )}
    </div>
  );
}

function describe(source: Source): string {
  return source.kind === 'text' ? 'Pasted text' : `${source.rev} — ${source.path}`;
}

function SourceInput({
  label,
  source,
  onChange,
  repoAvailable,
}: {
  label: string;
  source: Source;
  onChange: (source: Source) => void;
  repoAvailable: boolean;
}) {
  return (
    <div className="compare-input">
      <div className="compare-input-head">
        <strong>{label}</strong>
        <div className="segmented small">
          <button
            type="button"
            data-active={source.kind === 'text' ? 'yes' : 'no'}
            onClick={() => onChange({ kind: 'text', value: '' })}
          >
            Text
          </button>
          <button
            type="button"
            data-active={source.kind === 'revision' ? 'yes' : 'no'}
            onClick={() => onChange({ kind: 'revision', rev: 'HEAD', path: '' })}
            disabled={!repoAvailable}
            title={repoAvailable ? 'Compare a file from the repository' : 'No repository open'}
          >
            File
          </button>
        </div>
      </div>

      {source.kind === 'text' ? (
        <textarea
          className="compare-textarea"
          value={source.value}
          placeholder="Paste or type…"
          spellCheck={false}
          onChange={(event) => onChange({ kind: 'text', value: event.target.value })}
        />
      ) : (
        <div className="compare-revision">
          <input
            className="input"
            value={source.rev}
            placeholder="HEAD, a branch, a tag, or :worktree"
            spellCheck={false}
            onChange={(event) => onChange({ ...source, rev: event.target.value })}
          />
          <input
            className="input"
            value={source.path}
            placeholder="path/to/file"
            spellCheck={false}
            onChange={(event) => onChange({ ...source, path: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}

/** Minimal extension mapping; the server does the same for repository files. */
function guessLanguage(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    css: 'css',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    sql: 'sql',
    rb: 'ruby',
    md: 'markdown',
  };
  return map[extension] ?? 'plaintext';
}
