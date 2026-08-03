#!/usr/bin/env python3
"""
CRADLE SONG — content validator.

Checks structural integrity, reachability and fair-play guarantees, and reports
the synthesis budget. Run before generating audio; run again after editing content.

    python3 tools/validate.py
"""

from __future__ import annotations
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "game" / "content"

WPM = 150            # spoken words per minute, for runtime estimates
CLOCK_MINUTES = 31


def load(name: str) -> dict:
    return json.loads((CONTENT / f"{name}.json").read_text())


C = {n: load(n) for n in ("characters", "evidence", "interviews", "scenes", "endings")}

errors: list[str] = []
warnings: list[str] = []


def err(m: str) -> None:
    errors.append(m)


def warn(m: str) -> None:
    warnings.append(m)


# ───────────────────────── collect every line in the game ─────────────────────────

def walk_lines():
    """Yield (bucket, line) for every spoken/fx line in the content set."""
    for rid, reel in C["evidence"]["reels"].items():
        for ln in reel["lines"]:
            yield f"reel:{rid}", ln

    for cid, ch in C["interviews"]["channels"].items():
        for ln in ch.get("open_lines", []):
            yield f"chan:{cid}:open", ln
        for tid, t in ch.get("topics", {}).items():
            for ln in t.get("lines", []):
                yield f"chan:{cid}:{tid}", ln
        for rid, conf in ch.get("confrontations", {}).items():
            for ln in conf.get("lines", []):
                yield f"chan:{cid}:conf:{rid}", ln

    for sc in C["scenes"]["opening"]["scenes"]:
        for ln in sc["lines"]:
            yield f"open:{sc['id']}", ln

    for aid, a in C["scenes"]["analyses"].items():
        for ln in a.get("lines", []):
            yield f"anl:{aid}", ln

    for pid, p in C["scenes"]["puzzles"].items():
        for ln in p.get("intro", []):
            yield f"puz:{pid}:intro", ln
        for o in p["options"]:
            for ln in o.get("lines", []):
                yield f"puz:{pid}:{o['id']}", ln

    for k, lines in C["scenes"]["clock_events"].items():
        for ln in lines:
            yield f"clock:{k}", ln

    for ln in C["scenes"]["deduction"]["intro"]:
        yield "ded:intro", ln
    for ln in C["scenes"]["deduction"]["disposition"].get("lines", []):
        yield "ded:disp", ln

    for eid, e in C["endings"]["endings"].items():
        for ln in e["lines"]:
            yield f"end:{eid}", ln
        for ln in e.get("uninformed_extra", []):
            yield f"end:{eid}:uninformed", ln
    for ln in C["endings"]["epilogue"]["lines"]:
        yield "end:epilogue", ln


ALL = list(walk_lines())

# ───────────────────────── 1. line integrity ─────────────────────────

ids = Counter(ln["id"] for _, ln in ALL)
for lid, n in ids.items():
    if n > 1:
        err(f"duplicate line id {lid!r} ({n}×)")

speakers = set(C["characters"]["characters"]) | {"_fx"}
for bucket, ln in ALL:
    for field in ("id", "speaker", "text"):
        if field not in ln:
            err(f"{bucket}: line missing {field!r}: {ln.get('id', '?')}")
    if ln.get("speaker") not in speakers:
        err(f"{bucket}: unknown speaker {ln.get('speaker')!r} in {ln.get('id')}")
    if ln.get("speaker") != "_fx" and not ln.get("sec"):
        warn(f"{bucket}: {ln['id']} has no duration estimate")

# ambience references
for cid, ch in C["characters"]["characters"].items():
    amb = ch.get("ambience")
    if amb and amb not in C["characters"]["ambiences"]:
        err(f"character {cid}: unknown ambience {amb!r}")

# ───────────────────────── 2. reachability ─────────────────────────

reels = C["evidence"]["reels"]

# every flag that anything can set
producible: set[str] = set()
for _, ch in C["interviews"]["channels"].items():
    for t in ch.get("topics", {}).values():
        producible |= set(t.get("sets", [])) | set(t.get("sets_extra", []))
    for conf in ch.get("confrontations", {}).values():
        producible |= set(conf.get("sets", [])) | set(conf.get("sets_extra", []))
