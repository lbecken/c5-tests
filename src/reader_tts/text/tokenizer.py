"""Offset-preserving tokenizer.

The tokenizer is a single deterministic left-to-right scan. Every character of
the input belongs to exactly one token, so concatenating ``token.raw`` in order
reproduces the canonical source exactly.

Word rules
----------
* A word is a run of ASCII letters, optionally joined by an apostrophe or a
  hyphen when a letter appears on *both* sides (``don't``, ``mother-in-law``).
* A leading or trailing apostrophe is punctuation, not part of the word, so an
  opening quote (``'quoted'``) never merges into the adjacent word.
* ``normalized`` is the uppercase form used for dictionary lookup; ``raw``
  preserves the original casing for display and synthesis.
"""

from __future__ import annotations

import re
from typing import Final

from reader_tts.domain.enums import TokenKind
from reader_tts.domain.models import TextSpan, Token
from reader_tts.text import characters as chars
from reader_tts.text.characters import DEFAULT_POLICY, CharacterPolicy

#: Two or more line breaks, possibly with blank space between them.
_PARAGRAPH_BREAK: Final = re.compile(r"[ \t]*\n(?:[ \t]*\n)+[ \t]*")


def tokenize(
    canonical: str,
    normalized: str | None = None,
    policy: CharacterPolicy = DEFAULT_POLICY,
) -> tuple[Token, ...]:
    """Tokenize canonical source text.

    Args:
        canonical: Source text whose offsets every span refers to.
        normalized: The result of :func:`~reader_tts.text.characters.normalize_characters`
            applied to *canonical*. Computed when omitted. Must have the same
            length as *canonical*.
        policy: Decides which characters count as letters. The default matches
            English; French additionally accepts accented letters.

    Returns:
        Every token in source order, covering the whole input.
    """
    norm = chars.normalize_characters(canonical) if normalized is None else normalized
    if len(norm) != len(canonical):
        msg = "normalized text must have the same length as the canonical source"
        raise ValueError(msg)

    tokens: list[Token] = []
    position = 0
    length = len(norm)

    while position < length:
        char = norm[position]

        if char in {" ", "\t", "\n"}:
            end = _scan_whitespace(norm, position)
            raw = canonical[position:end]
            kind = (
                TokenKind.PARAGRAPH_BREAK
                if _PARAGRAPH_BREAK.fullmatch(norm[position:end])
                else TokenKind.WHITESPACE
            )
            tokens.append(Token(raw=raw, normalized=raw, kind=kind, span=TextSpan(position, end)))
            position = end
            continue

        if policy.is_letter(char):
            end = _scan_word(norm, position, policy)
            raw = canonical[position:end]
            tokens.append(
                Token(
                    raw=raw,
                    normalized=norm[position:end].upper(),
                    kind=TokenKind.WORD,
                    span=TextSpan(position, end),
                )
            )
            position = end
            continue

        if chars.is_supported_punctuation(char) or char == chars.ASCII_HYPHEN:
            tokens.append(
                Token(
                    raw=canonical[position : position + 1],
                    normalized=char,
                    kind=TokenKind.PUNCTUATION,
                    span=TextSpan(position, position + 1),
                )
            )
            position += 1
            continue

        end = _scan_unsupported(norm, position, policy)
        tokens.append(
            Token(
                raw=canonical[position:end],
                normalized=norm[position:end],
                kind=TokenKind.UNSUPPORTED,
                span=TextSpan(position, end),
            )
        )
        position = end

    return tuple(tokens)


def _scan_whitespace(text: str, start: int) -> int:
    position = start
    while position < len(text) and text[position] in {" ", "\t", "\n"}:
        position += 1
    return position


def _scan_word(text: str, start: int, policy: CharacterPolicy) -> int:
    """Return the end offset of the word beginning at *start*."""
    position = start
    length = len(text)
    while position < length:
        char = text[position]
        if policy.is_letter(char):
            position += 1
            continue
        if chars.is_word_joiner(char):
            # A joiner only stays inside the word when a letter follows it.
            following = position + 1
            if following < length and policy.is_letter(text[following]):
                position = following + 1
                continue
        break
    return position


def _scan_unsupported(text: str, start: int, policy: CharacterPolicy) -> int:
    """Group a run of unsupported characters into one token.

    Adjacent unsupported characters are reported together so that a token such
    as ``https://example.com`` produces one issue rather than a dozen.
    """
    position = start
    length = len(text)
    while position < length:
        char = text[position]
        if (
            chars.is_supported_whitespace(char)
            or chars.is_supported_punctuation(char)
            or char == chars.ASCII_HYPHEN
            or policy.is_letter(char)
        ):
            break
        position += 1
    return position


def word_tokens(tokens: tuple[Token, ...]) -> tuple[Token, ...]:
    """Filter *tokens* down to word tokens."""
    return tuple(token for token in tokens if token.kind is TokenKind.WORD)


def unsupported_tokens(tokens: tuple[Token, ...]) -> tuple[Token, ...]:
    """Filter *tokens* down to unsupported tokens."""
    return tuple(token for token in tokens if token.kind is TokenKind.UNSUPPORTED)
