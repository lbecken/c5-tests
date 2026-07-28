"""Synthesis job orchestration.

A job walks a document sentence by sentence. Every unit's outcome is persisted
immediately, which is what makes progress survive a page refresh, cancellation
take effect promptly, and an interrupted job resumable after a restart.
"""

from __future__ import annotations

import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final

from reader_tts.documents.document_service import DocumentService
from reader_tts.documents.progress import JobRepository, build_progress
from reader_tts.domain.enums import JobStatus, SentenceStatus, ValidationMode
from reader_tts.domain.errors import (
    ConflictError,
    SpeechEngineError,
    ValidationError,
)
from reader_tts.domain.models import (
    JobProgress,
    Sentence,
    SentenceAudio,
    SynthesisChunk,
    SynthesisJob,
)
from reader_tts.pronunciation.resolver import PronunciationResolver
from reader_tts.synthesis.base import validate_speed
from reader_tts.synthesis.chunker import prepare_sentence
from reader_tts.synthesis.synthesis_service import SynthesisService
from reader_tts.text.tokenizer import tokenize, word_tokens

_LOGGER: Final = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class JobPlan:
    """The units a job will process."""

    job: SynthesisJob
    chunks: tuple[SynthesisChunk, ...]


class JobService:
    """Creates, runs, cancels and resumes synthesis jobs."""

    def __init__(
        self,
        documents: DocumentService,
        jobs: JobRepository,
        synthesis: SynthesisService,
        max_concurrency: int = 1,
        preferred_max_chars: int = 350,
        hard_max_chars: int = 600,
    ) -> None:
        self._documents = documents
        self._jobs = jobs
        self._synthesis = synthesis
        self._max_concurrency = max(1, max_concurrency)
        self._preferred_max_chars = preferred_max_chars
        self._hard_max_chars = hard_max_chars
        self._running: dict[str, threading.Thread] = {}
        self._lock = threading.RLock()

    # --- Creation ---------------------------------------------------------------

    def create(
        self,
        document_id: str,
        resolver: PronunciationResolver,
        voice_id: str,
        speed: float,
        mode: ValidationMode = ValidationMode.PRACTICAL,
    ) -> SynthesisJob:
        """Validate a document and create a job for it.

        Raises:
            ValidationError: If validation produced errors.
            ConflictError: If a job for this document is already running.
        """
        report = self._documents.validate(document_id, resolver, mode)
        if not report.accepted:
            messages = "; ".join(issue.message for issue in report.errors[:5])
            raise ValidationError(f"the document did not pass validation: {messages}")

        with self._lock:
            existing = self._jobs.latest_for_document(document_id)
            if existing is not None and not existing.status.is_terminal:
                raise ConflictError(
                    f"job {existing.id} is already {existing.status.value} for this document"
                )

            sentences = self._documents.sentences(document_id)
            chunks = self._plan_chunks(sentences, resolver)
            job = SynthesisJob(
                id=str(uuid.uuid4()),
                document_id=document_id,
                status=JobStatus.PENDING,
                voice_id=voice_id,
                speed=validate_speed(speed),
                total_units=len(chunks),
                completed_units=0,
                failed_units=0,
                created_at=datetime.now(tz=UTC),
            )
            self._jobs.create(job)

        for chunk in chunks:
            self._jobs.set_sentence_audio(
                SentenceAudio(
                    sentence_id=chunk.sentence_id,
                    chunk_index=chunk.chunk_index,
                    cache_key=None,
                    status=SentenceStatus.PENDING,
                )
            )
        _LOGGER.info(
            "job_created",
            extra={"job_id": job.id, "document_id": document_id, "units": len(chunks)},
        )
        return job

    def _plan_chunks(
        self, sentences: tuple[Sentence, ...], resolver: PronunciationResolver
    ) -> tuple[SynthesisChunk, ...]:
        replacements = self._replacements_for(sentences, resolver)
        chunks: list[SynthesisChunk] = []
        for sentence in sentences:
            try:
                prepared = prepare_sentence(
                    sentence,
                    replacements=replacements,
                    preferred_max_chars=self._preferred_max_chars,
                    hard_max_chars=self._hard_max_chars,
                )
            except ValidationError:
                # A sentence of pure punctuation is skipped rather than failing
                # the job; it was already reported as a validation warning.
                continue
            chunks.extend(prepared.chunks)
        return tuple(chunks)

    def _replacements_for(
        self, sentences: tuple[Sentence, ...], resolver: PronunciationResolver
    ) -> dict[str, str]:
        words = {
            token.normalized
            for sentence in sentences
            for token in word_tokens(tokenize(sentence.text))
        }
        return resolver.synthesis_replacements(frozenset(words))

    # --- Execution ---------------------------------------------------------------

    def run(self, job_id: str, resolver: PronunciationResolver) -> JobProgress:
        """Run a job to completion in the calling thread."""
        job = self._jobs.get(job_id)
        if job.status.is_terminal:
            return build_progress(self._jobs, job)

        self._jobs.set_status(job_id, JobStatus.RUNNING)
        sentences = {s.id: s for s in self._documents.sentences(job.document_id)}
        pending = self._pending_units(sentences, resolver)

        completed = job.completed_units
        failed = job.failed_units
        cache_hits = job.cache_hits
        synthesized = job.synthesized_units
        cancelled = False

        def process(chunk: SynthesisChunk) -> tuple[SynthesisChunk, str | None, bool, str | None]:
            """Return ``(chunk, cache_key, cache_hit, error)``."""
            self._jobs.set_sentence_audio(
                SentenceAudio(
                    sentence_id=chunk.sentence_id,
                    chunk_index=chunk.chunk_index,
                    cache_key=None,
                    status=SentenceStatus.SYNTHESIZING,
                )
            )
            try:
                outcome = self._synthesis.synthesize(
                    text=chunk.synthesis_text,
                    voice_id=job.voice_id,
                    speed=job.speed,
                    override_revision=resolver.override_revision(),
                )
            except SpeechEngineError as error:
                return chunk, None, False, str(error)
            return chunk, outcome.cache_key, outcome.cache_hit, None

        # Units are processed in batches of at most max_concurrency. Results are
        # applied in submission order so that stored progress always describes a
        # prefix of the document, which is what makes resumption straightforward.
        with ThreadPoolExecutor(max_workers=self._max_concurrency) as pool:
            for start in range(0, len(pending), self._max_concurrency):
                if self._jobs.is_cancelled(job_id):
                    cancelled = True
                    break
                batch = pending[start : start + self._max_concurrency]
                futures = [pool.submit(process, chunk) for chunk in batch]

                for future in futures:
                    result_chunk, cache_key, cache_hit, error = future.result()

                    if error is None:
                        completed += 1
                        if cache_hit:
                            cache_hits += 1
                        else:
                            synthesized += 1
                        status = SentenceStatus.COMPLETE
                    else:
                        failed += 1
                        status = SentenceStatus.FAILED

                    self._jobs.set_sentence_audio(
                        SentenceAudio(
                            sentence_id=result_chunk.sentence_id,
                            chunk_index=result_chunk.chunk_index,
                            cache_key=cache_key,
                            status=status,
                            error_message=error,
                        )
                    )
                    self._jobs.record_counts(job_id, completed, failed, cache_hits, synthesized)

        if cancelled or self._jobs.is_cancelled(job_id):
            self._jobs.set_status(job_id, JobStatus.CANCELLED)
        elif failed:
            self._jobs.set_status(
                job_id, JobStatus.FAILED, f"{failed} of {job.total_units} units failed"
            )
        else:
            self._jobs.set_status(job_id, JobStatus.COMPLETED)

        final = self._jobs.get(job_id)
        _LOGGER.info(
            "job_finished",
            extra={
                "job_id": job_id,
                "status": final.status.value,
                "completed": final.completed_units,
                "failed": final.failed_units,
                "cache_hits": final.cache_hits,
            },
        )
        return build_progress(self._jobs, final)

    def start_background(self, job_id: str, resolver: PronunciationResolver) -> None:
        """Run a job on a worker thread, keeping the event loop free."""
        with self._lock:
            existing = self._running.get(job_id)
            if existing is not None and existing.is_alive():
                return

            def target() -> None:
                try:
                    self.run(job_id, resolver)
                except Exception as error:  # noqa: BLE001 - recorded on the job
                    _LOGGER.exception("job_crashed", extra={"job_id": job_id})
                    self._jobs.set_status(job_id, JobStatus.FAILED, str(error))

            thread = threading.Thread(target=target, name=f"job-{job_id[:8]}", daemon=True)
            self._running[job_id] = thread
            thread.start()

    def wait(self, job_id: str, timeout: float | None = None) -> None:
        """Block until a background job finishes; used by tests and the CLI."""
        with self._lock:
            thread = self._running.get(job_id)
        if thread is not None:
            thread.join(timeout)

    def _pending_units(
        self,
        sentences: dict[str, Sentence],
        resolver: PronunciationResolver,
    ) -> tuple[SynthesisChunk, ...]:
        """Return the chunks still to process, skipping completed ones.

        Recomputing the plan and consulting stored state is what allows a job
        interrupted by a restart to resume where it stopped.
        """
        planned = self._plan_chunks(tuple(sentences.values()), resolver)
        done = {
            (record.sentence_id, record.chunk_index)
            for sentence_id in sentences
            for record in self._jobs.sentence_audio(sentence_id)
            if record.status is SentenceStatus.COMPLETE and record.cache_key
        }
        return tuple(
            chunk for chunk in planned if (chunk.sentence_id, chunk.chunk_index) not in done
        )

    # --- Control -------------------------------------------------------------------

    def cancel(self, job_id: str) -> SynthesisJob:
        """Ask a running job to stop after its current unit."""
        job = self._jobs.get(job_id)
        if job.status.is_terminal:
            raise ConflictError(f"job {job_id} is already {job.status.value}")
        self._jobs.set_status(job_id, JobStatus.CANCELLED)
        return self._jobs.get(job_id)

    def progress(self, job_id: str) -> JobProgress:
        """Return a progress snapshot for one job."""
        return build_progress(self._jobs, self._jobs.get(job_id))

    def resume_interrupted(self, resolver: PronunciationResolver) -> tuple[str, ...]:
        """Restart jobs left running by a previous process.

        Returns:
            The identifiers of the jobs that were restarted.
        """
        resumed: list[str] = []
        for job in self._jobs.resumable_jobs():
            document_resolver = resolver.for_document(job.document_id)
            self.start_background(job.id, document_resolver)
            resumed.append(job.id)
        if resumed:
            _LOGGER.info("jobs_resumed", extra={"count": len(resumed)})
        return tuple(resumed)

    # --- Single sentence ----------------------------------------------------------

    def regenerate_sentence(
        self,
        sentence_id: str,
        resolver: PronunciationResolver,
        voice_id: str,
        speed: float,
        bypass_cache: bool = False,
    ) -> tuple[SentenceAudio, ...]:
        """Re-synthesize one sentence, optionally with new settings.

        Raises:
            SentenceNotFoundError: If the sentence does not exist.
            SpeechEngineError: If synthesis fails.
        """
        sentence = self._documents.sentence(sentence_id)
        replacements = self._replacements_for((sentence,), resolver)
        prepared = prepare_sentence(
            sentence,
            replacements=replacements,
            preferred_max_chars=self._preferred_max_chars,
            hard_max_chars=self._hard_max_chars,
        )
        self._jobs.clear_sentence_audio(sentence_id)

        records: list[SentenceAudio] = []
        for chunk in prepared.chunks:
            outcome = self._synthesis.synthesize(
                text=chunk.synthesis_text,
                voice_id=voice_id,
                speed=validate_speed(speed),
                override_revision=resolver.override_revision(),
                bypass_cache=bypass_cache,
            )
            record = SentenceAudio(
                sentence_id=sentence_id,
                chunk_index=chunk.chunk_index,
                cache_key=outcome.cache_key,
                status=SentenceStatus.COMPLETE,
            )
            self._jobs.set_sentence_audio(record)
            records.append(record)
        return tuple(records)
