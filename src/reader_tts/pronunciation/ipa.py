"""The French IPA phoneme inventory.

Where English uses ARPAbet, French uses IPA — the notation the bundled
dictionary is written in, and the same notation the speech engine reports for
the phonemes it actually chose. Keeping them in one alphabet means the two can
be compared directly, which is what makes the reader useful for learning.

Phonemes are not single characters: a nasal vowel is a base vowel plus a
combining tilde, so the inventory is defined over *units* and parsing walks the
string attaching combining marks to the base they modify.
"""

from __future__ import annotations

from typing import Final

from reader_tts.domain.errors import InvalidPhonemeError

#: Marks that attach to the preceding base character rather than standing alone.
COMBINING_MARKS: Final = frozenset({"̃", "ː"})  # nasal tilde, length

#: Oral vowels.
ORAL_VOWELS: Final = frozenset({"a", "ɑ", "e", "ɛ", "i", "ɔ", "o", "u", "y", "ø", "œ", "ə"})

#: Nasal vowels, each a base vowel plus U+0303.
NASAL_VOWELS: Final = frozenset({"ɑ̃", "ɛ̃", "ɔ̃", "œ̃"})

#: Vowels borrowed in loanwords; rare but present in the dictionary.
LOAN_VOWELS: Final = frozenset({"ɪ", "ʊ"})

VOWELS: Final = ORAL_VOWELS | NASAL_VOWELS | LOAN_VOWELS

#: Semivowels, or glides.
SEMIVOWELS: Final = frozenset({"j", "w", "ɥ"})

#: Consonants.
CONSONANTS: Final = frozenset(
    {
        "p",
        "b",
        "t",
        "d",
        "k",
        "g",
        "f",
        "v",
        "s",
        "z",
        "ʃ",
        "ʒ",
        "m",
        "n",
        "ɲ",
        "ŋ",
        "l",
        "ʁ",
        "x",
    }
)

#: Every accepted phoneme unit.
PHONEME_INVENTORY: Final = VOWELS | SEMIVOWELS | CONSONANTS

#: One-to-one repairs applied before validation. The dictionary mixes two
#: encodings of the voiced velar stop, and marks a few entries with a modifier
#: apostrophe that carries no phonemic content.
NORMALIZATION: Final[dict[str, str]] = {
    "ɡ": "g",  # LATIN SMALL LETTER SCRIPT G -> plain g
    "ʼ": "",  # MODIFIER LETTER APOSTROPHE -> dropped
}


def normalize_ipa(text: str) -> str:
    """Apply the one-to-one repairs to a raw IPA string."""
    for source, target in NORMALIZATION.items():
        if source in text:
            text = text.replace(source, target)
    return text


def segment(text: str) -> tuple[str, ...]:
    """Split an IPA string into phoneme units.

    Combining marks are attached to the base character they modify, so ``ɑ̃``
    is one unit rather than two.
    """
    units: list[str] = []
    position = 0
    cleaned = normalize_ipa(text)
    while position < len(cleaned):
        char = cleaned[position]
        position += 1
        if char.isspace() or char == "/":
            continue
        while position < len(cleaned) and cleaned[position] in COMBINING_MARKS:
            char += cleaned[position]
            position += 1
        units.append(char)
    return tuple(units)


def is_valid_phoneme(symbol: str) -> bool:
    """Whether *symbol* is a member of the supported French IPA inventory."""
    return _strip_length(symbol) in PHONEME_INVENTORY


def is_vowel(symbol: str) -> bool:
    """Whether *symbol* is a vowel, oral or nasal."""
    return _strip_length(symbol) in VOWELS


def is_nasal(symbol: str) -> bool:
    """Whether *symbol* is one of the four French nasal vowels."""
    return _strip_length(symbol) in NASAL_VOWELS


def validate_phonemes(phonemes: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    """Validate and normalize a French pronunciation.

    Args:
        phonemes: Candidate IPA units.

    Returns:
        The units, normalized.

    Raises:
        InvalidPhonemeError: If the sequence is empty or holds an unknown unit.
    """
    if not phonemes:
        raise InvalidPhonemeError("a pronunciation must contain at least one phoneme")

    units: list[str] = []
    for entry in phonemes:
        units.extend(segment(entry))
    if not units:
        raise InvalidPhonemeError("a pronunciation must contain at least one phoneme")

    unknown = [unit for unit in units if not is_valid_phoneme(unit)]
    if unknown:
        joined = ", ".join(f"{unit!r}" for unit in unknown)
        raise InvalidPhonemeError(f"unknown IPA symbol(s): {joined}")
    if not any(is_vowel(unit) for unit in units):
        raise InvalidPhonemeError("a pronunciation must contain at least one vowel")
    return tuple(units)


def parse_ipa(text: str) -> tuple[str, ...]:
    """Parse an IPA string, with or without slashes, into validated units."""
    return validate_phonemes(segment(text.strip().strip("/")))


def format_ipa(phonemes: tuple[str, ...]) -> str:
    """Render validated units as an IPA string.

    French IPA is conventionally written without separators between phonemes,
    unlike ARPAbet.
    """
    return "".join(phonemes)


def _strip_length(symbol: str) -> str:
    """Return *symbol* without a trailing length mark."""
    return symbol.removesuffix("ː")
