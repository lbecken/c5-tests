"""Loader for the pinned CMUdict file.

The dictionary is read once at startup from the project's data directory. No
network access occurs here or anywhere else during normal operation; replacing
the dictionary is a deliberate maintenance action.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from reader_tts.domain.errors import DictionaryNotFoundError
from reader_tts.domain.models import DictionaryEntry, Pronunciation
from reader_tts.pronunciation.arpabet import is_valid_phoneme

#: ``word`` or ``word(2)`` at the start of a line.
_VARIANT: Final = re.compile(r"^(?P<word>.+?)(?:\((?P<variant>\d+)\))?$")

DICTIONARY_NAME: Final = "cmudict"


@dataclass(frozen=True, slots=True)
class LoadedDictionary:
    """The parsed dictionary along with the metadata describing it."""

    entries: dict[str, DictionaryEntry]
    version: str
    source_path: Path
    malformed_lines: tuple[str, ...]

    @property
    def size(self) -> int:
        """Number of distinct words."""
        return len(self.entries)


def load_dictionary(directory: Path, max_reported_malformed: int = 25) -> LoadedDictionary:
    """Load ``cmudict.dict`` from *directory*.

    Args:
        directory: Directory holding ``cmudict.dict`` and optionally ``VERSION``.
        max_reported_malformed: Cap on the number of malformed lines reported.

    Returns:
        The loaded dictionary, keyed by uppercase word.

    Raises:
        DictionaryNotFoundError: If the dictionary file is absent.
    """
    path = directory / "cmudict.dict"
    if not path.is_file():
        raise DictionaryNotFoundError(
            f"pronunciation dictionary not found at {path}; "
            "see data/cmudict/README or run 'reader-tts dictionary verify'"
        )

    variants: dict[str, list[tuple[int, tuple[str, ...]]]] = {}
    malformed: list[str] = []

    with path.open("r", encoding="utf-8", errors="strict") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.split("#", 1)[0].strip()
            if not line:
                continue
            head, _, tail = line.partition(" ")
            phonemes = tuple(tail.split())
            if not head or not phonemes:
                _record(malformed, line_number, raw_line, "missing word or phonemes")
                continue

            match = _VARIANT.match(head)
            if match is None:  # pragma: no cover - the pattern always matches
                _record(malformed, line_number, raw_line, "unparsable word field")
                continue
            word = match.group("word").upper()
            variant_group = match.group("variant")
            variant_index = int(variant_group) - 1 if variant_group else 0

            invalid = [symbol for symbol in phonemes if not is_valid_phoneme(symbol)]
            if invalid:
                _record(malformed, line_number, raw_line, f"invalid symbols: {' '.join(invalid)}")
                continue

            bucket = variants.setdefault(word, [])
            if any(existing_index == variant_index for existing_index, _ in bucket):
                _record(malformed, line_number, raw_line, "duplicate variant index")
                continue
            bucket.append((variant_index, phonemes))

    entries = {
        word: DictionaryEntry(
            normalized_word=word,
            pronunciations=tuple(
                Pronunciation(phonemes=phonemes, source=DICTIONARY_NAME, variant_index=position)
                for position, (_, phonemes) in enumerate(sorted(bucket, key=lambda item: item[0]))
            ),
        )
        for word, bucket in variants.items()
    }

    return LoadedDictionary(
        entries=entries,
        version=_read_version(directory),
        source_path=path,
        malformed_lines=tuple(malformed[:max_reported_malformed]),
    )


def _record(malformed: list[str], line_number: int, raw_line: str, reason: str) -> None:
    malformed.append(f"line {line_number}: {reason}: {raw_line.strip()[:80]}")


def _read_version(directory: Path) -> str:
    """Read the pinned dictionary revision, falling back to ``unknown``."""
    version_file = directory / "VERSION"
    if not version_file.is_file():
        return "unknown"
    for line in version_file.read_text(encoding="utf-8").splitlines():
        key, _, value = line.partition(":")
        if key.strip() == "revision" and value.strip():
            return value.strip()
    return "unknown"
