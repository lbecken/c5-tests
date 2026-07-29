# Architecture

## Design commitments

Four decisions shape everything else.

1. **Domain logic knows nothing about FastAPI, SQLite or the model.** The CLI
   and the HTTP API are two thin front ends over one `AppServices` container, so
   behaviour cannot drift between them.
2. **Source offsets are sacred.** Text entering the application is canonicalized
   once (line endings only), and every later normalization is strictly
   one-to-one, so every token, sentence and validation issue addresses the exact
   characters the user typed.
3. **The sentence is the unit of work.** Validation, hashing, synthesis,
   caching, playback and recovery all operate per sentence. Nothing ever
   synthesizes a chapter in one call.
4. **Unsupported input is rejected, never guessed.** Every transformation the
   application does apply is recorded and inspectable.

## Data flow

```
Input text
    ↓  canonicalize_source        line endings only; this becomes the stored text
    ↓  normalize_characters       one-to-one; offsets preserved
    ↓  tokenize                   words, punctuation, whitespace, paragraph breaks
    ↓  split_paragraphs           blank-line delimited
    ↓  split_sentences            . ? ! followed by whitespace or a close + whitespace
    ↓  PronunciationResolver      overrides > variant > dictionary > compound
    ↓  analyze                    ValidationReport: errors block, warnings do not
    ↓  prepare_sentence           synthesis text, respellings, long-sentence chunks
    ↓  SynthesisService           cache lookup, then engine, then validation
    ↓  KokoroSpeechEngine         the only module that imports kokoro or torch
    ↓  validate_audio             NaN, silence, duration and ratio safeguards
    ↓  apply_limiter              only when the signal exceeds range
    ↓  AudioFileStore             sharded, atomic WAV write
    ↓  CacheRepository            metadata row
    ↓  playback queue / export    per sentence, or streamed into one file
```

## Module responsibilities

| Module | Responsibility |
| --- | --- |
| `config/settings.py` | Typed, validated, frozen settings from the environment; derives every runtime path |
| `config/defaults.py` | Protocol constants and specification-pinned tuning values |
| `domain/models.py` | Immutable dataclasses shared by every layer |
| `domain/enums.py` | Token kinds, validation codes, statuses, scopes |
| `domain/errors.py` | The stable exception hierarchy the API maps to status codes |
| `text/characters.py` | Character policy and the one-to-one normalization table |
| `text/tokenizer.py` | Single-pass tokenizer; tokens cover the input exactly |
| `text/paragraphs.py` | Blank-line paragraph segmentation |
| `text/sentences.py` | Conservative sentence segmentation |
| `text/punctuation.py` | Engine-facing punctuation rewriting (length may change) |
| `text/validator.py` | Produces the `ValidationReport`; depends on a `WordResolver` protocol, not on the dictionary |
| `pronunciation/arpabet.py` | The ARPAbet inventory and phoneme validation |
| `pronunciation/cmudict_loader.py` | Parses the pinned dictionary; reports malformed lines rather than raising |
| `pronunciation/dictionary.py` | In-memory lookup and compound decomposition |
| `pronunciation/overrides.py` | Override storage, scoped globally or per document |
| `pronunciation/ambiguity.py` | Groups ambiguous words with their alternatives |
| `pronunciation/resolver.py` | Applies the precedence rules; satisfies `WordResolver` |
| `synthesis/base.py` | The `SpeechEngine` protocol and speed validation |
| `synthesis/kokoro_engine.py` | The Kokoro adapter; no Kokoro type escapes it |
| `synthesis/fake_engine.py` | Deterministic engine for tests and offline development |
| `synthesis/chunker.py` | Synthesis text preparation and long-sentence splitting |
| `synthesis/audio_processor.py` | Validation, levels, silence, concatenation, streaming WAV |
| `synthesis/synthesis_service.py` | The only caller of the engine; owns cache lookup and per-key locks |
| `cache/keys.py` | Canonical serialization and SHA-256 key computation |
| `cache/file_store.py` | Sharded, path-checked, atomic audio storage |
| `cache/repository.py` | `audio_cache` rows |
| `cache/cleanup.py` | Statistics and reconciliation |
| `documents/document_service.py` | Documents and their sentence segmentation, in one transaction |
| `documents/progress.py` | Job and sentence-audio state; progress snapshots |
| `documents/job_service.py` | Job creation, execution, cancellation, resumption |
| `documents/exporter.py` | Streaming WAV assembly with sentence and paragraph gaps |
| `database/` | Connection handling and explicit numbered migrations |
| `api/` | Routers, typed schemas, dependency wiring, error mapping |
| `cli/main.py` | The command-line front end |
| `container.py` | Builds and owns the long-lived services |

