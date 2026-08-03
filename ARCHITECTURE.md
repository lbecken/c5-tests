# Architecture

- [Orientation](#orientation) — what the pieces are, in plain language
- [Design commitments](#design-commitments)
- [Data flow](#data-flow)
- [Module responsibilities](#module-responsibilities)
- [Language packs](#language-packs)
- [Database schema](#database-schema)
- [Cache-key specification](#cache-key-specification)
- [Synthesis job lifecycle](#synthesis-job-lifecycle)
- [Audio handling](#audio-handling)
- [Extension points](#extension-points)

## Orientation

Read this section first if you are new to the project. It explains what each
external piece is, why it is here, and how they fit together. The sections after
it assume you already know all that.

### The problem this solves

A text-to-speech engine will read anything you give it. Hand it `Frobnicator`,
`Dr.`, `2026` or a French sentence, and it produces something confident and
often wrong — with no indication that it guessed.

This application refuses to guess. Before any audio is generated, every word is
checked against a pronunciation dictionary. A word the dictionary does not have
is an error with an exact position in your text, not an invention. That single
decision explains most of the architecture: the dictionary, the validation
report, the override system and the language packs all exist to support it.

### The components

**Kokoro** is the speech engine — an 82-million-parameter neural
text-to-speech model, roughly 310 MB, released under Apache 2.0. It runs
locally on the CPU and turns text into a waveform. It is *not* a cloud service
and nothing is sent anywhere. It supports several languages with one shared
model, and ships a set of voices; a voice is a small file (about half a
megabyte) that determines who the reader sounds like.

Kokoro has its own opinion about how to pronounce things: internally it converts
letters to sounds with its own grapheme-to-phoneme frontend. The application
does not replace that. It uses dictionaries to decide *whether it will let* text
reach the engine at all, and to show you what the engine chose.

**CMUdict** is the Carnegie Mellon Pronouncing Dictionary — about 126,000
English words with their pronunciations, hand-built over decades and free to
redistribute. It is the English coverage check: if a word is in CMUdict, the
reader will speak it; if not, it stops and tells you. It also records that many
words have *more than one* pronunciation (`record` the noun and `record` the
verb), which is what lets the reader flag ambiguity instead of silently picking.

CMUdict writes pronunciations in **ARPAbet**, an ASCII notation where
`lead` is `L EH1 D`. The digits mark stress: `1` primary, `2` secondary, `0`
unstressed.

**ipa-dict** is the equivalent for French — about 245,000 words, MIT licensed.
It writes pronunciations in **IPA**, the International Phonetic Alphabet, so
`l'homme` is `lɔm`. IPA is used for French rather than ARPAbet because ARPAbet
cannot express French sounds such as the nasal vowel in *vent* (`ɑ̃`), and
because Kokoro itself reports IPA — so the dictionary's answer and the engine's
actual output can be compared symbol for symbol.

**A language pack** ties those together. It says: these are the letters this
language uses, this is its dictionary and notation, these words decompose this
way, these voices may speak it, and this is the code Kokoro wants. Three are
bundled — US English, British English, French — and the rest of the application
never branches on language; it asks the pack.

**The cache** stores generated audio so a sentence is never synthesized twice.
Synthesis on a CPU is slow — roughly real time — so this is the difference
between a usable reader and an unusable one. Each sentence is stored under a key
derived from everything that could change the sound: the text, voice, speed,
language, model version and any pronunciation overrides. If any of those change,
the key changes and the audio is regenerated. Nothing is ever stale.

**A synthesis job** walks a document sentence by sentence, writing each
outcome to the database as it goes. That is what makes progress survive a page
refresh, cancellation take effect promptly, and an interrupted run resume where
it stopped rather than starting the chapter again.

**SQLite** holds documents, sentences, jobs, overrides and cache metadata in a
single file. Audio never goes in the database; rows point at files on disk.

**FastAPI** serves the local HTTP API and the single-page interface, bound to
`127.0.0.1`. The CLI and the web interface are two front ends over exactly the
same services, so they cannot disagree.

### One sentence, end to end

Say you type *"Please record the record."* and press Validate.

1. **Canonicalize.** Line endings are normalized. This is the only step that may
   change the text's length, and everything afterwards indexes into the result,
   so reported positions always point at the right characters.
2. **Normalize characters.** Curly quotes become straight ones, and so on —
   strictly one character for one character, so offsets stay exact. The text you
   typed is stored unchanged for display.
3. **Tokenize.** The text becomes words, punctuation and whitespace, each
   carrying its exact start and end. `don't` stays one word; so does `l'homme`.
4. **Segment.** Paragraphs split on blank lines, sentences on `.`, `?` and `!`
   followed by whitespace.
5. **Look up every word.** `PLEASE`, `RECORD`, `THE` go to CMUdict. All are
   found — but `RECORD` has two pronunciations, so it is reported as ambiguous.
   Had you written `Frobnicator`, this is where it would have failed, with the
   character positions of that word.
6. **Report.** You get counts, and a list of issues: errors block synthesis,
   warnings do not. The ambiguity for `record` appears with both alternatives,
   and you may pick one.
7. **Prepare.** The sentence becomes engine-ready text: whitespace collapsed,
   any pronunciation respellings applied, and — if it is very long — split at a
   safe boundary such as a semicolon.
8. **Check the cache.** The key is computed. If this exact sentence, voice,
   speed, language and override state has been spoken before, the existing file
   is returned and the model is not touched.
9. **Synthesize.** Otherwise Kokoro produces a waveform, which is checked for
   NaN values, silence and implausible length before it is trusted.
10. **Store.** The audio is written to a temporary file and atomically renamed
    into place, and a metadata row is inserted.
11. **Play or export.** The reader plays sentences individually, or assembles
    them into one WAV with configured pauses between sentences and paragraphs.

### What each dependency is for

| Dependency | Why it is here |
| --- | --- |
| Kokoro + PyTorch | The neural speech model, run locally on the CPU |
| CMUdict | English pronunciations and coverage checking |
| ipa-dict | French pronunciations and coverage checking |
| FastAPI + uvicorn | The local HTTP API and static page |
| Pydantic | Typed, validated settings and API models |
| SQLite (standard library) | Documents, jobs, overrides, cache metadata |
| NumPy | Sample arrays |
| SoundFile | Reading and writing WAV files |

There is deliberately no React, Redis, Celery, PostgreSQL or Docker
requirement. The interface is plain HTML, CSS and JavaScript with no build step.

## Design commitments

Five decisions shape everything else.

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
5. **Language is chosen, never detected.** A document belongs to one language,
   named explicitly. Everything language-specific lives in a language pack, so
   nothing else in the system branches on it.

## Data flow

```
Input text + chosen language
    ↓  get_pack                   the language pack supplies every rule below
    ↓  canonicalize_source        line endings only; this becomes the stored text
    ↓  normalize_characters       one-to-one; offsets preserved
    ↓  tokenize(policy)           words, punctuation, whitespace, paragraph breaks
    ↓  split_paragraphs           blank-line delimited
    ↓  split_sentences            . ? ! followed by whitespace or a close + whitespace
    ↓  PronunciationResolver      overrides > variant > dictionary > decomposition
    ↓  analyze                    ValidationReport: errors block, warnings do not
    ↓  prepare_sentence           synthesis text, respellings, long-sentence chunks
    ↓  SynthesisService           cache lookup, then engine, then validation
    ↓  KokoroSpeechEngine         the only module that imports kokoro or torch;
    ↓                             one pipeline per language, one shared model
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
| `languages/base.py` | What a language pack is: policy, dictionary, voices, rules |
| `languages/packs.py` | The three bundled packs |
| `languages/registry.py` | Pack lookup, voice-to-language ownership, voice defaulting |
| `text/characters.py` | Character policies and the one-to-one normalization table |
| `text/tokenizer.py` | Single-pass tokenizer; tokens cover the input exactly |
| `text/paragraphs.py` | Blank-line paragraph segmentation |
| `text/sentences.py` | Conservative sentence segmentation |
| `text/punctuation.py` | Engine-facing punctuation rewriting (length may change) |
| `text/validator.py` | Produces the `ValidationReport`; depends on a `WordResolver` protocol, not on the dictionary |
| `pronunciation/arpabet.py` | The ARPAbet inventory (English) and phoneme validation |
| `pronunciation/ipa.py` | The French IPA inventory, including nasal vowels |
| `pronunciation/phonemes.py` | One interface over both notations, so nothing else cares which |
| `pronunciation/cmudict_loader.py` | Parses CMUdict; reports malformed lines rather than raising |
| `pronunciation/ipadict_loader.py` | Parses ipa-dict, skipping multi-word phrases |
| `pronunciation/dictionary.py` | In-memory lookup, plus hyphen, elision and ligature decomposition |
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

## Language packs

Three languages are bundled. Adding a fourth means adding a pack and
registering it — the tokenizer, cache, job runner and API do not change.

| | US English | British English | French |
| --- | --- | --- | --- |
| Code | `en-us` | `en-gb` | `fr-fr` |
| Dictionary | CMUdict, 126k words | CMUdict | ipa-dict, 245k words |
| Notation | ARPAbet (`L EH1 D`) | ARPAbet | IPA (`lɔm`) |
| Kokoro code | `a` | `b` | `f` |
| Extra letters | — | — | accented and ligatures |
| Decomposition | hyphen | hyphen | hyphen, elision, ligature |
| Voices | 4 | 2 | 1 |

A pack carries:

- **a character policy** — which characters count as letters. French accepts
  `é à ç œ` and the rest; English does not, so French text pasted while English
  is selected is reported rather than mangled;
- **a dictionary and notation** — which file to load, which loader parses it,
  and whether pronunciations are ARPAbet or IPA;
- **decomposition rules** — how a word not in the dictionary may still be
  resolved;
- **voices** — a voice belongs to exactly one language;
- **the engine's language code** — Kokoro wants a single letter.

### Word decomposition

A word absent from the dictionary is not immediately an error. It is tried
against the pack's decomposition rules first, in this order, and the whole-word
entry always wins if it exists:

| Rule | Example | Result |
| --- | --- | --- |
| Elision | `l'homme` | `L'` + `HOMME` → `lɔm` |
| Hyphen | `mother-in-law`, `avez-vous` | each component looked up |
| Ligature | `oeufs` | folded to `œufs` → `ø` |

Elision is why French works at all: `l'homme`, `qu'il` and `s'il` are not
dictionary entries, but they are entirely ordinary French. Ligature folding
exists because keyboards produce `oeuf` where the dictionary holds `œuf`. Both
are recorded on the resolution, so nothing is silently transformed. A word such
as `aujourd'hui` contains an apostrophe but *is* a dictionary entry, so it is
matched whole and never decomposed.

### Voices and languages

A voice is trained on one language. A French voice reading English produces
fluent-sounding nonsense, so the pairing is enforced: requesting `af_heart` for
a French document is refused before the job starts, with a message naming the
voices that would work. Omitting the voice selects the language's default —
which is why French, having exactly one voice, needs no choice at all.

### One model, several pipelines

Kokoro loads once. A *pipeline* — the language-specific frontend that turns
letters into sounds — is created per language on first use and then reused. The
marginal cost of a second language is therefore small, and the model file is
hashed into the cache key only once.

## Database schema

SQLite with foreign keys enabled and explicit migrations tracked in
`PRAGMA user_version`. Audio is never stored in the database; rows reference
files under the runtime directory.

```
documents(id, title, original_text, text_hash, created_at, language)
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
                        note, notation, created_at, updated_at)
application_state(key, value, updated_at)
```

`sentence_audio.cache_key` is a soft reference: cache entries can be pruned
without destroying a document's structure, and the missing audio is simply
regenerated.

Note that SQLite treats NULLs as distinct in a UNIQUE constraint, so
`pronunciation_overrides` carries an additional expression index on
`(scope, COALESCE(document_id, ''), word)` to make global overrides genuinely
unique.

`documents.language` and `pronunciation_overrides.notation` were added by
migration 2. Both default to what existing rows already implied — `en-us` and
`arpabet` — so a database created before French existed keeps working untouched.
The notation must be stored because ARPAbet and IPA are parsed differently: one
is space-separated symbols, the other a continuous string.

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
- The same words in two languages never share audio, because `language` is part
  of the key — English and French *correction* are spelled identically and
  pronounced nothing alike.
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
- **Additional languages.** This is now built rather than merely prepared:
  `LanguagePack` bundles the character policy, dictionary, phoneme inventory,
  decomposition rules and voices, and three packs exist. A fourth needs a pack
  and a registry entry. Kokoro also supports Spanish, Italian, Portuguese, Hindi,
  Japanese and Mandarin; each would need a pronunciation dictionary in a
  supported notation, and the last two would need tokenizer rules for scripts
  that do not delimit words with spaces.
- **New engine or dictionary versions.** Both are hashed into the cache key, so
  swapping either invalidates precisely what it should.

A plugin loader is deliberately absent. It is worth building once at least two
real language packs or engines exist, and not before.
