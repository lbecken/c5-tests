#!/usr/bin/env python3
"""Download the Kokoro model and the curated voices, once.

This is the only part of the project that uses the network, and it is never
invoked automatically. Run it a single time after installing dependencies; the
application then works entirely offline.

    python scripts/download_model.py
    python scripts/download_model.py --model-dir /somewhere/else --all-voices
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ID = "hexgrad/Kokoro-82M"

#: The voices the application offers, one group per bundled language. Keep in
#: step with reader_tts.languages.packs.
CURATED_VOICES = (
    # US English
    "af_heart",
    "af_bella",
    "am_michael",
    "am_fenrir",
    # British English
    "bf_emma",
    "bm_george",
    # French: Kokoro ships exactly one French voice.
    "ff_siwis",
)

REQUIRED_FILES = ("config.json", "kokoro-v1_0.pth")


def main() -> int:
    """Download the model files; returns a process exit code."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=Path("models/kokoro"),
        help="destination directory (default: models/kokoro)",
    )
    parser.add_argument(
        "--all-voices",
        action="store_true",
        help="download every voice in the repository, not just the curated list",
    )
    parser.add_argument(
        "--skip-spacy",
        action="store_true",
        help="do not install the English spaCy pipeline the phonemizer uses",
    )
    args = parser.parse_args()

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print(
            "huggingface_hub is required for this script. Install the optional "
            "dependency group first:\n    uv sync --extra kokoro",
            file=sys.stderr,
        )
        return 1

    patterns = [*REQUIRED_FILES, "VOICES.md", "LICENSE"]
    patterns.append("voices/*.pt" if args.all_voices else "")
    if not args.all_voices:
        patterns.extend(f"voices/{voice}.pt" for voice in CURATED_VOICES)
    patterns = [pattern for pattern in patterns if pattern]

    destination = args.model_dir.expanduser().resolve()
    print(f"Downloading {REPO_ID} into {destination}")
    snapshot_download(repo_id=REPO_ID, local_dir=str(destination), allow_patterns=patterns)

    missing = [name for name in REQUIRED_FILES if not (destination / name).is_file()]
    if missing:
        print(f"error: these files are still missing: {', '.join(missing)}", file=sys.stderr)
        return 1

    voices = sorted(path.stem for path in (destination / "voices").glob("*.pt"))
    print(f"Model files present. Voices available: {', '.join(voices) or 'none'}")

    if not args.skip_spacy:
        print("\nInstalling the English spaCy pipeline used by the phonemizer...")
        if not _install_spacy_pipeline():
            print(
                "warning: the spaCy pipeline could not be installed automatically.\n"
                "The first synthesis will try to download it, which fails offline.\n"
                "Install it manually with:\n"
                "    uv run python -m spacy download en_core_web_sm",
                file=sys.stderr,
            )

    print("\nDone. Set READER_TTS_MODEL_DIR if you used a non-default directory.")
    return 0


def _install_spacy_pipeline() -> bool:
    """Install ``en_core_web_sm`` so no download happens during synthesis."""
    try:
        import spacy  # noqa: F401
    except ImportError:
        return False
    try:
        import en_core_web_sm  # noqa: F401
    except ImportError:
        pass
    else:
        print("The spaCy pipeline is already installed.")
        return True

    import subprocess

    result = subprocess.run(  # noqa: S603 - fixed argument list
        [sys.executable, "-m", "spacy", "download", "en_core_web_sm"],
        check=False,
    )
    return result.returncode == 0


if __name__ == "__main__":
    raise SystemExit(main())
