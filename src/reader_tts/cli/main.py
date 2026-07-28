"""Command-line interface.

Every command goes through the same services as the HTTP API. Human-readable
output is the default; ``--json`` produces machine-readable output.

Exit codes:
    0  success
    1  application error
    2  validation failure
    3  engine unavailable
    4  invalid command or configuration
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Final

from reader_tts import __version__
from reader_tts.cache.cleanup import clean, collect_statistics
from reader_tts.config.settings import Settings, get_settings
from reader_tts.container import AppServices
from reader_tts.domain.enums import OverrideScope, ValidationMode
from reader_tts.domain.errors import (
    ConfigurationError,
    DictionaryError,
    ReaderTTSError,
    SpeechEngineError,
    ValidationError,
)
from reader_tts.domain.models import ValidationReport
from reader_tts.text.characters import canonicalize_source
from reader_tts.text.validator import analyze

EXIT_SUCCESS: Final = 0
EXIT_APPLICATION_ERROR: Final = 1
EXIT_VALIDATION_FAILURE: Final = 2
EXIT_ENGINE_UNAVAILABLE: Final = 3
EXIT_INVALID_USAGE: Final = 4


def build_parser() -> argparse.ArgumentParser:
    """Construct the argument parser for every command."""
    parser = argparse.ArgumentParser(
        prog="reader-tts",
        description="Dictionary-controlled offline English text-to-speech reader.",
    )
    parser.add_argument("--version", action="version", version=f"reader-tts {__version__}")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="override the configured log level",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("health", help="report engine and dictionary readiness")

    validate = commands.add_parser("validate", help="validate a text file")
    validate.add_argument("path", type=Path, help="path to a UTF-8 text file")
    validate.add_argument(
        "--mode", choices=["practical", "strict"], default="practical", help="validation mode"
    )

    lookup = commands.add_parser("lookup", help="show a word's pronunciations")
    lookup.add_argument("word")

    speak = commands.add_parser("speak", help="speak one sentence and write a WAV file")
    speak.add_argument("text")
    speak.add_argument("--voice", help="voice identifier")
    speak.add_argument("--speed", type=float, help="0.75 to 1.25")
    speak.add_argument("--output", type=Path, default=Path("output.wav"))

    synthesize = commands.add_parser("synthesize", help="synthesize a document to one WAV file")
    synthesize.add_argument("path", type=Path, help="path to a UTF-8 text file")
    synthesize.add_argument("--output", type=Path, required=True)
    synthesize.add_argument("--voice")
    synthesize.add_argument("--speed", type=float)
    synthesize.add_argument("--title")
    synthesize.add_argument("--mode", choices=["practical", "strict"], default="practical")

    commands.add_parser("voices", help="list bundled voices")

    cache = commands.add_parser("cache", help="inspect or clean the audio cache")
    cache.add_argument("action", choices=["stats", "clean"])
    cache.add_argument("--all", action="store_true", help="with clean: remove every entry")

    dictionary = commands.add_parser("dictionary", help="dictionary maintenance")
    dictionary.add_argument("action", choices=["verify"])

    override = commands.add_parser("override", help="manage pronunciation overrides")
    override.add_argument("action", choices=["list", "set", "delete"])
    override.add_argument("--word")
    override.add_argument("--phonemes", help="space-separated ARPAbet, e.g. 'L EH1 D'")
    override.add_argument("--synthesis-text", help="respelling passed to the engine")
    override.add_argument("--note")

    serve = commands.add_parser("serve", help="run the local web interface")
    serve.add_argument("--host")
    serve.add_argument("--port", type=int)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Entry point. Returns the process exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=args.log_level or "WARNING",
        format="%(levelname)s %(name)s %(message)s",
        stream=sys.stderr,
    )

    try:
        settings = get_settings()
    except Exception as error:  # noqa: BLE001 - configuration failures are fatal
        _fail(f"invalid configuration: {error}", args.json)
        return EXIT_INVALID_USAGE

    try:
        return _dispatch(args, settings)
    except ValidationError as error:
        _fail(str(error), args.json)
        return EXIT_VALIDATION_FAILURE
    except SpeechEngineError as error:
        _fail(str(error), args.json)
        return EXIT_ENGINE_UNAVAILABLE
    except (ConfigurationError, DictionaryError) as error:
        _fail(str(error), args.json)
        return EXIT_INVALID_USAGE
    except ReaderTTSError as error:
        _fail(str(error), args.json)
        return EXIT_APPLICATION_ERROR
    except KeyboardInterrupt:  # pragma: no cover - interactive only
        _fail("interrupted", args.json)
        return EXIT_APPLICATION_ERROR


def _dispatch(args: argparse.Namespace, settings: Settings) -> int:
    if args.command == "serve":
        return _serve(args, settings)

    services = AppServices(settings)
    try:
        handlers = {
            "health": _health,
            "validate": _validate,
            "lookup": _lookup,
            "speak": _speak,
            "synthesize": _synthesize,
            "voices": _voices,
            "cache": _cache,
            "dictionary": _dictionary,
            "override": _override,
        }
        return handlers[args.command](args, services)
    finally:
        services.close()


# --- Commands -------------------------------------------------------------------


def _health(args: argparse.Namespace, services: AppServices) -> int:
    dictionary_info = services.dictionary.info
    ready, error = services.engine_status()
    engine_info = services.engine.info if ready else None

    payload: dict[str, Any] = {
        "status": "ready" if ready else "degraded",
        "engine": {
            "name": engine_info.name if engine_info else services.settings.engine,
            "model_id": engine_info.model_id if engine_info else services.settings.model_id,
            "ready": ready,
            "voices": list(engine_info.voices) if engine_info else [],
            "device": engine_info.device if engine_info else None,
            "error": error,
        },
        "dictionary": {
            "name": dictionary_info.name,
            "version": dictionary_info.version,
            "entries": dictionary_info.entries,
        },
    }
    if args.json:
        _print_json(payload)
    else:
        print(f"Status:     {payload['status']}")
        print(f"Engine:     {payload['engine']['name']} ({payload['engine']['model_id']})")
        print(f"Ready:      {'yes' if ready else 'no'}")
        if engine_info:
            print(f"Device:     {engine_info.device}")
            print(f"Voices:     {', '.join(engine_info.voices)}")
        if error:
            print(f"Error:      {error}")
        print(f"Dictionary: {dictionary_info.name} {dictionary_info.version}")
        print(f"Entries:    {dictionary_info.entries}")
    return EXIT_SUCCESS if ready else EXIT_ENGINE_UNAVAILABLE


def _validate(args: argparse.Namespace, services: AppServices) -> int:
    text = _read_text(args.path)
    result = analyze(
        canonicalize_source(text),
        services.resolver(),
        mode=ValidationMode(args.mode),
        hard_max_chars=services.settings.hard_max_chars,
    )
    if args.json:
        _print_json(_report_payload(result.report))
    else:
        _print_report(result.report)
    return EXIT_SUCCESS if result.report.accepted else EXIT_VALIDATION_FAILURE


def _lookup(args: argparse.Namespace, services: AppServices) -> int:
    word = args.word.strip().upper()
    entry = services.dictionary.lookup(word)
    compound = services.dictionary.resolve_compound(word) if entry is None else None

    if entry is None and compound is None:
        if args.json:
            _print_json({"word": args.word, "supported": False, "pronunciations": []})
        else:
            print(f"{args.word}: not in the dictionary")
        return EXIT_VALIDATION_FAILURE

    if entry is not None:
        pronunciations = [
            {"variant": p.variant_index, "arpabet": p.arpabet} for p in entry.pronunciations
        ]
    else:
        assert compound is not None
        pronunciations = [{"variant": 0, "arpabet": " ".join(compound.phonemes)}]

    if args.json:
        _print_json(
            {
                "word": args.word,
                "supported": True,
                "compound": compound is not None,
                "pronunciations": pronunciations,
            }
        )
    else:
        print(f"{args.word}: {len(pronunciations)} pronunciation(s)")
        for item in pronunciations:
            print(f"  [{item['variant']}] {item['arpabet']}")
        if compound is not None:
            print(f"  (resolved from components: {', '.join(compound.components)})")
    return EXIT_SUCCESS


def _speak(args: argparse.Namespace, services: AppServices) -> int:
    settings = services.settings
    voice = args.voice or settings.default_voice
    speed = args.speed if args.speed is not None else settings.default_speed

    resolver = services.resolver()
    result = analyze(canonicalize_source(args.text), resolver)
    if not result.report.accepted:
        if args.json:
            _print_json(_report_payload(result.report))
        else:
            print("Validation: failed")
            _print_report(result.report)
        return EXIT_VALIDATION_FAILURE

    from reader_tts.synthesis.chunker import prepare_sentence

    sentences = result.sentences
    if not sentences:
        raise ValidationError("no sentence was found in the input")

    replacements = resolver.synthesis_replacements(
        frozenset(token.normalized for token in result.tokens if token.is_word)
    )
    outcomes = []
    for sentence in sentences:
        prepared = prepare_sentence(
            sentence,
            replacements=replacements,
            preferred_max_chars=settings.preferred_max_chars,
            hard_max_chars=settings.hard_max_chars,
        )
        for chunk in prepared.chunks:
            outcomes.append(
                services.synthesis.synthesize(
                    text=chunk.synthesis_text,
                    voice_id=voice,
                    speed=speed,
                    override_revision=resolver.override_revision(),
                )
            )

    duration = _assemble(outcomes, args.output, services)
    cache_state = "hit" if all(o.cache_hit for o in outcomes) else "miss"
    statistics = result.report.statistics

    if args.json:
        _print_json(
            {
                "validation": "passed",
                "words": statistics.words,
                "ambiguous_words": statistics.ambiguous_words,
                "voice": voice,
                "speed": round(speed, 2),
                "cache": cache_state,
                "duration_seconds": round(duration, 2),
                "output": str(args.output),
            }
        )
    else:
        print("Validation: passed")
        print(f"Words: {statistics.words}")
        print(f"Ambiguous pronunciations: {statistics.ambiguous_words}")
        print(f"Voice: {voice}")
        print(f"Speed: {speed:.2f}")
        print(f"Cache: {cache_state}")
        print(f"Generated duration: {duration:.2f} seconds")
        print(f"Output: {args.output}")
    return EXIT_SUCCESS


def _synthesize(args: argparse.Namespace, services: AppServices) -> int:
    text = _read_text(args.path)
    settings = services.settings
    voice = args.voice or settings.default_voice
    speed = args.speed if args.speed is not None else settings.default_speed

    document = services.documents.create(text, title=args.title or args.path.stem)
    resolver = services.resolver(document.id)
    job = services.jobs.create(
        document_id=document.id,
        resolver=resolver,
        voice_id=voice,
        speed=speed,
        mode=ValidationMode(args.mode),
    )
    if not args.json:
        print(f"Document: {document.id}")
        print(f"Sentences: {len(services.documents.sentences(document.id))}")
        print(f"Units: {job.total_units}")

    progress = services.jobs.run(job.id, resolver)
    if progress.failed_units:
        raise ReaderTTSError(f"{progress.failed_units} unit(s) failed to synthesize")

    export = services.exports.export_document(document.id, voice, speed)
    assert export.file_path is not None
    destination = _copy_export(Path(export.file_path), args.output)

    if args.json:
        _print_json(
            {
                "document_id": document.id,
                "job_id": job.id,
                "units": progress.total_units,
                "cache_hits": progress.cache_hits,
                "synthesized": progress.synthesized_units,
                "duration_seconds": round(export.duration_seconds or 0.0, 2),
                "output": str(destination),
            }
        )
    else:
        print(f"Cache hits: {progress.cache_hits}")
        print(f"Synthesized: {progress.synthesized_units}")
        print(f"Duration: {export.duration_seconds:.2f} seconds")
        print(f"Output: {destination}")
    return EXIT_SUCCESS


def _voices(args: argparse.Namespace, services: AppServices) -> int:
    engine = services.engine
    configs = [engine.voice_config(voice_id) for voice_id in engine.list_voices()]
    if args.json:
        _print_json(
            {
                "voices": [
                    {
                        "id": config.id,
                        "display_name": config.display_name,
                        "language_code": config.language_code,
                        "gender": config.gender_label,
                        "default_speed": config.default_speed,
                    }
                    for config in configs
                ]
            }
        )
    else:
        for config in configs:
            gender = f" [{config.gender_label}]" if config.gender_label else ""
            print(f"{config.id:<14} {config.display_name}{gender}")
    return EXIT_SUCCESS


def _cache(args: argparse.Namespace, services: AppServices) -> int:
    repository = services.cache_repository
    store = services.file_store

    if args.action == "stats":
        stats = collect_statistics(repository, store)
        if args.json:
            _print_json(
                {
                    "entries": stats.entries,
                    "total_bytes": stats.total_bytes,
                    "total_duration_seconds": round(stats.total_duration_seconds, 2),
                    "orphaned_records": stats.orphaned_records,
                    "orphaned_files": stats.orphaned_files,
                }
            )
        else:
            print(f"Entries:          {stats.entries}")
            print(f"Total size:       {stats.total_bytes / 1_048_576:.1f} MiB")
            print(f"Total audio:      {stats.total_duration_seconds / 60:.1f} minutes")
            print(f"Orphaned records: {stats.orphaned_records}")
            print(f"Orphaned files:   {stats.orphaned_files}")
        return EXIT_SUCCESS

    result = clean(repository, store, remove_all=args.all)
    if args.json:
        _print_json(
            {
                "removed_records": result.removed_records,
                "removed_files": result.removed_files,
                "freed_bytes": result.freed_bytes,
            }
        )
    else:
        print(f"Removed records: {result.removed_records}")
        print(f"Removed files:   {result.removed_files}")
        print(f"Freed:           {result.freed_bytes / 1_048_576:.1f} MiB")
    return EXIT_SUCCESS


def _dictionary(args: argparse.Namespace, services: AppServices) -> int:
    info = services.dictionary.info
    healthy = info.entries > 0 and not info.malformed_lines
    if args.json:
        _print_json(
            {
                "name": info.name,
                "version": info.version,
                "entries": info.entries,
                "malformed_lines": list(info.malformed_lines),
                "healthy": healthy,
            }
        )
    else:
        print(f"Dictionary: {info.name} {info.version}")
        print(f"Entries:    {info.entries}")
        if info.malformed_lines:
            print(f"Malformed:  {len(info.malformed_lines)} line(s)")
            for line in info.malformed_lines[:10]:
                print(f"  {line}")
        else:
            print("Malformed:  none")
    return EXIT_SUCCESS if healthy else EXIT_VALIDATION_FAILURE


def _override(args: argparse.Namespace, services: AppServices) -> int:
    overrides = services.overrides

    if args.action == "list":
        stored = overrides.list_all()
        if args.json:
            _print_json(
                {
                    "overrides": [
                        {
                            "word": item.word,
                            "scope": item.scope.value,
                            "arpabet": " ".join(item.phonemes),
                            "synthesis_text": item.synthesis_text,
                            "note": item.note,
                        }
                        for item in stored
                    ]
                }
            )
        else:
            if not stored:
                print("No overrides are defined.")
            for item in stored:
                spelling = f" -> '{item.synthesis_text}'" if item.synthesis_text else ""
                print(f"{item.word:<20} {' '.join(item.phonemes)}{spelling}")
        return EXIT_SUCCESS

    if not args.word:
        raise ValidationError("--word is required")

    if args.action == "delete":
        removed = overrides.delete(args.word, OverrideScope.GLOBAL)
        if args.json:
            _print_json({"word": args.word.upper(), "deleted": removed})
        else:
            print(f"{'Deleted' if removed else 'No override for'} {args.word.upper()}")
        return EXIT_SUCCESS

    if not args.phonemes:
        raise ValidationError("--phonemes is required when setting an override")
    stored_override = overrides.upsert(
        word=args.word,
        phonemes=args.phonemes.split(),
        synthesis_text=args.synthesis_text,
        note=args.note,
    )
    if args.json:
        _print_json(
            {
                "word": stored_override.word,
                "arpabet": " ".join(stored_override.phonemes),
                "synthesis_text": stored_override.synthesis_text,
            }
        )
    else:
        print(f"Set {stored_override.word} = {' '.join(stored_override.phonemes)}")
        if stored_override.synthesis_text:
            print(f"Synthesis spelling: {stored_override.synthesis_text}")
    return EXIT_SUCCESS


def _serve(args: argparse.Namespace, settings: Settings) -> int:
    import uvicorn

    host = args.host or settings.host
    port = args.port or settings.port
    print(f"Reader is available at http://{host}:{port}")
    uvicorn.run(
        "reader_tts.api.app:app",
        host=host,
        port=port,
        log_level=settings.log_level.lower(),
    )
    return EXIT_SUCCESS


# --- Helpers -----------------------------------------------------------------------


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValidationError(f"no such file: {path}") from error
    except UnicodeDecodeError as error:
        raise ValidationError(f"{path} is not valid UTF-8 text") from error


def _assemble(outcomes: list[Any], destination: Path, services: AppServices) -> float:
    """Join synthesis outcomes into one WAV file at *destination*."""
    from reader_tts.synthesis.audio_processor import (
        StreamingWavWriter,
        iter_wav_blocks,
        silence,
    )

    sample_rate = outcomes[0].sample_rate
    gap = silence(services.settings.sentence_pause_ms, sample_rate)
    writer = StreamingWavWriter(
        destination.resolve(), sample_rate, tmp_dir=services.settings.tmp_dir
    )
    try:
        for position, outcome in enumerate(outcomes):
            if position:
                writer.append(gap)
            for block in iter_wav_blocks(outcome.audio_path):
                writer.append(block)
        duration = writer.duration_seconds
        writer.finalize()
    except Exception:
        writer.abort()
        raise
    return duration


def _copy_export(source: Path, destination: Path) -> Path:
    import shutil

    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    return destination


def _report_payload(report: ValidationReport) -> dict[str, Any]:
    statistics = report.statistics
    return {
        "accepted": report.accepted,
        "statistics": {
            "characters": statistics.characters,
            "words": statistics.words,
            "sentences": statistics.sentences,
            "paragraphs": statistics.paragraphs,
            "supported_words": statistics.supported_words,
            "unsupported_words": statistics.unsupported_words,
            "ambiguous_words": statistics.ambiguous_words,
        },
        "issues": [
            {
                "code": issue.code.value,
                "severity": issue.severity.value,
                "message": issue.message,
                "word": issue.token.raw if issue.token else None,
                "start": issue.token.span.start if issue.token else None,
                "end": issue.token.span.end if issue.token else None,
                "alternatives": list(issue.alternatives),
            }
            for issue in report.issues
        ],
    }


def _print_report(report: ValidationReport) -> None:
    statistics = report.statistics
    print(f"Accepted:   {'yes' if report.accepted else 'no'}")
    print(f"Characters: {statistics.characters}")
    print(f"Words:      {statistics.words}")
    print(f"Sentences:  {statistics.sentences}")
    print(f"Paragraphs: {statistics.paragraphs}")
    print(f"Supported:  {statistics.supported_words}")
    print(f"Unknown:    {statistics.unsupported_words}")
    print(f"Ambiguous:  {statistics.ambiguous_words}")
    if report.issues:
        print("\nIssues:")
    for issue in report.issues[:50]:
        position = f" at {issue.token.span.start}" if issue.token else ""
        print(f"  [{issue.severity.value}] {issue.code.value}{position}: {issue.message}")
        if issue.alternatives:
            print(f"      alternatives: {', '.join(issue.alternatives)}")
    if len(report.issues) > 50:
        print(f"  ... and {len(report.issues) - 50} more")


def _print_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False))


def _fail(message: str, as_json: bool) -> None:
    if as_json:
        print(json.dumps({"error": message}, indent=2), file=sys.stderr)
    else:
        print(f"error: {message}", file=sys.stderr)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
