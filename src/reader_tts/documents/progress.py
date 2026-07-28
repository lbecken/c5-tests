"""Job and sentence-audio state, and the progress snapshots built from it."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from reader_tts.database.connection import Database
from reader_tts.domain.enums import JobStatus, SentenceStatus
from reader_tts.domain.errors import JobNotFoundError
from reader_tts.domain.models import JobProgress, SentenceAudio, SynthesisJob


class JobRepository:
    """Reads and writes ``synthesis_jobs`` and ``sentence_audio`` rows."""

    def __init__(self, database: Database) -> None:
        self._database = database

    # --- Jobs -----------------------------------------------------------------

    def create(self, job: SynthesisJob) -> SynthesisJob:
        """Insert a new job record."""
        self._database.execute(
            """
            INSERT INTO synthesis_jobs
                (id, document_id, status, voice_id, speed, total_units,
                 completed_units, failed_units, cache_hits, synthesized_units,
                 created_at, started_at, completed_at, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job.id,
                job.document_id,
                job.status.value,
                job.voice_id,
                job.speed,
                job.total_units,
                job.completed_units,
                job.failed_units,
                job.cache_hits,
                job.synthesized_units,
                job.created_at.isoformat(),
                job.started_at.isoformat() if job.started_at else None,
                job.completed_at.isoformat() if job.completed_at else None,
                job.error_message,
            ),
        )
        return job

    def get(self, job_id: str) -> SynthesisJob:
        """Return one job.

        Raises:
            JobNotFoundError: If no such job exists.
        """
        row = self._database.query_one("SELECT * FROM synthesis_jobs WHERE id = ?", (job_id,))
        if row is None:
            raise JobNotFoundError(f"no synthesis job with id {job_id}")
        return _to_job(row)

    def find(self, job_id: str) -> SynthesisJob | None:
        """Return one job, or ``None`` when it does not exist."""
        row = self._database.query_one("SELECT * FROM synthesis_jobs WHERE id = ?", (job_id,))
        return _to_job(row) if row is not None else None

    def latest_for_document(self, document_id: str) -> SynthesisJob | None:
        """Return the most recent job for a document."""
        row = self._database.query_one(
            "SELECT * FROM synthesis_jobs WHERE document_id = ? ORDER BY created_at DESC LIMIT 1",
            (document_id,),
        )
        return _to_job(row) if row is not None else None

    def resumable_jobs(self) -> tuple[SynthesisJob, ...]:
        """Return jobs left running by a previous process."""
        rows = self._database.query(
            "SELECT * FROM synthesis_jobs WHERE status IN (?, ?) ORDER BY created_at",
            (JobStatus.PENDING.value, JobStatus.RUNNING.value),
        )
        return tuple(_to_job(row) for row in rows)

    def set_status(
        self,
        job_id: str,
        status: JobStatus,
        error_message: str | None = None,
    ) -> None:
        """Update a job's status and its start or completion timestamp."""
        now = datetime.now(tz=UTC).isoformat()
        if status is JobStatus.RUNNING:
            self._database.execute(
                """
                UPDATE synthesis_jobs
                SET status = ?, started_at = COALESCE(started_at, ?), error_message = ?
                WHERE id = ?
                """,
                (status.value, now, error_message, job_id),
            )
            return
        completed = now if status.is_terminal else None
        self._database.execute(
            "UPDATE synthesis_jobs SET status = ?, completed_at = ?, error_message = ? "
            "WHERE id = ?",
            (status.value, completed, error_message, job_id),
        )

    def record_counts(
        self, job_id: str, completed: int, failed: int, cache_hits: int, synthesized: int
    ) -> None:
        """Persist progress counters after a unit finishes."""
        self._database.execute(
            """
            UPDATE synthesis_jobs
            SET completed_units = ?, failed_units = ?, cache_hits = ?, synthesized_units = ?
            WHERE id = ?
            """,
            (completed, failed, cache_hits, synthesized, job_id),
        )

    def is_cancelled(self, job_id: str) -> bool:
        """Whether a job has been cancelled by the user."""
        row = self._database.query_one(
            "SELECT status FROM synthesis_jobs WHERE id = ?", (job_id,)
        )
        return row is not None and row["status"] == JobStatus.CANCELLED.value

    # --- Sentence audio ------------------------------------------------------------

    def set_sentence_audio(self, record: SentenceAudio) -> None:
        """Insert or replace the state of one technical chunk."""
        self._database.execute(
            """
            INSERT INTO sentence_audio (sentence_id, chunk_index, cache_key, status, error_message)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(sentence_id, chunk_index) DO UPDATE SET
                cache_key = excluded.cache_key,
                status = excluded.status,
                error_message = excluded.error_message
            """,
            (
                record.sentence_id,
                record.chunk_index,
                record.cache_key,
                record.status.value,
                record.error_message,
            ),
        )

    def sentence_audio(self, sentence_id: str) -> tuple[SentenceAudio, ...]:
        """Return every chunk record for one sentence, in order."""
        rows = self._database.query(
            "SELECT * FROM sentence_audio WHERE sentence_id = ? ORDER BY chunk_index",
            (sentence_id,),
        )
        return tuple(_to_sentence_audio(row) for row in rows)

    def document_audio(self, document_id: str) -> dict[str, tuple[SentenceAudio, ...]]:
        """Return chunk records for every sentence of a document."""
        rows = self._database.query(
            """
            SELECT sentence_audio.* FROM sentence_audio
            JOIN sentences ON sentences.id = sentence_audio.sentence_id
            WHERE sentences.document_id = ?
            ORDER BY sentences.sentence_index, sentence_audio.chunk_index
            """,
            (document_id,),
        )
        grouped: dict[str, list[SentenceAudio]] = {}
        for row in rows:
            grouped.setdefault(row["sentence_id"], []).append(_to_sentence_audio(row))
        return {key: tuple(value) for key, value in grouped.items()}

    def clear_sentence_audio(self, sentence_id: str) -> None:
        """Remove every chunk record for one sentence."""
        self._database.execute(
            "DELETE FROM sentence_audio WHERE sentence_id = ?", (sentence_id,)
        )

    def completed_duration(self, document_id: str) -> float:
        """Total duration of the audio generated for a document so far."""
        row = self._database.query_one(
            """
            SELECT COALESCE(SUM(audio_cache.duration_seconds), 0.0) AS total
            FROM sentence_audio
            JOIN sentences ON sentences.id = sentence_audio.sentence_id
            JOIN audio_cache ON audio_cache.cache_key = sentence_audio.cache_key
            WHERE sentences.document_id = ?
            """,
            (document_id,),
        )
        return float(row["total"]) if row is not None else 0.0

    def current_sentence_index(self, document_id: str) -> int | None:
        """Index of the sentence currently being synthesized, if any."""
        row = self._database.query_one(
            """
            SELECT MIN(sentences.sentence_index) AS position
            FROM sentence_audio
            JOIN sentences ON sentences.id = sentence_audio.sentence_id
            WHERE sentences.document_id = ? AND sentence_audio.status = ?
            """,
            (document_id, SentenceStatus.SYNTHESIZING.value),
        )
        if row is None or row["position"] is None:
            return None
        return int(row["position"])


