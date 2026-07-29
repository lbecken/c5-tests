#!/usr/bin/env python3
"""Verify the pinned pronunciation dictionary.

Checks that every line parses, that every phoneme is in the ARPAbet inventory,
and that the recorded SHA-256 in VERSION matches the file on disk.

    python scripts/verify_dictionary.py
    python scripts/verify_dictionary.py --data-dir ./data --update-hash
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from reader_tts.domain.errors import DictionaryError  # noqa: E402
from reader_tts.pronunciation.cmudict_loader import load_dictionary  # noqa: E402


def file_digest(path: Path) -> str:
    """Return the SHA-256 hex digest of a file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def recorded_hash(version_file: Path) -> str | None:
    """Read the sha256 field from the VERSION file, if present."""
    if not version_file.is_file():
        return None
    for line in version_file.read_text(encoding="utf-8").splitlines():
        key, _, value = line.partition(":")
        if key.strip() == "sha256":
            return value.strip()
    return None


def main() -> int:
    """Verify the dictionary; returns a process exit code."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument(
        "--update-hash",
        action="store_true",
        help="rewrite the sha256 line in VERSION to match the file on disk",
    )
    args = parser.parse_args()

    directory = (args.data_dir / "cmudict").resolve()
    try:
        loaded = load_dictionary(directory, max_reported_malformed=50)
    except DictionaryError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    except UnicodeDecodeError as error:
        print(f"error: the dictionary is not valid UTF-8: {error}", file=sys.stderr)
        return 1

    print(f"File:     {loaded.source_path}")
    print(f"Revision: {loaded.version}")
    print(f"Words:    {loaded.size}")
    variants = sum(len(entry.pronunciations) for entry in loaded.entries.values())
    print(f"Variants: {variants}")
    ambiguous = sum(1 for entry in loaded.entries.values() if entry.is_ambiguous)
    print(f"Words with several pronunciations: {ambiguous}")

    ok = True
    if loaded.malformed_lines:
        ok = False
        print(f"\nMalformed lines: {len(loaded.malformed_lines)}")
        for line in loaded.malformed_lines[:20]:
            print(f"  {line}")

    actual = file_digest(loaded.source_path)
    version_file = directory / "VERSION"
    expected = recorded_hash(version_file)
    print(f"\nsha256 on disk:  {actual}")
    print(f"sha256 recorded: {expected or '(none recorded)'}")

    if expected is None:
        print("warning: VERSION does not record a sha256", file=sys.stderr)
    elif expected != actual:
        if args.update_hash:
            _rewrite_hash(version_file, actual)
            print("VERSION updated with the current hash.")
        else:
            ok = False
            print(
                "error: the dictionary does not match its recorded hash. "
                "Re-run with --update-hash if the change was intentional.",
                file=sys.stderr,
            )

    print("\nResult:", "ok" if ok else "problems found")
    return 0 if ok else 1


def _rewrite_hash(version_file: Path, digest: str) -> None:
    lines = version_file.read_text(encoding="utf-8").splitlines()
    updated = [f"sha256: {digest}" if line.startswith("sha256:") else line for line in lines]
    if not any(line.startswith("sha256:") for line in updated):
        updated.append(f"sha256: {digest}")
    version_file.write_text("\n".join(updated) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
