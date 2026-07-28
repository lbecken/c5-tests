"""Enumerations shared across the domain."""

from __future__ import annotations

from enum import StrEnum


class TokenKind(StrEnum):
    """Classification assigned to every token produced by the tokenizer."""

    WORD = "word"
    PUNCTUATION = "punctuation"
    WHITESPACE = "whitespace"
    PARAGRAPH_BREAK = "paragraph_break"
    UNSUPPORTED = "unsupported"


class ValidationSeverity(StrEnum):
    """How strongly a validation issue affects the document."""

    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationCode(StrEnum):
    """Machine-readable identifier for a validation issue."""

    UNKNOWN_WORD = "unknown_word"
    UNSUPPORTED_CHARACTER = "unsupported_character"
    AMBIGUOUS_PRONUNCIATION = "ambiguous_pronunciation"
    EMPTY_SENTENCE = "empty_sentence"
    EXCESSIVE_LENGTH = "excessive_length"
    UNSUPPORTED_TOKEN = "unsupported_token"


class ValidationMode(StrEnum):
    """Validation strictness selected by the user."""

    PRACTICAL = "practical"
    STRICT = "strict"


class SentenceStatus(StrEnum):
    """Lifecycle of a single sentence within a synthesis job."""

    PENDING = "pending"
    VALIDATION_FAILED = "validation_failed"
    READY = "ready"
    SYNTHESIZING = "synthesizing"
    CACHED = "cached"
    COMPLETE = "complete"
    FAILED = "failed"


class JobStatus(StrEnum):
    """Lifecycle of a synthesis job."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"

    @property
    def is_terminal(self) -> bool:
        """Whether no further work will be performed for this job."""
        return self in {JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.FAILED}


class PronunciationSource(StrEnum):
    """Where a resolved pronunciation came from, in precedence order."""

    DOCUMENT_OVERRIDE = "document_override"
    GLOBAL_OVERRIDE = "global_override"
    USER_VARIANT = "user_variant"
    DICTIONARY = "dictionary"
    COMPOUND = "compound"


class OverrideScope(StrEnum):
    """Whether an override applies globally or to a single document."""

    GLOBAL = "global"
    DOCUMENT = "document"


class ExportScope(StrEnum):
    """Portion of a document covered by an export."""

    SENTENCE = "sentence"
    PARAGRAPH = "paragraph"
    DOCUMENT = "document"


class ExportStatus(StrEnum):
    """Lifecycle of an export request."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"
