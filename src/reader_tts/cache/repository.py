"""Cache metadata storage and lookup."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from reader_tts.database.connection import Database
from reader_tts.domain.models import CacheEntry


class CacheRepository:
    """Reads and writes ``audio_cache`` rows."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def get(self, cache_key: str) -> CacheEntry | None:
        """Return the metadata for *cache_key*, or ``None``."""
        row = self._database.query_one(
            "SELECT * FROM audio_cache WHERE cache_key = ?", (cache_key,)
        )
        return _to_entry(row) if row is not None else None

    def insert(self, entry: CacheEntry) -> None:
        """Record metadata for a freshly written audio file."""
        self._database.execute(
            """
            INSERT OR REPLACE INTO audio_cache
                (cache_key, engine, model_id, voice_id, language_code, speed,
                 synthesis_text_hash, audio_path, sample_rate, duration_seconds,
                 byte_size, created_at, last_accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.cache_key,
                entry.engine,
                entry.model_id,
                entry.voice_id,
                entry.language_code,
                entry.speed,
                entry.synthesis_text_hash,
                entry.audio_path,
                entry.sample_rate,
                entry.duration_seconds,
                entry.byte_size,
                entry.created_at.isoformat(),
                entry.last_accessed_at.isoformat(),
            ),
        )

    def touch(self, cache_key: str) -> None:
        """Record that *cache_key* was used just now."""
        self._database.execute(
            "UPDATE audio_cache SET last_accessed_at = ? WHERE cache_key = ?",
            (datetime.now(tz=UTC).isoformat(), cache_key),
        )

    def delete(self, cache_key: str) -> None:
        """Remove the metadata row for *cache_key*."""
        self._database.execute("DELETE FROM audio_cache WHERE cache_key = ?", (cache_key,))

    def all_keys(self) -> tuple[str, ...]:
        """Every cache key currently recorded."""
        rows = self._database.query("SELECT cache_key FROM audio_cache")
        return tuple(row["cache_key"] for row in rows)

    def totals(self) -> tuple[int, int, float]:
        """Return ``(entries, total_bytes, total_seconds)``."""
        row = self._database.query_one(
            """
            SELECT COUNT(*) AS entries,
                   COALESCE(SUM(byte_size), 0) AS total_bytes,
                   COALESCE(SUM(duration_seconds), 0.0) AS total_seconds
            FROM audio_cache
            """
        )
        if row is None:  # pragma: no cover - aggregates always return a row
            return 0, 0, 0.0
        return int(row["entries"]), int(row["total_bytes"]), float(row["total_seconds"])

    def clear(self) -> int:
        """Delete every metadata row and report how many were removed."""
        entries, _, _ = self.totals()
        self._database.execute("DELETE FROM audio_cache")
        return entries


def build_entry(
    cache_key: str,
    engine: str,
    model_id: str,
    voice_id: str,
    language_code: str,
    speed: float,
    synthesis_text_hash: str,
    audio_path: Path,
    sample_rate: int,
    duration_seconds: float,
    byte_size: int,
) -> CacheEntry:
    """Assemble a cache entry with the current timestamp."""
    now = datetime.now(tz=UTC)
    return CacheEntry(
        cache_key=cache_key,
        engine=engine,
        model_id=model_id,
        voice_id=voice_id,
        language_code=language_code,
        speed=speed,
        synthesis_text_hash=synthesis_text_hash,
        audio_path=str(audio_path),
        sample_rate=sample_rate,
        duration_seconds=duration_seconds,
        byte_size=byte_size,
        created_at=now,
        last_accessed_at=now,
    )


def _to_entry(row: sqlite3.Row) -> CacheEntry:
    return CacheEntry(
        cache_key=row["cache_key"],
        engine=row["engine"],
        model_id=row["model_id"],
        voice_id=row["voice_id"],
        language_code=row["language_code"],
        speed=float(row["speed"]),
        synthesis_text_hash=row["synthesis_text_hash"],
        audio_path=row["audio_path"],
        sample_rate=int(row["sample_rate"]),
        duration_seconds=float(row["duration_seconds"]),
        byte_size=int(row["byte_size"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        last_accessed_at=datetime.fromisoformat(row["last_accessed_at"]),
    )
