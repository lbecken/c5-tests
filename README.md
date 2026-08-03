# reader-tts

A dictionary-controlled offline text-to-speech reader for English and French.

Paste plain prose, check every word against a pronunciation dictionary before
anything is spoken, then generate speech sentence by sentence with a local
neural model. Nothing leaves the machine, and after installation nothing needs
the network.

The goal is understandable, reasonably clear speech with correct lexical
pronunciation and usable sentence cadence. Natural acting, voice cloning,
emotional expression and document normalization are explicitly out of scope.

**Languages:** US English and British English, validated against CMUdict; French,
validated against ipa-dict. The language is chosen per document — it is never
guessed from the text.

## What makes it different

Most readers guess at anything they are given. This one refuses to.

- **Every word is validated first.** A word that is not in the pronunciation
  dictionary is an error with an exact source position, not a guess.
- **The language is yours to choose.** No auto-detection, and a voice may only
  speak the language it was trained on.
- **Ambiguity is surfaced, not hidden.** `record`, `read`, `wind` and friends
  are reported with all their dictionary pronunciations, and you choose.
- **Nothing is silently rewritten.** Punctuation is normalized through a
  documented one-to-one table; every other transformation is recorded and shown.
- **Sentence-level everything.** Each sentence is validated, hashed, synthesized,
  cached and played independently, so progress survives a refresh and a failed
  sentence never costs you a chapter.

## System requirements

- Python 3.12 or newer
- About 1.5 GB of disk: roughly 310 MB of model weights and the rest for PyTorch
- 4 GB of RAM is comfortable; the model runs on CPU
- Linux, macOS or Windows. No GPU is required, and GPU support is not part of
  the acceptance criteria.
- No FFmpeg, no Docker, no database server

## Installation

```bash
git clone <this repository>
cd reader-tts

# Dependencies, including the speech engine.
uv sync --extra kokoro

# One-time model download. This is the only step that uses the network.
python scripts/download_model.py
```

Without `uv`:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[kokoro]"
python scripts/download_model.py
```

Verify the installation:

```bash
uv run reader-tts health
uv run reader-tts languages
```

```
en-us   English (United States)
        dictionary: cmudict (arpabet)
        voices:     af_heart, af_bella, am_michael, am_fenrir
en-gb   English (United Kingdom)
        dictionary: cmudict (arpabet)
        voices:     bf_emma, bm_george
fr-fr   Français (France)
        dictionary: ipa-dict-fr (ipa)
        voices:     ff_siwis
```

## Offline operation

After `scripts/download_model.py` has run once, the application never touches
the network:

- CMUdict is committed to this repository under `data/cmudict/` and is never
  fetched at launch.
- Model weights and voices are loaded from local files.
- No telemetry, no analytics, no update checks.
- The tests do not use the network either.

The single caveat is the spaCy pipeline that Kokoro's phonemizer needs.
`scripts/download_model.py` installs it; if you skip that step, the first
synthesis will try to download it and fail on an offline machine. Install it
manually with `uv run python -m spacy download en_core_web_sm`.

## Command-line interface

```bash
# Speak one sentence and write a WAV file.
reader-tts speak "The wind moved through the trees." --voice af_heart --output test.wav

# French. Omitting --voice selects the only French voice automatically.
reader-tts speak "Le vent soufflait doucement." --language fr-fr --output fr.wav

# Validate a file before committing to synthesis.
reader-tts validate chapter.txt
reader-tts validate chapitre.txt --language fr-fr
reader-tts validate chapter.txt --mode strict

# Inspect a word's pronunciations, in the language's own notation.
reader-tts lookup record                       # R AH0 K AO1 R D (ARPAbet)
reader-tts lookup "l'homme" --language fr-fr   # lɔm (IPA)

# Synthesize a whole document into one WAV file.
reader-tts synthesize chapter.txt --output chapter.wav --voice am_michael
reader-tts synthesize chapitre.txt --output chapitre.wav --language fr-fr

