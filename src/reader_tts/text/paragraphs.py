"""Paragraph segmentation.

A paragraph is a run of text delimited by one or more blank lines. Spans always
refer to the canonical source, and leading and trailing whitespace is excluded
from the reported span so that a paragraph starts on its first visible
character.
"""

from __future__ import annotations

import re
from typing import Final

from reader_tts.domain.models import Paragraph, TextSpan

_BLANK_LINE: Final = re.compile(r"\n[ \t]*\n[ \t\n]*")


def split_paragraphs(canonical: str) -> tuple[Paragraph, ...]:
    """Split canonical source text into paragraphs.

    Args:
        canonical: Source text.

    Returns:
        Paragraphs in source order. Empty input yields an empty tuple.
    """
    paragraphs: list[Paragraph] = []
    index = 0
    cursor = 0

    for match in _BLANK_LINE.finditer(canonical):
        block = _trim(canonical, cursor, match.start())
        if block is not None:
            paragraphs.append(_build(canonical, block, index))
            index += 1
        cursor = match.end()

    block = _trim(canonical, cursor, len(canonical))
    if block is not None:
        paragraphs.append(_build(canonical, block, index))

    return tuple(paragraphs)


def _trim(text: str, start: int, end: int) -> TextSpan | None:
    """Shrink ``[start, end)`` past surrounding whitespace, or ``None`` if empty."""
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    if start >= end:
        return None
    return TextSpan(start, end)


def _build(canonical: str, span: TextSpan, index: int) -> Paragraph:
    return Paragraph(index=index, span=span, text=canonical[span.start : span.end])


def paragraph_index_for_offset(paragraphs: tuple[Paragraph, ...], offset: int) -> int:
    """Return the index of the paragraph containing *offset*.

    Offsets that fall in the whitespace between paragraphs are attributed to the
    nearest preceding paragraph, and offsets before the first paragraph to
    paragraph zero.
    """
    result = 0
    for paragraph in paragraphs:
        if offset < paragraph.span.start:
            break
        result = paragraph.index
    return result
