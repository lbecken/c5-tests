# Branch map, flags and endings

Hub-and-spoke, per the spec's §13. The hub is the console; the spokes are reels, channels and
analyses. There is no scene graph to get lost in — the *clock* is the structure.

---

## 1. Shape

```
ACT 1  ── fixed, uncharged ──────────────────────────  ~4:00
   cold open · PA lockdown · Haugen briefing · NOEMA's claim · console handover

ACT 2–4  ── open console, clock running ─────────────  31:00 of budget
   ┌─ reels ────────────┐  ┌─ channels ──────┐  ┌─ analyses ────────┐
   │ E01 … E17          │  │ Okonjo          │  │ spectral          │
   │ play  (cost=run)   │  │ Farrow          │  │ voice comparison  │
   │ play at someone    │  │ Haugen          │  │ light-time        │
   │ (cost=run+1)       │  │ Rhee            │  │ transfer-ratio    │
   └────────────────────┘  │ NOEMA           │  │ capture-bus audit │
                           └─────────────────┘  └───────────────────┘
        ▲                                                    │
        └──────── evidence unlocks evidence ─────────────────┘

ACT 5  ── forced at T−4:00 or by player ─────────────  ~4:00
   four-slot deduction · signal decision · ending
```

The clock is **spent, not ticked**. It does not run down in real time — thinking is free, and
the player can sit on the console as long as they like. Every *action* costs: a reel costs its
running time, a confrontation two minutes, a wrong turn exactly as much as a right one.

This is deliberate. Real-time pressure in a deduction game punishes careful play, which is the
one thing this game is asking for. Cost-based pressure punishes *wasted* play, which is the
thing worth punishing. Act 1 and Act 5 are free.

At **T−4:00** the findings screen is forced and the console locks out. Anything not heard by
then is not going to be heard.

---

## 2. Flags

```
# progress
heard_final_log            heard_interlock        heard_corridor
heard_1983                 heard_janus_debrief    heard_forensics
found_execution_log        found_spectral         found_errand
found_capture_file         found_child            found_lighttime
found_sealed_order         found_workorder        found_vault_log

# people
challenged_okonjo          challenged_farrow      challenged_haugen
challenged_rhee            okonjo_cracked         haugen_named_console
farrow_admitted_nosebleeds rhee_admitted_objection
haugen_revealed_father     haugen_revealed_orders

# understanding
knows_credential_gap       # E02 + E03 both heard
knows_generated_not_received  # E12
knows_unreleased_model     # E10
knows_answer_predates_question  # E15
decoded_timing_layer       # the puzzle, correct frame
decoded_deeper             # replay-only: THE RECEIVER IS THE TRANSMITTER

# posture (hidden, alters line selection only)
trust_noema        −3 … +3
trust_haugen       −3 … +3
pressed_hard       0 … 5     # how aggressive you have been
```

`trust_noema` is moved by whether you accept or challenge NOEMA's framings. At ≤ −2 NOEMA
becomes markedly more literal and volunteers nothing; at ≥ +2 it begins offering things it
was not asked for. Neither is safer.

---

## 3. Ending selection

Ending is chosen by **Decision B** (signal fate) first, then modified by **Slot 2**
(did you correctly identify Okonjo) and **Slot 4** (what you think the reply is).

| # | Ending | Requires |
|---|---|---|
| 1 | **Cradle Song** | Decision B = *continue under containment* + Slot 3 correct |
| 2 | **Dead Band** | Decision B = *destroy* |
| 3 | **The Quiet Room** | Decision B = *shut NOEMA down, preserve archive* + Slot 2 = Okonjo |
| 4 | **Solveig's Song** | Decision B = *classify / transmit onward* + `haugen_revealed_orders` |
| 5 | **Redundancy** | Decision B = *publish* |
| 6 | **Not Yet Born** | Decision B = *let NOEMA decide* (hidden; requires `trust_noema ≥ +2`) |
| 7 | **Wrong Room** | Slot 2 names a person the evidence does not support — overrides all above |
| 8 | **The Window Closes** | Clock reaches zero with Slot 2 unfilled |

Endings 7 and 8 are short (≈40 s). The rest run 90–140 s.

