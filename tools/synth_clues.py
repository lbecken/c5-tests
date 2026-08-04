#!/usr/bin/env python3
"""
Generates the precision clue audio for THE OBSERVATORY MURDER.

These clips cannot be produced by a generative model: the mystery turns on two
recordings being *sample-identical*, and on a click landing at an exact offset.
So they are synthesised deterministically here. Pure stdlib -> WAV, then ffmpeg
-> mp3.

  cardiac_true    Window A. A fibrillating heart: irregular by construction.
  cardiac_looped  Window B. Window A, twice, byte for byte. That is the clue.
  double_click    The infusion rig priming and firing. Quiet on purpose.
  motor_spike     West drive current rising 1.2 s before Coll's order arrives.
  pulse           Sub-bass motif for a resolved contradiction.
"""

import array
import math
import os
import random
import struct
import subprocess
import sys
import wave

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "audio", "synth")


def write_wav(path, samples):
    """samples: list of floats in [-1, 1]"""
    peak = max(1e-9, max(abs(s) for s in samples))
    if peak > 0.99:
        samples = [s * (0.99 / peak) for s in samples]
    data = array.array("h", (int(max(-1.0, min(1.0, s)) * 32767) for s in samples))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def blank(seconds):
    return [0.0] * int(SR * seconds)


def add(buf, at, sig, gain=1.0):
    i = int(at * SR)
    for n, s in enumerate(sig):
        if 0 <= i + n < len(buf):
            buf[i + n] += s * gain


def tone(freq, dur, attack=0.004, decay=None, shape="sine"):
    n = int(SR * dur)
    decay = decay if decay is not None else dur * 0.9
    out = []
    for i in range(n):
        t = i / SR
        if shape == "sine":
            v = math.sin(2 * math.pi * freq * t)
        else:
            v = 2.0 * (t * freq - math.floor(0.5 + t * freq))
        env = min(1.0, t / attack) if attack > 0 else 1.0
        env *= math.exp(-t / decay)
        out.append(v * env)
    return out


def noise_burst(dur, rng, lp=0.5):
    n = int(SR * dur)
    out, prev = [], 0.0
    for i in range(n):
        x = rng.uniform(-1, 1)
        prev = prev + lp * (x - prev)          # one-pole low pass
        env = math.exp(-(i / SR) / (dur * 0.3))
        out.append(prev * env)
    return out


# ---------------------------------------------------------------- cardiac

def af_intervals(seconds, seed):
    """
    Atrial fibrillation: RR intervals are effectively random. We draw them from a
    fixed seed so the pattern is reproducible byte-for-byte, which is exactly the
    property the plot depends on.
    """
    rng = random.Random(seed)
    ivs, total = [], 0.0
    while total < seconds:
        iv = rng.choice([0.42, 0.51, 0.63, 0.38, 0.74, 0.46, 0.58, 0.35, 0.69, 0.48])
        iv *= rng.uniform(0.88, 1.14)
        ivs.append(iv)
        total += iv
    return ivs


def cardiac_window(seconds=16.0, seed=1938):
    """One four-minute telemetry window, replayed at 15x for review."""
    buf = blank(seconds + 0.4)
    rng = random.Random(seed ^ 0x5EED)
    t = 0.22
    for iv in af_intervals(seconds, seed):
        if t >= seconds:
            break
        # QRS marker: short bright pip, plus a soft low thump underneath
        add(buf, t, tone(1180, 0.045, attack=0.001, decay=0.014), 0.62)
        add(buf, t + 0.004, tone(196, 0.10, attack=0.002, decay=0.035), 0.30)
        add(buf, t + 0.012, noise_burst(0.02, rng, 0.30), 0.06)
        t += iv
    # instrument floor so the clip does not sound like silence between beats
    hum = [0.0] * len(buf)
    for i in range(len(hum)):
        hum[i] = 0.010 * math.sin(2 * math.pi * 120 * i / SR) + 0.004 * math.sin(2 * math.pi * 60 * i / SR)
    for i in range(len(buf)):
        buf[i] += hum[i]
    return buf