# Languages, voices, cache and dictionary maintenance.
reader-tts languages
reader-tts voices --language fr-fr
reader-tts cache stats
reader-tts cache clean
reader-tts dictionary verify

# Pronunciation overrides.
reader-tts override set --word lead --phonemes "L EH1 D" --synthesis-text led
reader-tts override list
reader-tts override delete --word lead

# The local web interface.
reader-tts serve
```

`reader-tts speak` prints what it did:

```
Validation: passed
Words: 6
Ambiguous pronunciations: 3
Voice: af_heart
Speed: 1.00
Cache: miss
Generated duration: 2.30 seconds
Output: test.wav
```

Running it again reports `Cache: hit` and does not invoke the model.

Add `--json` to any command for machine-readable output.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | application error |
| 2 | validation failure |
| 3 | engine unavailable |
| 4 | invalid command or configuration |

## Web interface

```bash
reader-tts serve
# Reader is available at http://127.0.0.1:8765
```

The page has four areas: text entry with live counts, a validation report with
clickable source positions and pronunciation alternatives, voice and speed
selection with progress, and a reader with sentence playback, highlighting,
regeneration, a pronunciation editor and WAV export.

Keyboard shortcuts: space plays and pauses, and the left and right arrows move
between sentences.

The reading position, selected voice and speed are stored, so reloading the page
resumes where you stopped.

## Languages

| Language | Code | Dictionary | Notation | Voices |
| --- | --- | --- | --- | --- |
| English (US) | `en-us` | CMUdict, 126k words | ARPAbet, `L EH1 D` | `af_heart`, `af_bella`, `am_michael`, `am_fenrir` |
| English (UK) | `en-gb` | CMUdict | ARPAbet | `bf_emma`, `bm_george` |
| French | `fr-fr` | ipa-dict, 245k words | IPA, `lɔm` | `ff_siwis` |

Choose the language per document — with `--language` on the CLI, the `language`
field in the API, or the selector in the web interface. It is never inferred
from the text, so French pasted while English is selected is reported rather
than mispronounced.

A voice speaks exactly one language. Requesting an English voice for a French
document is refused before synthesis starts. Omitting the voice selects the
language's default, so French needs no choice at all.

**French specifics.** Elision is handled — `l'homme`, `qu'il` and `s'il` resolve
as a clitic plus the following word — as are hyphenated forms like `avez-vous`
and words typed without their ligature (`oeufs` finds `œufs`). Accented letters
are required and preserved: `clés` and `cles` are different words.

**British English** uses the British voices and Kokoro's British frontend, but
CMUdict records *North American* pronunciations, so validation is US-based while
the accent is British. That mismatch is real; see LIMITATIONS.md.

## Supported input

- UTF-8 plain text in a supported language
- Words made of Latin letters, as found in the language's dictionary
- French accented letters and ligatures: `à â ç é è ê ë î ï ô ù û ü œ æ`
- Common contractions: `don't`, `can't`, `I'm`; French elisions `l'`, `d'`, `j'`
- Hyphenated compounds, when the whole spelling is in the dictionary or every
  component is
- Punctuation: `.` `,` `?` `!` `:` `;` `—` `–` `(` `)` `"` `'`
- Paragraph breaks, tabs and line breaks
- Documents from a single sentence to a whole book

Typographic characters are normalized one-for-one before validation, so source
offsets stay exact: curly quotes become straight quotes, a horizontal ellipsis
becomes a period, and non-breaking spaces become ordinary ones. The text you
typed is stored and displayed unchanged.

## Rejected input

These are reported as errors with exact positions, and they block synthesis:

- digits and numbers of any kind — write them as words
- currency symbols, mathematical symbols and the percent sign
- abbreviations such as `Dr.` or `Inc.` that are not dictionary words
- URLs and email addresses
- emoji, markup and non-Latin scripts
- control characters
- any word that is not in the selected language's dictionary and has no override

The reader tells you what it cannot read rather than guessing at it. To accept a
word it does not know, give it a pronunciation:

```bash
reader-tts override set --word frobnicator --phonemes "F R AA1 B N IH0 K EY2 T ER0"
```

