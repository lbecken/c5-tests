"""Request and response models for the HTTP API.

Every boundary is typed: no untyped dictionary crosses into or out of a route.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field

from reader_tts.config import defaults
from reader_tts.domain.enums import (
    ExportScope,
    ExportStatus,
    JobStatus,
    LanguageCode,
    SentenceStatus,
    ValidationMode,
)
from reader_tts.domain.models import (
    Document,
    Export,
    JobProgress,
    PronunciationOverride,
    Sentence,
    SynthesisJob,
    ValidationReport,
)

Speed = Annotated[float, Field(ge=defaults.MIN_SPEED, le=defaults.MAX_SPEED)]


# --- Health -------------------------------------------------------------------


class EngineHealth(BaseModel):
    """Engine readiness details."""

    name: str
    model_id: str
    ready: bool
    voices: list[str]
    device: str | None = None
    sample_rate: int | None = None
    error: str | None = None


class DictionaryHealth(BaseModel):
    """Dictionary provenance details."""

    name: str
    version: str
    entries: int
    language: LanguageCode = LanguageCode.EN_US


class HealthResponse(BaseModel):
    """The health route's payload."""

    status: str
    engine: EngineHealth
    dictionary: DictionaryHealth
    #: One entry per bundled language, so the interface can show what is loaded.
    dictionaries: list[DictionaryHealth] = Field(default_factory=list)
    languages: list[LanguageCode] = Field(default_factory=list)


# --- Validation ---------------------------------------------------------------


class ValidateRequest(BaseModel):
    """Ad-hoc text validation."""

    text: str = Field(max_length=2_000_000)
    mode: ValidationMode = ValidationMode.PRACTICAL
    language: LanguageCode = LanguageCode.EN_US


class IssueOut(BaseModel):
    """One validation issue with its exact source position."""

    code: str
    severity: str
    message: str
    word: str | None = None
    start: int | None = None
    end: int | None = None
    alternatives: list[str] = Field(default_factory=list)


class StatisticsOut(BaseModel):
    """Aggregate counts for a validated text."""

    characters: int
    words: int
    sentences: int
    paragraphs: int
    supported_words: int
    unsupported_words: int
    ambiguous_words: int


class SentenceOut(BaseModel):
    """One sentence, as the reader displays it."""

    id: str
    index: int
    paragraph_index: int
    text: str
    start: int
    end: int
    terminal_punctuation: str | None = None
    status: SentenceStatus = SentenceStatus.PENDING

    @classmethod
    def from_domain(
        cls, sentence: Sentence, status: SentenceStatus = SentenceStatus.PENDING
    ) -> SentenceOut:
        """Build the response model from a domain sentence."""
        return cls(
            id=sentence.id,
            index=sentence.index,
            paragraph_index=sentence.paragraph_index,
            text=sentence.text,
            start=sentence.span.start,
            end=sentence.span.end,
            terminal_punctuation=sentence.terminal_punctuation,
            status=status,
        )


class ValidationResponse(BaseModel):
    """A validation report, optionally with the sentences it segmented."""

    accepted: bool
    statistics: StatisticsOut
    issues: list[IssueOut]
    sentences: list[SentenceOut] = Field(default_factory=list)

    @classmethod
    def from_domain(
        cls, report: ValidationReport, sentences: tuple[Sentence, ...] = ()
    ) -> ValidationResponse:
        """Build the response model from a domain report."""
        return cls(
            accepted=report.accepted,
            statistics=StatisticsOut(
                characters=report.statistics.characters,
                words=report.statistics.words,
                sentences=report.statistics.sentences,
                paragraphs=report.statistics.paragraphs,
                supported_words=report.statistics.supported_words,
                unsupported_words=report.statistics.unsupported_words,
                ambiguous_words=report.statistics.ambiguous_words,
            ),
            issues=[
                IssueOut(
                    code=issue.code.value,
                    severity=issue.severity.value,
                    message=issue.message,
                    word=issue.token.raw if issue.token else None,
                    start=issue.token.span.start if issue.token else None,
                    end=issue.token.span.end if issue.token else None,
                    alternatives=list(issue.alternatives),
                )
                for issue in report.issues
            ],
            sentences=[SentenceOut.from_domain(sentence) for sentence in sentences],
        )


