"""Immutable domain models.

These types are shared by the CLI, the HTTP API and the service layer. They
never depend on FastAPI, SQLite or the speech engine.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from reader_tts.domain.enums import (
    ExportScope,
    ExportStatus,
    JobStatus,
    OverrideScope,
    PronunciationSource,
    SentenceStatus,
    TokenKind,
    ValidationCode,
    ValidationSeverity,
)

# --- Text --------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TextSpan:
    """Half-open ``[start, end)`` offset range into the original source text."""

    start: int
    end: int

    def __post_init__(self) -> None:
        if self.start < 0 or self.end < self.start:
            msg = f"invalid span: [{self.start}, {self.end})"
            raise ValueError(msg)

    @property
    def length(self) -> int:
        """Number of characters covered by the span."""
        return self.end - self.start


@dataclass(frozen=True, slots=True)
class Token:
    """A single lexical unit with its exact position in the source text."""

    raw: str
    normalized: str
    kind: TokenKind
    span: TextSpan

    @property
    def is_word(self) -> bool:
        """Whether this token is a candidate for dictionary lookup."""
        return self.kind is TokenKind.WORD


# --- Validation ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    """A single problem discovered while validating input text."""

    code: ValidationCode
    severity: ValidationSeverity
    message: str
    token: Token | None = None
    alternatives: tuple[str, ...] = ()

    @property
    def blocks_synthesis(self) -> bool:
        """Whether this issue prevents synthesis from starting."""
        return self.severity is ValidationSeverity.ERROR


@dataclass(frozen=True, slots=True)
class ValidationStatistics:
    """Aggregate counts describing a validated text."""

    characters: int
    words: int
    sentences: int
    paragraphs: int
    supported_words: int
    unsupported_words: int
    ambiguous_words: int


@dataclass(frozen=True, slots=True)
class ValidationReport:
    """Outcome of validating a text or document."""

    accepted: bool
    statistics: ValidationStatistics
    issues: tuple[ValidationIssue, ...]

    @property
    def errors(self) -> tuple[ValidationIssue, ...]:
        """Issues that block synthesis."""
        return tuple(i for i in self.issues if i.severity is ValidationSeverity.ERROR)

    @property
    def warnings(self) -> tuple[ValidationIssue, ...]:
        """Issues that are reported but do not block synthesis."""
        return tuple(i for i in self.issues if i.severity is ValidationSeverity.WARNING)


# --- Pronunciation -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Pronunciation:
    """One pronunciation variant for a dictionary word."""

    phonemes: tuple[str, ...]
    source: str
    variant_index: int

    @property
    def arpabet(self) -> str:
        """Space-separated ARPAbet rendering, for display and storage."""
        return " ".join(self.phonemes)


@dataclass(frozen=True, slots=True)
class DictionaryEntry:
    """Every pronunciation the dictionary holds for one normalized word."""

    normalized_word: str
    pronunciations: tuple[Pronunciation, ...]

    @property
    def is_ambiguous(self) -> bool:
        """Whether the dictionary offers more than one pronunciation."""
        return len(self.pronunciations) > 1


@dataclass(frozen=True, slots=True)
class ResolvedPronunciation:
    """The pronunciation selected for a word after applying precedence rules."""

    word: str
    phonemes: tuple[str, ...]
    source: PronunciationSource
    variant_index: int | None
    is_ambiguous: bool
    alternatives: tuple[Pronunciation, ...] = ()
    synthesis_text: str | None = None

    @property
    def arpabet(self) -> str:
        """Space-separated ARPAbet rendering."""
        return " ".join(self.phonemes)


@dataclass(frozen=True, slots=True)
class PronunciationOverride:
    """A user-defined pronunciation, stored globally or per document."""

    id: str
    scope: OverrideScope
    document_id: str | None
    word: str
    phonemes: tuple[str, ...]
    synthesis_text: str | None
    note: str | None
    created_at: datetime
    updated_at: datetime


# --- Documents -----------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Sentence:
    """One logical sentence, the unit of navigation and playback."""

    id: str
    document_id: str
    index: int
    paragraph_index: int
    text: str
    span: TextSpan
    terminal_punctuation: str | None


@dataclass(frozen=True, slots=True)
class Document:
    """A stored body of text along with its segmentation."""

    id: str
    title: str
    original_text: str
    text_hash: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class Paragraph:
    """A run of sentences separated from its neighbours by a blank line."""

    index: int
    span: TextSpan
    text: str


# --- Synthesis units -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SynthesisChunk:
    """A technical unit passed to the engine; a sentence may yield several."""

    sentence_id: str
    chunk_index: int
    display_text: str
    synthesis_text: str

    @property
    def is_empty(self) -> bool:
        """Whether the chunk carries no synthesizable text."""
        return not self.synthesis_text.strip()


@dataclass(frozen=True, slots=True)
class SentenceAudio:
    """The synthesis state of one chunk of one sentence."""

    sentence_id: str
    chunk_index: int
    cache_key: str | None
    status: SentenceStatus
    error_message: str | None = None


# --- Jobs -------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SynthesisJob:
    """A request to synthesize every sentence of one document."""

    id: str
    document_id: str
    status: JobStatus
    voice_id: str
    speed: float
    total_units: int
    completed_units: int
    failed_units: int
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    cache_hits: int = 0
    synthesized_units: int = 0


@dataclass(frozen=True, slots=True)
class JobProgress:
    """A snapshot of job progress suitable for polling clients."""

    job_id: str
    document_id: str
    status: JobStatus
    total_units: int
    completed_units: int
    failed_units: int
    cache_hits: int
    synthesized_units: int
    current_sentence_index: int | None
    generated_duration_seconds: float
    error_message: str | None = None


# --- Cache ------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CacheEntry:
    """Metadata describing one cached audio file."""

    cache_key: str
    engine: str
    model_id: str
    voice_id: str
    language_code: str
    speed: float
    synthesis_text_hash: str
    audio_path: str
    sample_rate: int
    duration_seconds: float
    byte_size: int
    created_at: datetime
    last_accessed_at: datetime


@dataclass(frozen=True, slots=True)
class CacheStatistics:
    """Aggregate figures describing the audio cache."""

    entries: int
    total_bytes: int
    total_duration_seconds: float
    orphaned_records: int
    orphaned_files: int


# --- Exports -----------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Export:
    """A rendered audio file covering part or all of a document."""

    id: str
    document_id: str
    scope: ExportScope
    status: ExportStatus
    voice_id: str
    speed: float
    file_path: str | None
    filename: str | None
    byte_size: int | None
    duration_seconds: float | None
    created_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None


# --- Engine descriptions ------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class VoiceConfig:
    """A curated, bundled voice."""

    id: str
    display_name: str
    language_code: str
    gender_label: str | None
    model_voice_name: str
    default_speed: float


@dataclass(frozen=True, slots=True)
class EngineInfo:
    """Everything the health route reports about the loaded engine."""

    name: str
    model_id: str
    ready: bool
    voices: tuple[str, ...]
    sample_rate: int
    device: str
    model_hash: str
    initialization_seconds: float
    error_message: str | None = None


@dataclass(frozen=True, slots=True)
class DictionaryInfo:
    """Metadata describing the loaded pronunciation dictionary."""

    name: str
    version: str
    entries: int
    malformed_lines: tuple[str, ...] = field(default=())
