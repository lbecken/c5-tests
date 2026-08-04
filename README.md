# THE FORECAST IS MEMORY

A thirty-minute interactive radio drama. Berlin, 2026: a numbers station that
went silent in 1989 is transmitting again, and everyone who could explain it is
sealed in an archive under Tempelhof with twenty-eight minutes to go. You are
the examiner on the line. You cannot go anywhere. You can only listen.

Fully voiced — 43 minutes of authored audio across eight characters, generated
with ElevenLabs v3 Dialogue mode. The mystery is solvable by ear alone.

```bash
npx http-server -p 8099 -s game    # then open http://127.0.0.1:8099
```

Tune the receiver to find the carrier, and put headphones on. The clue that
solves it is a sound.

---

## Contents

| | |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | The mystery bible: what happened, the clue chain, the cast, the structure |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | All three endings, step by step (spoilers) |
| [docs/CHANGES.md](docs/CHANGES.md) | What changed from the original brief, and why |
| `game/` | The playable game. Static files, no build step, no network calls |
| `production/` | Script, voice bible, audio pipeline, and the tests |

`production/script.py` is the single source of truth. Everything else —
`game/story.js`, the audio, the manifest — is generated from it.

## Production pipeline

```bash
python3 production/build.py                # validate graph, emit story.js + manifest
python3 production/generate.py             # synthesise, process, mix, align
python3 production/generate.py --ambience  # procedural room tones
python3 production/generate.py --reprocess # re-mix from cached synthesis, no credits
```

`generate.py` is content-hashed and caches raw synthesis separately from
processing, so editing one line regenerates one segment, and iterating on the
mix costs no API credits.

Multi-speaker segments go through **Dialogue mode** so the model gets a whole
exchange as context — interruptions and the pacing of an argument survive,
which per-line synthesis destroys. Clue-bearing audio is segmented into its own
files so it can carry its own processing. **Forced alignment** provides
word-level timings, which drive the synced transcript.

## Tests

```bash
./run-tests.sh
```

- **`production/build.py`** — fixed-point reachability over the scene graph.
  Fails if any scene, flag or ending is unreachable under a satisfiable
  requirement chain, if fewer than three independent contradictions can convict
  the culprit, or if the accusation can be made to depend on the confession.
- **`production/test_clue.py`** — reproduces the browser bench's DSP offline and
  fails if the radiator tick that convicts Nagel is not actually recoverable
  from the shipped audio, with a 1983 archive segment as a negative control.
- **`production/playtest.js`** — drives the real engine in Chromium and checks
  that all three endings are reachable with no dead ends and no JS errors.
- **`production/qa.py`** — transcribes every rendered file with Scribe and
  compares it to the script, catching performance tags spoken aloud, dropped
  lines and truncation across a corpus too large to audition by hand.

These found real defects: an overlay that covered its own buttons, a one-way
door that locked careless players out of the third act, tape processing so
heavy that the confession at the centre of the story was unintelligible, and a
central clue that had been mixed below the passband that carries it.

## Accessibility

The screen is optional. Full synced transcript, per-line replay, no clue that
requires exceptional hearing (every analysis returns a written result as well
as audio), ambience separately mutable, and a clock that advances at scene
boundaries rather than in real time, so listening carefully is never punished.

## Requirements

Python 3.11 with `numpy` and `imageio-ffmpeg`; Node with `playwright` for the
playtest; `ELEVENLABS_API_KEY` only for regenerating audio or running the
transcript QA. The game itself is static files and makes no network calls.
