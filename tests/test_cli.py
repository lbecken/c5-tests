"""Command-line interface tests, including the documented exit codes."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from reader_tts.cli.main import (
    EXIT_SUCCESS,
    EXIT_VALIDATION_FAILURE,
    main,
)

CORPUS = "The cat sat on the mat. The wind moved through the trees."


@pytest.fixture(autouse=True)
def isolated_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point the CLI at a temporary runtime directory and the fake engine."""
    from reader_tts.config.settings import reset_settings_cache

    monkeypatch.setenv("READER_TTS_RUNTIME_DIR", str(tmp_path / "runtime"))
    monkeypatch.setenv("READER_TTS_DATA_DIR", str(Path("data").resolve()))
    monkeypatch.setenv("READER_TTS_ENGINE", "fake")
    reset_settings_cache()
    yield
    reset_settings_cache()


def run(*argv: str) -> int:
    return main(list(argv))


def read_json(capsys: pytest.CaptureFixture[str]) -> dict[str, object]:
    return dict(json.loads(capsys.readouterr().out))


# --- health, voices, dictionary --------------------------------------------------


def test_health_succeeds(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("--json", "health") == EXIT_SUCCESS
    payload = read_json(capsys)
    assert payload["status"] == "ready"
    assert isinstance(payload["dictionary"], dict)


def test_voices(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("--json", "voices") == EXIT_SUCCESS
    voices = read_json(capsys)["voices"]
    assert isinstance(voices, list)
    assert voices


def test_dictionary_verify_covers_every_language(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert run("--json", "dictionary", "verify") == EXIT_SUCCESS
    payload = read_json(capsys)
    assert payload["healthy"] is True
    by_language = {entry["language"]: entry for entry in payload["dictionaries"]}
    assert set(by_language) == {"en-us", "en-gb", "fr-fr"}
    assert by_language["en-us"]["entries"] > 100_000
    assert by_language["fr-fr"]["entries"] > 200_000
    assert by_language["fr-fr"]["name"] == "ipa-dict-fr"


def test_dictionary_verify_one_language(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("--json", "dictionary", "verify", "--language", "fr-fr") == EXIT_SUCCESS
    payload = read_json(capsys)
    assert len(payload["dictionaries"]) == 1


def test_lookup_known_word(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("--json", "lookup", "record") == EXIT_SUCCESS
    payload = read_json(capsys)
    assert payload["supported"] is True
    assert len(payload["pronunciations"]) >= 2  # type: ignore[arg-type]


def test_lookup_unknown_word_exits_with_validation_failure(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert run("--json", "lookup", "frobnicator") == EXIT_VALIDATION_FAILURE
    assert read_json(capsys)["supported"] is False


# --- validate -----------------------------------------------------------------------


def test_validate_accepts_clean_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = tmp_path / "clean.txt"
    source.write_text(CORPUS, encoding="utf-8")
    assert run("--json", "validate", str(source)) == EXIT_SUCCESS
    payload = read_json(capsys)
    assert payload["accepted"] is True


def test_validate_rejects_unknown_words(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = tmp_path / "bad.txt"
    source.write_text("The frobnicator sat.", encoding="utf-8")
    assert run("--json", "validate", str(source)) == EXIT_VALIDATION_FAILURE
    payload = read_json(capsys)
    assert payload["accepted"] is False


def test_validate_strict_mode_rejects_ambiguity(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = tmp_path / "ambiguous.txt"
    source.write_text("Please record the record.", encoding="utf-8")
    assert run("validate", str(source), "--mode", "strict") == EXIT_VALIDATION_FAILURE
    capsys.readouterr()


def test_validate_missing_file(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("validate", "/nonexistent/file.txt") == EXIT_VALIDATION_FAILURE
    assert "no such file" in capsys.readouterr().err


# --- speak and synthesize -------------------------------------------------------------


def test_speak_writes_a_wav_and_reports_a_cache_miss_then_hit(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    output = tmp_path / "out.wav"
    assert run("--json", "speak", CORPUS, "--output", str(output)) == EXIT_SUCCESS
    first = read_json(capsys)
    assert first["cache"] == "miss"
    assert float(first["duration_seconds"]) > 0  # type: ignore[arg-type]
    assert output.is_file()
    assert output.read_bytes()[:4] == b"RIFF"

    second_output = tmp_path / "again.wav"
    assert run("--json", "speak", CORPUS, "--output", str(second_output)) == EXIT_SUCCESS
    assert read_json(capsys)["cache"] == "hit"


def test_speak_reports_validation_output(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    code = run("speak", "The wind moved through the trees.", "--output", str(tmp_path / "a.wav"))
    assert code == EXIT_SUCCESS
    output = capsys.readouterr().out
    for expected in ("Validation: passed", "Words:", "Voice:", "Speed:", "Cache:", "Output:"):
        assert expected in output


def test_speak_rejects_unknown_words(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert run("speak", "The frobnicator sat.", "--output", str(tmp_path / "x.wav")) == (
        EXIT_VALIDATION_FAILURE
    )
    assert "failed" in capsys.readouterr().out


def test_speak_rejects_an_out_of_range_speed(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = run("speak", CORPUS, "--speed", "2.0", "--output", str(tmp_path / "y.wav"))
    assert code == EXIT_VALIDATION_FAILURE
    assert "speed" in capsys.readouterr().err


def test_synthesize_document(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = tmp_path / "doc.txt"
    source.write_text(f"{CORPUS}\n\nDid you close the door?", encoding="utf-8")
    output = tmp_path / "doc.wav"
    assert run("--json", "synthesize", str(source), "--output", str(output)) == EXIT_SUCCESS

    payload = read_json(capsys)
    assert payload["units"] == 3
    assert float(payload["duration_seconds"]) > 0  # type: ignore[arg-type]
    assert output.is_file()
    assert output.read_bytes()[:4] == b"RIFF"


# --- cache and overrides ----------------------------------------------------------------


def test_cache_statistics_and_cleanup(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    run("speak", CORPUS, "--output", str(tmp_path / "z.wav"))
    capsys.readouterr()

    assert run("--json", "cache", "stats") == EXIT_SUCCESS
    stats = read_json(capsys)
    assert int(stats["entries"]) > 0  # type: ignore[arg-type]

    assert run("--json", "cache", "clean", "--all") == EXIT_SUCCESS
    cleaned = read_json(capsys)
    assert int(cleaned["removed_records"]) > 0  # type: ignore[arg-type]

    assert run("--json", "cache", "stats") == EXIT_SUCCESS
    assert read_json(capsys)["entries"] == 0


def test_override_set_list_delete(capsys: pytest.CaptureFixture[str]) -> None:
    assert (
        run(
            "--json",
            "override",
            "set",
            "--word",
            "lead",
            "--phonemes",
            "L EH1 D",
            "--synthesis-text",
            "led",
        )
        == EXIT_SUCCESS
    )
    assert read_json(capsys)["phonemes"] == "L EH1 D"

    assert run("--json", "override", "list") == EXIT_SUCCESS
    overrides = read_json(capsys)["overrides"]
    assert len(overrides) == 1  # type: ignore[arg-type]

    assert run("--json", "override", "delete", "--word", "lead") == EXIT_SUCCESS
    assert read_json(capsys)["deleted"] is True


def test_override_rejects_invalid_phonemes(capsys: pytest.CaptureFixture[str]) -> None:
    code = run("override", "set", "--word", "lead", "--phonemes", "L QQ D")
    assert code == EXIT_VALIDATION_FAILURE
    assert "QQ" in capsys.readouterr().err


def test_override_requires_a_word(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("override", "set", "--phonemes", "L EH1 D") == EXIT_VALIDATION_FAILURE
    assert "--word is required" in capsys.readouterr().err


def test_speak_uses_a_synthesis_override(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A synthesis spelling changes the text the engine receives, and the key."""
    output = tmp_path / "before.wav"
    run("--json", "speak", "I lead the way.", "--output", str(output))
    capsys.readouterr()

    run("override", "set", "--word", "lead", "--phonemes", "L EH1 D", "--synthesis-text", "led")
    capsys.readouterr()

    assert run("--json", "speak", "I lead the way.", "--output", str(tmp_path / "after.wav")) == (
        EXIT_SUCCESS
    )
    # A different synthesis text means the cached audio cannot be reused.
    assert read_json(capsys)["cache"] == "miss"


# --- usage ----------------------------------------------------------------------------------


def test_french_lookup_reports_ipa(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("--json", "lookup", "l'homme", "--language", "fr-fr") == EXIT_SUCCESS
    payload = read_json(capsys)
    assert payload["supported"] is True
    assert payload["notation"] == "ipa"
    assert payload["compound"] is True
    assert payload["pronunciations"][0]["phonemes"] == "lɔm"


def test_french_validate(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = tmp_path / "fr.txt"
    source.write_text("Le vent soufflait à travers les arbres.", encoding="utf-8")
    assert run("--json", "validate", str(source), "--language", "fr-fr") == EXIT_SUCCESS
    payload = read_json(capsys)
    assert payload["accepted"] is True
    assert payload["statistics"]["unsupported_words"] == 0


def test_french_text_fails_validation_under_english(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = tmp_path / "fr.txt"
    source.write_text("Le vent soufflait à travers les arbres.", encoding="utf-8")
    assert run("validate", str(source)) == EXIT_VALIDATION_FAILURE
    capsys.readouterr()


def test_french_speak_selects_the_only_french_voice(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    output = tmp_path / "fr.wav"
    code = run(
        "--json",
        "speak",
        "Le vent soufflait doucement.",
        "--language",
        "fr-fr",
        "--output",
        str(output),
    )
    assert code == EXIT_SUCCESS
    payload = read_json(capsys)
    assert payload["voice"] == "ff_siwis"
    assert payload["language"] == "fr-fr"
    assert output.read_bytes()[:4] == b"RIFF"


def test_languages_command(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("--json", "languages") == EXIT_SUCCESS
    payload = read_json(capsys)
    codes = {language["code"] for language in payload["languages"]}
    assert codes == {"en-us", "en-gb", "fr-fr"}


def test_voices_filtered_by_language(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("--json", "voices", "--language", "fr-fr") == EXIT_SUCCESS
    payload = read_json(capsys)
    assert [voice["id"] for voice in payload["voices"]] == ["ff_siwis"]


def test_unknown_command_exits_with_usage_error() -> None:
    with pytest.raises(SystemExit) as exit_info:
        main(["not-a-command"])
    assert exit_info.value.code == 2  # argparse's own usage exit


def test_version_flag() -> None:
    with pytest.raises(SystemExit) as exit_info:
        main(["--version"])
    assert exit_info.value.code == 0