# --- Dictionary ------------------------------------------------------------------


class PronunciationOut(BaseModel):
    """One pronunciation variant."""

    variant: int
    arpabet: str


class DictionaryResponse(BaseModel):
    """A dictionary lookup result."""

    word: str
    supported: bool
    language: LanguageCode = LanguageCode.EN_US
    notation: str = "arpabet"
    compound: bool = False
    components: list[str] = Field(default_factory=list)
    pronunciations: list[PronunciationOut] = Field(default_factory=list)
    override: str | None = None


# --- Documents ----------------------------------------------------------------------


class CreateDocumentRequest(BaseModel):
    """A new document."""

    text: str = Field(min_length=1, max_length=2_000_000)
    title: str | None = Field(default=None, max_length=300)
    #: Which language pack validates and speaks this document. It is chosen
    #: explicitly: the reader never guesses a language from the text.
    language: LanguageCode = LanguageCode.EN_US


class DocumentResponse(BaseModel):
    """A stored document and its sentences."""

    id: str
    title: str
    text: str
    text_hash: str
    created_at: str
    language: LanguageCode = LanguageCode.EN_US
    sentences: list[SentenceOut] = Field(default_factory=list)

    @classmethod
    def from_domain(
        cls,
        document: Document,
        sentences: tuple[Sentence, ...] = (),
        statuses: dict[str, SentenceStatus] | None = None,
    ) -> DocumentResponse:
        """Build the response model from a domain document."""
        lookup = statuses or {}
        return cls(
            id=document.id,
            title=document.title,
            text=document.original_text,
            text_hash=document.text_hash,
            created_at=document.created_at.isoformat(),
            language=document.language,
            sentences=[
                SentenceOut.from_domain(sentence, lookup.get(sentence.id, SentenceStatus.PENDING))
                for sentence in sentences
            ],
        )


class DocumentSummary(BaseModel):
    """A document without its text, for listings."""

    id: str
    title: str
    created_at: str
    characters: int
    language: LanguageCode = LanguageCode.EN_US


class ValidateDocumentRequest(BaseModel):
    """Validation options for a stored document."""

    mode: ValidationMode = ValidationMode.PRACTICAL


# --- Jobs ----------------------------------------------------------------------------


class CreateJobRequest(BaseModel):
    """A request to synthesize a document."""

    #: Omit to use the document language's default voice. French bundles a
    #: single voice, so leaving this unset selects it automatically.
    voice_id: str | None = Field(default=None, min_length=1, max_length=64)
    speed: Speed = defaults.DEFAULT_SPEED
    validation_mode: ValidationMode = ValidationMode.PRACTICAL


class JobResponse(BaseModel):
    """A synthesis job's current state."""

    id: str
    document_id: str
    status: JobStatus
    voice_id: str
    speed: float
    total_units: int
    completed_units: int
    failed_units: int
    cache_hits: int
    synthesized_units: int
    current_sentence_index: int | None = None
    generated_duration_seconds: float = 0.0
    error_message: str | None = None

    @classmethod
    def from_job(cls, job: SynthesisJob) -> JobResponse:
        """Build the response model from a job record."""
        return cls(
            id=job.id,
            document_id=job.document_id,
            status=job.status,
            voice_id=job.voice_id,
            speed=job.speed,
            total_units=job.total_units,
            completed_units=job.completed_units,
            failed_units=job.failed_units,
            cache_hits=job.cache_hits,
            synthesized_units=job.synthesized_units,
            error_message=job.error_message,
        )

    @classmethod
    def from_progress(cls, progress: JobProgress, voice_id: str, speed: float) -> JobResponse:
        """Build the response model from a progress snapshot."""
        return cls(
            id=progress.job_id,
            document_id=progress.document_id,
            status=progress.status,
            voice_id=voice_id,
            speed=speed,
            total_units=progress.total_units,
            completed_units=progress.completed_units,
            failed_units=progress.failed_units,
            cache_hits=progress.cache_hits,
            synthesized_units=progress.synthesized_units,
            current_sentence_index=progress.current_sentence_index,
            generated_duration_seconds=progress.generated_duration_seconds,
            error_message=progress.error_message,
        )


# --- Sentences ---------------------------------------------------------------------------


