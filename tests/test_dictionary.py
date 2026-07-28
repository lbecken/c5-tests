"""Dictionary loader, ARPAbet validation and lookup tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from reader_tts.domain.errors import DictionaryNotFoundError, InvalidPhonemeError
from reader_tts.pronunciation.arpabet import (
    PHONEME_INVENTORY,
    is_valid_phoneme,
    is_vowel,
    parse_arpabet,
    stress_of,
    strip_stress,
    validate_phonemes,
)
from reader_tts.pronunciation.cmudict_loader import load_dictionary
from reader_tts.pronunciation.dictionary import PronunciationDictionary


def write_dictionary(tmp_path: Path, text: str) -> Path:
    directory = tmp_path / "d"
    directory.mkdir(exist_ok=True)
    (directory / "cmudict.dict").write_text(text, encoding="utf-8")
    return directory


# --- ARPAbet -------------------------------------------------------------------


def test_inventory_covers_consonants_and_stressed_vowels() -> None:
    assert "ZH" in PHONEME_INVENTORY
    assert "AA1" in PHONEME_INVENTORY
    assert "AA0" in PHONEME_INVENTORY
    assert "AA2" in PHONEME_INVENTORY
    assert not is_valid_phoneme("AA3")
    assert not is_valid_phoneme("XX")
    assert not is_valid_phoneme("B1")


def test_stress_helpers() -> None:
    assert strip_stress("AA1") == "AA"
    assert strip_stress("B") == "B"
    assert stress_of("AA1") == 1
    assert stress_of("B") is None
    assert is_vowel("ER0")
    assert not is_vowel("R")


def test_validate_phonemes_uppercases() -> None:
    assert validate_phonemes(["k", "ae1", "t"]) == ("K", "AE1", "T")


@pytest.mark.parametrize("bad", [[], ["QQ"], ["K", "T"]])
def test_validate_phonemes_rejects(bad: list[str]) -> None:
    with pytest.raises(InvalidPhonemeError):
        validate_phonemes(bad)


def test_parse_arpabet() -> None:
    assert parse_arpabet("R IY1 D") == ("R", "IY1", "D")


# --- Loader ---------------------------------------------------------------------


def test_valid_entries_load(sample_dictionary: PronunciationDictionary) -> None:
    entry = sample_dictionary.lookup("CAT")
    assert entry is not None
    assert entry.pronunciations[0].phonemes == ("K", "AE1", "T")
    assert entry.pronunciations[0].source == "cmudict"


def test_numbered_alternatives_become_variants(
    sample_dictionary: PronunciationDictionary,
) -> None:
    entry = sample_dictionary.lookup("READ")
    assert entry is not None
    assert entry.is_ambiguous
    assert [p.variant_index for p in entry.pronunciations] == [0, 1]
    assert entry.pronunciations[0].phonemes == ("R", "IY1", "D")
    assert entry.pronunciations[1].phonemes == ("R", "EH1", "D")


def test_lookup_is_case_insensitive(sample_dictionary: PronunciationDictionary) -> None:
    assert sample_dictionary.lookup("cat") is not None
    assert "CAT" in sample_dictionary
    assert "cat" in sample_dictionary


def test_comments_and_blank_lines_ignored(tmp_path: Path) -> None:
    directory = write_dictionary(
        tmp_path,
        "# leading comment\n\ncat K AE1 T # trailing comment\n\n   \n",
    )
    loaded = load_dictionary(directory)
    assert loaded.size == 1
    assert loaded.entries["CAT"].pronunciations[0].phonemes == ("K", "AE1", "T")
    assert loaded.malformed_lines == ()


def test_malformed_phonemes_are_reported_not_raised(tmp_path: Path) -> None:
    directory = write_dictionary(tmp_path, "cat K AE1 T\nbad Q Q Q\n")
    loaded = load_dictionary(directory)
    assert loaded.size == 1
    assert len(loaded.malformed_lines) == 1
    assert "invalid symbols" in loaded.malformed_lines[0]


def test_missing_phonemes_reported(tmp_path: Path) -> None:
    directory = write_dictionary(tmp_path, "lonely\n")
    loaded = load_dictionary(directory)
    assert loaded.size == 0
    assert "missing word or phonemes" in loaded.malformed_lines[0]


def test_duplicate_variant_index_reported(tmp_path: Path) -> None:
    directory = write_dictionary(tmp_path, "cat K AE1 T\ncat K AE1 T\n")
    loaded = load_dictionary(directory)
    assert len(loaded.entries["CAT"].pronunciations) == 1
    assert "duplicate variant" in loaded.malformed_lines[0]


def test_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(DictionaryNotFoundError):
        load_dictionary(tmp_path / "absent")


def test_invalid_utf8_raises(tmp_path: Path) -> None:
    directory = tmp_path / "d"
    directory.mkdir()
    (directory / "cmudict.dict").write_bytes(b"cat K AE1 T\n\xff\xfe bad\n")
    with pytest.raises(UnicodeDecodeError):
        load_dictionary(directory)


def test_version_metadata(sample_dictionary: PronunciationDictionary) -> None:
    assert sample_dictionary.info.version == "test-sample"
    assert sample_dictionary.info.name == "cmudict"
    assert sample_dictionary.info.entries == sample_dictionary.size


def test_unknown_version_when_file_absent(tmp_path: Path) -> None:
    directory = write_dictionary(tmp_path, "cat K AE1 T\n")
    assert load_dictionary(directory).version == "unknown"


# --- Compounds --------------------------------------------------------------------


def test_full_hyphenated_spelling_wins(sample_dictionary: PronunciationDictionary) -> None:
    entry = sample_dictionary.lookup("MOTHER-IN-LAW")
    assert entry is not None
    assert entry.pronunciations[0].phonemes[-1] == "AO2"


def test_compound_decomposition(sample_dictionary: PronunciationDictionary) -> None:
    resolution = sample_dictionary.resolve_compound("CAT-MAT")
    assert resolution is not None
    assert resolution.components == ("CAT", "MAT")
    assert resolution.phonemes == ("K", "AE1", "T", "M", "AE1", "T")


def test_compound_requires_every_component(
    sample_dictionary: PronunciationDictionary,
) -> None:
    assert sample_dictionary.resolve_compound("CAT-FROBNICATOR") is None


def test_non_hyphenated_word_is_not_a_compound(
    sample_dictionary: PronunciationDictionary,
) -> None:
    assert sample_dictionary.resolve_compound("CAT") is None


def test_supports_covers_direct_and_compound(
    sample_dictionary: PronunciationDictionary,
) -> None:
    assert sample_dictionary.supports("CAT")
    assert sample_dictionary.supports("CAT-MAT")
    assert not sample_dictionary.supports("FROBNICATOR")


# --- The pinned dictionary ----------------------------------------------------------


def test_pinned_dictionary_loads_cleanly(cmudict: PronunciationDictionary) -> None:
    assert cmudict.size > 100_000
    assert cmudict.info.malformed_lines == ()
    assert cmudict.info.version != "unknown"


@pytest.mark.parametrize(
    "word", ["THE", "CAT", "DON'T", "CAN'T", "I'M", "MOTHER-IN-LAW", "WIND", "READ"]
)
def test_pinned_dictionary_contains_expected_words(
    cmudict: PronunciationDictionary, word: str
) -> None:
    assert word in cmudict


def test_record_has_multiple_pronunciations(cmudict: PronunciationDictionary) -> None:
    entry = cmudict.lookup("RECORD")
    assert entry is not None
    assert len(entry.pronunciations) >= 2
    assert entry.is_ambiguous
