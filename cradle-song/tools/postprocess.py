#!/usr/bin/env python3
"""
CRADLE SONG — archival processing chains.

Implements the degradation chains from docs/05-audio-direction.md. Clean takes are
preserved under audio/<speaker>/_master/ and every run reprocesses from those, so
this is idempotent and safe to re-run after tweaking a chain.

    python3 tools/postprocess.py --list      # what would be processed, and why
    python3 tools/postprocess.py             # process everything
    python3 tools/postprocess.py --chain shortwave_1983
    python3 tools/postprocess.py --restore   # put the clean masters back

Requires a real ffmpeg. The image ships only Playwright's build (--disable-everything,
no mp3, no audio filters); .claude/hooks/session-start.sh installs a full one.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "game" / "content"
AUDIO = ROOT / "game" / "audio"

CHARS = json.loads((CONTENT / "characters.json").read_text())["characters"]

# ── Lines that must NOT get their speaker's chain ────────────────────────────────
#
# Processing by speaker alone is too blunt: two lines depend on being clean, and the
# story says so out loud.
CLEAN_OVERRIDES = {
    # "the 1983 voice. exactly the 1983 voice. no degradation at all." The absence of
    # shortwave IS the horror beat - it means the thing is not on a tape any more.
    "EN_rd_07": "Redundancy ending: the line's whole point is that it is undegraded",
}

# The child is never processed anywhere. The buried version under the 1983 carrier is
# a separate generated cue (child_hum_buried); the spoken lines are meant to be plain
# and close - E14_04 is the resolved reveal, EN_cs_08 is scripted "no processing".
NEVER_PROCESS_SPEAKERS = {"child"}


# ── Chains ──────────────────────────────────────────────────────────────────────
#
# Each returns (filter_complex, needs_noise). Noise is mixed from anoisesrc when the
# chain wants a bed; otherwise a plain -af chain is used.

CHAINS = {
    "shortwave_1983": {
        "desc": "1983 shortwave: 300 Hz-3.2 kHz, AM compression, selective fading, atmospheric bed",
        "filter": (
            "[0:a]highpass=f=300,lowpass=f=3200,"
            "acompressor=threshold=0.08:ratio=4:attack=5:release=180,"
            "tremolo=f=0.13:d=0.35,"
            "alimiter=limit=0.92[v];"
            "[1:a]lowpass=f=3400,highpass=f=250,volume=0.16[n];"
            "[v][n]amix=inputs=2:duration=first:dropout_transition=0,"
            "volume=1.5[out]"
        ),
        "noise": "pink",
    },
    "cassette_1991": {
        "desc": "1991 cassette: 80 Hz-8 kHz, wow and flutter, tape hiss, gentle saturation",
        "filter": (
            "[0:a]highpass=f=80,lowpass=f=8000,"
            "vibrato=f=2:d=0.004,"
            "acompressor=threshold=0.12:ratio=3:attack=10:release=250,"
            "alimiter=limit=0.94[v];"
            "[1:a]highpass=f=2000,volume=0.05[n];"
            "[v][n]amix=inputs=2:duration=first:dropout_transition=0,"
            "volume=1.4[out]"
        ),
        "noise": "white",
    },
    "pa_system": {
        "desc": "Facility PA: 200 Hz-5 kHz, corridor reflection, compressed",
        "filter": (
            "[0:a]highpass=f=200,lowpass=f=5000,"
            "acompressor=threshold=0.1:ratio=5:attack=3:release=120,"
            "aecho=0.7:0.6:55|110:0.28|0.16,"
            "alimiter=limit=0.93,volume=1.3[out]"
        ),
        "noise": None,
    },
}


def have_ffmpeg() -> bool:
    if not shutil.which("ffmpeg"):
        return False
    out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"],
                         capture_output=True, text=True).stdout
    return " highpass " in out


def duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return path.stat().st_size / 16000.0


def targets() -> list[tuple[str, str, Path, Path]]:
    """(line_id, chain, master_path, output_path) for everything to process."""
    man = json.loads((CONTENT / "audio_manifest_full.json").read_text())
    out = []
    for lid, a in man["assets"].items():
        spk = a["speaker"]
        if spk in NEVER_PROCESS_SPEAKERS or lid in CLEAN_OVERRIDES:
            continue
        chain = CHARS[spk].get("post")
        if not chain or chain not in CHAINS:
            continue
        live = AUDIO / a["file"]
        master = live.parent / "_master" / live.name
        if not (live.exists() or master.exists()):
            continue
        out.append((lid, chain, master, live))
    return out


def process(lid: str, chain: str, master: Path, live: Path, force: bool) -> bool:
    # First run: the current file IS the clean take. Preserve it.
    master.parent.mkdir(parents=True, exist_ok=True)
    if not master.exists():
        shutil.copy2(live, master)

    spec = CHAINS[chain]
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(master)]
    if spec["noise"]:
        cmd += ["-f", "lavfi", "-t", f"{duration(master) + 0.5:.2f}",
                "-i", f"anoisesrc=color={spec['noise']}:amplitude=0.5:sample_rate=44100"]
    cmd += ["-filter_complex", spec["filter"], "-map", "[out]",
            "-c:a", "libmp3lame", "-b:a", "128k", str(live)]

    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  {lid:<12} FAILED — {r.stderr.strip()[:180]}")
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="show the plan, change nothing")
    ap.add_argument("--chain", help="restrict to one chain")
    ap.add_argument("--restore", action="store_true", help="copy clean masters back over the live files")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    todo = targets()
    if args.chain:
        todo = [t for t in todo if t[1] == args.chain]

    print("═" * 68)
    print("CRADLE SONG — archival processing")
    print("═" * 68)

    by_chain: dict[str, int] = {}
    for _, chain, _, _ in todo:
        by_chain[chain] = by_chain.get(chain, 0) + 1
    for c, n in sorted(by_chain.items()):
        print(f"  {c:<18} {n:>3} clips   {CHAINS[c]['desc']}")

    if CLEAN_OVERRIDES or NEVER_PROCESS_SPEAKERS:
        print("\n  deliberately left clean:")
        for spk in sorted(NEVER_PROCESS_SPEAKERS):
            print(f"    all of {CHARS[spk]['name']:<16} — scripted as unprocessed")
        for lid, why in CLEAN_OVERRIDES.items():
            print(f"    {lid:<22} — {why}")

    if args.list:
        return

    if args.restore:
        n = 0
        for lid, _, master, live in todo:
            if master.exists():
                shutil.copy2(master, live)
                n += 1
        print(f"\n  restored {n} clean masters")
        return

    if not have_ffmpeg():
        sys.exit(
            "\nNo usable ffmpeg. The image ships only Playwright's build "
            "(--disable-everything:\nno mp3, no audio filters). Install a real one:\n"
            "    apt-get install -y ffmpeg\n"
            "or let .claude/hooks/session-start.sh do it at session start."
        )

    print()
    ok = fail = 0
    for i, (lid, chain, master, live) in enumerate(todo, 1):
        if process(lid, chain, master, live, args.force):
            ok += 1
            print(f"  [{i:>3}/{len(todo)}] {lid:<12} {chain:<16} "
                  f"{duration(live):>5.1f}s")
        else:
            fail += 1
    print(f"\n  → {ok} processed, {fail} failed")
    print("  clean takes preserved under audio/<speaker>/_master/ (re-runnable)")


if __name__ == "__main__":
    main()
