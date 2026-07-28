"""Static default values that are not expected to change at runtime.

Values here are deliberately *not* environment variables: they are either
protocol-level constants (the cache key settings version) or tuning knobs that
the specification pins for Version 1.
"""

from __future__ import annotations

from typing import Final

#: Bumped whenever a change to synthesis preparation should invalidate every
#: existing cache entry. See :mod:`reader_tts.cache.keys`.
SETTINGS_VERSION: Final = 1

#: Engine identifier recorded in cache keys and job metadata.
ENGINE_KOKORO: Final = "kokoro"

#: Only US English is supported in Version 1.
DEFAULT_LANGUAGE_CODE: Final = "en-us"

# --- Speed constraints (specification 11.4) ----------------------------------
MIN_SPEED: Final = 0.75
DEFAULT_SPEED: Final = 1.0
MAX_SPEED: Final = 1.25
SPEED_STEP: Final = 0.05

# --- Sentence chunking thresholds (specification 10.2) -----------------------
PREFERRED_MAX_SENTENCE_CHARS: Final = 350
HARD_MAX_SENTENCE_CHARS: Final = 600

# --- Pause defaults in milliseconds (specification 10.3) ---------------------
DEFAULT_CHUNK_PAUSE_MS: Final = 80
DEFAULT_SENTENCE_PAUSE_MS: Final = 220
DEFAULT_PARAGRAPH_PAUSE_MS: Final = 550

# --- Audio validation safeguards (specification 12.2) ------------------------
MIN_AUDIO_DURATION_SECONDS: Final = 0.08
MAX_CHUNK_DURATION_SECONDS: Final = 60.0
MIN_AUDIO_RMS: Final = 1e-4
#: Generous upper bound on seconds of audio per character of synthesis text.
MAX_SECONDS_PER_CHARACTER: Final = 0.6
#: Peak level the safety limiter targets when output exceeds the valid range.
LIMITER_TARGET_PEAK: Final = 0.99
#: Peak level used for the mild normalization applied to exported documents.
EXPORT_TARGET_PEAK: Final = 0.95
#: Fade applied at the very start and end of an exported document.
EXPORT_FADE_MS: Final = 15

# --- Document limits ---------------------------------------------------------
DEFAULT_MAX_DOCUMENT_CHARACTERS: Final = 2_000_000
DEFAULT_MAX_REQUEST_BYTES: Final = 8 * 1024 * 1024
