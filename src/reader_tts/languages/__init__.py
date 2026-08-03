"""Language packs: everything language-specific, in one place per language."""

from reader_tts.languages.base import DictionaryConfig, LanguagePack
from reader_tts.languages.registry import (
    DEFAULT_LANGUAGE,
    available_languages,
    get_pack,
    pack_for_voice,
    require_voice_language,
    resolve_voice,
)

__all__ = [
    "DEFAULT_LANGUAGE",
    "DictionaryConfig",
    "LanguagePack",
    "available_languages",
    "get_pack",
    "pack_for_voice",
    "require_voice_language",
    "resolve_voice",
]
