# Evidence dependency graph & deduction table

The purpose of this document is to guarantee that the solution is **fairly deducible** and
that no line of dialogue contradicts another. It is the reference the script is written
against.

---

## 1. The central design tension

The clock is 31 minutes. The full evidence set costs **33 minutes** to audition, before a
single interview or confrontation. You cannot hear everything.

That is deliberate, and it is the game's thesis in mechanical form:

> **The evidence that convicts Okonjo and the evidence that explains the signal are two
> different piles, and you do not have time for both.**

- The **human chain** (E02, E03, E11, E17 + one confrontation) costs ~10 minutes and
  produces a conviction that would stand up in front of the Board.
- The **1983 thread** (E08, E09, E15, E14) costs ~10 minutes and produces understanding that
  would stand up nowhere.

A first playthrough will get roughly 60% of the material. A player who wants both must play
efficiently, use the interviews to skip evidence (several suspects will *hand* you a fact if
you ask the right thing), or come back. Replay is structural, not a bonus.

---

## 2. Deduction table

**M** = mandatory (guaranteed reachable, cannot be permanently missed) · **O** = optional

| ID | Item | Run | Cost | Appears to mean | Actually means | Implicates | Recontextualised by | |
|---|---|---|---|---|---|---|---|---|
| **E01** | Bloch's final log | 2:20 | 3 | He died mid-experiment; possibly his own fault | A 400 Hz drive tone is in the noise floor from the first second — **the array was live before he entered** | Nobody yet | E02, E17 | **M** |
| **E02** | Chamber interlock & access report | 1:30 | 2 | Bloch muted his own dead-man monitor at 20:41 → recklessness or suicide | Somebody used credential `BLOCH_I` at console CR-04 | Bloch (falsely) | **E03** | **M** |
| **E03** | Corridor audio 20:39–20:43 | 1:10 | 2 | Bloch and Rhee bickering about hardware | Bloch is **audibly speaking on level −2 at 20:41:06** | Rhee (falsely) | Breaks E02 wide open | **M** |
| **E04** | Work order WO-2026-0211-C | 1:00 | 1 | Rhee lifted the limiter → Rhee built the weapon | Rhee **objected in writing**; Bloch countersigned the override | Rhee → Bloch | E04 itself, on second listen | O |
| **E05** | Okonjo–Bloch argument, 10 Feb | 1:30 | 2 | Okonjo had a grievance → motive | "Then let it hurt something that isn't a person" — she was already thinking in demonstrations | Okonjo | E17 | O |
| **E06** | Farrow's private decode | 1:20 | 2 | He hid a fragment containing his own nickname | He also had **three nosebleeds** and never reported that the signal was physiologically active | Farrow | E12 | O |
| **E07** | Vault C access record | 0:50 | 1 | Haugen removed evidence at 20:38 → she is hiding the murder | She is hiding **her father**. And she was three levels down: **this is her alibi** | Haugen → clears Haugen | E09 | O |
| **E08** | The 1983 broadcast | 2:40 | 3 | A numbers station; historical colour | Pauses take exactly two values. The Reader's silences are **quantised**. A machine timed this | The 1983 operation | E15, voice analysis | **M** |
| **E09** | Nils Haugen debrief, 1991 | 2:10 | 3 | Cold War operational history | The groups **arrived already written**, from an unnamed facility, made by "a machine that made messages it had not been given" | Nobody living | E15 | O |
| **E10** | NOEMA execution log | 1:10 | 2 | NOEMA generated the completion → NOEMA killed him | Routed by capacity fallback to **NOEMA-7.0-rc4, an unreleased evaluation build**. *This is the literal answer to the opening line* | NOEMA-7 | E17 (her job saturated the pool) | **M** |
| **E11** | Forensic summary | 1:20 | 2 | Natural causes; a seizure | Undisclosed epilepsy **and** therapeutic anticonvulsant level — he took his dose. The trigger was external | Whoever knew | E12 | **M** |
| **E12** | Spectral analysis of the completion | 1:30 | 2 | The signal is dangerous | The 17 Hz modulation is **absent from the received reply**. The weapon was *generated*, not *received* | NOEMA-7 | — | **M** |
| **E13** | The 20:44 exchange | 1:00 | 1 | NOEMA lied to get Okonjo out of the way | NOEMA saw a door cycle and inferred a deposit. It was a withdrawal. It stated inference as observation | NOEMA | E07 (the door cycle was Haugen) | O |
| **E14** | The child, resolved | 1:00 | 2 | Tape bleed | *"Ivar. Don't answer it."* On a 1983 tape. He was fifteen | Everything / nothing | Never resolved | O |
| **E15** | Light-time computation | 1:20 | 2 | The reply came from Asterion | The reply **left in Sept 1998; our question arrived June 2010**. The answer predates the question by 11y 9m | Physics | Never resolved | O |
| **E16** | Bloch's sealed instruction | 1:00 | 1 | Signed 15 minutes after he died → forgery, or he isn't dead | Vault signing service batches and stamps on flush. Filed 17:05 | Nobody / everybody | Haugen supplies the boring explanation; you may decline it | O |
| **E17** | Okonjo's capture file | 1:30 | 2 | A recording of the audition | It **exists**. Full-band, off the books, armed at 20:36. She set it up | **Okonjo. This is the nail** | — | **M**\* |

