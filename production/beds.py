"""Procedural room tones and ambience.

`nagel_room` carries the mystery's central physical clue, so it is generated
deterministically and mixed into two places that must match: every segment
recorded in Nagel's flat, and the nine-second insert in tonight's broadcast.
A radiator tick every 4.2 s, phase-locked to a global clock, plus a tram pass.

Both the tick and the tram are deliberately built with strong energy inside the
speech band (a 2.1 kHz ring, a broadband transient, a traction-motor whine
sweeping 400-900 Hz). Shortwave AM is band-limited to roughly 300-3000 Hz, so a
clue carried only by low frequencies would be destroyed by the very processing
that makes the broadcast sound like a broadcast - the player would be asked to
hear something that is physically not in the file. Everything the bench can
recover is in-band, and the bench recovers it by gating the speech and lifting
the noise floor between phrases rather than by filtering pitch.
"""
import numpy as np

SR = 44100
TICK_PERIOD = 2.1          # seconds - quoted verbatim in dialogue
TICK_F = 128.0             # Hz - body of the tick, survives the phone line


def _rng(seed):
    return np.random.default_rng(seed)


def _lp1(x, a):
    """One-pole low-pass. Vectorised enough for our lengths."""
    out = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = a * acc + (1 - a) * x[i]
        out[i] = acc
    return out


def radiator_tick(n, sr=SR, phase=0.0, seed=7):
    """Metallic tick every TICK_PERIOD seconds, phase-locked to a scene clock.

    Carries three components: a low body (dies on shortwave, present on the
    phone line), a 2.1 kHz ring and a broadband clack (both survive everywhere).
    """
    out = np.zeros(n)
    r = _rng(seed)
    t0 = (-phase) % TICK_PERIOD
    k = 0
    while True:
        start = int((t0 + k * TICK_PERIOD) * sr)
        k += 1
        if start >= n:
            break
        if start < 0:
            continue
        dur = int(0.28 * sr)
        seg = np.arange(min(dur, n - start)) / sr
        low = np.sin(2 * np.pi * TICK_F * seg) * np.exp(-seg * 26)
        ring = (np.sin(2 * np.pi * 2100 * seg)
                + 0.4 * np.sin(2 * np.pi * 1430 * seg)) * np.exp(-seg * 55) * 0.55
        clack = r.normal(0, 1, len(seg)) * np.exp(-seg * 260) * 0.45
        out[start:start + len(seg)] += (low * 0.85 + ring + clack)
    return out


def tram_pass(n, sr=SR, at=3.0, seed=11):
    """The 21 going past: traction-motor whine over a rumble.

    The whine sweeps 400-900 Hz and is what actually survives into the
    broadcast; the rumble only makes it onto the phone line.
    """
    out = np.zeros(n)
    dur = 7.0
    start = int(at * sr)
    ln = min(int(dur * sr), max(0, n - start))
    if ln <= 0:
        return out
    t = np.arange(ln) / sr
    env = np.exp(-((t - dur / 2) ** 2) / (2 * (dur / 5) ** 2))
    r = _rng(seed)
    rumble = _lp1(r.normal(0, 1, ln), 0.995)
    rumble = _lp1(rumble, 0.995)
    rumble /= (np.abs(rumble).max() + 1e-9)
    # motor whine: rises as it approaches, falls as it passes
    f = 400 + 500 * np.exp(-((t - dur / 2 + 0.8) ** 2) / (2 * 1.4 ** 2))
    phase = 2 * np.pi * np.cumsum(f) / sr
    whine = (np.sin(phase) + 0.35 * np.sin(2 * phase)) * 0.5
    squeal = np.sin(2 * np.pi * 1900 * t) * np.exp(-((t - dur / 2 - 1.1) ** 2) / 0.02) * 0.25
    out[start:start + ln] = (rumble * 0.45 + whine * env * 0.55 + squeal) * env
    return out


def nagel_room(seconds, phase=0.0, tram_at=None, seed=7):
    """The clue bed. Same generator for the flat and for the insert."""
    n = int(seconds * SR)
    r = _rng(seed + 1)
    hum = _lp1(r.normal(0, 1, n), 0.999)    # gentle low-passed noise floor
    hum /= (np.abs(hum).max() + 1e-9)
    bed = hum * 0.10 + radiator_tick(n, phase=phase, seed=seed) * 0.22
    if tram_at is not None:
        bed += tram_pass(n, at=tram_at, seed=seed + 3) * 0.30
    return bed


# --- decorative ambience, generated once and looped in the browser ---------

_lp = _lp1


def vault(seconds, seed=21):
    n = int(seconds * SR)
    r = _rng(seed)
    air = _lp(r.normal(0, 1, n), 0.997)
    air /= (np.abs(air).max() + 1e-9)
    t = np.arange(n) / SR
    hum = 0.06 * np.sin(2 * np.pi * 50 * t) + 0.02 * np.sin(2 * np.pi * 100 * t)
    relay = np.zeros(n)
    for at in (3.1, 11.4, 19.9):
        i = int(at * SR)
        if i < n - 2000:
            seg = np.arange(2000) / SR
            relay[i:i + 2000] += (r.normal(0, 1, 2000)
                                  * np.exp(-seg * 900) * 0.5)
    return air * 0.24 + hum + relay


