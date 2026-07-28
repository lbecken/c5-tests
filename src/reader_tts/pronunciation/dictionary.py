"""In-memory pronunciation dictionary with compound decomposition."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from reader_tts.domain.models import DictionaryEntry, DictionaryInfo, Pronunciation
from reader_tts.pronunciation.cmudict_loader import (
    DICTIONARY_NAME,
    LoadedDictionary,
    load_dictionary,
)


@dataclass(frozen=True, slots=True)
class CompoundResolution:
    """A hyphenated word accepted by looking up each of its components."""

    word: str
    components: tuple[str, ...]
    phonemes: tuple[str, ...]


class PronunciationDictionary:
    """Read-only lookup over a loaded dictionary.

    Words are keyed by their uppercase normalized form, matching
    :attr:`~reader_tts.domain.models.Token.normalized`.
    """

    def __init__(self, loaded: LoadedDictionary) -> None:
        self._loaded = loaded

    @classmethod
    def from_directory(cls, directory: Path) -> PronunciationDictionary:
        """Load the pinned dictionary from *directory*."""
        return cls(load_dictionary(directory))

    @property
    def info(self) -> DictionaryInfo:
        """Metadata for the health route and the CLI."""
        return DictionaryInfo(
            name=DICTIONARY_NAME,
            version=self._loaded.version,
            entries=self._loaded.size,
            malformed_lines=self._loaded.malformed_lines,
        )

    @property
    def size(self) -> int:
        """Number of distinct words held in memory."""
        return self._loaded.size

    def __contains__(self, normalized_word: str) -> bool:
        return normalized_word.upper() in self._loaded.entries

    def lookup(self, normalized_word: str) -> DictionaryEntry | None:
        """Return the entry for *normalized_word*, or ``None`` when absent.

        Only the exact spelling is consulted; compounds are handled by
        :meth:`resolve_compound`.
        """
        return self._loaded.entries.get(normalized_word.upper())

    def resolve_compound(self, normalized_word: str) -> CompoundResolution | None:
        """Resolve a hyphenated word by looking up each component.

        Every component must exist in the dictionary. The concatenated phonemes
        of the first variant of each component form the compound pronunciation.

        Returns:
            The resolution, or ``None`` when the word is not hyphenated or a
            component is unknown.
        """
        word = normalized_word.upper()
        if "-" not in word:
            return None
        components = tuple(part for part in word.split("-") if part)
        if len(components) < 2:
            return None

        phonemes: list[str] = []
        for component in components:
            entry = self._loaded.entries.get(component)
            if entry is None:
                return None
            phonemes.extend(entry.pronunciations[0].phonemes)
        return CompoundResolution(
            word=word, components=components, phonemes=tuple(phonemes)
        )

    def pronunciations(self, normalized_word: str) -> tuple[Pronunciation, ...]:
        """Return every dictionary pronunciation for *normalized_word*."""
        entry = self.lookup(normalized_word)
        return entry.pronunciations if entry is not None else ()

    def is_ambiguous(self, normalized_word: str) -> bool:
        """Whether the dictionary offers several pronunciations for the word."""
        entry = self.lookup(normalized_word)
        return entry is not None and entry.is_ambiguous

    def supports(self, normalized_word: str) -> bool:
        """Whether the word can be pronounced directly or as a compound."""
        return (
            self.lookup(normalized_word) is not None
            or self.resolve_compound(normalized_word) is not None
        )
