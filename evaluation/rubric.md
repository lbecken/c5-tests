# Listening evaluation rubric

Version 1 is judged by ear, on the curated corpus in `corpus.txt`. The target is
understandable, reasonably clear English with correct lexical pronunciation and
usable sentence-level cadence — not natural acting or emotional expression.

Record the engine version, model identifier and voice with every evaluation. The
`scripts/run_evaluation.py` output already carries those columns.

## Running an evaluation

```bash
python scripts/run_evaluation.py --voice af_heart --speed 1.0
```

This writes one WAV per corpus line under `runtime/evaluation/` and a
timestamped results CSV with the scoring columns left blank. Listen to each
file, score it, and fill in the CSV.

## Criteria

Score each line from 1 to 5.

### 1. Word intelligibility

How reliably each word can be understood in isolation.

| Score | Meaning |
| --- | --- |
| 5 | Every word is immediately clear. |
| 4 | All words are clear; one is very slightly indistinct. |
| 3 | One word needs a second listen. |
| 2 | Several words are hard to make out. |
| 1 | A word is missing or unintelligible. |

### 2. Pronunciation correctness

Whether words are given a valid pronunciation for US English.

| Score | Meaning |
| --- | --- |
| 5 | Every word is pronounced correctly. |
| 4 | All correct, but one homograph took the reading the context did not call for. |
| 3 | One word is mispronounced in a way that is noticeable but not confusing. |
| 2 | A mispronunciation changes the apparent meaning. |
| 1 | Several words are mispronounced. |

Note that a homograph taking the wrong reading is an expected Version 1
limitation, not a defect. Record it and, where it matters, fix it with a
pronunciation override.

### 3. Sentence rhythm

Whether stress and pacing sound like connected speech rather than a word list.

| Score | Meaning |
| --- | --- |
| 5 | Natural phrasing throughout. |
| 4 | Slightly flat, but comfortable. |
| 3 | Noticeably mechanical in places. |
| 2 | Choppy; phrase boundaries fall in odd places. |
| 1 | Word-by-word delivery. |

### 4. Pause appropriateness

Whether punctuation produces perceptible, correctly sized boundaries.

| Score | Meaning |
| --- | --- |
| 5 | Commas, clauses and sentence ends are all clearly and proportionately marked. |
| 4 | Boundaries are present; one is slightly short or long. |
| 3 | A boundary is missing or clearly the wrong length. |
| 2 | Several boundaries are wrong; clauses run together. |
| 1 | No usable phrase structure, or an unexplained multi-second silence. |

### 5. Voice consistency

Whether timbre and loudness stay stable across the sentence and between
sentences.

| Score | Meaning |
| --- | --- |
| 5 | Completely consistent. |
| 4 | A barely perceptible level change between sentences. |
| 3 | Audible loudness pumping between sentences. |
| 2 | Timbre shifts within a sentence. |
| 1 | The voice changes character, or clipping is audible. |

### 6. Long-form listening comfort

Whether the voice remains tolerable over a chapter rather than a sentence.
Score this per voice, over at least five minutes of continuous listening, rather
than per line.

| Score | Meaning |
| --- | --- |
| 5 | Comfortable indefinitely. |
| 4 | Comfortable for a long session. |
| 3 | Tiring after several minutes. |
| 2 | Tiring quickly. |
| 1 | Unpleasant to listen to. |

## Acceptance thresholds

From the specification's quality criteria, on this corpus:

- no missing words in the generated audio;
- no sentence rendered as empty audio;
- at least 95% of test words judged understandable;
- punctuation produces perceptible sentence boundaries;
- no severe clipping;
- no unexplained multi-second silence inside a sentence;
- paragraph boundaries audibly longer than sentence boundaries.

The 95% figure applies to this curated supported-word corpus, not to arbitrary
English.
