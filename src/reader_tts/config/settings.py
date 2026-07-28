"""Typed application settings loaded from the environment.

Settings are validated once at startup. Every filesystem write performed by the
application is confined to :attr:`Settings.runtime_dir`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from reader_tts.config import defaults


class Settings(BaseSettings):
    """Runtime configuration for the reader.

    All fields may be overridden with ``READER_TTS_``-prefixed environment
    variables, for example ``READER_TTS_DEFAULT_VOICE=am_michael``.
    """

    model_config = SettingsConfigDict(
        env_prefix="READER_TTS_",
        env_file=None,
        extra="ignore",
        frozen=True,
    )

    # --- Directories ---------------------------------------------------------
    data_dir: Path = Field(default=Path("./data"))
    runtime_dir: Path = Field(default=Path("./runtime"))
    database_path: Path | None = Field(default=None)
    model_dir: Path = Field(default=Path("./models/kokoro"))

    # --- Engine --------------------------------------------------------------
    engine: Literal["kokoro", "fake"] = Field(default=defaults.ENGINE_KOKORO)
    model_id: str = Field(default="kokoro-82m")
    default_voice: str = Field(default="af_heart")
    default_speed: Annotated[float, Field(ge=defaults.MIN_SPEED, le=defaults.MAX_SPEED)] = Field(
        default=defaults.DEFAULT_SPEED
    )
    device: Literal["auto", "cpu", "cuda"] = Field(default="auto")
    max_concurrency: Annotated[int, Field(ge=1, le=8)] = Field(default=1)

    # --- Pauses --------------------------------------------------------------
    chunk_pause_ms: Annotated[int, Field(ge=0, le=5_000)] = Field(
        default=defaults.DEFAULT_CHUNK_PAUSE_MS
    )
    sentence_pause_ms: Annotated[int, Field(ge=0, le=5_000)] = Field(
        default=defaults.DEFAULT_SENTENCE_PAUSE_MS
    )
    paragraph_pause_ms: Annotated[int, Field(ge=0, le=10_000)] = Field(
        default=defaults.DEFAULT_PARAGRAPH_PAUSE_MS
    )

    # --- Chunking ------------------------------------------------------------
    preferred_max_chars: Annotated[int, Field(ge=40, le=5_000)] = Field(
        default=defaults.PREFERRED_MAX_SENTENCE_CHARS
    )
    hard_max_chars: Annotated[int, Field(ge=40, le=10_000)] = Field(
        default=defaults.HARD_MAX_SENTENCE_CHARS
    )

    # --- Limits --------------------------------------------------------------
    max_document_characters: Annotated[int, Field(ge=1_000)] = Field(
        default=defaults.DEFAULT_MAX_DOCUMENT_CHARACTERS
    )
    max_request_bytes: Annotated[int, Field(ge=1_024)] = Field(
        default=defaults.DEFAULT_MAX_REQUEST_BYTES
    )

    # --- Server --------------------------------------------------------------
    host: str = Field(default="127.0.0.1")
    port: Annotated[int, Field(ge=1, le=65_535)] = Field(default=8765)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(default="INFO")

    @field_validator("data_dir", "runtime_dir", "model_dir")
    @classmethod
    def _expand(cls, value: Path) -> Path:
        return value.expanduser().resolve()

    @model_validator(mode="after")
    def _check_thresholds(self) -> Settings:
        if self.hard_max_chars < self.preferred_max_chars:
            msg = (
                f"hard_max_chars ({self.hard_max_chars}) must be greater than or equal to "
                f"preferred_max_chars ({self.preferred_max_chars})"
            )
            raise ValueError(msg)
        if self.host not in {"127.0.0.1", "localhost", "::1"}:
            # Binding publicly requires deliberate configuration; the value is
            # honoured but the operator is told what they have done.
            import logging

            logging.getLogger(__name__).warning(
                "server_bind_non_local", extra={"host": self.host}
            )
        return self

    # --- Derived paths -------------------------------------------------------

    @property
    def resolved_database_path(self) -> Path:
        """Location of the SQLite database file."""
        if self.database_path is not None:
            return self.database_path.expanduser().resolve()
        return self.runtime_dir / "reader_tts.sqlite3"

    @property
    def cmudict_dir(self) -> Path:
        """Directory holding the pinned pronunciation dictionary."""
        return self.data_dir / "cmudict"

    @property
    def cache_audio_dir(self) -> Path:
        """Root directory of the sharded synthesis audio cache."""
        return self.runtime_dir / "cache" / "audio"

    @property
    def exports_dir(self) -> Path:
        """Directory holding rendered export files."""
        return self.runtime_dir / "exports"

    @property
    def tmp_dir(self) -> Path:
        """Directory for temporary files awaiting an atomic rename."""
        return self.runtime_dir / "tmp"

    def ensure_directories(self) -> None:
        """Create every runtime directory the application writes to."""
        for path in (
            self.runtime_dir,
            self.cache_audio_dir,
            self.exports_dir,
            self.tmp_dir,
            self.resolved_database_path.parent,
        ):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()


def reset_settings_cache() -> None:
    """Clear the cached settings; used by tests that alter the environment."""
    get_settings.cache_clear()
