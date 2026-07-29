"""HTTP API integration tests.

The whole workflow is exercised without a browser and without the neural model.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from reader_tts.api.app import create_app
from reader_tts.config.settings import Settings
from reader_tts.container import AppServices
from reader_tts.synthesis.fake_engine import FakeSpeechEngine

SAMPLE_TEXT = (
    "The cat sat on the mat. The wind moved through the trees.\n\n"
    "Did you close the door? I read the book yesterday."
)


@pytest.fixture
def services(tmp_path: Path) -> Iterator[AppServices]:
    settings = Settings(
        data_dir=Path("data"),
        runtime_dir=tmp_path / "runtime",
        model_dir=tmp_path / "models",
        engine="fake",
    )
    container = AppServices(settings, engine=FakeSpeechEngine())
    yield container
    container.close()


@pytest.fixture
def client(services: AppServices) -> Iterator[TestClient]:
    with TestClient(create_app(services=services)) as test_client:
        yield test_client


def create_document(client: TestClient, text: str = SAMPLE_TEXT) -> str:
    response = client.post("/api/v1/documents", json={"text": text, "title": "Sample"})
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


def synthesize(client: TestClient, document_id: str, voice: str = "af_heart") -> dict[str, object]:
    response = client.post(
        f"/api/v1/documents/{document_id}/synthesis-jobs",
        json={"voice_id": voice, "speed": 1.0},
    )
    assert response.status_code == 202, response.text
    job_id = response.json()["id"]

    for _ in range(200):
        status = client.get(f"/api/v1/synthesis-jobs/{job_id}").json()
        if status["status"] in {"completed", "failed", "cancelled"}:
            return dict(status)
        time.sleep(0.05)
    raise AssertionError("the job did not finish in time")


# --- Health and voices -------------------------------------------------------------


def test_health(client: TestClient) -> None:
    payload = client.get("/api/v1/health").json()
    assert payload["status"] == "ready"
    assert payload["engine"]["ready"] is True
    assert payload["engine"]["voices"]
    assert payload["dictionary"]["entries"] > 100_000
    assert payload["dictionary"]["name"] == "cmudict"


def test_voices(client: TestClient) -> None:
    payload = client.get("/api/v1/voices").json()
    assert {voice["id"] for voice in payload["voices"]} == {"af_heart", "am_michael"}
    assert payload["min_speed"] == 0.75
    assert payload["max_speed"] == 1.25


def test_index_page_is_served(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


# --- Validation -----------------------------------------------------------------


def test_validate_accepts_clean_text(client: TestClient) -> None:
    payload = client.post("/api/v1/validate", json={"text": "The cat sat on the mat."}).json()
    assert payload["accepted"] is True
    assert payload["statistics"]["words"] == 6
    assert len(payload["sentences"]) == 1


def test_validate_reports_unknown_words_with_offsets(client: TestClient) -> None:
    payload = client.post("/api/v1/validate", json={"text": "The frobnicator sat."}).json()
    assert payload["accepted"] is False
    issue = payload["issues"][0]
    assert issue["code"] == "unknown_word"
    assert issue["word"] == "frobnicator"
    assert issue["start"] == 4
    assert issue["end"] == 15


def test_validate_strict_mode(client: TestClient) -> None:
    payload = client.post(
        "/api/v1/validate", json={"text": "Please record the record.", "mode": "strict"}
    ).json()
    assert payload["accepted"] is False


def test_validate_rejects_digits(client: TestClient) -> None:
    payload = client.post("/api/v1/validate", json={"text": "I have 3 cats."}).json()
    assert payload["accepted"] is False
    assert any("digits" in issue["message"] for issue in payload["issues"])


# --- Dictionary -----------------------------------------------------------------


def test_dictionary_lookup(client: TestClient) -> None:
    payload = client.get("/api/v1/dictionary/record").json()
    assert payload["supported"] is True
    assert len(payload["pronunciations"]) >= 2
    assert payload["pronunciations"][0]["variant"] == 0


def test_dictionary_lookup_unknown_word(client: TestClient) -> None:
    payload = client.get("/api/v1/dictionary/frobnicator").json()
    assert payload["supported"] is False
    assert payload["pronunciations"] == []


def test_dictionary_lookup_compound(client: TestClient) -> None:
    payload = client.get("/api/v1/dictionary/cat-house").json()
    assert payload["supported"] is True
    assert payload["compound"] is True
    assert payload["components"] == ["CAT", "HOUSE"]


# --- Overrides ------------------------------------------------------------------


def test_override_round_trip(client: TestClient) -> None:
    response = client.put(
        "/api/v1/pronunciation-overrides/lead",
        json={"phonemes": ["L", "EH1", "D"], "synthesis_text": "led"},
    )
    assert response.status_code == 200
    assert response.json()["arpabet"] == "L EH1 D"

    listed = client.get("/api/v1/pronunciation-overrides").json()
    assert listed["overrides"][0]["word"] == "LEAD"

    lookup = client.get("/api/v1/dictionary/lead").json()
    assert lookup["override"] == "L EH1 D"

    deleted = client.delete("/api/v1/pronunciation-overrides/lead").json()
    assert deleted["deleted"] is True
    assert client.get("/api/v1/pronunciation-overrides").json()["overrides"] == []


def test_invalid_override_phonemes_are_rejected(client: TestClient) -> None:
    response = client.put(
        "/api/v1/pronunciation-overrides/lead", json={"phonemes": ["L", "QQ", "D"]}
    )
    assert response.status_code == 422
    assert "QQ" in response.json()["error"]


# --- Documents ------------------------------------------------------------------


def test_create_and_read_document(client: TestClient) -> None:
    document_id = create_document(client)
    payload = client.get(f"/api/v1/documents/{document_id}").json()
    assert payload["title"] == "Sample"
    assert len(payload["sentences"]) == 4
    assert payload["sentences"][0]["status"] == "pending"


def test_missing_document_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/documents/nope")
    assert response.status_code == 404
    assert response.json()["code"] == "document_not_found"


def test_document_validation_route(client: TestClient) -> None:
    document_id = create_document(client)
    payload = client.post(
        f"/api/v1/documents/{document_id}/validate", json={"mode": "practical"}
    ).json()
    assert payload["accepted"] is True
    assert payload["statistics"]["paragraphs"] == 2


def test_document_listing(client: TestClient) -> None:
    create_document(client)
    listing = client.get("/api/v1/documents").json()
    assert len(listing) == 1
    assert listing[0]["characters"] > 0


def test_empty_document_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/documents", json={"text": ""})
    assert response.status_code == 422


# --- The full workflow ---------------------------------------------------------


def test_validation_to_job_to_playback_to_export(client: TestClient) -> None:
    document_id = create_document(client)

    validation = client.post(
        f"/api/v1/documents/{document_id}/validate", json={"mode": "practical"}
    ).json()
    assert validation["accepted"] is True

    status = synthesize(client, document_id)
    assert status["status"] == "completed"
    assert status["completed_units"] == 4
    assert status["generated_duration_seconds"] > 0

    document = client.get(f"/api/v1/documents/{document_id}").json()
    assert all(s["status"] == "complete" for s in document["sentences"])

    sentence_id = document["sentences"][0]["id"]
    audio = client.get(f"/api/v1/sentences/{sentence_id}/audio")
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"
    assert audio.content[:4] == b"RIFF"

    export = client.post(
        f"/api/v1/documents/{document_id}/exports",
        json={"scope": "document", "voice_id": "af_heart", "speed": 1.0},
    )
    assert export.status_code == 201
    export_payload = export.json()
    assert export_payload["status"] == "complete"

    download = client.get(export_payload["download_url"])
    assert download.status_code == 200
    assert download.content[:4] == b"RIFF"
    assert len(download.content) == export_payload["byte_size"]


def test_repeated_job_hits_the_cache(client: TestClient, services: AppServices) -> None:
    first_document = create_document(client)
    synthesize(client, first_document)
    engine = services.engine
    assert isinstance(engine, FakeSpeechEngine)
    calls_after_first = engine.call_count

    second_document = create_document(client)
    status = synthesize(client, second_document)
    assert status["cache_hits"] == 4
    assert engine.call_count == calls_after_first


def test_job_for_invalid_document_is_422(client: TestClient) -> None:
    document_id = create_document(client, "The frobnicator sat.")
    response = client.post(
        f"/api/v1/documents/{document_id}/synthesis-jobs",
        json={"voice_id": "af_heart", "speed": 1.0},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation"


def test_invalid_speed_is_rejected(client: TestClient) -> None:
    document_id = create_document(client)
    response = client.post(
        f"/api/v1/documents/{document_id}/synthesis-jobs",
        json={"voice_id": "af_heart", "speed": 3.0},
    )
    assert response.status_code == 422


def test_unknown_voice_is_reported(client: TestClient) -> None:
    document_id = create_document(client)
    status = synthesize(client, document_id, voice="not_a_voice")
    assert status["status"] == "failed"


def test_job_cancellation(client: TestClient) -> None:
    document_id = create_document(client)
    created = client.post(
        f"/api/v1/documents/{document_id}/synthesis-jobs",
        json={"voice_id": "af_heart", "speed": 1.0},
    ).json()
    response = client.post(f"/api/v1/synthesis-jobs/{created['id']}/cancel")
    assert response.status_code in {200, 409}


def test_missing_job_is_404(client: TestClient) -> None:
    response = client.get("/api/v1/synthesis-jobs/nope")
    assert response.status_code == 404


# --- Sentences ------------------------------------------------------------------


def test_audio_before_synthesis_is_404(client: TestClient) -> None:
    document_id = create_document(client)
    sentence_id = client.get(f"/api/v1/documents/{document_id}").json()["sentences"][0]["id"]
    assert client.get(f"/api/v1/sentences/{sentence_id}/audio").status_code == 404


def test_sentence_regeneration_with_a_new_voice(client: TestClient) -> None:
    document_id = create_document(client)
    synthesize(client, document_id)
    sentence_id = client.get(f"/api/v1/documents/{document_id}").json()["sentences"][0]["id"]

    response = client.post(
        f"/api/v1/sentences/{sentence_id}/regenerate",
        json={"voice_id": "am_michael", "speed": 1.0},
    )
    assert response.status_code == 200
    assert response.json()[0]["status"] == "complete"


def test_sentence_regeneration_with_a_variant_selection(client: TestClient) -> None:
    document_id = create_document(client, "I read the book.")
    synthesize(client, document_id)
    sentence_id = client.get(f"/api/v1/documents/{document_id}").json()["sentences"][0]["id"]
    before = client.get(f"/api/v1/sentences/{sentence_id}/status").json()[0]["cache_key"]

    response = client.post(
        f"/api/v1/sentences/{sentence_id}/regenerate",
        json={"word": "read", "variant_index": 1},
    )
    assert response.status_code == 200
    assert response.json()[0]["cache_key"] != before


def test_sentence_regeneration_with_a_synthesis_spelling(client: TestClient) -> None:
    document_id = create_document(client, "I lead the way.")
    synthesize(client, document_id)
    sentence_id = client.get(f"/api/v1/documents/{document_id}").json()["sentences"][0]["id"]

    response = client.post(
        f"/api/v1/sentences/{sentence_id}/regenerate",
        json={"word": "lead", "synthesis_text": "led"},
    )
    assert response.status_code == 200
    overrides = client.get(f"/api/v1/pronunciation-overrides?document_id={document_id}").json()
    assert overrides["overrides"][0]["synthesis_text"] == "led"


# --- Exports --------------------------------------------------------------------


def test_export_before_synthesis_is_422(client: TestClient) -> None:
    document_id = create_document(client)
    response = client.post(
        f"/api/v1/documents/{document_id}/exports",
        json={"scope": "document", "voice_id": "af_heart", "speed": 1.0},
    )
    assert response.status_code == 422
    assert "audio is missing" in response.json()["error"]


def test_paragraph_and_sentence_exports(client: TestClient) -> None:
    document_id = create_document(client)
    synthesize(client, document_id)
    sentence_id = client.get(f"/api/v1/documents/{document_id}").json()["sentences"][0]["id"]

    paragraph = client.post(
        f"/api/v1/documents/{document_id}/exports",
        json={
            "scope": "paragraph",
            "voice_id": "af_heart",
            "speed": 1.0,
            "paragraph_index": 1,
        },
    )
    assert paragraph.status_code == 201

    sentence = client.post(
        f"/api/v1/documents/{document_id}/exports",
        json={
            "scope": "sentence",
            "voice_id": "af_heart",
            "speed": 1.0,
            "sentence_id": sentence_id,
        },
    )
    assert sentence.status_code == 201
    assert len(client.get(f"/api/v1/documents/{document_id}/exports").json()) == 2


def test_missing_export_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/exports/nope").status_code == 404
    assert client.get("/api/v1/exports/nope/file").status_code == 404


# --- Reading state --------------------------------------------------------------


def test_reading_state_round_trip(client: TestClient) -> None:
    document_id = create_document(client)
    stored = client.put(
        "/api/v1/reading-state",
        json={
            "document_id": document_id,
            "sentence_index": 2,
            "offset_seconds": 1.5,
            "voice_id": "af_heart",
            "speed": 1.0,
        },
    )
    assert stored.status_code == 200
    restored = client.get("/api/v1/reading-state").json()
    assert restored["document_id"] == document_id
    assert restored["sentence_index"] == 2
    assert restored["offset_seconds"] == 1.5


def test_default_reading_state(client: TestClient) -> None:
    assert client.get("/api/v1/reading-state").json()["sentence_index"] == 0


# --- Safety ---------------------------------------------------------------------


def test_oversized_request_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/documents",
        content=b'{"text":"' + b"a" * (9 * 1024 * 1024) + b'"}',
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413


def test_errors_never_leak_a_stack_trace(client: TestClient) -> None:
    body = client.get("/api/v1/documents/nope").text
    assert "Traceback" not in body
    assert 'File "' not in body


def test_static_assets_are_served(client: TestClient) -> None:
    for path, fragment in (
        ("/static/app.js", "reader-tts local interface"),
        ("/static/styles.css", "--accent"),
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert fragment in response.text


def test_index_declares_an_icon_so_no_favicon_404(client: TestClient) -> None:
    assert 'rel="icon"' in client.get("/").text
