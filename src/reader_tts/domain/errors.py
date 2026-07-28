"""Stable application exceptions.

Engine and storage failures are converted into these types so that no
dependency-specific exception, and no stack trace, ever reaches the API layer.
"""

from __future__ import annotations


class ReaderTTSError(Exception):
    """Base class for every error raised deliberately by the application."""


# --- Configuration and startup ----------------------------------------------


class ConfigurationError(ReaderTTSError):
    """Configuration is missing or internally inconsistent."""


class DictionaryError(ReaderTTSError):
    """The pronunciation dictionary could not be loaded or is malformed."""


class DictionaryNotFoundError(DictionaryError):
    """The pinned dictionary file is absent from the data directory."""


# --- Input handling -----------------------------------------------------------


class ValidationError(ReaderTTSError):
    """Input text failed validation and cannot be synthesized."""


class DocumentTooLargeError(ValidationError):
    """Input text exceeds the configured document size limit."""


class InvalidPhonemeError(ValidationError):
    """A pronunciation contains a symbol outside the ARPAbet inventory."""


class InvalidSpeedError(ValidationError):
    """A requested speed lies outside the supported range."""


# --- Resources ---------------------------------------------------------------


class NotFoundError(ReaderTTSError):
    """A requested resource does not exist."""


class DocumentNotFoundError(NotFoundError):
    """No document exists with the requested identifier."""


class SentenceNotFoundError(NotFoundError):
    """No sentence exists with the requested identifier."""


class JobNotFoundError(NotFoundError):
    """No synthesis job exists with the requested identifier."""


class ExportNotFoundError(NotFoundError):
    """No export exists with the requested identifier."""


class ConflictError(ReaderTTSError):
    """The request conflicts with the current state of the resource."""


# --- Speech engine ------------------------------------------------------------


class SpeechEngineError(ReaderTTSError):
    """Base class for speech engine failures."""


class ModelNotReadyError(SpeechEngineError):
    """The speech model is missing, still loading, or failed its health check."""


class InvalidVoiceError(SpeechEngineError):
    """The requested voice is not part of the bundled voice list."""


class SynthesisFailedError(SpeechEngineError):
    """The engine ran but produced no usable audio."""


# --- Audio and storage ---------------------------------------------------------


class AudioValidationError(ReaderTTSError):
    """Generated audio failed its post-synthesis sanity checks."""


class CacheError(ReaderTTSError):
    """The audio cache could not satisfy or record a request."""


class StorageError(ReaderTTSError):
    """A filesystem or database operation failed."""


class UnsafePathError(StorageError):
    """A path escaped the directory it was required to stay within."""
