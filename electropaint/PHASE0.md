# Phase 0 — does this survive inside a real screensaver host?

Before either of us spends days on native wrappers, we should find out whether
ElectroPaint actually renders at a decent frame rate inside a screensaver
process on your hardware. Screensaver hosts are strange environments — they
throttle timers, lie about visibility, hand out bounds in the wrong units, and
on macOS run your code inside somebody else's app extension.

This phase writes no native code. You point an existing, prebuilt web-view
screensaver at the app and watch what happens. Half an hour, both platforms.

Everything below assumes the branch `claude/sgi-electropaint-screensaver-es4xen`.

---

## Prep — serve the app (both platforms)

The app still needs `http://`: ES modules will not load over `file://`, so the
page cannot yet be handed to a wrapper as a bare file. (Phase 1 fixes exactly
this by producing a single self-contained `.html`. It is deliberately not done
yet — no point building it if Phase 0 says the whole approach is a dead end.)

```sh
cd electropaint
npm start          # serves on http://localhost:8080
```

Leave that running. It keeps serving while the screensaver is up.

The first load fetches three.js from a CDN, so the machine needs to be online
once. To avoid that:

```sh
npm run vendor
```

then point the import map in `index.html` at `./node_modules/three/…` as
described in the README.

### The URL to test

```
http://localhost:8080/?screensaver=1&fps=1
```

`?screensaver=1` is new, and it is what makes this phase possible at all: it
skips the "Begin" button (a screensaver host cannot click it), hides all chrome
and the cursor, and ignores any settings left in `localStorage` so you get
predictable defaults. `?fps=1` puts a frame-rate readout in the bottom-right —
current rate and the sustained minimum since startup.

Worth trying a heavier setting too, to see where the machine gives up:

```
http://localhost:8080/?screensaver=1&fps=1&count=360&size=1.6
```

All the panel controls are reachable from the URL: `count`, `size`, `tempo`,
`bloom`, `trails`, `edge`, `volume`, `cycle`, `shape` (`triangle`/`quad`),
`camera` (`drift`/`orbit`/`inside`/`manual`), `fill`, `sound`, `auto`, and
`choreo` (a name like `knot`, or a number 1–9).

---

## Windows 11

**Wrapper:** [leo-goo/web-page-screensaver-webview2](https://github.com/leo-goo/web-page-screensaver-webview2)
— a fork of the long-standing Web Page Screensaver, updated to WebView2 (Edge)
specifically to support WebGL, with multi-display handling. Grab the newest
build from its [Releases](https://github.com/leo-goo/web-page-screensaver-webview2/releases)
page.

WebView2 Runtime already ships with Windows 11, so there should be nothing else
to install.

1. Download and install the release.
2. Open Settings → Personalization → Lock screen → Screen saver.
3. Pick the wrapper from the dropdown, click **Settings**, and set the URL to
   `http://localhost:8080/?screensaver=1&fps=1`.
4. Click **Preview** for the fullscreen run.
5. Watch the small preview pane in the settings dialog too — it is a separate
   code path (`/p`) and a common place for these things to break.

If that fork misbehaves, [rcavazza/WebView2Screensaver](https://github.com/rcavazza/WebView2Screensaver)
(MIT, .NET 6) is a second opinion, though you have to build it yourself.

**Note:** unsigned screensavers downloaded from the internet trigger a one-time
SmartScreen "Windows protected your PC" prompt. That is a reputation warning,
not a block — More info → Run anyway.

---

## macOS 12 / 13

**Wrapper:** [liquidx/webviewscreensaver](https://github.com/liquidx/webviewscreensaver).
Take the newest release from its [Releases](https://github.com/liquidx/webviewscreensaver/releases)
page — currently 2.5.

Version history is worth knowing, because it maps directly onto the risk we
identified: 2.3 "fixed animations, interactions and lingering legacyScreenSaver
on Sonoma", and 2.5 fixed macOS 26 Tahoe scaling. In other words the upstream
project has already absorbed the breakage that would otherwise sink this
approach. On 12/13 you are below all of that anyway.

1. Unzip and copy `WebViewScreenSaver.saver` to `~/Library/Screen Savers/`
   (create the folder if needed).
2. If Gatekeeper complains, clear the quarantine flag:
   ```sh
   xattr -dr com.apple.quarantine ~/Library/Screen\ Savers/WebViewScreenSaver.saver
   ```
3. Ventura (13): System Settings → Screen Saver.
   Monterey (12): System Preferences → Desktop & Screen Saver → Screen Saver.
   Third-party savers are at the bottom of the list.
4. Select it, open its options, set the URL to
   `http://localhost:8080/?screensaver=1&fps=1`.
5. Preview it, then let it trigger for real.

If it does not pick up a change, the host caches the bundle via `mmap`:

```sh
killall legacyScreenSaver
```

---

## What to record

The point of this phase is numbers and specifics, not an impression.

| | What to look for |
|---|---|
| **Renders at all?** | Ribbon visible, or black screen / blank page |
| **Frame rate** | Both figures from the readout. The *min* is the one that matters |
| **Under load** | Same, with `&count=360&size=1.6` |
| **Multi-monitor** | All displays driven? Correct resolution on each? Any 2× scaling on a non-Retina external display? |
| **Preview pane** | Renders, black, or crawling? |
| **Exit** | Does a mouse move or keypress dismiss it promptly? |
| **Sustained** | Leave it 30+ minutes. Frame rate decaying? Memory climbing? Fans? |
| **Battery** | Laptop drain over ~10 minutes, if relevant |
| **Sound** | Expected: silent. Screensaver hosts do not usually grant the gesture WebAudio needs. Try `&sound=1` — if you hear it, that is a bonus |
| **Artefacts** | Stutter on a regular beat, tearing, wrong scaling, colours off |

---

## How the results steer the plan

- **50–60 fps steady on both, preview fine** → best case. Proceed with Phase 1
  (self-contained single file), then Phase 2 (Windows `.scr`) and Phase 3
  (macOS `.saver`) as thin wrappers. The existing wrappers stay useful as a
  reference implementation.

- **Renders, but 25–40 fps** → still viable; the screensaver build gets lower
  defaults (fewer polygons, softer bloom, shorter trails) rather than the
  browser defaults. Worth knowing before we bake numbers in.

- **Under 20 fps, or stuttering badly** → the native Metal / D3D path moves up
  the list for that platform, at least for macOS where the host caps things
  more aggressively.

- **Black screen on macOS** → the `document.visibilityState` bug. It would mean
  the wrapper's fix does not cover our case, and Phase 3 carries the shim
  itself (override `Document.prototype.visibilityState` at document-start).

- **Preview pane broken** → expected and cheap to handle: Phases 2 and 3 detect
  preview mode and run a deliberately reduced configuration.

- **Wrong scaling on an external display** → the known backing-pixels-vs-points
  bug; Phase 3 clamps the web view frame against the screen size in points.

Send me whatever you observe — even just "60/58 on Windows, 30/12 on the Mac,
preview is black" is enough to pick the right next step.
