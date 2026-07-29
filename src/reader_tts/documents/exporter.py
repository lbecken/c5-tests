"""WAV export of a sentence, a paragraph or a whole document.

Segments are streamed from the cache into the output file one at a time, so
exporting a book never holds the complete waveform in memory.
"""

from __future__ import annotations

import logging
import re
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from reader_tts.cache.repository import CacheRepository
from reader_tts.config.settings import Settings
from reader_tts.database.connection import Database
from reader_tts.documents.document_service import DocumentService
from reader_tts.documents.progress import JobRepository
from reader_tts.domain.enums import ExportScope, ExportStatus, SentenceStatus
from reader_tts.domain.errors import ExportNotFoundError, UnsafePathError, ValidationError
from reader_tts.domain.models import Export, Sentence
from reader_tts.synthesis.audio_processor import (
    StreamingWavWriter,
    iter_wav_blocks,
    silence,
)

_LOGGER: Final = logging.getLogger(__name__)

_UNSAFE_FILENAME_CHARS: Final = re.compile(r"[^a-z0-9]+")
_MAX_TITLE_SLUG: Final = 60

#: Used only when a cache record is unexpectedly absent while assembling.
DEFAULT_SAMPLE_RATE: Final = 24_000


def sanitize_filename(title: str, voice_id: str, speed: float) -> str:
    """Build a safe export filename from user-supplied text.

    The title is reduced to lowercase alphanumerics and hyphens, so nothing the
    user types can influence the path that is written.
    """
    slug = _UNSAFE_FILENAME_CHARS.sub("-", title.lower()).strip("-")[:_MAX_TITLE_SLUG]
    voice_slug = _UNSAFE_FILENAME_CHARS.sub("-", voice_id.lower()).strip("-") or "voice"
    return f"{slug or 'document'}-{voice_slug}-{speed:.2f}x.wav"


