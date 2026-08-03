"""In-memory pronunciation dictionary with compound and elision decomposition.

One class serves every language. What differs — which file to read, which
loader parses it, whether elision applies — comes from the language pack, not
from branching here.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from reader_tts.domain.enums import LanguageCode, PhonemeNotation
from reader_tts.domain.models import DictionaryEntry, DictionaryInfo, Pronunciation
from reader_tts.languages.base import LanguagePack
from reader_tts.pronunciation.cmudict_loader import LoadedDictionary
from reader_tts.pronunciation.cmudict_loader import load_dictionary as load_cmudict
from reader_tts.pronunciation.ipadict_loader import load_dictionary as load_ipadict
from reader_tts.text.characters import ASCII_APOSTROPHE


@dataclass(frozen=True, slots=True)
class CompoundResolution:
    """A word accepted by decomposing it into parts that are in the dictionary.

    ``kind`` records how: ``hyphen`` for ``mother-in-law``, ``elision`` for the
    French ``l'homme``, ``ligature`` for ``oeufs`` written without its ligature.
    """

    word: str
    components: tuple[str, ...]
    phonemes: tuple[str, ...]
    kind: str = "hyphen"


class PronunciationDictionary:
    """Read-only lookup over a loaded dictionary.

    Words are keyed by their uppercase normalized form, matching
    :attr:`~reader_tts.domain.models.Token.normalized`.
    """

    def __init__(self, loaded: LoadedDictionary, pack: LanguagePack | None = None) -> None:
        self._loaded = loaded
        self._pack = pack

    @classmethod
    def from_directory(cls, directory: Path) -> PronunciationDictionary:
        """Load a CMUdict-format dictionary from *directory*.

        Retained for the English path and for tests that supply their own file.
        """
        return cls(load_cmudict(directory))

    @classmethod
    def for_language(cls, pack: LanguagePack, data_dir: Path) -> PronunciationDictionary:
        """Load the dictionary a language pack names."""
        directory = pack.dictionary.directory(data_dir)
        if pack.dictionary.loader == "ipadict":
            loaded = load_ipadict(directory, filename=pack.dictionary.filename)
        else:
            loaded = load_cmudict(directory)
        return cls(loaded, pack)

    # --- Metadata --------------------------------------------------------------

    @property
    def language(self) -> LanguageCode | None:
        """The language this dictionary was loaded for, when it is known."""
        return self._pack.code if self._pack is not None else None

    @property
    def notation(self) -> PhonemeNotation:
        """The notation pronunciations are written in."""
        if self._pack is not None:
            return self._pack.notation
        return PhonemeNotation.ARPABET

    @property
    def info(self) -> DictionaryInfo:
        """Metadata for the health route and the CLI."""
        return DictionaryInfo(
            name=self._pack.dictionary.name if self._pack is not None else "cmudict",
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

    # --- Lookup ------------------------------------------------------------------

    def lookup(self, normalized_word: str) -> DictionaryEntry | None:
        """Return the entry for *normalized_word*, or ``None`` when absent.

        Only the exact spelling is consulted; decomposition is handled by
        :meth:`resolve_compound`.
        """
        return self._loaded.entries.get(normalized_word.upper())

    def resolve_compound(self, normalized_word: str) -> CompoundResolution | None:
        """Resolve a word the dictionary lacks by decomposing it.

        Hyphenated words are split into components, each of which must be in the
        dictionary. In a language with elision, a word may instead be split at an
        apostrophe into a known clitic plus the word it attaches to.

        Returns:
            The resolution, or ``None`` when the word cannot be decomposed.
        """
        word = normalized_word.upper()
        elision = self._resolve_elision(word)
        if elision is not None:
            return elision
        hyphenated = self._resolve_hyphenated(word)
        if hyphenated is not None:
            return hyphenated
        return self._resolve_ligature(word)

    def _resolve_hyphenated(self, word: str) -> CompoundResolution | None:
        if "-" not in word:
            return None
        components = tuple(part for part in word.split("-") if part)
        if len(components) < 2:
            return None

        phonemes: list[str] = []
        for component in components:
            entry = self._loaded.entries.get(component)
            if entry is None:
                # A component may itself need decomposing, as in 'est-ce'.
                nested = self._resolve_elision(component)
                if nested is None:
                    return None
                phonemes.extend(nested.phonemes)
                continue
            phonemes.extend(entry.pronunciations[0].phonemes)
        return CompoundResolution(
            word=word, components=components, phonemes=tuple(phonemes), kind="hyphen"
        )

    def _resolve_ligature(self, word: str) -> CompoundResolution | None:
        """Retry a lookup with the language's ligatures restored.

        Typing 'oeufs' rather than 'œufs' is an orthographic accident, not a
        different word, so the folded spelling is accepted and recorded.
        """
        if self._pack is None or not self._pack.spelling_variants:
            return None
        folded = word
        for plain, ligature in self._pack.spelling_variants:
            folded = folded.replace(plain, ligature)
        if folded == word:
            return None
        entry = self._loaded.entries.get(folded)
        if entry is None:
            return None
        return CompoundResolution(
            word=word,
            components=(folded,),
            phonemes=entry.pronunciations[0].phonemes,
            kind="ligature",
        )

    def _resolve_elision(self, word: str) -> CompoundResolution | None:
        """Split a French elided form into its clitic and the following word."""
        if self._pack is None or not self._pack.supports_elision:
            return None
        if ASCII_APOSTROPHE not in word:
            return None

        head, _, tail = word.partition(ASCII_APOSTROPHE)
        clitic = f"{head}{ASCII_APOSTROPHE}"
        clitic_phonemes = self._pack.elision_clitics.get(clitic)
        if clitic_phonemes is None or not tail:
            return None

        entry = self._loaded.entries.get(tail)
        if entry is None:
            ligature = self._resolve_ligature(tail)
            if ligature is None:
                return None
            return CompoundResolution(
                word=word,
                components=(clitic, tail),
                phonemes=(*clitic_phonemes, *ligature.phonemes),
                kind="elision",
            )
        return CompoundResolution(
            word=word,
            components=(clitic, tail),
            phonemes=(*clitic_phonemes, *entry.pronunciations[0].phonemes),
            kind="elision",
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
        """Whether the word can be pronounced directly or by decomposition."""
        return (
            self.lookup(normalized_word) is not None
            or self.resolve_compound(normalized_word) is not None
        )
