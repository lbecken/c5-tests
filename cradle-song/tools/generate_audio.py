#!/usr/bin/env python3
"""
CRADLE SONG — ElevenLabs production pipeline.

Derives the audio manifest from game/content/*.json (single source of truth, so
script and audio cannot drift), costs the run against your actual quota, and
synthesises dialogue, sound effects and music in resumable batches.

    export ELEVENLABS_API_KEY=...

    python3 tools/generate_audio.py --plan              # cost the run, write nothing
    python3 tools/generate_audio.py --voices            # show voice resolution
    python3 tools/generate_audio.py --dialogue          # synthesise speech
    python3 tools/generate_audio.py --sfx --music       # effects and cues
    python3 tools/generate_audio.py --all               # everything
    python3 tools/generate_audio.py --all --only noema  # one voice / one prefix

Resumable: anything already on disk is skipped unless --force.
Every call is retried with backoff; a failed asset never aborts the batch.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "game" / "content"
AUDIO = ROOT / "game" / "audio"
TOOLS = Path(__file__).resolve().parent

API = "https://api.elevenlabs.io"
KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
OUTPUT_FORMAT = "mp3_44100_128"

# Preference order; the script picks the first that the account actually has.
MODEL_PREFERENCE = ["eleven_v3", "eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_monolingual_v1"]

C = {n: json.loads((CONTENT / f"{n}.json").read_text())
     for n in ("characters", "evidence", "interviews", "scenes", "endings")}
CHARS = C["characters"]["characters"]


# ═══════════════════════════════ http ═══════════════════════════════

def call(method: str, path: str, *, json_body=None, params=None, stream=False, tries=4):
    if not KEY:
        sys.exit("ELEVENLABS_API_KEY is not set.")
    url = f"{API}{path}"
    headers = {"xi-api-key": KEY}
    last = None
    for attempt in range(tries):
        try:
            r = requests.request(method, url, headers=headers, json=json_body,
                                 params=params, stream=stream, timeout=180)
            if r.status_code == 429:
                wait = min(2 ** attempt * 3, 45)
                print(f"    rate limited, waiting {wait}s")
                time.sleep(wait)
                continue
            if r.status_code >= 400:
                # surface the API's own message; it is usually specific
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text[:400]
                raise RuntimeError(f"HTTP {r.status_code} {path} → {detail}")
            return r
        except requests.exceptions.RequestException as e:
            last = e
            if "403" in str(e):
                raise
            time.sleep(min(2 ** attempt * 2, 30))
    raise RuntimeError(f"{path} failed after {tries} attempts: {last}")


def preflight() -> dict:
    """Quota + model availability. Fails loudly and usefully."""
    try:
        sub = call("GET", "/v1/user/subscription").json()
    except Exception as e:
        msg = str(e)
        if "403" in msg or "CONNECT" in msg or "tunnel" in msg:
            sys.exit(
                "Cannot reach api.elevenlabs.io — the egress policy is refusing CONNECT.\n"
                "Allow api.elevenlabs.io in the environment's network policy and start a\n"
                "NEW session (policy is applied at container start, not to a running one)."
            )
        sys.exit(f"Preflight failed: {e}")

    used = sub.get("character_count", 0)
    limit = sub.get("character_limit", 0)
    print(f"  account tier   {sub.get('tier', '?')}")
    print(f"  credits used   {used:,} / {limit:,}   ({limit - used:,} remaining)")

    models = call("GET", "/v1/models").json()
    have = {m["model_id"] for m in models}
    model = next((m for m in MODEL_PREFERENCE if m in have), None)
    if not model:
        sys.exit(f"No usable model. Account has: {sorted(have)}")
    print(f"  model          {model}")
    return {"remaining": limit - used, "model": model}


# ═══════════════════════════════ voices ═══════════════════════════════

def resolve_voices(verbose=False) -> dict:
    """tools/voices.json override → match by library_name → leave unresolved."""
    override_path = TOOLS / "voices.json"
    raw = json.loads(override_path.read_text()) if override_path.exists() else {}
    # blank entries and the comment block are not mappings
    override = {k: v for k, v in raw.items()
                if k != "_comment" and isinstance(v, str) and v.strip()}

    try:
        available = call("GET", "/v1/voices").json().get("voices", [])
    except Exception as e:
        print(f"  ! could not list voices ({e}); relying on tools/voices.json only")
        available = []

    by_name = {v["name"].lower(): v["voice_id"] for v in available}
    resolved, unresolved = {}, []

    for cid, spec in CHARS.items():
        if cid in override:
            resolved[cid] = override[cid]
            src = "voices.json"
        elif spec.get("library_name", "").lower() in by_name:
            resolved[cid] = by_name[spec["library_name"].lower()]
            src = f"library:{spec['library_name']}"
        else:
            unresolved.append(cid)
            src = "UNRESOLVED"
        if verbose:
            print(f"  {spec['name']:<24} {src:<26} {resolved.get(cid, '—')}")

    if unresolved and verbose:
        print("\n  Unresolved voices. Either add them to your ElevenLabs account,")
        print("  or map them explicitly in tools/voices.json:")
        print("    " + json.dumps({c: "<voice_id>" for c in unresolved}, indent=6))
        print("\n  Design prompts for these characters (usable with Voice Design):")
        for c in unresolved:
            print(f"    {CHARS[c]['name']}: {CHARS[c]['design_prompt']}")
    return resolved


# ═══════════════════════════════ manifest ═══════════════════════════════

def walk_lines():
    """Every line in the game, with the bucket it came from."""
    for rid, reel in C["evidence"]["reels"].items():
        for ln in reel["lines"]:
            yield ln, f"reel_{rid}"
    for cid, ch in C["interviews"]["channels"].items():
        for ln in ch.get("open_lines", []):
            yield ln, f"chan_{cid}"
        for t in ch.get("topics", {}).values():
            for ln in t.get("lines", []):
                yield ln, f"chan_{cid}"
        for conf in ch.get("confrontations", {}).values():
            for ln in conf.get("lines", []):
                yield ln, f"chan_{cid}"
    for sc in C["scenes"]["opening"]["scenes"]:
        for ln in sc["lines"]:
            yield ln, "opening"
    for a in C["scenes"]["analyses"].values():
        for ln in a.get("lines", []):
            yield ln, "analysis"
    for p in C["scenes"]["puzzles"].values():
        for ln in p.get("intro", []):
            yield ln, "puzzle"
        for o in p["options"]:
            for ln in o.get("lines", []):
                yield ln, "puzzle"
    for lines in C["scenes"]["clock_events"].values():
        for ln in lines:
            yield ln, "clock"
    for ln in C["scenes"]["deduction"]["intro"]:
        yield ln, "deduction"
    for ln in C["scenes"]["deduction"]["disposition"].get("lines", []):
        yield ln, "deduction"
    for eid, e in C["endings"]["endings"].items():
        for ln in e["lines"]:
            yield ln, f"ending_{eid}"
        for ln in e.get("uninformed_extra", []):
            yield ln, f"ending_{eid}"
    for ln in C["endings"]["epilogue"]["lines"]:
        yield ln, "ending_epilogue"


def build_manifest() -> dict:
    assets, sfx, seen = {}, {}, set()
    for ln, bucket in walk_lines():
        lid = ln["id"]
        if lid in seen:
            continue
        seen.add(lid)

        if ln["speaker"] != "_fx":
            spec = CHARS[ln["speaker"]]
            assets[lid] = {
                "file": f"{ln['speaker']}/{lid}.mp3",
                "speaker": ln["speaker"],
                "voice_name": spec["name"],
                "text": ln["text"],
                "direction": ln.get("dir", ""),
                "performance": spec["direction"],
                "voice_settings": spec.get("voice_settings", {}),
                "post": spec.get("post"),
                "bucket": bucket,
                "est_sec": ln.get("sec"),
                "chars": len(ln["text"]),
            }
        for name in ln.get("fx", []):
            sfx.setdefault(name, {"file": f"effects/{name}.mp3", "used_in": []})
            sfx[name]["used_in"].append(lid)

    return {
        "generated_from": "game/content/*.json",
        "output_format": OUTPUT_FORMAT,
        "assets": assets,
        "sfx": sfx,
        "music": MUSIC_CUES,
    }


# ═══════════════════════════════ prompts ═══════════════════════════════

SFX_PROMPTS = {
    # room / facility
    "room_seal": "A heavy insulated door closing and sealing, deep thunk then total deadness",
    "anechoic_dead": "Absolute anechoic silence, faint blood-pressure hiss, no reverb whatsoever",
    "door_heavy": "A heavy steel door in a concrete corridor opening and closing",
    "door_seal_deep": "A vast blast door sealing deep underground, sub-bass",
    "footsteps_recede": "Footsteps receding down a long concrete corridor, hard reverb tail",
    "chair_fall": "An office chair toppling onto a soft padded floor",
    "chair_scrape": "A chair pushed back sharply on a hard floor",
    "plate_impact": "Two heavy dull impacts of a hand against a metal plate, weak and uncoordinated",
    "seizure_floor": "Muffled irregular movement against thick soft foam, laboured breathing",
    "lift_doors": "Industrial lift doors closing, motor engaging, descending",
    "storm_distant": "Arctic wind and sleet against rock, heard from deep inside a mountain",
    "datacenter_spin": "A large data centre spinning up, hundreds of fans rising together",
    "datacenter_down": "A large data centre powering down in stages over nine seconds",
    # console / system
    "console_query": "A soft data terminal query tone, single confirmation blip",
    "console_boot": "A console interface coming online, layered soft tones",
    "console_deduct": "A formal record-entry tone, institutional, three notes",
    "channel_open": "An encrypted audio channel opening, brief digital handshake then room tone",
    "channel_noema": "Room tone vanishing to nothing, a channel with no acoustic space at all",
    "pa_chime": "A two-tone facility public address chime, institutional",
    "pa_chime_off": "A single descending public address end-of-announcement tone",
    "link_drop": "A satellite link dropping, carrier collapsing to nothing",
    "link_degrade": "A satellite carrier degrading, digital artefacts increasing",
    "transmit_up": "A data uplink establishing and transmitting, carrier tone",
    "upload_run": "Rapid bulk data upload, thousands of small transfer ticks",
    "deletion_run": "Systematic file deletion, thousands of records being destroyed",
    "spectral_sweep": "A spectrum analyser sweeping through frequency bands",
    "decode_run": "Rapid computational decoding, accelerating tick pattern",
    "decode_land": "A computation completing and stopping abruptly",
    "typewriter_record": "A record being entered on an official electric typewriter",
    "message_arrive": "A single unexpected message arriving on a dead channel",
    "phone_bad_line": "A poor long-distance telephone line, noise and dropouts",
    "keyboard": "Fast mechanical keyboard typing in a small room",
    "rec_start": "A recording device starting, click and preamp noise",
    "rec_stop": "A recording stopping abruptly mid-word",
    # signal
    "the_reply": "A wide slow radio carrier with almost-periodic structure inside it, alien, not a voice",
    "the_reply_resume": "The same wide radio carrier resuming mid-shape",
    "signal_gap": "A radio carrier stopping into clean digital silence",
    "signal_completion": "A radio carrier with a deep slow 17 Hz pulsing throb nested inside it",
    "hum_400": "A faint 400 Hz electrical drive supply hum, barely audible under room tone",
    "hum_400_solo": "A 400 Hz electrical hum, isolated and clear, in an empty dead room",
    "shortwave_tune": "Shortwave radio tuning across bands, atmospheric noise and heterodynes",
    "shortwave_bed": "Steady shortwave atmospheric noise floor",
    "carrier_drop": "A radio carrier dropping out, noise floor rising to meet it",
    "carrier_out": "A powerful transmitter carrier going out, four hundred kilowatts",
    "array_transmit": "A large radio telescope array beginning to transmit, drives and power",
    # tape
    "cassette_start": "A cassette recorder starting, mechanism and tape hiss",
    "tape_dropout": "Magnetic tape dropout, four seconds of damaged audio",
    "tape_speed_correct": "Tape playback speed being corrected, pitch rising to normal",
    "time_pass": "An abstract transition, days passing, low tone",
    "silence_hard": "Four seconds of absolute digital silence",
    # ambience beds (looping)
    "amb_control_room": "Quiet glass-walled control room, ventilation, distant equipment",
    "amb_decode_booth": "Cramped windowless booth, close air, small fan",
    "amb_security": "Security office, faint radio chatter, clock",
    "amb_machine_bay": "Machine bay, relays, cooling fans, mechanical",
    "amb_anechoic": "Anechoic chamber, complete acoustic deadness",
    "amb_shortwave": "Shortwave atmospheric noise, continuous",
    "amb_tape_hiss": "Analogue tape hiss, continuous",
    "amb_corridor": "Underground concrete corridor, ventilation",
    "amb_control_in": "Entering a control room, ambience establishing",
    "amb_booth_in": "Entering a small decode booth",
    "amb_security_in": "Entering a security office",
    "amb_bay_in": "Entering a machine bay",
    "amb_machine_bay_in": "Machine bay door microphone perspective",
}

# Music-box cues are the title, so they are generated as music rather than SFX.
MUSIC_CUES = {
    "music_box_full": {
        "prompt": "Solveig's Song by Grieg played on a small antique music box, eight bars, "
                  "thin and slightly slow, a little out of tune, recorded to 1983 tape",
        "ms": 18000,
    },
    "music_box_transmit": {
        "prompt": "A music box melody, Solveig's Song, processed as a powerful radio "
                  "transmission going outward, cold and vast, eight bars",
        "ms": 18000,
    },
    "music_box_degrading": {
        "prompt": "A music box melody, Solveig's Song, on decaying magnetic tape, notes "
                  "progressively failing to arrive, unsettling gaps",
        "ms": 16000,
    },
    "music_box_new": {
        "prompt": "A music box melody, Solveig's Song, heard on shortwave radio through "
                  "atmospheric noise, distant, newly transmitted",
        "ms": 14000,
    },
    "music_box_far": {
        "prompt": "A music box melody, Solveig's Song, very distant and soft, memory-like, "
                  "reverberant, fading",
        "ms": 12000,
    },
    "music_box_end": {
        "prompt": "Solveig's Song on a fifty-year-old music box, thin, fragile, closing "
                  "credits of a cold mystery, ending on an unresolved note",
        "ms": 18000,
    },
    "child_hum_buried": {
        "prompt": "A young child humming a simple music box lullaby, buried deep beneath "
                  "radio static, barely perceptible",
        "ms": 12000,
    },
    "child_hum_clear": {
        "prompt": "A young child humming a simple music box lullaby, clear, unhurried, "
                  "close, plain and not spooky",
        "ms": 9000,
    },
    "music_box_far_end": {
        "prompt": "A single music box note decaying into silence", "ms": 6000,
    },
}


# v3 reads bracketed text as an audio tag, but only reliably for SHORT ones. A long
# prose direction like "[the register drops out of his voice entirely - not fear,
# absence]" gets read aloud. So directions are condensed to a small vocabulary of
# safe tags, and anything that doesn't map is dropped rather than risked.
DIRECTION_TAGS = [
    (r"\bwhisper", "whispers"),
    (r"\bquiet|\bsmall\b|\bbarely|\bunder her breath|\bto herself|\bto himself", "quietly"),
    (r"\bflat\b|\bflatly|\blevel\b|\bno affect|\bunchanged|\bprocedural", "flatly"),
    (r"\bfast\b|\btoo fast|\bquick|\brushed|\bkeyed up|\bspeed", "rushed"),
    (r"\bwarm|\bfond|\bkind", "warmly"),
    (r"\btired|\bexhaust|\bweary", "tired"),
    (r"\bamused|\bwry|\bdry\b", "amused"),
    (r"\bbitter|\bhard\b|\bsharp", "clipped"),
    (r"\bgentle|\bsoft", "gently"),
    (r"\bshaken|\bbreaks?\b|\bcrack|\bbreathing changes|\bcosts him|\bgrief", "shaken"),
    (r"\bpause|\bbeat\b|\bslow", "slowly"),
    (r"\bcourteous|\bpolite|\bhelpful|\bsincere", "calm"),
    (r"\bcut(s)? (him|her) off|\binterrupt", "urgent"),
    (r"\bangry|\bloud|\braises", "firm"),
]


def condense_direction(d: str) -> str:
    """Map a prose stage direction onto at most one safe v3 audio tag."""
    if not d:
        return ""
    s = re.sub(r"\s+", " ", d.strip().strip("[]")).lower()
    for pattern, tag in DIRECTION_TAGS:
        if re.search(pattern, s):
            return tag
    return ""


def dialogue_prompt(asset: dict, use_tags: bool = True) -> str:
    """
    Build the string sent to the synthesiser. Stage direction never appears
    verbatim - it is condensed to a short tag or dropped entirely, so it can
    never leak into the read.
    """
    if not use_tags:
        return asset["text"]
    tag = condense_direction(asset.get("direction", ""))
    return f"[{tag}] {asset['text']}" if tag else asset["text"]


# ═══════════════════════════════ generation ═══════════════════════════════

def gen_dialogue(manifest, voices, model, only=None, force=False, limit=None):
    todo = []
    for lid, a in manifest["assets"].items():
        if only and not (a["speaker"] == only or lid.startswith(only)):
            continue
        out = AUDIO / a["file"]
        if out.exists() and not force:
            continue
        if a["speaker"] not in voices:
            print(f"  ⚠ no voice for {a['voice_name']} — skipping {lid}")
            continue
        todo.append((lid, a))
    if limit:
        todo = todo[:limit]

    print(f"\nDIALOGUE — {len(todo)} clips, {sum(a['chars'] for _, a in todo):,} characters")
    ok = fail = 0
    for i, (lid, a) in enumerate(todo, 1):
        out = AUDIO / a["file"]
        out.parent.mkdir(parents=True, exist_ok=True)
        body = {
            "text": dialogue_prompt(a),
            "model_id": model,
            "voice_settings": a["voice_settings"],
        }
        try:
            r = call("POST", f"/v1/text-to-speech/{voices[a['speaker']]}",
                     json_body=body, params={"output_format": OUTPUT_FORMAT}, stream=True)
            out.write_bytes(r.content)
            ok += 1
            print(f"  [{i:>3}/{len(todo)}] {lid:<16} {a['voice_name']:<22} {len(r.content)//1024:>4} KB")
        except Exception as e:
            fail += 1
            print(f"  [{i:>3}/{len(todo)}] {lid:<16} FAILED — {e}")
        time.sleep(0.25)
    print(f"  → {ok} written, {fail} failed")


def gen_sfx(manifest, only=None, force=False):
    todo = [(n, s) for n, s in manifest["sfx"].items()
            if n not in MUSIC_CUES
            and (not only or n.startswith(only))
            and (force or not (AUDIO / s["file"]).exists())]

    print(f"\nSOUND EFFECTS — {len(todo)} cues")
    ok = fail = 0
    for i, (name, s) in enumerate(todo, 1):
        prompt = SFX_PROMPTS.get(name)
        if not prompt:
            print(f"  [{i:>3}/{len(todo)}] {name:<24} no prompt defined — skipping")
            continue
        out = AUDIO / s["file"]
        out.parent.mkdir(parents=True, exist_ok=True)
        loop = name.startswith("amb_")
        try:
            r = call("POST", "/v1/sound-generation", json_body={
                "text": prompt,
                "duration_seconds": 12.0 if loop else 6.0,
                "prompt_influence": 0.45,
            }, stream=True)
            out.write_bytes(r.content)
            ok += 1
            print(f"  [{i:>3}/{len(todo)}] {name:<24} {len(r.content)//1024:>4} KB")
        except Exception as e:
            fail += 1
            print(f"  [{i:>3}/{len(todo)}] {name:<24} FAILED — {e}")
        time.sleep(0.3)
    print(f"  → {ok} written, {fail} failed")


def gen_music(force=False):
    todo = [(n, c) for n, c in MUSIC_CUES.items()
            if force or not (AUDIO / "effects" / f"{n}.mp3").exists()]
    print(f"\nMUSIC — {len(todo)} cues")
    ok = fail = 0
    for i, (name, cue) in enumerate(todo, 1):
        out = AUDIO / "effects" / f"{name}.mp3"
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            r = call("POST", "/v1/music", json_body={
                "prompt": cue["prompt"],
                "music_length_ms": cue["ms"],
            }, stream=True)
            out.write_bytes(r.content)
            ok += 1
            print(f"  [{i:>2}/{len(todo)}] {name:<24} {len(r.content)//1024:>4} KB")
        except Exception as e:
            fail += 1
            print(f"  [{i:>2}/{len(todo)}] {name:<24} FAILED — {e}")
        time.sleep(0.5)
    print(f"  → {ok} written, {fail} failed")
    if fail and ok == 0:
        print("  note: the Music API is not on every plan. Cues fall back to silence in-game;")
        print("  the game remains fully playable without them.")


def sync_durations(manifest):
    """
    Rewrite each line's `sec` in the content JSON from the measured length of its
    audio. Keeps subtitle-mode timing, the clock costs and the runtime estimates
    honest once real takes exist. CBR 128 kbps => 16000 bytes per second.
    """
    measured = {}
    for lid, a in manifest["assets"].items():
        f = AUDIO / a["file"]
        if f.exists():
            measured[lid] = round(f.stat().st_size / 16000.0, 1)
    if not measured:
        print("  no audio on disk; nothing to sync")
        return

    changed = 0

    def visit(node):
        nonlocal changed
        if isinstance(node, dict):
            if "id" in node and "speaker" in node and node["id"] in measured:
                new = measured[node["id"]]
                if node.get("sec") != new:
                    node["sec"] = new
                    changed += 1
            for v in node.values():
                visit(v)
        elif isinstance(node, list):
            for v in node:
                visit(v)

    for name in ("evidence", "interviews", "scenes", "endings"):
        data = json.loads((CONTENT / f"{name}.json").read_text())
        visit(data)
        (CONTENT / f"{name}.json").write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    total = sum(measured.values())
    print(f"  synced {changed} durations from {len(measured)} clips "
          f"({total/60:.1f} min of speech on disk)")


def write_manifest(manifest):
    """Only assets that exist on disk are advertised to the engine."""
    live = {
        "output_format": manifest["output_format"],
        "assets": {lid: {"file": a["file"], "speaker": a["speaker"]}
                   for lid, a in manifest["assets"].items()
                   if (AUDIO / a["file"]).exists()},
        "sfx": {n: s["file"] for n, s in manifest["sfx"].items()
                if (AUDIO / s["file"]).exists()},
    }
    AUDIO.mkdir(parents=True, exist_ok=True)
    (AUDIO / "manifest.json").write_text(json.dumps(live, indent=2))
    print(f"\n  manifest.json → {len(live['assets'])} clips, {len(live['sfx'])} effects")
    if not live["assets"]:
        print("  (empty: the game will run in subtitle mode, which is fully playable)")


# ═══════════════════════════════ main ═══════════════════════════════

def main():
    ap = argparse.ArgumentParser(description="Cradle Song audio pipeline")
    ap.add_argument("--plan", action="store_true", help="cost the run, write nothing")
    ap.add_argument("--voices", action="store_true", help="show voice resolution and exit")
    ap.add_argument("--dialogue", action="store_true")
    ap.add_argument("--sfx", action="store_true")
    ap.add_argument("--music", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--only", help="restrict to a speaker id or line-id prefix")
    ap.add_argument("--limit", type=int, help="cap number of dialogue clips (for a test batch)")
    ap.add_argument("--force", action="store_true", help="regenerate existing files")
    ap.add_argument("--manifest-only", action="store_true")
    ap.add_argument("--sync-durations", action="store_true",
                    help="rewrite content `sec` values from measured audio lengths")
    args = ap.parse_args()

    manifest = build_manifest()
    (CONTENT / "audio_manifest_full.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

    total_chars = sum(a["chars"] for a in manifest["assets"].values())
    n_sfx = len([n for n in manifest["sfx"] if n not in MUSIC_CUES])

    print("═" * 68)
    print("CRADLE SONG — audio production")
    print("═" * 68)
    print(f"\n  dialogue clips {len(manifest['assets']):>6}")
    print(f"  characters     {total_chars:>6,}")
    print(f"  sound effects  {n_sfx:>6}")
    print(f"  music cues     {len(MUSIC_CUES):>6}")
    print(f"\n  estimated credits: dialogue {total_chars:,} + sfx ~{n_sfx*200:,} "
          f"+ music ~{len(MUSIC_CUES)*3000:,}")
    print(f"  estimated total:   ~{total_chars + n_sfx*200 + len(MUSIC_CUES)*3000:,}")

    if args.manifest_only or args.sync_durations:
        if args.sync_durations:
            sync_durations(manifest)
        write_manifest(manifest)
        return

    if args.plan:
        print("\n  --plan: nothing written. Re-run with --all to generate.")
        return

    print("\nPREFLIGHT")
    info = preflight()

    if args.voices:
        print("\nVOICES")
        resolve_voices(verbose=True)
        return

    print("\nVOICES")
    voices = resolve_voices(verbose=True)

    need = total_chars + n_sfx * 200 + len(MUSIC_CUES) * 3000
    if need > info["remaining"]:
        print(f"\n  ⚠ estimated {need:,} credits needed, {info['remaining']:,} remaining.")
        print("    Generate in stages: --dialogue first (it is the game), then --sfx, then --music.")
        if not (args.dialogue or args.sfx or args.music):
            sys.exit("    Refusing --all when it would overrun. Pick a stage.")

    if args.all or args.dialogue:
        gen_dialogue(manifest, voices, info["model"], only=args.only,
                     force=args.force, limit=args.limit)
    if args.all or args.sfx:
        gen_sfx(manifest, only=args.only, force=args.force)
    if args.all or args.music:
        gen_music(force=args.force)

    sync_durations(manifest)
    write_manifest(manifest)
    print("\nDone. Serve the game:  cd game && python3 -m http.server 8080")


if __name__ == "__main__":
    main()