def study(seconds, seed=31):
    """Frayne: a quiet room, a clock, rain a long way off."""
    n = int(seconds * SR)
    r = _rng(seed)
    rain = _lp(r.normal(0, 1, n), 0.86)
    rain /= (np.abs(rain).max() + 1e-9)
    tick = np.zeros(n)
    for k in range(int(seconds)):
        i = int(k * SR)
        if i < n - 1500:
            seg = np.arange(1500) / SR
            tick[i:i + 1500] += (np.sin(2 * np.pi * 1600 * seg)
                                 * np.exp(-seg * 220) * 0.22)
            tick[i:i + 1500] += (r.normal(0, 1, 1500)
                                 * np.exp(-seg * 500) * 0.10)
    return rain * 0.10 + tick


def workstation(seconds, seed=41):
    n = int(seconds * SR)
    r = _rng(seed)
    fan = _lp(r.normal(0, 1, n), 0.994)
    fan /= (np.abs(fan).max() + 1e-9)
    keys = np.zeros(n)
    at = 0.4
    while at < seconds:
        i = int(at * SR)
        if i < n - 900:
            seg = np.arange(900) / SR
            keys[i:i + 900] += (r.normal(0, 1, 900)
                                * np.exp(-seg * 1400) * r.uniform(0.15, 0.4))
        at += r.uniform(0.09, 0.55)
    return fan * 0.20 + keys * 0.30


def shortwave_bed(seconds, seed=51):
    """Carrier hiss, slow fading, and a heterodyne whistle drifting past."""
    n = int(seconds * SR)
    r = _rng(seed)
    t = np.arange(n) / SR
    hiss = r.normal(0, 1, n)
    hiss = _lp(hiss, 0.55)
    hiss /= (np.abs(hiss).max() + 1e-9)
    fade = 0.55 + 0.45 * np.sin(2 * np.pi * 0.07 * t + 1.1) \
        * np.sin(2 * np.pi * 0.017 * t)
    whistle = 0.05 * np.sin(2 * np.pi * (1180 + 60 * np.sin(2 * np.pi * 0.03 * t)) * t)
    return hiss * 0.34 * fade + whistle


def checkpoint(seconds, seed=61):
    n = int(seconds * SR)
    r = _rng(seed)
    rain = _lp(r.normal(0, 1, n), 0.80)
    rain /= (np.abs(rain).max() + 1e-9)
    t = np.arange(n) / SR
    idle = (0.05 * np.sin(2 * np.pi * 42 * t)
            + 0.03 * np.sin(2 * np.pi * 84 * t + 0.4))
    idle *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.9 * t)
    return rain * 0.20 + idle


def line_bed(seconds, seed=71):
    n = int(seconds * SR)
    r = _rng(seed)
    return _lp(r.normal(0, 1, n), 0.9) * 0.03


AMBIENCE = {
    "vault": vault, "study": study, "workstation": workstation,
    "shortwave": shortwave_bed, "checkpoint": checkpoint, "line": line_bed,
    "bench": vault, "tape83": line_bed, "apartment": line_bed,
}


# --- one-shot stings, played at scene entry ---------------------------------

def alarm(seconds=3.2, seed=81):
    """The continuity protocol tripping: a two-tone klaxon down a corridor."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    # alternating pair, slightly detuned, with a long room tail
    sw = (np.sign(np.sin(2 * np.pi * 0.9 * t)) + 1) / 2
    f = 523 * sw + 392 * (1 - sw)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR)
    tone += 0.3 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR)
    env = np.minimum(1.0, t * 6) * np.exp(-np.maximum(0, t - seconds + 1.4) * 2.2)
    body = tone * env * 0.5
    tail = _lp1(_rng(seed).normal(0, 1, n), 0.9)
    tail /= (np.abs(tail).max() + 1e-9)
    return _lp1(body, 0.35) + tail * 0.05


def door(seconds=2.4, seed=91):
    """A heavy magnetic bolt: motor, throw, and the seal settling."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    r = _rng(seed)
    motor = (np.sin(2 * np.pi * 74 * t) + 0.4 * np.sin(2 * np.pi * 148 * t))
    motor *= np.exp(-((t - 0.45) ** 2) / 0.09) * 0.35
    i = int(0.95 * SR)
    thud = np.zeros(n)
    seg = np.arange(min(int(0.9 * SR), n - i)) / SR
    thud[i:i + len(seg)] = (
        np.sin(2 * np.pi * 58 * seg) * np.exp(-seg * 9) * 0.9
        + r.normal(0, 1, len(seg)) * np.exp(-seg * 45) * 0.35)
    hiss = _lp1(r.normal(0, 1, n), 0.6)
    hiss /= (np.abs(hiss).max() + 1e-9)
    seal = hiss * np.exp(-np.maximum(0, t - 1.5) * 3.0) * (t > 1.5) * 0.18
    return motor + thud + seal


def relay(seconds=1.1, seed=95):
    """A patch relay closing - the sound of being connected to the line."""
    n = int(seconds * SR)
    r = _rng(seed)
    out = np.zeros(n)
    for at in (0.02, 0.19, 0.33):
        i = int(at * SR)
        seg = np.arange(min(int(0.14 * SR), n - i)) / SR
        out[i:i + len(seg)] += (r.normal(0, 1, len(seg)) * np.exp(-seg * 180) * 0.6
                                + np.sin(2 * np.pi * 900 * seg) * np.exp(-seg * 90) * 0.25)
    return out


STINGS = {"alarm": alarm, "door": door, "relay": relay}
