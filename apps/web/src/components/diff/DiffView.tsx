import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { DiffRow, TextDiff } from '@gitscope/core';

import { LineText } from './LineText';
import { ChangeMap } from './ChangeMap';
import { useDiffModel, type VisualItem } from './useDiffModel';
import { useSettings } from '../../store/settings';

export interface DiffViewHandle {
  nextChange: () => void;
  previousChange: () => void;
  scrollToRow: (row: number) => void;
}

interface Props {
  diff: TextDiff;
  language: string;
  /** Column headings, typically the two revisions being compared. */
  labels?: { left: string; right: string };
  /** Called when the user clicks a line, e.g. to stage a hunk. */
  onLineAction?: (row: DiffRow, index: number) => void;
  className?: string;
}

const ROW_HEIGHT = 20;
const GAP_HEIGHT = 26;
/** Width of one monospace character at the current font size, measured once. */
let measuredCharWidth = 0;

function charWidth(): number {
  if (measuredCharWidth > 0) return measuredCharWidth;
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:absolute;visibility:hidden;white-space:pre;font-family:var(--font-mono);font-size:12px';
  probe.textContent = '0'.repeat(100);
  document.body.append(probe);
  measuredCharWidth = probe.getBoundingClientRect().width / 100 || 7.2;
  probe.remove();
  return measuredCharWidth;
}

