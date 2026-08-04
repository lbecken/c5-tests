#!/usr/bin/env python3
"""
Audio production for MURDER AT THE EUROPA SUMMIT.

Scenes are rendered with the ElevenLabs v3 text-to-dialogue endpoint so that
multi-speaker pacing, interruptions and emotional cues are handled by the model
rather than by splicing single-voice takes together.

A scene is split into "runs":
  * a stage-direction-only line ([silence], [pause]) ends a run and becomes a
    real beat of digital silence in the mix;
  * crossing between archival voices (Rook, heard only on recordings) and live
    voices ends a run, so the archival band-pass can be applied to just those
    segments.

Each run is requested /with-timestamps, whose voice_segments give exact
per-line start/end times. Runs are concatenated with ffmpeg and the timings
offset accordingly, producing game/data/cues.json for subtitle sync.

Usage:
  python3 tools/generate_audio.py --all
  python3 tools/generate_audio.py --scenes --only s04_final_recording
  python3 tools/generate_audio.py --ambience --sfx
  python3 tools/generate_audio.py --scenes --dry-run
"""
import argparse, base64, hashlib, json, os, re, subprocess, sys, time
import urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
API = "https://api.elevenlabs.io"
KEY = os.environ.get("ELEVENLABS_API_KEY")
MODEL = "eleven_v3"
FMT = "mp3_44100_128"

# Voices heard only through recordings get archival treatment.
ARCHIVAL = {"ROOK"}
ARCHIVAL_FILTER = (
    "highpass=f=200,lowpass=f=3800,"
    "acompressor=threshold=-18dB:ratio=3:attack=5:release=120,"
    "volume=1.15"
)

BEAT_SECONDS = {"silence": 1.7, "pause": 1.1, "default": 1.3}

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = "ffmpeg"


# ---------------------------------------------------------------- utilities

def clean(text):
    """Strip bracketed performance directions -> subtitle text."""
    return re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]", "", text)).strip()


def is_beat(text):
    return clean(text) == ""


def beat_length(text):
    low = text.lower()
    for k, v in BEAT_SECONDS.items():
        if k in low:
            return v
    return BEAT_SECONDS["default"]


def post(path, payload, binary=False, retries=5):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API}{path}", data=body,
        headers={"xi-api-key": KEY, "Content-Type": "application/json"},
        method="POST")
    delay = 3
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=360) as r:
                raw = r.read()
                return raw if binary else json.loads(raw)
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                print(f"      HTTP {e.code}, retry in {delay}s", flush=True)
                time.sleep(delay); delay *= 2; continue
            raise SystemExit(f"HTTP {e.code} on {path}: {detail}")
        except Exception as e:
            if attempt < retries - 1:
                print(f"      {type(e).__name__}, retry in {delay}s", flush=True)
                time.sleep(delay); delay *= 2; continue
            raise
    raise SystemExit("unreachable")


def ff(args):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error"] + args, check=True)


def duration(path):
    out = subprocess.run(
        [FFMPEG, "-i", path, "-f", "null", "-"],
        capture_output=True, text=True).stderr
    m = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", out)
    if not m:
        return 0.0
    h, mnt, s = m[-1]
    return int(h) * 3600 + int(mnt) * 60 + float(s)


def load_all():
    cfg = json.load(open(os.path.join(GAME, "data", "config.json")))
    scenes = []
    for rel in cfg["sceneFiles"]:
        scenes += json.load(open(os.path.join(GAME, rel)))["scenes"]
    return cfg, scenes


def load_cache():
    p = os.path.join(GAME, "data", ".audio_cache.json")
    return json.load(open(p)) if os.path.exists(p) else {}


def save_cache(c):
    json.dump(c, open(os.path.join(GAME, "data", ".audio_cache.json"), "w"), indent=1)


# ------------------------------------------------------------------- scenes