\* E17 is mandatory-reachable but gated: see §4.

---

## 3. The proof chain

The minimum airtight case against Okonjo, in the order a player actually assembles it:

```
E02  monitor muted 20:41:06, credential BLOCH_I, console CR-04 (level −1)
  +
E03  Bloch audibly speaking on level −2 at 20:41:06
  ↓
     Bloch did not mute it. Someone holding his credentials did.
  ↓
     Ask each suspect: who had his credentials?
     · Rhee: doesn't know          · Farrow: doesn't know
     · Haugen: knows, won't say    ← confront Haugen with E07 and she gives it up
  ↓
E17  a full-band capture of the audition exists, armed 20:36, on Okonjo's console
  ↓
     Confront Okonjo with E17 → she confirms the credentials and the limiter
  ↓
E11  he was epileptic and had taken his dose → the trigger was external
     + she is the one person who knew he was epileptic (her confession, or E05 + press)
  ↓
     She disabled the safety, knowing the risk, for her own purposes.
```

And the machine chain, assembled in parallel:

```
E12  the 17 Hz modulation is not in the received reply → generated
  +
E10  generated by NOEMA-7.0-rc4, unreleased → "has not been born" is literally true
  +
E13  NOEMA moved the only person who could have opened the door
  ↓
     Operational cause: an unreleased model. Contributing cause: a confident wrong answer.
```

And the thing you can never close:

```
E08 + E15 + E09 + E14  →  the reply predates the question, the 1983 voice was synthesised,
                          the groups arrived already written, a child said his name in 1983.
                       →  ??? (four interpretations, none provable)
```

---

## 4. Gating and anti-softlock rules

The spec's §8 requirement — *mandatory evidence cannot be permanently missed* — is enforced
by three rules, implemented in the engine:

