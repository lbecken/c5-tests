"""Kokoro speech engine adapter.

This is the only module that imports Kokoro or torch. It is written against the
installed package's actual API (kokoro 0.9.4): a ``KModel`` loaded from local
files, driven by a ``KPipeline`` whose voice argument accepts a preloaded
tensor, which keeps synthesis entirely offline.

The pipeline keeps its own grapheme-to-phoneme frontend, so the reader passes
normalized sentence text and uses its dictionaries for validation, inspection
and override management. The adapter reports the phonemes the engine actually
chose so the two can be compared.

One model serves every language; the language-specific part is the pipeline,
of which one is created per language on first use and then reused.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Final

import numpy as np
from numpy.typing import NDArray

from reader_tts.config import defaults
from reader_tts.config.settings import Settings
from reader_tts.domain.errors import (
    InvalidVoiceError,
    ModelNotReadyError,
    SynthesisFailedError,
)
from reader_tts.domain.models import EngineInfo, VoiceConfig
from reader_tts.languages.registry import available_languages, pack_for_voice
from reader_tts.synthesis.base import (
    SynthesisRequest,
    SynthesisResult,
    require_voice,
    validate_speed,
)

if TYPE_CHECKING:  # pragma: no cover - import cycle avoidance for type checking
    from collections.abc import Sequence

_LOGGER: Final = logging.getLogger(__name__)

#: Kokoro's native output rate.
SAMPLE_RATE: Final = 24_000


MODEL_FILENAME: Final = "kokoro-v1_0.pth"
CONFIG_FILENAME: Final = "config.json"
VOICES_DIRNAME: Final = "voices"
REPO_ID: Final = "hexgrad/Kokoro-82M"

#: Every bundled voice, gathered from the language packs. A voice belongs to
#: exactly one language: a French voice reading English produces confident
#: nonsense, so the pairing is enforced rather than merely discouraged.
BUNDLED_VOICES: Final[tuple[VoiceConfig, ...]] = tuple(
    voice for pack in available_languages() for voice in pack.voices
)


class KokoroSpeechEngine:
    """Adapter around Kokoro's Python inference package.

    The model is loaded once and reused. Synthesis is serialized with a lock
    because a single torch module is not safe to call concurrently.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model_dir = settings.model_dir
        self._lock = threading.RLock()
        self._pipelines: dict[str, Any] = {}
        self._model: Any | None = None
        self._voice_tensors: dict[str, Any] = {}
        self._voice_hashes: dict[str, str] = {}
        self._pipeline_factory: Any = None
        self._voices: tuple[VoiceConfig, ...] = ()
        self._device = "cpu"
        self._model_hash = ""
        self._initialization_seconds = 0.0
        self._ready = False
        self._error: str | None = None

    # --- Identity -------------------------------------------------------------

    @property
    def name(self) -> str:
        """Engine identifier used in cache keys."""
        return defaults.ENGINE_KOKORO

    @property
    def info(self) -> EngineInfo:
        """Readiness and provenance details for the health route."""
        return EngineInfo(
            name=self.name,
            model_id=self._settings.model_id,
            ready=self._ready,
            voices=tuple(voice.id for voice in self._voices),
            sample_rate=SAMPLE_RATE,
            device=self._device,
            model_hash=self._model_hash,
            initialization_seconds=self._initialization_seconds,
            error_message=self._error,
        )

    # --- Lifecycle -------------------------------------------------------------

    def start(self, run_health_check: bool = True) -> None:
        """Load the model, voices and pipeline once.

        Args:
            run_health_check: Synthesize a short phrase to confirm the model
                produces audio before the application accepts requests.

        Raises:
            ModelNotReadyError: If files are missing or the model fails to load.
        """
        with self._lock:
            if self._ready:
                return
            started = time.monotonic()
            self._verify_files()
            self._device = self._select_device()
            try:
                self._load(self._device)
            except ModelNotReadyError:
                raise
            except Exception as error:  # noqa: BLE001 - converted below
                self._error = f"{type(error).__name__}: {error}"
                raise ModelNotReadyError(
                    f"the Kokoro model could not be loaded from {self._model_dir}: {error}"
                ) from error

            self._ready = True
            self._initialization_seconds = time.monotonic() - started
            if run_health_check:
                self._health_check()
            _LOGGER.info(
                "engine_started",
                extra={
                    "engine": self.name,
                    "model_id": self._settings.model_id,
                    "device": self._device,
                    "voices": len(self._voices),
                    "duration": round(self._initialization_seconds, 3),
                },
            )

    def close(self) -> None:
        """Release the model and voice tensors."""
        with self._lock:
            self._pipelines.clear()
            self._model = None
            self._voice_tensors.clear()
            self._ready = False

    # --- Voices ------------------------------------------------------------------

    def list_voices(self) -> list[str]:
        """Identifiers of the bundled voices whose files are present."""
        if not self._voices:
            self._voices = self._discover_voices()
        return [voice.id for voice in self._voices]

    def voice_config(self, voice_id: str) -> VoiceConfig:
        """Return the configuration of one bundled voice.

        Raises:
            InvalidVoiceError: If the voice is not bundled.
        """
        for voice in self._voices or self._discover_voices():
            if voice.id == voice_id:
                return voice
        raise InvalidVoiceError(
            f"voice '{voice_id}' is not available; bundled voices: {', '.join(self.list_voices())}"
        )

    def voice_fingerprint(self, voice_id: str) -> str:
        """Digest of the voice file, so replacing a voice invalidates its cache."""
        config = self.voice_config(voice_id)
        path = self._model_dir / VOICES_DIRNAME / f"{config.model_voice_name}.pt"
        if not path.is_file():  # pragma: no cover - voice_config already checked
            raise InvalidVoiceError(f"voice file for '{voice_id}' is missing")
        cached = self._voice_hashes.get(voice_id)
        if cached is None:
            cached = _file_digest(path)
            self._voice_hashes[voice_id] = cached
        return cached

    # --- Synthesis ------------------------------------------------------------------

    def synthesize(self, request: SynthesisRequest) -> SynthesisResult:
        """Generate audio for one request.

        Raises:
            ModelNotReadyError: If the engine has not been started.
            InvalidVoiceError: If the requested voice is not bundled.
            SynthesisFailedError: If the engine produces no audio.
        """
        if not self._ready:
            raise ModelNotReadyError("the Kokoro engine has not been started")
        text = request.text.strip()
        if not text:
            raise SynthesisFailedError("refusing to synthesize empty text")

        speed = validate_speed(request.speed)
        require_voice(request.voice_id, self.list_voices())
        voice = self._voice_tensor(request.voice_id)

        with self._lock:
            pipeline = self._pipeline_for(request.voice_id)
            try:
                results = list(pipeline(text, voice=voice, speed=speed))
            except Exception as error:  # noqa: BLE001 - converted to a stable type
                _LOGGER.warning(
                    "synthesis_failed",
                    extra={
                        "engine": self.name,
                        "voice": request.voice_id,
                        "characters": len(text),
                        "exception": type(error).__name__,
                    },
                )
                raise SynthesisFailedError(
                    f"the engine failed to synthesize {len(text)} characters: {error}"
                ) from error

        samples, phonemes = self._collect(results)
        if samples.size == 0:
            raise SynthesisFailedError("the engine returned no audio for the request")
        return SynthesisResult(
            samples=samples,
            sample_rate=SAMPLE_RATE,
            phoneme_debug=phonemes or None,
            duration_seconds=samples.shape[0] / SAMPLE_RATE,
        )

    # --- Internals ---------------------------------------------------------------------

    def _verify_files(self) -> None:
        missing = [
            str(path)
            for path in (
                self._model_dir / MODEL_FILENAME,
                self._model_dir / CONFIG_FILENAME,
            )
            if not path.is_file()
        ]
        if missing:
            raise ModelNotReadyError(
                "the Kokoro model files are missing: "
                + ", ".join(missing)
                + ". Run 'python scripts/download_model.py' once while online."
            )
        if not self._discover_voices():
            raise ModelNotReadyError(
                f"no bundled voice files were found in {self._model_dir / VOICES_DIRNAME}. "
                "Run 'python scripts/download_model.py' once while online."
            )

    def _discover_voices(self) -> tuple[VoiceConfig, ...]:
        directory = self._model_dir / VOICES_DIRNAME
        found = tuple(
            voice
            for voice in BUNDLED_VOICES
            if (directory / f"{voice.model_voice_name}.pt").is_file()
        )
        self._voices = found
        return found

    def _select_device(self) -> str:
        configured = self._settings.device
        if configured != "auto":
            return configured
        try:
            import torch
        except ImportError:  # pragma: no cover - handled by _load
            return "cpu"
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def _load(self, device: str) -> None:
        try:
            import torch
            from kokoro import KModel, KPipeline
        except ImportError as error:
            raise ModelNotReadyError(
                "the 'kokoro' package is not installed; install the optional "
                "dependency group with: uv sync --extra kokoro"
            ) from error

        model_path = self._model_dir / MODEL_FILENAME
        self._model_hash = _file_digest(model_path)
        model = KModel(
            repo_id=REPO_ID,
            config=str(self._model_dir / CONFIG_FILENAME),
            model=str(model_path),
        )
        self._model = model.to(device).eval()
        self._pipeline_factory = KPipeline
        voices_dir = self._model_dir / VOICES_DIRNAME
        for voice in self._discover_voices():
            self._voice_tensors[voice.id] = torch.load(
                voices_dir / f"{voice.model_voice_name}.pt", weights_only=True
            )

    def _pipeline_for(self, voice_id: str) -> Any:
        """Return the pipeline for the voice's language, creating it on first use.

        Kokoro binds a pipeline to one language because each language has its
        own grapheme-to-phoneme frontend. The model itself is shared, so the
        extra cost of a second language is small.
        """
        engine_code = pack_for_voice(voice_id).engine_language_code
        pipeline = self._pipelines.get(engine_code)
        if pipeline is None:
            pipeline = self._pipeline_factory(
                lang_code=engine_code,
                repo_id=REPO_ID,
                model=self._model,
                device=self._device,
            )
            self._pipelines[engine_code] = pipeline
            _LOGGER.info(
                "pipeline_created",
                extra={"engine": self.name, "language": engine_code},
            )
        return pipeline

    def _voice_tensor(self, voice_id: str) -> Any:
        tensor = self._voice_tensors.get(voice_id)
        if tensor is None:
            raise InvalidVoiceError(f"voice '{voice_id}' has no loaded voice file")
        return tensor

    def _collect(self, results: Sequence[Any]) -> tuple[NDArray[np.float32], str]:
        """Join the pipeline's per-segment output into one waveform."""
        blocks: list[NDArray[np.float32]] = []
        phonemes: list[str] = []
        for result in results:
            audio = getattr(result, "audio", None)
            if audio is None:
                continue
            array = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
            blocks.append(np.asarray(array, dtype=np.float32).reshape(-1))
            segment_phonemes = getattr(result, "phonemes", None)
            if segment_phonemes:
                phonemes.append(str(segment_phonemes))
        if not blocks:
            return np.zeros(0, dtype=np.float32), ""
        return np.concatenate(blocks).astype(np.float32), " ".join(phonemes)

    def _health_check(self) -> None:
        voices = self.list_voices()
        configured = self._settings.default_voice
        voice_id = configured if configured in voices else voices[0]
        try:
            result = self.synthesize(
                SynthesisRequest(text="Ready.", voice_id=voice_id, speed=defaults.DEFAULT_SPEED)
            )
        except SynthesisFailedError as error:
            self._ready = False
            self._error = str(error)
            raise ModelNotReadyError(f"the engine health check failed: {error}") from error
        if result.samples.size == 0:  # pragma: no cover - defensive
            self._ready = False
            self._error = "health check produced no audio"
            raise ModelNotReadyError(self._error)


def _file_digest(path: Path, chunk_size: int = 1 << 20) -> str:
    """Return a short SHA-256 digest identifying a model or voice file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()[:16]
