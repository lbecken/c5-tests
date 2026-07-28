"""Cache key determinism, storage, invalidation and concurrency tests."""

from __future__ import annotations

import threading
from pathlib import Path

import pytest

from reader_tts.cache.cleanup import clean, collect_statistics
from reader_tts.cache.file_store import AudioFileStore
from reader_tts.cache.keys import CacheKeyInputs, compute_cache_key, shard_path_parts
from reader_tts.cache.repository import CacheRepository
from reader_tts.database.connection import Database
from reader_tts.domain.errors import SynthesisFailedError, UnsafePathError
from reader_tts.synthesis.fake_engine import FakeSpeechEngine
from reader_tts.synthesis.synthesis_service import SynthesisService

BASE = CacheKeyInputs(
    engine="kokoro",
    model="kokoro-82m",
    model_hash="abc123",
    voice="af_heart",
    voice_hash="v1",
    language="en-us",
    speed=1.0,
    text="The cat sat on the mat.",
)


# --- Keys ---------------------------------------------------------------------------


def test_key_is_deterministic() -> None:
    assert compute_cache_key(BASE) == compute_cache_key(BASE)
    assert len(compute_cache_key(BASE)) == 64


@pytest.mark.parametrize(
    "field,value",
    [
        ("engine", "piper"),
        ("model", "kokoro-83m"),
        ("model_hash", "def456"),
        ("voice", "am_michael"),
        ("voice_hash", "v2"),
        ("language", "en-gb"),
        ("speed", 1.25),
        ("text", "The cat sat on the mat!"),
        ("override_revision", "3:2026-01-01"),
        ("settings_version", 2),
    ],
)
def test_every_field_changes_the_key(field: str, value: object) -> None:
    from dataclasses import replace

    assert compute_cache_key(replace(BASE, **{field: value})) != compute_cache_key(BASE)


def test_key_is_independent_of_field_order() -> None:
    reordered = CacheKeyInputs(
        text=BASE.text,
        speed=BASE.speed,
        language=BASE.language,
        voice_hash=BASE.voice_hash,
        voice=BASE.voice,
        model_hash=BASE.model_hash,
        model=BASE.model,
        engine=BASE.engine,
    )
    assert compute_cache_key(reordered) == compute_cache_key(BASE)


def test_canonical_json_is_sorted_and_compact() -> None:
    payload = BASE.canonical_json()
    assert payload.startswith('{"engine":')
    assert ", " not in payload


def test_shard_parts() -> None:
    key = "abcdef0123456789" * 4
    first, second, filename = shard_path_parts(key)
    assert (first, second) == ("ab", "cd")
    assert filename == f"{key}.wav"


def test_short_key_is_rejected() -> None:
    with pytest.raises(ValueError, match="four characters"):
        shard_path_parts("ab")


# --- File store ------------------------------------------------------------------------


def test_store_shards_by_prefix(tmp_path: Path) -> None:
    store = AudioFileStore(tmp_path / "audio")
    key = "ab" + "cd" + "e" * 60
    path = store.path_for(key)
    assert path.parent.name == "cd"
    assert path.parent.parent.name == "ab"


def test_store_rejects_traversal(tmp_path: Path) -> None:
    store = AudioFileStore(tmp_path / "audio")
    with pytest.raises(UnsafePathError):
        store.path_for("../../etc/passwd")


# --- Service --------------------------------------------------------------------------


@pytest.fixture
def service(database: Database, tmp_path: Path) -> SynthesisService:
    return SynthesisService(
        engine=FakeSpeechEngine(),
        repository=CacheRepository(database),
        store=AudioFileStore(tmp_path / "audio"),
    )


def test_first_call_synthesizes_and_second_hits_cache(service: SynthesisService) -> None:
    engine = service.engine
    assert isinstance(engine, FakeSpeechEngine)

    first = service.synthesize("The cat sat on the mat.", "af_heart", 1.0)
    assert not first.cache_hit
    assert first.audio_path.is_file()
    assert engine.call_count == 1

    second = service.synthesize("The cat sat on the mat.", "af_heart", 1.0)
    assert second.cache_hit
    assert second.cache_key == first.cache_key
    assert engine.call_count == 1


def test_changing_voice_creates_a_distinct_entry(service: SynthesisService) -> None:
    first = service.synthesize("Hello there friend.", "af_heart", 1.0)
    second = service.synthesize("Hello there friend.", "am_michael", 1.0)
    assert first.cache_key != second.cache_key
    assert not second.cache_hit


def test_changing_speed_creates_a_distinct_entry(service: SynthesisService) -> None:
    first = service.synthesize("Hello there friend.", "af_heart", 1.0)
    second = service.synthesize("Hello there friend.", "af_heart", 1.25)
    assert first.cache_key != second.cache_key


def test_speed_is_quantized_to_the_step(service: SynthesisService) -> None:
    first = service.synthesize("Hello there friend.", "af_heart", 1.0)
    second = service.synthesize("Hello there friend.", "af_heart", 1.001)
    assert second.cache_hit
    assert second.cache_key == first.cache_key


