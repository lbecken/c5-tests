"""The speech engine boundary.

Everything specific to a neural model lives behind :class:`SpeechEngine`. No
engine-specific type ever crosses this boundary, which is what allows a second
engine to be added later without touching the domain, cache or API layers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np
from numpy.typing import NDArray

from reader_tts.config import defaults
from reader_tts.domain.errors import InvalidSpeedError, InvalidVoiceError
from reader_tts.domain.models import EngineInfo, VoiceConfig


@dataclass(frozen=True, slots=True)
class SynthesisRequest:
    """One unit of text to speak."""

    text: str
    voice_id: str
    speed: float
    language_code: str = defaults.DEFAULT_LANGUAGE_CODE


@dataclass(frozen=True, slots=True)
class SynthesisResult:
    """Audio produced for one request.

    Samples are mono float32 in ``[-1, 1]`` at the engine's native rate.
    """

    samples: NDArray[np.float32]
    sample_rate: int
    phoneme_debug: str | None
    duration_seconds: float


@runtime_checkable
class SpeechEngine(Protocol):
    """The synthesis capability the application depends on."""

    @property
    def name(self) -> str:
        """Engine identifier recorded in cache keys."""
        ...

    @property
    def info(self) -> EngineInfo:
        """Model, voice and readiness details for the health route."""
        ...

    def list_voices(self) -> list[str]:
        """Identifiers of every bundled voice."""
        ...

    def voice_config(self, voice_id: str) -> VoiceConfig:
        """Return the configuration of one bundled voice."""
        ...

    def voice_fingerprint(self, voice_id: str) -> str:
        """A digest identifying the voice data, for cache keys."""
        ...

    def synthesize(self, request: SynthesisRequest) -> SynthesisResult:
        """Generate audio for one request."""
        ...

    def close(self) -> None:
        """Release model resources."""
        ...


def validate_speed(speed: float) -> float:
    """Clamp-check a requested speed against the supported range.

    Raises:
        InvalidSpeedError: If *speed* falls outside the supported range.
    """
    if not defaults.MIN_SPEED <= speed <= defaults.MAX_SPEED:
        raise InvalidSpeedError(
            f"speed {speed} is outside the supported range "
            f"{defaults.MIN_SPEED}-{defaults.MAX_SPEED}"
        )
    # Quantize to the configured step so that equivalent requests share a cache
    # key rather than accumulating near-duplicate entries.
    steps = round((speed - defaults.MIN_SPEED) / defaults.SPEED_STEP)
    return round(defaults.MIN_SPEED + steps * defaults.SPEED_STEP, 2)


def require_voice(voice_id: str, available: list[str]) -> str:
    """Check that *voice_id* is bundled.

    Raises:
        InvalidVoiceError: If the voice is not available.
    """
    if voice_id not in available:
        raise InvalidVoiceError(
            f"voice '{voice_id}' is not available; bundled voices: {', '.join(available)}"
        )
    return voice_id
