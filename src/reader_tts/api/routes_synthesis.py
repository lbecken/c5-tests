"""Synthesis job and export routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from reader_tts.api.dependencies import Services
from reader_tts.api.schemas import (
    CreateExportRequest,
    CreateJobRequest,
    ExportOut,
    JobResponse,
)
from reader_tts.domain.enums import ExportScope
from reader_tts.domain.errors import ValidationError

router = APIRouter(tags=["synthesis"])


@router.post(
    "/documents/{document_id}/synthesis-jobs",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_job(document_id: str, request: CreateJobRequest, services: Services) -> JobResponse:
    """Validate a document and start synthesizing it in the background.

    The model call runs on a worker thread, never on the event loop.
    """
    resolver = services.resolver(document_id)
    job = services.jobs.create(
        document_id=document_id,
        resolver=resolver,
        voice_id=request.voice_id,
        speed=request.speed,
        mode=request.validation_mode,
    )
    services.jobs.start_background(job.id, resolver)
    return JobResponse.from_job(job)


@router.get("/synthesis-jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str, services: Services) -> JobResponse:
    """Return a job's progress; poll this while synthesis runs."""
    job = services.job_repository.get(job_id)
    progress = services.jobs.progress(job_id)
    return JobResponse.from_progress(progress, job.voice_id, job.speed)


@router.post("/synthesis-jobs/{job_id}/cancel", response_model=JobResponse)
def cancel_job(job_id: str, services: Services) -> JobResponse:
    """Ask a running job to stop after its current unit."""
    job = services.jobs.cancel(job_id)
    return JobResponse.from_job(job)


@router.post(
    "/documents/{document_id}/exports",
    response_model=ExportOut,
    status_code=status.HTTP_201_CREATED,
)
def create_export(
    document_id: str, request: CreateExportRequest, services: Services
) -> ExportOut:
    """Render a sentence, a paragraph or the whole document to a WAV file."""
    if request.scope is ExportScope.SENTENCE:
        if not request.sentence_id:
            raise ValidationError("sentence_id is required for a sentence export")
        export = services.exports.export_sentence(
            request.sentence_id, request.voice_id, request.speed
        )
    elif request.scope is ExportScope.PARAGRAPH:
        if request.paragraph_index is None:
            raise ValidationError("paragraph_index is required for a paragraph export")
        export = services.exports.export_paragraph(
            document_id, request.paragraph_index, request.voice_id, request.speed
        )
    else:
        export = services.exports.export_document(document_id, request.voice_id, request.speed)
    return ExportOut.from_domain(export)


@router.get("/documents/{document_id}/exports", response_model=list[ExportOut])
def list_exports(document_id: str, services: Services) -> list[ExportOut]:
    """List every export of one document, newest first."""
    return [
        ExportOut.from_domain(export)
        for export in services.exports.list_for_document(document_id)
    ]


@router.get("/exports/{export_id}", response_model=ExportOut)
def get_export(export_id: str, services: Services) -> ExportOut:
    """Return one export's metadata."""
    return ExportOut.from_domain(services.exports.get(export_id))
