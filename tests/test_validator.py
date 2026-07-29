"""Validation workflow tests: statistics, issue codes and strict mode."""

from __future__ import annotations

from reader_tts.domain.enums import ValidationCode, ValidationMode, ValidationSeverity
from reader_tts.pronunciation.ambiguity import collect_ambiguities
from reader_tts.pronunciation.dictionary import PronunciationDictionary
from reader_tts.pronunciation.resolver import PronunciationResolver
from reader_tts.text.tokenizer import tokenize
from reader_tts.text.validator import AcceptAllResolver, analyze


def codes(report_issues: object) -> list[ValidationCode]:
    return [issue.code for issue in report_issues]  # type: ignore[attr-defined]


def test_clean_text_is_accepted(resolver: PronunciationResolver) -> None:
    result = analyze("The cat sat on the mat.", resolver)
    assert result.report.accepted
    assert result.report.errors == ()
    assert result.report.statistics.words == 6
    assert result.report.statistics.sentences == 1
    assert result.report.statistics.paragraphs == 1
    assert result.report.statistics.supported_words == 6


def test_unknown_word_blocks_with_exact_offsets(resolver: PronunciationResolver) -> None:
    text = "The Frobnicator sat."
    result = analyze(text, resolver)
    assert not result.report.accepted
    issue = result.report.errors[0]
    assert issue.code is ValidationCode.UNKNOWN_WORD
    assert issue.token is not None
    assert text[issue.token.span.start : issue.token.span.end] == "Frobnicator"
    assert result.report.statistics.unsupported_words == 1


def test_ambiguity_is_a_warning_in_practical_mode(resolver: PronunciationResolver) -> None:
    result = analyze("Please record the record.", resolver)
    assert result.report.accepted
    warning = result.report.warnings[0]
    assert warning.code is ValidationCode.AMBIGUOUS_PRONUNCIATION
    assert warning.alternatives == ("R AH0 K AO1 R D", "R EH1 K ER0 D")
    # 'record' twice plus 'the', which the dictionary also pronounces two ways.
    assert result.report.statistics.ambiguous_words == 3


def test_ambiguity_is_reported_once_per_word(resolver: PronunciationResolver) -> None:
    result = analyze("Please record the record.", resolver)
    ambiguous_words = [
        i.token.normalized
        for i in result.report.issues
        if i.code is ValidationCode.AMBIGUOUS_PRONUNCIATION and i.token is not None
    ]
    assert ambiguous_words == ["RECORD", "THE"]


def test_strict_mode_turns_ambiguity_into_an_error(resolver: PronunciationResolver) -> None:
    result = analyze("Please record the record.", resolver, mode=ValidationMode.STRICT)
    assert not result.report.accepted
    assert result.report.errors[0].code is ValidationCode.AMBIGUOUS_PRONUNCIATION


def test_selecting_a_variant_satisfies_strict_mode(resolver: PronunciationResolver) -> None:
    chosen = resolver.with_selection("RECORD", 1).with_selection("THE", 0)
    result = analyze("Please record the record.", chosen, mode=ValidationMode.STRICT)
    assert result.report.accepted


def test_digits_are_rejected(resolver: PronunciationResolver) -> None:
    result = analyze("The cat sat on 3 mats.", resolver)
    assert not result.report.accepted
    issue = result.report.errors[0]
    assert issue.code is ValidationCode.UNSUPPORTED_CHARACTER
    assert "digits" in issue.message


def test_currency_is_rejected(resolver: PronunciationResolver) -> None:
    result = analyze("The cat cost $5.", resolver)
    assert any(i.code is ValidationCode.UNSUPPORTED_TOKEN for i in result.report.errors)


def test_url_is_rejected_as_one_token() -> None:
    result = analyze("Visit https://example.com now.", AcceptAllResolver())
    url_issues = [i for i in result.report.errors if i.code is ValidationCode.UNSUPPORTED_TOKEN]
    assert len(url_issues) == 1
    assert url_issues[0].token is not None
    assert url_issues[0].token.raw == "https://example.com"


def test_email_is_rejected_as_one_token() -> None:
    result = analyze("Write to a.person@example.com today.", AcceptAllResolver())
    email_issues = [i for i in result.report.errors if i.code is ValidationCode.UNSUPPORTED_TOKEN]
    assert len(email_issues) == 1
    assert "email" in email_issues[0].message


def test_words_inside_a_url_are_not_counted() -> None:
    result = analyze("https://example.com", AcceptAllResolver())
    assert result.report.statistics.words == 0


def test_empty_sentence_is_a_warning(resolver: PronunciationResolver) -> None:
    result = analyze('"..."', resolver)
    assert any(i.code is ValidationCode.EMPTY_SENTENCE for i in result.report.issues)
    assert result.report.accepted


def test_excessive_length_is_informational(resolver: PronunciationResolver) -> None:
    text = "the cat " * 100 + "sat."
    result = analyze(text, resolver, hard_max_chars=100)
    lengths = [i for i in result.report.issues if i.code is ValidationCode.EXCESSIVE_LENGTH]
    assert lengths and lengths[0].severity is ValidationSeverity.INFO
    assert result.report.accepted


def test_errors_are_sorted_before_warnings(resolver: PronunciationResolver) -> None:
    result = analyze("Record the frobnicator.", resolver)
    severities = [i.severity for i in result.report.issues]
    assert severities == sorted(severities, key=lambda s: ["error", "warning", "info"].index(s))


def test_statistics_count_paragraphs(resolver: PronunciationResolver) -> None:
    result = analyze("The cat sat.\n\nThe mat sat.", resolver)
    assert result.report.statistics.paragraphs == 2
    assert result.report.statistics.sentences == 2


def test_contraction_is_supported(resolver: PronunciationResolver) -> None:
    assert analyze("Don't.", resolver).report.accepted


def test_compound_is_supported(resolver: PronunciationResolver) -> None:
    assert analyze("The mother-in-law sat.", resolver).report.accepted


def test_ambiguity_collection(sample_dictionary: PronunciationDictionary) -> None:
    tokens = tokenize("Please record the record and read.")
    found = collect_ambiguities(tokens, sample_dictionary)
    by_word = {a.word: a for a in found}
    assert set(by_word) == {"RECORD", "READ", "THE"}
    assert by_word["RECORD"].count == 2
    assert by_word["RECORD"].is_notable_homograph
    assert by_word["RECORD"].arpabet_alternatives == ("R AH0 K AO1 R D", "R EH1 K ER0 D")


def test_pinned_dictionary_covers_ordinary_prose(cmudict: PronunciationDictionary) -> None:
    resolver = PronunciationResolver(cmudict)
    text = (
        "The wind moved through the trees. Did you close the door? "
        "I read the book yesterday, and I read books every day.\n\n"
        '"Please record the record," she said — quietly, without turning.'
    )
    result = analyze(text, resolver)
    assert result.report.accepted, [i.message for i in result.report.errors]
    assert result.report.statistics.ambiguous_words > 0
