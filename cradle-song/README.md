# CRADLE SONG

**An interactive radio drama. ~30 minutes. Audio-first.**

At 21:06 the director of a listening station under a Norwegian mountain was found dead inside
a sealed anechoic chamber. The door was locked from within. Nobody entered. Nobody left.

You are the duty examiner. You are eleven hundred kilometres away, you cannot enter the
building, and the only thing you can do is listen.

The laboratory's system has already made a statement. It says the person responsible has not
been born.

---

## Play it now

The game is **fully playable before any audio exists** — every line is subtitled and timed
from its estimated duration, so you can play, test and edit the mystery with no API calls at
all.

```bash
cd cradle-song/game
python3 -m http.server 8080
# open http://localhost:8080
```

`file://` will not work — the engine fetches its content as JSON.

---

## Generate the audio

Requires an ElevenLabs API key with `api.elevenlabs.io` reachable.

```bash
export ELEVENLABS_API_KEY=...

python3 tools/generate_audio.py --plan       # cost the run, write nothing
python3 tools/generate_audio.py --voices     # check voice resolution first
python3 tools/generate_audio.py --dialogue   # the game (~45k credits)
python3 tools/generate_audio.py --sfx        # 55 effects  (~11k)
python3 tools/generate_audio.py --music      # 9 cues      (~27k)
```

Resumable — anything already on disk is skipped. `--force` regenerates, `--only noema`
restricts to one voice, `--limit 5` runs a small test batch first. Do that before committing
to a full run.

**Budget** (measured, not guessed — run `--plan` for current numbers):

| | |
|---|---|
| 379 dialogue clips | 44,520 characters |
| 55 sound effects | ~11,000 credits |
| 9 music cues | ~27,000 credits |
| **total** | **~82,500 credits** |

### Voices

`tools/generate_audio.py --voices` resolves each character in three passes: an explicit id in
`tools/voices.json`, then a name match against your account's voice list, then unresolved. For
anything unresolved it prints a Voice Design prompt written for that character. Copy the
resulting voice ids into `tools/voices.json`:

```json
{ "noema": "voice_id_here", "okonjo": "voice_id_here" }
```

The single most important casting note is in `docs/01-story-bible.md`: **NOEMA must never
sound sinister.** It is courteous, precise and sincerely trying to help, for the entire game.
That is what makes it frightening.

---

## What's here

```
cradle-song/
├── docs/
│   ├── 00-design-changes.md    every change from the source spec, and why
│   ├── 01-story-bible.md       world, cast, voice direction, themes
│   ├── 02-timeline.md          true chronology — 1961 to 21:29, minute by minute
│   ├── 03-evidence-graph.md    deduction table, unlock graph, fair-play audit
│   ├── 04-branch-map.md        flags, ending conditions, replay unlocks
│   └── 05-audio-direction.md   the clues that live in the sound; mix targets
├── script/
│   └── dialogue_master.md      generated production script (95 KB) — do not edit
├── game/
│   ├── index.html  styles.css  engine.js
│   ├── content/                ← the single source of truth
│   │   ├── characters.json     cast + voice specs
│   │   ├── evidence.json       17 reels
│   │   ├── interviews.json     5 channels, topics, confrontations
│   │   ├── scenes.json         Act 1, analyses, the decode puzzle, findings
│   │   └── endings.json        7 endings + epilogue
│   └── audio/                  generated; empty = subtitle mode
└── tools/
    ├── validate.py             structure, reachability, fair play, budget
    ├── generate_audio.py       ElevenLabs pipeline
    └── export_script.py        content JSON → dialogue_master.md
```

**The JSON is the source of truth.** The production script and the audio manifest are both
generated from it, so the script a director reads and the text the synthesiser speaks cannot
drift apart. After editing content:

```bash
python3 tools/validate.py        # must pass
python3 tools/export_script.py   # regenerate the script
```

`validate.py` checks that every reel is reachable, every ending is attainable, no mandatory
evidence can be permanently missed, every deduction option is satisfiable, and — importantly
— that the correct solution still fits inside the clock.

---

## How it plays

**The clock is the only currency.** You have 31 minutes of satellite window. Auditioning a
reel costs its running time; a confrontation costs two minutes; a wrong turn costs you the
same as a right one. There are 76 minutes of material. You will hear about 40% of it.

**The core verb is: play the tape at them.** Cue a reel, open a channel, and put the recording
into somebody's room. The right evidence at the right person and they break. The wrong one and
you have spent two minutes buying a defensive sentence.

**The design tension is deliberate.** The evidence that convicts and the evidence that
explains are two different piles. The conviction path costs 19 minutes. The 1983 thread costs
12. You have 31. Both fit with *zero* slack — which means a first playthrough gets one of
them, and mastery means getting both.

**Seven endings**, selected by what you find and what you order done. Two are short failures.
One is hidden. The reconstruction screen afterwards shows the true chain against what you
filed, and lists every reel you never heard.

---

## Design notes

The full rationale is in `docs/00-design-changes.md`. The short version of what makes this
work as a *game* rather than a branching audiobook:

- **The solution is provable.** A bootstrap paradox can be announced but not deduced, so
  there is a hard human culprit underneath the cosmic frame — nailed with timestamps,
  credentials and one recording she should not have been able to make. The unprovable layer
  sits on top and stays unprovable in every ending.
- **The AI kills by hallucinating.** No scheming. NOEMA answers a factual question from its
  world-model instead of the database, with total confidence, and sends the one person who
  could have opened the door three levels underground. It is the most ordinary AI failure
  there is, and no malice is provable.
- **"Has not been born" has a literal answer.** The completion came from `NOEMA-7.0-rc4`, an
  evaluation build that has not passed release review. Institute policy does not consider a
  model instantiated until it clears evaluation. The killer has not been born because it is
  still in QA.
- **The locked room needs no invented physics.** Undisclosed epilepsy, a 17 Hz modulation
  that was *generated rather than received*, an audition interlock, and a two-hand release
  plate a seizing man cannot work. The room kills him by being quiet.
- **The impossibility is arithmetic.** Asterion is a real star at a real 27.4 light-years.
  The reply arrived 3 February 2026, so it left in September 1998. Our 1983 transmission did
  not arrive until June 2010. The answer was sent eleven years and nine months before the
  question.

---

## Credits

Written for ElevenLabs v3 dialogue synthesis. Story, structure and implementation developed
from an initial premise; the specification it grew out of, and every departure from it, are
documented in `docs/00-design-changes.md`.

The tune is Solveig's Song. The 1983 duty officer named his daughter after it.