def plan_runs(lines):
    """Split a scene's lines into (kind, payload) runs."""
    runs, cur, cur_arch = [], [], None
    for idx, ln in enumerate(lines):
        if is_beat(ln["t"]):
            if cur:
                runs.append(("speech", cur)); cur = []; cur_arch = None
            runs.append(("beat", (idx, beat_length(ln["t"]))))
            continue
        arch = ln["s"] in ARCHIVAL
        if cur and arch != cur_arch:
            runs.append(("speech", cur)); cur = []
        cur.append((idx, ln)); cur_arch = arch
    if cur:
        runs.append(("speech", cur))
    return runs


def render_scene(scene, voices, outdir, tmpdir, dry=False):
    sid = scene["id"]
    lines = scene.get("lines", [])
    if not lines:
        return None

    runs = plan_runs(lines)
    if dry:
        chars = sum(len(l["t"]) for l in lines)
        print(f"  {sid:<26} {len(lines):>3} lines  {len(runs):>2} runs  {chars:>5} chars")
        return {"dry": True, "chars": chars}

    parts, cues, offset = [], [], 0.0
    for ri, (kind, payload) in enumerate(runs):
        part = os.path.join(tmpdir, f"{sid}_{ri:02d}.mp3")

        if kind == "beat":
            idx, secs = payload
            ff(["-f", "lavfi", "-i", f"anullsrc=r=44100:cl=mono",
                "-t", f"{secs}", "-c:a", "libmp3lame", "-b:a", "128k", part])
            cues.append({"i": idx, "start": round(offset, 3),
                         "end": round(offset + secs, 3), "beat": True})
            offset += secs
            parts.append(part)
            continue

        inputs = [{"text": ln["t"], "voice_id": voices[ln["s"]]["voice_id"]}
                  for _, ln in payload]
        resp = post(f"/v1/text-to-dialogue/with-timestamps?output_format={FMT}",
                    {"model_id": MODEL, "inputs": inputs,
                     "settings": {"stability": 0.5, "use_speaker_boost": True}})

        raw = os.path.join(tmpdir, f"{sid}_{ri:02d}_raw.mp3")
        with open(raw, "wb") as f:
            f.write(base64.b64decode(resp["audio_base64"]))

        archival = payload[0][1]["s"] in ARCHIVAL
        if archival:
            ff(["-i", raw, "-af", ARCHIVAL_FILTER, "-c:a", "libmp3lame",
                "-b:a", "128k", part])
        else:
            ff(["-i", raw, "-c:a", "libmp3lame", "-b:a", "128k", part])

        segs = resp.get("voice_segments") or []
        run_len = duration(part)
        for si, seg in enumerate(segs):
            if si >= len(payload):
                break
            idx = payload[seg.get("dialogue_input_index", si)][0] \
                if seg.get("dialogue_input_index", si) < len(payload) else payload[si][0]
            cues.append({
                "i": idx,
                "start": round(offset + seg["start_time_seconds"], 3),
                "end": round(offset + seg["end_time_seconds"], 3),
            })
        if not segs:  # fall back to proportional split
            total = sum(len(l["t"]) for _, l in payload)
            t = offset
            for idx, ln in payload:
                d = run_len * len(ln["t"]) / max(total, 1)
                cues.append({"i": idx, "start": round(t, 3), "end": round(t + d, 3)})
                t += d
        offset += run_len
        parts.append(part)

    # concatenate
    listfile = os.path.join(tmpdir, f"{sid}_list.txt")
    with open(listfile, "w") as f:
        for p in parts:
            f.write(f"file '{os.path.abspath(p)}'\n")
    out = os.path.join(outdir, f"{sid}.mp3")
    ff(["-f", "concat", "-safe", "0", "-i", listfile,
        "-c:a", "libmp3lame", "-b:a", "128k", out])

    cues.sort(key=lambda c: c["start"])
    total = duration(out)
    print(f"  {sid:<26} {total:>6.1f}s  {len(lines):>3} lines  {len(runs):>2} runs")
    return {"file": f"audio/scenes/{sid}.mp3", "duration": round(total, 2),
            "cues": cues}


