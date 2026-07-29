"""Dictionary lookup, ad-hoc validation and pronunciation override routes."""

from __future__ import annotations

from fastapi import APIRouter, Query

from reader_tts.api.dependencies import Services
from reader_tts.api.schemas import (
    DictionaryResponse,
    OverrideOut,
    OverrideRequest,
    OverridesResponse,
    PronunciationOut,
    ValidateRequest,
    ValidationResponse,
)
from reader_tts.domain.enums import OverrideScope
from reader_tts.pronunciation.arpabet import format_arpabet
from reader_tts.text.characters import canonicalize_source
from reader_tts.text.validator import analyze

router = APIRouter(tags=["dictionary"])


@router.post("/validate", response_model=ValidationResponse)
def validate_text(request: ValidateRequest, services: Services) -> ValidationResponse:
    """Validate arbitrary text without storing it."""
    result = analyze(
        canonicalize_source(request.text),
        services.resolver(),
        mode=request.mode,
        hard_max_chars=services.settings.hard_max_chars,
    )
    return ValidationResponse.from_domain(result.report, result.sentences)


@router.get("/dictionary/{word}", response_model=DictionaryResponse)
def lookup(word: str, services: Services) -> DictionaryResponse:
    """Return every pronunciation the dictionary holds for *word*."""
    normalized = word.strip().upper()
    dictionary = services.dictionary
    entry = dictionary.lookup(normalized)
    override = services.overrides.get(normalized, OverrideScope.GLOBAL)

    if entry is not None:
        return DictionaryResponse(
            word=normalized,
            supported=True,
            pronunciations=[
                PronunciationOut(variant=p.variant_index, arpabet=p.arpabet)
                for p in entry.pronunciations
            ],
            override=format_arpabet(override.phonemes) if override else None,
        )

    compound = dictionary.resolve_compound(normalized)
    if compound is not None:
        return DictionaryResponse(
            word=normalized,
            supported=True,
            compound=True,
            components=list(compound.components),
            pronunciations=[PronunciationOut(variant=0, arpabet=format_arpabet(compound.phonemes))],
            override=format_arpabet(override.phonemes) if override else None,
        )

    return DictionaryResponse(
        word=normalized,
        supported=override is not None,
        override=format_arpabet(override.phonemes) if override else None,
    )


@router.get("/pronunciation-overrides", response_model=OverridesResponse)
def list_overrides(
    services: Services, document_id: str | None = Query(default=None)
) -> OverridesResponse:
    """List global overrides plus those scoped to *document_id*."""
    return OverridesResponse(
        overrides=[
            OverrideOut.from_domain(override)
            for override in services.overrides.list_all(document_id)
        ]
    )


@router.put("/pronunciation-overrides/{word}", response_model=OverrideOut)
def put_override(word: str, request: OverrideRequest, services: Services) -> OverrideOut:
    """Create or replace a pronunciation override.

    A ``document_id`` scopes the override to one document; without it the
    override applies globally.
    """
    scope = OverrideScope.DOCUMENT if request.document_id else OverrideScope.GLOBAL
    override = services.overrides.upsert(
        word=word,
        phonemes=request.phonemes,
        scope=scope,
        document_id=request.document_id,
        synthesis_text=request.synthesis_text,
        note=request.note,
    )
    return OverrideOut.from_domain(override)


@router.delete("/pronunciation-overrides/{word}")
def delete_override(
    word: str, services: Services, document_id: str | None = Query(default=None)
) -> dict[str, bool | str]:
    """Delete a pronunciation override."""
    scope = OverrideScope.DOCUMENT if document_id else OverrideScope.GLOBAL
    deleted = services.overrides.delete(word, scope, document_id)
    return {"word": word.strip().upper(), "deleted": deleted}
