"""Storage and validation of user-defined pronunciation overrides."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, datetime

from reader_tts.database.connection import Database
from reader_tts.domain.enums import OverrideScope, PhonemeNotation
from reader_tts.domain.errors import ValidationError
from reader_tts.domain.models import PronunciationOverride
from reader_tts.pronunciation.phonemes import inventory_for


class OverrideRepository:
    """Reads and writes ``pronunciation_overrides`` rows."""

    def __init__(
        self,
        database: Database,
        notation: PhonemeNotation = PhonemeNotation.ARPABET,
    ) -> None:
        self._database = database
        self._notation = notation
        self._inventory = inventory_for(notation)

    @property
    def notation(self) -> PhonemeNotation:
        """The notation this repository validates and formats pronunciations in."""
        return self._notation

    def for_notation(self, notation: PhonemeNotation) -> OverrideRepository:
        """Return a repository that reads and writes *notation*."""
        if notation is self._notation:
            return self
        return OverrideRepository(self._database, notation)

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
            phonemes: Phoneme symbols in this repository's notation — ARPAbet
                for English, IPA for French — validated against its inventory.
            scope: ``GLOBAL`` or ``DOCUMENT``.
            document_id: Required when *scope* is ``DOCUMENT``.
            synthesis_text: Optional respelling passed to the engine in place of
                the word. This is the practical pronunciation control, because
                the engine keeps its own phonemizer.
            note: Free-form human-readable note.

        Raises:
            ValidationError: If the scope and document identifier disagree.
            InvalidPhonemeError: If a symbol is outside the language's inventory.
        """
        if scope is OverrideScope.DOCUMENT and not document_id:
            raise ValidationError("a document-scoped override requires a document id")
        if scope is OverrideScope.GLOBAL and document_id:
            raise ValidationError("a global override must not name a document")

        normalized_word = word.strip().upper()
        if not normalized_word:
            raise ValidationError("an override requires a word")
        validated = self._inventory.validate(phonemes)
        cleaned_synthesis_text = (synthesis_text or "").strip() or None

        now = datetime.now(tz=UTC)
        existing = self.get(normalized_word, scope, document_id)

        if existing is not None:
            self._database.execute(
                """
                UPDATE pronunciation_overrides
                SET phonemes = ?, synthesis_text = ?, note = ?, notation = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    self._inventory.format(validated),
                    cleaned_synthesis_text,
                    note,
                    self._notation.value,
                    now.isoformat(),
                    existing.id,
                ),
            )
        else:
            self._database.execute(
                """
                INSERT INTO pronunciation_overrides
                    (id, scope, document_id, word, phonemes, synthesis_text, note,
                     notation, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    scope.value,
                    document_id,
                    normalized_word,
                    self._inventory.format(validated),
                    cleaned_synthesis_text,
                    note,
                    self._notation.value,
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
    # `in` on a sqlite3.Row tests values, not column names, so the column list
    # is taken explicitly. Rows written before migration 2 have no notation.
    columns = set(row.keys())
    notation = PhonemeNotation(row["notation"] if "notation" in columns else "arpabet")
    return PronunciationOverride(
        id=row["id"],
        scope=OverrideScope(row["scope"]),
        document_id=row["document_id"],
        word=row["word"],
        phonemes=inventory_for(notation).parse(row["phonemes"]),
        synthesis_text=row["synthesis_text"],
        note=row["note"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )
