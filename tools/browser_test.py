#!/usr/bin/env python3
"""Drive the game in a real browser: click through a full run, screenshot, report errors."""
import sys, os, time
from playwright.sync_api import sync_playwright

URL = os.environ.get("GAME_URL", "http://localhost:8765/index.html")
SHOTS = os.environ.get("SHOT_DIR", "/tmp/europa_shots")
os.makedirs(SHOTS, exist_ok=True)

errors, warnings = [], []


def run():
    with sync_playwright() as p:
        exe = None
        for cand in ("/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                     "/opt/pw-browsers/chromium/chrome"):
            if os.path.exists(cand):
                exe = cand
                break
        browser = p.chromium.launch(
            executable_path=exe,
            args=["--autoplay-policy=no-user-gesture-required",
                  "--mute-audio", "--no-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: (
            errors.append(f"console.{m.type}: {m.text}") if m.type == "error"
            else warnings.append(m.text) if m.type == "warning" else None))
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("requestfailed", lambda r: errors.append(
            f"404/failed: {r.url.split('/')[-1]}"))

        page.goto(URL, wait_until="networkidle")
        page.screenshot(path=f"{SHOTS}/00_title.png")
        assert page.is_visible("#titlecard"), "title card missing"

        page.click("#btn-begin")
        page.wait_for_selector("#game:not(.hidden)", timeout=5000)
        time.sleep(2.5)
        page.screenshot(path=f"{SHOTS}/01_opening.png")

        sub = page.inner_text("#sub-text").strip()
        if not sub:
            warnings.append("no subtitle rendered shortly after start")

        steps, picked = 0, []
        while steps < 90:
            steps += 1
            # deduction board?
            if page.is_visible("#board"):
                page.screenshot(path=f"{SHOTS}/20_board.png")
                for q in page.query_selector_all(".q"):
                    opts = q.query_selector_all(".opt")
                    # pick the canonical answer where we can identify it
                    target = opts[0]
                    for o in opts:
                        t = o.inner_text().lower()
                        if ("bus three" in t or "okafor" in t or "martyr" in t
                                or "mostly simulations" in t):
                            target = o
                            break
                    target.click()
                page.screenshot(path=f"{SHOTS}/21_board_filled.png")
                page.click("#btn-submit-board")
                time.sleep(1.5)
                continue

            if page.is_visible("#policy"):
                page.screenshot(path=f"{SHOTS}/30_policy.png")
                page.query_selector_all(".pol")[2].click()
                time.sleep(1.5)
                continue

            if page.is_visible("#epilogue"):
                time.sleep(1)
                page.screenshot(path=f"{SHOTS}/40_epilogue.png", full_page=True)
                break

            choices = page.query_selector_all(".choice")
            if choices:
                # explore first, then deliberately advance toward the hearing
                pick = choices[0]
                if steps > 55:
                    for want in ("Convene the hearing", "Put it to Dr. Okafor",
                                 "Begin the confrontations",
                                 "Open the forensic console"):
                        m = [c for c in choices if want in c.inner_text()]
                        if m:
                            pick = m[0]
                            break
                label = pick.inner_text().split("\n")[0]
                picked.append(label)
                pick.click()
                time.sleep(0.8)
            else:
                page.click("#btn-skip")
                time.sleep(0.5)

        # case file
        page.click("#btn-case")
        time.sleep(0.6)
        page.screenshot(path=f"{SHOTS}/50_casefile.png", full_page=True)
        ev = len(page.query_selector_all(".ev"))
        page.click("#btn-case-close")

        # mobile
        page.set_viewport_size({"width": 390, "height": 844})
        time.sleep(0.5)
        page.screenshot(path=f"{SHOTS}/60_mobile.png")

        print(f"  steps ............. {steps}")
        print(f"  choices taken ..... {len(picked)}")
        print(f"  evidence in file .. {ev}")
        print(f"  reached epilogue .. {page.is_visible('#epilogue')}")
        browser.close()


run()
print()
uniq = sorted(set(errors))
for e in uniq:
    print(f"  ERROR {e}")
for w in sorted(set(warnings))[:5]:
    print(f"  warn  {w}")
print(f"\n  screenshots -> {SHOTS}")
sys.exit(1 if uniq else 0)
