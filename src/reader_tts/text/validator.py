"""Input validation.

The validator turns text into a :class:`~reader_tts.domain.models.ValidationReport`
without ever modifying it. Word support is decided by an injected resolver, so
this module stays independent of the pronunciation subsystem.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final, Protocol

from reader_tts.config import defaults
from reader_tts.domain.enums import (
    TokenKind,
    ValidationCode,
    ValidationMode,
    ValidationSeverity,
)
from reader_tts.domain.models import (
    Sentence,
    TextSpan,
    Token,
    ValidationIssue,
    ValidationReport,
    ValidationStatistics,
)
from reader_tts.text import characters as chars
from reader_tts.text.paragraphs import split_paragraphs
from reader_tts.text.sentences import split_sentences
from reader_tts.text.tokenizer import tokenize

#: Patterns rejected as a whole token rather than character by character.
_URL: Final = re.compile(r"\b(?:https?:|www\.)\S+", re.IGNORECASE)
_EMAIL: Final = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")


@dataclass(frozen=True, slots=True)
class WordSupport:
    """The resolver's verdict for one word."""

    supported: bool
    is_ambiguous: bool = False
    alternatives: tuple[str, ...] = ()
    reason: str | None = None


class WordResolver(Protocol):
    """Decides whether a normalized word can be pronounced."""

    def check_word(self, normalized_word: str) -> WordSupport:
        """Return support information for an uppercase normalized word."""
        ...


class AcceptAllResolver:
    """A resolver that accepts every word; used by tests and by text-only tools."""

    def check_word(self, normalized_word: str) -> WordSupport:
        """Accept *normalized_word* unconditionally."""
        del normalized_word
        return WordSupport(supported=True)


@dataclass(frozen=True, slots=True)
class AnalyzedText:
    """The full result of analysing a text, including its report."""

    canonical: str
    tokens: tuple[Token, ...]
    sentences: tuple[Sentence, ...]
    report: ValidationReport


def analyze(
    canonical: str,
    resolver: WordResolver,
    mode: ValidationMode = ValidationMode.PRACTICAL,
    document_id: str = "",
    hard_max_chars: int = defaults.HARD_MAX_SENTENCE_CHARS,
) -> AnalyzedText:
    """Validate *canonical* text and return tokens, sentences and a report.

    Args:
        canonical: Source text, already passed through
            :func:`~reader_tts.text.characters.canonicalize_source`.
        resolver: Supplies dictionary support for each word.
        mode: ``PRACTICAL`` reports ambiguity as a warning; ``STRICT`` treats
            unresolved ambiguity as an error.
        document_id: Recorded on the produced sentences.
        hard_max_chars: Sentences longer than this are reported; they are still
            synthesizable because the chunker splits them.

    Returns:
        The analysis, whose report is accepted only when no error was found.
    """
    normalized = chars.normalize_characters(canonical)
    tokens = tokenize(canonical, normalized)
    sentences = split_sentences(canonical, document_id=document_id)
    paragraphs = split_paragraphs(canonical)

    issues: list[ValidationIssue] = []
    covered = _report_patterns(canonical, normalized, issues)

    words = 0
    supported = 0
    unsupported = 0
    ambiguous = 0
    seen_ambiguous: set[str] = set()

    for token in tokens:
        if token.kind is TokenKind.UNSUPPORTED:
            if not _overlaps(token.span, covered):
                issues.append(_unsupported_token_issue(token))
            continue
        if token.kind is not TokenKind.WORD:
            continue
        if _overlaps(token.span, covered):
            continue

        words += 1
        support = resolver.check_word(token.normalized)
        if not support.supported:
            unsupported += 1
            issues.append(
                ValidationIssue(
                    code=ValidationCode.UNKNOWN_WORD,
                    severity=ValidationSeverity.ERROR,
                    message=support.reason
                    or f"'{token.raw}' is not in the pronunciation dictionary",
                    token=token,
                )
            )
            continue

        supported += 1
        if support.is_ambiguous:
            ambiguous += 1
            if token.normalized not in seen_ambiguous:
                seen_ambiguous.add(token.normalized)
                issues.append(
                    ValidationIssue(
                        code=ValidationCode.AMBIGUOUS_PRONUNCIATION,
                        severity=(
                            ValidationSeverity.ERROR
                            if mode is ValidationMode.STRICT
                            else ValidationSeverity.WARNING
                        ),
                        message=(
                            f"'{token.raw}' has {len(support.alternatives)} dictionary "
                            "pronunciations; the first is used unless you choose another"
                        ),
                        token=token,
                        alternatives=support.alternatives,
                    )
                )

    issues.extend(_sentence_issues(sentences, hard_max_chars))

    statistics = ValidationStatistics(
        characters=len(canonical),
        words=words,
        sentences=len(sentences),
        paragraphs=len(paragraphs),
        supported_words=supported,
        unsupported_words=unsupported,
        ambiguous_words=ambiguous,
    )
    ordered = tuple(sorted(issues, key=_issue_sort_key))
    accepted = not any(issue.severity is ValidationSeverity.ERROR for issue in ordered)
    report = ValidationReport(accepted=accepted, statistics=statistics, issues=ordered)
    return AnalyzedText(canonical=canonical, tokens=tokens, sentences=sentences, report=report)


