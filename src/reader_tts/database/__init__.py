"""SQLite persistence: connection handling and explicit migrations."""

from reader_tts.database.connection import Database
from reader_tts.database.migrations import LATEST_VERSION, current_version, initialize, migrate

__all__ = ["LATEST_VERSION", "Database", "current_version", "initialize", "migrate"]
