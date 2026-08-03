"""Loader for the pinned ipa-dict French dictionary.

The file format is one entry per line::

    mot	/mo/
    plus	/ply/, /plys/

Multi-word phrases appear in the source file and are skipped: the reader looks
words up one at a time, so a phrase entry could never match.

Like the CMUdict loader, this reads a pinned file from the project's data
directory and never touches the network.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final

from reader_tts.domain.errors import DictionaryNotFoundError
from reader_tts.domain.models import DictionaryEntry, Pronunciation
from reader_tts.pronunciation.cmudict_loader import LoadedDictionary
from reader_tts.pronunciation.ipa import is_valid_phoneme, segment

DICTIONARY_NAME: Final = "ipa-dict-fr"


def load_dictionary(
    directory: Path,
    filename: str = "fr_FR.txt",
    max_reported_malformed: int = 25,
) -> LoadedDictionary:
    """Load the French dictionary from *directory*.

    Args:
        directory: Directory holding the dictionary file and optionally VERSION.
        filename: Name of the dictionary file.
        max_reported_malformed: Cap on the number of malformed lines reported.

    Returns:
        The loaded dictionary, keyed by uppercase word.

    Raises:
        DictionaryNotFoundError: If the dictionary file is absent.
    """
    path = directory / filename
    if not path.is_file():
        raise DictionaryNotFoundError(
            f"French pronunciation dictionary not found at {path}; "
            "see data/ipadict-fr or run 'reader-tts dictionary verify'"
        )

    entries: dict[str, DictionaryEntry] = {}
    malformed: list[str] = []

    with path.open("r", encoding="utf-8", errors="strict") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            word, separator, transcriptions = line.partition("\t")
            if not separator:
                _record(malformed, line_number, raw_line, "missing tab separator")
                continue

            word = word.strip()
            if not word:
                _record(malformed, line_number, raw_line, "missing word")
                continue
            # Phrase entries cannot be matched by single-word lookup.
            if " " in word:
                continue

            variants: list[Pronunciation] = []
            for raw_variant in transcriptions.split(","):
                units = segment(raw_variant.strip().strip("/"))
                if not units:
                    continue
                invalid = [unit for unit in units if not is_valid_phoneme(unit)]
                if invalid:
                    _record(
                        malformed,
                        line_number,
                        raw_line,
                        f"invalid symbols: {' '.join(invalid)}",
                    )
                    continue
                variants.append(
                    Pronunciation(
                        phonemes=units, source=DICTIONARY_NAME, variant_index=len(variants)
                    )
                )

            if not variants:
                _record(malformed, line_number, raw_line, "no usable pronunciation")
                continue

            key = word.upper()
            if key in entries:
                # The source file lists some words twice, differing only in case
                # (for example 'a' and 'A'). Keep the first and note the rest.
                continue
            entries[key] = DictionaryEntry(normalized_word=key, pronunciations=tuple(variants))

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
