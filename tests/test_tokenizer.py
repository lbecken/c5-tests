"""Tokenizer tests: kinds, offsets, contractions, compounds and rejection."""

from __future__ import annotations

import pytest

from reader_tts.domain.enums import TokenKind
from reader_tts.text.characters import canonicalize_source, normalize_characters
from reader_tts.text.tokenizer import tokenize, unsupported_tokens, word_tokens


def kinds(text: str) -> list[TokenKind]:
    return [token.kind for token in tokenize(text)]


def words(text: str) -> list[str]:
    return [token.normalized for token in word_tokens(tokenize(text))]


def test_plain_words() -> None:
    tokens = tokenize("The cat sat")
    assert [t.raw for t in tokens] == ["The", " ", "cat", " ", "sat"]
    assert [t.normalized for t in word_tokens(tokens)] == ["THE", "CAT", "SAT"]


def test_tokens_cover_the_whole_input() -> None:
    text = 'He said, "Don\'t go" — then left.\n\nA new paragraph.'
    tokens = tokenize(text)
    assert "".join(token.raw for token in tokens) == text
    for previous, current in zip(tokens, tokens[1:], strict=False):
        assert previous.span.end == current.span.start
    assert tokens[0].span.start == 0
    assert tokens[-1].span.end == len(text)


def test_offsets_are_exact() -> None:
    text = "The wind moved."
    tokens = tokenize(text)
    for token in tokens:
        assert text[token.span.start : token.span.end] == token.raw
    assert tokens[0].span.start == 0
    assert tokens[0].span.end == 3


def test_contraction_is_one_token() -> None:
    assert words("don't") == ["DON'T"]
    assert words("I'm sure") == ["I'M", "SURE"]


def test_curly_apostrophe_normalizes_to_ascii() -> None:
    text = normalize_characters("don’t")
    assert words(text) == ["DON'T"]
    # The raw form keeps whatever the caller passed as canonical source.
    tokens = tokenize("don’t", normalize_characters("don’t"))
    assert tokens[0].raw == "don’t"
    assert tokens[0].normalized == "DON'T"


def test_hyphenated_compound_is_one_token() -> None:
    assert words("mother-in-law") == ["MOTHER-IN-LAW"]


def test_trailing_apostrophe_is_punctuation() -> None:
    tokens = tokenize("the dogs' bowls")
    assert [t.kind for t in tokens if t.kind is not TokenKind.WHITESPACE] == [
        TokenKind.WORD,
        TokenKind.WORD,
        TokenKind.PUNCTUATION,
        TokenKind.WORD,
    ]


def test_leading_apostrophe_is_punctuation() -> None:
    tokens = tokenize("'quoted'")
    assert tokens[0].kind is TokenKind.PUNCTUATION
    assert tokens[1].raw == "quoted"
    assert tokens[2].kind is TokenKind.PUNCTUATION


def test_quoted_word_splits_into_four_tokens() -> None:
    tokens = tokenize('"Hello,"')
    assert [(t.raw, t.kind) for t in tokens] == [
        ('"', TokenKind.PUNCTUATION),
        ("Hello", TokenKind.WORD),
        (",", TokenKind.PUNCTUATION),
        ('"', TokenKind.PUNCTUATION),
    ]


def test_trailing_hyphen_is_punctuation() -> None:
    tokens = tokenize("well- done")
    assert tokens[0].raw == "well"
    assert tokens[1].kind is TokenKind.PUNCTUATION


def test_paragraph_break_detected() -> None:
    tokens = tokenize("One.\n\nTwo.")
    breaks = [t for t in tokens if t.kind is TokenKind.PARAGRAPH_BREAK]
    assert len(breaks) == 1
    assert breaks[0].raw == "\n\n"


def test_single_newline_is_plain_whitespace() -> None:
    tokens = tokenize("One\nTwo")
    assert [t.kind for t in tokens] == [
        TokenKind.WORD,
        TokenKind.WHITESPACE,
        TokenKind.WORD,
    ]


@pytest.mark.parametrize("text", ["cost 5 dollars", "50%", "a+b", "café 中", "\U0001f600"])
def test_unsupported_characters_are_flagged(text: str) -> None:
    assert unsupported_tokens(tokenize(text))


def test_unsupported_run_groups_into_one_token() -> None:
    tokens = unsupported_tokens(tokenize("cost $1234 today"))
    assert len(tokens) == 1
    assert tokens[0].raw == "$1234"


def test_em_dash_is_punctuation_not_a_joiner() -> None:
    tokens = tokenize("wind—swept")
    assert [t.kind for t in tokens] == [
        TokenKind.WORD,
        TokenKind.PUNCTUATION,
        TokenKind.WORD,
    ]


def test_windows_line_endings_are_canonicalized() -> None:
    canonical = canonicalize_source("One.\r\n\r\nTwo.")
    assert "\r" not in canonical
    tokens = tokenize(canonical)
    assert "".join(t.raw for t in tokens) == canonical


def test_normalized_text_must_match_length() -> None:
    with pytest.raises(ValueError, match="same length"):
        tokenize("abc", "ab")


def test_empty_input() -> None:
    assert tokenize("") == ()
