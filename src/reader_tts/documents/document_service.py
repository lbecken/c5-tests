"""Document creation, retrieval and validation.

Creating a document stores its text and its segmentation in one transaction, so
a document never exists without its sentences.
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from datetime import UTC, datetime
from typing import Final

from reader_tts.cache.keys import hash_text
from reader_tts.database.connection import Database
from reader_tts.domain.enums import ValidationMode
from reader_tts.domain.errors import (
    DocumentNotFoundError,
    DocumentTooLargeError,
    SentenceNotFoundError,
)
from reader_tts.domain.models import (
    Document,
    Sentence,
    TextSpan,
    ValidationReport,
)
from reader_tts.text.characters import canonicalize_source
from reader_tts.text.validator import AnalyzedText, WordResolver, analyze

_LOGGER: Final = logging.getLogger(__name__)

DEFAULT_TITLE: Final = "Untitled document"


class DocumentService:
    """Stores documents and their sentence segmentation."""

    def __init__(self, database: Database, max_characters: int) -> None:
        self._database = database
        self._max_characters = max_characters

    # --- Creation ----------------------------------------------------------------

    def create(self, text: str, title: str | None = None) -> Document:
        """Store *text* as a new document together with its sentences.

        Raises:
            DocumentTooLargeError: If the text exceeds the configured limit.
        """
        canonical = canonicalize_source(text)
        if len(canonical) > self._max_characters:
            raise DocumentTooLargeError(
                f"the document is {len(canonical)} characters, which exceeds the "
                f"limit of {self._max_characters}"
            )
        if not canonical.strip():
            raise DocumentTooLargeError("the document is empty")

        document = Document(
            id=str(uuid.uuid4()),
            title=(title or "").strip() or DEFAULT_TITLE,
            original_text=canonical,
            text_hash=hash_text(canonical),
            created_at=datetime.now(tz=UTC),
        )
        sentences = self._segment(document)

        with self._database.transaction() as connection:
            connection.execute(
                """
                INSERT INTO documents (id, title, original_text, text_hash, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    document.id,
                    document.title,
                    document.original_text,
                    document.text_hash,
                    document.created_at.isoformat(),
                ),
            )
            connection.executemany(
                """
                INSERT INTO sentences
                    (id, document_id, sentence_index, paragraph_index, text,
                     span_start, span_end, terminal_punctuation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        sentence.id,
                        sentence.document_id,
                        sentence.index,
                        sentence.paragraph_index,
                        sentence.text,
                        sentence.span.start,
                        sentence.span.end,
                        sentence.terminal_punctuation,
                    )
                    for sentence in sentences
                ],
            )

        _LOGGER.info(
            "document_created",
            extra={
                "document_id": document.id,
                "characters": len(canonical),
                "sentences": len(sentences),
            },
        )
        return document

    def _segment(self, document: Document) -> tuple[Sentence, ...]:
        from reader_tts.text.sentences import split_sentences

        return tuple(
            Sentence(
                id=str(uuid.uuid4()),
                document_id=document.id,
                index=sentence.index,
                paragraph_index=sentence.paragraph_index,
                text=sentence.text,
                span=sentence.span,
                terminal_punctuation=sentence.terminal_punctuation,
            )
            for sentence in split_sentences(document.original_text, document_id=document.id)
        )

    # --- Retrieval ------------------------------------------------------------------

    def get(self, document_id: str) -> Document:
        """Return one document.

        Raises:
            DocumentNotFoundError: If no such document exists.
        """
        row = self._database.query_one("SELECT * FROM documents WHERE id = ?", (document_id,))
        if row is None:
            raise DocumentNotFoundError(f"no document with id {document_id}")
        return _to_document(row)

    def list_documents(self, limit: int = 50) -> tuple[Document, ...]:
        """Return recent documents, newest first."""
        rows = self._database.query(
            "SELECT * FROM documents ORDER BY created_at DESC LIMIT ?", (limit,)
        )
        return tuple(_to_document(row) for row in rows)

    def sentences(self, document_id: str) -> tuple[Sentence, ...]:
        """Return every sentence of a document in order."""
        rows = self._database.query(
            "SELECT * FROM sentences WHERE document_id = ? ORDER BY sentence_index",
            (document_id,),
        )
        return tuple(_to_sentence(row) for row in rows)

    def sentence(self, sentence_id: str) -> Sentence:
        """Return one sentence.

        Raises:
            SentenceNotFoundError: If no such sentence exists.
        """
        row = self._database.query_one("SELECT * FROM sentences WHERE id = ?", (sentence_id,))
        if row is None:
            raise SentenceNotFoundError(f"no sentence with id {sentence_id}")
        return _to_sentence(row)

    def delete(self, document_id: str) -> None:
        """Delete a document and, by cascade, its sentences and jobs."""
        self.get(document_id)
        self._database.execute("DELETE FROM documents WHERE id = ?", (document_id,))

    # --- Validation --------------------------------------------------------------------

    def validate(
        self,
        document_id: str,
        resolver: WordResolver,
        mode: ValidationMode = ValidationMode.PRACTICAL,
    ) -> ValidationReport:
        """Validate a stored document."""
        return self.analyze(document_id, resolver, mode).report

    def analyze(
        self,
        document_id: str,
        resolver: WordResolver,
        mode: ValidationMode = ValidationMode.PRACTICAL,
    ) -> AnalyzedText:
        """Validate a stored document and return its full analysis."""
        document = self.get(document_id)
        return analyze(document.original_text, resolver, mode=mode, document_id=document_id)


def _to_document(row: sqlite3.Row) -> Document:
    return Document(
        id=row["id"],
        title=row["title"],
        original_text=row["original_text"],
        text_hash=row["text_hash"],
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def _to_sentence(row: sqlite3.Row) -> Sentence:
    return Sentence(
        id=row["id"],
        document_id=row["document_id"],
        index=int(row["sentence_index"]),
        paragraph_index=int(row["paragraph_index"]),
        text=row["text"],
        span=TextSpan(int(row["span_start"]), int(row["span_end"])),
        terminal_punctuation=row["terminal_punctuation"],
    )
