"""Verify that every generated file says what the script says it says.

    python3 production/qa.py            check every asset
    python3 production/qa.py --only ID  check one

Transcribes each rendered asset with Scribe and compares against the canonical
transcript. This catches the failure modes that are invisible when you are
generating hundreds of clips and cannot listen to all of them: a performance
tag spoken aloud ("bracket dry bracket"), a dropped or truncated line, a number
read as digits where the script wants words, a voice that mangles a proper noun.

A word-level ratio below THRESHOLD is reported. Some drift is expected and fine
- Scribe writes "1983" for "nineteen eighty-three" - so the comparison folds
numbers and punctuation before scoring.
"""
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = os.environ.get("ELEVENLABS_API_KEY", "")
THRESHOLD = 0.82

NUMS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
    "eighteen": "18", "nineteen": "19", "twenty": "20", "thirty": "30",
    "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
    "eighty": "80", "ninety": "90", "hundred": "100",
}
TAG = re.compile(r"\[[^\]]*\]")


def norm(s):
    s = TAG.sub(" ", s.lower())
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    words = [NUMS.get(w, w) for w in s.split()]
    # Scribe writes "417" where the script says "four one seven"; collapse
    # runs of single digits so a spoken group matches a written one.
    out, run = [], []
    for w in words:
        if len(w) == 1 and w.isdigit():
            run.append(w)
        else:
            if run:
                out.append("".join(run))
                run = []
            out.append(w)
    if run:
        out.append("".join(run))
    return out


def stt(path):
    boundary = "----ffmqa"
    body = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"model_id\""
        f"\r\n\r\nscribe_v1\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
        f"filename=\"a.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n".encode(),
        open(path, "rb").read(),
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/speech-to-text", data=b"".join(body),
        headers={"xi-api-key": KEY,
                 "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read()).get("text", "")


def check(asset):
    path = f"{ROOT}/game/audio/vo/{asset['id']}.mp3"
    if not os.path.exists(path):
        return (asset["id"], 0.0, "MISSING FILE", "")
    want = " ".join(l["text"] for l in asset["lines"])
    for attempt in range(3):
        try:
            got = stt(path)
            break
        except Exception as e:
            if attempt == 2:
                return (asset["id"], 0.0, f"STT ERROR {e}", "")
            time.sleep(3 * (attempt + 1))
    a, b = norm(want), norm(got)
    ratio = SequenceMatcher(None, a, b).ratio()
    note = ""
    if re.search(r"\b(bracket|beat|long pause|exhales)\b", got.lower()):
        note = "PERFORMANCE TAG SPOKEN ALOUD"
    elif len(b) < len(a) * 0.7:
        note = f"TRUNCATED? heard {len(b)} of {len(a)} words"
    return (asset["id"], ratio, note, got)


def main():
    if not KEY:
        sys.exit("ELEVENLABS_API_KEY not set")
    assets = json.load(open(f"{ROOT}/production/manifest.json"))["assets"]
    if "--only" in sys.argv:
        want = sys.argv[sys.argv.index("--only") + 1]
        assets = [a for a in assets if a["id"] == want]

    print(f"checking {len(assets)} assets\n")
    bad, results = [], []
    with ThreadPoolExecutor(5) as ex:
        for r in ex.map(check, assets):
            results.append(r)
            aid, ratio, note, got = r
            if ratio < THRESHOLD or note:
                bad.append(r)
                print(f"  {ratio:5.2f}  {aid:<34} {note}")

    ok = len(results) - len(bad)
    print(f"\n{ok}/{len(results)} clean at ratio >= {THRESHOLD}")
    if bad:
        print("\nreview these:")
        for aid, ratio, note, got in sorted(bad, key=lambda x: x[1]):
            print(f"\n  {aid}  ({ratio:.2f}) {note}")
            print(f"    heard: {got[:220]}")
    json.dump({r[0]: {"ratio": round(r[1], 3), "note": r[2], "heard": r[3]}
               for r in results},
              open(f"{ROOT}/production/qa_report.json", "w"), indent=1)


if __name__ == "__main__":
    main()
