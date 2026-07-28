"""Sentence and paragraph segmentation tests."""

from __future__ import annotations

from reader_tts.text.paragraphs import paragraph_index_for_offset, split_paragraphs
from reader_tts.text.sentences import split_sentences


def texts(source: str) -> list[str]:
    return [sentence.text for sentence in split_sentences(source)]


def test_simple_statements() -> None:
    assert texts("The cat sat. The dog ran.") == ["The cat sat.", "The dog ran."]


def test_question_and_exclamation() -> None:
    assert texts("Did you close the door? Yes! I did.") == [
        "Did you close the door?",
        "Yes!",
        "I did.",
    ]


def test_repeated_punctuation_stays_with_sentence() -> None:
    assert texts("Really?! I doubt it.") == ["Really?!", "I doubt it."]


def test_closing_quote_after_terminator() -> None:
    assert texts('"Go now." He left.') == ['"Go now."', "He left."]


def test_closing_parenthesis_after_terminator() -> None:
    assert texts("(He left.) She stayed.") == ["(He left.)", "She stayed."]


def test_semicolon_and_colon_do_not_split() -> None:
    source = "He came; she left: they waited."
    assert texts(source) == [source]


def test_period_without_following_space_does_not_split() -> None:
    assert texts("one.two three.") == ["one.two three."]


def test_final_sentence_without_terminator() -> None:
    assert texts("The cat sat. The dog ran") == ["The cat sat.", "The dog ran"]


def test_paragraph_boundary_ends_a_sentence() -> None:
    assert texts("First line\n\nSecond line") == ["First line", "Second line"]


def test_paragraph_indices_are_assigned() -> None:
    sentences = split_sentences("A one. A two.\n\nB one.")
    assert [s.paragraph_index for s in sentences] == [0, 0, 1]
    assert [s.index for s in sentences] == [0, 1, 2]


def test_spans_address_the_source() -> None:
    source = "The cat sat.  The dog ran.\n\nA new one."
    for sentence in split_sentences(source):
        assert source[sentence.span.start : sentence.span.end] == sentence.text


def test_terminal_punctuation_recorded() -> None:
    sentences = split_sentences('Yes! "No." Maybe')
    assert [s.terminal_punctuation for s in sentences] == ["!", ".", None]


def test_multiline_paragraph_is_one_paragraph() -> None:
    paragraphs = split_paragraphs("line one\nline two\n\nsecond")
    assert len(paragraphs) == 2
    assert paragraphs[0].text == "line one\nline two"


def test_blank_lines_with_spaces_split_paragraphs() -> None:
    paragraphs = split_paragraphs("one\n   \ntwo")
    assert [p.text for p in paragraphs] == ["one", "two"]


def test_many_blank_lines_produce_one_boundary() -> None:
    paragraphs = split_paragraphs("one\n\n\n\ntwo")
    assert [p.text for p in paragraphs] == ["one", "two"]


def test_empty_and_whitespace_only_input() -> None:
    assert split_paragraphs("") == ()
    assert split_paragraphs("   \n\n  ") == ()
    assert split_sentences("") == ()


def test_paragraph_index_for_offset() -> None:
    source = "one.\n\ntwo."
    paragraphs = split_paragraphs(source)
    assert paragraph_index_for_offset(paragraphs, 0) == 0
    assert paragraph_index_for_offset(paragraphs, 7) == 1


def test_long_sentence_is_not_split() -> None:
    long_sentence = "word " * 300 + "end."
    assert len(texts(long_sentence)) == 1


def test_document_id_is_recorded() -> None:
    sentences = split_sentences("One. Two.", document_id="doc-1")
    assert {s.document_id for s in sentences} == {"doc-1"}


def test_custom_id_factory() -> None:
    counter = iter(["a", "b"])
    sentences = split_sentences("One. Two.", sentence_id_factory=lambda: next(counter))
    assert [s.id for s in sentences] == ["a", "b"]
