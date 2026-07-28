"""Explicit SQL migrations.

Migrations are numbered and applied in order. The applied version is tracked in
SQLite's ``user_version`` pragma, so an empty runtime directory initializes
itself on first use.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Final

from reader_tts.database.connection import Database
from reader_tts.domain.errors import StorageError

_SCHEMA_DIR: Final = Path(__file__).parent

#: ``(version, filename)`` pairs applied in ascending order.
MIGRATIONS: Final[tuple[tuple[int, str], ...]] = ((1, "schema.sql"),)

LATEST_VERSION: Final = MIGRATIONS[-1][0]


def current_version(database: Database) -> int:
    """Return the schema version currently applied to *database*."""
    row = database.query_one("PRAGMA user_version")
    return int(row[0]) if row is not None else 0


def migrate(database: Database) -> int:
    """Apply every pending migration and return the resulting version."""
    version = current_version(database)
    for target, filename in MIGRATIONS:
        if target <= version:
            continue
        statements = (_SCHEMA_DIR / filename).read_text(encoding="utf-8")
        connection = database.connection
        try:
            # executescript manages its own transaction, so the script is
            # wrapped explicitly rather than nested inside Database.transaction.
            connection.executescript(f"BEGIN;\n{statements}\nCOMMIT;")
            connection.execute(f"PRAGMA user_version = {target}")
        except sqlite3.Error as error:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise StorageError(f"migration {target} failed: {error}") from error
        version = target
    return version


def initialize(path: Path) -> Database:
    """Open the database at *path*, applying migrations as needed."""
    database = Database(path)
    migrate(database)
    return database