class RegenerateRequest(BaseModel):
    """Options for re-synthesizing one sentence."""

    voice_id: str | None = None
    speed: Speed | None = None
    variant_index: int | None = Field(default=None, ge=0, le=64)
    word: str | None = Field(default=None, max_length=100)
    synthesis_text: str | None = Field(default=None, max_length=1_000)
    bypass_cache: bool = False


class SentenceAudioOut(BaseModel):
    """The synthesis state of one chunk."""

    sentence_id: str
    chunk_index: int
    cache_key: str | None
    status: SentenceStatus
    error_message: str | None = None


# --- Voices -------------------------------------------------------------------------------


class VoiceOut(BaseModel):
    """A bundled voice."""

    id: str
    display_name: str
    language_code: str
    gender: str | None = None
    default_speed: float
    #: Whether the voice file is present, so the voice can actually be used.
    available: bool = True


class LanguageOut(BaseModel):
    """A bundled language pack."""

    code: LanguageCode
    display_name: str
    dictionary: str
    notation: str
    voices: list[VoiceOut]
    default_voice: str
    sample_text: str


class LanguagesResponse(BaseModel):
    """Every bundled language."""

    languages: list[LanguageOut]
    default_language: LanguageCode = LanguageCode.EN_US


class VoicesResponse(BaseModel):
    """Every bundled voice, with the supported speed range."""

    voices: list[VoiceOut]
    min_speed: float = defaults.MIN_SPEED
    max_speed: float = defaults.MAX_SPEED
    speed_step: float = defaults.SPEED_STEP
    default_speed: float = defaults.DEFAULT_SPEED


# --- Overrides ------------------------------------------------------------------------------


class OverrideRequest(BaseModel):
    """A pronunciation override."""

    #: ARPAbet for English, IPA for French; validated against the language's
    #: inventory.
    phonemes: list[str] = Field(min_length=1, max_length=64)
    language: LanguageCode = LanguageCode.EN_US
    synthesis_text: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=500)
    document_id: str | None = None


class OverrideOut(BaseModel):
    """A stored override."""

    id: str
    word: str
    scope: str
    document_id: str | None
    arpabet: str
    synthesis_text: str | None
    note: str | None

    @classmethod
    def from_domain(cls, override: PronunciationOverride) -> OverrideOut:
        """Build the response model from a stored override."""
        return cls(
            id=override.id,
            word=override.word,
            scope=override.scope.value,
            document_id=override.document_id,
            arpabet=" ".join(override.phonemes),
            synthesis_text=override.synthesis_text,
            note=override.note,
        )


class OverridesResponse(BaseModel):
    """Every override relevant to a document."""

    overrides: list[OverrideOut]


# --- Exports ----------------------------------------------------------------------------------


class CreateExportRequest(BaseModel):
    """A request to render audio to a file."""

    scope: ExportScope = ExportScope.DOCUMENT
    voice_id: str | None = Field(default=None, min_length=1, max_length=64)
    speed: Speed = defaults.DEFAULT_SPEED
    paragraph_index: int | None = Field(default=None, ge=0)
    sentence_id: str | None = None


class ExportOut(BaseModel):
    """A rendered export."""

    id: str
    document_id: str
    scope: ExportScope
    status: ExportStatus
    filename: str | None
    byte_size: int | None
    duration_seconds: float | None
    download_url: str | None = None

    @classmethod
    def from_domain(cls, export: Export) -> ExportOut:
        """Build the response model from an export record."""
        return cls(
            id=export.id,
            document_id=export.document_id,
            scope=export.scope,
            status=export.status,
            filename=export.filename,
            byte_size=export.byte_size,
            duration_seconds=export.duration_seconds,
            download_url=(
                f"/api/v1/exports/{export.id}/file"
                if export.status is ExportStatus.COMPLETE
                else None
            ),
        )


# --- Reading state -------------------------------------------------------------------------------


class ReadingState(BaseModel):
    """The position the reader restores after a page reload."""

    document_id: str | None = None
    sentence_index: int = 0
    offset_seconds: float = 0.0
    voice_id: str | None = None
    speed: Speed = defaults.DEFAULT_SPEED
    language: LanguageCode = LanguageCode.EN_US


class ErrorResponse(BaseModel):
    """The uniform error payload; never carries a stack trace."""

    error: str
    code: str