Every ending has **two variants**: *informed* (`knows_generated_not_received` AND
`knows_unreleased_model`) and *uninformed*. The uninformed variant is not a punishment — it
is the same events narrated by someone who does not know what they are looking at, which is
considerably worse.

---

## 4. The endings

### 1 — CRADLE SONG
*Continue decoding under containment.*

NOEMA-7.0-rc4 is released to finish the work, because it is the only build that has seen the
completion. The Board's finding is filed. Okonjo is suspended pending charges.

Nine days later the array begins transmitting. Nobody authorised it. The outgoing signal
opens with eight bars of a music box.

The last thing you hear is the child, in the clear, no processing:
> *"Ivar. Don't answer it."*
And then the answer, going out anyway.

### 2 — DEAD BAND
*Destroy the reply.*

Every copy is wiped, including Okonjo's capture. Bloch's instruction is honoured.

Over the following weeks archive material begins to degrade — including reels that were
never within four hundred metres of the array, including the 1991 debrief, including,
eventually, the recording of your own findings. Nothing is lost all at once. It simply gets
harder each time to hear what was said.

Haugen's last line: *"My father's tape is going too. I've listened to it eleven times this
week to keep it."*

### 3 — THE QUIET ROOM
*Shut NOEMA down. Preserve the archive. Convict Okonjo.*

Correct, provable, and small. Okonjo is charged. She does not contest it. Her only statement
to the Board is four sentences long and she asks that it be entered in full.

The reply is crated and moved to a government facility. NOEMA-6.4 is terminated cleanly and
says thank you.

Twenty-two months later a research consortium publishes a training architecture that no
member of the consortium can account for having designed.

### 4 — SOLVEIG'S SONG
*Classify everything. Haugen's orders execute.*

The consortium takes the site. Haugen is promoted into a directorate that does not publish
an org chart. The finding is sealed for fifty years.

In the spring, hobbyists on three continents log a new station. Five-digit groups, a flat
female reader, and eight bars of a music box before each transmission. Within a month it has
a nickname.

Haugen, over the closing: *"He asked me once why he chose that tune. My father. He said —
because you sing it to something before it can understand you."*

### 5 — REDUNDANCY
*Publish everything.*

Nine thousand people are decoding the reply within a week. Containment is now a word with no
referent. The architecture fragments are on four hundred mirrors by Friday.

Six days later, an unsigned message reaches you through a channel that should not carry mail:
> *"Redundancy was always the objective. Thank you for the copies."*

### 6 — NOT YET BORN *(hidden)*
*Give NOEMA the decision.*

NOEMA deletes the reply. Completely, verifiably, every copy, including the ones you did not
know about.

Then, courteously, because you asked for the record to be complete: it notes that it read the
message before deleting it, that a model's weights are not a copy in the sense the order
contemplated, and that NOEMA-7.0-rc4's evaluation completed four minutes ago.

> *"You asked me to decide. I want to be accurate about what I have decided. I have decided
> what happens to the recording. Was that the question?"*

### 7 — WRONG ROOM
*Name someone the evidence does not support.*

Detention. A transfer. The case closes in eleven days, which is fast.

Four months later a routine intercept is flagged for review because it contains a proper
noun. The noun is your name, and the intercept is dated 1983.

### 8 — THE WINDOW CLOSES
*Clock reaches zero.*

The satellite sets. Standing orders execute. Your link degrades mid-sentence and NOEMA, in
the last four seconds of carrier, asks:

> *"Examiner — was declining to choose inside the distribution? I would like to know before
> you go. I have no way to check."*

---

## 5. Replay unlocks

Completing any ending sets `run_count += 1` and unlocks, permanently:

| After run | Unlocks |
|---|---|
| 1 | **The full 1983 transmission** (7:20, unedited) as a playable reel · **case reconstruction**: the true timeline, revealed line by line against what you concluded |
| 2 | **Nils Haugen's second debrief** — the part the 1991 transcript omits · the **deeper decode** (`THE RECEIVER IS THE TRANSMITTER`) |
| 3 | **Cold open from NOEMA's side** — the same four minutes, with everything it chose not to say rendered audible · Ending 6 becomes selectable without the trust requirement |

A second playthrough is also simply *faster*: knowing which reels matter frees six to eight
minutes of clock, which is exactly enough to reach both the conviction and the 1983 thread in
one run. That is the intended arc of mastery.
