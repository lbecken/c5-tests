# Limitations

Version 1 is a local reader for ordinary English prose, not a general-purpose
text-to-speech platform. These limitations are deliberate, and knowing them is
part of using the application well.

## Dictionary

**1. CMUdict is North American English.** Pronunciations reflect US usage.
British, Irish, Australian and other varieties are not represented, and a word
whose British pronunciation differs will be read the American way.

**2. Dictionary entries can be wrong or missing.** CMUdict is a large
hand-built resource with mistakes and gaps. Proper nouns are covered unevenly,
and technical vocabulary, recent coinages and most names are absent. A word
missing from the dictionary is rejected, not guessed at; add an override to
accept it.

**3. Multiple pronunciations are not resolved from grammar.** A word with
several dictionary entries takes the first one. There is no part-of-speech
tagging and no context analysis.

This is most visible with homographs. CMUdict happens to list the past tense of
`read` and the verb sense of `wind` first, so:

> I read the book yesterday. → correct
> I read books every day. → wrong; you get the past tense

The reader reports the ambiguity, shows every alternative, and lets you pick one
per document or globally. It will not pick for you. Strict mode turns unresolved
ambiguity into an error, so nothing is spoken until you have chosen.

## Pronunciation control

**4. A valid dictionary pronunciation does not guarantee the engine uses it.**
Kokoro keeps its own grapheme-to-phoneme frontend. Version 1 passes normalized
sentence text to the engine, so CMUdict serves as the coverage check, the
inspection surface, the ambiguity report and the override store — not as direct
phoneme control. The adapter reports the phonemes the engine actually chose, so
the two can be compared, and the architecture is ready for direct phoneme
injection when an engine supports it reliably.

**5. Synthesis spelling overrides are an imperfect workaround.** Because
ARPAbet cannot be injected directly, the practical way to force a pronunciation
is to respell the word for the engine — `lead` → `led`. This works well for
homographs and poorly for anything unusual: the respelling is itself run through
the engine's phonemizer, so an odd spelling can produce an odd result. Every
applied respelling is recorded so you can see exactly what was sent.

## Input

**6. Numbers, abbreviations, dates, symbols and unknown words are rejected.**
There is no normalization layer. `3`, `$5`, `Dr.`, `10:30`, `https://…` and
`user@example.com` all produce errors with exact source positions. Rewrite them
as words, or add overrides. This is the central design decision, not an
oversight: the alternative is a reader that quietly invents pronunciations.

**7. There is no automatic language detection.** The application assumes US
English. Text in another language is either rejected word by word or, worse,
read as though it were English.

**8. Some tokenizer decisions are conventions, not analysis.** A trailing
apostrophe is treated as punctuation rather than part of the word, so `the dogs'
bowls` is read as `dogs` followed by a quote — which sounds right, since the
possessive plural is homophonous with the plural. A leading apostrophe is
likewise punctuation, so dictionary words like `'bout` are not matched. Sentence
segmentation is conservative and assumes no abbreviations, which is safe only
because abbreviations are rejected anyway.

**9. Ellipsis is normalized to a period.** A horizontal ellipsis character
becomes `.` in the one-to-one normalization table. Three typed periods are left
alone and read as the engine interprets them.

## Audio

**10. Long-form naturalness depends on the voice.** Kokoro voices differ
noticeably over a chapter. Evaluate with `evaluation/rubric.md` before settling
on one for a long book.

**11. Generation speed varies by hardware.** The model runs on CPU and takes
roughly real time to a few times real time per sentence on a typical laptop.
GPU acceleration is used when available but is not part of the acceptance
criteria and is not required. The model loads once per process, so the CLI pays
that cost on every invocation while the server pays it once.

**12. Output can differ across model or runtime versions.** Neural synthesis is
not guaranteed to be bit-identical across PyTorch versions or hardware. The
cache key includes the model hash, so changing the model invalidates cached
audio rather than mixing generations. For the same reason, the tests never
assert waveform equality.

**13. Prosody is sentence-local.** Each sentence is synthesized independently,
so the engine cannot carry intonation across a sentence boundary. Paragraph and
sentence pauses are inserted afterwards from configuration. This is the price of
sentence-level caching, resumption and navigation, and it is a deliberate trade.

## Scope

**14. One process, one machine.** Concurrency control is per-process, so running
two instances against the same runtime directory could duplicate synthesis work.
Distributed locking is out of scope.

**15. No accounts, sync, or mobile applications.** The reader binds to the
loopback interface and has no authentication, because nothing is exposed. Do not
bind it publicly.

**16. Version 1 formats and features.** WAV export only — no MP3 or FLAC, and
FFmpeg is not a dependency. No EPUB or PDF import, no OCR, no chapter detection,
no voice cloning, no emotion controls, no model training, and no streaming from
a cloud service.

**17. Sentence audio for split sentences.** A sentence long enough to be divided
into several technical chunks is assembled on demand when its audio is
requested, which is slightly slower than the single-chunk path. Playback still
presents it as one navigational unit.

## What is prepared but not built

Interfaces exist for a second speech engine, direct phoneme input and additional
language packs; see the extension points in [ARCHITECTURE.md](ARCHITECTURE.md).
None of these is implemented, and no plugin loader exists. Building one is
worthwhile once at least two real engines or language packs exist, and not
before.
