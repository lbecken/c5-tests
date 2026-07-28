"""The CMU ARPAbet phoneme inventory and validation helpers."""

from __future__ import annotations

from typing import Final

from reader_tts.domain.errors import InvalidPhonemeError

#: Consonant symbols. These never carry a stress digit.
CONSONANTS: Final = frozenset(
    {
        "B",
        "CH",
        "D",
        "DH",
        "F",
        "G",
        "HH",
        "JH",
        "K",
        "L",
        "M",
        "N",
        "NG",
        "P",
        "R",
        "S",
        "SH",
        "T",
        "TH",
        "V",
        "W",
        "Y",
        "Z",
        "ZH",
    }
)

#: Vowel base symbols. Each may carry a stress digit 0, 1 or 2.
VOWELS: Final = frozenset(
    {
        "AA",
        "AE",
        "AH",
        "AO",
        "AW",
        "AY",
        "EH",
        "ER",
        "EY",
        "IH",
        "IY",
        "OW",
        "OY",
        "UH",
        "UW",
    }
)

#: Stress digits that may be appended to a vowel.
STRESS_DIGITS: Final = frozenset("012")

#: Every symbol accepted in a pronunciation, with stress variants expanded.
PHONEME_INVENTORY: Final = frozenset(
    CONSONANTS | {f"{vowel}{stress}" for vowel in VOWELS for stress in STRESS_DIGITS} | VOWELS
)


def is_valid_phoneme(symbol: str) -> bool:
    """Whether *symbol* is a member of the supported ARPAbet inventory."""
    return symbol in PHONEME_INVENTORY


def is_vowel(symbol: str) -> bool:
    """Whether *symbol* is a vowel, with or without a stress digit."""
    return strip_stress(symbol) in VOWELS


def strip_stress(symbol: str) -> str:
    """Return *symbol* without its trailing stress digit."""
    if symbol and symbol[-1] in STRESS_DIGITS:
        return symbol[:-1]
    return symbol


def stress_of(symbol: str) -> int | None:
    """Return the stress digit of *symbol*, or ``None`` when it carries none."""
    if symbol and symbol[-1] in STRESS_DIGITS:
        return int(symbol[-1])
    return None


def validate_phonemes(phonemes: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    """Validate and normalize a pronunciation.

    Args:
        phonemes: Candidate ARPAbet symbols, in any casing.

    Returns:
        The symbols uppercased.

    Raises:
        InvalidPhonemeError: If the sequence is empty or holds an unknown symbol.
    """
    if not phonemes:
        raise InvalidPhonemeError("a pronunciation must contain at least one phoneme")
    upper = tuple(symbol.strip().upper() for symbol in phonemes)
    unknown = [symbol for symbol in upper if not is_valid_phoneme(symbol)]
    if unknown:
        joined = ", ".join(unknown)
        raise InvalidPhonemeError(f"unknown ARPAbet symbol(s): {joined}")
    if not any(is_vowel(symbol) for symbol in upper):
        raise InvalidPhonemeError("a pronunciation must contain at least one vowel")
    return upper


def parse_arpabet(text: str) -> tuple[str, ...]:
    """Parse a space-separated ARPAbet string into validated symbols."""
    return validate_phonemes(text.split())


def format_arpabet(phonemes: tuple[str, ...]) -> str:
    """Render validated symbols as a space-separated string."""
    return " ".join(phonemes)
