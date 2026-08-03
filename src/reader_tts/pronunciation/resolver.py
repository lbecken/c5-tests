"""Pronunciation resolution.

Resolution order:

1. document-specific user override;
2. global user override;
3. user-selected dictionary variant;
4. the first dictionary pronunciation;
5. decomposition of a hyphenated or elided word;
6. unsupported-word error.

The dictionary and its notation come from the language pack, so the same rules
apply to English ARPAbet and French IPA alike.
"""

from __future__ import annotations

from collections.abc import Mapping

from reader_tts.domain.enums import OverrideScope, PronunciationSource
from reader_tts.domain.errors import ValidationError
from reader_tts.domain.models import PronunciationOverride, ResolvedPronunciation
from reader_tts.pronunciation.dictionary import PronunciationDictionary
from reader_tts.pronunciation.overrides import OverrideRepository
from reader_tts.pronunciation.phonemes import inventory_for
from reader_tts.text.validator import WordSupport


class PronunciationResolver:
    """Resolves words to pronunciations, honouring user overrides.

    The resolver satisfies :class:`~reader_tts.text.validator.WordResolver`, so
    the validator can use it without importing this module's types.
    """

    def __init__(
        self,
        dictionary: PronunciationDictionary,
        overrides: OverrideRepository | None = None,
        document_id: str | None = None,
        variant_selections: Mapping[str, int] | None = None,
    ) -> None:
        self._dictionary = dictionary
        self._overrides = overrides
        self._document_id = document_id
        self._variant_selections = {
            word.upper(): index for word, index in (variant_selections or {}).items()
        }
        self._override_cache: dict[tuple[str, OverrideScope], PronunciationOverride | None] = {}
        self._inventory = inventory_for(dictionary.notation)

    @property
    def dictionary(self) -> PronunciationDictionary:
        """The dictionary backing this resolver."""
        return self._dictionary

    @property
    def document_id(self) -> str | None:
        """Document whose overrides take precedence, when set."""
        return self._document_id

    def for_document(self, document_id: str | None) -> PronunciationResolver:
        """Return a resolver bound to *document_id*, sharing the dictionary."""
        return PronunciationResolver(
            dictionary=self._dictionary,
            overrides=self._overrides,
            document_id=document_id,
            variant_selections=self._variant_selections,
        )

    def with_selection(self, word: str, variant_index: int) -> PronunciationResolver:
        """Return a resolver that additionally selects a variant for *word*."""
        selections = dict(self._variant_selections)
        selections[word.upper()] = variant_index
        return PronunciationResolver(
            dictionary=self._dictionary,
            overrides=self._overrides,
            document_id=self._document_id,
            variant_selections=selections,
        )

    # --- WordResolver protocol -------------------------------------------------

    def check_word(self, normalized_word: str) -> WordSupport:
        """Report whether *normalized_word* can be pronounced."""
        word = normalized_word.upper()
        if self._find_override(word) is not None:
            return WordSupport(supported=True)

        entry = self._dictionary.lookup(word)
        if entry is not None:
            return WordSupport(
                supported=True,
                is_ambiguous=entry.is_ambiguous and word not in self._variant_selections,
                alternatives=tuple(
                    self._inventory.format(p.phonemes) for p in entry.pronunciations
                ),
            )

        compound = self._dictionary.resolve_compound(word)
        if compound is not None:
            return WordSupport(supported=True)

        return WordSupport(
            supported=False,
            reason=(
                f"'{normalized_word}' is not in the pronunciation dictionary; "
                "add a pronunciation override or rewrite the word"
            ),
        )

    # --- Full resolution -------------------------------------------------------

    def resolve(self, normalized_word: str) -> ResolvedPronunciation:
        """Resolve one word to the pronunciation that will be used.

        Raises:
            ValidationError: If the word is unsupported.
        """
        word = normalized_word.upper()
        entry = self._dictionary.lookup(word)
        alternatives = entry.pronunciations if entry is not None else ()
        ambiguous = entry is not None and entry.is_ambiguous

        override = self._find_override(word)
        if override is not None:
            source = (
                PronunciationSource.DOCUMENT_OVERRIDE
                if override.scope is OverrideScope.DOCUMENT
                else PronunciationSource.GLOBAL_OVERRIDE
            )
            return ResolvedPronunciation(
                word=word,
                phonemes=override.phonemes,
                source=source,
                variant_index=None,
                is_ambiguous=ambiguous,
                alternatives=alternatives,
                synthesis_text=override.synthesis_text,
            )

        selected = self._variant_selections.get(word)
        if selected is not None and entry is not None:
            if not 0 <= selected < len(entry.pronunciations):
                raise ValidationError(
                    f"variant {selected} does not exist for '{normalized_word}'; "
                    f"it has {len(entry.pronunciations)} pronunciations"
                )
            return ResolvedPronunciation(
                word=word,
                phonemes=entry.pronunciations[selected].phonemes,
                source=PronunciationSource.USER_VARIANT,
                variant_index=selected,
                is_ambiguous=ambiguous,
                alternatives=alternatives,
            )

        if entry is not None:
            return ResolvedPronunciation(
                word=word,
                phonemes=entry.pronunciations[0].phonemes,
                source=PronunciationSource.DICTIONARY,
                variant_index=0,
                is_ambiguous=ambiguous,
                alternatives=alternatives,
            )

        compound = self._dictionary.resolve_compound(word)
        if compound is not None:
            return ResolvedPronunciation(
                word=word,
                phonemes=compound.phonemes,
                source=PronunciationSource.COMPOUND,
                variant_index=None,
                is_ambiguous=False,
                alternatives=(),
            )

        raise ValidationError(f"'{normalized_word}' is not in the pronunciation dictionary")

    def synthesis_replacements(self, words: frozenset[str]) -> dict[str, str]:
        """Return respellings to apply to synthesis text.

        Only overrides that carry a ``synthesis_text`` produce an entry, because
        phonemes alone cannot steer the engine.
        """
        replacements: dict[str, str] = {}
        for word in words:
            override = self._find_override(word.upper())
            if override is not None and override.synthesis_text:
                replacements[word.upper()] = override.synthesis_text
        return replacements

    def override_revision(self) -> str:
        """Token identifying the current override state, for cache keys."""
        if self._overrides is None:
            return "none"
        selections = ",".join(
            f"{word}={index}" for word, index in sorted(self._variant_selections.items())
        )
        return f"{self._overrides.revision(self._document_id)}|{selections}"

    # --- Internals -------------------------------------------------------------

    def _find_override(self, word: str) -> PronunciationOverride | None:
        if self._overrides is None:
            return None
        if self._document_id is not None:
            document_override = self._cached(word, OverrideScope.DOCUMENT)
            if document_override is not None:
                return document_override
        return self._cached(word, OverrideScope.GLOBAL)

    def _cached(self, word: str, scope: OverrideScope) -> PronunciationOverride | None:
        key = (word, scope)
        if key not in self._override_cache:
            assert self._overrides is not None
            document_id = self._document_id if scope is OverrideScope.DOCUMENT else None
            self._override_cache[key] = self._overrides.get(word, scope, document_id)
        return self._override_cache[key]
