"""FastAPI dependency wiring.

The API is a thin adapter over :class:`~reader_tts.container.AppServices`. Route
handlers receive services, never repositories or the engine directly, and no
handler touches SQLite or the model itself.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from reader_tts.config.settings import Settings
from reader_tts.container import AppServices


def get_services(request: Request) -> AppServices:
    """Return the container stored on the application at startup."""
    services: AppServices = request.app.state.services
    return services


def get_settings_dependency(
    services: Annotated[AppServices, Depends(get_services)],
) -> Settings:
    """Return the validated settings."""
    return services.settings


Services = Annotated[AppServices, Depends(get_services)]
AppSettings = Annotated[Settings, Depends(get_settings_dependency)]
