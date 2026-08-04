"""Generate every audio asset: synthesise, process, mix, align.

    python3 production/generate.py              generate anything missing/changed
    python3 production/generate.py --force      regenerate everything
    python3 production/generate.py --only ID    one asset
    python3 production/generate.py --ambience   just the browser ambience loops

Multi-speaker segments go through ElevenLabs Dialogue mode so the model gets the
whole exchange as context - interruptions, overlaps and the pacing of an
argument survive, which per-line synthesis destroys. Solo segments use v3 TTS.

Everything is content-hashed: editing one line in script.py regenerates that
segment and nothing else.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import imageio_ffmpeg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import beds                     # noqa: E402
from voices import VOICES       # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = f"{ROOT}/production/.raw"
OUT = f"{ROOT}/game/audio/vo"
AMB = f"{ROOT}/game/audio/amb"
KEY = os.environ.get("ELEVENLABS_API_KEY", "")
SR = 44100

# --------------------------------------------------------------------------
# Effects chains. ffmpeg does the filtering; numpy adds the noise and the beds.
# --------------------------------------------------------------------------
CHAINS = {
    "room":      "highpass=f=75,acompressor=threshold=0.12:ratio=2.5:attack=8:release=180",
    "phone":     "highpass=f=300,lowpass=f=3300,acompressor=threshold=0.08:ratio=5:attack=4:release=120,aresample=8000,aresample=44100",
    "shortwave": "highpass=f=330,lowpass=f=2900,acompressor=threshold=0.06:ratio=7:attack=2:release=90,vibrato=f=0.35:d=0.02",
    "tape83":    "highpass=f=190,lowpass=f=4400,acompressor=threshold=0.1:ratio=3.5,vibrato=f=0.6:d=0.025",
    "tape83far": "highpass=f=220,lowpass=f=3100,acompressor=threshold=0.1:ratio=4,vibrato=f=0.6:d=0.03,aecho=0.85:0.5:55:0.22",
    "tape91":    "highpass=f=210,lowpass=f=3800,acompressor=threshold=0.1:ratio=3.5,vibrato=f=0.8:d=0.03",
    "reel81":    "highpass=f=60,lowpass=f=9000,acompressor=threshold=0.15:ratio=2",
}
# Post-filter noise: (amplitude against a 0.89 peak, low-pass coefficient).
# Tape hiss should sit ~30 dB under the voice - audible as a medium, never as
# an obstacle. Dialogue intelligibility is verified by production/qa.py.
NOISE = {
    "room": (0.004, 0.5), "phone": (0.006, 0.35), "shortwave": None,
    "tape83": (0.020, 0.45), "tape83far": (0.024, 0.5), "tape91": (0.022, 0.42),
    "reel81": (0.010, 0.3),
}
GAIN = {"room": 1.0, "phone": 0.95, "shortwave": 0.9, "tape83": 0.95,
        "tape83far": 0.82, "tape91": 0.92, "reel81": 1.0}


def sh(args):
    r = subprocess.run(args, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(args[0] + ": " + r.stderr.decode()[-500:])
    return r.stdout


def decode(path):
    raw = sh([FF, "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(SR),
              "-f", "f32le", "-"])
    return np.frombuffer(raw, np.float32).astype(np.float64)


def encode(x, path, bitrate="128k"):
    x = np.clip(x, -1.0, 1.0).astype(np.float32)
    p = subprocess.Popen(
        [FF, "-v", "quiet", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1",
         "-i", "-", "-c:a", "libmp3lame", "-b:a", bitrate, path],
        stdin=subprocess.PIPE)
    p.communicate(x.tobytes())
    if p.returncode != 0:
        raise RuntimeError("encode failed: " + path)


def filt(x, chain):
    """Filter through ffmpeg over pipes - no temp file, so this is thread-safe."""
    p = subprocess.Popen(
        [FF, "-v", "quiet", "-f", "f32le", "-ar", str(SR), "-ac", "1",
         "-i", "pipe:0", "-af", CHAINS[chain], "-f", "f32le", "pipe:1"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = p.communicate(np.clip(x, -1, 1).astype(np.float32).tobytes())
    if p.returncode != 0:
        raise RuntimeError("filter failed: " + err.decode()[-300:])
    return np.frombuffer(out, np.float32).astype(np.float64)


# --------------------------------------------------------------------------
# ElevenLabs
# --------------------------------------------------------------------------

def _post(url, body, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(
                url, data=json.dumps(body).encode(),
                headers={"xi-api-key": KEY, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            detail = e.read()[:300].decode(errors="replace")
            if e.code in (429, 500, 502, 503) and i < tries - 1:
                time.sleep(2 ** i * 2)
                continue
            raise RuntimeError(f"HTTP {e.code}: {detail}")
        except Exception:
            if i < tries - 1:
                time.sleep(2 ** i * 2)
                continue
            raise
    raise RuntimeError("unreachable")


def synth(asset):
    """One asset -> raw mp3 bytes."""
    lines = asset["lines"]
    if asset["mode"] == "dialogue":
        return _post("https://api.elevenlabs.io/v1/text-to-dialogue", {
            "inputs": [{"text": l["v3"],
                        "voice_id": VOICES[l["spk"]]["voice_id"]} for l in lines],
            "model_id": "eleven_v3",
            "settings": {"stability": 0.5, "use_speaker_boost": True},
        })
    spk = lines[0]["spk"]
    v = VOICES[spk]
    text = "\n\n".join(l["v3"] for l in lines)
    return _post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{v['voice_id']}"
        f"?output_format=mp3_44100_128",
        {"text": text, "model_id": "eleven_v3",
         "voice_settings": v.get("settings", {"stability": 0.5,
                                              "similarity_boost": 0.8})})


# --------------------------------------------------------------------------
# Processing
# --------------------------------------------------------------------------

def respace(x, n_phrases, gap=1.200, thresh=0.045):
    """Re-space an utterance so every inter-phrase gap is exactly `gap`.

    The script has Iris prove the insert is machine-made because its gaps are
    1.200 s "to the millisecond", while Halloway breathes 3-2-5. That has to be
    true of the actual file, not just asserted in dialogue - a player who
    measures it must find what they were told they would find. Re-spacing also
    stretches the insert to ~9 s, which is what makes the 4.2 s radiator tick
    countable underneath it.
    """
    win = int(0.02 * SR)
    nb = int(np.ceil(len(x) / win))
    env = np.array([np.sqrt((x[b * win:(b + 1) * win] ** 2).mean() + 1e-12)
                    for b in range(nb)])
    loud = env > max(thresh * env.max(), 1e-4)
    spans, run = [], None
    for i, v in enumerate(loud):
        if v and run is None:
            run = i
        elif not v and run is not None:
            if (i - run) * 0.02 > 0.12:
                spans.append((run, i))
            run = None
    if run is not None:
        spans.append((run, nb))
    if len(spans) < 2:
        return x, []
    # Cut on the (n-1) widest silences rather than on a fixed threshold: the
    # sentence count is known from the script, and breath pauses inside a
    # phrase are always narrower than the pauses between phrases.
    sil = sorted(((spans[i + 1][0] - spans[i][1]), i)
                 for i in range(len(spans) - 1))
    cuts = {i for _, i in sil[-(max(1, n_phrases - 1)):]}
    merged = [list(spans[0])]
    for i, (a, b) in enumerate(spans[1:]):
        if i in cuts:
            merged.append([a, b])
        else:
            merged[-1][1] = b
    pad = int(0.05 * SR)
    silence = np.zeros(int(gap * SR))
    out, gaps, cursor = [], [], 0.0
    for k, (a, b) in enumerate(merged):
        seg = x[max(0, a * win - pad):min(len(x), b * win + pad)]
        if k:
            gaps.append(cursor + gap / 2.0)
            out.append(silence)
            cursor += gap
        out.append(seg)
        cursor += len(seg) / SR
    return np.concatenate(out), gaps


def process(asset, raw_path, out_path):
    x = decode(raw_path)
    if len(x) == 0:
        raise RuntimeError("empty audio: " + asset["id"])
    x = x / (np.abs(x).max() + 1e-9) * 0.89
    insert_gaps = []
    if asset["fx"] == "insert":
        n = sum(len(re.findall(r"[.!?]", l["text"])) for l in asset["lines"])
        x, insert_gaps = respace(x, max(2, n))
    chain = asset["chain"]
    x = filt(x, chain)
    dur = len(x) / SR

    lvl = NOISE.get(chain, (0.002, 0.5))
    if isinstance(lvl, tuple):
        level, a = lvl
        r = np.random.default_rng(abs(hash(asset["id"])) % (2 ** 31))
        hiss = beds._lp1(r.normal(0, 1, len(x)), a)
        hiss = hiss / (np.abs(hiss).max() + 1e-9)
        x = x + hiss * level

    if chain == "shortwave":
        # Band-limit the receiver noise too. Broadband hiss over a band-limited
        # voice reads as white noise, not as a radio.
        sw = filt(beds.shortwave_bed(dur + 0.5), "shortwave")[:len(x)]
        if len(sw) < len(x):
            sw = np.pad(sw, (0, len(x) - len(sw)))
        x = x + sw * 0.34

    if asset["bed"] == "nagel_room":
        # Phase-locked so the tick lands identically in the flat and in the
        # insert. This is the clue; it must be bit-for-bit consistent.
        phase = (abs(int(hashlib.md5(asset["id"].encode()).hexdigest(), 16))
                 % 1000) / 1000.0 * beds.TICK_PERIOD
        if asset["fx"] == "insert":
            # Align the radiator so a tick lands inside a speech gap, where a
            # listener can actually pick it out. Ticks that fall under a phrase
            # are lost, and a clue nobody can hear is not a clue.
            first = insert_gaps[0] if insert_gaps else 0.5
            phase, tram = (beds.TICK_PERIOD - first) % beds.TICK_PERIOD, 1.4
        else:
            tram = 2.0 if "s34_confront" in asset["id"] else None
        bed = beds.nagel_room(dur + 1.0, phase=phase, tram_at=tram)[:len(x)]
        if chain in ("shortwave", "phone"):
            bed = filt(bed, chain)[:len(x)]
            if len(bed) < len(x):
                bed = np.pad(bed, (0, len(x) - len(bed)))
        # The insert's bed must survive being gated out from under the voice,
        # so it sits higher than a purely decorative room tone would.
        # Nagel's radiator should be half-noticeable in his own scenes - the
        # player is meant to be able to recognise it later, so it has to have
        # registered the first time.
        lvl = 0.62 if asset["fx"] == "insert" else (
            0.16 if chain == "shortwave" else 0.48)
        x = x + bed * lvl

    x = x * GAIN.get(chain, 1.0)
    peak = np.abs(x).max()
    if peak > 0:
        x = x / peak * 0.9
    encode(x, out_path)
    return len(x) / SR


# --------------------------------------------------------------------------
# Alignment -> per-line start times for synced transcript
# --------------------------------------------------------------------------

def align(asset, path):
    text = " ".join(l["text"] for l in asset["lines"])
    for attempt in range(3):
        try:
            boundary = "----ffm"
            body = []
            body.append(f"--{boundary}\r\nContent-Disposition: form-data; "
                        f'name="file"; filename="a.mp3"\r\n'
                        f"Content-Type: audio/mpeg\r\n\r\n".encode())
            body.append(open(path, "rb").read())
            body.append(f"\r\n--{boundary}\r\nContent-Disposition: form-data; "
                        f'name="text"\r\n\r\n{text}\r\n--{boundary}--\r\n'.encode())
            req = urllib.request.Request(
                "https://api.elevenlabs.io/v1/forced-alignment",
                data=b"".join(body),
                headers={"xi-api-key": KEY,
                         "Content-Type": f"multipart/form-data; boundary={boundary}"})
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read())
            words = [w for w in data.get("words", []) if w["text"].strip()]
            # walk the words in order, splitting at line boundaries
            starts, wi = [], 0
            for ln in asset["lines"]:
                n = len(ln["text"].split())
                if wi < len(words):
                    starts.append(round(words[wi]["start"], 3))
                else:
                    starts.append(starts[-1] if starts else 0.0)
                wi += n
            return starts
        except Exception:
            if attempt == 2:
                return None
            time.sleep(2 * (attempt + 1))


# --------------------------------------------------------------------------

def digest(asset):
    h = hashlib.sha256()
    h.update(json.dumps(asset, sort_keys=True, ensure_ascii=False).encode())
    h.update(json.dumps({k: VOICES[l["spk"]].get("settings")
                         for k, l in enumerate(asset["lines"])},
                        sort_keys=True).encode())
    return h.hexdigest()[:16]


def build_ambience():
    os.makedirs(AMB, exist_ok=True)
    sfx = f"{ROOT}/game/audio/sfx"
    os.makedirs(sfx, exist_ok=True)
    for name, fn in beds.STINGS.items():
        x = fn()
        x = x / (np.abs(x).max() + 1e-9) * 0.8
        encode(x, f"{sfx}/{name}.mp3", bitrate="128k")
        print(f"  sfx {name:12} {len(x)/SR:5.1f}s")
    for name, fn in beds.AMBIENCE.items():
        path = f"{AMB}/{name}.mp3"
        x = fn(24.0)
        x = x / (np.abs(x).max() + 1e-9) * 0.55
        # crossfade the last second into the first so it loops seamlessly
        n = int(1.0 * SR)
        head, tail = x[:n].copy(), x[-n:].copy()
        ramp = np.linspace(0, 1, n)
        x[:n] = head * ramp + tail * (1 - ramp)
        encode(x[:-n], path, bitrate="96k")
        print(f"  amb {name:12} {(len(x)-n)/SR:5.1f}s")


def main():
    args = sys.argv[1:]
    if "--ambience" in args:
        build_ambience()
        return
    if not KEY:
        sys.exit("ELEVENLABS_API_KEY not set")

    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    manifest = json.load(open(f"{ROOT}/production/manifest.json"))["assets"]
    only = args[args.index("--only") + 1] if "--only" in args else None
    force = "--force" in args
    reprocess = "--reprocess" in args

    state_path = f"{ROOT}/production/.state.json"
    state = json.load(open(state_path)) if os.path.exists(state_path) else {}

    todo = []
    for a in manifest:
        if only and a["id"] != only:
            continue
        d = digest(a)
        if not force and not reprocess \
                and state.get(a["id"], {}).get("digest") == d \
                and os.path.exists(f"{OUT}/{a['id']}.mp3"):
            continue
        todo.append((a, d))

    if reprocess:
        print(f"{len(todo)} assets to re-process from cached synthesis "
              "(no API credits)")
    else:
        print(f"{len(todo)} assets to generate "
              f"({sum(len(l['v3']) for a, _ in todo for l in a['lines']):,} chars)")
    if not todo:
        return

    lock = __import__("threading").Lock()
    done = [0]

    def work(item):
        a, d = item
        rawp = f"{RAW}/{a['id']}.mp3"
        try:
            if not os.path.exists(rawp) or (force and not reprocess):
                open(rawp, "wb").write(synth(a))
            dur = process(a, rawp, f"{OUT}/{a['id']}.mp3")
            starts = align(a, f"{OUT}/{a['id']}.mp3")
            with lock:
                state[a["id"]] = {"digest": d, "dur": round(dur, 3),
                                  "starts": starts, "mode": a["mode"],
                                  "chain": a["chain"]}
                done[0] += 1
                print(f"  [{done[0]:>3}/{len(todo)}] {a['id']:<34} "
                      f"{dur:5.1f}s {a['mode']}")
            return None
        except Exception as e:
            with lock:
                done[0] += 1
                print(f"  [{done[0]:>3}/{len(todo)}] {a['id']:<34} FAILED {e}")
            return (a["id"], str(e))

    with ThreadPoolExecutor(4) as ex:
        fails = [f for f in ex.map(work, todo) if f]

    json.dump(state, open(state_path, "w"), indent=1)
    with open(f"{ROOT}/game/audio/timings.json", "w") as f:
        json.dump({k: {"dur": v["dur"], "starts": v.get("starts")}
                   for k, v in state.items()}, f, indent=1)

    total = sum(v["dur"] for v in state.values())
    print(f"\ntotal authored audio: {total/60:.1f} min across {len(state)} assets")
    if fails:
        print(f"{len(fails)} FAILED:")
        for fid, e in fails:
            print(f"  {fid}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