### Validation modes

**Practical** (the default): unknown words and unsupported tokens are errors;
multiple pronunciations are warnings.

**Strict**: unresolved pronunciation ambiguity becomes an error too, so nothing
is spoken until you have chosen a reading for every homograph.

## Privacy

- The server binds to `127.0.0.1` and requires deliberate configuration to bind
  anywhere else, which it warns about in the log.
- No authentication, because nothing is exposed beyond the loopback interface.
- Document text is never logged at the normal log level; logs carry identifiers,
  counts and durations.
- Everything written stays inside the configured runtime directory.
- Filenames are sanitized and paths are checked, so nothing you type can
  influence where a file lands.
- Only files registered in the database are served.

## Configuration

Every setting is an environment variable with a `READER_TTS_` prefix. See
`.env.example` for the full list with defaults. Configuration is validated at
startup, and an invalid value fails immediately with a clear message.

```bash
export READER_TTS_DEFAULT_VOICE=am_michael
export READER_TTS_SENTENCE_PAUSE_MS=260
export READER_TTS_MAX_CONCURRENCY=1
```

## Tests

```bash
uv run ruff check .          # lint
uv run mypy src              # static type checking, strict
uv run pytest                # the fast suite: no model, no network
uv run pytest -m real_tts    # smoke tests against the real model
```

The fast suite uses a deterministic fake engine, so it needs neither the model
nor a network connection. The `real_tts` tests need the downloaded model and are
excluded from the default run.

## Troubleshooting

**`the Kokoro model files are missing`** — run `python scripts/download_model.py`,
or set `READER_TTS_MODEL_DIR` if you installed the model elsewhere.

**The first synthesis tries to download something** — the spaCy pipeline is not
installed. Run `uv run python -m spacy download en_core_web_sm`.

**`'<word>' is not in the pronunciation dictionary`** — expected for names,
invented words, abbreviations and anything CMUdict lacks. Rewrite the word or
add an override.

**A homograph is read the wrong way** — CMUdict lists `read` and `wind` with the
past-tense and verb readings first, and the reader does not consult grammar.
Click the alternative in the interface, or set a synthesis spelling:
`reader-tts override set --word lead --phonemes "L EH1 D" --synthesis-text led`.
French homographs (`plus`, `est`, `tous`, `content`) behave the same way.

**Every French word is rejected** — the language is still set to English. Pass
`--language fr-fr`, or pick French in the interface.

**A French override is rejected** — French pronunciations are IPA, not ARPAbet.
Use `reader-tts override set --word oeuf --phonemes "œf" --language fr-fr`.

**Synthesis is slow** — the model runs on CPU and loads once per process. The
CLI pays that cost on every invocation; `reader-tts serve` pays it once. Cached
sentences skip the model entirely.

**Audio does not play in the browser** — check that the sentence finished
generating; its status must read `ready`.

**Cache and database seem inconsistent** — `reader-tts cache stats` reports
orphaned records and files, and `reader-tts cache clean` reconciles them.

**Starting over** — delete the runtime directory. It holds only the database,
cached audio and exports, all of which are regenerated on demand.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — data flow, module responsibilities,
  database schema, cache-key specification, job lifecycle, extension points
- [LIMITATIONS.md](LIMITATIONS.md) — what Version 1 does not do, and why
- [evaluation/rubric.md](evaluation/rubric.md) — the listening evaluation

## Licensing

This source code is MIT licensed; see [LICENSE](LICENSE).

**CMUdict** (`data/cmudict/`) is redistributed here under its own
BSD-2-Clause-style license, © 1993–2015 Carnegie Mellon University. See
`data/cmudict/LICENSE`.

**ipa-dict** (`data/ipadict-fr/`) is redistributed under the MIT license,
© 2016 dohliam. See `data/ipadict-fr/LICENSE`.

**Kokoro** model weights and voices are distributed separately by their authors
under the Apache 2.0 license and are not part of this repository. See
[models/README.md](models/README.md).
