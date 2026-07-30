import { memo, useMemo } from 'react';

import type { InlineSpan } from '@gitscope/core';

import { TOKEN_CLASS, type Token } from '../../lib/highlight';

interface Props {
  text: string;
  tokens?: Token[];
  spans?: InlineSpan[];
  /** Which side of the diff this line belongs to, for the highlight colour. */
  side: 'a' | 'b';
  showWhitespace?: boolean;
}

interface Segment {
  start: number;
  end: number;
  token: string;
  highlight: 'strong' | 'weak' | null;
}

/**
 * Split a line at every boundary introduced by either syntax tokens or change
 * spans, so each emitted segment carries both a syntax colour and, where it
 * applies, the character-level change highlight. Doing this as one pass over
 * merged boundaries keeps the DOM to the minimum number of spans.
 */
function buildSegments(
  text: string,
  tokens: Token[] | undefined,
  spans: InlineSpan[] | undefined,
): Segment[] {
  if (text.length === 0) return [];
  const hasTokens = tokens !== undefined && tokens.length > 0;
  const hasSpans = spans !== undefined && spans.length > 0;
  if (!hasTokens && !hasSpans) {
    return [{ start: 0, end: text.length, token: '', highlight: null }];
  }

  const cuts = new Set<number>([0, text.length]);
  if (hasTokens) {
    for (const token of tokens!) {
      if (token.start < text.length) cuts.add(token.start);
      if (token.end <= text.length) cuts.add(token.end);
    }
  }
  if (hasSpans) {
    for (const span of spans!) {
      if (span.start < text.length) cuts.add(span.start);
      if (span.end <= text.length) cuts.add(span.end);
    }
  }

  const boundaries = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  let tokenIndex = 0;
  let spanIndex = 0;

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    if (end <= start) continue;

    while (hasTokens && tokenIndex < tokens!.length && tokens![tokenIndex]!.end <= start) {
      tokenIndex++;
    }
    const token = hasTokens ? tokens![tokenIndex] : undefined;
    const tokenClass = token && token.start <= start && token.end >= end ? TOKEN_CLASS[token.kind] : '';

    while (hasSpans && spanIndex < spans!.length && spans![spanIndex]!.end <= start) {
      spanIndex++;
    }
    const span = hasSpans ? spans![spanIndex] : undefined;
    const highlight =
      span && span.start <= start && span.end >= end ? (span.emphasis ?? 'strong') : null;

    const previous = segments[segments.length - 1];
    if (previous && previous.token === tokenClass && previous.highlight === highlight) {
      previous.end = end;
    } else {
      segments.push({ start, end, token: tokenClass, highlight });
    }
  }
  return segments;
}

export const LineText = memo(function LineText({ text, tokens, spans, side, showWhitespace }: Props) {
  const segments = useMemo(() => buildSegments(text, tokens, spans), [text, tokens, spans]);

  if (segments.length === 0) return <span className="line-text" />;

  return (
    <span className="line-text">
      {segments.map((segment) => {
        const className = [
          segment.token,
          segment.highlight ? `hl hl-${side} hl-${segment.highlight}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        const slice = text.slice(segment.start, segment.end);
        return className.length > 0 ? (
          <span key={segment.start} className={className}>
            {slice}
          </span>
        ) : (
          <span key={segment.start}>{slice}</span>
        );
      })}
      {showWhitespace && /[ \t]$/.test(text) ? <span className="trailing-ws" /> : null}
    </span>
  );
});
