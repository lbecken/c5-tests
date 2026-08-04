#!/usr/bin/env python3
"""
Level the generated ambience beds and sound effects.

ElevenLabs sound-generation returns wildly varying loudness — an ocean bed can
land 14 dB quieter than a pressure-chamber bed, which makes it vanish once the
engine ducks it under dialogue. Normalise both classes to fixed targets so the
mix is predictable, and hold peaks off the ceiling on the one-shots.

Idempotent: writes through a temp file and records what it has done.
"""
import glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
STAMP = os.path.join(GAME, "audio", ".normalized.json")

# integrated loudness targets
AMB_LUFS, AMB_TP = -20.0, -3.0     # beds sit under dialogue (~-16 LUFS)
SFX_LUFS, SFX_TP = -17.0, -1.5     # one-shots read clearly without clipping

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = "ffmpeg"


def measure(path):
    out = subprocess.run(
        [FFMPEG, "-i", path, "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    mean = re.search(r"mean_volume:\s*(-?[\d.]+) dB", out)
    peak = re.search(r"max_volume:\s*(-?[\d.]+) dB", out)
    return (float(mean.group(1)) if mean else 0.0,
            float(peak.group(1)) if peak else 0.0)


def normalize(path, lufs, tp):
    tmp = path + ".norm.mp3"
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-i", path,
         "-af", f"loudnorm=I={lufs}:TP={tp}:LRA=11",
         "-c:a", "libmp3lame", "-b:a", "128k", tmp],
        check=True)
    os.replace(tmp, path)


def main():
    done = json.load(open(STAMP)) if os.path.exists(STAMP) else {}
    force = "--force" in sys.argv
    groups = [
        ("ambience", sorted(glob.glob(f"{GAME}/audio/ambience/*.mp3")), AMB_LUFS, AMB_TP),
        ("sfx",      sorted(glob.glob(f"{GAME}/audio/sfx/*.mp3")),      SFX_LUFS, SFX_TP),
    ]
    for label, files, lufs, tp in groups:
        print(f"\n=== {label} -> {lufs} LUFS ===")
        for f in files:
            name = os.path.basename(f)
            key = f"{label}/{name}"
            if done.get(key) and not force:
                print(f"  {name:<24} already levelled")
                continue
            before = measure(f)
            normalize(f, lufs, tp)
            after = measure(f)
            print(f"  {name:<24} mean {before[0]:>7.1f} -> {after[0]:>6.1f} dB   "
                  f"peak {before[1]:>6.1f} -> {after[1]:>5.1f} dB")
            done[key] = True
    json.dump(done, open(STAMP, "w"), indent=1)
    print("\ndone.")


if __name__ == "__main__":
    main()