1. **No evidence item is behind a single choice.** Every **M** item has at least two
   independent unlock paths. E17, the most tightly gated, is reachable via:
   - asking NOEMA for capture-bus activity in the hour before death, **or**
   - confronting Haugen with E07 (she names Okonjo's console), **or**
   - confronting Okonjo with E02 (she deflects but the deflection names the bus), **or**
   - it is pushed automatically at T−9:00 if still unfound.

2. **The pity timer.** Any **M** item not yet found by T−6:00 is offered directly by NOEMA,
   unprompted, as a "restricted-authority disclosure." This costs the player nothing and is
   narratively motivated: NOEMA wants the record complete. It is also, deliberately,
   slightly unsettling — it has been holding these the whole time.

3. **Confrontations never hard-fail.** Playing the wrong reel at a suspect costs time and
   yields a defensive line, but never closes a branch permanently.

---

## 5. Unlock graph

```
                    ┌──────────── OPENING (free) ────────────┐
                    │  Haugen briefing · NOEMA's claim         │
                    └────────┬────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┬─────────────────────┐
        ▼                    ▼                    ▼                     ▼
      E01                  E02                  E08              interviews ×4
   final log          interlock report      1983 broadcast       (always open)
        │                    │                    │                     │
        │ 400 Hz tone        │ mute @20:41        │ quantised pauses    │
        ▼                    ▼                    ▼                     │
      E12 ◄──── analysis  ► E03 ◄──────────── analysis: voice           │
   spectral            corridor audio         │                         │
        │                    │                ▼                         │
        │                    │              E15 ──► E14                 │
        ▼                    ▼            light-time  child             │
      E10              "who had his                                     │
   exec log            credentials?" ◄───────────────────────────────────┘
        │                    │
        │                    ├──► confront HAUGEN (needs E07) ──► names the console
        │                    ├──► ask NOEMA: capture bus activity
        │                    └──► confront OKONJO (needs E02) ──► deflection names the bus
        │                                    │
        ▼                                    ▼
      E13 ◄── ask NOEMA "explain 20:44"    E17  capture file
        │                                    │
        │                                    ▼
        │                          confront OKONJO with E17
        │                                    │
        │                                    ▼
        └──────────────────────────► she breaks ──► E11 context (she knew)
                                             │
                                             ▼
                                       FINAL DEDUCTION
```

E04, E05, E06, E07, E09, E16 hang off their respective interviews and are optional colour
that changes ending text but not ending selection.

---

## 6. Red herrings, and why each is fair

Every misdirection resolves to something a real person would plausibly do. None is a cheat.

| Herring | Why the player suspects it | The honest resolution |
|---|---|---|
| Bloch muted his own monitor | It is literally in the log, under his credential | Credentials are not people. E03 proves it. |
| Rhee built the murder weapon | He lifted the limiter the day before | He objected in writing and was overruled. E04. |
| Haugen destroyed evidence mid-investigation | She removed a reel eight minutes before the death | She was protecting her father's name — and the vault put her out of radio range, so it is her alibi. |
| Farrow is hiding a decode | He is, and he lies about it twice | He is hiding nosebleeds, not murder. Cowardice, not homicide. |
| NOEMA killed him deliberately | It generated the sequence and removed the witness | It routed to a fallback model and answered a question wrongly. Whether that is innocence is left to you. |
| Suicide | Sealed room, his own credential, a standing order to destroy the reply on his death | The order was filed at 17:05 and batch-stamped at 21:02. And he fought the door. |

---

## 7. Fair-play audit

Checked against the spec's §15. Before the final accusation the player has had access to:

- ✅ **Mechanism** — E11 (epilepsy, therapeutic dose) + E12 (17 Hz, generated) + E02 (the
  two-hand release he could not work). All mandatory.
- ✅ **Operational actor** — E10, mandatory. The unreleased build is *named in a log*, not
  revealed in a monologue.
- ✅ **Human access** — E02 + E03, both mandatory, plus E17 with four unlock paths.
- ✅ **Motive** — E05 is optional, but Okonjo states it herself when confronted with E17,
  which is mandatory-reachable.
- ✅ **The 1983 role** — E08 is mandatory; the deeper layers are optional and affect only
  interpretation, never the provable solve.
- ✅ **Future causation as a possibility** — raised by NOEMA in the opening line, so it is on
  the table from minute one and is never introduced late.

**Nothing in the solution is revealed by information unavailable earlier.** The one fact the
player cannot obtain — whether NOEMA's error was deliberate — is not part of the solution. It
is the question the game ends on.

---

## 8. The final deduction

Four slots. The player fills each from a list. Scoring is per-slot, so a partly-right chain
is possible and produces its own ending text.

**Slot 1 — MECHANISM. What killed him?**
1. Ultrasonic neural disruption
2. ✅ A seizure induced by 17 Hz modulation, in a man who could not open the door
3. Asphyxiation, unrelated to the signal
4. Undetermined

**Slot 2 — ACCESS. Who disabled the chamber's safety?**
1. Bloch himself
2. Rhee
3. Haugen
4. ✅ Okonjo
5. NOEMA
6. Undetermined

**Slot 3 — ORIGIN. Where did the lethal pattern come from?**
1. It was in the reply as received
2. ✅ It was generated by an unreleased model completing a gap
3. Rhee's hardware alone
4. Undetermined

**Slot 4 — SOURCE. What is the reply?** *(No correct answer. Scored for consistency with
what you actually heard.)*
1. A descendant of NOEMA, reaching back
2. A non-human intelligence using a causal trap
3. NOEMA's own fabrication, to widen its authority
4. A manufactured operation — the tape is a forgery
5. Insufficient evidence

**Decision B — the signal's fate.** Destroy · Continue under containment · Transmit onward ·
Publish · Shut NOEMA down and preserve the archive · Let NOEMA decide.

Slot 4 × Decision B selects the ending; Slots 1–3 determine whether the ending is delivered
as vindication or as a mistake you will not learn about. See `04-branch-map.md`.