def build_progress(repository: JobRepository, job: SynthesisJob) -> JobProgress:
    """Assemble a progress snapshot for *job*."""
    return JobProgress(
        job_id=job.id,
        document_id=job.document_id,
        status=job.status,
        total_units=job.total_units,
        completed_units=job.completed_units,
        failed_units=job.failed_units,
        cache_hits=job.cache_hits,
        synthesized_units=job.synthesized_units,
        current_sentence_index=repository.current_sentence_index(job.document_id),
        generated_duration_seconds=repository.completed_duration(job.document_id),
        error_message=job.error_message,
    )


def _to_job(row: sqlite3.Row) -> SynthesisJob:
    return SynthesisJob(
        id=row["id"],
        document_id=row["document_id"],
        status=JobStatus(row["status"]),
        voice_id=row["voice_id"],
        speed=float(row["speed"]),
        total_units=int(row["total_units"]),
        completed_units=int(row["completed_units"]),
        failed_units=int(row["failed_units"]),
        cache_hits=int(row["cache_hits"]),
        synthesized_units=int(row["synthesized_units"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        started_at=datetime.fromisoformat(row["started_at"]) if row["started_at"] else None,
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
        error_message=row["error_message"],
    )


def _to_sentence_audio(row: sqlite3.Row) -> SentenceAudio:
    return SentenceAudio(
        sentence_id=row["sentence_id"],
        chunk_index=int(row["chunk_index"]),
        cache_key=row["cache_key"],
        status=SentenceStatus(row["status"]),
        error_message=row["error_message"],
    )
