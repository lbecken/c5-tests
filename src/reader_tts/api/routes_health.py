"""Health, language and voice listing routes."""

from __future__ import annotations

from fastapi import APIRouter, Query

from reader_tts.api.dependencies import Services
from reader_tts.api.schemas import (
    DictionaryHealth,
    EngineHealth,
    HealthResponse,
    LanguageOut,
    LanguagesResponse,
    VoiceOut,
    VoicesResponse,
)
from reader_tts.domain.enums import LanguageCode
from reader_tts.domain.models import VoiceConfig
from reader_tts.languages.registry import DEFAULT_LANGUAGE, available_languages, get_pack

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(services: Services) -> HealthResponse:
    """Report engine readiness and dictionary provenance.

    The route never fails because the model is missing: it reports the problem
    so the interface can explain it to the user. Only dictionaries that have
    already been loaded are described, so asking for health does not pull every
    language into memory.
    """
    default_info = services.dictionary_for(DEFAULT_LANGUAGE).info
    ready, error = services.engine_status()
    engine_info = services.engine.info if ready else None

    loaded = [
        DictionaryHealth(
            name=services.dictionary_for(pack.code).info.name,
            version=services.dictionary_for(pack.code).info.version,
            entries=services.dictionary_for(pack.code).size,
            language=pack.code,
        )
        for pack in available_languages()
        if services.is_dictionary_loaded(pack.code)
    ]

    return HealthResponse(
        status="ready" if ready else "degraded",
        engine=EngineHealth(
            name=engine_info.name if engine_info else services.settings.engine,
            model_id=engine_info.model_id if engine_info else services.settings.model_id,
            ready=ready,
            voices=list(engine_info.voices) if engine_info else [],
            device=engine_info.device if engine_info else None,
            sample_rate=engine_info.sample_rate if engine_info else None,
            error=error,
        ),
        dictionary=DictionaryHealth(
            name=default_info.name,
            version=default_info.version,
            entries=default_info.entries,
            language=DEFAULT_LANGUAGE,
        ),
        dictionaries=loaded,
        languages=[pack.code for pack in available_languages()],
    )


@router.get("/languages", response_model=LanguagesResponse)
def languages(services: Services) -> LanguagesResponse:
    """List every bundled language with its voices and sample text."""
    installed = set(services.engine.list_voices()) if services.engine_status()[0] else set()
    return LanguagesResponse(
        languages=[
            LanguageOut(
                code=pack.code,
                display_name=pack.display_name,
                dictionary=pack.dictionary.name,
                notation=pack.notation.value,
                voices=[_voice_out(voice, installed) for voice in pack.voices],
                default_voice=pack.default_voice_id,
                sample_text=pack.sample_text,
            )
            for pack in available_languages()
        ],
        default_language=DEFAULT_LANGUAGE,
    )


@router.get("/voices", response_model=VoicesResponse)
def voices(
    services: Services, language: LanguageCode | None = Query(default=None)
) -> VoicesResponse:
    """List bundled voices, optionally only those that speak one language.

    A voice speaks exactly one language, so filtering by language is what the
    interface uses to keep the picker honest.
    """
    engine = services.engine
    installed = set(engine.list_voices())
    packs = [get_pack(language)] if language is not None else list(available_languages())
    return VoicesResponse(
        voices=[_voice_out(voice, installed) for pack in packs for voice in pack.voices]
    )


def _voice_out(voice: VoiceConfig, installed: set[str]) -> VoiceOut:
    """Describe one voice, noting whether its file is actually present."""
    return VoiceOut(
        id=voice.id,
        display_name=voice.display_name,
        language_code=voice.language_code,
        gender=voice.gender_label,
        default_speed=voice.default_speed,
        available=voice.id in installed,
    )
