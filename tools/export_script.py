#!/usr/bin/env python3
"""Render the scene data as a readable production script: docs/DIALOGUE_MASTER.md."""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(ROOT, "docs", "DIALOGUE_MASTER.md")

ACT_TITLES = {
    1: "ACT I — The Sealed Chamber",
    2: "ACT II — Four People Under the Ice",
    3: "ACT III — The Forensic Console",
    4: "ACT IV — Pressure",
    5: "ACT V — Accusation",
}


def main():
    cfg = json.load(open(os.path.join(GAME, "data", "config.json")))
    scenes = []
    for rel in cfg["sceneFiles"]:
        scenes += json.load(open(os.path.join(GAME, rel)))["scenes"]
    cues = {}
    p = os.path.join(GAME, "data", "cues.json")
    if os.path.exists(p):
        cues = json.load(open(p))

    names = {k: v["name"] for k, v in cfg["characters"].items()}
    total_words = 0
    L = []

    L.append("# Dialogue Master\n")
    L.append("Generated from `game/data/scenes_act*.json` by `tools/export_script.py`. "
             "Do not edit by hand — edit the scene data.\n")
    L.append("**Complete spoiler.** Bracketed text is performance direction passed to "
             "the model as v3 audio tags; it is stripped from subtitles.\n")

    cur_act = None
    for sc in scenes:
        if sc.get("act") != cur_act:
            cur_act = sc.get("act")
            L.append(f"\n---\n\n# {ACT_TITLES.get(cur_act, 'ACT ' + str(cur_act))}\n")

        rec = cues.get(sc["id"])
        dur = f" · {rec['duration']:.0f}s" if rec else ""
        kind = " · HUB" if sc.get("type") == "hub" else \
               f" · {sc['type'].upper()}" if sc.get("type") else ""
        L.append(f"\n## {sc['title']}  \n"
                 f"`{sc['id']}`{kind} · {sc.get('location','—')}"
                 f" · bed: `{sc.get('ambience','—')}`{dur}\n")

        if sc.get("evidence"):
            ev = ", ".join(f"**{e}** {cfg['evidence'][e]['name']}" for e in sc["evidence"])
            L.append(f"> Evidence gained: {ev}\n")
        if sc.get("sfx"):
            L.append(f"> SFX: `{sc['sfx']}`\n")

        for ln in sc.get("lines", []):
            words = len(re.sub(r"\[[^\]]*\]", "", ln["t"]).split())
            total_words += words
            who = names.get(ln["s"], ln["s"]).upper()
            L.append(f"\n**{who}**  \n{ln['t']}\n")

        ch = sc.get("choices") or []
        if ch:
            L.append("\n*Choices:*\n")
            for c in ch:
                cond = ""
                if c.get("if"):
                    bits = []
                    for k in ("flags", "notFlags", "evidence"):
                        if c["if"].get(k):
                            bits.append(f"{k}={'+'.join(c['if'][k])}")
                    if c["if"].get("count"):
                        cnt = c["if"]["count"]
                        bits.append(f"≥{cnt.get('min')} of "
                                    f"{'/'.join(cnt.get('flags', []) + cnt.get('evidence', []))}")
                    cond = f"  *[requires {'; '.join(bits)}]*"
                L.append(f"- \"{c['label']}\" → `{c['to']}`{cond}")
            L.append("")
        elif sc.get("next"):
            L.append(f"\n→ `{sc['next']}`\n")

    header_stats = (f"\n*{len(scenes)} scene nodes · "
                    f"{sum(len(s.get('lines', [])) for s in scenes)} lines · "
                    f"{total_words:,} words*\n")
    L.insert(3, header_stats)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w").write("\n".join(L))
    print(f"wrote {OUT} — {total_words:,} words")


if __name__ == "__main__":
    main()
