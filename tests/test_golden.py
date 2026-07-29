"""Golden tests over a small deterministic corpus.

These lock in tokenization, sentence splitting, dictionary coverage, ambiguity
reporting and the exact synthesis request the engine receives. They assert no
waveform equality, because neural output is not guaranteed to be bit-identical
across hardware.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from reader_tts.config.settings import Settings
from reader_tts.container import AppServices
from reader_tts.domain.enums import TokenKind
from reader_tts.domain.models import Sentence, TextSpan
from reader_tts.pronunciation.ambiguity import collect_ambiguities
from reader_tts.pronunciation.dictionary import PronunciationDictionary
from reader_tts.pronunciation.resolver import PronunciationResolver
from reader_tts.synthesis.chunker import prepare_sentence
from reader_tts.synthesis.fake_engine import FakeSpeechEngine
from reader_tts.text.sentences import split_sentences
from reader_tts.text.tokenizer import tokenize, word_tokens
from reader_tts.text.validator import analyze

CORPUS = [
    "The cat sat on the mat.",
    "The wind moved through the trees.",
    "Did you close the door?",
    "Please record the record.",
    "I read the book yesterday.",
    "I read books every day.",
]

CORPUS_TEXT = "\n".join(CORPUS)


# --- Tokenization --------------------------------------------------------------


@pytest.mark.parametrize(
    "text,expected",
    [
        ("The cat sat on the mat.", ["THE", "CAT", "SAT", "ON", "THE", "MAT"]),
        ("The wind moved through the trees.", ["THE", "WIND", "MOVED", "THROUGH", "THE", "TREES"]),
        ("Did you close the door?", ["DID", "YOU", "CLOSE", "THE", "DOOR"]),
        ("Please record the record.", ["PLEASE", "RECORD", "THE", "RECORD"]),
        ("I read the book yesterday.", ["I", "READ", "THE", "BOOK", "YESTERDAY"]),
        ("I read books every day.", ["I", "READ", "BOOKS", "EVERY", "DAY"]),
    ],
)
def test_golden_tokenization(text: str, expected: list[str]) -> None:
    assert [token.normalized for token in word_tokens(tokenize(text))] == expected


def test_golden_token_kinds() -> None:
    kinds = [t.kind for t in tokenize("Did you close the door?")]
    assert kinds[-1] is TokenKind.PUNCTUATION
    assert kinds.count(TokenKind.WORD) == 5


# --- Segmentation ----------------------------------------------------------------


def test_golden_sentence_split() -> None:
    sentences = split_sentences(CORPUS_TEXT)
    assert [s.text for s in sentences] == CORPUS
    assert [s.paragraph_index for s in sentences] == [0] * len(CORPUS)


def test_golden_terminal_punctuation() -> None:
    assert [s.terminal_punctuation for s in split_sentences(CORPUS_TEXT)] == [
        ".",
        ".",
        "?",
        ".",
        ".",
        ".",
    ]


# --- Dictionary coverage ------------------------------------------------------------


def test_golden_corpus_is_fully_covered(cmudict: PronunciationDictionary) -> None:
    resolver = PronunciationResolver(cmudict)
    report = analyze(CORPUS_TEXT, resolver).report
    assert report.accepted
    assert report.statistics.unsupported_words == 0
    assert report.statistics.words == 31


@pytest.mark.parametrize(
    "word,expected_first",
    [
        ("CAT", "K AE1 T"),
        ("MAT", "M AE1 T"),
        ("DOOR", "D AO1 R"),
        # CMUdict lists the past tense of 'read' and the verb 'wind' first.
        # Version 1 takes the first variant without consulting grammar, so
        # these are the pronunciations the reader will use by default.
        ("READ", "R EH1 D"),
        ("WIND", "W AY1 N D"),
    ],
)
def test_golden_selected_pronunciation(
    cmudict: PronunciationDictionary, word: str, expected_first: str
) -> None:
    """The default selection is the first dictionary variant."""
    resolved = PronunciationResolver(cmudict).resolve(word)
    assert resolved.arpabet == expected_first
    assert resolved.variant_index == 0


def test_golden_default_is_not_grammatically_informed(
    cmudict: PronunciationDictionary,
) -> None:
    """Both readings of 'read' take the same default, in either sentence.

    This documents a Version 1 limitation rather than a defect: the reader
    reports the ambiguity and offers the alternative, but does not resolve it.
    """
    resolver = PronunciationResolver(cmudict)
    past = resolver.resolve("READ")
    present = resolver.resolve("READ")
    assert past.arpabet == present.arpabet == "R EH1 D"
    assert past.is_ambiguous
    assert "R IY1 D" in [p.arpabet for p in past.alternatives]


# --- Ambiguity ------------------------------------------------------------------------


def test_golden_ambiguity_report(cmudict: PronunciationDictionary) -> None:
    found = {a.word: a for a in collect_ambiguities(tokenize(CORPUS_TEXT), cmudict)}
    # These are the homographs the specification calls out for this corpus.
    assert "RECORD" in found
    assert "READ" in found
    assert "WIND" in found
    assert found["RECORD"].count == 2
    assert found["READ"].count == 2
    assert all(a.is_notable_homograph for a in (found["RECORD"], found["READ"], found["WIND"]))


@pytest.mark.parametrize(
    "word", ["READ", "RECORD", "PRESENT", "OBJECT", "CLOSE", "LIVE", "LEAD", "WIND", "TEAR", "DOES"]
)
def test_specified_homographs_are_ambiguous(cmudict: PronunciationDictionary, word: str) -> None:
    """Every homograph named in the specification has several pronunciations."""
    entry = cmudict.lookup(word)
    assert entry is not None
    assert entry.is_ambiguous, f"{word} should have more than one pronunciation"


# --- Synthesis request construction -------------------------------------------------------


def make_sentence(text: str, index: int = 0) -> Sentence:
    return Sentence(
        id=f"golden-{index}",
        document_id="golden",
        index=index,
        paragraph_index=0,
        text=text,
        span=TextSpan(0, len(text)),
        terminal_punctuation=text[-1] if text[-1] in ".?!" else None,
    )


@pytest.mark.parametrize("text", CORPUS)
def test_golden_synthesis_text_is_stable(text: str) -> None:
    """Synthesis text equals the source for clean prose: nothing is rewritten."""
    prepared = prepare_sentence(make_sentence(text))
    assert prepared.synthesis_text == text
    assert len(prepared.chunks) == 1
    assert prepared.chunks[0].synthesis_text == text
    assert prepared.replacements_applied == ()


def test_golden_engine_receives_exactly_the_prepared_text(tmp_path: Path) -> None:
    settings = Settings(data_dir=Path("data"), runtime_dir=tmp_path / "runtime", engine="fake")
    engine = FakeSpeechEngine()
    services = AppServices(settings, engine=engine)
    try:
        document = services.documents.create(CORPUS_TEXT, title="Golden")
        resolver = services.resolver(document.id)
        job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
        services.jobs.run(job.id, resolver)

        assert [request.text for request in engine.requests] == CORPUS
        assert {request.voice_id for request in engine.requests} == {"af_heart"}
        assert {request.speed for request in engine.requests} == {1.0}
        assert {request.language_code for request in engine.requests} == {"en-us"}
    finally:
        services.close()


def test_golden_cache_keys_are_stable(tmp_path: Path) -> None:
    """The same text, voice and speed always produce the same key."""
    settings = Settings(data_dir=Path("data"), runtime_dir=tmp_path / "runtime", engine="fake")
    services = AppServices(settings, engine=FakeSpeechEngine())
    try:
        keys = [services.synthesis.cache_key_for(text, "af_heart", 1.0) for text in CORPUS]
        again = [services.synthesis.cache_key_for(text, "af_heart", 1.0) for text in CORPUS]
        assert keys == again
        assert len(set(keys)) == len(CORPUS)
    finally:
        services.close()