def _report_patterns(
    canonical: str, normalized: str, issues: list[ValidationIssue]
) -> list[TextSpan]:
    """Report URLs and email addresses, returning the spans they cover."""
    covered: list[TextSpan] = []
    for pattern, label in ((_URL, "web addresses"), (_EMAIL, "email addresses")):
        for match in pattern.finditer(normalized):
            span = TextSpan(match.start(), match.end())
            covered.append(span)
            token = Token(
                raw=canonical[span.start : span.end],
                normalized=normalized[span.start : span.end],
                kind=TokenKind.UNSUPPORTED,
                span=span,
            )
            issues.append(
                ValidationIssue(
                    code=ValidationCode.UNSUPPORTED_TOKEN,
                    severity=ValidationSeverity.ERROR,
                    message=f"{label} are not supported in Version 1",
                    token=token,
                )
            )
    return covered


def _unsupported_token_issue(token: Token) -> ValidationIssue:
    reasons = {chars.describe_character(char) for char in token.raw}
    message = "; ".join(sorted(reasons))
    code = (
        ValidationCode.UNSUPPORTED_CHARACTER
        if len(token.raw) == 1
        else ValidationCode.UNSUPPORTED_TOKEN
    )
    return ValidationIssue(
        code=code,
        severity=ValidationSeverity.ERROR,
        message=f"'{token.raw}' cannot be read: {message}",
        token=token,
    )


def _sentence_issues(
    sentences: tuple[Sentence, ...], hard_max_chars: int
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for sentence in sentences:
        if not any(chars.is_letter(char) for char in sentence.text):
            issues.append(
                ValidationIssue(
                    code=ValidationCode.EMPTY_SENTENCE,
                    severity=ValidationSeverity.WARNING,
                    message=f"sentence {sentence.index + 1} contains no readable words",
                    token=Token(
                        raw=sentence.text,
                        normalized=sentence.text,
                        kind=TokenKind.PUNCTUATION,
                        span=sentence.span,
                    ),
                )
            )
        elif len(sentence.text) > hard_max_chars:
            issues.append(
                ValidationIssue(
                    code=ValidationCode.EXCESSIVE_LENGTH,
                    severity=ValidationSeverity.INFO,
                    message=(
                        f"sentence {sentence.index + 1} is {len(sentence.text)} characters "
                        f"and will be split into several synthesis chunks"
                    ),
                    token=Token(
                        raw=sentence.text,
                        normalized=sentence.text,
                        kind=TokenKind.WORD,
                        span=sentence.span,
                    ),
                )
            )
    return issues


def _issue_sort_key(issue: ValidationIssue) -> tuple[int, int]:
    severity_rank = {
        ValidationSeverity.ERROR: 0,
        ValidationSeverity.WARNING: 1,
        ValidationSeverity.INFO: 2,
    }[issue.severity]
    offset = issue.token.span.start if issue.token is not None else 0
    return severity_rank, offset


def _overlaps(span: TextSpan, covered: list[TextSpan]) -> bool:
    return any(span.start < other.end and other.start < span.end for other in covered)
