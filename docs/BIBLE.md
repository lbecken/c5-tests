# THE OBSERVATORY MURDER — Narrative Bible

> *"The clocks disagreed. The shadow did not."*

An audio-first interactive mystery. The player is a remote incident coordinator
reconstructing a murder from radio traffic, telemetry, voicemail, an intercepted
documentary archive, and the downlink of an orbiting solar observatory.

Target: 32–38 minutes on a first playthrough. ~40 scenes, 3 endings.

---

## 1. Changes from the original plan (and why)

The source plan (`the_observatory_murder_game_plan.pdf`) is the foundation. These
are the deliberate departures.

| # | Change | Reason |
|---|---|---|
| 1 | **Cast cut from 8 suspects to 5 living characters + the victim.** | Eight suspects cannot each earn a motive, a secret and an innocent explanation in 30 minutes. Five can. |
| 2 | **The culprit is Dr. Mara Voss, not Helena Ward.** Ward is deleted; her fraud motive and her institutional authority are given to Voss. | In the plan the killer is the character with the least screen time, at the most distant station — a structural tell. Voss is now the player's *constant ally*: the voice that briefs you, hands you evidence, and steers you. The reveal recontextualises every helpful thing she did. |
| 3 | **The murder weapon is the victim's own medical hardware,** a decommissioned-but-not-removed physiology infusion rig in his observation chair. | The plan's "leftover injector from an old experiment" is close, but making it *Coll's own* — a rig he volunteered for, that everyone jokes about — plants it in plain sight and gives Rook a real, sympathetic reason to lie about it. |
| 4 | **Added the looped cardiac telemetry.** The chair replays four minutes of buffered heart data after Coll dies. | The plan needed the initial death estimate to be wrong but never explained *why*. Now there is a mechanism, and it produces the single best clue in the game: a documented **arrhythmia** — irregular by definition — whose trace repeats *identically*. Audible, rigorous, unfakeable. |
| 5 | **Added SOLARIS-2,** an orbiting solar observatory with an RF cross-link to the summit repeater. | Every clock, log and channel on the mountain is compromised. The story needed one witness the killer could not reach. It arrives from orbit, in the last act, and it is decisive. |
| 6 | **Three tiers of room tone** replace the plan's looser "ambience mismatch" clue. | Genuine-live / rehearsal / synthetic are now *acoustically* distinguishable in a way the player can actually hear and the engine can actually render. See §6. |
| 7 | **The frost alarm.** A station-wide alarm sounds during the "live" 11:48 transmission and Coll talks straight through it. | The plan's clues were largely analytical. This one is pure listening — no tools, no jargon. It is the moment most players will first *know*. |
| 8 | **Endings cut from seven to three,** each a distinct moral outcome rather than a score tier. | Seven endings at 30 minutes means seven thin endings. See §8. |
| 9 | **Sofia Bell and Julian Cross merged.** Cross inherits the outdoor microphone and the environmental timestamp. | Bell's only structural job was the independent environmental clock. Giving it to the documentarian is more natural (of course he had a mic outside) and makes the least-trustworthy character the source of the most trustworthy evidence. |
| 10 | **The fabricated discovery turns out to be real.** | The plan gestured at this. Making it explicit is what turns the ending choice from "good/bad" into an actual dilemma: exposing the fraud permanently taints a genuine discovery. |
| 11 | **Dropped the SPECTRA acrostic.** | A first-letter puzzle pointing at the killer's station is not fair-play deduction; it is a crossword. Its slot is taken by the packet-field puzzle, which is diegetic. |

---

## 2. Setting

**Helios Peak Observatory** — Cordillera del Sol, 4,180 m. An international
consortium facility: one central solar telescope and a ring of five outstations
strung along the ridge, several kilometres apart over terrain that is lethal on
foot in bad weather.

Today the eclipse path crosses the ridge. Every instrument on the mountain is
pointed at the same four minutes and thirty-six seconds of totality. Years of
preparation collapse into that window, which is why nobody leaves their post,
and why nobody is watching anybody else.

**Why they are isolated:** the access road is closed by an ice storm; the cable
lift is locked out for wind; and no one abandons a station during an eclipse
sequence.