class ExportService:
    """Assembles cached sentence audio into a single WAV file."""

    def __init__(
        self,
        settings: Settings,
        database: Database,
        documents: DocumentService,
        jobs: JobRepository,
        cache: CacheRepository,
    ) -> None:
        self._settings = settings
        self._database = database
        self._documents = documents
        self._jobs = jobs
        self._cache = cache
        self._exports_dir = settings.exports_dir

    # --- Creation ------------------------------------------------------------------

    def export_document(self, document_id: str, voice_id: str, speed: float) -> Export:
        """Export every sentence of a document."""
        sentences = self._documents.sentences(document_id)
        return self._export(document_id, sentences, ExportScope.DOCUMENT, voice_id, speed)

    def export_paragraph(
        self, document_id: str, paragraph_index: int, voice_id: str, speed: float
    ) -> Export:
        """Export a single paragraph."""
        sentences = tuple(
            s
            for s in self._documents.sentences(document_id)
            if s.paragraph_index == paragraph_index
        )
        if not sentences:
            raise ValidationError(f"paragraph {paragraph_index} has no sentences")
        return self._export(document_id, sentences, ExportScope.PARAGRAPH, voice_id, speed)

    def export_sentence(self, sentence_id: str, voice_id: str, speed: float) -> Export:
        """Export a single sentence."""
        sentence = self._documents.sentence(sentence_id)
        return self._export(
            sentence.document_id, (sentence,), ExportScope.SENTENCE, voice_id, speed
        )

    def _export(
        self,
        document_id: str,
        sentences: tuple[Sentence, ...],
        scope: ExportScope,
        voice_id: str,
        speed: float,
    ) -> Export:
        document = self._documents.get(document_id)
        segments = self._collect_segments(sentences)

        export_id = str(uuid.uuid4())
        filename = sanitize_filename(document.title, voice_id, speed)
        destination = (self._exports_dir / f"{export_id}.wav").resolve()
        if not destination.is_relative_to(self._exports_dir.resolve()):  # pragma: no cover
            raise UnsafePathError("export path escaped the exports directory")

        record = Export(
            id=export_id,
            document_id=document_id,
            scope=scope,
            status=ExportStatus.RUNNING,
            voice_id=voice_id,
            speed=speed,
            file_path=None,
            filename=filename,
            byte_size=None,
            duration_seconds=None,
            created_at=datetime.now(tz=UTC),
        )
        self._insert(record)

        try:
            byte_size, duration = self._write(destination, sentences, segments)
        except Exception as error:  # noqa: BLE001 - recorded on the export row
            self._fail(export_id, str(error))
            raise

        completed = Export(
            id=export_id,
            document_id=document_id,
            scope=scope,
            status=ExportStatus.COMPLETE,
            voice_id=voice_id,
            speed=speed,
            file_path=str(destination),
            filename=filename,
            byte_size=byte_size,
            duration_seconds=duration,
            created_at=record.created_at,
            completed_at=datetime.now(tz=UTC),
        )
        self._complete(completed)
        _LOGGER.info(
            "export_complete",
            extra={
                "export_id": export_id,
                "document_id": document_id,
                "scope": scope.value,
                "duration": round(duration, 2),
                "bytes": byte_size,
            },
        )
        return completed

    # --- Assembly --------------------------------------------------------------------

    def _collect_segments(self, sentences: tuple[Sentence, ...]) -> dict[str, tuple[Path, ...]]:
        """Verify that every required audio segment exists and return its path.

        Raises:
            ValidationError: If any sentence has not been synthesized yet.
        """
        segments: dict[str, tuple[Path, ...]] = {}
        missing: list[int] = []
        for sentence in sentences:
            records = self._jobs.sentence_audio(sentence.id)
            usable = [
                record
                for record in records
                if record.status is SentenceStatus.COMPLETE and record.cache_key
            ]
            if not usable:
                missing.append(sentence.index + 1)
                continue

            paths: list[Path] = []
            for record in usable:
                assert record.cache_key is not None
                entry = self._cache.get(record.cache_key)
                if entry is None or not Path(entry.audio_path).is_file():
                    missing.append(sentence.index + 1)
                    break
                paths.append(Path(entry.audio_path))
            else:
                segments[sentence.id] = tuple(paths)

        if missing:
            preview = ", ".join(str(index) for index in sorted(set(missing))[:10])
            raise ValidationError(
                f"audio is missing for {len(set(missing))} sentence(s) "
                f"(sentence {preview}); generate speech before exporting"
            )
        return segments

    def _write(
        self,
        destination: Path,
        sentences: tuple[Sentence, ...],
        segments: dict[str, tuple[Path, ...]],
    ) -> tuple[int, float]:
        """Stream every segment into one WAV file and return size and duration."""
        sample_rate = self._sample_rate(segments)
        chunk_gap = silence(self._settings.chunk_pause_ms, sample_rate)
        sentence_gap = silence(self._settings.sentence_pause_ms, sample_rate)
        paragraph_gap = silence(self._settings.paragraph_pause_ms, sample_rate)

        writer = StreamingWavWriter(destination, sample_rate, tmp_dir=self._settings.tmp_dir)
        try:
            previous_paragraph: int | None = None
            for position, sentence in enumerate(sentences):
                if position > 0:
                    writer.append(
                        paragraph_gap
                        if sentence.paragraph_index != previous_paragraph
                        else sentence_gap
                    )
                for chunk_position, path in enumerate(segments[sentence.id]):
                    if chunk_position > 0:
                        writer.append(chunk_gap)
                    for block in iter_wav_blocks(path):
                        writer.append(block)
                previous_paragraph = sentence.paragraph_index
            duration = writer.duration_seconds
            byte_size = writer.finalize()
        except Exception:
            writer.abort()
            raise
        return byte_size, duration

    def _sample_rate(self, segments: dict[str, tuple[Path, ...]]) -> int:
        """Take the sample rate from the first segment; a file is named by its key."""
        for paths in segments.values():
            for path in paths:
                entry = self._cache.get(path.stem)
                if entry is not None:
                    return entry.sample_rate
        return DEFAULT_SAMPLE_RATE

    # --- Storage -----------------------------------------------------------------------

    def get(self, export_id: str) -> Export:
        """Return one export record.

        Raises:
            ExportNotFoundError: If no such export exists.
        """
        row = self._database.query_one("SELECT * FROM exports WHERE id = ?", (export_id,))
        if row is None:
            raise ExportNotFoundError(f"no export with id {export_id}")
        return _to_export(row)

    def file_path(self, export_id: str) -> Path:
        """Return the on-disk path of a completed export.

        Only files registered in the database are served, and the path is
        re-checked against the exports directory before it is used.
        """
        export = self.get(export_id)
        if export.status is not ExportStatus.COMPLETE or not export.file_path:
            raise ExportNotFoundError(f"export {export_id} is not complete")
        path = Path(export.file_path).resolve()
        if not path.is_relative_to(self._exports_dir.resolve()) or not path.is_file():
            raise ExportNotFoundError(f"the file for export {export_id} is unavailable")
        return path

    def list_for_document(self, document_id: str) -> tuple[Export, ...]:
        """Return every export of one document, newest first."""
        rows = self._database.query(
            "SELECT * FROM exports WHERE document_id = ? ORDER BY created_at DESC",
            (document_id,),
        )
        return tuple(_to_export(row) for row in rows)

    def _insert(self, export: Export) -> None:
        self._database.execute(
            """
            INSERT INTO exports
                (id, document_id, scope, status, voice_id, speed, file_path, filename,
                 byte_size, duration_seconds, created_at, completed_at, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                export.id,
                export.document_id,
                export.scope.value,
                export.status.value,
                export.voice_id,
                export.speed,
                export.file_path,
                export.filename,
                export.byte_size,
                export.duration_seconds,
                export.created_at.isoformat(),
                None,
                None,
            ),
        )

    def _complete(self, export: Export) -> None:
        self._database.execute(
            """
            UPDATE exports
            SET status = ?, file_path = ?, byte_size = ?, duration_seconds = ?, completed_at = ?
            WHERE id = ?
            """,
            (
                export.status.value,
                export.file_path,
                export.byte_size,
                export.duration_seconds,
                export.completed_at.isoformat() if export.completed_at else None,
                export.id,
            ),
        )

    def _fail(self, export_id: str, message: str) -> None:
        self._database.execute(
            "UPDATE exports SET status = ?, error_message = ?, completed_at = ? WHERE id = ?",
            (
                ExportStatus.FAILED.value,
                message[:500],
                datetime.now(tz=UTC).isoformat(),
                export_id,
            ),
        )


def _to_export(row: sqlite3.Row) -> Export:
    return Export(
        id=row["id"],
        document_id=row["document_id"],
        scope=ExportScope(row["scope"]),
        status=ExportStatus(row["status"]),
        voice_id=row["voice_id"],
        speed=float(row["speed"]),
        file_path=row["file_path"],
        filename=row["filename"],
        byte_size=int(row["byte_size"]) if row["byte_size"] is not None else None,
        duration_seconds=(
            float(row["duration_seconds"]) if row["duration_seconds"] is not None else None
        ),
        created_at=datetime.fromisoformat(row["created_at"]),
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
        error_message=row["error_message"],
    )
