"""Audio validation, level control, silence and WAV output.

Samples are mono float32 throughout the application; PCM16 appears only in
exported and cached WAV files.
"""

from __future__ import annotations

import wave
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
from numpy.typing import NDArray

from reader_tts.config import defaults
from reader_tts.domain.errors import AudioValidationError

Samples = NDArray[np.float32]


@dataclass(frozen=True, slots=True)
class AudioStatistics:
    """Measurements taken from a block of samples."""

    duration_seconds: float
    peak: float
    rms: float
    sample_count: int


def measure(samples: Samples, sample_rate: int) -> AudioStatistics:
    """Compute duration, peak and RMS for *samples*."""
    if sample_rate <= 0:
        raise AudioValidationError(f"sample rate must be positive, got {sample_rate}")
    count = int(samples.shape[0])
    peak = float(np.max(np.abs(samples))) if count else 0.0
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64)))) if count else 0.0
    return AudioStatistics(
        duration_seconds=count / sample_rate, peak=peak, rms=rms, sample_count=count
    )


def validate_audio(
    samples: Samples,
    sample_rate: int,
    text: str,
    min_duration: float = defaults.MIN_AUDIO_DURATION_SECONDS,
    max_duration: float = defaults.MAX_CHUNK_DURATION_SECONDS,
    min_rms: float = defaults.MIN_AUDIO_RMS,
) -> AudioStatistics:
    """Check generated audio against the Version 1 safeguards.

    Args:
        samples: Mono float32 samples.
        sample_rate: Samples per second.
        text: The synthesis text, used for the duration-to-length check.
        min_duration: Shortest plausible output.
        max_duration: Longest plausible output for one technical chunk.
        min_rms: Level below which the output counts as silence.

    Returns:
        The measurements taken during validation.

    Raises:
        AudioValidationError: If any safeguard fails.
    """
    if samples.ndim != 1:
        raise AudioValidationError(f"expected mono audio, got shape {samples.shape}")
    if samples.size == 0:
        raise AudioValidationError("engine produced no samples")
    if not np.all(np.isfinite(samples)):
        raise AudioValidationError("engine produced NaN or infinite samples")

    stats = measure(samples, sample_rate)
    if stats.duration_seconds < min_duration:
        raise AudioValidationError(
            f"output is implausibly short: {stats.duration_seconds:.3f}s for {len(text)} characters"
        )
    if stats.duration_seconds > max_duration:
        raise AudioValidationError(
            f"output exceeds the per-chunk limit: {stats.duration_seconds:.1f}s"
        )
    allowance = max(min_duration, len(text) * defaults.MAX_SECONDS_PER_CHARACTER)
    if stats.duration_seconds > allowance:
        raise AudioValidationError(
            f"output is {stats.duration_seconds:.1f}s for {len(text)} characters, "
            "which exceeds the duration-to-text ratio limit"
        )
    if stats.rms < min_rms:
        raise AudioValidationError(
            f"output is nearly silent (rms {stats.rms:.6f}); the engine may have "
            "failed to pronounce the text"
        )
    return stats


def apply_limiter(samples: Samples, target_peak: float = defaults.LIMITER_TARGET_PEAK) -> Samples:
    """Scale *samples* down when they exceed the valid range.

    Audio already inside the range is returned untouched, so sentence-to-
    sentence loudness stays consistent.
    """
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if peak <= 1.0:
        return samples
    return (samples * (target_peak / peak)).astype(np.float32)


def normalize_peak(samples: Samples, target_peak: float = defaults.EXPORT_TARGET_PEAK) -> Samples:
    """Scale *samples* so their peak reaches *target_peak*.

    Used only when assembling a complete export, never per sentence.
    """
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if peak <= 0.0:
        return samples
    return (samples * (target_peak / peak)).astype(np.float32)


def apply_fades(
    samples: Samples, sample_rate: int, fade_ms: int = defaults.EXPORT_FADE_MS
) -> Samples:
    """Apply a short fade in and out at the boundaries of a document."""
    length = int(sample_rate * fade_ms / 1000)
    if length <= 0 or samples.size < length * 2:
        return samples
    faded = samples.copy()
    ramp = np.linspace(0.0, 1.0, length, dtype=np.float32)
    faded[:length] *= ramp
    faded[-length:] *= ramp[::-1]
    return faded


def silence(duration_ms: int, sample_rate: int) -> Samples:
    """Return *duration_ms* of digital silence."""
    count = max(0, int(sample_rate * duration_ms / 1000))
    return np.zeros(count, dtype=np.float32)