### Layering note

`cache` depends on `synthesis.audio_processor` (a leaf utility), while
`synthesis.synthesis_service` depends on `cache`. Both packages therefore
re-export nothing from their `__init__.py`, which keeps that relationship
one-directional at import time. Import concrete modules from these two packages.

## Database schema

SQLite with foreign keys enabled and explicit migrations tracked in
`PRAGMA user_version`. Audio is never stored in the database; rows reference
files under the runtime directory.

```
documents(id, title, original_text, text_hash, created_at)
    │
    ├─< sentences(id, document_id, sentence_index, paragraph_index, text,
    │             span_start, span_end, terminal_punctuation)
    │        │
    │        └─< sentence_audio(sentence_id, chunk_index, cache_key, status,
    │                           error_message)
    │                    │
    │                    └──> audio_cache(cache_key, engine, model_id, voice_id,
    │                                     language_code, speed,
    │                                     synthesis_text_hash, audio_path,
    │                                     sample_rate, duration_seconds,
    │                                     byte_size, created_at,
    │                                     last_accessed_at)
    │
    ├─< synthesis_jobs(id, document_id, status, voice_id, speed, total_units,
    │                  completed_units, failed_units, cache_hits,
    │                  synthesized_units, created_at, started_at, completed_at,
    │                  error_message)
    │
    └─< exports(id, document_id, scope, status, voice_id, speed, file_path,
                filename, byte_size, duration_seconds, created_at,
                completed_at, error_message)

pronunciation_overrides(id, scope, document_id, word, phonemes, synthesis_text,
                        note, created_at, updated_at)
application_state(key, value, updated_at)
```

`sentence_audio.cache_key` is a soft reference: cache entries can be pruned
without destroying a document's structure, and the missing audio is simply
regenerated.

Note that SQLite treats NULLs as distinct in a UNIQUE constraint, so
`pronunciation_overrides` carries an additional expression index on
`(scope, COALESCE(document_id, ''), word)` to make global overrides genuinely
unique.

Transactions wrap: document creation with its sentences, job creation, cache
metadata insertion, override changes and export completion.

## Cache-key specification

A cache hit must mean the audio would have been byte-identical. The key
therefore covers everything that can change the output:

```json
{
  "engine": "kokoro",
  "language": "en-us",
  "model": "kokoro-82m",
  "model_hash": "a1b2c3d4e5f60718",
  "override_revision": "3:2026-07-28T12:00:00+00:00|READ=1",
  "settings_version": 1,
  "speed": 1.0,
  "text": "The sentence passed to the engine.",
  "voice": "af_heart",
  "voice_hash": "9f8e7d6c5b4a3021"
}
```

Serialization is deterministic — sorted keys, no insignificant whitespace, speed
rounded to two decimals — and the key is the SHA-256 hex digest of the UTF-8
bytes.

Consequences worth stating explicitly:

- Changing voice or speed produces a distinct entry rather than overwriting one.
- Editing a pronunciation override changes `override_revision`, which
  invalidates exactly the affected audio and leaves everything else cached.
- Replacing the model file changes `model_hash`, invalidating the whole cache.
- `settings_version` is the manual escape hatch: bump it when a change to
  synthesis preparation should invalidate everything.

