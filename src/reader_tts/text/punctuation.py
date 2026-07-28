"""Punctuation handling for synthesis text preparation.

Synthesis text is derived from the sentence's display text. Unlike the
offset-preserving normalization in :mod:`reader_tts.text.characters`, these
transformations may change the length of the string: the result is fed to the
engine and never used to address the source.
"""

from __future__ import annotations

import re
from typing import Final

from reader_tts.text import characters as chars

_WHITESPACE_RUN: Final = re.compile(r"\s+")
_SPACE_BEFORE_PUNCTUATION: Final = re.compile(r"\s+([,.;:!?)])")
_SPACE_AFTER_OPEN: Final = re.compile(r"([(])\s+")


def collapse_whitespace(text: str) -> str:
    """Collapse every whitespace run to a single space and strip the ends."""
    return _WHITESPACE_RUN.sub(" ", text).strip()


def to_engine_punctuation(text: str) -> str:
    """Rewrite punctuation into the plain forms the engine handles best.

    En dashes become em dashes so that both render as the same prosodic break,
    and stray spacing around punctuation is tidied. Word content is untouched.
    """
    text = text.replace(chars.EN_DASH, chars.EM_DASH)
    text = _SPACE_BEFORE_PUNCTUATION.sub(r"\1", text)
    text = _SPACE_AFTER_OPEN.sub(r"\1", text)
    return collapse_whitespace(text)


def strip_wrapping_quotes(text: str) -> str:
    """Remove a single pair of quotes that wraps the whole string."""
    if len(text) >= 2 and text[0] == chars.ASCII_QUOTE and text[-1] == chars.ASCII_QUOTE:
        return text[1:-1]
    return text


def has_speakable_content(text: str) -> bool:
    """Whether *text* contains at least one letter."""
    return any(chars.is_letter(char) for char in text)


def terminal_punctuation_of(text: str) -> str | None:
    """Return the sentence-final punctuation of *text*, if it has any."""
    stripped = text.rstrip()
    cursor = len(stripped)
    while cursor > 0 and stripped[cursor - 1] in chars.CLOSING_PUNCTUATION:
        cursor -= 1
    end = cursor
    while cursor > 0 and stripped[cursor - 1] in chars.TERMINAL_PUNCTUATION:
        cursor -= 1
    if cursor == end:
        return None
    return stripped[cursor:end]
