"""Synthesis text preparation and long-sentence splitting.

A sentence is the unit the reader navigates by. When a sentence is too long for
the engine to handle comfortably it is divided into *technical chunks*, each of
which references its parent sentence so playback still presents one unit.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from reader_tts.config import defaults
from reader_tts.domain.errors import ValidationError
from reader_tts.domain.models import Sentence, SynthesisChunk
from reader_tts.text import characters as chars
from reader_tts.text.punctuation import (
    collapse_whitespace,
    has_speakable_content,
    to_engine_punctuation,
)
from reader_tts.text.tokenizer import tokenize

#: Split preference, highest first. Each entry is the punctuation to break after.
_SPLIT_PRIORITY: Final = (";", ":", chars.EM_DASH, chars.EN_DASH, ",")

#: Conjunctions used only when no punctuation boundary exists.
_CONJUNCTIONS: Final = frozenset({"and", "but", "or", "nor", "for", "so", "yet", "because",
                                  "although", "though", "while", "which", "that", "when"})


@dataclass(frozen=True, slots=True)
class PreparedSentence:
    """A sentence ready for synthesis, together with its technical chunks."""

    sentence: Sentence
    display_text: str
    synthesis_text: str
    chunks: tuple[SynthesisChunk, ...]
    replacements_applied: tuple[tuple[str, str], ...]


def prepare_sentence(
    sentence: Sentence,
    replacements: Mapping[str, str] | None = None,
    preferred_max_chars: int = defaults.PREFERRED_MAX_SENTENCE_CHARS,
    hard_max_chars: int = defaults.HARD_MAX_SENTENCE_CHARS,
) -> PreparedSentence:
    """Build the engine-ready text for *sentence*.

    Args:
        sentence: The logical sentence.
        replacements: Uppercase word to synthesis respelling, from pronunciation
            overrides. Every application is recorded so the transformation stays
            inspectable.
        preferred_max_chars: Sentences longer than this are split.
        hard_max_chars: Upper bound enforced on every produced chunk.

    Returns:
        The prepared sentence with at least one chunk.

    Raises:
        ValidationError: If the sentence has no speakable content.
    """
    display_text = collapse_whitespace(sentence.text)
    replaced, applied = _apply_replacements(display_text, replacements or {})
    synthesis_text = to_engine_punctuation(replaced)

    if not has_speakable_content(synthesis_text):
        raise ValidationError(
            f"sentence {sentence.index + 1} contains no readable words and cannot be spoken"
        )

    pieces = split_for_synthesis(synthesis_text, preferred_max_chars, hard_max_chars)
    chunks = tuple(
        SynthesisChunk(
            sentence_id=sentence.id,
            chunk_index=index,
            display_text=display_text if len(pieces) == 1 else piece,
            synthesis_text=piece,
        )
        for index, piece in enumerate(pieces)
    )
    return PreparedSentence(
        sentence=sentence,
        display_text=display_text,
        synthesis_text=synthesis_text,
        chunks=chunks,
        replacements_applied=applied,
    )


def split_for_synthesis(
    text: str,
    preferred_max_chars: int = defaults.PREFERRED_MAX_SENTENCE_CHARS,
    hard_max_chars: int = defaults.HARD_MAX_SENTENCE_CHARS,
) -> tuple[str, ...]:
    """Split *text* into engine-sized pieces at the safest available boundary.

    Boundaries are tried in order: semicolon, colon, em dash, en dash, comma,
    conjunction, then whitespace. Splits never fall inside a hyphenated word or
    a contraction, and quotation and parenthesis pairs are kept together when a
    boundary outside them is available.
    """
    text = collapse_whitespace(text)
    if len(text) <= preferred_max_chars:
        return (text,)

    pieces: list[str] = []
    remaining = text
    while len(remaining) > hard_max_chars or (
        len(remaining) > preferred_max_chars and _has_boundary(remaining, preferred_max_chars)
    ):
        cut = _find_split_point(remaining, preferred_max_chars, hard_max_chars)
        if cut is None:
            break
        head = remaining[:cut].strip()
        tail = remaining[cut:].strip()
        if not head or not tail:
            break
        pieces.append(head)
        remaining = tail
    pieces.append(remaining)
    return tuple(pieces)


def _has_boundary(text: str, preferred_max_chars: int) -> bool:
    return _find_split_point(text, preferred_max_chars, len(text)) is not None


def _find_split_point(text: str, preferred: int, hard: int) -> int | None:
    """Return the offset just after the best boundary, or ``None``."""
    limit = min(len(text) - 1, max(preferred, 1))
    depths = _nesting_depths(text)

    for mark in _SPLIT_PRIORITY:
        candidate = _last_index(text, mark, limit, depths, require_balanced=True)
        if candidate is not None:
            return candidate + 1

    candidate = _last_conjunction(text, limit, depths)
    if candidate is not None:
        return candidate

    candidate = _last_space(text, limit)
    if candidate is not None:
        return candidate

    # Nothing safe below the preferred limit: fall back to the hard limit so an
    # unbroken run of text still reaches the engine in bounded pieces.
    if len(text) > hard:
        return _last_space(text, hard) or hard
    return None


def _nesting_depths(text: str) -> list[tuple[int, int]]:
    """Return per-character ``(paren_depth, quote_depth)`` values."""
    depths: list[tuple[int, int]] = []
    paren = 0
    quote = 0
    for char in text:
        if char == "(":
            paren += 1
        elif char == ")":
            paren = max(0, paren - 1)
        elif char == chars.ASCII_QUOTE:
            quote = 1 - quote
        depths.append((paren, quote))
    return depths


def _last_index(
    text: str,
    mark: str,
    limit: int,
    depths: list[tuple[int, int]],
    require_balanced: bool,
) -> int | None:
    position = text.rfind(mark, 0, limit)
    while position > 0:
        paren, quote = depths[position]
        inside = require_balanced and (paren > 0 or quote > 0)
        if not inside and position + 1 < len(text) and text[position + 1] == " ":
            return position
        position = text.rfind(mark, 0, position)
    return None


def _last_conjunction(text: str, limit: int, depths: list[tuple[int, int]]) -> int | None:
    best: int | None = None
    for token in tokenize(text):
        if not token.is_word or token.span.start == 0:
            continue
        if token.span.start >= limit:
            break
        if token.raw.lower() not in _CONJUNCTIONS:
            continue
        paren, quote = depths[token.span.start]
        if paren or quote:
            continue
        best = token.span.start
    return best


def _last_space(text: str, limit: int) -> int | None:
    """Return a whitespace split point that does not break a word."""
    position = text.rfind(" ", 0, limit)
    if position <= 0:
        return None
    return position + 1


def _apply_replacements(
    text: str, replacements: Mapping[str, str]
) -> tuple[str, tuple[tuple[str, str], ...]]:
    """Substitute synthesis respellings, preserving surrounding punctuation."""
    if not replacements:
        return text, ()

    applied: list[tuple[str, str]] = []
    pieces: list[str] = []
    cursor = 0
    for token in tokenize(text):
        if not token.is_word:
            continue
        replacement = replacements.get(token.normalized)
        if replacement is None:
            continue
        pieces.append(text[cursor : token.span.start])
        pieces.append(_match_case(token.raw, replacement))
        applied.append((token.raw, replacement))
        cursor = token.span.end
    pieces.append(text[cursor:])
    return "".join(pieces), tuple(applied)


def _match_case(original: str, replacement: str) -> str:
    """Give *replacement* the capitalization pattern of *original*."""
    if original.isupper() and len(original) > 1:
        return replacement.upper()
    if original[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement
