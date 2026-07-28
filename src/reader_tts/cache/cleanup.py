"""Cache statistics, consistency checks and cleanup."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from reader_tts.cache.file_store import AudioFileStore
from reader_tts.cache.repository import CacheRepository
from reader_tts.domain.models import CacheStatistics


@dataclass(frozen=True, slots=True)
class CleanupResult:
    """What a cleanup pass removed."""

    removed_records: int
    removed_files: int
    freed_bytes: int


def collect_statistics(
    repository: CacheRepository, store: AudioFileStore
) -> CacheStatistics:
    """Summarize the cache, including records and files that disagree."""
    entries, total_bytes, total_seconds = repository.totals()
    recorded = set(repository.all_keys())
    on_disk = {store.key_of(path) for path in store.iter_files()}
    return CacheStatistics(
        entries=entries,
        total_bytes=total_bytes,
        total_duration_seconds=total_seconds,
        orphaned_records=len(recorded - on_disk),
        orphaned_files=len(on_disk - recorded),
    )


def clean(
    repository: CacheRepository, store: AudioFileStore, remove_all: bool = False
) -> CleanupResult:
    """Reconcile the cache.

    Args:
        repository: Metadata storage.
        store: Audio file storage.
        remove_all: Delete every entry rather than only inconsistent ones.

    Returns:
        Counts describing what was removed.
    """
    recorded = set(repository.all_keys())
    files = {store.key_of(path): path for path in store.iter_files()}

    if remove_all:
        freed = sum(_size(path) for path in files.values())
        for path in files.values():
            path.unlink(missing_ok=True)
        removed_records = repository.clear()
        _prune_empty_directories(store.root)
        return CleanupResult(
            removed_records=removed_records, removed_files=len(files), freed_bytes=freed
        )

    orphaned_records = recorded - set(files)
    for cache_key in orphaned_records:
        repository.delete(cache_key)

    orphaned_files = set(files) - recorded
    freed = 0
    for cache_key in orphaned_files:
        path = files[cache_key]
        freed += _size(path)
        path.unlink(missing_ok=True)

    _prune_empty_directories(store.root)
    return CleanupResult(
        removed_records=len(orphaned_records),
        removed_files=len(orphaned_files),
        freed_bytes=freed,
    )


def _size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:  # pragma: no cover - the file vanished concurrently
        return 0


def _prune_empty_directories(root: Path) -> None:
    """Remove empty shard directories, leaving the root in place."""
    for directory in sorted(root.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if directory.is_dir() and not any(directory.iterdir()):
            directory.rmdir()