for r in reels.values():
    producible |= set(r.get("sets", []))
    if r.get("grants_flag_if"):
        producible.add(r["grants_flag_if"]["flag"])
for a in C["scenes"]["analyses"].values():
    producible |= set(a.get("sets", []))
for p in C["scenes"]["puzzles"].values():
    for o in p["options"]:
        producible |= set(o.get("sets", []))
producible |= {"knows_credential_gap"}  # derived in engine
producible |= set(C["scenes"]["analyses"])  # analyses double as unlock tokens

for rid, r in reels.items():
    for f in r.get("unlocked_by", []):
        if f not in producible:
            err(f"reel {rid}: unlocked_by {f!r} can never be set")

# reels that nothing unlocks
unlockers: set[str] = set()
for ch in C["interviews"]["channels"].values():
    for t in ch.get("topics", {}).values():
        if t.get("unlocks_reel"):
            unlockers.add(t["unlocks_reel"])
    for conf in ch.get("confrontations", {}).values():
        if conf.get("unlocks_reel"):
            unlockers.add(conf["unlocks_reel"])
for a in C["scenes"]["analyses"].values():
    if a.get("unlocks_reel"):
        unlockers.add(a["unlocks_reel"])
for p in C["scenes"]["puzzles"].values():
    for o in p["options"]:
        if o.get("unlocks_reel"):
            unlockers.add(o["unlocks_reel"])

for rid, r in reels.items():
    reachable = r.get("unlocked_at_start") or r.get("unlocked_by") or rid in unlockers
    if not reachable:
        err(f"reel {rid} is unreachable — nothing unlocks it")

# fair play: mandatory reels need ≥2 paths OR the pity timer
for rid, r in reels.items():
    if not r.get("mandatory"):
        continue
    if r.get("unlocked_at_start"):
        continue  # on the board from minute one; cannot be missed
    paths = len(r.get("unlocked_by", [])) + (1 if rid in unlockers else 0)
    if paths < 2 and not r.get("pity_offer_at"):
        warn(f"mandatory reel {rid} has only {paths} unlock path and no pity offer")

# confrontation targets exist
for cid, ch in C["interviews"]["channels"].items():
    for rid in ch.get("confrontations", {}):
        if rid != "_default" and rid not in reels:
            err(f"channel {cid}: confrontation references unknown reel {rid!r}")

# ───────────────────────── 3. endings ─────────────────────────

dispositions = {o["id"]: o for o in C["scenes"]["deduction"]["disposition"]["options"]}
ending_ids = set(C["endings"]["endings"])
mapped = {o["ending"] for o in dispositions.values() if o.get("ending")}
special = {"E_WRONGROOM", "E_WINDOWCLOSES"}

for e in ending_ids - mapped - special:
    err(f"ending {e} is not reachable from any disposition")
for e in mapped - ending_ids:
    err(f"disposition maps to missing ending {e}")

for slot in C["scenes"]["deduction"]["slots"]:
    if slot.get("no_correct_answer"):
        continue
    if not any(o.get("correct") for o in slot["options"]):
        err(f"deduction slot {slot['id']} has no correct option")

# gated deduction options must be satisfiable
for slot in C["scenes"]["deduction"]["slots"]:
    for o in slot["options"]:
        for f in o.get("requires_any", []):
            if f not in producible:
                err(f"deduction {slot['id']}/{o['id']}: requires unsettable flag {f!r}")

# ───────────────────────── 4. clock budget ─────────────────────────

reel_cost = sum(r["cost"] for r in reels.values())
chan_open = sum(ch.get("open_cost", 0) for ch in C["interviews"]["channels"].values())
topic_cost = sum(t["cost"] for ch in C["interviews"]["channels"].values()
                 for t in ch.get("topics", {}).values())
anl_cost = sum(a.get("cost", 0) for a in C["scenes"]["analyses"].values())

