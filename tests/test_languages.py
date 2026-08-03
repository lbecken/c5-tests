"""Language pack tests: French, British English, and English left unchanged.

The central claim these tests defend is that adding languages did not change
what English does. Where a test asserts French behaviour, an English
counterpart usually asserts the old behaviour still holds.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from reader_tts.config.settings import Settings
from reader_tts.container import AppServices
from reader_tts.domain.enums import LanguageCode, PhonemeNotation, TokenKind
from reader_tts.domain.errors import InvalidPhonemeError, ValidationError
from reader_tts.languages.packs import BRITISH_ENGLISH, FRENCH, US_ENGLISH
from reader_tts.languages.registry import (
    available_languages,
    get_pack,
    pack_for_voice,
    require_voice_language,
    resolve_voice,
)
from reader_tts.pronunciation import ipa
from reader_tts.pronunciation.dictionary import PronunciationDictionary
from reader_tts.synthesis.fake_engine import FakeSpeechEngine
from reader_tts.text.characters import DEFAULT_POLICY, FRENCH_POLICY
from reader_tts.text.tokenizer import tokenize, word_tokens
from reader_tts.text.validator import analyze

DATA_DIR = Path("data").resolve()

FRENCH_TEXT = (
    "Le vent soufflait doucement à travers les arbres. Où avez-vous mis les clés ?\n\n"
    "J'ai lu le livre hier. L'homme qu'il attendait n'est pas venu."
)


@pytest.fixture(scope="module")
def french_dictionary() -> PronunciationDictionary:
    return PronunciationDictionary.for_language(FRENCH, DATA_DIR)


@pytest.fixture
def services(tmp_path: Path) -> Iterator[AppServices]:
    settings = Settings(
        data_dir=DATA_DIR,
        runtime_dir=tmp_path / "runtime",
        model_dir=tmp_path / "models",
        engine="fake",
    )
    container = AppServices(settings, engine=FakeSpeechEngine())
    yield container
    container.close()


# --- The registry ------------------------------------------------------------


def test_three_languages_are_bundled() -> None:
    assert [pack.code for pack in available_languages()] == [
        LanguageCode.EN_US,
        LanguageCode.EN_GB,
        LanguageCode.FR_FR,
    ]


def test_packs_declare_their_dictionary_and_notation() -> None:
    assert US_ENGLISH.notation is PhonemeNotation.ARPABET
    assert US_ENGLISH.dictionary.name == "cmudict"
    assert BRITISH_ENGLISH.dictionary.name == "cmudict"
    assert BRITISH_ENGLISH.engine_language_code == "b"
    assert FRENCH.notation is PhonemeNotation.IPA
    assert FRENCH.dictionary.name == "ipa-dict-fr"
    assert FRENCH.engine_language_code == "f"


def test_unknown_language_is_rejected() -> None:
    with pytest.raises(ValidationError, match="not a supported language"):
        get_pack("de-de")


def test_french_has_exactly_one_voice_which_is_selected_automatically() -> None:
    assert FRENCH.voice_ids == ("ff_siwis",)
    assert resolve_voice(None, LanguageCode.FR_FR) == "ff_siwis"


def test_english_default_voice_is_unchanged() -> None:
    assert resolve_voice(None, LanguageCode.EN_US) == "af_heart"
    assert US_ENGLISH.voice_ids == ("af_heart", "af_bella", "am_michael", "am_fenrir")


def test_voice_belongs_to_one_language() -> None:
    assert pack_for_voice("af_heart").code is LanguageCode.EN_US
    assert pack_for_voice("bf_emma").code is LanguageCode.EN_GB
    assert pack_for_voice("ff_siwis").code is LanguageCode.FR_FR


def test_cross_language_voice_is_refused() -> None:
    with pytest.raises(ValidationError, match="speaks"):
        require_voice_language("af_heart", LanguageCode.FR_FR)
    with pytest.raises(ValidationError, match="speaks"):
        require_voice_language("ff_siwis", LanguageCode.EN_US)


def test_unknown_voice_is_refused() -> None:
    with pytest.raises(ValidationError, match="does not exist"):
        require_voice_language("nope", LanguageCode.EN_US)


# --- Character policy ----------------------------------------------------------


@pytest.mark.parametrize("char", ["é", "è", "ê", "à", "ç", "ô", "û", "ï", "œ", "É", "Ç"])
def test_french_accepts_accented_letters(char: str) -> None:
    assert FRENCH_POLICY.is_letter(char)
    assert not DEFAULT_POLICY.is_letter(char), "English must be unchanged"


@pytest.mark.parametrize("char", ["3", "$", "%", "@"])
def test_french_still_rejects_symbols(char: str) -> None:
    assert not FRENCH_POLICY.is_letter(char)
    assert not FRENCH_POLICY.is_supported_character(char)


def test_french_tokenizer_keeps_accents_and_elisions() -> None:
    tokens = word_tokens(tokenize("L'homme a des clés à Noël.", policy=FRENCH_POLICY))
    assert [t.normalized for t in tokens] == ["L'HOMME", "A", "DES", "CLÉS", "À", "NOËL"]


def test_english_tokenizer_is_unchanged_by_the_policy_parameter() -> None:
    assert [t.normalized for t in word_tokens(tokenize("don't stop"))] == ["DON'T", "STOP"]


def test_accented_text_is_rejected_in_english() -> None:
    """Choosing the wrong language is reported, not silently tolerated."""
    tokens = tokenize("clés", policy=DEFAULT_POLICY)
    assert any(token.kind is TokenKind.UNSUPPORTED for token in tokens)


# --- IPA inventory ---------------------------------------------------------------


def test_nasal_vowels_are_single_phonemes() -> None:
    assert ipa.segment("ɑ̃") == ("ɑ̃",)
    assert ipa.is_vowel("ɑ̃")
    assert ipa.is_nasal("ɔ̃")
    assert not ipa.is_nasal("a")


def test_ipa_parsing_strips_slashes() -> None:
    assert ipa.parse_ipa("/lɔm/") == ("l", "ɔ", "m")


def test_ipa_normalizes_script_g() -> None:
    assert ipa.segment("ɡa") == ("g", "a")


def test_invalid_ipa_is_rejected() -> None:
    with pytest.raises(InvalidPhonemeError, match="unknown IPA symbol"):
        ipa.validate_phonemes(["l", "Q", "m"])
    with pytest.raises(InvalidPhonemeError, match="at least one vowel"):
        ipa.validate_phonemes(["l", "m"])


def test_ipa_is_formatted_without_separators() -> None:
    assert ipa.format_ipa(("l", "ɔ", "m")) == "lɔm"


# --- The French dictionary ------------------------------------------------------------


def test_french_dictionary_loads_cleanly(french_dictionary: PronunciationDictionary) -> None:
    assert french_dictionary.size > 200_000
    assert french_dictionary.info.malformed_lines == ()
    assert french_dictionary.info.name == "ipa-dict-fr"
    assert french_dictionary.notation is PhonemeNotation.IPA


@pytest.mark.parametrize(
    "word,expected",
    [
        ("MOT", "mo"),
        ("CLÉS", "kle"),
        ("OÙ", "u"),
        ("HOMME", "ɔm"),
        ("AUJOURD'HUI", "oʒuʁdɥi"),
    ],
)
def test_french_lookup(
    french_dictionary: PronunciationDictionary, word: str, expected: str
) -> None:
    entry = french_dictionary.lookup(word)
    assert entry is not None
    assert ipa.format_ipa(entry.pronunciations[0].phonemes) == expected


def test_french_homographs_are_ambiguous(french_dictionary: PronunciationDictionary) -> None:
    for word in ("PLUS", "EST", "TOUS", "CONTENT"):
        assert french_dictionary.is_ambiguous(word), f"{word} should have several readings"


@pytest.mark.parametrize(
    "word,expected,components",
    [
        ("L'HOMME", "lɔm", ("L'", "HOMME")),
        ("QU'IL", "kil", ("QU'", "IL")),
        ("S'IL", "sil", ("S'", "IL")),
        ("D'UN", "dœ̃", ("D'", "UN")),
    ],
)
def test_elision_decomposition(
    french_dictionary: PronunciationDictionary,
    word: str,
    expected: str,
    components: tuple[str, ...],
) -> None:
    resolution = french_dictionary.resolve_compound(word)
    assert resolution is not None
    assert resolution.kind == "elision"
    assert resolution.components == components
    assert ipa.format_ipa(resolution.phonemes) == expected


def test_whole_word_wins_over_elision(french_dictionary: PronunciationDictionary) -> None:
    """A word that merely contains an apostrophe is not decomposed."""
    assert french_dictionary.lookup("AUJOURD'HUI") is not None
    entry = french_dictionary.lookup("AUJOURD'HUI")
    assert entry is not None
    assert ipa.format_ipa(entry.pronunciations[0].phonemes) == "oʒuʁdɥi"


def test_french_hyphenated_compounds(french_dictionary: PronunciationDictionary) -> None:
    resolution = french_dictionary.resolve_compound("AVEZ-VOUS")
    assert resolution is not None
    assert resolution.kind == "hyphen"
    assert resolution.components == ("AVEZ", "VOUS")


def test_unknown_french_word_is_refused(french_dictionary: PronunciationDictionary) -> None:
    assert not french_dictionary.supports("FROBNICATEUR")


def test_english_dictionary_is_untouched(services: AppServices) -> None:
    english = services.dictionary_for(LanguageCode.EN_US)
    assert english.notation is PhonemeNotation.ARPABET
    assert english.size > 100_000
    entry = english.lookup("CAT")
    assert entry is not None
    assert entry.pronunciations[0].phonemes == ("K", "AE1", "T")


def test_british_english_shares_the_english_dictionary(services: AppServices) -> None:
    british = services.dictionary_for(LanguageCode.EN_GB)
    assert british.info.name == "cmudict"
    assert british.lookup("CAT") is not None


# --- Validation ---------------------------------------------------------------------------


def test_french_text_validates(services: AppServices) -> None:
    result = analyze(
        FRENCH_TEXT,
        services.resolver(language=LanguageCode.FR_FR),
        policy=FRENCH_POLICY,
    )
    assert result.report.accepted, [i.message for i in result.report.errors]
    assert result.report.statistics.unsupported_words == 0
    assert result.report.statistics.words == 24


def test_french_text_fails_under_english(services: AppServices) -> None:
    """The language is chosen, never guessed; the wrong choice is reported."""
    result = analyze(FRENCH_TEXT, services.resolver(language=LanguageCode.EN_US))
    assert not result.report.accepted


def test_unknown_french_word_blocks_with_offsets(services: AppServices) -> None:
    text = "Le frobnicateur dort."
    result = analyze(text, services.resolver(language=LanguageCode.FR_FR), policy=FRENCH_POLICY)
    assert not result.report.accepted
    issue = result.report.errors[0]
    assert issue.token is not None
    assert text[issue.token.span.start : issue.token.span.end] == "frobnicateur"


def test_french_digits_are_still_rejected(services: AppServices) -> None:
    result = analyze(
        "Il y a 3 chats.", services.resolver(language=LanguageCode.FR_FR), policy=FRENCH_POLICY
    )
    assert not result.report.accepted
    assert any("digits" in issue.message for issue in result.report.errors)


# --- Documents and synthesis -------------------------------------------------------------------


def test_french_document_round_trip(services: AppServices) -> None:
    document = services.documents.create(FRENCH_TEXT, title="Essai", language=LanguageCode.FR_FR)
    assert document.language is LanguageCode.FR_FR

    stored = services.documents.get(document.id)
    assert stored.language is LanguageCode.FR_FR

    report = services.documents.validate(document.id, services.resolver_for_document(document.id))
    assert report.accepted


def test_documents_default_to_english(services: AppServices) -> None:
    """Existing behaviour: a document created without a language is English."""
    document = services.documents.create("The cat sat.")
    assert document.language is LanguageCode.EN_US


def test_french_job_synthesizes(services: AppServices) -> None:
    document = services.documents.create(FRENCH_TEXT, language=LanguageCode.FR_FR)
    resolver = services.resolver_for_document(document.id)
    job = services.jobs.create(document.id, resolver, "ff_siwis", 1.0)
    progress = services.jobs.run(job.id, resolver)
    assert progress.failed_units == 0
    assert progress.completed_units == job.total_units

    engine = services.engine
    assert isinstance(engine, FakeSpeechEngine)
    assert {request.language_code for request in engine.requests} == {"fr-fr"}


def test_french_job_rejects_an_english_voice(services: AppServices) -> None:
    document = services.documents.create(FRENCH_TEXT, language=LanguageCode.FR_FR)
    resolver = services.resolver_for_document(document.id)
    with pytest.raises(ValidationError, match="speaks"):
        services.jobs.create(document.id, resolver, "af_heart", 1.0)


def test_same_text_in_two_languages_does_not_share_audio(services: AppServices) -> None:
    """The language is part of the cache key."""
    text = "Correction impossible."
    english_key = services.synthesis.cache_key_for(text, "af_heart", 1.0, language_code="en-us")
    french_key = services.synthesis.cache_key_for(text, "ff_siwis", 1.0, language_code="fr-fr")
    assert english_key != french_key


def test_british_and_american_differ_in_the_cache(services: AppServices) -> None:
    text = "The cat sat on the mat."
    american = services.synthesis.cache_key_for(text, "af_heart", 1.0, language_code="en-us")
    british = services.synthesis.cache_key_for(text, "bf_emma", 1.0, language_code="en-gb")
    assert american != british


# --- Overrides in two notations -------------------------------------------------------------------


def test_french_override_uses_ipa(services: AppServices) -> None:
    notation = services.dictionary_for(LanguageCode.FR_FR).notation
    overrides = services.overrides.for_notation(notation)
    stored = overrides.upsert("FROBNICATEUR", ["f", "ʁ", "ɔ", "b"], synthesis_text="frobnicateur")
    assert stored.phonemes == ("f", "ʁ", "ɔ", "b")

    resolver = services.resolver(language=LanguageCode.FR_FR)
    assert resolver.check_word("FROBNICATEUR").supported


def test_english_override_still_uses_arpabet(services: AppServices) -> None:
    stored = services.overrides.upsert("LEAD", ["L", "EH1", "D"])
    assert stored.phonemes == ("L", "EH1", "D")


def test_arpabet_is_rejected_for_french(services: AppServices) -> None:
    notation = services.dictionary_for(LanguageCode.FR_FR).notation
    overrides = services.overrides.for_notation(notation)
    with pytest.raises(InvalidPhonemeError):
        overrides.upsert("MOT", ["M", "OW1", "T"])


def test_ipa_is_rejected_for_english(services: AppServices) -> None:
    with pytest.raises(InvalidPhonemeError):
        services.overrides.upsert("CAT", ["k", "ɑ̃", "t"])


# --- Orthographic variants ------------------------------------------------------


@pytest.mark.parametrize(
    "typed,expected",
    [("OEUFS", "ø"), ("OEUF", "œf"), ("SOEUR", "sœʁ"), ("COEUR", "kœʁ")],
)
def test_ligature_folding(
    french_dictionary: PronunciationDictionary, typed: str, expected: str
) -> None:
    """A word typed without its ligature still resolves."""
    resolution = french_dictionary.resolve_compound(typed)
    assert resolution is not None
    assert resolution.kind == "ligature"
    assert ipa.format_ipa(resolution.phonemes) == expected


def test_ligature_folding_chains_with_elision(
    french_dictionary: PronunciationDictionary,
) -> None:
    resolution = french_dictionary.resolve_compound("L'OEUF")
    assert resolution is not None
    assert ipa.format_ipa(resolution.phonemes) == "lœf"


def test_ligature_folding_does_not_apply_to_english(services: AppServices) -> None:
    english = services.dictionary_for(LanguageCode.EN_US)
    assert english.resolve_compound("TOE") is None
