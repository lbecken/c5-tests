# Murder at the Europa Summit

An audio-first branching murder mystery. Nine kilometres under Europa's ice, the
architect of a disarmament treaty is dead inside a chamber that could only be sealed
from within. An icequake has cut the ascent shaft. Seven people are awake in seven
sealed pods, and you are the only one with nothing to gain.

You play the Neutral Incident Examiner. You never walk a corridor — you work an audio
console: interview delegates over isolated channels, pull medical and engineering
records, replay the dead man's last recording, and eventually name someone.

Roughly **40 minutes** per playthrough. Fully voiced with ElevenLabs v3 dialogue mode.
Headphones recommended. It is meant to be difficult; most examiners close the wrong case.

---

## Play it

The game loads its script over `fetch`, so it needs to be served over HTTP — opening
`index.html` from the filesystem will not work.

```bash
cd game
python3 -m http.server 8765
# then open http://localhost:8765
```

Progress saves to `localStorage` automatically.

**Controls** — `Space` pause/resume · `S` skip · `R` replay scene · `C` case file ·
`1`–`9` pick a choice · `Esc` close panels.

---

## What's in it

| | |
|---|---|
| Speaking characters | 6 (plus the player) |
| Scene nodes | 58 — 55 with dialogue, 3 hubs |
| Spoken lines | 496 |
| Script | ~11,400 words |
| Evidence items | 21 |
| Choice points | 51 |
| Endings | 3, each with a policy coda |
| Environmental beds | 9 locations, crossfaded and ducked under dialogue |
| Sound effects | 9 |

The murder is solvable from audio alone. The case file is a convenience, not a crutch.

---

## Structure

```
game/
  index.html  style.css  engine.js
  data/
    config.json         cast, evidence catalogue, ambience/SFX prompts, endings
    scenes_act1..5.json the script — every line, choice, flag and condition
    cues.json           per-line audio timings (generated)
  audio/
    scenes/    one mp3 per scene, rendered as multi-speaker dialogue
    ambience/  9 looping location beds
    sfx/       9 one-shots
docs/
  MYSTERY_BIBLE.md      canonical timeline, solution, clue chain, answer key
  CHARACTERS.md         cast and voice direction
  CHANGES_FROM_BRIEF.md what changed from the source PDF plan, and why
tools/
  generate_audio.py     ElevenLabs production pipeline
  validate.py           graph integrity: references, reachability, dead ends
  playtest.py           headless playthroughs; proves every ending is reachable
  browser_test.py       drives a real browser through a full run
```

**`docs/MYSTERY_BIBLE.md` is a complete spoiler.** Play first.

---

## Regenerating the audio

```bash
export ELEVENLABS_API_KEY=...
python3 tools/generate_audio.py --all              # everything (~68k characters)
python3 tools/generate_audio.py --scenes --dry-run # cost estimate, no API calls
python3 tools/generate_audio.py --scenes --only s04_final_recording --force
```

Scenes are cached by content hash — editing one line re-renders only that scene.

Each scene is a single `text-to-dialogue` request so that v3 handles multi-speaker
pacing, interruptions and emotional cues, rather than splicing single-voice takes.
The `/with-timestamps` variant returns `voice_segments`, which is what drives subtitle
sync. Scenes are split into runs at two boundaries: stage-direction-only lines
(`[silence]`), which become real beats of digital silence, and transitions in and out
of archival voices, so the band-pass on Rook's recordings applies to just his segments.

If a scene's audio is missing, the engine falls back to timed text so the game stays
playable.

## Checks

```bash
python3 tools/validate.py      # graph integrity + word/character budget
python3 tools/playtest.py      # four simulated runs, one per ending + a control
python3 tools/browser_test.py  # needs the http.server above running
```
