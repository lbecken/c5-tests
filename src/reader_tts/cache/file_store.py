"""Sharded, atomically written audio file storage."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from reader_tts.cache.keys import shard_path_parts
from reader_tts.domain.errors import UnsafePathError
from reader_tts.synthesis.audio_processor import write_wav


class AudioFileStore:
    """Stores cached WAV files under ``<root>/ab/cd/<key>.wav``.

    Every path is derived from a hex cache key, never from user input, and each
    resolved path is checked to be inside the configured root.
    """

    def __init__(self, root: Path) -> None:
        self._root = root.resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    @property
    def root(self) -> Path:
        """Root directory of the audio cache."""
        return self._root

    def path_for(self, cache_key: str) -> Path:
        """Return the absolute path a key maps to.

        Raises:
            UnsafePathError: If the key would escape the cache root.
        """
        first, second, filename = shard_path_parts(cache_key)
        candidate = (self._root / first / second / filename).resolve()
        if not candidate.is_relative_to(self._root):
            raise UnsafePathError(f"cache key '{cache_key[:8]}' resolves outside the cache root")
        return candidate

    def exists(self, cache_key: str) -> bool:
        """Whether audio for *cache_key* is present on disk."""
        return self.path_for(cache_key).is_file()

    def store(
        self, cache_key: str, samples: NDArray[np.float32], sample_rate: int
    ) -> tuple[Path, int]:
        """Write audio for *cache_key* atomically and return its path and size."""
        path = self.path_for(cache_key)
        byte_size = write_wav(path, samples, sample_rate)
        return path, byte_size

    def remove(self, cache_key: str) -> bool:
        """Delete the audio file for *cache_key*, reporting whether it existed."""
        path = self.path_for(cache_key)
        if not path.is_file():
            return False
        path.unlink()
        return True

    def iter_files(self) -> Iterator[Path]:
        """Yield every stored audio file."""
        yield from (path for path in self._root.rglob("*.wav") if path.is_file())

    def total_bytes(self) -> int:
        """Sum of the sizes of every stored file."""
        return sum(path.stat().st_size for path in self.iter_files())

    def key_of(self, path: Path) -> str:
        """Return the cache key a stored file belongs to."""
        return path.stem
