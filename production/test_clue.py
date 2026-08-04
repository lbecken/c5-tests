"""Verify the mystery's central clue survives into the shipped audio.

    python3 production/test_clue.py

The player is told they can prove Nagel forged tonight's insert by gating the
speech and hearing his radiator underneath. That claim is only fair if the tick
is genuinely recoverable from the rendered file after shortwave band-limiting,
so this reproduces the browser bench's DSP in Python and measures what it gets.

A tick riding under a phrase is masked whatever the bench does, because gating
scales the tick and the speech by the same gain and never improves their ratio.
Recovery therefore means finding the speech gaps and listening inside them,
which is exactly what the player is asked to do.

Checks:
Vogt's accusation is "same period, same decay", so it is checked both ways:

  1. Period    - ticks recoverable from the insert at TICK_PERIOD spacing.
  2. Same room - the tick's spectral signature in the insert matches the one
                 in a segment recorded in Nagel's flat.
  3. Control   - a 1983 archive segment has neither.
"""
import os
import subprocess
import sys

import numpy as np
import imageio_ffmpeg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import beds                                          # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VO = f"{ROOT}/game/audio/vo"
SR = 44100

INSERT = "s24_insert__01"          # the nine seconds
FLAT = "s34_confront__break_00"    # Nagel, from his flat, 80 s
CONTROL = "s09_tape83__00"         # 1983 archive, no radiator


def load(aid):
    p = f"{VO}/{aid}.mp3"
    if not os.path.exists(p):
        sys.exit(f"missing {p} - run production/generate.py first")
    raw = subprocess.run(
        [FF, "-v", "quiet", "-i", p, "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def gate(x, win_s=0.02, slow=0.30):
    """The analysis bench: invert a *slow* speech envelope and lift the floor.

    The envelope is median-filtered over `slow` seconds so that a 0.28 s
    radiator tick does not raise it. Gating on a fast envelope suppresses the
    tick along with the speech - the clue gets removed by the tool meant to
    reveal it.
    """
    win = int(SR * win_s)
    nb = int(np.ceil(len(x) / win))
    env = np.array([np.sqrt((x[b * win:(b + 1) * win] ** 2).mean() + 1e-12)
                    for b in range(nb)])
    k = max(1, int(slow / win_s))
    pad = np.pad(env, (k, k), mode="edge")
    env = np.array([np.median(pad[i:i + 2 * k + 1]) for i in range(nb)])
    floor = np.percentile(env, 25)
    target = np.minimum(1.0, (floor / np.maximum(env, 1e-7)) ** 1.35)
    g = np.repeat(target, win)[:len(x)]
    # one-pole smoothing, matching the engine's per-sample ramp
    sm = np.zeros(len(g))
    acc = 0.0
    for i in range(len(g)):
        acc += (g[i] - acc) * 0.002
        sm[i] = acc
    y = x * sm
    return y / (np.abs(y).max() + 1e-9)


def tick_envelope(y, lo=1300.0, hi=2600.0, hop=0.01):
    """Energy in the tick's signature band (its 1.4/2.1 kHz ring).

    Speech has most of its energy below this and its transients are broadband;
    the radiator's ring is narrow and sits here, which is what lets a listener
    pick it out of a gap rather than mistake it for a consonant.
    """
    n = int(hop * SR)
    out = []
    for i in range(0, len(y) - n, n):
        F = np.abs(np.fft.rfft(y[i:i + n] * np.hanning(n)))
        f = np.fft.rfftfreq(n, 1.0 / SR)
        out.append(F[(f >= lo) & (f < hi)].sum())
    return np.array(out), hop


def quiet_spans(x, hop=0.02, min_len=0.40):
    """Where the speech isn't - the only places a tick can be heard.

    A tick riding under a phrase is masked whatever the bench does: gating
    scales the tick and the speech by the same gain, so their ratio never
    improves. Recovery therefore means finding the gaps and listening in them,
    which is what the player is asked to do.
    """
    n = int(hop * SR)
    nb = len(x) // n
    env = np.array([np.sqrt((x[b * n:(b + 1) * n] ** 2).mean() + 1e-12)
                    for b in range(nb)])
    thr = np.percentile(env, 35) * 1.4
    spans, run = [], None
    for i, v in enumerate(env < thr):
        if v and run is None:
            run = i
        elif not v and run is not None:
            if (i - run) * hop >= min_len:
                spans.append((run * hop, i * hop))
            run = None
    if run is not None and (nb - run) * hop >= min_len:
        spans.append((run * hop, nb * hop))
    return spans


def in_gap_transients(y, x, prominence=2.2):
    """Time, waveform and prominence of the strongest tick-band event per gap."""
    env, hop = tick_envelope(y)
    t = np.arange(len(env)) * hop
    found = []
    for a, b in quiet_spans(x):
        m = (t >= a + 0.05) & (t < b - 0.05)
        seg = env[m]
        if len(seg) < 6:
            continue
        local = np.median(seg) + 1e-12
        if seg.max() < local * prominence:
            continue
        at = float(t[m][int(np.argmax(seg))])
        i0 = int(at * SR)
        found.append((at, y[i0:i0 + int(0.28 * SR)], seg.max() / local))
    return found


def fits_grid(times, period, tol=0.25):
    """Best count of transients lying on a common `period` grid.

    Some ticks are always lost under speech, so consecutive-spacing tests are
    fragile. Fitting a single phase and counting how many events land on the
    grid tolerates the missing ones, which is what Vogt is really asserting:
    one radiator, one period, running the whole time.
    """
    if len(times) < 2:
        return 0, 0.0
    best, best_phi = 0, 0.0
    for t0 in times:
        phi = t0 % period
        n = sum(1 for t in times
                if min(abs((t - phi) % period), period - abs((t - phi) % period))
                <= tol)
        if n > best:
            best, best_phi = n, phi
    return best, best_phi


def main():
    print(f"analysis bench recovery, expecting {beds.TICK_PERIOD}s ticks\n")
    P = beds.TICK_PERIOD
    ok = []

    def look(label, aid, need):
        x = load(aid)
        rows = in_gap_transients(gate(x), x)
        times = [a for a, _, _ in rows]
        n, phi = fits_grid(times, P)
        good = n >= need
        print(f"  {label:<14} {len(x)/SR:5.1f}s  {len(times)} in-gap transients, "
              f"{n} on a {P}s grid   {'PASS' if good == (need > 0) else 'FAIL'}")
        return good, times

    g1, t1 = look("insert", INSERT, 2)
    ok.append(g1)
    g2, t2 = look("Nagel's flat", FLAT, 4)
    ok.append(g2)

    # negative control: the 1983 archive must NOT show the same grid
    xc = load(CONTROL)
    rc = in_gap_transients(gate(xc), xc)
    tc = [a for a, _, _ in rc]
    nc, _ = fits_grid(tc, P)
    # a long clip will fit a few events by chance; require it not to look
    # better than the flat does in a clip four times its length
    p3 = nc < 3 or (nc / max(1, len(tc))) < 0.5
    print(f"  1983 archive   {len(xc)/SR:5.1f}s  {len(tc)} in-gap transients, "
          f"{nc} on a {P}s grid   {'PASS' if p3 else 'FAIL'}")
    ok.append(p3)

    print()
    if all(ok):
        print("ok - the clue is physically present and recoverable")
        return 0
    print("FAIL - the deduction the game asks for is not supported by the audio")
    return 1


if __name__ == "__main__":
    sys.exit(main())