def do_scenes(cfg, scenes, only, dry, force):
    outdir = os.path.join(GAME, "audio", "scenes")
    tmpdir = os.path.join(GAME, "audio", ".tmp")
    os.makedirs(outdir, exist_ok=True); os.makedirs(tmpdir, exist_ok=True)

    cuepath = os.path.join(GAME, "data", "cues.json")
    allcues = json.load(open(cuepath)) if os.path.exists(cuepath) else {}
    cache = load_cache()

    todo = [s for s in scenes if s.get("lines")]
    if only:
        todo = [s for s in todo if s["id"] in only]

    print(f"\n=== scenes ({len(todo)}) ===")
    total_chars = 0
    for sc in todo:
        sid = sc["id"]
        sig = hashlib.sha1(json.dumps(sc.get("lines"), sort_keys=True).encode()).hexdigest()
        target = os.path.join(outdir, f"{sid}.mp3")
        if not force and not dry and cache.get(sid) == sig and os.path.exists(target) \
                and sid in allcues:
            print(f"  {sid:<26} cached")
            continue
        res = render_scene(sc, cfg["characters"], outdir, tmpdir, dry)
        if dry:
            total_chars += res["chars"]
            continue
        allcues[sid] = res
        cache[sid] = sig
        json.dump(allcues, open(cuepath, "w"), indent=1)
        save_cache(cache)

    if dry:
        print(f"\n  total TTS characters: {total_chars}")


# --------------------------------------------------------- ambience and sfx

def sound_gen(prompt, seconds, out, loop=False):
    payload = {"text": prompt, "duration_seconds": seconds,
               "prompt_influence": 0.55, "model_id": "eleven_text_to_sound_v2"}
    if loop:
        payload["loop"] = True
    raw = post(f"/v1/sound-generation?output_format={FMT}", payload, binary=True)
    with open(out, "wb") as f:
        f.write(raw)


def do_ambience(cfg, force):
    outdir = os.path.join(GAME, "audio", "ambience")
    os.makedirs(outdir, exist_ok=True)
    print(f"\n=== ambience ===")
    for key, a in cfg["ambience"].items():
        if not a.get("file"):
            continue
        out = os.path.join(GAME, a["file"])
        if os.path.exists(out) and not force:
            print(f"  {key:<20} cached"); continue
        tmp = out + ".raw.mp3"
        sound_gen(a["prompt"], 22, tmp, loop=True)
        # gentle fade at both ends so the engine's loop crossfade is seamless
        ff(["-i", tmp, "-af", "afade=t=in:st=0:d=1.5,afade=t=out:st=20.5:d=1.5,volume=0.9",
            "-c:a", "libmp3lame", "-b:a", "128k", out])
        os.remove(tmp)
        print(f"  {key:<20} {duration(out):.1f}s")


def do_sfx(cfg, force):
    outdir = os.path.join(GAME, "audio", "sfx")
    os.makedirs(outdir, exist_ok=True)
    print(f"\n=== sfx ===")
    for key, s in cfg["sfx"].items():
        out = os.path.join(GAME, s["file"])
        if os.path.exists(out) and not force:
            print(f"  {key:<20} cached"); continue
        sound_gen(s["prompt"], s.get("duration", 4), out)
        print(f"  {key:<20} {duration(out):.1f}s")


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--scenes", action="store_true")
    ap.add_argument("--ambience", action="store_true")
    ap.add_argument("--sfx", action="store_true")
    ap.add_argument("--only", nargs="*", help="scene ids")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if not KEY and not args.dry_run:
        raise SystemExit("ELEVENLABS_API_KEY is not set")

    cfg, scenes = load_all()
    want_all = args.all or not (args.scenes or args.ambience or args.sfx)

    if want_all or args.ambience:
        if not args.dry_run:
            do_ambience(cfg, args.force)
    if want_all or args.sfx:
        if not args.dry_run:
            do_sfx(cfg, args.force)
    if want_all or args.scenes:
        do_scenes(cfg, scenes, set(args.only or []), args.dry_run, args.force)

    print("\ndone.")


if __name__ == "__main__":
    main()