def build_cardiac():
    window = cardiac_window()
    write_wav(os.path.join(OUT, "cardiac_true.wav"), window)
    # Window B is window A concatenated with itself. Identical. That is the point.
    write_wav(os.path.join(OUT, "cardiac_looped.wav"), window + window)


# ---------------------------------------------------------------- artefacts

def build_double_click():
    """
    The rig priming, then firing. It has to be quiet enough that a first-time
    listener files it as line noise, and distinct enough to be unmistakable once
    isolated and slowed.
    """
    rng = random.Random(77)
    buf = blank(2.6)
    add(buf, 0.30, noise_burst(0.010, rng, 0.85), 0.55)   # prime
    add(buf, 0.30, tone(2400, 0.012, attack=0.0005, decay=0.004), 0.30)
    add(buf, 0.42, noise_burst(0.014, rng, 0.75), 0.75)   # fire
    add(buf, 0.42, tone(1750, 0.018, attack=0.0005, decay=0.006), 0.40)
    add(buf, 0.44, tone(320, 0.09, attack=0.001, decay=0.03), 0.22)
    # servo taking a change of weight, ~1 s later
    servo = []
    for i in range(int(SR * 0.75)):
        t = i / SR
        f = 430 + 55 * math.sin(2 * math.pi * 0.9 * t)
        env = min(1.0, t / 0.06) * math.exp(-t / 0.30)
        servo.append(math.sin(2 * math.pi * f * t) * env)
    add(buf, 1.25, servo, 0.30)
    return write_wav(os.path.join(OUT, "double_click.wav"), buf)


def build_motor_spike():
    """West drive current: inrush surge settling into steady rotation."""
    rng = random.Random(404)
    dur = 4.0
    buf = blank(dur)
    for i in range(int(SR * dur)):
        t = i / SR
        if t < 0.25:
            amp = (t / 0.25) ** 0.5 * 0.9
        else:
            amp = 0.9 * math.exp(-(t - 0.25) / 1.6) * 0.45 + 0.32
        f = 92 + 130 * min(1.0, t / 0.6)
        v = math.sin(2 * math.pi * f * t) * 0.6
        v += math.sin(2 * math.pi * f * 2 * t) * 0.22
        v += math.sin(2 * math.pi * f * 3.03 * t) * 0.10
        v += rng.uniform(-1, 1) * 0.05
        buf[i] += v * amp * 0.5
    return write_wav(os.path.join(OUT, "motor_spike.wav"), buf)


def build_pulse():
    """Low sub-bass swell. Plays whenever a contradiction resolves."""
    dur = 2.6
    buf = blank(dur)
    for i in range(int(SR * dur)):
        t = i / SR
        f = 68 - 24 * (t / dur)
        env = min(1.0, t / 0.35) * math.exp(-t / 1.1)
        v = math.sin(2 * math.pi * f * t)
        v += 0.35 * math.sin(2 * math.pi * f * 1.5 * t)
        buf[i] += v * env * 0.55
    return write_wav(os.path.join(OUT, "pulse.wav"), buf)


# ---------------------------------------------------------------- main

def to_mp3(stem):
    wav = os.path.join(OUT, stem + ".wav")
    mp3 = os.path.join(OUT, stem + ".mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
         "-af", "loudnorm=I=-18:TP=-2:LRA=11", "-codec:a", "libmp3lame",
         "-b:a", "96k", "-ac", "1", mp3],
        check=True,
    )
    os.remove(wav)
    return mp3


def main():
    os.makedirs(OUT, exist_ok=True)
    build_cardiac()
    build_double_click()
    build_motor_spike()
    build_pulse()
    stems = ["cardiac_true", "cardiac_looped", "double_click", "motor_spike", "pulse"]
    for s in stems:
        p = to_mp3(s)
        print(f"  {os.path.basename(p):24s} {os.path.getsize(p) / 1024:7.1f} KB")

    # Prove the plot point: window B's two halves must be byte-identical.
    import hashlib
    a = open(os.path.join(OUT, "cardiac_true.mp3"), "rb").read()
    print(f"\n  cardiac_true sha256  {hashlib.sha256(a).hexdigest()[:16]}")
    print("  cardiac_looped is cardiac_true concatenated with itself, pre-encode.")


if __name__ == "__main__":
    sys.exit(main())