def concatenate(blocks: Iterable[Samples]) -> Samples:
    """Join sample blocks in order, sample-accurately."""
    collected = [block for block in blocks if block.size]
    if not collected:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(collected).astype(np.float32)


def to_pcm16(samples: Samples) -> NDArray[np.int16]:
    """Convert float samples to PCM16, clipping out-of-range values."""
    clipped = np.clip(samples, -1.0, 1.0)
    return (clipped * 32767.0).astype(np.int16)


def write_wav(path: Path, samples: Samples, sample_rate: int) -> int:
    """Write mono PCM16 WAV atomically and return the byte size.

    The file is written beside its destination and renamed once complete, so a
    reader never observes a partially written file.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.partial")
    try:
        sf.write(temporary, to_pcm16(samples), sample_rate, subtype="PCM_16", format="WAV")
        temporary.replace(path)
    except OSError as error:
        temporary.unlink(missing_ok=True)
        raise AudioValidationError(f"could not write audio to {path.name}: {error}") from error
    return path.stat().st_size


def read_wav(path: Path) -> tuple[Samples, int]:
    """Read a mono WAV file into float32 samples."""
    try:
        data, sample_rate = sf.read(path, dtype="float32", always_2d=False)
    except (OSError, RuntimeError) as error:
        raise AudioValidationError(f"could not read audio from {path.name}: {error}") from error
    samples = np.asarray(data, dtype=np.float32)
    if samples.ndim > 1:
        samples = samples.mean(axis=1).astype(np.float32)
    return samples, int(sample_rate)


class StreamingWavWriter:
    """Append blocks to a WAV file without holding the whole waveform in RAM.

    The file is written to a temporary path and atomically renamed by
    :meth:`finalize`, which also fixes up the RIFF header.
    """

    def __init__(self, destination: Path, sample_rate: int, tmp_dir: Path | None = None) -> None:
        self._destination = destination
        self._sample_rate = sample_rate
        directory = tmp_dir or destination.parent
        directory.mkdir(parents=True, exist_ok=True)
        destination.parent.mkdir(parents=True, exist_ok=True)
        self._temporary = directory / f".{destination.name}.partial"
        # The handle intentionally outlives this call: the writer owns it until
        # finalize() or abort(), which is what allows streaming appends.
        self._handle = wave.open(str(self._temporary), "wb")  # noqa: SIM115
        self._handle.setnchannels(1)
        self._handle.setsampwidth(2)
        self._handle.setframerate(sample_rate)
        self._frames = 0
        self._peak = 0.0
        self._closed = False

    @property
    def frames_written(self) -> int:
        """Number of sample frames appended so far."""
        return self._frames

    @property
    def duration_seconds(self) -> float:
        """Duration of the audio appended so far."""
        return self._frames / self._sample_rate

    @property
    def peak(self) -> float:
        """Highest absolute sample value seen so far."""
        return self._peak

    def append(self, samples: Samples) -> None:
        """Append one block of samples."""
        if self._closed:
            raise AudioValidationError("cannot append to a finalized writer")
        if samples.size == 0:
            return
        self._peak = max(self._peak, float(np.max(np.abs(samples))))
        self._handle.writeframes(to_pcm16(samples).tobytes())
        self._frames += int(samples.shape[0])

    def finalize(self) -> int:
        """Close the file, move it into place and return its byte size."""
        if self._closed:
            raise AudioValidationError("writer has already been finalized")
        self._handle.close()
        self._closed = True
        if self._frames == 0:
            self._temporary.unlink(missing_ok=True)
            raise AudioValidationError("refusing to write an empty audio file")
        self._temporary.replace(self._destination)
        return self._destination.stat().st_size

    def abort(self) -> None:
        """Close and discard the partial file."""
        if not self._closed:
            self._handle.close()
            self._closed = True
        self._temporary.unlink(missing_ok=True)

    def __enter__(self) -> StreamingWavWriter:
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        if exc_type is not None:
            self.abort()


def iter_wav_blocks(path: Path, block_frames: int = 1 << 16) -> Iterator[Samples]:
    """Yield a WAV file's samples in blocks, for streaming assembly."""
    try:
        with sf.SoundFile(path) as handle:
            while True:
                block = handle.read(block_frames, dtype="float32", always_2d=False)
                if block.shape[0] == 0:
                    break
                samples = np.asarray(block, dtype=np.float32)
                if samples.ndim > 1:
                    samples = samples.mean(axis=1).astype(np.float32)
                yield samples
    except (OSError, RuntimeError) as error:
        raise AudioValidationError(f"could not read audio from {path.name}: {error}") from error
