"""Health and voice listing routes."""

from __future__ import annotations

from fastapi import APIRouter

from reader_tts.api.dependencies import Services
from reader_tts.api.schemas import (
    DictionaryHealth,
    EngineHealth,
    HealthResponse,
    VoiceOut,
    VoicesResponse,
)

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(services: Services) -> HealthResponse:
    """Report engine readiness and dictionary provenance.

    The route never fails because the model is missing: it reports the problem
    so the interface can explain it to the user.
    """
    dictionary_info = services.dictionary.info
    ready, error = services.engine_status()
    engine_info = services.engine.info if ready else None

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
            name=dictionary_info.name,
            version=dictionary_info.version,
            entries=dictionary_info.entries,
        ),
    )


@router.get("/voices", response_model=VoicesResponse)
def voices(services: Services) -> VoicesResponse:
    """List the bundled voices and the supported speed range."""
    engine = services.engine
    configs = [engine.voice_config(voice_id) for voice_id in engine.list_voices()]
    return VoicesResponse(
        voices=[
            VoiceOut(
                id=config.id,
                display_name=config.display_name,
                language_code=config.language_code,
                gender=config.gender_label,
                default_speed=config.default_speed,
            )
            for config in configs
        ]
    )