**The locked room:** the **Meridian Chamber**, a circular acoustically-treated
control room beneath the primary solar telescope. During a high-energy
observation cycle its door seals and can only be released from inside, or by a
two-person mechanical override from two separate locations. The security log
shows no override. Coll went in alone and locked it behind him.

**Stations and their sound:**

| Station | Occupant | Acoustic signature |
|---|---|---|
| Meridian Chamber | Coll (victim) | Muted ventilation, rounded room resonance, **tracking servo whine when the telescope is moving** |
| Spectra | Voss | Cooling plant, high-frequency instrument whine |
| Chronos | Trent | Clock chirps, fan noise, clean digital radio |
| Aurora array | Okafor | Broadband radio hiss, intermittent interference |
| Mechanical bay | Rook | Relays, metal vibration, distant motors |
| Visitor annex | Cross | Laptop fan, treated room, microphone handling |

**The player** is *Ops Control* — the consortium's remote incident coordinator,
2,000 km away in a windowless room. Never voiced; addressed on air as
"Control". The player's authority is real but thin: they can request logs,
isolate channels, order analyses, and question one person at a time over a
saturated radio network — and they can decide what the world is told afterwards.

---

## 3. Cast

### Professor Adrian Coll — the victim
61. Director of Helios Peak. Heard only in recordings, which is the point: this
is a story about whether a recording is a person. Publicly revered, privately a
gatekeeper who controlled data, funding and credit. Had a documented cardiac
arrhythmia he refused to let slow him down.

*Voice:* British, mature, warm authority; clipped and slightly breathless under
pressure.

**What he was doing:** re-observing the "Helios detection" — the narrow-band
1420.3 MHz feature Voss published eleven years ago. He had reconstructed her
original 14 March data and knew it had been padded. He intended to say so after
the eclipse. He also suspected he was in danger, which is why he left Okafor a
voicemail.

### Dr. Mara Voss — deputy director, Spectra station — **the culprit**
48. Coll's deputy and presumed successor. The player's counterpart on the
mountain: she is the one who briefs Control, chases logs, and *volunteers*
evidence. Polished, warm, unhurried. Genuinely good at her job.

*Voice:* British, velvety, confident. No hesitation until the technical evidence
lands.

**Motive:** eleven years ago she padded a marginal spectral signal into a
publishable detection. That paper built her career and won the consortium
€400M. Coll had the original frames. Exposure would end her — and, she believes,
the observatory.

**The bitter part:** Coll's new data suggests the phenomenon *is real*. She did
not invent it. She arrived early and lied about the arriving. Exposing her
fraud will now taint a genuine discovery for a generation. She knows this. It is
how she justifies everything.

**Her tell (fair-play):** every piece of evidence she volunteers points at
somebody else, she is the only person on the mountain who never asks the player
a question, and she requested the emergency relay be engaged that morning — the
delayed channel she needed.

### Dr. Elias Trent — precision timing, Chronos lab
33. Maintains the atomic standards and the synchronisation beacons. Anxious,
over-precise, apologises before he is accused.

*Voice:* British, young, hesitant; self-corrects mid-sentence.

**Secret:** the Aurora rubidium standard has been drifting for eight months. He
patched it with a **+4.8-second correction** applied in software and told no
one, because reporting it meant recalling two years of Okafor's timing data.

**Why he is a red herring:** he is the one person on the mountain who could
falsify a timestamp, and he has been falsifying a timestamp. It explains 4.8
seconds of a 7-minute discrepancy. It is not nothing, and it is not murder.

### Gabriel Rook — systems engineer, mechanical bay
55. Shutters, tracking motors, environmental plant. Plainspoken, dry, gets
angry when frightened. Opened the chamber and found the body.

*Voice:* Irish, middle-aged, practical.

**Secret:** two years ago he signed the decommissioning certificate for the
chair's physiology rig **without removing the hardware**, because extraction
required a three-day dome shutdown he could not justify. He drained the
reservoir, pulled the fuse, and filed the paperwork. He has known for two years
that there is a dormant infusion line in the director's chair.

**Why he is a red herring:** he built it, he lied about it, and he was the first
person to touch the body.

### Dr. Leila Okafor — radio astronomer, Aurora array
44. Studies solar radio bursts. Direct, sceptical, allergic to a weak argument.
The one character who does honest analysis for the player rather than for
herself.

