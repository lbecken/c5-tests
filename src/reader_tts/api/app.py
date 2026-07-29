"""The local FastAPI application.

The server binds to the loopback interface by default and serves a single
static page. Application exceptions are mapped to stable status codes and a
uniform payload; a raw stack trace is never returned.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Final

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from reader_tts import __version__
from reader_tts.api import (
    routes_audio,
    routes_dictionary,
    routes_documents,
    routes_health,
    routes_synthesis,
)
from reader_tts.config.settings import Settings, get_settings
from reader_tts.container import AppServices
from reader_tts.domain.errors import (
    ConflictError,
    DictionaryError,
    ModelNotReadyError,
    NotFoundError,
    ReaderTTSError,
    SpeechEngineError,
    StorageError,
    ValidationError,
)

_LOGGER: Final = logging.getLogger(__name__)

API_PREFIX: Final = "/api/v1"
STATIC_DIR: Final = Path(__file__).parent.parent / "static"

#: Application exception to HTTP status. Everything else becomes a 500 with a
#: generic message, so internal details never reach the client.
_STATUS_MAP: Final[tuple[tuple[type[ReaderTTSError], int], ...]] = (
    (NotFoundError, 404),
    (ConflictError, 409),
    (ValidationError, 422),
    (ModelNotReadyError, 503),
    (SpeechEngineError, 502),
    (DictionaryError, 503),
    (StorageError, 500),
)


def create_app(settings: Settings | None = None, services: AppServices | None = None) -> FastAPI:
    """Build the application.

    Args:
        settings: Overrides the environment-derived settings.
        services: An already-built container, used by tests.
    """
    resolved = settings or (services.settings if services else get_settings())

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        container = services or AppServices(resolved)
        app.state.services = container
        logging.getLogger().setLevel(resolved.log_level)
        _LOGGER.info(
            "application_started",
            extra={"engine": resolved.engine, "host": resolved.host, "port": resolved.port},
        )
        try:
            yield
        finally:
            if services is None:
                container.close()

    app = FastAPI(
        title="reader-tts",
        version=__version__,
        summary="Dictionary-controlled offline English text-to-speech reader",
        lifespan=lifespan,
    )

    app.middleware("http")(_limit_request_size(resolved.max_request_bytes))

    for router in (
        routes_health.router,
        routes_dictionary.router,
        routes_documents.router,
        routes_synthesis.router,
        routes_audio.router,
    ):
        app.include_router(router, prefix=API_PREFIX)

    _register_error_handlers(app)

    if STATIC_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

        @app.get("/", include_in_schema=False)
        def index() -> FileResponse:
            """Serve the reader interface."""
            return FileResponse(STATIC_DIR / "index.html")

    return app


def _limit_request_size(
    max_bytes: int,
) -> Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]:
    """Reject oversized request bodies before they are parsed."""

    async def middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        declared = request.headers.get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > max_bytes:
            return JSONResponse(
                status_code=413,
                content={
                    "error": f"the request body exceeds the {max_bytes} byte limit",
                    "code": "request_too_large",
                },
            )
        return await call_next(request)

    return middleware


def _register_error_handlers(app: FastAPI) -> None:
    """Map application exceptions to stable responses."""

    @app.exception_handler(ReaderTTSError)
    async def handle_application_error(request: Request, exc: ReaderTTSError) -> JSONResponse:
        status_code = 500
        for error_type, mapped in _STATUS_MAP:
            if isinstance(exc, error_type):
                status_code = mapped
                break

        code = _snake_case(type(exc).__name__)
        if status_code >= 500:
            _LOGGER.warning(
                "request_failed",
                extra={
                    "path": request.url.path,
                    "exception": type(exc).__name__,
                    "status": status_code,
                },
            )
        return JSONResponse(status_code=status_code, content={"error": str(exc), "code": code})

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # The message is deliberately generic: the detail goes to the log, not
        # to the client.
        _LOGGER.exception(
            "unhandled_error",
            extra={"path": request.url.path, "exception": type(exc).__name__},
        )
        return JSONResponse(
            status_code=500,
            content={"error": "an internal error occurred", "code": "internal_error"},
        )


def _snake_case(name: str) -> str:
    """Turn ``DocumentNotFoundError`` into ``document_not_found``."""
    trimmed = name.removesuffix("Error")
    result: list[str] = []
    for index, char in enumerate(trimmed):
        if char.isupper() and index:
            result.append("_")
        result.append(char.lower())
    return "".join(result) or "error"


app = create_app()
