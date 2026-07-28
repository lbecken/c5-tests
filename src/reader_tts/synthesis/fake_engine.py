"""A deterministic speech engine used by tests and offline development.

The waveform is derived from a hash of the request, so identical requests give
identical audio and different requests give audibly different audio. Nothing
here loads a model or touches the network.
"""

from __future__ import annotations

import hashlib
import threading

import numpy as np
from numpy.typing import NDArray

from reader_tts.config import defaults
from reader_tts.domain.errors import (
    InvalidVoiceError,
    ModelNotReadyError,
    SynthesisFailedError,
)
from reader_tts.domain.models import EngineInfo, VoiceConfig
from reader_tts.synthesis.base import (
    SynthesisRequest,
    SynthesisResult,
    require_voice,
    validate_speed,
)

ENGINE_NAME = "fake"
SAMPLE_RATE = 24_000

FAKE_VOICES: tuple[VoiceConfig, ...] = (
    VoiceConfig(
        id="af_heart",
        display_name="Heart (US female, simulated)",
        language_code=defaults.DEFAULT_LANGUAGE_CODE,
        gender_label="female",
        model_voice_name="af_heart",
        default_speed=defaults.DEFAULT_SPEED,
    ),
    VoiceConfig(
        id="am_michael",
        display_name="Michael (US male, simulated)",
        language_code=defaults.DEFAULT_LANGUAGE_CODE,
        gender_label="male",
        model_voice_name="am_michael",
        default_speed=defaults.DEFAULT_SPEED,
    ),
)


class FakeSpeechEngine:
    """A drop-in :class:`~reader_tts.synthesis.base.SpeechEngine`.

    Attributes:
        requests: Every request received, in order, for assertions.
        fail_on: Substrings that make :meth:`synthesize` raise.
        delay_seconds: Artificial delay per request.
        silent_on: Substrings that make the engine emit near-silence.
    """

    def __init__(
        self,
        model_id: str = "fake-1",
        sample_rate: int = SAMPLE_RATE,
        delay_seconds: float = 0.0,
    ) -> None:
        self.requests: list[SynthesisRequest] = []
        self.fail_on: set[str] = set()
        self.silent_on: set[str] = set()
        self.delay_seconds = delay_seconds
        self._model_id = model_id
        self._sample_rate = sample_rate
        self._ready = True
        self._lock = threading.RLock()

    @property
    def name(self) -> str:
        """Engine identifier used in cache keys."""
        return ENGINE_NAME

    @property
    def info(self) -> EngineInfo:
        """Readiness details, mirroring the real engine's shape."""
        return EngineInfo(
            name=ENGINE_NAME,
            model_id=self._model_id,
            ready=self._ready,
            voices=tuple(voice.id for voice in FAKE_VOICES),
            sample_rate=self._sample_rate,
            device="cpu",
            model_hash="fake",
            initialization_seconds=0.0,
        )

    @property
    def call_count(self) -> int:
        """How many synthesis calls have been served."""
        return len(self.requests)

    def start(self, run_health_check: bool = True) -> None:
        """Mark the engine ready."""
        del run_health_check
        self._ready = True

    def close(self) -> None:
        """Mark the engine unavailable."""
        self._ready = False

    def list_voices(self) -> list[str]:
        """Identifiers of the simulated voices."""
        return [voice.id for voice in FAKE_VOICES]

    def voice_config(self, voice_id: str) -> VoiceConfig:
        """Return one simulated voice configuration."""
        for voice in FAKE_VOICES:
            if voice.id == voice_id:
                return voice
        raise InvalidVoiceError(f"voice '{voice_id}' is not available")

    def voice_fingerprint(self, voice_id: str) -> str:
        """A stable digest standing in for a real voice file's hash."""
        return hashlib.sha256(self.voice_config(voice_id).id.encode()).hexdigest()[:16]

    def synthesize(self, request: SynthesisRequest) -> SynthesisResult:
        """Return a deterministic waveform derived from the request."""
        if not self._ready:
            raise ModelNotReadyError("the fake engine is closed")
        text = request.text.strip()
        if not text:
            raise SynthesisFailedError("refusing to synthesize empty text")
        speed = validate_speed(request.speed)
        require_voice(request.voice_id, self.list_voices())

        with self._lock:
            self.requests.append(request)
        if self.delay_seconds:
            import time

            time.sleep(self.delay_seconds)
        for marker in self.fail_on:
            if marker in text:
                raise SynthesisFailedError(f"fake failure triggered by '{marker}'")

        samples = _waveform(text, request.voice_id, speed, self._sample_rate)
        for marker in self.silent_on:
            if marker in text:
                samples = np.zeros_like(samples)
        return SynthesisResult(
            samples=samples,
            sample_rate=self._sample_rate,
            phoneme_debug=f"fake:{text[:24]}",
            duration_seconds=samples.shape[0] / self._sample_rate,
        )


def _waveform(text: str, voice_id: str, speed: float, sample_rate: int) -> NDArray[np.float32]:
    """Build a short tone whose pitch and length depend on the request."""
    digest = hashlib.sha256(f"{text}|{voice_id}|{speed}".encode()).digest()
    frequency = 110.0 + (digest[0] / 255.0) * 220.0
    # Roughly 60 ms of audio per character, scaled by speed, with a floor that
    # keeps output above the minimum-duration safeguard.
    seconds = max(0.2, min(20.0, len(text) * 0.06 / speed))
    count = int(sample_rate * seconds)
    t = np.arange(count, dtype=np.float32) / sample_rate
    envelope = np.minimum(1.0, np.minimum(t * 40.0, (seconds - t) * 40.0)).astype(np.float32)
    return (0.35 * envelope * np.sin(2.0 * np.pi * frequency * t)).astype(np.float32)
