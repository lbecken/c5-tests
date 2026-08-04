# Audio direction

Audio is not decoration here. Six of the seventeen reels carry evidence that exists **only**
in the sound — a hum, a pause length, a room tone that does not match the room somebody
claims to be in. Get these wrong and the mystery stops being fair.

---

## 1. The clues that live in the audio

These must survive mixing, mastering, and a player listening on laptop speakers. Each has a
visual/textual fallback in the engine so no one is locked out, but the audio version should
be the one that lands.

| Clue | Where | Must be audible | Fallback |
|---|---|---|---|
| **400 Hz drive hum** | E01, from the first second | A steady low electrical tone under the whole log — present *before* Bloch touches anything | `ANL_NOISEFLOOR` states it outright |
| **Timecode at 20:41:06** | E03, line `E03_11` | Bloch's voice, clearly, at the marked moment | Timecode rendered beside the line |
| **Quantised pauses** | E08, between number groups | Two lengths only: 600 ms and 1.2 s. No drift, ever | Engine draws the S/L pattern as ticks |
| **Synthetic reader** | E08 | Too clean. No breath noise in the consonants. Unnervingly consistent | `ANL_VOICE` states it |
| **The child** | E08 buried → E14 resolved | Under the carrier: barely there. Resolved: plainly a child | Subtitle |
| **17 Hz throb** | E01 `signal_completion` | A slow deep pulse *felt* more than heard — render as audible harmonics, never as a literal 17 Hz tone | `ANL_SPECTRAL` / E12 |
| **Room mismatch** | Any confrontation | Each suspect's ambience must be instantly distinguishable | Speaker labels |

> **On the 17 Hz:** do not put an actual 17 Hz sine in the file. It will not reproduce on
> consumer hardware, and on hardware where it does reproduce it is genuinely unpleasant.
> Render it as a slow amplitude envelope on audible content — the *rhythm* is the horror,
> not the frequency.

---

## 2. Recurring motifs

**The music box.** Solveig's Song, eight bars, on a small antique movement, slightly slow and
a little out of tune. It appears six times and never twice the same:

1. `music_box_full` — E08, 1983, on tape. The reference version.
2. `child_hum_buried` / `child_hum_clear` — the same tune, hummed, under and then over.
3. `music_box_transmit` — Ending 1. The same eight bars at four hundred kilowatts.
4. `music_box_degrading` — Ending 2. Notes that stop arriving.
5. `music_box_new` — Ending 4. Heard on shortwave, from a new station.
6. `music_box_end` — the epilogue, after every ending. Thin, fragile, unresolved.

**The carrier.** The reply itself. Wide, slow, almost-periodic. The direction that matters:
*it should not sound like a voice, but it should sound like something that knows what a voice
is for.* Not musical. Not mechanical. Structured.

**Silence.** Chamber 2 is rated −9 dBA. When the story is inside it, the noise floor should
drop to something that makes the player check their headphones. The four seconds of hard
silence that open the game exist to teach the player that silence in this game is content.

---

## 3. Per-character space

Each suspect must be identifiable within two seconds, from ambience alone. This matters
mechanically: when you play a reel *into someone's room*, the player should hear whose room.

| Character | Space | Signature |
|---|---|---|
| Okonjo | Glass-walled control room, level −1 | Ventilation, a little too much early reflection off glass |
| Farrow | Decode booth, no windows | Close, dry, small. Mechanical keyboard. Air that has been breathed |
| Haugen | Security office | Faint radio chatter, never intelligible. A clock |
| Rhee | Machine bay | Relays, cooling fans, distant drives. The busiest space in the game |
| NOEMA | **Nothing** | No room. No reflections. It is not anywhere |
| Bloch (archival) | Chamber 2 | Dead. Absolutely dead |
| 1983 material | Shortwave | Atmospheric noise, selective fading, heterodynes |
| Nils Haugen | 1991 cassette | Tape hiss, limited bandwidth, mechanism noise |

