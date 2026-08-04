#!/usr/bin/env python3
"""Validate the Europa Summit scene graph: references, reachability, dead ends, budget."""
import json, os, re, sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
SPECIAL = {"ROUTE_ACCUSATION", "ROUTE_ENDING", "ROUTE_CODA", "END"}

# Targets the engine can route to that are not named by a literal `next`.
ROUTE_TARGETS = {
    "ROUTE_ACCUSATION": ["s38_accusation_okafor", "s39_accusation_halloran", "s40_accusation_other"],
    "ROUTE_ENDING": ["e_A_signal", "e_B_verdict", "e_C_silence"],
    "ROUTE_CODA": ["coda_ratify", "coda_suspend", "coda_transmit"],
}


def load():
    cfg = json.load(open(os.path.join(GAME, "data", "config.json")))
    scenes = {}
    order = []
    for rel in cfg["sceneFiles"]:
        data = json.load(open(os.path.join(GAME, rel)))
        for sc in data["scenes"]:
            if sc["id"] in scenes:
                raise SystemExit(f"FATAL duplicate scene id: {sc['id']}")
            scenes[sc["id"]] = sc
            order.append(sc["id"])
    return cfg, scenes, order


def edges(sc):
    out = []
    if sc.get("next"):
        out.append(sc["next"])
    for ch in sc.get("choices", []):
        out.append(ch["to"])
    return out


def main():
    cfg, scenes, order = load()
    errors, warnings = [], []

    # 1. reference integrity
    for sid, sc in scenes.items():
        for tgt in edges(sc):
            if tgt in SPECIAL:
                for real in ROUTE_TARGETS.get(tgt, []):
                    if real not in scenes:
                        errors.append(f"{sid}: route target {real} missing")
                continue
            if tgt not in scenes:
                errors.append(f"{sid}: unknown target '{tgt}'")

    # 2. terminal check
    for sid, sc in scenes.items():
        if not edges(sc) and sc.get("type") != "hub":
            errors.append(f"{sid}: dead end (no next, no choices)")

    # 3. reachability from start
    start = cfg["start"]
    seen, q = set(), deque([start])
    while q:
        cur = q.popleft()
        if cur in seen or cur in SPECIAL:
            continue
        seen.add(cur)
        sc = scenes.get(cur)
        if not sc:
            continue
        for tgt in edges(sc):
            if tgt in ROUTE_TARGETS:
                q.extend(ROUTE_TARGETS[tgt])
            elif tgt not in SPECIAL:
                q.append(tgt)
    for sid in scenes:
        if sid not in seen:
            errors.append(f"{sid}: UNREACHABLE from {start}")

    # 4. evidence / character sanity
    known_ev = set(cfg["evidence"])
    known_ch = set(cfg["characters"])
    granted = set()
    for sid, sc in scenes.items():
        for e in sc.get("evidence", []):
            if e not in known_ev:
                errors.append(f"{sid}: unknown evidence '{e}'")
            granted.add(e)
        for ln in sc.get("lines", []):
            if ln["s"] not in known_ch:
                errors.append(f"{sid}: unknown speaker '{ln['s']}'")
    for e in known_ev - granted:
        warnings.append(f"evidence {e} ({cfg['evidence'][e]['name']}) is never granted by any scene")

    # 5. condition sanity - every flag referenced in a condition is set somewhere
    set_flags = set()
    for sc in scenes.values():
        set_flags |= set(sc.get("flags", {}))
        for ch in sc.get("choices", []):
            set_flags |= set(ch.get("sets", {}))
    used_flags = set()
    for sc in scenes.values():
        for ch in sc.get("choices", []):
            cond = ch.get("if") or {}
            used_flags |= set(cond.get("flags", []))
            used_flags |= set(cond.get("notFlags", []))
            cnt = cond.get("count") or {}
            used_flags |= set(cnt.get("flags", []))
    for f in used_flags - set_flags:
        errors.append(f"condition references flag '{f}' that no scene sets")

    # 6. budget
    total_lines = total_words = total_chars = 0
    per_char = {}
    for sc in scenes.values():
        for ln in sc.get("lines", []):
            clean = re.sub(r"\[[^\]]*\]", "", ln["t"]).strip()
            total_lines += 1
            w = len(clean.split())
            total_words += w
            total_chars += len(ln["t"])
            per_char.setdefault(ln["s"], [0, 0])
            per_char[ln["s"]][0] += 1
            per_char[ln["s"]][1] += w

    playable = [s for s in scenes.values() if s.get("lines")]
    hubs = [s for s in scenes.values() if s.get("type") == "hub"]
    choices = sum(len(s.get("choices", [])) for s in scenes.values())

    print("=" * 62)
    print("  MURDER AT THE EUROPA SUMMIT — graph validation")
    print("=" * 62)
    print(f"  scene nodes ............ {len(scenes)}")
    print(f"  dialogue scenes ........ {len(playable)}")
    print(f"  hubs ................... {len(hubs)}")
    print(f"  choice points .......... {choices}")
    print(f"  spoken lines ........... {total_lines}")
    print(f"  spoken words ........... {total_words}")
    print(f"  TTS characters ......... {total_chars}")
    print(f"  est. runtime ........... {total_words / 150:.1f} min of audio (@150 wpm)")
    print(f"  evidence items ......... {len(known_ev)}")
    print("-" * 62)
    for name, (n, w) in sorted(per_char.items(), key=lambda kv: -kv[1][1]):
        print(f"  {name:<10} {n:>4} lines  {w:>5} words")
    print("=" * 62)

    for w in warnings:
        print(f"  WARN   {w}")
    for e in errors:
        print(f"  ERROR  {e}")
    if not errors and not warnings:
        print("  clean.")
    print()
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
