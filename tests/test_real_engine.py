"""Smoke tests against the real Kokoro model.

These are excluded from the fast suite. Run them deliberately, after the model
has been downloaded once:

    uv run pytest -m real_tts

They need the model files under ``READER_TTS_MODEL_DIR`` (default
``./models/kokoro``) but no network access.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest

from reader_tts.config.settings import Settings
from reader_tts.container import AppServices
from reader_tts.domain.errors import InvalidVoiceError, ModelNotReadyError
from reader_tts.synthesis.audio_processor import read_wav, validate_audio
from reader_tts.synthesis.base import SynthesisRequest
from reader_tts.synthesis.kokoro_engine import SAMPLE_RATE, KokoroSpeechEngine

pytestmark = pytest.mark.real_tts

MODEL_DIR = Path(os.environ.get("READER_TTS_MODEL_DIR", "./models/kokoro")).resolve()

requires_model = pytest.mark.skipif(
    not (MODEL_DIR / "kokoro-v1_0.pth").is_file(),
    reason=f"the Kokoro model is not present in {MODEL_DIR}",
)


@pytest.fixture(scope="module")
def engine() -> Iterator[KokoroSpeechEngine]:
    settings = Settings(model_dir=MODEL_DIR, engine="kokoro")
    speech_engine = KokoroSpeechEngine(settings)
    speech_engine.start()
    yield speech_engine
    speech_engine.close()


@requires_model
def test_model_loads_and_reports_readiness(engine: KokoroSpeechEngine) -> None:
    info = engine.info
    assert info.ready
    assert info.name == "kokoro"
    assert info.sample_rate == SAMPLE_RATE
    assert info.device in {"cpu", "cuda"}
    assert info.model_hash
    assert info.initialization_seconds > 0


@requires_model
def test_known_voices_exist(engine: KokoroSpeechEngine) -> None:
    voices = engine.list_voices()
    assert "af_heart" in voices
    assert any(voice.startswith("am_") for voice in voices), "a male voice should be bundled"
    config = engine.voice_config("af_heart")
    assert config.language_code == "en-us"
    assert engine.voice_fingerprint("af_heart")


@requires_model
def test_unknown_voice_is_rejected(engine: KokoroSpeechEngine) -> None:
    with pytest.raises(InvalidVoiceError):
        engine.voice_config("not_a_voice")


@requires_model
def test_one_sentence_synthesizes(engine: KokoroSpeechEngine) -> None:
    result = engine.synthesize(
        SynthesisRequest(text="The wind moved through the trees.", voice_id="af_heart", speed=1.0)
    )
    assert result.sample_rate == SAMPLE_RATE
    assert result.samples.size > 0
    assert np.all(np.isfinite(result.samples))
    assert result.phoneme_debug, "the engine should report the phonemes it used"

    # A seven-word sentence should land in a plausible range.
    assert 1.0 < result.duration_seconds < 6.0
    stats = validate_audio(result.samples, result.sample_rate, "The wind moved through the trees.")
    assert stats.peak > 0.05
    assert stats.rms > 0.01


@requires_model
def test_speed_changes_duration(engine: KokoroSpeechEngine) -> None:
    text = "The cat sat on the mat and waited for the door to open."
    slow = engine.synthesize(SynthesisRequest(text=text, voice_id="af_heart", speed=0.75))
    fast = engine.synthesize(SynthesisRequest(text=text, voice_id="af_heart", speed=1.25))
    assert slow.duration_seconds > fast.duration_seconds


@requires_model
def test_exported_wav_opens_and_repeats_hit_the_cache(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=Path("data").resolve(),
        runtime_dir=tmp_path / "runtime",
        model_dir=MODEL_DIR,
        engine="kokoro",
    )
    services = AppServices(settings)
    try:
        text = "The cat sat on the mat. Did you close the door?"
        document = services.documents.create(text, title="Real engine smoke test")
        resolver = services.resolver(document.id)
        job = services.jobs.create(document.id, resolver, "af_heart", 1.0)
        progress = services.jobs.run(job.id, resolver)
        assert progress.failed_units == 0
        assert progress.synthesized_units == 2
        assert progress.cache_hits == 0

        export = services.exports.export_document(document.id, "af_heart", 1.0)
        path = services.exports.file_path(export.id)
        samples, rate = read_wav(path)
        assert rate == SAMPLE_RATE
        assert samples.size > 0
        assert np.all(np.isfinite(samples))
        assert export.duration_seconds is not None
        assert export.duration_seconds > 1.0

        # The same text again must be served entirely from the cache.
        repeat = services.documents.create(text, title="Repeat")
        repeat_resolver = services.resolver(repeat.id)
        repeat_job = services.jobs.create(repeat.id, repeat_resolver, "af_heart", 1.0)
        repeat_progress = services.jobs.run(repeat_job.id, repeat_resolver)
        assert repeat_progress.cache_hits == 2
        assert repeat_progress.synthesized_units == 0
    finally:
        services.close()


@requires_model
def test_engine_reports_a_clear_error_when_the_model_is_absent(tmp_path: Path) -> None:
    settings = Settings(model_dir=tmp_path / "empty", engine="kokoro")
    with pytest.raises(ModelNotReadyError, match="missing"):
        KokoroSpeechEngine(settings).start()
