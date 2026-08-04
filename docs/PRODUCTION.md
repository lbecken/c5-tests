# Production notes

## Why the generated audio is clean

Every voice clip is synthesised dry. No band-limiting, no pre-echo, no packet
loss, no room. All of that is applied live in the browser by `game/js/audio.js`.

This matters for one reason: the player's analysis tools have to be real. If the
"future call" processing were baked into the mp3, then isolating a band or
lifting the quiet detail would be theatre, and the moment where the forensic
analyst asks the player to go and find something in the top of the band would be
a lie with a `solved = true` behind it. Processing at runtime means the alias
tone is genuinely present at a level below comfortable hearing, and the filters
genuinely recover it.

It also means the whole channel design is tunable without spending a single
character of quota.

## Scene → audio

One `text-to-dialogue` request per *segment*. A segment is a run of consecutive
spoken lines; segments are split apart by **beats** — lines whose text is nothing
but a stage direction, like `[a very long silence; only the rain]`. Beats become
timed silences in the engine rather than synthesis requests, because asking a
model to perform a silence is a good way to get a sigh.

Multi-speaker requests are the point of dialogue mode: interruptions, overlaps
and contextual pacing survive, which they do not if you synthesise each character
separately and butt the files together.

```
node tools/generate-audio.mjs --dry-run       # coverage + character cost
node tools/generate-audio.mjs                 # generate new/changed only
node tools/generate-audio.mjs --only S28B,S30
node tools/generate-audio.mjs --force         # rebuild everything
```

Each segment is content-hashed over its text, voice IDs, model and format. Change
one line and only that segment is re-billed. A `seed` derived from the same hash
is sent with every request, so regeneration is reproducible.

Current cost: **~41,000 characters** for the complete game (~46 minutes of
audio).

## Casting

Chosen for separability in a headphones-only medium — no two principals share an
accent region.

| Role | Voice | Register |
|---|---|---|
| Jonah Vale | `YImgdHB2KYPPVa2Ew8pp` | London, 30s |
| Dr Mira Sayegh | `pFZP5JQG7iQjIQuC4Bku` | RP, 40s |
| DI Anika Rao | `zRnPlRhh6uvfi8OMfmwX` | Scottish, 40s |
| Leonie Hart | `TAXL9Duy50pxAXIMCYbu` | Southern English, 20s |
| Emeka Okafor | `F18yf5BixLZCvKiiW0yJ` | West African |
| Declan Boyle | `thYWTC3ObLUgoeN0sEv3` | Cork |
| Elias Grant (voicemail) | `JBFqnCBsd6RMkjVDRZzb` | RP, 50s |
| Dispatcher | `Xb7hH8MSUJpSbSDYk0k2` | British, procedural |
| Facility announcer | `onwK4e9ZLuTAKqWW03F9` | British, flat |

Future selves reuse the present voice deliberately. They are distinguished by
performance direction and by channel processing, never by casting — a different
actor would give the game away in one line.

To recast, change `voice` in `game/js/data/characters.js` and run
`--only` for the affected scenes.

## Pronunciation

`PRONUNCIATION` in `tools/generate-audio.mjs` rewrites synthesis text only;
subtitles always keep the real spelling. If a name comes back wrong, add an entry
there and regenerate just that scene — it is far cheaper than a full rebuild.

Words worth listening for on a first pass: *Sayegh*, *Coupure*, *Halcyon*,
*Okafor*, *kilohertz*, *megajoules*, and the sixteen-digit phase key in `S32A`
and `END3_2200`, which must match each other by ear.

## Channel processing

Defined in `audio.js :: setChannel`.

| Channel | Treatment |
|---|---|
| `direct` | 70 Hz high-pass only |
| `phone` | 300–3400 Hz, compressed |
| `radio` | 320–3000 Hz plus hiss bed |
| `voicemail` | 350–3200 Hz plus modulated-delay tape wobble |
| `studio_feed` | full band, short convolution room |
| `future_J` / `future_M` | 380–2900 Hz, **pre-echo**, packet loss, reconstruction noise |

The pre-echo is the clue. The dry path is delayed and an untreated ghost is mixed
in ahead of it, so the ghost genuinely arrives *before* the syllable. The interval
is the caller's phase signature:

- Jonah — **41 ms**
- Future Mira — **68 ms**
- Future Leonie — **41 ms**, because she is calling from Jonah's night

A player who slows a clip to 60% can hear the difference directly. `S18` and `S30`
are where it pays off.

## The alias

In the `studio` ambience, once `studio_baseline` is set and the crystal has not
been removed, a 7620 Hz sine runs at a gain of 0.005 — roughly 46 dB under the
dialogue — with a slow shimmer on it, plus a relay tick landing on exactly the
same sample every second alongside the escapement, which is deliberately given a
few milliseconds of jitter so the two are distinguishable.

7620 Hz is what 22.1 kHz folds down to through a recording chain sampling at
around 29.7 kHz. The number is chosen to be recoverable rather than to be
audited, but the fold-down is a real phenomenon and the tick difference is a real
forensic distinction.

`S23` asks the player to find it with `isolate_high` + `boost`. Skipping the
puzzle is allowed and costs evidence `E06`, not the case.

## Everything else

There are no ambience or SFX files. Rain, ventilation, mains hum, the array's
sub-bass throb and cryo pump, the clock, the transformer arc, the phase-lock
swell, the collapse and the switchboard are all synthesised per-scene from
oscillators and generated noise buffers. Scene data fires one-shots by name and
offset:

```js
sfx: [{ at: 26, id: 'transformer' }]
```

Adding a new effect means adding a function to the `SFX` table in `audio.js`.