NOEMA having *no acoustic space at all* is the single most important production decision in
the game. Every human is somewhere. It is not. Players will not consciously notice; they will
feel it every time it speaks.

---

## 4. Archival processing chains

Generate clean, then degrade. Never ask the synthesiser for "old tape" — it will act it.

**`shortwave_1983`** (The Reader)
```
clean TTS
  → band-limit 300 Hz – 3.2 kHz
  → light AM-style compression
  → add selective fading (slow gain drift, ±3 dB, ~0.1 Hz)
  → atmospheric noise bed at −24 dB
  → occasional heterodyne whistle
  → very light clipping
```

**`cassette_1991`** (Nils Haugen)
```
clean TTS
  → band-limit 80 Hz – 8 kHz
  → wow & flutter (0.3% @ 2 Hz)
  → tape hiss at −38 dB
  → gentle saturation
  → one dropout at the scripted position (E09_06)
```

**`buried_child`** (The Child)
```
clean TTS at half speed
  → mix under the carrier at −26 dB   → the E08 version
  → same source, corrected speed, −6 dB → the E14 version
```
Both must come from **the same take**. If a player compares them, they must match.

**`pa_system`** (Station Voice)
```
clean TTS
  → band-limit 200 Hz – 5 kHz
  → light plate reverb (corridor)
  → slight compression
```

**These chains are implemented** in `tools/postprocess.py`. Clean takes are preserved under
`audio/<speaker>/_master/` and every run reprocesses from those, so the chains can be tuned
and re-applied freely, and `--restore` puts the clean takes back.

```bash
python3 tools/postprocess.py --list     # the plan, and what is deliberately exempt
python3 tools/postprocess.py            # apply
python3 tools/postprocess.py --restore  # undo
```

Requires a real ffmpeg. The container image ships only Playwright's build, which is
compiled `--disable-everything` — webm/VP8 and mjpeg, no mp3 decoder and no audio filters
at all. `.claude/hooks/session-start.sh` installs a full one at session start.

**Two exemptions, both deliberate**, enforced in `postprocess.py` rather than left to
whoever runs it:

- **The Child is never processed.** Both appearances are scripted plain and close. The
  buried-under-the-carrier version is a separate generated cue (`child_hum_buried`), not a
  degraded copy of this take.
- **`EN_rd_07` is left clean.** In the Redundancy ending the Reader's voice arrives with
  *"no degradation at all"* — that absence is the horror beat. It means the thing is not on
  a tape any more. Running the shortwave chain over it would destroy the only point the
  line has.

Measured rolloff above 4 kHz confirms each chain against its designed cutoff: Reader
−31.8 → −48.3 dB (3.2 kHz), Nils −31.1 → −37.3 dB (8 kHz), PA −32.5 → −43.1 dB (5 kHz).

---

## 5. Music

Sparing. Five cues total, none under dialogue that carries a clue.

- **Cold open** — none. The reply is the theme.
- **Lockdown bed** — a single sustained low tone, barely there, under Act 1 only.
- **Decode** — a ticking, accelerating figure during `PZ_DECODE`, stopping dead on the result.
- **The reveal** — when Okonjo breaks: *nothing*. Let her do it in silence. The absence of
  music at the emotional peak is the point.
- **Ending stingers** — one per ending, distinct, 8–15 s.

---

## 6. Mixing targets

- Dialogue: −16 LUFS integrated, true peak −1 dBTP.
- Ambience beds: −34 to −28 LUFS, never masking consonants.
- The 400 Hz hum: −61 dBFS. Audible on headphones, findable by analysis, invisible on
  laptop speakers — which is why `ANL_NOISEFLOOR` exists.
- Hard silence: true digital silence, not room tone.
- No sound in the game should require volume above a comfortable listening level to detect.
  If a clue needs the player to turn it up, the analysis fallback must state it plainly.

**Headphones are advised, never required.** Every audio clue has a stated fallback. A player
on phone speakers in a noisy room must still be able to solve the case.
