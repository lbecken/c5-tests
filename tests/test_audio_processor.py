"""Audio validation, level control, concatenation and WAV output tests."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from reader_tts.domain.errors import AudioValidationError
from reader_tts.synthesis.audio_processor import (
    StreamingWavWriter,
    apply_fades,
    apply_limiter,
    concatenate,
    iter_wav_blocks,
    measure,
    normalize_peak,
    read_wav,
    silence,
    to_pcm16,
    validate_audio,
    write_wav,
)

SAMPLE_RATE = 24_000


def tone(seconds: float = 1.0, amplitude: float = 0.5, frequency: float = 220.0) -> np.ndarray:
    t = np.arange(int(SAMPLE_RATE * seconds), dtype=np.float32) / SAMPLE_RATE
    return (amplitude * np.sin(2 * np.pi * frequency * t)).astype(np.float32)


# --- Validation -------------------------------------------------------------------


def test_valid_signal_passes() -> None:
    stats = validate_audio(tone(), SAMPLE_RATE, "a" * 30)
    assert stats.duration_seconds == pytest.approx(1.0)
    assert stats.peak == pytest.approx(0.5, abs=0.01)
    assert stats.rms > 0.3


def test_empty_signal_rejected() -> None:
    with pytest.raises(AudioValidationError, match="no samples"):
        validate_audio(np.zeros(0, dtype=np.float32), SAMPLE_RATE, "text")


def test_nan_rejected() -> None:
    samples = tone()
    samples[100] = np.nan
    with pytest.raises(AudioValidationError, match="NaN"):
        validate_audio(samples, SAMPLE_RATE, "a" * 30)


def test_infinity_rejected() -> None:
    samples = tone()
    samples[100] = np.inf
    with pytest.raises(AudioValidationError, match="NaN or infinite"):
        validate_audio(samples, SAMPLE_RATE, "a" * 30)


def test_silence_rejected() -> None:
    with pytest.raises(AudioValidationError, match="nearly silent"):
        validate_audio(np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE, "a" * 30)


def test_implausibly_short_output_rejected() -> None:
    with pytest.raises(AudioValidationError, match="implausibly short"):
        validate_audio(tone(0.01), SAMPLE_RATE, "a" * 30)


def test_output_longer_than_chunk_limit_rejected() -> None:
    long_signal = np.tile(tone(1.0), 61)
    with pytest.raises(AudioValidationError, match="per-chunk limit"):
        validate_audio(long_signal, SAMPLE_RATE, "a" * 500)


def test_duration_to_text_ratio_enforced() -> None:
    with pytest.raises(AudioValidationError, match="duration-to-text ratio"):
        validate_audio(tone(10.0), SAMPLE_RATE, "hi")


def test_stereo_rejected() -> None:
    stereo = np.zeros((100, 2), dtype=np.float32)
    with pytest.raises(AudioValidationError, match="mono"):
        validate_audio(stereo, SAMPLE_RATE, "text")


def test_non_positive_sample_rate_rejected() -> None:
    with pytest.raises(AudioValidationError, match="sample rate"):
        measure(tone(), 0)


# --- Levels -----------------------------------------------------------------------


def test_limiter_leaves_valid_audio_untouched() -> None:
    samples = tone(0.5, amplitude=0.8)
    assert apply_limiter(samples) is samples


def test_limiter_scales_clipping_audio() -> None:
    limited = apply_limiter(tone(0.5, amplitude=3.0))
    assert float(np.max(np.abs(limited))) <= 1.0


def test_normalize_peak_raises_quiet_audio() -> None:
    normalized = normalize_peak(tone(0.5, amplitude=0.1), target_peak=0.9)
    assert float(np.max(np.abs(normalized))) == pytest.approx(0.9, abs=0.01)


def test_normalize_peak_handles_silence() -> None:
    quiet = np.zeros(100, dtype=np.float32)
    assert np.array_equal(normalize_peak(quiet), quiet)


def test_fades_taper_the_boundaries() -> None:
    faded = apply_fades(tone(1.0), SAMPLE_RATE, fade_ms=20)
    assert abs(float(faded[0])) < 1e-6
    assert abs(float(faded[-1])) < 1e-3


def test_fades_skip_very_short_audio() -> None:
    short = tone(0.001)
    assert np.array_equal(apply_fades(short, SAMPLE_RATE, fade_ms=100), short)


# --- Assembly ----------------------------------------------------------------------


def test_silence_length() -> None:
    assert silence(220, SAMPLE_RATE).shape[0] == int(SAMPLE_RATE * 0.22)
    assert silence(0, SAMPLE_RATE).shape[0] == 0


def test_concatenation_is_sample_accurate() -> None:
    first = tone(0.1)
    gap = silence(100, SAMPLE_RATE)
    joined = concatenate([first, gap, first])
    assert joined.shape[0] == first.shape[0] * 2 + gap.shape[0]
    assert np.array_equal(joined[: first.shape[0]], first)


def test_concatenating_nothing_returns_empty() -> None:
    assert concatenate([]).shape[0] == 0
    assert concatenate([np.zeros(0, dtype=np.float32)]).shape[0] == 0


def test_pcm16_conversion_clips() -> None:
    converted = to_pcm16(np.array([-2.0, 0.0, 2.0], dtype=np.float32))
    assert converted.tolist() == [-32767, 0, 32767]


# --- Files --------------------------------------------------------------------------


def test_wav_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "out.wav"
    original = tone(0.25)
    byte_size = write_wav(path, original, SAMPLE_RATE)
    assert byte_size > 0
    restored, rate = read_wav(path)
    assert rate == SAMPLE_RATE
    assert restored.shape == original.shape
    assert np.allclose(restored, original, atol=1e-3)


def test_write_leaves_no_partial_file(tmp_path: Path) -> None:
    path = tmp_path / "out.wav"
    write_wav(path, tone(0.2), SAMPLE_RATE)
    assert [p.name for p in tmp_path.iterdir()] == ["out.wav"]


def test_reading_a_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(AudioValidationError, match="could not read"):
        read_wav(tmp_path / "absent.wav")


def test_streaming_writer_appends_without_holding_audio(tmp_path: Path) -> None:
    path = tmp_path / "stream.wav"
    block = tone(0.1)
    with StreamingWavWriter(path, SAMPLE_RATE) as writer:
        for _ in range(5):
            writer.append(block)
            writer.append(silence(50, SAMPLE_RATE))
        assert writer.frames_written == 5 * (block.shape[0] + silence(50, SAMPLE_RATE).shape[0])
        assert writer.duration_seconds > 0.5
        size = writer.finalize()
    assert size > 0
    restored, rate = read_wav(path)
    assert rate == SAMPLE_RATE
    assert restored.shape[0] == 5 * (block.shape[0] + silence(50, SAMPLE_RATE).shape[0])


def test_streaming_writer_refuses_empty_output(tmp_path: Path) -> None:
    writer = StreamingWavWriter(tmp_path / "empty.wav", SAMPLE_RATE)
    with pytest.raises(AudioValidationError, match="empty audio file"):
        writer.finalize()
    assert not (tmp_path / "empty.wav").exists()


def test_streaming_writer_aborts_cleanly(tmp_path: Path) -> None:
    path = tmp_path / "aborted.wav"
    writer = StreamingWavWriter(path, SAMPLE_RATE)
    writer.append(tone(0.1))
    writer.abort()
    assert not path.exists()
    assert list(tmp_path.iterdir()) == []


def test_streaming_writer_rejects_use_after_finalize(tmp_path: Path) -> None:
    writer = StreamingWavWriter(tmp_path / "done.wav", SAMPLE_RATE)
    writer.append(tone(0.1))
    writer.finalize()
    with pytest.raises(AudioValidationError, match="finalized"):
        writer.append(tone(0.1))


def test_iter_wav_blocks_reproduces_the_file(tmp_path: Path) -> None:
    path = tmp_path / "blocks.wav"
    original = tone(0.5)
    write_wav(path, original, SAMPLE_RATE)
    rebuilt = concatenate(iter_wav_blocks(path, block_frames=1024))
    assert rebuilt.shape == original.shape
    assert np.allclose(rebuilt, original, atol=1e-3)
