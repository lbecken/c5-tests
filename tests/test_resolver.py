"""Pronunciation resolution, precedence and override storage tests."""

from __future__ import annotations

import pytest

from reader_tts.domain.enums import OverrideScope, PronunciationSource
from reader_tts.domain.errors import InvalidPhonemeError, ValidationError
from reader_tts.pronunciation.dictionary import PronunciationDictionary
from reader_tts.pronunciation.overrides import OverrideRepository
from reader_tts.pronunciation.resolver import PronunciationResolver


def test_dictionary_default_is_first_variant(resolver: PronunciationResolver) -> None:
    resolved = resolver.resolve("READ")
    assert resolved.phonemes == ("R", "IY1", "D")
    assert resolved.source is PronunciationSource.DICTIONARY
    assert resolved.variant_index == 0
    assert resolved.is_ambiguous


def test_unambiguous_word_is_not_marked_ambiguous(resolver: PronunciationResolver) -> None:
    assert not resolver.resolve("CAT").is_ambiguous


def test_alternatives_are_exposed(resolver: PronunciationResolver) -> None:
    assert len(resolver.resolve("RECORD").alternatives) == 2


def test_user_variant_selection(resolver: PronunciationResolver) -> None:
    selected = resolver.with_selection("READ", 1).resolve("READ")
    assert selected.phonemes == ("R", "EH1", "D")
    assert selected.source is PronunciationSource.USER_VARIANT
    assert selected.variant_index == 1


def test_invalid_variant_selection_raises(resolver: PronunciationResolver) -> None:
    with pytest.raises(ValidationError, match="does not exist"):
        resolver.with_selection("READ", 7).resolve("READ")


def test_global_override_beats_dictionary(
    resolver: PronunciationResolver, overrides: OverrideRepository
) -> None:
    overrides.upsert("READ", ["R", "EH1", "D"], synthesis_text="red")
    resolved = resolver.resolve("READ")
    assert resolved.source is PronunciationSource.GLOBAL_OVERRIDE
    assert resolved.phonemes == ("R", "EH1", "D")
    assert resolved.synthesis_text == "red"


def test_document_override_beats_global(
    sample_dictionary: PronunciationDictionary, overrides: OverrideRepository
) -> None:
    overrides.upsert("READ", ["R", "EH1", "D"])
    overrides.upsert(
        "READ", ["R", "IY1", "D"], scope=OverrideScope.DOCUMENT, document_id="doc-1"
    )
    resolver = PronunciationResolver(sample_dictionary, overrides, document_id="doc-1")
    resolved = resolver.resolve("READ")
    assert resolved.source is PronunciationSource.DOCUMENT_OVERRIDE
    assert resolved.phonemes == ("R", "IY1", "D")


def test_document_override_does_not_leak_to_other_documents(
    sample_dictionary: PronunciationDictionary, overrides: OverrideRepository
) -> None:
    overrides.upsert(
        "CAT", ["K", "AE1", "T", "S"], scope=OverrideScope.DOCUMENT, document_id="doc-1"
    )
    other = PronunciationResolver(sample_dictionary, overrides, document_id="doc-2")
    assert other.resolve("CAT").source is PronunciationSource.DICTIONARY


def test_override_beats_user_variant(
    sample_dictionary: PronunciationDictionary, overrides: OverrideRepository
) -> None:
    overrides.upsert("READ", ["R", "EH1", "D"])
    resolver = PronunciationResolver(
        sample_dictionary, overrides, variant_selections={"READ": 0}
    )
    assert resolver.resolve("READ").source is PronunciationSource.GLOBAL_OVERRIDE


def test_compound_decomposition_is_last_resort(resolver: PronunciationResolver) -> None:
    resolved = resolver.resolve("CAT-MAT")
    assert resolved.source is PronunciationSource.COMPOUND
    assert resolved.phonemes == ("K", "AE1", "T", "M", "AE1", "T")


def test_missing_word_raises(resolver: PronunciationResolver) -> None:
    with pytest.raises(ValidationError, match="not in the pronunciation dictionary"):
        resolver.resolve("FROBNICATOR")


def test_check_word_reports_support(resolver: PronunciationResolver) -> None:
    assert resolver.check_word("CAT").supported
    assert not resolver.check_word("FROBNICATOR").supported
    assert resolver.check_word("READ").is_ambiguous
    assert resolver.check_word("CAT-MAT").supported


def test_check_word_honours_override_for_unknown_word(
    resolver: PronunciationResolver, overrides: OverrideRepository
) -> None:
    assert not resolver.check_word("FROBNICATOR").supported
    overrides.upsert("FROBNICATOR", ["F", "R", "AA1", "B"])
    fresh = resolver.for_document(None)
    assert fresh.check_word("FROBNICATOR").supported


def test_selected_variant_clears_ambiguity_warning(resolver: PronunciationResolver) -> None:
    assert not resolver.with_selection("READ", 1).check_word("READ").is_ambiguous


# --- Override repository ------------------------------------------------------------


def test_invalid_override_phonemes_rejected(overrides: OverrideRepository) -> None:
    with pytest.raises(InvalidPhonemeError):
        overrides.upsert("CAT", ["K", "QQ", "T"])


def test_override_scope_validation(overrides: OverrideRepository) -> None:
    with pytest.raises(ValidationError):
        overrides.upsert("CAT", ["K", "AE1", "T"], scope=OverrideScope.DOCUMENT)
    with pytest.raises(ValidationError):
        overrides.upsert("CAT", ["K", "AE1", "T"], document_id="doc-1")


def test_override_upsert_updates_in_place(overrides: OverrideRepository) -> None:
    first = overrides.upsert("CAT", ["K", "AE1", "T"], note="one")
    second = overrides.upsert("CAT", ["K", "AA1", "T"], note="two")
    assert first.id == second.id
    assert second.phonemes == ("K", "AA1", "T")
    assert second.note == "two"
    assert second.created_at == first.created_at
    assert len(overrides.list_all()) == 1


def test_override_delete(overrides: OverrideRepository) -> None:
    overrides.upsert("CAT", ["K", "AE1", "T"])
    assert overrides.delete("CAT", OverrideScope.GLOBAL)
    assert not overrides.delete("CAT", OverrideScope.GLOBAL)
    assert overrides.get("CAT", OverrideScope.GLOBAL) is None


def test_list_all_includes_global_and_document_scope(overrides: OverrideRepository) -> None:
    overrides.upsert("CAT", ["K", "AE1", "T"])
    overrides.upsert("MAT", ["M", "AE1", "T"], scope=OverrideScope.DOCUMENT, document_id="d1")
    overrides.upsert("SAT", ["S", "AE1", "T"], scope=OverrideScope.DOCUMENT, document_id="d2")
    words = {o.word for o in overrides.list_all("d1")}
    assert words == {"CAT", "MAT"}


def test_revision_changes_with_overrides(overrides: OverrideRepository) -> None:
    before = overrides.revision()
    overrides.upsert("CAT", ["K", "AE1", "T"])
    assert overrides.revision() != before


def test_synthesis_replacements(
    resolver: PronunciationResolver, overrides: OverrideRepository
) -> None:
    overrides.upsert("READ", ["R", "EH1", "D"], synthesis_text="red")
    overrides.upsert("CAT", ["K", "AE1", "T"])
    fresh = resolver.for_document(None)
    assert fresh.synthesis_replacements(frozenset({"READ", "CAT"})) == {"READ": "red"}


def test_override_revision_includes_selections(resolver: PronunciationResolver) -> None:
    assert resolver.override_revision() != resolver.with_selection("READ", 1).override_revision()
