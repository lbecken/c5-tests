#!/usr/bin/env python3
"""
Render the human-readable production script from the content JSON.

The JSON is the single source of truth. This file is a view of it, so the
script a voice director reads and the text the synthesiser speaks can never
disagree.

    python3 tools/export_script.py        # writes script/dialogue_master.md
"""

from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "game" / "content"
OUT = ROOT / "script" / "dialogue_master.md"

C = {n: json.loads((CONTENT / f"{n}.json").read_text())
     for n in ("characters", "evidence", "interviews", "scenes", "endings")}
CHARS = C["characters"]["characters"]

L: list[str] = []


def w(s: str = "") -> None:
    L.append(s)


def render(lines, indent=""):
    for ln in lines:
        spk = ln["speaker"]
        if spk == "_fx":
            w(f"{indent}> {ln['text']}")
            if ln.get("fx"):
                w(f"{indent}> `sfx: {', '.join(ln['fx'])}`")
            w()
            continue
        name = CHARS[spk]["display"]
        w(f"{indent}**{name}**  ·  `{ln['id']}`  ·  `audio/{spk}/{ln['id']}.mp3`")
        if ln.get("dir"):
            w(f"{indent}*{ln['dir']}*")
        w(f"{indent}> {ln['text']}")
        if ln.get("fx"):
            w(f"{indent}> `sfx: {', '.join(ln['fx'])}`")
        w()


def word_count(lines):
    return sum(len(l["text"].split()) for l in lines if l["speaker"] != "_fx")


# ───────────────────────── header ─────────────────────────

total_words = 0
for reel in C["evidence"]["reels"].values():
    total_words += word_count(reel["lines"])

w("# CRADLE SONG — production script")
w()
w("> Generated from `game/content/*.json` by `tools/export_script.py`. **Do not edit "
  "this file** — edit the JSON and re-run, or the audio will drift from the script.")
w()
w("Every line carries its asset id and target filename. Performance direction in "
  "*italics* is for the voice director and is passed to the synthesiser as an inline "
  "tag; it is never spoken.")
w()

# ───────────────────────── cast ─────────────────────────

w("## Cast")
w()
w("| Voice | Character | Direction |")
w("|---|---|---|")
for cid, c in CHARS.items():
    w(f"| `{cid}` | **{c['name']}** — {c['role']} | {c['direction']} |")
w()
w("---")
w()

# ───────────────────────── act 1 ─────────────────────────

w("## ACT ONE — Lockdown")
w()
w("*Clock stopped. Fixed sequence. ~4 minutes.*")
w()
for sc in C["scenes"]["opening"]["scenes"]:
    w(f"### {sc['id']} — {sc['title']}")
    w()
    render(sc["lines"])
w("---")
w()

# ───────────────────────── reels ─────────────────────────

w("## REELS")
w()
w("*Auditioned from the console. Cost in clock-minutes shown.*")
w()
for rid, r in C["evidence"]["reels"].items():
    tag = " · **MANDATORY**" if r.get("mandatory") else ""
    w(f"### {rid} — {r['label']}{tag}")
    w()
    w(f"`{r['source']}` · **{r['cost']} min** · {r['summary']}")
    w()
    if r.get("sets"):
        w(f"*sets:* `{'`, `'.join(r['sets'])}`")
        w()
    render(r["lines"])
    w("---")
    w()

# ───────────────────────── channels ─────────────────────────

w("## CHANNELS")
w()
for cid, ch in C["interviews"]["channels"].items():
    person = CHARS[cid]
    w(f"### {person['name']}")
    w()
    w(f"*{person['role']}* — {person['direction']}")
    w()
    if ch.get("open_lines"):
        w("#### On opening the channel")
        w()
        render(ch["open_lines"])
    for tid, t in ch.get("topics", {}).items():
        gate = f" · requires `{t['requires_flag']}`" if t.get("requires_flag") else ""
        w(f"#### ▸ {t['label']}")
        w()
        w(f"`{tid}` · {t['cost']} min{gate}")
        w()
        render(t.get("lines", []))
    for rid, conf in ch.get("confrontations", {}).items():
        if rid == "_default":
            w("#### ▸ [any other reel played at them]")
        else:
            label = C["evidence"]["reels"][rid]["label"]
            crack = " · **THEY BREAK**" if conf.get("is_crack") else ""
            w(f"#### ▸ Confronted with {rid} — {label}{crack}")
        w()
        w(f"`{conf.get('cost', 1)} min`")
        w()
        render(conf.get("lines", []))
    w("---")
    w()

# ───────────────────────── analyses + puzzle ─────────────────────────

w("## ANALYSES")
w()
for aid, a in C["scenes"]["analyses"].items():
    w(f"### {aid} — {a['label']}")
    w()
    w(f"*{a.get('cost', 0)} min*"
      + (f" · unlocks **{a['unlocks_reel']}**" if a.get("unlocks_reel") else ""))
    w()
    if a.get("lines"):
        render(a["lines"])
    else:
        w("> *No dialogue — this is a request. The cost is in auditioning what it unlocks.*")
        w()

for pid, p in C["scenes"]["puzzles"].items():
    w(f"## PUZZLE — {pid}")
    w()
    w(f"*{p['prompt']}*")
    w()
    render(p["intro"])
    for o in p["options"]:
        mark = " ✅ **KEY**" if o.get("is_key") else (" ⚠️ **DEAD END**" if not o.get("correct") else " ◻ partial")
        w(f"### ▸ {o['label']}{mark}")
        w()
        w(f"`{o['cost']} min`")
        w()
        render(o["lines"])
w("---")
w()

# ───────────────────────── clock + deduction ─────────────────────────

w("## CLOCK EVENTS")
w()
for k, lines in C["scenes"]["clock_events"].items():
    w(f"### {k}")
    w()
    render(lines)

w("## ACT FIVE — Findings")
w()
render(C["scenes"]["deduction"]["intro"])
for slot in C["scenes"]["deduction"]["slots"]:
    w(f"**{slot['prompt']}**")
    w()
    for o in slot["options"]:
        mark = " ← correct" if o.get("correct") else (" ← false accusation" if o.get("false_accusation") else "")
        w(f"- {o['label']}{mark}")
    w()
w("**DISPOSITION**")
w()
for o in C["scenes"]["deduction"]["disposition"]["options"]:
    w(f"- {o['label']} → `{o.get('ending', '—')}`")
w()
w("---")
w()

# ───────────────────────── endings ─────────────────────────

w("## ENDINGS")
w()
for eid, e in C["endings"]["endings"].items():
    w(f"### {e['title']}  ·  `{eid}`  ·  *{e['rank']}*")
    w()
    render(e["lines"])
    if e.get("uninformed_extra"):
        w("**If the player never learned the model was unreleased:**")
        w()
        render(e["uninformed_extra"])
    w("---")
    w()

w("### Epilogue — played after every ending")
w()
render(C["endings"]["epilogue"]["lines"])
w("```")
w(C["endings"]["epilogue"]["closing_card"])
w("```")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(L) + "\n")

spoken = sum(1 for line in L if line.startswith("**"))
print(f"wrote {OUT.relative_to(ROOT)}  ({len(L)} lines, {OUT.stat().st_size//1024} KB)")
