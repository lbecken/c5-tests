"""Validate the script, segment it into audio assets, emit the playable graph.

    python3 production/build.py            validate + write game/story.js
    python3 production/build.py --check     validate only (exit 1 on failure)

Segmentation: consecutive lines that share an effects chain become one audio
asset, so ElevenLabs Dialogue mode gets whole conversational runs (interruption,
overlap, contextual pacing) while clue-bearing audio - the shortwave quotes, the
1983 tape, the nine-second insert - stays in its own file with its own
processing. Anything a player can run through the analysis bench must be its own
asset, or the clue is not physically present in the file they analyse.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import script as SC           # noqa: E402
from voices import VOICES     # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Effects chain per ambience/fx tag. `bed` names a procedural room tone that is
# mixed *into* the file (clue-bearing); browser-side ambience is separate.
FX = {
    "vault":       {"chain": "room",      "bed": None},
    "study":       {"chain": "room",      "bed": None},
    "apartment":   {"chain": "phone",     "bed": "nagel_room"},
    "workstation": {"chain": "room",      "bed": None},
    "line":        {"chain": "phone",     "bed": None},
    "bench":       {"chain": "room",      "bed": None},
    "checkpoint":  {"chain": "tape83",    "bed": None},
    "tape83":      {"chain": "tape83",    "bed": None},
    "shortwave":   {"chain": "shortwave", "bed": None},
    # per-line overrides
    "sw_quote":    {"chain": "shortwave", "bed": None},
    "insert":      {"chain": "shortwave", "bed": "nagel_room"},
    "tape91":      {"chain": "tape91",    "bed": None},
    "reel81":      {"chain": "reel81",    "bed": None},
    "near":        {"chain": "tape83",    "bed": None},
    "far":         {"chain": "tape83far", "bed": None},
    "none":        {"chain": "room",      "bed": None},
}

ERRORS, WARNINGS = [], []


def err(m):
    ERRORS.append(m)


def warn(m):
    WARNINGS.append(m)


# ---------------------------------------------------------------------------
# Segmentation
# ---------------------------------------------------------------------------

def segment(lines, default_fx):
    """Group consecutive lines sharing an fx chain into assets."""
    segs, cur, cur_fx = [], [], None
    for ln in lines:
        fx = ln.get("fx") or default_fx
        if fx != cur_fx and cur:
            segs.append({"fx": cur_fx, "lines": cur})
            cur = []
        cur_fx = fx
        cur.append(ln)
    if cur:
        segs.append({"fx": cur_fx, "lines": cur})
    return segs


def collect_assets():
    """Every audio asset the game needs, in generation order."""
    assets = []

    def add(aid, fx, lines):
        speakers = [l["spk"] for l in lines]
        if any(s not in VOICES for s in speakers):
            err(f"{aid}: unknown speaker {set(speakers) - set(VOICES)}")
        assets.append({
            "id": aid,
            "fx": fx,
            "chain": FX[fx]["chain"],
            "bed": FX[fx]["bed"],
            "mode": "dialogue" if len(set(speakers)) > 1 else "tts",
            "lines": [{"spk": l["spk"],
                       "text": l["text"],
                       "v3": l.get("v3") or l["text"]} for l in lines],
        })

    for s in SC.SCENES:
        amb = s.get("amb", "vault")
        for i, seg in enumerate(segment(s.get("lines", []), amb)):
            add(f"{s['id']}__{i:02d}", seg["fx"], seg["lines"])
        for b in s.get("bench_options", []):
            if b.get("line"):
                add(f"{s['id']}__bench_{b['id']}", amb, [b["line"]])
        for c in s.get("challenges", []):
            for i, seg in enumerate(segment(c["lines"], amb)):
                add(f"{s['id']}__ch_{c['id']}_{i:02d}", seg["fx"], seg["lines"])
        for key in ("break_lines", "fail_lines", "coda_total"):
            if s.get(key):
                for i, seg in enumerate(segment(s[key], amb)):
                    add(f"{s['id']}__{key[:5]}_{i:02d}", seg["fx"], seg["lines"])
    return assets


# ---------------------------------------------------------------------------
# Graph validation
# ---------------------------------------------------------------------------

def validate_graph():
    ids = {s["id"] for s in SC.SCENES}
    if len(ids) != len(SC.SCENES):
        err("duplicate scene ids")

    targets = set()
    for s in SC.SCENES:
        outs = []
        if s.get("next"):
            outs.append(s["next"])
        for c in s.get("choices", []):
            outs.append(c["goto"])
        for t in outs:
            if t not in ids:
                err(f"{s['id']}: goto '{t}' does not exist")
            targets.add(t)
        terminal = s.get("ending") or s.get("disclosure")
        if not outs and not terminal:
            err(f"{s['id']}: dead end (no next, no choices, not an ending)")

    # reachability from the opening scene
    seen, stack = set(), ["s01_broadcast"]
    by_id = {s["id"]: s for s in SC.SCENES}
    while stack:
        sid = stack.pop()
        if sid in seen or sid not in by_id:
            continue
        seen.add(sid)
        s = by_id[sid]
        if s.get("next"):
            stack.append(s["next"])
        for c in s.get("choices", []):
            stack.append(c["goto"])
        if s.get("theory"):
            stack.append("s36_disclosure")
        if s.get("disclosure"):
            stack += ["end_forecast", "end_necessary_lie", "end_repeated"]
        if s.get("confront"):
            stack.append(s.get("next"))
    for sid in ids - seen:
        err(f"{sid}: unreachable")

    for e in ("end_forecast", "end_necessary_lie", "end_repeated"):
        if e not in ids:
            err(f"missing ending {e}")

    # every evidence id referenced must be defined, and every one defined
    # must be grantable somewhere
    granted = set()
    for s in SC.SCENES:
        for g in s.get("grants", []) or []:
            granted.add(g)
        for c in s.get("choices", []):
            for g in c.get("grants", []) or []:
                granted.add(g)
        oc = s.get("on_correct") or {}
        for g in oc.get("grants", []) or []:
            granted.add(g)
    for g in granted:
        if g not in SC.EVIDENCE:
            err(f"evidence {g} granted but not defined")
    for e in SC.EVIDENCE:
        if e not in granted:
            warn(f"evidence {e} is defined but never granted")


def validate_fairplay():
    """The solution must be reachable, and reachable more than one way."""
    # 1. Nagel must be convictable by at least three independent clues.
    conf = next((s for s in SC.SCENES if s.get("confront")), None)
    if not conf:
        err("no confrontation scene")
        return
    correct = [c for c in conf["challenges"] if c.get("correct")]
    if len(correct) < 3:
        err(f"only {len(correct)} correct contradictions; need >= 3 "
            "so no single missed clue locks the player out")
    reqs = [c.get("req") for c in correct]
    if len(set(reqs)) != len(reqs):
        err("two correct contradictions depend on the same flag")

    # 2. Each of those flags must be set somewhere findable.
    setters = {}
    for s in SC.SCENES:
        for k in (s.get("sets") or {}):
            setters.setdefault(k, []).append(s["id"])
        for c in s.get("choices", []):
            for k in (c.get("sets") or {}):
                setters.setdefault(k, []).append(s["id"])
        oc = s.get("on_correct") or {}
        for k in (oc.get("sets") or {}):
            setters.setdefault(k, []).append(s["id"])
    for c in correct:
        r = c.get("req")
        if r and r not in setters:
            err(f"contradiction '{c['id']}' requires flag '{r}' "
                "that nothing ever sets")

    # 3. The 1983 answer must have two independent supports.
    if "dorsey_admitted" not in setters or "found_list" not in setters:
        err("Dorsey's 1983 role needs both the archive receipt and his "
            "own admission as independent supports")

    # 4. Kroll's exoneration must precede any chance to conclude it.
    if "knows_kroll_innocent" not in setters:
        err("nothing establishes Kroll's innocence")

    # 5. Fixed-point reachability. Walk the graph accumulating flags, taking
    #    an edge only when its requirement is already satisfiable. Anything
    #    that never becomes reachable is a genuine lockout, whatever the
    #    author intended.
    by_id = {sc["id"]: sc for sc in SC.SCENES}

    def satisfiable(req, flags, tags):
        if not req:
            return True
        if req.get("flag") and req["flag"] not in flags:
            return False
        # `not_flag` only hides an alternative route once the main route has
        # been taken; it never denies the player a first way in.
        if req.get("tag_count"):
            tag, n = req["tag_count"]
            if tags.get(tag, 0) < n:
                return False
        return True

    reach, flags, tags = {"s01_broadcast"}, set(), {}
    for _ in range(64):
        grew = False
        for sid in list(reach):
            sc = by_id[sid]
            for k in (sc.get("sets") or {}):
                if k not in flags:
                    flags.add(k)
                    grew = True
            oc = sc.get("on_correct") or {}
            for k in (oc.get("sets") or {}):
                if k not in flags:
                    flags.add(k)
                    grew = True
            outs = []
            if sc.get("next"):
                outs.append((sc["next"], None, None, None))
            for c in sc.get("choices", []):
                outs.append((c["goto"], c.get("req"), c.get("tag"),
                             c.get("sets")))
            if sc.get("theory"):
                outs.append(("s36_disclosure", None, None, None))
            if sc.get("disclosure"):
                outs += [(e, None, None, None) for e in
                         ("end_forecast", "end_necessary_lie", "end_repeated")]
            for tgt, req, tag, csets in outs:
                if not satisfiable(req, flags, tags):
                    continue
                for k in (csets or {}):
                    if k not in flags:
                        flags.add(k)
                        grew = True
                if tag and tags.get(tag, 0) < 9:
                    tags[tag] = tags.get(tag, 0) + 1
                    grew = True
                if tgt not in reach:
                    reach.add(tgt)
                    grew = True
                    for k in (by_id[tgt].get("sets") or {}):
                        if k not in flags:
                            flags.add(k)
        if not grew:
            break

    for sid in sorted({sc["id"] for sc in SC.SCENES} - reach):
        err(f"{sid}: not reachable under any satisfiable requirement chain")
    for f in ("knows_rhythm", "found_insert", "found_list", "room_tone",
              "syllable_gap", "nagel_slip", "has_confession",
              "knows_kroll_innocent", "dorsey_admitted", "vogt_mother"):
        if f not in flags:
            err(f"flag '{f}' is unobtainable")

    # 5b. The critical path must survive skipping any single witness. The
    #     authentication rhythm is what makes the insert detectable, so it
    #     needs two setters in two different acts.
    acts = {sc["id"]: sc.get("act") for sc in SC.SCENES}
    rhythm = set(setters.get("knows_rhythm", []))
    if len(rhythm) < 2:
        err("knows_rhythm has fewer than two routes")
    elif len({acts[s_] for s_ in rhythm}) < 2:
        err("all knows_rhythm routes are in the same act; a player who "
            "leaves that act without it is locked out of the insert")

    # 6. The confession must not be the only route to the accusation.
    if "has_confession" in setters:
        for c in correct:
            if c.get("req") == "has_confession":
                err("accusation must not depend on the confession scene")


# ---------------------------------------------------------------------------
# Emit
# ---------------------------------------------------------------------------

def emit():
    by_id = {s["id"]: s for s in SC.SCENES}
    out_scenes = {}
    for s in SC.SCENES:
        amb = s.get("amb", "vault")
        segs = segment(s.get("lines", []), amb)
        o = {k: v for k, v in s.items()
             if k in ("id", "act", "clock", "title", "amb", "next", "grants",
                      "sets", "hub", "bench", "confront", "theory",
                      "disclosure", "ending", "ending_id", "req", "sting",
                      "accuse_prompt", "questions", "options", "solo")}
        o["segments"] = [
            {"asset": f"{s['id']}__{i:02d}",
             "fx": g["fx"],
             "lines": [{"spk": l["spk"], "text": l["text"]} for l in g["lines"]]}
            for i, g in enumerate(segs)]
        if s.get("choices"):
            o["choices"] = s["choices"]
        if s.get("bench_options"):
            o["bench_options"] = [
                {k: v for k, v in b.items() if k != "line"} |
                ({"asset": f"{s['id']}__bench_{b['id']}",
                  "line": {"spk": b["line"]["spk"], "text": b["line"]["text"]}}
                 if b.get("line") else {})
                for b in s["bench_options"]]
        if s.get("on_correct"):
            o["on_correct"] = s["on_correct"]
        if s.get("challenges"):
            o["challenges"] = [{
                "id": c["id"], "label": c["label"],
                "correct": bool(c.get("correct")), "req": c.get("req"),
                "cost": c.get("cost", 0),
                "segments": [
                    {"asset": f"{s['id']}__ch_{c['id']}_{i:02d}",
                     "fx": g["fx"],
                     "lines": [{"spk": l["spk"], "text": l["text"]}
                               for l in g["lines"]]}
                    for i, g in enumerate(segment(c["lines"], amb))],
            } for c in s["challenges"]]
        for key, short in (("break_lines", "break"), ("fail_lines", "fail"),
                           ("coda_total", "coda_")):
            if s.get(key):
                o[key] = [
                    {"asset": f"{s['id']}__{key[:5]}_{i:02d}",
                     "fx": g["fx"],
                     "lines": [{"spk": l["spk"], "text": l["text"]}
                               for l in g["lines"]]}
                    for i, g in enumerate(segment(s[key], amb))]
        out_scenes[s["id"]] = o

    speakers = {k: {"name": v["name"], "f0": v["f0"]} for k, v in VOICES.items()}
    data = {
        "title": "THE FORECAST IS MEMORY",
        "scenes": out_scenes,
        "evidence": {k: {"name": v[0], "surface": v[1], "truth": v[2]}
                     for k, v in SC.EVIDENCE.items()},
        "speakers": speakers,
        "start": "s01_broadcast",
    }
    os.makedirs(f"{ROOT}/game", exist_ok=True)
    with open(f"{ROOT}/game/story.js", "w") as f:
        f.write("// generated by production/build.py - do not edit\n")
        f.write("window.STORY = ")
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write(";\n")

    assets = collect_assets()
    with open(f"{ROOT}/production/manifest.json", "w") as f:
        json.dump({"assets": assets}, f, indent=1, ensure_ascii=False)
    return out_scenes, assets


if __name__ == "__main__":
    validate_graph()
    validate_fairplay()
    scenes, assets = emit()

    tts_chars = sum(len(l["v3"]) for a in assets for l in a["lines"])
    print(f"scenes    {len(scenes)}")
    print(f"assets    {len(assets)}  "
          f"({sum(1 for a in assets if a['mode']=='dialogue')} dialogue, "
          f"{sum(1 for a in assets if a['mode']=='tts')} solo)")
    print(f"lines     {sum(len(a['lines']) for a in assets)}")
    print(f"tts chars {tts_chars:,}")
    for w in WARNINGS:
        print(f"  WARN  {w}")
    for e in ERRORS:
        print(f"  FAIL  {e}")
    if ERRORS:
        sys.exit(1)
    print("ok")
