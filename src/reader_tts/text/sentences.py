"""Conservative sentence segmentation.

A sentence ends at ``.``, ``?`` or ``!`` when the run of terminators — possibly
followed by closing quotes or parentheses — is followed by whitespace, the end
of a paragraph, or the end of the input.

Version 1 rejects abbreviations at validation time, so no abbreviation
classifier is required here. Semicolons and colons never end a sentence, and
paragraph boundaries always do.
"""

from __future__ import annotations

from collections.abc import Callable

from reader_tts.domain.models import Paragraph, Sentence, TextSpan
from reader_tts.text import characters as chars
from reader_tts.text.paragraphs import split_paragraphs


def split_sentences(
    canonical: str,
    document_id: str = "",
    sentence_id_factory: Callable[[], str] | None = None,
) -> tuple[Sentence, ...]:
    """Split canonical source text into sentences.

    Args:
        canonical: Source text.
        document_id: Recorded on each sentence; may be empty for ad-hoc text.
        sentence_id_factory: Optional zero-argument callable returning an
            identifier for each sentence. Defaults to ``"{index}"``.

    Returns:
        Sentences in source order, each carrying its paragraph index and span.
    """
    normalized = chars.normalize_characters(canonical)
    paragraphs = split_paragraphs(canonical)
    sentences: list[Sentence] = []
    index = 0

    for paragraph in paragraphs:
        for span in _split_paragraph(normalized, paragraph):
            text = canonical[span.start : span.end]
            sentence_id = sentence_id_factory() if sentence_id_factory is not None else str(index)
            sentences.append(
                Sentence(
                    id=sentence_id,
                    document_id=document_id,
                    index=index,
                    paragraph_index=paragraph.index,
                    text=text,
                    span=span,
                    terminal_punctuation=_terminal_punctuation(normalized, span),
                )
            )
            index += 1

    return tuple(sentences)


def _split_paragraph(normalized: str, paragraph: Paragraph) -> list[TextSpan]:
    """Return sentence spans inside one paragraph."""
    spans: list[TextSpan] = []
    start = paragraph.span.start
    end = paragraph.span.end
    position = start

    while position < end:
        char = normalized[position]
        if char in chars.TERMINAL_PUNCTUATION:
            boundary = _sentence_boundary(normalized, position, end)
            if boundary is not None:
                span = _trim(normalized, start, boundary)
                if span is not None:
                    spans.append(span)
                start = boundary
                position = boundary
                continue
        position += 1

    span = _trim(normalized, start, end)
    if span is not None:
        spans.append(span)
    return spans


def _sentence_boundary(normalized: str, position: int, end: int) -> int | None:
    """Return the offset just past a sentence ending at *position*, if any.

    ``position`` indexes the first terminal punctuation character. Repeated
    terminators (``?!``) and trailing closing punctuation are absorbed into the
    sentence that precedes them.
    """
    cursor = position
    while cursor < end and normalized[cursor] in chars.TERMINAL_PUNCTUATION:
        cursor += 1
    while cursor < end and normalized[cursor] in chars.CLOSING_PUNCTUATION:
        cursor += 1

    if cursor >= end:
        # End of the paragraph is always a sentence boundary.
        return cursor
    if normalized[cursor].isspace():
        return cursor
    return None


def _trim(normalized: str, start: int, end: int) -> TextSpan | None:
    while start < end and normalized[start].isspace():
        start += 1
    while end > start and normalized[end - 1].isspace():
        end -= 1
    if start >= end:
        return None
    return TextSpan(start, end)


def _terminal_punctuation(normalized: str, span: TextSpan) -> str | None:
    """Return the trailing terminal punctuation of a sentence span, if present."""
    cursor = span.end
    while cursor > span.start and normalized[cursor - 1] in chars.CLOSING_PUNCTUATION:
        cursor -= 1
    end = cursor
    while cursor > span.start and normalized[cursor - 1] in chars.TERMINAL_PUNCTUATION:
        cursor -= 1
    if cursor == end:
        return None
    return normalized[cursor:end]