def test_override_revision_invalidates(service: SynthesisService) -> None:
    first = service.synthesize("Hello there friend.", "af_heart", 1.0, override_revision="1:a")
    second = service.synthesize("Hello there friend.", "af_heart", 1.0, override_revision="2:b")
    assert first.cache_key != second.cache_key
    assert not second.cache_hit


def test_bypass_regenerates(service: SynthesisService) -> None:
    engine = service.engine
    assert isinstance(engine, FakeSpeechEngine)
    service.synthesize("Hello there friend.", "af_heart", 1.0)
    outcome = service.synthesize("Hello there friend.", "af_heart", 1.0, bypass_cache=True)
    assert not outcome.cache_hit
    assert engine.call_count == 2


def test_missing_cache_file_is_regenerated(service: SynthesisService, database: Database) -> None:
    outcome = service.synthesize("Hello there friend.", "af_heart", 1.0)
    outcome.audio_path.unlink()
    again = service.synthesize("Hello there friend.", "af_heart", 1.0)
    assert not again.cache_hit
    assert again.audio_path.is_file()
    assert CacheRepository(database).get(outcome.cache_key) is not None


def test_corrupted_metadata_is_discarded(service: SynthesisService, database: Database) -> None:
    outcome = service.synthesize("Hello there friend.", "af_heart", 1.0)
    database.execute(
        "UPDATE audio_cache SET duration_seconds = 0 WHERE cache_key = ?", (outcome.cache_key,)
    )
    assert service.lookup(outcome.cache_key) is None
    assert CacheRepository(database).get(outcome.cache_key) is None


def test_engine_failure_is_converted(service: SynthesisService) -> None:
    engine = service.engine
    assert isinstance(engine, FakeSpeechEngine)
    engine.fail_on.add("explode")
    with pytest.raises(SynthesisFailedError):
        service.synthesize("Please explode now.", "af_heart", 1.0)


def test_silent_output_is_rejected(service: SynthesisService) -> None:
    engine = service.engine
    assert isinstance(engine, FakeSpeechEngine)
    engine.silent_on.add("quiet")
    with pytest.raises(SynthesisFailedError, match="silent"):
        service.synthesize("Stay quiet please.", "af_heart", 1.0)


def test_failed_synthesis_leaves_no_cache_entry(
    service: SynthesisService, database: Database
) -> None:
    engine = service.engine
    assert isinstance(engine, FakeSpeechEngine)
    engine.fail_on.add("explode")
    with pytest.raises(SynthesisFailedError):
        service.synthesize("Please explode now.", "af_heart", 1.0)
    assert CacheRepository(database).all_keys() == ()


def test_concurrent_same_key_synthesizes_once(service: SynthesisService) -> None:
    engine = service.engine
    assert isinstance(engine, FakeSpeechEngine)
    engine.delay_seconds = 0.05

    outcomes: list[object] = []
    barrier = threading.Barrier(4)

    def worker() -> None:
        barrier.wait()
        outcomes.append(service.synthesize("Concurrent request here.", "af_heart", 1.0))

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(outcomes) == 4
    assert engine.call_count == 1


# --- Statistics and cleanup --------------------------------------------------------------


def test_statistics_report_totals(
    service: SynthesisService, database: Database, tmp_path: Path
) -> None:
    service.synthesize("One sentence here.", "af_heart", 1.0)
    service.synthesize("Another sentence here.", "af_heart", 1.0)
    stats = collect_statistics(CacheRepository(database), AudioFileStore(tmp_path / "audio"))
    assert stats.entries == 2
    assert stats.total_bytes > 0
    assert stats.total_duration_seconds > 0
    assert stats.orphaned_records == 0
    assert stats.orphaned_files == 0


def test_cleanup_removes_orphaned_records(
    service: SynthesisService, database: Database, tmp_path: Path
) -> None:
    outcome = service.synthesize("One sentence here.", "af_heart", 1.0)
    outcome.audio_path.unlink()
    repository = CacheRepository(database)
    store = AudioFileStore(tmp_path / "audio")
    assert collect_statistics(repository, store).orphaned_records == 1
    result = clean(repository, store)
    assert result.removed_records == 1
    assert repository.all_keys() == ()


def test_cleanup_removes_orphaned_files(
    service: SynthesisService, database: Database, tmp_path: Path
) -> None:
    outcome = service.synthesize("One sentence here.", "af_heart", 1.0)
    repository = CacheRepository(database)
    store = AudioFileStore(tmp_path / "audio")
    repository.delete(outcome.cache_key)
    assert collect_statistics(repository, store).orphaned_files == 1
    result = clean(repository, store)
    assert result.removed_files == 1
    assert result.freed_bytes > 0
    assert not outcome.audio_path.exists()


def test_cleanup_all_empties_the_cache(
    service: SynthesisService, database: Database, tmp_path: Path
) -> None:
    service.synthesize("One sentence here.", "af_heart", 1.0)
    service.synthesize("Another sentence here.", "af_heart", 1.0)
    repository = CacheRepository(database)
    store = AudioFileStore(tmp_path / "audio")
    result = clean(repository, store, remove_all=True)
    assert result.removed_records == 2
    assert result.removed_files == 2
    assert repository.all_keys() == ()
    assert list(store.iter_files()) == []
