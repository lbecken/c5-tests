"""Document creation, retrieval, validation and reading-state routes."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Query, status

from reader_tts.api.dependencies import Services
from reader_tts.api.schemas import (
    CreateDocumentRequest,
    DocumentResponse,
    DocumentSummary,
    ReadingState,
    ValidateDocumentRequest,
    ValidationResponse,
)
from reader_tts.domain.enums import SentenceStatus

router = APIRouter(tags=["documents"])

_READING_STATE_KEY = "reading_state"


@router.post("/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(request: CreateDocumentRequest, services: Services) -> DocumentResponse:
    """Store text as a document and segment it into sentences."""
    document = services.documents.create(request.text, title=request.title)
    sentences = services.documents.sentences(document.id)
    return DocumentResponse.from_domain(document, sentences)


@router.get("/documents", response_model=list[DocumentSummary])
def list_documents(
    services: Services, limit: int = Query(default=50, ge=1, le=200)
) -> list[DocumentSummary]:
    """List recent documents, newest first."""
    return [
        DocumentSummary(
            id=document.id,
            title=document.title,
            created_at=document.created_at.isoformat(),
            characters=len(document.original_text),
        )
        for document in services.documents.list_documents(limit)
    ]


@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: str, services: Services) -> DocumentResponse:
    """Return a document, its sentences and each sentence's synthesis state."""
    document = services.documents.get(document_id)
    sentences = services.documents.sentences(document_id)
    audio = services.job_repository.document_audio(document_id)
    statuses = {
        sentence_id: _combine(records) for sentence_id, records in audio.items()
    }
    return DocumentResponse.from_domain(document, sentences, statuses)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, services: Services) -> None:
    """Delete a document and everything derived from it."""
    services.documents.delete(document_id)


@router.post("/documents/{document_id}/validate", response_model=ValidationResponse)
def validate_document(
    document_id: str, request: ValidateDocumentRequest, services: Services
) -> ValidationResponse:
    """Validate a stored document."""
    result = services.documents.analyze(
        document_id, services.resolver(document_id), mode=request.mode
    )
    return ValidationResponse.from_domain(result.report, result.sentences)


@router.get("/reading-state", response_model=ReadingState)
def get_reading_state(services: Services) -> ReadingState:
    """Return the stored reading position, so a reload resumes where it stopped."""
    row = services.database.query_one(
        "SELECT value FROM application_state WHERE key = ?", (_READING_STATE_KEY,)
    )
    if row is None:
        return ReadingState(voice_id=services.settings.default_voice)
    return ReadingState.model_validate(json.loads(row["value"]))


@router.put("/reading-state", response_model=ReadingState)
def put_reading_state(state: ReadingState, services: Services) -> ReadingState:
    """Persist the reading position."""
    services.database.execute(
        """
        INSERT INTO application_state (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (_READING_STATE_KEY, state.model_dump_json(), datetime.now(tz=UTC).isoformat()),
    )
    return state


def _combine(records: tuple[object, ...]) -> SentenceStatus:
    """Reduce a sentence's chunk states to one status for the reader."""
    statuses = [getattr(record, "status", SentenceStatus.PENDING) for record in records]
    if not statuses:
        return SentenceStatus.PENDING
    if any(s is SentenceStatus.FAILED for s in statuses):
        return SentenceStatus.FAILED
    if all(s is SentenceStatus.COMPLETE for s in statuses):
        return SentenceStatus.COMPLETE
    if any(s is SentenceStatus.SYNTHESIZING for s in statuses):
        return SentenceStatus.SYNTHESIZING
    return SentenceStatus.PENDING
