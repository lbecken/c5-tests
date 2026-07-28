# The Dancing Demon — a web recreation

A browser recreation of **Dancing Demon**, Leo Christopherson's 1979 animation toy for the
TRS-80 Model I. Compose a tune one note per count, string together eighteen lettered dance
steps, pick a speed, and raise the curtain on a little tap-dancing demon.

No build step and no dependencies — just serve the folder over HTTP:

```sh
cd dancing-demon
python3 -m http.server 8000
# then visit http://localhost:8000
```

(It uses ES modules, so opening `index.html` straight off disk with `file://` will not work.)

## What the original was

Christopherson's *Dancing Demon* shipped on cassette from Radio Shack in 1979–80 and was never
really a game. It was a creativity toy with, for the hardware, extraordinary animation. From the
Tandy manual and contemporary accounts:

- A menu: **1** enter music, **2** enter dance, **3** perform, **4** save to tape.
- Music was entered **one note per count** across two octaves, `Z` for a rest, up to 255 counts.
  There were no half or quarter notes — every note lasted exactly one beat.
- The dance was **eighteen lettered steps** of differing lengths — steps, shuffles, spins, squats,
  stomps — with left and right versions of the same step paired together in the manual.
- You set a **speed from 1 to 255** and a repeat count, the curtain went up, and the demon danced.
- Graphics were 128×48 pseudo-pixels made from 2×3 block glyphs; sound was a square wave banged
  out of the cassette port.

The program later passed into the public domain. This recreation is written from scratch — it
borrows the shape of the thing, not a byte of its code or artwork.

## What this version does

The structure is faithful; the execution is not pretending to be a 1979 emulator.

| Original | Here |
| --- | --- |
| 128×48 block graphics | 192×120 square pixels, nearest-neighbour upscaled, with CRT bloom and scanlines |
| Fixed animation frames | A posed skeleton: per-joint springs for overlapping action and snap, automatic contrapposto, and IK that plants his feet on the boards |
| Eighteen lettered steps | Eighteen lettered steps, `A` to `R`, mirrored in pairs |
| One note per count | One note per count — plus a **Hold** symbol, so melodies can breathe |
| Cassette save | Browser storage, or a copy-and-paste "cassette code" |
| Monochrome silver phosphor | Phosphor, green screen, amber, or a colourised theme |

Extras that weren't in the box: shoe taps on foot-strikes, an audience that gets livelier as the
show goes on, confetti and applause on the bow, and a rehearsal preview — hover any step in the
dance editor and he'll practise it for you.

### Controls

| Where | Keys |
| --- | --- |
| Anywhere | `1` `2` `3` `4` jump to Music / Dance / Perform / Tape, `Esc` drops the curtain |
| Music | `Z S X D C V G B H N J M` lower octave, `Q 2 W 3 E R 5 T 6 Y 7 U` upper, `,` rest, `.` hold, `⌫` backspace, `Space` play |
| Dance | `A`–`R` append a step, `⌫` backspace |
| Perform | `Space` start or stop the show |

## How it is put together

No frameworks — vanilla ES modules and two browser APIs (Canvas 2D and Web Audio), which is
roughly the modern equivalent of what the original had to work with.

| File | What it does |
| --- | --- |
| `js/pixels.js` | 192×120 indexed framebuffer, drawing primitives, a 3×5 font, palette themes, and the CRT presenter |
| `js/demon.js` | The demon: skeleton, pose interpolation, leg IK, spring tail and ears, and the rasteriser |
| `js/moves.js` | The eighteen steps as sparse keyframes on a beat grid, plus routine sampling |
| `js/stage.js` | Curtain, proscenium, footlights, spotlights, audience, confetti, marquee |
| `js/audio.js` | Square-wave synth, shoe taps, curtain rumble, applause, and the tune notation parser |
| `js/tunes.js` | Built-in tunes and routines |
| `js/app.js` | State, the render loop, the show scheduler, and all the editors |

A few notes on the interesting bits:

- **Colour is semantic.** Everything is drawn into slots like `SKIN`, `CURTAIN`, `GLOW`; a theme is
  just a mapping from those slots to RGB. That is why one set of drawing code produces both the
  monochrome phosphor look and the colourised one.
- **The demon is posed, not drawn** — and the interesting part is what happens *after* the
  keyframes. Every channel is driven through its own spring, stiff at the hips and progressively
  looser out through the torso, head and hands. That produces **overlapping action** for free: a
  movement ripples outward instead of every joint arriving together, which is the single biggest
  difference between a puppet and a dancer. The springs are also under-damped, so the keyframes can
  be written as near-steps — hold, jump, hold — and the spring supplies the fast attack and the
  overshoot. That is cartoon timing, and it is why the steps read as snappy rather than floaty.
- **Weight is a first-class channel.** A `weight` value says which foot he is standing on, and the
  rig automatically shifts the pelvis over that foot, raises the weight-bearing hip and drops the
  opposite shoulder — textbook contrapposto. A separate `twist` counter-rotates the shoulders
  against the hips. Between them, he stops looking like he is balancing on both feet at once.
- **The steps are real tap vocabulary.** A *shuffle* is a brush out and a spank back that carries no
  weight, so he stays planted on the other leg and does not travel. A *flap* is a brush plus a step
  onto that foot, so the weight transfers and he does travel. A *stomp* puts the whole foot down
  with the weight behind it. Each is written pose-to-pose — anticipation against the direction of
  travel, a hard snap to the extreme on the beat, then a settle — and every foot-strike punches an
  impulse spring that compresses the whole body, so he hits the beat with more than his shoe.
- **A two-bone IK pass** fixes up the legs so a crouch bends the knees instead of sinking his shoes
  through the stage.
- **The tune is the lead voice.** Music and effects sit on separate buses with the taps well under
  the melody, and the master runs through a soft clipper — which both puts back the overdriven bite
  the cassette port had and makes the square wave carry on a laptop speaker.
- **The show runs on the audio clock.** Notes and taps are pre-computed into a sorted event list and
  fed to Web Audio about 400 ms ahead of the playhead; the animation reads its beat position from
  `AudioContext.currentTime`, so the dancing cannot drift away from the music.

## Sources

- [Dancing Demon manual, Tandy 1980 — Internet Archive](https://archive.org/details/Dancing_Demon_1980_Tandy)
- [Exploring the oddities and almost-classics of the TRS-80 — Game Developer](https://www.gamedeveloper.com/audio/exploring-the-oddities-and-almost-classics-of-the-trs-80)
- [Doubled Dancing Demon — 48k.ca](http://48k.ca/dandem2.html), a reverse-engineering of the original animation format
- [Dancing Demon on Demozoo](https://demozoo.org/productions/151537/)

Original *Dancing Demon* © 1979 Leo Christopherson & Radio Shack; later public domain.
This homage is an independent work.