export const DiffView = forwardRef<DiffViewHandle, Props>(function DiffView(
  { diff, language, labels, onLineAction, className },
  ref,
) {
  const mode = useSettings((state) => state.diffMode);
  const showWhitespace = useSettings((state) => state.showWhitespace);
  const scrollRef = useRef<HTMLDivElement>(null);
  const model = useDiffModel(diff, language);
  const currentAnchor = useRef(-1);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry?.contentRect.height ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: model.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (model.items[index]!.kind === 'gap' ? GAP_HEIGHT : ROW_HEIGHT),
    overscan: 24,
  });

  // Reset the scroll position when a different file is shown; keeping the old
  // offset lands you in the middle of an unrelated file.
  useEffect(() => {
    currentAnchor.current = -1;
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
    virtualizer.scrollToOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff]);

  const scrollToItem = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index, { align: 'center' });
    },
    [virtualizer],
  );

  const nextChange = useCallback(() => {
    if (model.anchors.length === 0) return;
    const offset = scrollRef.current?.scrollTop ?? 0;
    const visible = virtualizer.getVirtualItems();
    const firstVisible = visible.length > 0 ? visible[0]!.index : 0;
    const next =
      model.anchors.find((anchor) => anchor > firstVisible + 1) ?? model.anchors[0]!;
    currentAnchor.current = next;
    scrollToItem(next);
    void offset;
  }, [model.anchors, scrollToItem, virtualizer]);

  const previousChange = useCallback(() => {
    if (model.anchors.length === 0) return;
    const visible = virtualizer.getVirtualItems();
    const firstVisible = visible.length > 0 ? visible[0]!.index : 0;
    const candidates = model.anchors.filter((anchor) => anchor < firstVisible - 1);
    const previous = candidates.length > 0 ? candidates[candidates.length - 1]! : model.anchors[model.anchors.length - 1]!;
    currentAnchor.current = previous;
    scrollToItem(previous);
  }, [model.anchors, scrollToItem, virtualizer]);

  useImperativeHandle(
    ref,
    () => ({
      nextChange,
      previousChange,
      scrollToRow: (row: number) => {
        const index = model.items.findIndex((item) => item.kind === 'row' && item.row === row);
        if (index >= 0) scrollToItem(index);
      },
    }),
    [nextChange, previousChange, model.items, scrollToItem],
  );

  const contentWidth = useMemo(
    () => Math.min(Math.max(model.maxLineLength + 2, 40), 4000) * charWidth(),
    [model.maxLineLength],
  );

  const style = {
    '--content-width': `${Math.ceil(contentWidth)}px`,
  } as React.CSSProperties;

  return (
    <div className={`diff-view ${className ?? ''}`} data-mode={mode}>
      {labels ? (
        <div className="diff-columns">
          <div className="diff-column-label" title={labels.left}>
            {labels.left}
          </div>
          {mode === 'split' ? (
            <div className="diff-column-label" title={labels.right}>
              {labels.right}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="diff-body">
        <div className="diff-scroll" ref={scrollRef} tabIndex={0}>
          <div className="diff-rows" style={{ ...style, height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = model.items[virtualRow.index]!;
              return (
                <div
                  key={virtualRow.key}
                  className="diff-item"
                  style={{ transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size }}
                >
                  {item.kind === 'gap' ? (
                    <GapRow item={item} onExpand={() => model.expand(item.range)} />
                  ) : (
                    <Row
                      row={diff.rows[item.row]!}
                      index={item.row}
                      mode={mode}
                      tokensA={model.tokensA[item.row]}
                      tokensB={model.tokensB[item.row]}
                      showWhitespace={showWhitespace}
                      onAction={onLineAction}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Only worth drawing when there is something off-screen to find. */}
        {virtualizer.getTotalSize() > viewportHeight + 8 ? (
          <ChangeMap
            rows={diff.rows}
            onSeek={(fraction) => {
              const target = Math.floor(fraction * model.items.length);
              scrollToItem(Math.max(0, Math.min(model.items.length - 1, target)));
            }}
          />
        ) : null}
      </div>
    </div>
  );
});

function GapRow({
  item,
  onExpand,
}: {
  item: Extract<VisualItem, { kind: 'gap' }>;
  onExpand: () => void;
}): JSX.Element {
  const hidden = item.skipped ?? item.end - item.start;
  return (
    <button
      type="button"
      className="diff-gap"
      onClick={item.skipped === undefined ? onExpand : undefined}
      disabled={item.skipped !== undefined}
      title={item.skipped === undefined ? 'Show hidden lines' : 'Too large to expand in place'}
    >
      <span className="diff-gap-count">{hidden} unchanged lines</span>
      {item.header ? <span className="diff-gap-header">{item.header}</span> : null}
    </button>
  );
}

interface RowProps {
  row: DiffRow;
  index: number;
  mode: 'split' | 'unified';
  tokensA?: import('../../lib/highlight').Token[];
  tokensB?: import('../../lib/highlight').Token[];
  showWhitespace: boolean;
  onAction?: (row: DiffRow, index: number) => void;
}

function Row({ row, index, mode, tokensA, tokensB, showWhitespace, onAction }: RowProps): JSX.Element {
  if (mode === 'unified') {
    // A replace row shows as its deletion followed by its insertion; the
    // character highlights survive because both halves keep their spans.
    return (
      <div className="diff-unified-pair">
        {row.a ? (
          <div
            className="diff-row"
            data-kind={row.kind === 'replace' ? 'delete' : row.kind}
            onDoubleClick={() => onAction?.(row, index)}
          >
            <div className="diff-ln">{row.a.number}</div>
            <div className="diff-ln diff-ln-b" />
            <div className="diff-marker">{row.kind === 'equal' ? ' ' : '−'}</div>
            <div className="diff-cell">
              <LineText
                text={row.a.text}
                tokens={tokensA}
                spans={row.a.spans}
                side="a"
                showWhitespace={showWhitespace}
              />
              {row.a.noNewlineAtEof ? <span className="no-newline">no newline at end of file</span> : null}
            </div>
          </div>
        ) : null}
        {row.b && row.kind !== 'equal' ? (
          <div className="diff-row" data-kind="insert" onDoubleClick={() => onAction?.(row, index)}>
            <div className="diff-ln" />
            <div className="diff-ln diff-ln-b">{row.b.number}</div>
            <div className="diff-marker">+</div>
            <div className="diff-cell">
              <LineText
                text={row.b.text}
                tokens={tokensB}
                spans={row.b.spans}
                side="b"
                showWhitespace={showWhitespace}
              />
              {row.b.noNewlineAtEof ? <span className="no-newline">no newline at end of file</span> : null}
            </div>
          </div>
        ) : null}
        {row.b && row.kind === 'equal' && !row.a ? (
          <div className="diff-row" data-kind="insert">
            <div className="diff-ln" />
            <div className="diff-ln diff-ln-b">{row.b.number}</div>
            <div className="diff-marker">+</div>
            <div className="diff-cell">
              <LineText text={row.b.text} tokens={tokensB} spans={row.b.spans} side="b" />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="diff-row" data-kind={row.kind} onDoubleClick={() => onAction?.(row, index)}>
      <div className="diff-ln">{row.a?.number ?? ''}</div>
      <div className="diff-cell" data-side="a" data-filled={row.a ? 'yes' : 'no'}>
        {row.a ? (
          <>
            <LineText
              text={row.a.text}
              tokens={tokensA}
              spans={row.a.spans}
              side="a"
              showWhitespace={showWhitespace}
            />
            {row.a.noNewlineAtEof ? <span className="no-newline">no newline at end of file</span> : null}
          </>
        ) : null}
      </div>
      <div className="diff-ln diff-ln-b">{row.b?.number ?? ''}</div>
      <div className="diff-cell" data-side="b" data-filled={row.b ? 'yes' : 'no'}>
        {row.b ? (
          <>
            <LineText
              text={row.b.text}
              tokens={tokensB}
              spans={row.b.spans}
              side="b"
              showWhitespace={showWhitespace}
            />
            {row.b.noNewlineAtEof ? <span className="no-newline">no newline at end of file</span> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
