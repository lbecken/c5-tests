"""Document storage, job lifecycle, resumption and export tests.

Every test here uses the fake engine, so nothing loads a model or reaches the
network.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from reader_tts.config.settings import Settings
from reader_tts.container import AppServices
from reader_tts.documents.exporter import sanitize_filename
from reader_tts.domain.enums import ExportStatus, JobStatus, SentenceStatus, ValidationMode
from reader_tts.domain.errors import (
    ConflictError,
    DocumentNotFoundError,
    DocumentTooLargeError,
    SentenceNotFoundError,
    ValidationError,
)
from reader_tts.synthesis.fake_engine import FakeSpeechEngine

SAMPLE_TEXT = (
    "The cat sat on the mat. The wind moved through the trees.\n\n"
    "Did you close the door? I read the book yesterday."
)


@pytest.fixture
def services(tmp_path: Path) -> Iterator[AppServices]:
    """A container wired to a temporary runtime directory and the fake engine."""
    settings = Settings(
        data_dir=Path("data"),
        runtime_dir=tmp_path / "runtime",
        model_dir=tmp_path / "models",
        engine="fake",
        max_concurrency=1,
    )
    container = AppServices(settings, engine=FakeSpeechEngine())
    yield container
    container.close()


def engine_of(services: AppServices) -> FakeSpeechEngine:
    engine = services.engine
    assert isinstance(engine, FakeSpeechEngine)
    return engine


# --- Documents --------------------------------------------------------------------


def test_create_stores_document_and_sentences(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT, title="Sample")
    assert document.title == "Sample"
    sentences = services.documents.sentences(document.id)
    assert len(sentences) == 4
    assert [s.index for s in sentences] == [0, 1, 2, 3]
    assert [s.paragraph_index for s in sentences] == [0, 0, 1, 1]


def test_sentence_spans_address_the_stored_text(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    for sentence in services.documents.sentences(document.id):
        assert document.original_text[sentence.span.start : sentence.span.end] == sentence.text


def test_default_title_is_applied(services: AppServices) -> None:
    assert services.documents.create("The cat sat.").title == "Untitled document"


def test_windows_line_endings_are_canonicalized(services: AppServices) -> None:
    document = services.documents.create("One.\r\n\r\nTwo.")
    assert "\r" not in document.original_text


def test_empty_document_is_refused(services: AppServices) -> None:
    with pytest.raises(DocumentTooLargeError):
        services.documents.create("   \n  ")


def test_oversized_document_is_refused(tmp_path: Path) -> None:
    settings = Settings(
        runtime_dir=tmp_path / "runtime", engine="fake", max_document_characters=1_000
    )
    container = AppServices(settings, engine=FakeSpeechEngine())
    try:
        with pytest.raises(DocumentTooLargeError, match="exceeds the limit"):
            container.documents.create("word " * 500)
    finally:
        container.close()


def test_missing_document_raises(services: AppServices) -> None:
    with pytest.raises(DocumentNotFoundError):
        services.documents.get("does-not-exist")


def test_missing_sentence_raises(services: AppServices) -> None:
    with pytest.raises(SentenceNotFoundError):
        services.documents.sentence("does-not-exist")


def test_ten_thousand_characters_are_segmented(services: AppServices) -> None:
    text = ("The wind moved through the trees. " * 320).strip()
    assert len(text) > 10_000
    document = services.documents.create(text)
    assert len(services.documents.sentences(document.id)) == 320


def test_deleting_a_document_cascades(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    services.documents.delete(document.id)
    assert services.documents.sentences(document.id) == ()


# --- Validation ---------------------------------------------------------------------


def test_document_validation_reports_statistics(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    report = services.documents.validate(document.id, services.resolver(document.id))
    assert report.accepted
    assert report.statistics.sentences == 4
    assert report.statistics.paragraphs == 2


def test_validation_blocks_unknown_words(services: AppServices) -> None:
    document = services.documents.create("The frobnicator sat.")
    report = services.documents.validate(document.id, services.resolver(document.id))
    assert not report.accepted


# --- Jobs ------------------------------------------------------------------------------


def test_job_synthesizes_every_sentence(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    assert job.total_units == 4

    progress = services.jobs.run(job.id, resolver)
    assert progress.status is JobStatus.COMPLETED
    assert progress.completed_units == 4
    assert progress.failed_units == 0
    assert progress.synthesized_units == 4
    assert progress.generated_duration_seconds > 0
    assert engine_of(services).call_count == 4


def test_job_creation_is_blocked_by_validation(services: AppServices) -> None:
    document = services.documents.create("The frobnicator sat.")
    with pytest.raises(ValidationError, match="did not pass validation"):
        services.jobs.create(document.id, services.resolver(document.id), "af_heart", 1.0)


def test_strict_mode_blocks_ambiguity(services: AppServices) -> None:
    document = services.documents.create("Please record the record.")
    with pytest.raises(ValidationError):
        services.jobs.create(
            document.id,
            services.resolver(document.id),
            "af_heart",
            1.0,
            mode=ValidationMode.STRICT,
        )


def test_second_job_for_a_running_document_is_refused(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    services.jobs.create(document.id, resolver, "af_heart", 1.0)
    with pytest.raises(ConflictError):
        services.jobs.create(document.id, resolver, "af_heart", 1.0)


def test_repeated_generation_uses_the_cache(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    first = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(first.id, resolver)
    assert engine_of(services).call_count == 4

    second_document = services.documents.create(SAMPLE_TEXT)
    second_resolver = services.resolver(second_document.id)
    second = services.jobs.create(second_document.id, second_resolver, "af_heart", 1.0)
    progress = services.jobs.run(second.id, second_resolver)
    assert progress.cache_hits == 4
    assert progress.synthesized_units == 0
    assert engine_of(services).call_count == 4


def test_changing_voice_regenerates(services: AppServices) -> None:
    document = services.documents.create("The cat sat on the mat.")
    resolver = services.resolver(document.id)
    first = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(first.id, resolver)

    other = services.documents.create("The cat sat on the mat.")
    other_resolver = services.resolver(other.id)
    job = services.jobs.create(other.id, other_resolver, "am_michael", 1.0)
    progress = services.jobs.run(job.id, other_resolver)
    assert progress.cache_hits == 0
    assert progress.synthesized_units == 1


def test_failed_unit_marks_the_job_failed(services: AppServices) -> None:
    engine_of(services).fail_on.add("door")
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    progress = services.jobs.run(job.id, resolver)
    assert progress.status is JobStatus.FAILED
    assert progress.failed_units == 1
    assert progress.completed_units == 3


def test_cancelled_job_stops(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.cancel(job.id)
    progress = services.jobs.run(job.id, resolver)
    assert progress.status is JobStatus.CANCELLED
    assert engine_of(services).call_count == 0


def test_cancelling_a_finished_job_is_refused(services: AppServices) -> None:
    document = services.documents.create("The cat sat.")
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)
    with pytest.raises(ConflictError):
        services.jobs.cancel(job.id)


def test_job_resumes_after_a_restart(tmp_path: Path) -> None:
    """A job interrupted mid-document continues from where it stopped."""
    settings = Settings(runtime_dir=tmp_path / "runtime", engine="fake")

    first = AppServices(settings, engine=FakeSpeechEngine())
    first_engine = first.engine
    assert isinstance(first_engine, FakeSpeechEngine)
    first_engine.fail_on.add("door")
    document = first.documents.create(SAMPLE_TEXT)
    resolver = first.resolver(document.id)
    job = first.jobs.create(document.id, resolver, "af_heart", 1.0)
    first.jobs.run(job.id, resolver)
    assert first.job_repository.get(job.id).completed_units == 3
    first.close()

    # A new process opens the same runtime directory and resumes the job.
    second = AppServices(settings, engine=FakeSpeechEngine())
    try:
        second_resolver = second.resolver(document.id)
        second.job_repository.set_status(job.id, JobStatus.RUNNING)
        progress = second.jobs.run(job.id, second_resolver)
        assert progress.status is JobStatus.COMPLETED
        assert progress.completed_units == 4
        second_engine = second.engine
        assert isinstance(second_engine, FakeSpeechEngine)
        # Only the one previously failed unit needed the engine; the other
        # three were already cached by the first process.
        assert second_engine.call_count == 1
    finally:
        second.close()


def test_sentence_audio_records_are_persisted(services: AppServices) -> None:
    document = services.documents.create("The cat sat on the mat.")
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)

    sentence = services.documents.sentences(document.id)[0]
    records = services.job_repository.sentence_audio(sentence.id)
    assert len(records) == 1
    assert records[0].status is SentenceStatus.COMPLETE
    assert records[0].cache_key


def test_long_sentence_produces_several_units(services: AppServices) -> None:
    text = "The wind moved through the trees, and the cat sat on the mat, " * 12 + "again."
    document = services.documents.create(text.strip())
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    sentences = services.documents.sentences(document.id)
    assert job.total_units > len(sentences)


# --- Regeneration ---------------------------------------------------------------------


def test_regenerate_sentence(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)

    sentence = services.documents.sentences(document.id)[0]
    before = engine_of(services).call_count
    records = services.jobs.regenerate_sentence(
        sentence.id, resolver, "af_heart", 1.0, bypass_cache=True
    )
    assert len(records) == 1
    assert engine_of(services).call_count == before + 1


def test_regenerate_with_a_different_voice(services: AppServices) -> None:
    document = services.documents.create("The cat sat on the mat.")
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)
    sentence = services.documents.sentences(document.id)[0]

    records = services.jobs.regenerate_sentence(sentence.id, resolver, "am_michael", 1.0)
    entry = services.cache_repository.get(records[0].cache_key or "")
    assert entry is not None
    assert entry.voice_id == "am_michael"


def test_override_change_invalidates_synthesis(services: AppServices) -> None:
    document = services.documents.create("I lead the way.")
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)
    sentence = services.documents.sentences(document.id)[0]
    original_key = services.job_repository.sentence_audio(sentence.id)[0].cache_key

    services.overrides.upsert("LEAD", ["L", "EH1", "D"], synthesis_text="led")
    fresh_resolver = services.resolver(document.id)
    records = services.jobs.regenerate_sentence(sentence.id, fresh_resolver, "af_heart", 1.0)
    assert records[0].cache_key != original_key


# --- Export ------------------------------------------------------------------------------


def test_document_export(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)

    export = services.exports.export_document(document.id, "af_heart", 1.0)
    assert export.status is ExportStatus.COMPLETE
    assert export.duration_seconds is not None and export.duration_seconds > 0
    path = services.exports.file_path(export.id)
    assert path.is_file()
    assert path.stat().st_size == export.byte_size


def test_export_includes_paragraph_pauses(services: AppServices) -> None:
    """A paragraph boundary is longer than a sentence boundary."""
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)

    export = services.exports.export_document(document.id, "af_heart", 1.0)
    assert export.duration_seconds is not None

    settings = services.settings
    sentence_gaps = 2  # two boundaries inside paragraphs
    paragraph_gaps = 1
    expected_padding = (
        sentence_gaps * settings.sentence_pause_ms + paragraph_gaps * settings.paragraph_pause_ms
    ) / 1000
    speech = sum(
        services.cache_repository.get(record.cache_key or "").duration_seconds  # type: ignore[union-attr]
        for records in services.job_repository.document_audio(document.id).values()
        for record in records
    )
    assert export.duration_seconds == pytest.approx(speech + expected_padding, abs=0.05)


def test_sentence_export(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)

    sentence = services.documents.sentences(document.id)[0]
    export = services.exports.export_sentence(sentence.id, "af_heart", 1.0)
    assert export.status is ExportStatus.COMPLETE
    assert services.exports.file_path(export.id).is_file()


def test_paragraph_export(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    resolver = services.resolver(document.id)
    job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
    services.jobs.run(job.id, resolver)

    export = services.exports.export_paragraph(document.id, 1, "af_heart", 1.0)
    assert export.status is ExportStatus.COMPLETE


def test_export_without_audio_is_refused(services: AppServices) -> None:
    document = services.documents.create(SAMPLE_TEXT)
    with pytest.raises(ValidationError, match="audio is missing"):
        services.exports.export_document(document.id, "af_heart", 1.0)


def test_export_filenames_are_sanitized() -> None:
    assert sanitize_filename("My Book!", "af_heart", 1.0) == "my-book-af-heart-1.00x.wav"
    assert sanitize_filename("../../etc/passwd", "af_heart", 1.0).startswith("etc-passwd")
    assert "/" not in sanitize_filename("a/b/c", "af_heart", 1.0)
    assert sanitize_filename("", "af_heart", 1.25) == "document-af-heart-1.25x.wav"


def test_export_file_is_served_only_when_registered(services: AppServices) -> None:
    from reader_tts.domain.errors import ExportNotFoundError

    with pytest.raises(ExportNotFoundError):
        services.exports.file_path("not-an-export")
