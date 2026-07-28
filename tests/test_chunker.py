"""Synthesis preparation and long-sentence splitting tests."""

from __future__ import annotations

import pytest

from reader_tts.config import defaults
from reader_tts.domain.errors import ValidationError
from reader_tts.domain.models import Sentence, TextSpan
from reader_tts.synthesis.chunker import prepare_sentence, split_for_synthesis


def make_sentence(text: str, index: int = 0) -> Sentence:
    return Sentence(
        id=f"s-{index}",
        document_id="doc",
        index=index,
        paragraph_index=0,
        text=text,
        span=TextSpan(0, len(text)),
        terminal_punctuation=text[-1] if text and text[-1] in ".?!" else None,
    )


# --- Preparation --------------------------------------------------------------------


def test_short_sentence_is_one_chunk() -> None:
    prepared = prepare_sentence(make_sentence("The cat sat on the mat."))
    assert len(prepared.chunks) == 1
    assert prepared.chunks[0].synthesis_text == "The cat sat on the mat."
    assert prepared.chunks[0].sentence_id == "s-0"


def test_internal_whitespace_is_collapsed() -> None:
    prepared = prepare_sentence(make_sentence("The   cat\n  sat."))
    assert prepared.synthesis_text == "The cat sat."
    assert prepared.display_text == "The cat sat."


def test_terminal_punctuation_is_preserved() -> None:
    for text in ("Yes.", "Really?", "Stop!", "Well?!"):
        assert prepare_sentence(make_sentence(text)).synthesis_text.endswith(text[-1])


def test_en_dash_becomes_em_dash() -> None:
    prepared = prepare_sentence(make_sentence("He waited – then left."))
    assert "–" not in prepared.synthesis_text
    assert "—" in prepared.synthesis_text


def test_empty_sentence_is_refused() -> None:
    with pytest.raises(ValidationError, match="no readable words"):
        prepare_sentence(make_sentence("..."))


def test_synthesis_replacement_is_applied_and_recorded() -> None:
    prepared = prepare_sentence(make_sentence("I lead the way."), replacements={"LEAD": "led"})
    assert prepared.synthesis_text == "I led the way."
    assert prepared.replacements_applied == (("lead", "led"),)


def test_replacement_preserves_capitalization() -> None:
    prepared = prepare_sentence(make_sentence("Lead on."), replacements={"LEAD": "led"})
    assert prepared.synthesis_text.startswith("Led")


def test_replacement_does_not_touch_other_words() -> None:
    prepared = prepare_sentence(
        make_sentence("The leader will lead."), replacements={"LEAD": "led"}
    )
    assert prepared.synthesis_text == "The leader will led."


def test_display_text_is_unchanged_by_replacements() -> None:
    prepared = prepare_sentence(make_sentence("I lead."), replacements={"LEAD": "led"})
    assert prepared.display_text == "I lead."


# --- Splitting ------------------------------------------------------------------------


def test_short_text_is_not_split() -> None:
    assert split_for_synthesis("The cat sat.") == ("The cat sat.",)


def test_semicolon_is_preferred() -> None:
    text = "a " * 100 + "part one; " + "b " * 100 + "part two."
    pieces = split_for_synthesis(text, preferred_max_chars=250, hard_max_chars=400)
    assert len(pieces) > 1
    assert pieces[0].endswith(";")


def test_comma_used_when_no_stronger_boundary() -> None:
    text = ("word " * 30).strip() + ", " + "other " * 60 + "end."
    pieces = split_for_synthesis(text, preferred_max_chars=200, hard_max_chars=400)
    assert len(pieces) > 1
    assert pieces[0].endswith(",")


def test_every_piece_respects_the_hard_maximum() -> None:
    text = "word " * 400 + "end."
    pieces = split_for_synthesis(text, preferred_max_chars=350, hard_max_chars=600)
    assert all(len(piece) <= 600 for piece in pieces)
    assert len(pieces) > 1


def test_split_never_breaks_a_hyphenated_word() -> None:
    text = ("mother-in-law " * 60).strip() + "."
    pieces = split_for_synthesis(text, preferred_max_chars=200, hard_max_chars=300)
    for piece in pieces:
        assert not piece.startswith("-")
        assert not piece.endswith("-")


def test_split_never_breaks_a_contraction() -> None:
    text = ("don't " * 100).strip() + "."
    pieces = split_for_synthesis(text, preferred_max_chars=150, hard_max_chars=250)
    for piece in pieces:
        assert not piece.startswith("'")
        assert not piece.endswith("'")


def test_unbroken_run_is_still_bounded() -> None:
    text = "a" * 2000
    pieces = split_for_synthesis(text, preferred_max_chars=350, hard_max_chars=600)
    assert all(len(piece) <= 600 for piece in pieces)


def test_reassembly_preserves_every_word() -> None:
    text = "The wind moved through the trees; it was cold, and the sun set. " * 12
    pieces = split_for_synthesis(text.strip(), preferred_max_chars=200, hard_max_chars=350)
    assert " ".join(pieces).split() == text.split()


def test_long_sentence_produces_indexed_chunks() -> None:
    text = "The wind moved through the trees, and it was cold. " * 20
    prepared = prepare_sentence(make_sentence(text.strip()))
    assert len(prepared.chunks) > 1
    assert [c.chunk_index for c in prepared.chunks] == list(range(len(prepared.chunks)))
    assert {c.sentence_id for c in prepared.chunks} == {"s-0"}


def test_default_thresholds_are_the_specified_ones() -> None:
    assert defaults.PREFERRED_MAX_SENTENCE_CHARS == 350
    assert defaults.HARD_MAX_SENTENCE_CHARS == 600
