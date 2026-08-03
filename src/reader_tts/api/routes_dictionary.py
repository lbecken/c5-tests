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
from reader_tts.domain.enums import LanguageCode, OverrideScope
from reader_tts.pronunciation.phonemes import inventory_for
from reader_tts.text.characters import canonicalize_source
from reader_tts.text.validator import analyze

router = APIRouter(tags=["dictionary"])


@router.post("/validate", response_model=ValidationResponse)
def validate_text(request: ValidateRequest, services: Services) -> ValidationResponse:
    """Validate arbitrary text without storing it."""
    pack = services.pack(request.language)
    result = analyze(
        canonicalize_source(request.text),
        services.resolver(language=request.language),
        mode=request.mode,
        hard_max_chars=services.settings.hard_max_chars,
        policy=pack.character_policy,
    )
    return ValidationResponse.from_domain(result.report, result.sentences)


@router.get("/dictionary/{word}", response_model=DictionaryResponse)
def lookup(
    word: str,
    services: Services,
    language: LanguageCode = Query(default=LanguageCode.EN_US),
) -> DictionaryResponse:
    """Return every pronunciation the language's dictionary holds for *word*.

    The notation is reported alongside the pronunciations, because English
    answers in ARPAbet and French in IPA.
    """
    normalized = word.strip().upper()
    dictionary = services.dictionary_for(language)
    inventory = inventory_for(dictionary.notation)
    overrides = services.overrides.for_notation(dictionary.notation)
    override = overrides.get(normalized, OverrideScope.GLOBAL)
    override_text = inventory.format(override.phonemes) if override else None

    entry = dictionary.lookup(normalized)
    if entry is not None:
        return DictionaryResponse(
            word=normalized,
            supported=True,
            language=language,
            notation=dictionary.notation.value,
            pronunciations=[
                PronunciationOut(variant=p.variant_index, arpabet=inventory.format(p.phonemes))
                for p in entry.pronunciations
            ],
            override=override_text,
        )

    compound = dictionary.resolve_compound(normalized)
    if compound is not None:
        return DictionaryResponse(
            word=normalized,
            supported=True,
            language=language,
            notation=dictionary.notation.value,
            compound=True,
            components=list(compound.components),
            pronunciations=[
                PronunciationOut(variant=0, arpabet=inventory.format(compound.phonemes))
            ],
            override=override_text,
        )

    return DictionaryResponse(
        word=normalized,
        supported=override is not None,
        language=language,
        notation=dictionary.notation.value,
        override=override_text,
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
    notation = services.dictionary_for(request.language).notation
    override = services.overrides.for_notation(notation).upsert(
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
    word: str,
    services: Services,
    document_id: str | None = Query(default=None),
    language: LanguageCode = Query(default=LanguageCode.EN_US),
) -> dict[str, bool | str]:
    """Delete a pronunciation override."""
    scope = OverrideScope.DOCUMENT if document_id else OverrideScope.GLOBAL
    notation = services.dictionary_for(language).notation
    deleted = services.overrides.for_notation(notation).delete(word, scope, document_id)
    return {"word": word.strip().upper(), "deleted": deleted}
