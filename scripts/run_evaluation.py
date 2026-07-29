#!/usr/bin/env python3
"""Render the listening-evaluation corpus and prepare a results file.

Each line of the corpus is synthesized and written to its own WAV file, so the
project owner can listen and score it against evaluation/rubric.md.

    python scripts/run_evaluation.py
    python scripts/run_evaluation.py --voice am_michael --speed 1.0
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from reader_tts.config.settings import Settings  # noqa: E402
from reader_tts.container import AppServices  # noqa: E402
from reader_tts.domain.errors import ReaderTTSError  # noqa: E402
from reader_tts.text.characters import canonicalize_source  # noqa: E402
from reader_tts.text.validator import analyze  # noqa: E402

RUBRIC_CRITERIA = (
    "word_intelligibility",
    "pronunciation_correctness",
    "sentence_rhythm",
    "pause_appropriateness",
    "voice_consistency",
    "long_form_comfort",
)


def main() -> int:
    """Render the corpus; returns a process exit code."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--corpus", type=Path, default=Path("evaluation/corpus.txt"))
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="where to write audio and results (default: <runtime dir>/evaluation)",
    )
    parser.add_argument("--voice", default=None)
    parser.add_argument("--speed", type=float, default=None)
    parser.add_argument(
        "--skip-synthesis",
        action="store_true",
        help="only validate the corpus and write the results template",
    )
    args = parser.parse_args()

    if not args.corpus.is_file():
        print(f"error: no corpus at {args.corpus}", file=sys.stderr)
        return 1

    lines = [
        line.strip()
        for line in args.corpus.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    if not lines:
        print("error: the corpus is empty", file=sys.stderr)
        return 1

    settings = Settings()
    services = AppServices(settings)
    voice = args.voice or settings.default_voice
    speed = args.speed if args.speed is not None else settings.default_speed

    output_dir = (
        args.output_dir.expanduser().resolve()
        if args.output_dir is not None
        else settings.runtime_dir / "evaluation"
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    resolver = services.resolver()
    rows: list[dict[str, object]] = []
    failures = 0

    try:
        engine_name = services.engine.info.name if not args.skip_synthesis else "not-run"
        model_id = services.engine.info.model_id if not args.skip_synthesis else "not-run"

        for index, line in enumerate(lines, start=1):
            report = analyze(canonicalize_source(line), resolver).report
            row: dict[str, object] = {
                "index": index,
                "text": line,
                "words": report.statistics.words,
                "accepted": report.accepted,
                "unknown_words": report.statistics.unsupported_words,
                "ambiguous_words": report.statistics.ambiguous_words,
                "audio_file": "",
                "duration_seconds": "",
                "engine": engine_name,
                "model": model_id,
                "voice": voice,
                "speed": f"{speed:.2f}",
                **dict.fromkeys(RUBRIC_CRITERIA, ""),
                "notes": "",
            }

            if not report.accepted:
                failures += 1
                print(f"[{index:3d}] REJECTED  {line[:60]}")
                for issue in report.errors[:3]:
                    print(f"        {issue.message}")
            elif not args.skip_synthesis:
                try:
                    outcome = services.synthesis.synthesize(
                        text=line,
                        voice_id=voice,
                        speed=speed,
                        override_revision=resolver.override_revision(),
                    )
                except ReaderTTSError as error:
                    failures += 1
                    print(f"[{index:3d}] FAILED    {error}")
                else:
                    destination = output_dir / f"{index:03d}.wav"
                    destination.write_bytes(outcome.audio_path.read_bytes())
                    row["audio_file"] = str(destination)
                    row["duration_seconds"] = f"{outcome.duration_seconds:.2f}"
                    marker = "cached" if outcome.cache_hit else "generated"
                    print(f"[{index:3d}] {marker:9s} {outcome.duration_seconds:5.2f}s  {line[:50]}")
            rows.append(row)
    finally:
        services.close()

    results = output_dir / f"results-{datetime.now(tz=UTC):%Y%m%d-%H%M%S}.csv"
    with results.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nLines:     {len(lines)}")
    print(f"Rejected:  {failures}")
    print(f"Audio:     {output_dir}")
    print(f"Results:   {results}")
    print("\nScore each line 1-5 against evaluation/rubric.md and fill in the CSV.")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
