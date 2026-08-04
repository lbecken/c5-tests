# What changed from the original brief, and why

The source brief (`murder_at_the_europa_summit_game_plan.pdf`) is a strong, unusually
disciplined document — the fair-play rules in §7 and the scientific guardrails in §18 are
better than most published mystery-game design docs. Most of it is kept. The changes below
are the ones judged to materially improve the game.

---

## 1. The solution — the big one

**Brief:** Ambassador Voss arranged the murder. Kade, Ilyin and Venn each unwittingly
supplied a necessary condition. Voss is the answer.

**Problem:** Voss is the most obvious suspect from minute one. She has the strongest
motive (Rook will expose her government's illegal weapons programme), the most power, and
the most access. A mystery-literate player suspects her in Act I and is proved right in
Act V. The brief's own acceptance criterion — *"at least two plausible wrong theories
remain possible until Act IV"* — is hard to satisfy when the right theory is also the
first one.

**Change: two killers, one victim, ninety seconds apart.**

Halloran (renamed from Voss) really did build a weapon, really did deploy it, and it
really did fire — and it **failed**, because Rook carries a cardiac assist implant that
rejects entrainment in the passivation band. Eighty-six seconds later a second, far more
precise waveform killed him. It was built from the Europan organism's own click structure
and delivered over a shared amplifier bus from the Acoustic Lab, so it left no packet
trace and no watermark. The killer is **Dr. Nia Okafor**.

What this buys:

- **The obvious suspect stays guilty.** Every clue the brief specifies still points at
  Halloran, and every one of them is *true*. The player is not misled by red herrings;
  they are misled by an accurate, complete, insufficient case.
- **A false confession the player can accept.** Halloran confesses to murder. Accepting
  it is reasonable, satisfying, and wrong. Christie's best trick, and the brief had no
  equivalent.
- **A concrete, listenable central clue.** Rook's final recording contains a stumble —
  he falters, slurs, recovers, keeps talking, and dies a minute and a half later. It is
  audible on first play and means nothing until Act IV. That is a far better hook than a
  timestamp comparison.
- **The cosmic layer becomes load-bearing without becoming the answer.** The murder
  weapon *is* the alien signal, which makes the first-contact material structural rather
  than decorative — while the deduction still runs entirely on physical evidence.

## 2. Motive inversion

**Brief:** the killer wants to *silence* Rook and prevent disclosure.

**Change:** the real killer wants Rook *martyred*. Okafor needs the disclosure to happen
— loudly, posthumously, uncontrollably. A dead treaty architect in an impossible room
collapses the summit and puts Europa under interdict for a generation, which is the only
outcome that leaves the ocean alone.

This inverts the deduction logic. The player spends the whole game asking "who benefits
from Rook's silence?" — and the answer is nobody who matters, because the real question
was always "who benefits from Rook's death being *unsolvable*?"

## 3. Cast cut from eight delegates to four

Requested: 4–6 characters. The brief has eight delegates plus an AI plus the victim. Cut
by redistribution, not deletion:

| Removed | Function | Now carried by |
|---|---|---|
| **Dr. Pavel Ilyin** (engineer) | bypassed the pressure interlock | **CALYPSO**, which granted the bypass under emergency authority — making the player's own ally complicit and giving the "did the AI do it?" red herring a real foundation |
| **Minister Arjun Sato** (Mars) | commercial motive against the Accord | **Venn**, who absorbs the trade grievance |
| **Sister Elian Thorne** (ethics observer) | recognises spliced speech; speaks the exact future line | **CALYPSO** (splice analysis) and **Okafor** (the exact fragment is now her confession) |

Moving the exact future fragment onto the killer's confession is a large upgrade: in the
brief it was a spooky orphan detail spoken by a bystander, and it is now simultaneously
the eeriest moment in the game and a genuine investigative lead.

## 4. Endings cut from eight to three

Requested: three. The brief's eight endings differ mostly in final wording, which its own
acceptance criteria warn against. Replaced with three that differ in *who goes to prison*:

- **A — The Signal in the Blood.** Okafor named, chain proven.
- **B — A Clean Verdict.** Halloran named. The case closes; the killer thanks you.
- **C — Deep Silence.** Wrong person, or no accusation. Both killers walk.

Each takes a **RATIFY / SUSPEND / TRANSMIT** policy coda that rewrites its last forty
seconds, which preserves the brief's policy-choice texture without diluting the endings.

## 5. Names

Renamed to stop the names from leaking the answer. "Voss" and "Kade" both read as villain
names; the brief assigned one to the culprit and one to a red herring, which telegraphs.

- **Voss → Ambassador Beatriz Halloran.** Warm, credible, trustworthy-sounding. Sounds
  like someone you would believe.
- **Kade** kept, first name changed to Ezra. He *should* sound guilty; he isn't.
- **Okafor, Venn, Rook, CALYPSO** kept — all strong, distinctive in audio, and Okafor's
  warmth is now doing deliberate work.

## 6. Mechanism specifics added

The brief specifies "a malicious control waveform" without saying how it reaches the
chamber or why the room's seal is irrelevant. Three engineering facts were invented to
close the logic, each planted casually before it matters:

- **Bus 3** — a shared low-frequency amplifier bus feeding both the chamber's passivation
  drivers and the Acoustic Lab's projector array. This is what lets the second waveform
  arrive as *sound* rather than as data, and it is the reason the network forensics that
  convict Halloran cannot see it.
- **The cardiac assist implant** — why attempt one failed.
- **Trial 14** — Okafor's deleted human-exposure log, which is both her sympathetic
  secret (she suppressed it so it could not be weaponised) and the murder weapon's
  provenance.

## 7. Difficulty

Per direction, the game does not steer. CALYPSO labels fact, inference and uncertainty,
flags anomalies it can prove, and will not name a killer. Missing the second discharge is
entirely possible and produces Ending B — a coherent, well-earned, wrong result. The true
ending is meant to be missed on a first run.

---

## Kept from the brief, essentially unchanged

- Europa / Nereid Conference Habitat setting and the nine-kilometre ice shell
- The locked pressure chamber and the Passivation Array concept
- CALYPSO's legal-privilege constraints and its inability to lie about system facts
- The forecast-rehearsal anomaly, and the rule that exactly one fragment stays unexplained
- The fair-play discipline: the human crime is fully solvable without accepting prophecy
- Kade's calibration order, Venn's timing module, Halloran's surveillance authorisation
- The hub-and-spoke branch model and the evidence/flag state design
- The audio direction in §16, particularly the regulator pulse as both ambience and clue
