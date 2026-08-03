# Limitations

This is a local reader for ordinary prose in three supported languages, not a
general-purpose text-to-speech platform. These limitations are deliberate, and
knowing them is part of using the application well.

## Dictionary

**1. CMUdict is North American English.** Pronunciations reflect US usage.
Irish, Australian and other varieties are not represented.

This matters most for **British English**, which is bundled as a language pack
but validated against CMUdict, because no comparable British dictionary is
bundled. The voice and the engine's frontend are British; the *coverage check
and the reported pronunciations* are American. In practice this is a good deal —
the two share almost all their vocabulary — but a word the two varieties
pronounce differently will be shown with its American pronunciation while being
spoken with a British accent. Words that exist only in British usage may be
missing altogether.

**2. Dictionary entries can be wrong or missing.** Both dictionaries are large
hand-built resources with mistakes and gaps. Proper nouns are covered unevenly,
and technical vocabulary, recent coinages and most names are absent. A word
missing from the dictionary is rejected, not guessed at; add an override to
accept it.

The French dictionary's coverage of inflected forms is uneven in particular.
A concrete example found while building the evaluation corpus: `clair` and
`clairs` are present, but the feminine `claire` is not. Nothing is wrong with
the application when this happens — it is the dictionary being incomplete, and
the reader is telling you rather than inventing a pronunciation.

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

**3a. French has one voice, and it is not as good as the best English one.**
Kokoro ships exactly one French voice, `ff_siwis`, graded B− by its authors on
under eleven hours of training data. Compare `af_heart`, the best English voice,
at grade A. Kokoro's own documentation warns that non-English support is "thin
due to weak G2P and/or lack of training data", naming French specifically.

For a learner this deserves emphasis: French output here is a useful listening
reference, not a model to imitate closely. Verify anything you intend to
reproduce against a native speaker or a reference recording.

**3b. French liaison and elision are the engine's decisions, not the
dictionary's.** The reader validates and reports word-by-word pronunciations,
but liaison — the linking consonant in *les arbres* — happens *between* words
and is produced by the engine's own frontend. The dictionary cannot confirm it
was done correctly. In testing it is handled well, but it is not checked.

## Pronunciation control

**4. A valid dictionary pronunciation does not guarantee the engine uses it.**
Kokoro keeps its own grapheme-to-phoneme frontend. The reader passes normalized
sentence text to the engine, so the dictionaries serve as the coverage check,
the inspection surface, the ambiguity report and the override store — not as
direct phoneme control. For French this is easier to check than for English,
because the dictionary and the engine both speak IPA, so the two can be compared
symbol for symbol. The adapter reports the phonemes the engine actually chose, so
the two can be compared, and the architecture is ready for direct phoneme
injection when an engine supports it reliably.

**5. Synthesis spelling overrides are an imperfect workaround.** Because
phonemes cannot be injected directly, the practical way to force a pronunciation
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

**7. There is no automatic language detection.** The language is a property of
the document and you choose it. Text in a language other than the one selected
is rejected word by word — which is the intended behaviour, not a failure. The
cost is that pasting French while English is selected produces a wall of errors
rather than a single helpful message.

A language the application does not bundle cannot be read at all. Kokoro itself
also supports Spanish, Italian, Portuguese, Hindi, Japanese and Mandarin, but
each needs a pronunciation dictionary before it could be added here, and the
last two would need tokenizer rules for scripts that do not separate words with
spaces.

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

**9a. French accents are required, and ligature folding is one-way.** `clés`
and `cles` are different words: the unaccented spelling is simply not in the
dictionary and is rejected. Ligatures are more forgiving — `oeufs` is folded to
`œufs` — but only in that direction, and only for `oe` and `ae`. A word where
`oe` is genuinely two vowels rather than a ligature is unaffected, because the
folded spelling would not be in the dictionary either.

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

**13a. Homograph defaults are per-language and equally unresolved.** French has
its own set — `plus`, `est`, `tous`, `content`, `portions` — and like the
English ones they take the dictionary's first pronunciation without consulting
grammar. The reader reports them and offers the alternatives.

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

Interfaces exist for a second speech engine and for direct phoneme input; see
the extension points in [ARCHITECTURE.md](ARCHITECTURE.md). Neither is
implemented.

Language packs *are* built — three of them — so the abstraction is now proven
rather than speculative. A plugin loader is still absent, and remains
unjustified: adding a language means adding a pack and a registry entry, which
is a smaller change than a loader would be.
