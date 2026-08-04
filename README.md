# The Man Who Called From Tomorrow

An audio-first interactive mystery. You are the communications analyst on night
duty at the Ghent emergency coordination centre. At 21:13 a man telephones to
report a murder that has not happened yet — he knows the incident commander's
private call sign, he knows what the substation is about to do, and he says he is
calling at eight seventeen tomorrow morning.

You have forty-seven minutes and four callers who do not agree with each other.

**Runtime:** 38–40 minutes per playthrough · **Endings:** 3 · **Cast:** 6 principals

---

## Play

The game needs to be served over HTTP (Web Audio will not process a `file://`
media element).

```bash
./run.sh            # or: cd game && python3 -m http.server 8080
```

Then open <http://localhost:8080/>.

**Wear headphones.** Some of the evidence is only audible, and one clue sits far
below the dialogue until you go and get it.

### Controls

| | |
|---|---|
| `R` | replay the current line |
| `T` | transcript |
| `N` | evidence notebook |
| `Space` | pause / resume |

The **Audio** panel mixes dialogue, environment and effects separately. Turning
the environment down will not hide anything you need, but the room is part of the
case.

---

## What kind of mystery this is

Fair play, in the strict sense: everything needed to name the method, the hands,
the intent and the nature of the calls is in the audio before the accusation, and
no mandatory clue can be lost through an early choice. The game will mislead you.
It will not withhold from you.

Two things are worth knowing going in:

- **Contradictions are the puzzle, not a twist.** The callers disagree because
  they are calling from different tomorrows, and each one is trying to make its
  own tomorrow the real one. The question is never "who is lying" — it is "which
  future is this person trying to talk me into building".
- **Listening is a verb.** When the forensic analyst says there is something in
  the top of the band, there is genuinely something in the top of the band. The
  isolate / boost / slow tools are real filters running on the real signal.

At 21:58 you commit to a four-part theory on the record, and it is scored for
consistency rather than for one lucky guess. A partly-right statement gets you a
compromised ending, not a failure screen.

---

## Structure

```
game/
  index.html
  css/style.css
  js/
    audio.js              Web Audio: environments, channel processing,
                          enhancement tools, procedural SFX
    engine.js             scene runner, flags, evidence, scoring, save/load
    main.js               interface
    data/
      characters.js       cast + phase signatures
      evidence.js         evidence ledger + accusation definition
      scenes_act1..5.js   the script — 52 scenes, all dialogue
  audio/
    manifest.json         generated
    dialogue/*.mp3        generated
docs/
  CANON.md                the solution. spoilers. do not read first.
  PRODUCTION.md           how the audio is made and how to change it
tools/
  generate-audio.mjs      ElevenLabs text-to-dialogue production
  validate.mjs            scene graph, fair-play and asset checks
```

The script is data, not code. Editing `scenes_act*.js` and re-running the two
tools is the whole content pipeline.

---

## Development

```bash
node tools/validate.mjs                  # graph, fair play, assets, runtime
node tools/generate-audio.mjs --dry-run  # coverage and character cost
node tools/generate-audio.mjs            # generate anything new or changed
node tools/generate-audio.mjs --only S28B
```

`validate.mjs` checks that every exit resolves, every scene is reachable, every
mandatory evidence item sits on the shared spine rather than behind an optional
hub spoke, every unlock flag is actually set by some scene, all three endings are
reachable, and every manifest entry has a file on disk. It also estimates the
runtime of each route.

Generation is content-hashed, so re-running it only bills for lines you actually
changed. `ELEVENLABS_API_KEY` must be set.

---

## Credits

Story and implementation derived from a v1.0 design specification, substantially
revised — see the top of `docs/CANON.md` for what changed and why.

Voices synthesised with ElevenLabs `eleven_v3` text-to-dialogue. Every other
sound in the game — the rain, the ventilation, the array, the clock, the
transformer, the thing in the clock — is generated in the browser at runtime.
