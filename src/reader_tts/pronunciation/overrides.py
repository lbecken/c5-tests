"""Storage and validation of user-defined pronunciation overrides."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, datetime

from reader_tts.database.connection import Database
from reader_tts.domain.enums import OverrideScope
from reader_tts.domain.errors import ValidationError
from reader_tts.domain.models import PronunciationOverride
from reader_tts.pronunciation.arpabet import format_arpabet, parse_arpabet, validate_phonemes


class OverrideRepository:
    """Reads and writes ``pronunciation_overrides`` rows."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def upsert(
        self,
        word: str,
        phonemes: tuple[str, ...] | list[str],
        scope: OverrideScope = OverrideScope.GLOBAL,
        document_id: str | None = None,
        synthesis_text: str | None = None,
        note: str | None = None,
    ) -> PronunciationOverride:
        """Create or replace an override.

        Args:
            word: The word being overridden; stored uppercase.
            phonemes: ARPAbet symbols, validated against the inventory.
            scope: ``GLOBAL`` or ``DOCUMENT``.
            document_id: Required when *scope* is ``DOCUMENT``.
            synthesis_text: Optional respelling passed to the engine in place of
                the word. This is the practical pronunciation control in
                Version 1, because the engine keeps its own phonemizer.
            note: Free-form human-readable note.

        Raises:
            ValidationError: If the scope and document identifier disagree.
            InvalidPhonemeError: If a symbol is outside the ARPAbet inventory.
        """
        if scope is OverrideScope.DOCUMENT and not document_id:
            raise ValidationError("a document-scoped override requires a document id")
        if scope is OverrideScope.GLOBAL and document_id:
            raise ValidationError("a global override must not name a document")

        normalized_word = word.strip().upper()
        if not normalized_word:
            raise ValidationError("an override requires a word")
        validated = validate_phonemes(phonemes)
        cleaned_synthesis_text = (synthesis_text or "").strip() or None

        now = datetime.now(tz=UTC)
        existing = self.get(normalized_word, scope, document_id)

        if existing is not None:
            self._database.execute(
                """
                UPDATE pronunciation_overrides
                SET phonemes = ?, synthesis_text = ?, note = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    format_arpabet(validated),
                    cleaned_synthesis_text,
                    note,
                    now.isoformat(),
                    existing.id,
                ),
            )
        else:
            self._database.execute(
                """
                INSERT INTO pronunciation_overrides
                    (id, scope, document_id, word, phonemes, synthesis_text, note,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    scope.value,
                    document_id,
                    normalized_word,
                    format_arpabet(validated),
                    cleaned_synthesis_text,
                    note,
                    now.isoformat(),
                    now.isoformat(),
                ),
            )
        stored = self.get(normalized_word, scope, document_id)
        if stored is None:  # pragma: no cover - defensive
            raise ValidationError("override could not be stored")
        return stored

    def get(
        self,
        word: str,
        scope: OverrideScope,
        document_id: str | None = None,
    ) -> PronunciationOverride | None:
        """Return one override, or ``None`` when it does not exist."""
        row = self._database.query_one(
            """
            SELECT * FROM pronunciation_overrides
            WHERE word = ? AND scope = ? AND document_id IS ?
            """,
            (word.strip().upper(), scope.value, document_id),
        )
        return _to_override(row) if row is not None else None

    def delete(
        self,
        word: str,
        scope: OverrideScope,
        document_id: str | None = None,
    ) -> bool:
        """Delete one override, reporting whether a row was removed."""
        normalized_word = word.strip().upper()
        existed = self.get(normalized_word, scope, document_id) is not None
        if existed:
            self._database.execute(
                """
                DELETE FROM pronunciation_overrides
                WHERE word = ? AND scope = ? AND document_id IS ?
                """,
                (normalized_word, scope.value, document_id),
            )
        return existed

    def list_all(self, document_id: str | None = None) -> tuple[PronunciationOverride, ...]:
        """Return global overrides plus those scoped to *document_id*."""
        rows = self._database.query(
            """
            SELECT * FROM pronunciation_overrides
            WHERE scope = 'global' OR document_id IS ?
            ORDER BY word, scope
            """,
            (document_id,),
        )
        return tuple(_to_override(row) for row in rows)

    def revision(self, document_id: str | None = None) -> str:
        """Return a token that changes whenever a relevant override changes.

        The token participates in cache keys, so editing an override
        invalidates exactly the affected synthesis without touching unrelated
        cache entries.
        """
        row = self._database.query_one(
            """
            SELECT COUNT(*) AS total, COALESCE(MAX(updated_at), '') AS latest
            FROM pronunciation_overrides
            WHERE scope = 'global' OR document_id IS ?
            """,
            (document_id,),
        )
        if row is None:  # pragma: no cover - COUNT always returns a row
            return "0:"
        return f"{row['total']}:{row['latest']}"


def _to_override(row: sqlite3.Row) -> PronunciationOverride:
    return PronunciationOverride(
        id=row["id"],
        scope=OverrideScope(row["scope"]),
        document_id=row["document_id"],
        word=row["word"],
        phonemes=parse_arpabet(row["phonemes"]),
        synthesis_text=row["synthesis_text"],
        note=row["note"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )
