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

> **Superseded by Phase 1.** There is now a single self-contained file, so a
> wrapper can be pointed straight at `dist/electropaint-screensaver.html` with
> no server, no network and no query string. The instructions below still work
> and are kept because serving the source is easier to iterate against.

The source form needs `http://`: ES modules will not load over `file://`.

```sh
cd electropaint
git pull           # ?screensaver= and ?fps= only exist from fa27832 onward
npm start          # serves on http://localhost:8080
```

Leave that running. It keeps serving while the screensaver is up.

### If you see the "Begin" button, it is caching

The server sends `no-store`, but a web view that already cached an older build
will keep serving it, and inside a screensaver there are no developer tools to
notice. Fastest fix while iterating is to bump a throwaway parameter on the
URL — `&v=2`, `&v=3` — which the app ignores and the cache does not.

To clear it properly, quit the host and delete its regenerable caches (your
configured URL lives elsewhere, under `Preferences/ByHost`, and is not touched):

```sh
killall legacyScreenSaver
ls ~/Library/Containers/com.apple.ScreenSaver.Engine.legacyScreenSaver/Data/Library
rm -rf ~/Library/Containers/com.apple.ScreenSaver.Engine.legacyScreenSaver/Data/Library/Caches
rm -rf ~/Library/Containers/com.apple.ScreenSaver.Engine.legacyScreenSaver/Data/Library/WebKit
```

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

## macOS

> ### Tahoe 26.4 — tested, and it works
>
> **Result (26.4, WebViewScreenSaver 2.5): ran clean for 5 minutes.** No blanking.
>
> This contradicts what we expected. There is a reported regression in macOS
> 26.4 where WKWebView content disappears after about three seconds inside a
> legacy ScreenSaver view hierarchy — filed as FB22353950 with a reproducer,
> acknowledged by Apple DTS on the [developer forums](https://developer.apple.com/forums/thread/820860),
> with no workaround offered. Working from that, we predicted this test would
> fail. It did not.
>
> The most plausible explanation is that the behaviour is gated on the SDK the
> bundle was **built** against, which is a common way for macOS to phase in
> changes. The reporter's project was built with Xcode 26.4 and failed on 26.4
> while working on 26.3.1; WebViewScreenSaver 2.5 predates that SDK. If so, a
> `.saver` we compile ourselves against a current SDK could hit the bug that
> this prebuilt one sidesteps.
>
> That is a hypothesis, not a finding. It is worth settling before Phase 3
> commits to an approach, because it decides whether we can build our own web
> view `.saver` at all or have to pin an older deployment SDK. Check what the
> working bundle was built against:
>
> ```sh
> otool -l ~/Library/Screen\ Savers/WebViewScreenSaver.saver/Contents/MacOS/WebViewScreenSaver \
>   | grep -A4 LC_BUILD_VERSION
> ```
>
> The `sdk` line is the number that matters.

On macOS 12 / 13 none of this applies at all: those predate both the Sonoma
breakage and the 26.4 one.

**Wrapper:** [liquidx/webviewscreensaver](https://github.com/liquidx/webviewscreensaver).
Take the newest release from its [Releases](https://github.com/liquidx/webviewscreensaver/releases)
page — currently 2.5.

Version history is worth knowing, because it maps directly onto the risk we
identified: 2.3 "fixed animations, interactions and lingering legacyScreenSaver
on Sonoma", and 2.5 fixed macOS 26 Tahoe scaling. In other words the upstream
project has already absorbed the breakage that would otherwise sink this
approach. On 12/13 you are below all of that anyway.

1. Unzip and copy `WebViewScreenSaver.saver` to `~/Library/Screen Savers/`
   (create the folder if needed). Or `brew install --cask webviewscreensaver`.

   Note that the project's README still shows `--no-quarantine`. That flag was
   deprecated in Homebrew 4.7 and **removed in 5.0.0**, so it now fails with
   `invalid option` — leave it off and clear quarantine by hand below.
2. The build is only ad-hoc signed, so Gatekeeper will likely block it silently.
   Clear the quarantine flag on both the installed copy and, if you used
   Homebrew, the Caskroom original:
   ```sh
   xattr -r  ~/Library/Screen\ Savers/WebViewScreenSaver.saver   # inspect
   xattr -dr com.apple.quarantine ~/Library/Screen\ Savers/WebViewScreenSaver.saver
   xattr -dr com.apple.quarantine "$(brew --caskroom)/webviewscreensaver"
   killall legacyScreenSaver
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

## Results

| | macOS | Windows |
|---|---|---|
| Version | Tahoe **26.4** | not yet tested |
| Wrapper | WebViewScreenSaver 2.5 | leo-goo web-page-screensaver-webview2 |
| Renders | yes | — |
| Frame rate | **60 / min 60** at default settings | — |
| Natural trigger | works (not just Preview) | — |
| Sustained | 5+ min, no blanking, no decay | — |

**macOS: pass, decisively.** A sustained minimum of 60 means the frame budget is
not a constraint at the current defaults, so the screensaver build can ship the
same numbers as the browser build rather than a cut-down set. It also means the
polygon count is nowhere near the ceiling — headroom exists if we ever want it.

Still open on macOS, none of them blocking:

- Multi-monitor behaviour, and scaling on a non-Retina external display.
- The `otool` SDK check above, which decides whether a `.saver` we build
  ourselves must pin an older deployment SDK to avoid FB22353950.
- Behaviour on the second Mac (Sonoma 14 or Sequoia 15 — worth running `sw_vers`,
  as those are different releases with different prospects here).

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

- **Blanks after ~3 seconds on macOS 26.4** → Apple's FB22353950 regression,
  not ours. *Not observed in testing* — 26.4 with WebViewScreenSaver 2.5 ran
  clean for 5 minutes. If it does show up on another machine or another
  wrapper, the SDK-gating hypothesis above is the first thing to check.

- **Black screen immediately on macOS 12/13** → the `document.visibilityState`
  bug. It would mean the wrapper's fix does not cover our case, and a web-view
  Phase 3 would carry the shim itself (override
  `Document.prototype.visibilityState` at document-start).

- **Preview pane broken** → expected and cheap to handle: Phases 2 and 3 detect
  preview mode and run a deliberately reduced configuration.

- **Wrong scaling on an external display** → the known backing-pixels-vs-points
  bug; Phase 3 clamps the web view frame against the screen size in points.

Send me whatever you observe — even just "60/58 on Windows, 30/12 on the Mac,
preview is black" is enough to pick the right next step.
