"""Cache-aware synthesis of a single technical chunk.

This is the only place that calls the engine. It guarantees that identical
requests are synthesized once: a per-key lock serializes concurrent callers, and
the second caller finds the finished cache entry.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from reader_tts.cache.file_store import AudioFileStore
from reader_tts.cache.keys import CacheKeyInputs, compute_cache_key, hash_text
from reader_tts.cache.repository import CacheRepository, build_entry
from reader_tts.config import defaults
from reader_tts.domain.errors import AudioValidationError, SynthesisFailedError
from reader_tts.synthesis.audio_processor import apply_limiter, validate_audio
from reader_tts.synthesis.base import SpeechEngine, SynthesisRequest, validate_speed

_LOGGER: Final = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class SynthesisOutcome:
    """The result of satisfying one synthesis request."""

    cache_key: str
    audio_path: Path
    sample_rate: int
    duration_seconds: float
    byte_size: int
    cache_hit: bool
    phoneme_debug: str | None = None


class _KeyLocks:
    """Per-cache-key locks, created on demand within one process."""

    def __init__(self) -> None:
        self._guard = threading.Lock()
        self._locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)

    def acquire(self, key: str) -> threading.Lock:
        """Return the lock guarding *key*."""
        with self._guard:
            return self._locks[key]


class SynthesisService:
    """Turns synthesis text into cached audio."""

    def __init__(
        self,
        engine: SpeechEngine,
        repository: CacheRepository,
        store: AudioFileStore,
        language_code: str = defaults.DEFAULT_LANGUAGE_CODE,
    ) -> None:
        self._engine = engine
        self._repository = repository
        self._store = store
        self._language_code = language_code
        self._locks = _KeyLocks()

    @property
    def engine(self) -> SpeechEngine:
        """The engine this service drives."""
        return self._engine

    def cache_key_for(
        self, text: str, voice_id: str, speed: float, override_revision: str = "none"
    ) -> str:
        """Compute the key a request would use, without synthesizing."""
        info = self._engine.info
        return compute_cache_key(
            CacheKeyInputs(
                engine=self._engine.name,
                model=info.model_id,
                model_hash=info.model_hash,
                voice=voice_id,
                voice_hash=self._engine.voice_fingerprint(voice_id),
                language=self._language_code,
                speed=validate_speed(speed),
                text=text,
                override_revision=override_revision,
            )
        )

    def lookup(self, cache_key: str) -> SynthesisOutcome | None:
        """Return a valid cached result for *cache_key*, or ``None``.

        A record whose file has disappeared, or whose metadata is implausible,
        is removed so the next call regenerates the audio.
        """
        entry = self._repository.get(cache_key)
        if entry is None:
            return None

        path = Path(entry.audio_path)
        if not path.is_file() or not path.is_relative_to(self._store.root):
            _LOGGER.info("cache_record_stale", extra={"cache_key": cache_key[:12]})
            self._repository.delete(cache_key)
            return None
        if entry.sample_rate <= 0 or entry.duration_seconds <= 0 or entry.byte_size <= 0:
            _LOGGER.info("cache_metadata_invalid", extra={"cache_key": cache_key[:12]})
            self._repository.delete(cache_key)
            self._store.remove(cache_key)
            return None

        self._repository.touch(cache_key)
        return SynthesisOutcome(
            cache_key=cache_key,
            audio_path=path,
            sample_rate=entry.sample_rate,
            duration_seconds=entry.duration_seconds,
            byte_size=entry.byte_size,
            cache_hit=True,
        )

    def synthesize(
        self,
        text: str,
        voice_id: str,
        speed: float,
        override_revision: str = "none",
        bypass_cache: bool = False,
    ) -> SynthesisOutcome:
        """Return audio for *text*, generating it only when necessary.

        Args:
            text: Engine-ready synthesis text for one technical chunk.
            voice_id: A bundled voice identifier.
            speed: Playback rate within the supported range.
            override_revision: Token identifying the active pronunciation
                overrides, so editing one invalidates affected audio.
            bypass_cache: Regenerate even when a cached result exists.

        Raises:
            SynthesisFailedError: If the engine fails or its output is unusable.
        """
        speed = validate_speed(speed)
        cache_key = self.cache_key_for(text, voice_id, speed, override_revision)

        if not bypass_cache:
            cached = self.lookup(cache_key)
            if cached is not None:
                return cached

        with self._locks.acquire(cache_key):
            # Another thread may have finished this exact request while this one
            # waited for the lock.
            if not bypass_cache:
                cached = self.lookup(cache_key)
                if cached is not None:
                    return cached

            result = self._engine.synthesize(
                SynthesisRequest(
                    text=text,
                    voice_id=voice_id,
                    speed=speed,
                    language_code=self._language_code,
                )
            )
            try:
                validate_audio(result.samples, result.sample_rate, text)
            except AudioValidationError as error:
                _LOGGER.warning(
                    "audio_validation_failed",
                    extra={
                        "cache_key": cache_key[:12],
                        "voice": voice_id,
                        "characters": len(text),
                        "exception": type(error).__name__,
                    },
                )
                raise SynthesisFailedError(str(error)) from error

            samples = apply_limiter(result.samples)
            path, byte_size = self._store.store(cache_key, samples, result.sample_rate)
            info = self._engine.info
            self._repository.insert(
                build_entry(
                    cache_key=cache_key,
                    engine=self._engine.name,
                    model_id=info.model_id,
                    voice_id=voice_id,
                    language_code=self._language_code,
                    speed=speed,
                    synthesis_text_hash=hash_text(text),
                    audio_path=path,
                    sample_rate=result.sample_rate,
                    duration_seconds=result.duration_seconds,
                    byte_size=byte_size,
                )
            )
            _LOGGER.info(
                "chunk_synthesized",
                extra={
                    "cache_key": cache_key[:12],
                    "engine": self._engine.name,
                    "voice": voice_id,
                    "speed": speed,
                    "characters": len(text),
                    "duration": round(result.duration_seconds, 3),
                },
            )
            return SynthesisOutcome(
                cache_key=cache_key,
                audio_path=path,
                sample_rate=result.sample_rate,
                duration_seconds=result.duration_seconds,
                byte_size=byte_size,
                cache_hit=False,
                phoneme_debug=result.phoneme_debug,
            )
