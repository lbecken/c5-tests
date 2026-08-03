"""Notation-independent access to a language's phoneme inventory.

English pronunciations are ARPAbet (``L EH1 D``), French are IPA (``ɑ̃``). The
rest of the application — overrides, the resolver, the API — should not care
which, so each notation is wrapped in one small object with the same shape.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Final

from reader_tts.domain.enums import PhonemeNotation
from reader_tts.pronunciation import arpabet, ipa


@dataclass(frozen=True, slots=True)
class PhonemeInventory:
    """One notation's validation, parsing and formatting rules."""

    notation: PhonemeNotation
    validate: Callable[[tuple[str, ...] | list[str]], tuple[str, ...]]
    parse: Callable[[str], tuple[str, ...]]
    format: Callable[[tuple[str, ...]], str]
    is_valid_symbol: Callable[[str], bool]
    is_vowel: Callable[[str], bool]
    #: Example pronunciation, shown as placeholder text in the override editor.
    example: str

    def describe(self, phonemes: tuple[str, ...]) -> str:
        """Render a pronunciation for display."""
        return self.format(phonemes)


ARPABET_INVENTORY: Final = PhonemeInventory(
    notation=PhonemeNotation.ARPABET,
    validate=arpabet.validate_phonemes,
    parse=arpabet.parse_arpabet,
    format=arpabet.format_arpabet,
    is_valid_symbol=arpabet.is_valid_phoneme,
    is_vowel=arpabet.is_vowel,
    example="L EH1 D",
)

IPA_INVENTORY: Final = PhonemeInventory(
    notation=PhonemeNotation.IPA,
    validate=ipa.validate_phonemes,
    parse=ipa.parse_ipa,
    format=ipa.format_ipa,
    is_valid_symbol=ipa.is_valid_phoneme,
    is_vowel=ipa.is_vowel,
    example="lə vɑ̃",
)

_BY_NOTATION: Final[dict[PhonemeNotation, PhonemeInventory]] = {
    PhonemeNotation.ARPABET: ARPABET_INVENTORY,
    PhonemeNotation.IPA: IPA_INVENTORY,
}


def inventory_for(notation: PhonemeNotation) -> PhonemeInventory:
    """Return the inventory implementing *notation*."""
    return _BY_NOTATION[notation]
