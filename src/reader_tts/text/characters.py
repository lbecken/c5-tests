"""Character policy and offset-preserving normalization.

Two distinct operations live here:

``canonicalize_source``
    Applied once, when text enters the application. It only rewrites line
    endings, so the result becomes *the* source of truth: every offset stored
    anywhere in the system indexes into this string.

``normalize_characters``
    A strictly one-to-one character mapping applied on top of the canonical
    source. Because it never changes the length of the text, token spans taken
    from the normalized form are valid offsets into the canonical source, and
    the original text remains available unchanged for display.
"""

from __future__ import annotations

from typing import Final

# --- Character classes --------------------------------------------------------

ASCII_APOSTROPHE: Final = "'"
ASCII_QUOTE: Final = '"'
ASCII_HYPHEN: Final = "-"
EN_DASH: Final = "–"
EM_DASH: Final = "—"

#: Characters normalized to the ASCII apostrophe.
APOSTROPHE_VARIANTS: Final = frozenset("’ʼ‘")

#: Characters normalized to the ASCII double quote.
QUOTE_VARIANTS: Final = frozenset("“”„«»")

#: Characters normalized to the ASCII hyphen-minus. These join word parts.
HYPHEN_VARIANTS: Final = frozenset("‐‑­")

#: Dash characters that separate phrases rather than joining word parts.
DASHES: Final = frozenset({EN_DASH, EM_DASH})

#: Punctuation accepted by Version 1 (specification 2.1).
SUPPORTED_PUNCTUATION: Final = frozenset(
    {".", ",", "?", "!", ":", ";", "(", ")", ASCII_QUOTE, ASCII_APOSTROPHE, EN_DASH, EM_DASH}
)

#: Punctuation that can terminate a sentence.
TERMINAL_PUNCTUATION: Final = frozenset({".", "?", "!"})

#: Punctuation permitted between a terminator and the following whitespace.
CLOSING_PUNCTUATION: Final = frozenset({")", ASCII_QUOTE, ASCII_APOSTROPHE})

#: Whitespace characters accepted in input.
SUPPORTED_WHITESPACE: Final = frozenset({" ", "\t", "\n"})

#: One-to-one replacements applied by :func:`normalize_characters`. Every key
#: and value is exactly one character wide so that offsets are preserved.
NORMALIZATION_TABLE: Final[dict[str, str]] = {
    **dict.fromkeys(APOSTROPHE_VARIANTS, ASCII_APOSTROPHE),
    **dict.fromkeys(QUOTE_VARIANTS, ASCII_QUOTE),
    **dict.fromkeys(HYPHEN_VARIANTS, ASCII_HYPHEN),
    "\u2026": ".",  # horizontal ellipsis -> period
    "\u00a0": " ",  # no-break space
    "\u2009": " ",  # thin space
    "\u202f": " ",  # narrow no-break space
    "\u2028": "\n",  # line separator
    "\u2029": "\n",  # paragraph separator
    "\u000b": "\n",  # vertical tab
    "\u000c": "\n",  # form feed
}

_TRANSLATION: Final = str.maketrans(NORMALIZATION_TABLE)


def canonicalize_source(raw: str) -> str:
    """Return *raw* with Windows and classic Mac line endings converted to ``\\n``.

    This is the only transformation that may change the length of the input. It
    is applied once, before anything is stored, so that the stored text and all
    recorded offsets agree.
    """
    if "\r" not in raw:
        return raw
    return raw.replace("\r\n", "\n").replace("\r", "\n")


def normalize_characters(canonical: str) -> str:
    """Apply the one-to-one normalization table to canonical source text.

    The returned string always has the same length as *canonical*, so a span
    taken from it addresses the same characters in the canonical source.
    """
    return canonical.translate(_TRANSLATION)


def is_letter(char: str) -> bool:
    """Whether *char* is an ASCII letter."""
    return ("a" <= char <= "z") or ("A" <= char <= "Z")


def is_supported_punctuation(char: str) -> bool:
    """Whether *char* is punctuation Version 1 accepts."""
    return char in SUPPORTED_PUNCTUATION


def is_supported_whitespace(char: str) -> bool:
    """Whether *char* is accepted whitespace."""
    return char in SUPPORTED_WHITESPACE


def is_word_joiner(char: str) -> bool:
    """Whether *char* may appear inside a word between two letters."""
    return char in {ASCII_APOSTROPHE, ASCII_HYPHEN}


def is_supported_character(char: str) -> bool:
    """Whether a normalized character is acceptable anywhere in the input."""
    return (
        is_letter(char)
        or is_supported_punctuation(char)
        or is_supported_whitespace(char)
        or char == ASCII_HYPHEN
    )


def describe_character(char: str) -> str:
    """Return a human-readable reason why *char* is rejected."""
    if char.isdigit():
        return "digits are not supported; write numbers as words"
    if char.isspace():
        return "unsupported whitespace character"
    if not char.isprintable():
        return "control characters are not supported"
    category = {
        "$": "currency symbols are not supported",
        "£": "currency symbols are not supported",
        "€": "currency symbols are not supported",
        "%": "the percent sign is not supported; write it as a word",
        "&": "the ampersand is not supported; write 'and'",
        "@": "the at sign is not supported",
        "/": "the slash is not supported",
        "+": "mathematical symbols are not supported",
        "=": "mathematical symbols are not supported",
        "*": "the asterisk is not supported",
        "#": "the number sign is not supported",
        "<": "markup characters are not supported",
        ">": "markup characters are not supported",
        "[": "square brackets are not supported",
        "]": "square brackets are not supported",
        "{": "braces are not supported",
        "}": "braces are not supported",
        "_": "the underscore is not supported",
        "\\": "the backslash is not supported",
        "|": "the vertical bar is not supported",
        "~": "the tilde is not supported",
    }.get(char)
    if category is not None:
        return category
    if ord(char) > 0x2FFF or not char.isascii():
        return "character is outside the supported Latin script"
    return "character is not supported"
