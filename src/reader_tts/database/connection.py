"""SQLite connection management.

One :class:`Database` instance owns one connection per thread. Route handlers
never touch this module directly; they go through a repository.
"""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from reader_tts.domain.errors import StorageError


class Database:
    """A thread-safe handle on the application's SQLite database."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._local = threading.local()
        self._write_lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)

    @property
    def path(self) -> Path:
        """Filesystem location of the database."""
        return self._path

    @property
    def connection(self) -> sqlite3.Connection:
        """The calling thread's connection, opened on first use."""
        existing: sqlite3.Connection | None = getattr(self._local, "connection", None)
        if existing is not None:
            return existing
        connection = sqlite3.connect(self._path, timeout=30.0, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.execute("PRAGMA busy_timeout = 30000")
        self._local.connection = connection
        return connection

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Run a block inside a single write transaction.

        Writes are serialized within the process so that concurrent job workers
        cannot interleave partial multi-statement updates.
        """
        with self._write_lock:
            connection = self.connection
            connection.execute("BEGIN IMMEDIATE")
            try:
                yield connection
            except Exception:
                if connection.in_transaction:
                    connection.execute("ROLLBACK")
                raise
            if connection.in_transaction:
                connection.execute("COMMIT")

    def query(self, sql: str, parameters: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        """Run a read query and return every row."""
        try:
            return self.connection.execute(sql, parameters).fetchall()
        except sqlite3.Error as error:  # pragma: no cover - defensive
            raise StorageError(f"query failed: {error}") from error

    def query_one(self, sql: str, parameters: tuple[Any, ...] = ()) -> sqlite3.Row | None:
        """Run a read query and return the first row, if any."""
        try:
            row: sqlite3.Row | None = self.connection.execute(sql, parameters).fetchone()
        except sqlite3.Error as error:  # pragma: no cover - defensive
            raise StorageError(f"query failed: {error}") from error
        return row

    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> None:
        """Run a single write statement in its own transaction."""
        with self.transaction() as connection:
            try:
                connection.execute(sql, parameters)
            except sqlite3.Error as error:
                raise StorageError(f"statement failed: {error}") from error

    def close(self) -> None:
        """Close the calling thread's connection, if it has one."""
        connection: sqlite3.Connection | None = getattr(self._local, "connection", None)
        if connection is not None:
            connection.close()
            self._local.connection = None
