# ElectroPaint

A WebGL homage to **ElectroPaint**, the screensaver David A. Tristram wrote for
Silicon Graphics IRIX workstations — a ribbon of flying polygons that never
stops rearranging itself.

Open `index.html` over http and it runs. No build step, no install.

```sh
npm start          # http://localhost:8080
# or: python3 -m http.server 8080
```

ES modules will not load over `file://`, so it does need a server. `three` is
pulled from a CDN via the import map in `index.html`, so the first load needs
network access; after that the browser cache covers it. If the fetch fails the
page says so rather than going black.

To run with no network at all:

```sh
npm run vendor     # installs three 0.185.1 locally
```

then point the import map in `index.html` at the copy on disk:

```json
"three": "./node_modules/three/build/three.module.js",
"three/addons/": "./node_modules/three/examples/jsm/"
```

---

## What it is doing

The original screensaver is often described as random, and it isn't. Underneath
there is a small set of values — a radius, a twist, a colour — each wandering
smoothly on its own, and one polygon flying wherever those values point.

Everything else is memory. The polygon's recent history is kept in a ring
buffer, and polygon *k* on screen is drawn from the state as it was *k* ticks
ago. So a ribbon of 168 triangles is really one triangle and 167 ghosts, and any
change to the parameters enters at the head and travels down the length of the
ribbon as a visible wave. That delay is the whole trick: it is why the thing
reads as choreography rather than noise, and why it never repeats.

Two lineages informed this, both descended from the IRIX original:

- **[Kent Rosenkoetter's electropaint](https://github.com/iamralpht/elektropaintjs)**
  — where the accumulated transform chain and the smooth random generators come
  from.
- **[Andrew Plotkin's StonerView](https://www.eblong.com/zarf/stonerview.html)**
  — where the delay-buffer idea is stated most clearly.

The placement of polygon *k*, walking from the head of the ribbon to the tail:

```
spine ← spine · rotX(spineX) · rotY(spineY) · translate(0, 0, zDelta)
local =  spine · rotZ(angle + k·deltaAngle) · translate(radius, 0, 0)
               · rotZ(−yaw) · rotY(−pitch) · rotX(roll) · scale(size)
```

`spineX` and `spineY` are the one real departure from the original. Leave them
at zero and you get the classic straight column. Let the spine bend a little per
polygon and the column curls: bend it by exactly `2π / count` and it closes into
a ring, bend two axes at incommensurate rates and it ties itself into a knot.
That is where most of the choreographies come from.

## The choreographies

Each one is a regime for the parameter generators — where each value may roam
and how restless it is. Switching between them slides the bounds across about
five seconds rather than cutting, so a transition is a gesture too.

| | | |
|---|---|---|
| **Helix** | The classic column | polygons winding up a straight spine |
| **Rosette** | Spine collapsed to a point | the golden angle fans them into a flower |
| **Vortex** | Long spine, slow winding | radius pumping hard; a funnel that swallows itself |
| **Torus** | Spine closed on itself | a ring of twisted ribbon |
| **Knot** | Two bending axes at odds | the spine ties and unties itself |
| **Ribbon** | Winding switched off | polygons line up edge to edge into one broad band |
| **Caduceus** | Half a turn per polygon | the ribbon splits into two strands chasing each other |
| **Supernova** | Spine barely advances | everything piles into a shell and detonates |
| **Nebula** | Slowed and enlarged | overlapping faces bleed into a cloud |

Auto-cycle moves between them every 30 seconds by default.

## The sound

Off by default — press <kbd>S</kbd>, or tick it in the panel. Browsers will not
start audio without a gesture, so nothing is even constructed until then.

It is synthesised live from the same numbers driving the picture, not played
alongside it. A drone holds a chord chosen by the current choreography; its
filter opens and closes with how far the ribbon has swung from its axis; sparse
bells fire on a scale drawn from that chord, at a rate that tracks how hard the
parameters are moving, panned to wherever the head of the ribbon happens to be.
Every transition gets a filtered noise sweep and a slide into the new chord.

## Controls

| Key | |
|---|---|
| <kbd>Space</kbd> | Next choreography |
| <kbd>1</kbd>–<kbd>9</kbd> | Jump to one |
| <kbd>A</kbd> | Auto-cycle on/off |
| <kbd>C</kbd> | Camera: drift → orbit → fly-through → manual |
| <kbd>S</kbd> | Sound |
| <kbd>O</kbd> | Controls panel |
| <kbd>W</kbd> | Wireframe |
| <kbd>T</kbd> | Triangles / quads |
| <kbd>F</kbd> | Fullscreen |
| <kbd>P</kbd> | Pause |
| <kbd>R</kbd> | Reseed |
| <kbd>H</kbd> | Help |

Drag to look around, scroll to zoom. The panel exposes polygon count, size,
tempo, bloom, trail length, edge glow, cycle length and volume; settings persist
in `localStorage`.

## Running it headless

Everything the panel does is also reachable from the query string, because a
screensaver host has no way to click anything:

```
?screensaver=1      auto-start, no chrome, no cursor, ignore stored settings
?fps=1              frame-rate readout, current and sustained minimum
?choreo=knot        start on a named choreography (or a number, 1-9)
?count=240&shape=quad&camera=orbit&auto=0&bloom=0.6&trails=0.5
```

Also accepted: `size`, `tempo`, `edge`, `fill`, `sound`, `volume`, `cycle`.

`?screensaver=1` deliberately starts from defaults rather than whatever you last
left in the panel, and never writes back — what you fiddled with in a browser
tab should not decide what the screensaver looks like.

See [PHASE0.md](PHASE0.md) for using this to test the app inside a real
screensaver host on Windows and macOS.

## How it is put together

| File | |
|---|---|
| `src/smooth.js` | The wandering-parameter generator, and re-targetable banks of them |
| `src/choreography.js` | The nine regimes, and the length-relative specs that keep them proportioned at any polygon count |
| `src/wings.js` | The ring buffer and the transform chain — the simulation proper |
| `src/scene.js` | three.js: one instanced mesh, a flat self-lit shader with analytic edges, bloom, trails, and the camera |
| `src/audio.js` | The generative score |
| `src/ui.js` | DOM wiring |
| `src/main.js` | Settings, the frame loop, auto-cycle |

The whole ribbon is a single `InstancedMesh`; the simulation writes transforms
and colours into flat `Float32Array`s which are blitted into the instance
attributes each frame, so polygon count costs almost nothing.

Framing deserves a note. These shapes are wildly anisotropic — Ribbon is a long
flat band, Rosette a disc — and their centre of mass is rarely their visual
centre, so a bounding sphere both wastes most of the frame and hangs the subject
off to one side. `Stage._fitAndCentre` instead works in the camera's own basis:
one pass finds the lateral offset that centres the silhouette, a second solves
the exact distance at which the furthest polygon lands on the edge of the
frustum. Both results are heavily smoothed — the shape may change quickly, the
camera may not.

`window.electropaint` exposes `{ app, stage, system, score }` for poking at a
running instance from the console.

## Requirements

WebGL 2. A message is shown if it is unavailable.

## Credit

*ElectroPaint* is by **David A. Tristram**, written at Silicon Graphics. This is
an independent reimplementation, not a port — none of the original code is used.
