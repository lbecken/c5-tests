"""Deterministic cache key construction.

The key covers everything that can change the audio for a piece of text. Any
difference in engine, model, voice, speed, language, synthesis settings or the
active pronunciation overrides produces a different key, so a cache hit always
means the audio would have been byte-identical.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass

from reader_tts.config import defaults


@dataclass(frozen=True, slots=True)
class CacheKeyInputs:
    """Every field that participates in a cache key."""

    engine: str
    model: str
    model_hash: str
    voice: str
    voice_hash: str
    language: str
    speed: float
    text: str
    override_revision: str = "none"
    settings_version: int = defaults.SETTINGS_VERSION

    def canonical_json(self) -> str:
        """Serialize deterministically: sorted keys, no insignificant whitespace."""
        payload = asdict(self)
        payload["speed"] = round(float(self.speed), 2)
        return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_cache_key(inputs: CacheKeyInputs) -> str:
    """Return the SHA-256 hex digest identifying one synthesis result."""
    return hashlib.sha256(inputs.canonical_json().encode("utf-8")).hexdigest()


def hash_text(text: str) -> str:
    """Return the SHA-256 hex digest of a text, for indexing and provenance."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def shard_path_parts(cache_key: str) -> tuple[str, str, str]:
    """Split a key into ``(first, second, filename)`` directory shards.

    Two levels of two hex characters keep any single directory small even for a
    library-sized cache.
    """
    if len(cache_key) < 4:
        raise ValueError("a cache key must be at least four characters long")
    return cache_key[:2], cache_key[2:4], f"{cache_key}.wav"
