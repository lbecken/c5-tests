"""Application service container.

The CLI and the HTTP API are two front ends over the same services. Both build
one :class:`AppServices`, so behaviour cannot drift between them.

Construction is cheap: the dictionary and the speech model are loaded lazily on
first use, and the model is loaded at most once per process.
"""

from __future__ import annotations

import logging
import threading
from typing import Final

from reader_tts.cache.file_store import AudioFileStore
from reader_tts.cache.repository import CacheRepository
from reader_tts.config.settings import Settings, get_settings
from reader_tts.database.connection import Database
from reader_tts.database.migrations import initialize
from reader_tts.documents.document_service import DocumentService
from reader_tts.documents.exporter import ExportService
from reader_tts.documents.job_service import JobService
from reader_tts.documents.progress import JobRepository
from reader_tts.domain.errors import ModelNotReadyError
from reader_tts.pronunciation.dictionary import PronunciationDictionary
from reader_tts.pronunciation.overrides import OverrideRepository
from reader_tts.pronunciation.resolver import PronunciationResolver
from reader_tts.synthesis.base import SpeechEngine
from reader_tts.synthesis.synthesis_service import SynthesisService

_LOGGER: Final = logging.getLogger(__name__)


class AppServices:
    """Owns the long-lived objects the application depends on."""

    def __init__(
        self, settings: Settings | None = None, engine: SpeechEngine | None = None
    ) -> None:
        self._settings = settings or get_settings()
        self._settings.ensure_directories()
        self._lock = threading.RLock()

        self._database: Database = initialize(self._settings.resolved_database_path)
        self._cache_repository = CacheRepository(self._database)
        self._file_store = AudioFileStore(self._settings.cache_audio_dir)
        self._overrides = OverrideRepository(self._database)

        self._dictionary: PronunciationDictionary | None = None
        self._engine: SpeechEngine | None = engine
        self._engine_started = engine is not None
        self._synthesis: SynthesisService | None = None
        self._jobs_repository = JobRepository(self._database)
        self._documents = DocumentService(
            self._database, max_characters=self._settings.max_document_characters
        )
        self._job_service: JobService | None = None
        self._exports = ExportService(
            settings=self._settings,
            database=self._database,
            documents=self._documents,
            jobs=self._jobs_repository,
            cache=self._cache_repository,
        )

    # --- Configuration and storage ------------------------------------------------

    @property
    def settings(self) -> Settings:
        """The validated application settings."""
        return self._settings

    @property
    def database(self) -> Database:
        """The migrated SQLite database."""
        return self._database

    @property
    def cache_repository(self) -> CacheRepository:
        """Cache metadata storage."""
        return self._cache_repository

    @property
    def file_store(self) -> AudioFileStore:
        """Cache audio file storage."""
        return self._file_store

    @property
    def overrides(self) -> OverrideRepository:
        """Pronunciation override storage."""
        return self._overrides

    # --- Dictionary ------------------------------------------------------------------

    @property
    def dictionary(self) -> PronunciationDictionary:
        """The pinned pronunciation dictionary, loaded on first use."""
        with self._lock:
            if self._dictionary is None:
                self._dictionary = PronunciationDictionary.from_directory(
                    self._settings.cmudict_dir
                )
                _LOGGER.info(
                    "dictionary_loaded",
                    extra={
                        "entries": self._dictionary.size,
                        "version": self._dictionary.info.version,
                    },
                )
            return self._dictionary

    def resolver(self, document_id: str | None = None) -> PronunciationResolver:
        """Return a resolver bound to *document_id*."""
        return PronunciationResolver(self.dictionary, self._overrides, document_id=document_id)

    # --- Engine ------------------------------------------------------------------------

    @property
    def engine(self) -> SpeechEngine:
        """The speech engine, started on first use.

        Raises:
            ModelNotReadyError: If the configured engine cannot be initialized.
        """
        with self._lock:
            if self._engine is None:
                self._engine = self._build_engine()
            if not self._engine_started:
                start = getattr(self._engine, "start", None)
                if callable(start):
                    start()
                self._engine_started = True
            return self._engine

    @property
    def engine_is_started(self) -> bool:
        """Whether the engine has been initialized already."""
        return self._engine_started

    def engine_status(self) -> tuple[bool, str | None]:
        """Return ``(ready, error_message)`` without raising."""
        try:
            self.engine  # noqa: B018 - property access triggers initialization
        except ModelNotReadyError as error:
            return False, str(error)
        return True, None

    @property
    def synthesis(self) -> SynthesisService:
        """The cache-aware synthesis service."""
        with self._lock:
            if self._synthesis is None:
                self._synthesis = SynthesisService(
                    engine=self.engine,
                    repository=self._cache_repository,
                    store=self._file_store,
                )
            return self._synthesis

    # --- Documents, jobs and exports ---------------------------------------------------

    @property
    def documents(self) -> DocumentService:
        """Document and sentence storage."""
        return self._documents

    @property
    def job_repository(self) -> JobRepository:
        """Job and sentence-audio storage."""
        return self._jobs_repository

    @property
    def jobs(self) -> JobService:
        """Synthesis job orchestration; starts the engine on first use."""
        with self._lock:
            if self._job_service is None:
                self._job_service = JobService(
                    documents=self._documents,
                    jobs=self._jobs_repository,
                    synthesis=self.synthesis,
                    max_concurrency=self._settings.max_concurrency,
                    preferred_max_chars=self._settings.preferred_max_chars,
                    hard_max_chars=self._settings.hard_max_chars,
                )
            return self._job_service

    @property
    def exports(self) -> ExportService:
        """WAV export assembly."""
        return self._exports

    def _build_engine(self) -> SpeechEngine:
        if self._settings.engine == "fake":
            from reader_tts.synthesis.fake_engine import FakeSpeechEngine

            self._engine_started = False
            return FakeSpeechEngine()

        from reader_tts.synthesis.kokoro_engine import KokoroSpeechEngine

        self._engine_started = False
        return KokoroSpeechEngine(self._settings)

    # --- Lifecycle --------------------------------------------------------------------

    def close(self) -> None:
        """Release the engine and database resources."""
        with self._lock:
            if self._engine is not None:
                self._engine.close()
                self._engine = None
                self._engine_started = False
            self._synthesis = None
            self._database.close()
