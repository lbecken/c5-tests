"""Shared fixtures.

Tests never reach the network and, unless marked ``real_tts``, never load the
neural model: synthesis goes through :class:`FakeSpeechEngine`.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from reader_tts.database.connection import Database
from reader_tts.database.migrations import initialize
from reader_tts.pronunciation.cmudict_loader import LoadedDictionary
from reader_tts.pronunciation.dictionary import PronunciationDictionary
from reader_tts.pronunciation.overrides import OverrideRepository
from reader_tts.pronunciation.resolver import PronunciationResolver

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CMUDICT_DIR = PROJECT_ROOT / "data" / "cmudict"

#: A compact dictionary used by unit tests that do not need full coverage.
SAMPLE_DICTIONARY_TEXT = """\
# a small excerpt
the DH AH0
the(2) DH IY0
cat K AE1 T
sat S AE1 T
on AA1 N
mat M AE1 T
read R IY1 D
read(2) R EH1 D
record R AH0 K AO1 R D
record(2) R EH1 K ER0 D
wind W IH1 N D
wind(2) W AY1 N D
don't D OW1 N T
mother M AH1 DH ER0
in IH0 N
law L AO1
mother-in-law M AH1 DH ER0 IH0 N L AO2
please P L IY1 Z
the-end DH AH0 EH1 N D
"""


@pytest.fixture(scope="session")
def cmudict() -> PronunciationDictionary:
    """The full pinned CMUdict, loaded once per session."""
    return PronunciationDictionary.from_directory(CMUDICT_DIR)


@pytest.fixture
def sample_dictionary(tmp_path: Path) -> PronunciationDictionary:
    """A small dictionary written to a temporary directory."""
    directory = tmp_path / "dict"
    directory.mkdir()
    (directory / "cmudict.dict").write_text(SAMPLE_DICTIONARY_TEXT, encoding="utf-8")
    (directory / "VERSION").write_text("revision: test-sample\n", encoding="utf-8")
    return PronunciationDictionary.from_directory(directory)


@pytest.fixture
def database(tmp_path: Path) -> Iterator[Database]:
    """A migrated, empty database."""
    db = initialize(tmp_path / "reader_tts.sqlite3")
    yield db
    db.close()


@pytest.fixture
def overrides(database: Database) -> OverrideRepository:
    """An override repository backed by the temporary database."""
    return OverrideRepository(database)


@pytest.fixture
def resolver(
    sample_dictionary: PronunciationDictionary, overrides: OverrideRepository
) -> PronunciationResolver:
    """A resolver over the small dictionary with override support."""
    return PronunciationResolver(sample_dictionary, overrides)


@pytest.fixture
def empty_dictionary(tmp_path: Path) -> PronunciationDictionary:
    """A dictionary with no entries at all."""
    return PronunciationDictionary(
        LoadedDictionary(
            entries={}, version="empty", source_path=tmp_path / "none", malformed_lines=()
        )
    )