Speed is quantized to the configured step before it enters the key, so
`1.0` and `1.001` share an entry rather than accumulating near-duplicates.

Files live at `runtime/cache/audio/ab/cd/<key>.wav`, sharded by the first two
byte pairs of the key so no directory grows unmanageable. Writes go to a
temporary file and are renamed into place, so a reader never sees a partial
file. Paths are derived only from hex keys and are re-checked against the cache
root.

## Synthesis job lifecycle

```
          create()                    run()
 PENDING ─────────> (validated) ────────────> RUNNING
                          │                      │
              validation errors                  ├─ every unit succeeded ─> COMPLETED
                          │                      ├─ any unit failed ──────> FAILED
                          v                      └─ cancel requested ─────> CANCELLED
                  ValidationError
```

Per unit:

1. mark the chunk `SYNTHESIZING`;
2. compute the cache key and look it up;
3. on a miss, call the engine, validate the audio, limit it if needed, write it
   atomically and insert the metadata;
4. record the chunk as `COMPLETE` or `FAILED` with its cache key;
5. persist the job counters.

Because every unit's outcome is written immediately:

- **Progress survives a page refresh** — it lives in the database, not in the
  page.
- **Cancellation takes effect promptly** — the loop checks the stored status
  between batches.
- **A restart resumes** — `run()` recomputes the plan, subtracts the units
  already marked complete, and processes the rest. Completed counts are derived
  from stored unit state rather than carried in the job row, and the failure
  count restarts at zero, so units that failed in an earlier attempt are retried
  and a fully synthesized document is not left marked failed.

Concurrency defaults to one unit at a time. Higher values process bounded
batches, applying results in submission order so stored progress always
describes a prefix of the document. Within a process, a per-cache-key lock means
concurrent identical requests collapse into a single synthesis.

Model calls never run on the event loop: job execution happens on a worker
thread, and route handlers are synchronous, so FastAPI runs them in its
threadpool.

## Audio handling

Internally mono float32 at the engine's native rate (24 kHz for Kokoro); WAV
PCM16 on disk.

After each synthesis the output must be non-empty, finite, longer than 80 ms,
shorter than 60 seconds, within a generous duration-to-character ratio, and
above a silence threshold. Failing any of these raises `SynthesisFailedError`
rather than caching unusable audio.

Level control is deliberately conservative: a limiter engages only when the
signal exceeds range, so sentences are not normalized independently and do not
pump in loudness. Mild peak normalization and short fades apply to an assembled
export, not to individual sentences.

Export streams each cached segment block by block into a `StreamingWavWriter`,
inserting configured silence between technical chunks, sentences and paragraphs.
The complete waveform is never held in memory, so a book-length export is
bounded by block size rather than by document length. The header is fixed up on
close and the file is atomically renamed.

## Extension points

Prepared but deliberately not implemented in Version 1:

- **Alternative engines.** `SpeechEngine` is the whole contract: `name`, `info`,
  `list_voices`, `voice_config`, `voice_fingerprint`, `synthesize`, `close`.
  `FakeSpeechEngine` already proves a second implementation fits. A Piper or
  sherpa-onnx adapter needs no change outside `synthesis/`.
- **Direct phoneme input.** The resolver already produces validated ARPAbet for
  every word. When an engine offers reliable phoneme input, the chunker gains a
  phoneme path alongside the text path; nothing else moves. Until then,
  `synthesis_text` respellings are the practical control.
- **Additional languages.** `language_code` is already threaded through requests
  and cache keys. A language pack would bundle tokenizer rules, a dictionary, a
  phoneme inventory and a default engine configuration. The boundary exists; the
  abstraction is not built, because one language does not justify it.
- **New engine or dictionary versions.** Both are hashed into the cache key, so
  swapping either invalidates precisely what it should.

A plugin loader is deliberately absent. It is worth building once at least two
real language packs or engines exist, and not before.