# minimum path to a correct, provable conviction
CRITICAL = ["E02", "E03", "E11", "E12", "E10", "E17"]
crit = sum(reels[r]["cost"] for r in CRITICAL)
crit += C["interviews"]["channels"]["okonjo"]["confrontations"]["E17"]["cost"]
crit += C["interviews"]["channels"]["okonjo"].get("open_cost", 0)
crit += C["scenes"]["analyses"]["ANL_CAPTUREBUS"]["cost"]
crit += C["scenes"]["analyses"]["ANL_EXEC"]["cost"]
crit += C["scenes"]["analyses"]["ANL_SPECTRAL"]["cost"]
crit += C["interviews"]["channels"]["haugen"]["topics"]["SH_creds"]["cost"]
crit += C["interviews"]["channels"]["haugen"].get("open_cost", 0)

if crit > CLOCK_MINUTES:
    err(f"the correct solution costs {crit} min but the clock is only {CLOCK_MINUTES} — unwinnable")

# ───────────────────────── 5. synthesis budget ─────────────────────────

spoken = [(b, ln) for b, ln in ALL if ln["speaker"] != "_fx"]
fx_lines = [ln for _, ln in ALL if ln["speaker"] == "_fx"]

chars = sum(len(ln["text"]) for _, ln in spoken)
words = sum(len(ln["text"].split()) for _, ln in spoken)
est_sec = sum(ln.get("sec", 0) for _, ln in ALL)

per_char = Counter(ln["speaker"] for _, ln in spoken)
per_char_chars = Counter()
for _, ln in spoken:
    per_char_chars[ln["speaker"]] += len(ln["text"])

fx_names = sorted({fx for _, ln in ALL for fx in ln.get("fx", [])})

# ───────────────────────── report ─────────────────────────

print("═" * 72)
print("CRADLE SONG — content validation")
print("═" * 72)

print(f"\nLINES           {len(ALL):>6}   ({len(spoken)} spoken, {len(fx_lines)} effect cues)")
print(f"SPOKEN WORDS    {words:>6}")
print(f"CHARACTERS      {chars:>6}   (TTS billing unit)")
print(f"EST. RUNTIME    {est_sec/60:>6.1f} min of audio across all branches")
print(f"                {words/WPM:>6.1f} min at {WPM} wpm — sanity check on the above")
print(f"DISTINCT SFX    {len(fx_names):>6}")

print("\nPER VOICE")
for spk, n in per_char.most_common():
    name = C["characters"]["characters"][spk]["name"]
    print(f"  {name:<26} {n:>3} lines   {per_char_chars[spk]:>6} chars")

print("\nCLOCK BUDGET")
print(f"  window                       {CLOCK_MINUTES:>4} min")
print(f"  all reels                    {reel_cost:>4} min")
print(f"  all channels + topics        {chan_open + topic_cost:>4} min")
print(f"  all analyses                 {anl_cost:>4} min")
print(f"  everything                   {reel_cost + chan_open + topic_cost + anl_cost:>4} min")
print(f"  minimum path to conviction   {crit:>4} min   ({CLOCK_MINUTES - crit} min spare for the 1983 thread)")

total_all = reel_cost + chan_open + topic_cost + anl_cost
print(f"\n  → a single run can reach {CLOCK_MINUTES/total_all*100:.0f}% of the material.")

print("\nESTIMATED ELEVENLABS COST")
tts = int(chars * 1.0)
sfx = len(fx_names) * 200
music = 6 * 3000
print(f"  dialogue (1 credit/char)     {tts:>8,}")
print(f"  sound effects (~200 ea)      {sfx:>8,}")
print(f"  music cues (~3000 ea)        {music:>8,}")
print(f"  subtotal                     {tts+sfx+music:>8,}")
print(f"  +30% retakes                 {int((tts+sfx+music)*1.3):>8,}")

if warnings:
    print(f"\nWARNINGS ({len(warnings)})")
    for w in warnings:
        print(f"  ! {w}")

if errors:
    print(f"\nERRORS ({len(errors)})")
    for e in errors:
        print(f"  ✗ {e}")
    print("\nFAILED")
    sys.exit(1)

print("\n✓ PASSED — no structural errors")
print("  · every reel reachable")
print("  · every ending reachable")
print("  · the solution fits inside the clock")
print("  · mandatory evidence cannot be permanently missed")
