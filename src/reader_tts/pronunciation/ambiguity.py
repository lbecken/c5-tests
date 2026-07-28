"""Reporting of words that carry several dictionary pronunciations.

Version 1 deliberately performs no grammatical disambiguation. An ambiguous
word takes its first dictionary pronunciation, is reported to the user, and can
be overridden.
"""

from __future__ import annotations

from dataclasses import dataclass

from reader_tts.domain.models import Pronunciation, Token
from reader_tts.pronunciation.arpabet import format_arpabet
from reader_tts.pronunciation.dictionary import PronunciationDictionary

#: Words whose distinct readings are common enough to be worth naming in the
#: user interface. This list is documentation, not behaviour: nothing is
#: resolved automatically.
NOTABLE_HOMOGRAPHS: frozenset[str] = frozenset(
    {
        "READ",
        "RECORD",
        "PRESENT",
        "OBJECT",
        "CLOSE",
        "LIVE",
        "LEAD",
        "WIND",
        "TEAR",
        "DOES",
        "BOW",
        "MINUTE",
        "CONTENT",
        "DESERT",
        "PRODUCE",
        "REFUSE",
        "SUBJECT",
        "USE",
    }
)


@dataclass(frozen=True, slots=True)
class AmbiguousWord:
    """One word that the dictionary pronounces in more than one way."""

    word: str
    alternatives: tuple[Pronunciation, ...]
    occurrences: tuple[Token, ...]
    is_notable_homograph: bool

    @property
    def arpabet_alternatives(self) -> tuple[str, ...]:
        """Every alternative rendered as an ARPAbet string."""
        return tuple(format_arpabet(p.phonemes) for p in self.alternatives)

    @property
    def count(self) -> int:
        """How often the word appears in the analysed text."""
        return len(self.occurrences)


def collect_ambiguities(
    tokens: tuple[Token, ...], dictionary: PronunciationDictionary
) -> tuple[AmbiguousWord, ...]:
    """Group ambiguous word tokens by their normalized form.

    Args:
        tokens: Tokens from :func:`~reader_tts.text.tokenizer.tokenize`.
        dictionary: The loaded pronunciation dictionary.

    Returns:
        One entry per distinct ambiguous word, in first-appearance order.
    """
    occurrences: dict[str, list[Token]] = {}
    for token in tokens:
        if not token.is_word:
            continue
        if dictionary.is_ambiguous(token.normalized):
            occurrences.setdefault(token.normalized, []).append(token)

    return tuple(
        AmbiguousWord(
            word=word,
            alternatives=dictionary.pronunciations(word),
            occurrences=tuple(found),
            is_notable_homograph=word in NOTABLE_HOMOGRAPHS,
        )
        for word, found in occurrences.items()
    )
