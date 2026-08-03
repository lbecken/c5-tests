"""Lookup of language packs, and of the pack that owns a voice."""

from __future__ import annotations

from typing import Final

from reader_tts.domain.enums import LanguageCode
from reader_tts.domain.errors import ValidationError
from reader_tts.languages.base import LanguagePack
from reader_tts.languages.packs import ALL_PACKS

_BY_CODE: Final[dict[LanguageCode, LanguagePack]] = {pack.code: pack for pack in ALL_PACKS}

_BY_VOICE: Final[dict[str, LanguagePack]] = {
    voice.id: pack for pack in ALL_PACKS for voice in pack.voices
}

#: The language used when a caller names none.
DEFAULT_LANGUAGE: Final = LanguageCode.EN_US


def available_languages() -> tuple[LanguagePack, ...]:
    """Every bundled language pack, in presentation order."""
    return ALL_PACKS


def get_pack(code: LanguageCode | str) -> LanguagePack:
    """Return the pack for *code*.

    Raises:
        ValidationError: If the language is not bundled.
    """
    try:
        language = LanguageCode(code)
    except ValueError as error:
        supported = ", ".join(pack.code.value for pack in ALL_PACKS)
        raise ValidationError(
            f"'{code}' is not a supported language; available: {supported}"
        ) from error
    return _BY_CODE[language]


def pack_for_voice(voice_id: str) -> LanguagePack:
    """Return the pack that owns *voice_id*.

    Raises:
        ValidationError: If no bundled language uses that voice.
    """
    pack = _BY_VOICE.get(voice_id)
    if pack is None:
        raise ValidationError(f"'{voice_id}' is not a voice of any bundled language")
    return pack


def require_voice_language(voice_id: str, language: LanguageCode) -> None:
    """Check that *voice_id* may speak *language*.

    A voice is trained on one language; using a French voice for English text,
    or the reverse, produces confident nonsense. The mismatch is therefore an
    error rather than a warning.

    Raises:
        ValidationError: If the voice belongs to a different language.
    """
    pack = get_pack(language)
    if pack.has_voice(voice_id):
        return
    owner = _BY_VOICE.get(voice_id)
    if owner is None:
        available = ", ".join(pack.voice_ids)
        raise ValidationError(
            f"voice '{voice_id}' does not exist; {pack.display_name} offers: {available}"
        )
    raise ValidationError(
        f"voice '{voice_id}' speaks {owner.display_name}, but the document is "
        f"{pack.display_name}; choose one of: {', '.join(pack.voice_ids)}"
    )


def resolve_voice(voice_id: str | None, language: LanguageCode) -> str:
    """Return the voice to use, defaulting to the language's first voice.

    French bundles a single voice, so leaving *voice_id* unset selects it.

    Raises:
        ValidationError: If the named voice cannot speak the language.
    """
    pack = get_pack(language)
    if voice_id is None:
        return pack.default_voice_id
    require_voice_language(voice_id, language)
    return voice_id