*Voice:* American, mature, professional, crisp.

**Secret:** at 10:58 Coll left her a voicemail — *"If I go quiet today, don't
trust the clocks. Trust the shadow. And pull the Spectra bus log for the
fourteenth of March."* She sat on it for an hour, because she read "don't trust
the clocks" as an accusation against Trent, and she was not going to end a
junior colleague's career on a dead man's riddle.

**Her strength:** she can hear that one transmission has the wrong room under it.

### Julian Cross — documentary journalist, visitor annex
39. Making a film about the eclipse project. Charming, fluent, transparent in a
way that makes people suspicious of him.

*Voice:* American, smooth, classy, conversational.

**Secrets, two:** he has been recording **every** channel without authorisation,
including the communications rehearsal the night before. And he built a
narration-assist voice model of Coll from forty hours of archived lectures — a
grubby but common documentary practice — which he demonstrated, once, to Voss.

**Why he is a red herring:** he is the only person on the mountain with the
technical means to put words in a dead man's mouth.

### Supporting voices
- **MERIDIAN** — station automation. Neutral, sparse, machine-flat. Reads logs,
  announces eclipse contacts, counts down the archive overwrite.
- **SOLARIS-2** — payload specialist aboard the orbiting solar observatory.
  Australian, brisk, cheerful in the way of someone 500 km above the problem.

---

## 4. The murder

**Weapon.** A microdose infusion rig in the lumbar support of Coll's observation
chair, installed two years ago for an IRB-approved autonomic-stress study in
which Coll — inevitably — enrolled himself as the first subject. Decommissioned
on paper by Rook, never physically removed. It sits on the instrument-control
bus, because that is how the study logged its data.

Voss refilled the reservoir from Spectra's chemistry bench and re-fused the
line during a legitimate chamber visit at 09:12.

**Trigger.** At **11:29:55** Voss transmits a routine-looking calibration packet
on the instrument-control bus, addressed to node `MC-CHR-07`, carrying a
deferred-execution field of `T+720`. Spectra runs the calibration service, so
Spectra-signed packets on that bus are unremarkable. Twelve minutes later the
rig fires a full reservoir.

**Locked room.** Nobody enters after Coll. The weapon was already inside; the
trigger was remote and delayed; the door was genuinely locked from within. The
chamber is not a puzzle. The *timeline* is the puzzle.

**The alibi.** Coll dies at ~11:42:20, four minutes before totality. For the
next eight minutes Voss keeps him alive on the radio:

- Four short phrases lifted from the previous night's rehearsal, injected into
  the **emergency voice relay** (a separate fibre loop that does not pass
  through the summit repeater, and which buffers ~11 s under load — Voss
  requested it be engaged that morning).
- The chair's cardiac telemetry, set to replay its four-minute buffer, so the
  medical console shows a living heart.
- One line that is **not** from the rehearsal: at 11:47:50 Okafor asks Coll an
  unanticipated question. No stored fragment fits. Voss reaches Cross's
  workstation with borrowed credentials and generates
  *"I have it. Beautiful."* — the synthetic line, at 11:48:02.

Different stations, different clocks, different eclipse phases, all under the
pressure of a once-in-a-generation observation: five people who each remember
speaking to a living man, at five incompatible times.

---

## 5. The chain of deduction

Every mandatory conclusion has at least two independent supports.

| Conclusion | Support A | Support B |
|---|---|---|
| The "live" exchanges were not live | Coll does not react to the frost alarm (E09) | Those five transmissions are absent from the SOLARIS-2 sky log (E14) |
| Four responses were prerecorded | Verbatim phrase match against the rehearsal tape (E11) | Rehearsal room tone: chamber, but no tracking servo (E08) |
| One response was synthetic | Annex room tone under a chamber transmission (E08) | Cross's workstation log: model invoked 11:47:36 from a Spectra terminal (E16) |
| Death was ~11:42, not ~11:50 | The arrhythmia telemetry repeats identically (E12) | Coll's last genuine transmission ends with the rig's double-click and a chair-servo weight shift (E02) |
| The weapon was the chair | Decommission certificate with no extraction record (E10) | Reservoir found empty, fuse refitted out of sequence (E13) |
| The trigger came from Spectra | Deferred-execution field in the calibration packet (E15) | Spectra bus-signing authority; 14 March log named in Coll's voicemail (E06) |
| The culprit is Voss | Only Spectra can sign that bus (E15) | The 11:47:36 model access came from a Spectra terminal while Cross was on camera in the annex (E16) |
| Motive | Coll's memo reconstructing the 14 March frames (E17) | The consortium funding call (E18) |

