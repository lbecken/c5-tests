"""Audio delivery routes.

Only files registered in the database are served, and every path is re-checked
against its configured directory before the response is built.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from reader_tts.api.dependencies import Services
from reader_tts.api.schemas import RegenerateRequest, SentenceAudioOut
from reader_tts.domain.enums import OverrideScope, SentenceStatus
from reader_tts.domain.errors import NotFoundError, ValidationError
from reader_tts.languages.registry import resolve_voice

router = APIRouter(tags=["audio"])


@router.get("/sentences/{sentence_id}/audio")
def sentence_audio(sentence_id: str, services: Services) -> FileResponse:
    """Stream the audio of one sentence.

    A sentence split into several technical chunks is delivered as its first
    chunk here; the full sentence is available through a sentence export.
    """
    services.documents.sentence(sentence_id)
    records = services.job_repository.sentence_audio(sentence_id)
    usable = [r for r in records if r.status is SentenceStatus.COMPLETE and r.cache_key]
    if not usable:
        raise NotFoundError(f"sentence {sentence_id} has no generated audio yet")

    if len(usable) > 1:
        export = services.exports.export_sentence(
            sentence_id,
            _voice_of(services, usable[0].cache_key),
            _speed_of(services, usable[0].cache_key),
        )
        path = services.exports.file_path(export.id)
    else:
        path = _cached_path(services, usable[0].cache_key)

    return FileResponse(
        path,
        media_type="audio/wav",
        headers={"Cache-Control": "no-cache", "Accept-Ranges": "bytes"},
    )


@router.get("/sentences/{sentence_id}/status", response_model=list[SentenceAudioOut])
def sentence_status(sentence_id: str, services: Services) -> list[SentenceAudioOut]:
    """Return the synthesis state of every chunk of one sentence."""
    services.documents.sentence(sentence_id)
    return [
        SentenceAudioOut(
            sentence_id=record.sentence_id,
            chunk_index=record.chunk_index,
            cache_key=record.cache_key,
            status=record.status,
            error_message=record.error_message,
        )
        for record in services.job_repository.sentence_audio(sentence_id)
    ]


@router.post("/sentences/{sentence_id}/regenerate", response_model=list[SentenceAudioOut])
def regenerate_sentence(
    sentence_id: str, request: RegenerateRequest, services: Services
) -> list[SentenceAudioOut]:
    """Re-synthesize one sentence.

    The request may change the voice, the speed, the selected dictionary
    variant, or the synthesis spelling of one word, and may bypass the cache.
    """
    sentence = services.documents.sentence(sentence_id)
    document = services.documents.get(sentence.document_id)
    language = document.language
    resolver = services.resolver(sentence.document_id, language)

    if request.word and request.synthesis_text:
        entry = services.dictionary_for(language).lookup(request.word)
        phonemes = (
            list(entry.pronunciations[0].phonemes)
            if entry is not None
            else _phonemes_or_error(request.word)
        )
        services.overrides.for_notation(services.dictionary_for(language).notation).upsert(
            word=request.word,
            phonemes=phonemes,
            scope=OverrideScope.DOCUMENT,
            document_id=sentence.document_id,
            synthesis_text=request.synthesis_text,
            note="set from the reader",
        )
        resolver = services.resolver(sentence.document_id, language)
    elif request.word and request.variant_index is not None:
        entry = services.dictionary_for(language).lookup(request.word)
        if entry is None:
            raise ValidationError(f"'{request.word}' is not in the dictionary")
        if not 0 <= request.variant_index < len(entry.pronunciations):
            raise ValidationError(
                f"variant {request.variant_index} does not exist for '{request.word}'"
            )
        services.overrides.for_notation(services.dictionary_for(language).notation).upsert(
            word=request.word,
            phonemes=list(entry.pronunciations[request.variant_index].phonemes),
            scope=OverrideScope.DOCUMENT,
            document_id=sentence.document_id,
            note=f"dictionary variant {request.variant_index}",
        )
        resolver = services.resolver(sentence.document_id, language)

    latest = services.job_repository.latest_for_document(sentence.document_id)
    voice = resolve_voice(request.voice_id or (latest.voice_id if latest else None), language)
    speed = (
        request.speed
        if request.speed is not None
        else (latest.speed if latest else services.settings.default_speed)
    )

    records = services.jobs.regenerate_sentence(
        sentence_id=sentence_id,
        resolver=resolver,
        voice_id=voice,
        speed=speed,
        bypass_cache=request.bypass_cache,
    )
    return [
        SentenceAudioOut(
            sentence_id=record.sentence_id,
            chunk_index=record.chunk_index,
            cache_key=record.cache_key,
            status=record.status,
            error_message=record.error_message,
        )
        for record in records
    ]


@router.get("/exports/{export_id}/file")
def export_file(export_id: str, services: Services) -> FileResponse:
    """Download a completed export."""
    export = services.exports.get(export_id)
    path = services.exports.file_path(export_id)
    return FileResponse(
        path,
        media_type="audio/wav",
        filename=export.filename or f"{export_id}.wav",
        headers={"Accept-Ranges": "bytes"},
    )


def _cached_path(services: Services, cache_key: str | None) -> Path:
    entry = services.cache_repository.get(cache_key or "")
    if entry is None:
        raise NotFoundError("the cached audio for this sentence is no longer available")
    path = Path(entry.audio_path).resolve()
    if not path.is_relative_to(services.file_store.root) or not path.is_file():
        raise NotFoundError("the cached audio for this sentence is no longer available")
    return path


def _voice_of(services: Services, cache_key: str | None) -> str:
    entry = services.cache_repository.get(cache_key or "")
    return entry.voice_id if entry else services.settings.default_voice


def _speed_of(services: Services, cache_key: str | None) -> float:
    entry = services.cache_repository.get(cache_key or "")
    return entry.speed if entry else services.settings.default_speed


def _phonemes_or_error(word: str) -> list[str]:
    raise ValidationError(
        f"'{word}' is not in the dictionary, so an ARPAbet pronunciation must be "
        "supplied through the override endpoint before it can be respelled"
    )
