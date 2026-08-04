#!/usr/bin/env python3
"""
Headless playthrough simulator.

Mirrors engine.js condition/routing logic exactly, then walks the graph with
three different examiner personalities to prove each ending is reachable and
to measure runtime from the real generated audio durations.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")

KEY_EVIDENCE = ["E18", "E19", "E20", "E21"]


def load():
    cfg = json.load(open(os.path.join(GAME, "data", "config.json")))
    scenes = {}
    for rel in cfg["sceneFiles"]:
        for sc in json.load(open(os.path.join(GAME, rel)))["scenes"]:
            scenes[sc["id"]] = sc
    cues = {}
    p = os.path.join(GAME, "data", "cues.json")
    if os.path.exists(p):
        cues = json.load(open(p))
    return cfg, scenes, cues


class Run:
    def __init__(self, cfg, scenes, cues):
        self.cfg, self.scenes, self.cues = cfg, scenes, cues
        self.ev, self.flags, self.used = set(), {}, set()
        self.visited, self.path = [], []
        self.deductions, self.policy, self.ending = {}, None, None
        self.seconds = 0.0

    # --- engine.js parity -------------------------------------------------
    def cond_ok(self, c):
        if not c:
            return True
        if any(not self.flags.get(f) for f in c.get("flags", [])):
            return False
        if any(self.flags.get(f) for f in c.get("notFlags", [])):
            return False
        if any(e not in self.ev for e in c.get("evidence", [])):
            return False
        cnt = c.get("count")
        if cnt:
            n = sum(1 for f in cnt.get("flags", []) if self.flags.get(f))
            n += sum(1 for e in cnt.get("evidence", []) if e in self.ev)
            if n < cnt.get("min", 1):
                return False
        return True

    def ckey(self, sc, ch):
        return f"{sc['id']}|{ch['to']}|{ch.get('label','')}"

    def options(self, sc):
        out = []
        for ch in sc.get("choices", []):
            if ch.get("once") and self.ckey(sc, ch) in self.used:
                continue
            if self.cond_ok(ch.get("if")):
                out.append(ch)
        return out

    def chain_proved(self):
        return "E17" in self.ev and sum(1 for e in KEY_EVIDENCE if e in self.ev) >= 3

    def route(self, target):
        if target == "ROUTE_ACCUSATION":
            k = self.deductions.get("killer")
            if k == "okafor" and self.chain_proved():
                return "s38_accusation_okafor"
            if k == "halloran":
                return "s39_accusation_halloran"
            return "s40_accusation_other"
        if target == "ROUTE_ENDING":
            k = self.deductions.get("killer")
            self.ending = "A" if (k == "okafor" and self.chain_proved()) \
                else "B" if k == "halloran" else "C"
            return self.cfg["endings"][self.ending]["scene"]
        if target == "ROUTE_CODA":
            return {"ratify": "coda_ratify", "suspend": "coda_suspend",
                    "transmit": "coda_transmit"}[self.policy]
        return target

    def enter(self, sid):
        sc = self.scenes[sid]
        self.path.append(sid)
        if sid not in self.visited:
            self.visited.append(sid)
        for e in sc.get("evidence", []):
            self.ev.add(e)
        self.flags.update(sc.get("flags", {}))
        rec = self.cues.get(sid)
        if rec and sid not in self.path[:-1]:
            self.seconds += rec.get("duration", 0)
        return sc


def walk(cfg, scenes, cues, style, killer, policy, limit=400):
    """style: 'thorough' explores everything; 'hasty' rushes to the hearing."""
    r = Run(cfg, scenes, cues)
    r.deductions = {"method": "bus3", "killer": killer,
                    "motive": "martyr", "recordings": "mixed"}
    r.policy = policy
    sid = cfg["start"]
    stall = 0

    # When no new content is available, walk deliberately toward the hearing.
    ADVANCE = ["s37_theory", "hub_pressure", "hub_forensics"]

    for _ in range(limit):
        before = len(r.visited)
        sc = r.enter(sid)
        stall = 0 if len(r.visited) > before else stall + 1

        if sc.get("type") == "deduction":
            sid = r.route("ROUTE_ACCUSATION")
            continue
        if sc.get("type") == "policy":
            sid = r.route("ROUTE_ENDING")
            continue

        opts = r.options(sc)
        if opts:
            pick = None
            if style == "hasty":
                # head for the hearing as soon as it is offered
                pick = next((c for c in opts if c["to"] == "s37_theory"), None)
                if not pick:
                    pick = next((c for c in opts if c["to"] not in r.visited), None)
            else:
                # thorough: exhaust fresh content, saving the hearing for last
                fresh = [c for c in opts if c["to"] not in r.visited
                         and c["to"] != "s37_theory"]
                if fresh and stall < 8:
                    pick = fresh[0]

            if pick is None:
                # stalled: advance up the act chain rather than ping-pong hubs
                for target in ADVANCE:
                    pick = next((c for c in opts if c["to"] == target), None)
                    if pick:
                        break
                if pick is None:
                    pick = next((c for c in opts if c["to"] not in r.visited), opts[0])
            r.used.add(r.ckey(sc, pick))
            r.flags.update(pick.get("sets", {}))
            sid = pick["to"]
            continue

        nxt = sc.get("next")
        if not nxt or nxt == "END":
            return r
        sid = r.route(nxt)

    raise SystemExit(f"playthrough exceeded {limit} steps (loop?) style={style}")


def report(name, r, expect):
    mins = r.seconds / 60
    ok = r.ending == expect
    print(f"\n  {name}")
    print(f"    scenes played ...... {len(r.path)}  ({len(set(r.path))} unique)")
    print(f"    evidence ........... {len(r.ev)} / 21")
    print(f"    audio runtime ...... {mins:.1f} min")
    print(f"    ending ............. {r.ending}  {'OK' if ok else 'EXPECTED ' + expect}")
    missing = [e for e in KEY_EVIDENCE + ["E17"] if e not in r.ev]
    if missing:
        print(f"    key chain missing .. {', '.join(sorted(missing))}")
    return ok, mins


def main():
    cfg, scenes, cues = load()
    if not cues:
        print("  (no cues.json yet — runtimes will read 0)")

    print("=" * 62)
    print("  PLAYTEST")
    print("=" * 62)

    results = []
    r1 = walk(cfg, scenes, cues, "thorough", "okafor", "transmit")
    results.append(report("Thorough examiner -> Ending A", r1, "A"))

    r2 = walk(cfg, scenes, cues, "hasty", "halloran", "ratify")
    results.append(report("Hasty examiner -> Ending B", r2, "B"))

    r3 = walk(cfg, scenes, cues, "hasty", "kade", "suspend")
    results.append(report("Wrong accusation -> Ending C", r3, "C"))

    # accusing the right person without the proof must NOT give ending A
    r4 = walk(cfg, scenes, cues, "hasty", "okafor", "suspend")
    proved = r4.chain_proved()
    print(f"\n  Unsupported Okafor accusation")
    print(f"    chain proved ....... {proved}")
    print(f"    ending ............. {r4.ending}"
          f"  {'OK' if (r4.ending == 'A') == proved else 'MISMATCH'}")
    results.append(((r4.ending == "A") == proved, 0))

    # coverage
    played = set()
    for r in (r1, r2, r3, r4):
        played |= set(r.path)
    never = [s for s in scenes if s not in played]
    print("\n" + "-" * 62)
    print(f"  scenes covered by these four runs: {len(played)}/{len(scenes)}")
    if never:
        print(f"  not exercised: {', '.join(sorted(never))}")

    print("=" * 62)
    bad = [n for (ok, _) in results if not ok]
    if bad:
        print("  FAIL — ending routing incorrect")
        return 1
    if r1.seconds and r1.seconds / 60 < 30:
        print(f"  WARN — thorough run is only {r1.seconds/60:.1f} min of audio")
    print("  endings route correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