**Innocent explanations, all resolved before the accusation:**
Trent's 4.8 s is a concealed hardware fault. Rook's lie is a shutdown he could
not justify. Cross's archive is careerist, not murderous — and his voice model
was used *by someone else*. Okafor's withheld voicemail was an act of mercy
toward Trent.

---

## 6. The three tiers of Coll

This is the spine of the audio design and the fairest clue in the game.

| Tier | When recorded | Room tone | Contains |
|---|---|---|---|
| **Genuine live** | During the eclipse, telescope tracking | Chamber ventilation **+ tracking servo whine** | Real reactions, real timing |
| **Rehearsal fragment** | 21:40 the night before, from the same chamber, dome parked | Chamber ventilation, **no servo** | Perfect phrases, no reactions |
| **Synthetic** | 11:47:36, generated in the annex | **Annex**: laptop fan, treated room | Too clean, duplicated breath, no reaction to the alarm |

The player learns to hear these in scene 15, where labelled reference beds are
played back. Thereafter, the archive's **ISOLATE BACKGROUND** control turns every
clip into a test. A player who never touches the control can still hear it: the
bed is mixed audibly under the voice at all times.

---

## 7. Recurring motifs

- The eclipse countdown tones — the only honest clock in the story.
- The tracking servo: present, present, present, *absent*.
- A soft relay click before every diagnostic command on the bus.
- Wind falling away before totality; birds stopping; wind returning.
- A low sub-bass pulse whenever a contradiction resolves.
- MERIDIAN's overwrite countdown, tightening under the last act.

---

## 8. The three endings

Not a good/medium/bad ladder — three different things the player can be.

**A — THE SHADOW.** Correct accusation, strong evidence (≥7 of 9 key items),
and the player releases everything. Voss confesses on channel; her justification
is the best speech in the game and it is not wrong, exactly. The consortium is
dismantled. Three years later an independent array confirms Coll's signal.
Truth, and the cost of truth.

**B — THE CONSORTIUM.** Correct accusation, but either the case is thin (< 7
key items) or the player chooses to suppress. Voss is quietly removed or quietly
survives; the scientific record stays corrupted; the funding is protected. The
epilogue's final press statement uses a voice that the player, by now, can
identify. Truth, and the burial of truth — with the player's signature on it.

**C — DEAD AIR.** Wrong accusation, or refusal to accuse. The named party's own
secret is exposed and is enough to convict them of something smaller. The timing
archive completes its overwrite. Voss takes the directorship. Years later a
package arrives at Ops Control containing the rehearsal tape and a note.

---

## 9. Fair-play audit

- [x] The chair rig is mentioned in scene 3, long before it matters.
- [x] The relay delay is documented in scene 13 as a technical annoyance.
- [x] The rehearsal is referenced in scene 1's cold open ("same as last night").
- [x] The player hears a rehearsal phrase before hearing it reused.
- [x] Voss's bus-signing authority is stated in scene 13, by Voss, as a boast.
- [x] The frost alarm is audible in the very first playback of the 11:48 clip.
- [x] Every red herring resolves before the accusation is possible.
- [x] No mandatory evidence can be permanently missed; optional evidence only
      changes the *strength* of the case, never its reachability.
- [x] The solution recontextualises six earlier sounds: the double-click, the
      chair servo, the absent tracking whine, the frost alarm, the identical
      clock chirp, and the heartbeat.

---

## 10. Theme

Astronomy is the discipline of trusting instruments over eyes. This is a story
in which every instrument on a mountain is corrupted by one person, and the only
honest witnesses left are the shadow of the moon and a machine in orbit.

Voss is not a monster. She believes she is holding up a building that would
otherwise fall on four hundred people. Coll was not a hero; he was a difficult
man who happened to be right. The question the game asks is not *who* — the
player will get there — but *what the truth is worth once you have it*.

> The shadow crossed the mountain exactly when physics said it would, and every
> single person remembered the moment differently.
