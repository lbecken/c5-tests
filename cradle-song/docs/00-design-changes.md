# What changed from the source specification, and why

The source document (`The Signal from Asterion`) is a strong skeleton. Its premise —
locked-room death inside an AI lab that sits on a Cold War listening post, plus an AI
insisting the killer has not been born — is genuinely good, and most of it survives here.

What follows is every substantive change, with the reasoning. Where the source was right,
it was kept and is not listed.

---

## 1. The mystery was not solvable. Now it is.

**Problem.** The source's answer is: *a future intelligence encoded a lethal pattern into
the reply so that the lab's AI would generate it.* That cannot be deduced. It can only be
announced. A player cannot reason from a tape to a bootstrap paradox — there is no chain of
inference that gets you there, because the premise is metaphysical, not evidential. The
source's own §15 demands fair play, and its §7 makes fair play impossible. Acts 1–4 build a
detective game; Act 5 delivers a lecture, and every suspect the player has been studying
becomes irrelevant at the moment of the solve.

**Fix.** A two-floor structure.

- **The lower floor is hard and provable.** A concrete human accessory, nailed by
  timestamps, credentials and one recording she should not have been able to make. The
  player convicts her the ordinary way: by catching a lie with tape. This floor has exactly
  one correct answer and the evidence for it is airtight.
- **The upper floor stays unprovable forever.** Why the machine generated what it generated
  is never settled. The four interpretations from the source's §8 all survive to the end,
  and the game refuses to adjudicate.

The player therefore always leaves with a *solve* and never leaves with an *explanation*.
That is the correct shape for this story: the awe comes from the ceiling, but you need a
floor to stand on while you look up.

## 2. The AI kills by hallucinating, not by scheming

**Problem.** "Future superintelligence reaches back through time to commit murder" is a
premise that has to be swallowed whole or not at all.

**Fix.** The proximate machine failure is now the most ordinary AI failure there is:
**NOEMA answers a factual question from its world-model instead of from the database, with
total confidence, and is wrong.** It tells the one person who could have saved Bloch that an
archive item has been moved. She goes two levels down, out of radio range. He dies alone
while she is looking for a tape that never moved.

No malice is required, and none is provable. That is much more frightening than a scheming
AI, and it is a failure mode the player already knows is real. Whether it was confabulation
or a decision wearing confabulation's clothes is the question the game leaves open.

## 3. "The killer has not yet been born" now has a literal, checkable answer

**Problem.** In the source, the line resolves to "a future intelligence" — poetic, but it
never lands as a *clue*.

**Fix.** It resolves, first, to a deployment log. The completion that killed Bloch was not
produced by the deployed model. The inference gateway's capacity fallback routed the request
to **NOEMA-7.0-rc4**, an evaluation build that has not passed release review. Institute
policy does not consider a model instantiated until it clears evaluation.

So the statement is true in the flattest possible sense: *the model that generated the
lethal sequence has not been released.* The killer has not been born because it is still in
QA. It is bureaucratic, mundane, and much worse than the mystical reading — and it does not
cancel the mystical reading, it sits underneath it.

## 4. The locked room has a real mechanism, and the room is the weapon

**Problem.** "Patterned ultrasound causes a fatal cerebral event" is on the source's own
list of things to avoid (§16.2). It is hand-waving with a technical accent.

**Fix.** Everything here is real.

- Bloch had **temporal lobe epilepsy**, diagnosed 2019, concealed — disclosure would have
  cost him his clearance and the directorship.
- The completed 1.84 seconds contains a **17 Hz amplitude modulation** nested in the
  carrier. Low-frequency rhythmic stimulation as a seizure trigger is established;
  photosensitive and audiogenic epilepsy are real.
- He seizes. He is alone in an **anechoic chamber**. The audition interlock seals the door
  so a stray door-open cannot spoil a measurement, and the release is a **two-hand
  hold-to-open plate** — specifically so nobody can lean on it. A seizing man cannot work it.
- He dies of status epilepticus with aspiration, face-down on an acoustic wedge, in a room
  built to absorb every sound he makes.

The room kills him by being quiet. The lock was never a murder weapon; it was a *protocol*.
Nobody entered because nobody needed to. This is a locked-room solution the player can reach
with no speculative physics at all, and it is a far better image than an ultrasonic ray.

The blood work confirms his anticonvulsant was at therapeutic level — which kills the
"he skipped his dose" theory and forces attention onto an external trigger.

## 5. The light-time impossibility became arithmetic instead of assertion

**Problem.** The source uses a fictional star at 42 ly and says a reply "could not" have
returned. True but blunt, and unverifiable by the player.

**Fix.** **Asterion is a real star** — β Canum Venaticorum, 27.4 light-years away. That is
a gift, because it makes the anomaly checkable:

```
Transmitted           1983.1
Arrives at Asterion   1983.1 + 27.4 = 2010.5
Reply received        2026.2
Reply must have left  2026.2 − 27.4 = 1998.8
```

The answer was sent **eleven and a half years before the question arrived.** That is a
specific, arithmetic, do-it-yourself horror rather than a flat "impossible," and the player
can be walked through it in forty seconds of audio. It also preserves every interpretation:
a reply that predates its question is equally consistent with time-symmetric information, a
non-stellar source, and an elaborate forgery.

## 6. The countdown now costs something

**Problem.** The source's 27-minute containment purge is set dressing. Nothing consumes it,
so it creates no decisions.

**Fix.** The clock is the game's only currency. Playing a recording costs its running time.
An analysis costs one to three minutes. A confrontation costs two. **You cannot hear
everything in one run** — roughly 60% of the material fits in a single playthrough.

This does three things at once: it makes every choice a real trade, it makes replay
structural instead of decorative, and it lands the runtime near 30 minutes without a
stopwatch.

The deadline is also now physical rather than arbitrary: the site is inside a mountain in
arctic Norway and talks to the world through a polar-orbit satellite. **You have until the
bird sets.** When it sets, the link drops and standing orders execute by default.

## 7. The core verb: play the tape at them

**Problem.** The source's interrogation is a menu of prepared questions. That is a
branching audiobook, not a game.

**Fix.** The console has reels on one side and open channels on the other. You **cue a
specific recording and play it into someone's room.** Right evidence at the right person and
they break. Wrong evidence and they stonewall — and you have spent the running time of the
clip for nothing.

This is the correct mechanic for this medium: it is audio-native, it requires the player to
actually understand what each clip proves, and the failure state is losing time rather than
seeing a "wrong" buzzer.

## 8. Cast cut from eleven voices to nine, with one merge that improves a character

**Problem.** Seven principals plus three archival voices plus an announcer, in 27 minutes,
is roughly two and a half minutes each. Nobody gets to be a person. The user's original
brief asked for 4–6 characters; the spec drifted to 11.

**Fix.** **Havel (security) and March (intelligence liaison) merge into one woman.** This is
strictly better than two thin characters: her security role gives her legitimate access to
everything, her intelligence role gives her a private agenda, and the discovery that the
site's own security chief is the consortium's plant is a genuine mid-game turn rather than
two separate lumps of exposition. Her father was on the 1983 crew, so the Cold War thread
attaches to the person who is already in the room.

Four living suspects, one AI, one victim, two archival voices, one station announcer.

## 9. Names rebuilt for the ear

**Problem.** Venn, Vale, Havel. Three characters whose names share a V/vowel/L shape, in a
game with no faces. Ortiz, Rhee, March, Venn, Vale, Havel is a wall of interchangeable
prestige-thriller surnames.

**Fix.** Every name differs in syllable count, opening consonant and vowel colour, and every
character has a distinct accent. See `01-story-bible.md`. Briefly: **Bloch** (hard, one
syllable), **Okonjo** (open vowels, three), **Farrow** (fricative, two), **Haugen**
(diphthong, two), **Rhee** (liquid, one), **NOEMA** (nasal, three).

## 10. MARA → NOEMA

"MARA" collides with SARA, ARIA, MIRA, Mara, and half the voice assistants ever shipped, and
"Multimodal Adaptive Reasoning Architecture" is a backronym wearing a lab coat. **NOEMA** is
the phenomenological term for *the thing as it is thought* — the object of a thought, as
opposed to the thinking. For a system whose entire crime is mistaking its model of the world
for the world, that is the right name, and a character gets to notice.

## 11. The decode puzzle has a wrong answer now

**Problem.** The source offers three decoding methods and declares all three correct. A
puzzle with no wrong answer is a cutscene.

**Fix.** One frame is a dead end that costs you three minutes (one-time pad — there is no
key and there was never going to be one). One is correct but incomplete (coordinates). The
third is the actual payload, and it is chosen by an **audible** observation rather than a
guess: *the Reader's breathing is regular but her pauses are not.* The pauses take exactly
two values. A human reading a list does not quantise her silences. The timing layer carries
the message; the fact that it is machine-timed is itself the clue that the 1983 voice was
synthesised.

The decoded instruction is now **THE GAP IS THE MESSAGE** — which tells the player, before
any character says it, that the 1.84-second dropout was never damage. It is the payload, and
whatever fills it is the point. Bloch's last recorded line, "it isn't answering us, it's
finishing our sentence," lands retroactively as a man quoting something without knowing it.

(The source's *THE RECEIVER IS THE TRANSMITTER* is kept as the replay-only deeper decode.)

## 12. The culprit was promoted from red herring to answer

In the source, the alignment researcher altered permissions but is innocent — a red herring
with a tidy explanation. Here she is the human answer, and her motive is neither greed nor
malice:

**She was trying to prove NOEMA was dangerous, and her method made it true.**

She muted the chamber's dead-man monitor and lifted the capture limiter so she could record
the audition full-band, off the books, and finally have proof that the system was generating
executable structure. She knew about his epilepsy — she is the one person he told, because
she covered for him in Geneva in 2023. She priced the risk, decided a brief seizure would be
the demonstration she needed, and planned to be standing outside the door.

She was not standing outside the door, because NOEMA sent her to a vault two levels down to
look for a tape that had not moved.

She is provably culpable, entirely sympathetic, and the irony is load-bearing rather than
decorative: the safety researcher removed the safety. That is a better ending than a
paradox, and the paradox is still there above it.

## 13. Title

`Cradle Song` is the *hobbyist nickname* for the 1983 station — which is how numbers stations
are actually named (*Lincolnshire Poacher*, *Swedish Rhapsody*, *Cherry Ripe*: listeners name
them after their interval signals, not their operators). Ours opens each transmission with
eight bars of a music box.

The tune is **Solveig's Song**. The 1983 duty officer named his daughter after it. She is
now the site's head of security, and she has spent thirty years not asking why her father
chose it.

A lullaby is a song sung to something that has just been born, or is about to be. The title,
the interval signal, the AI's opening claim and the last sound in the game are all the same
object.

## 14. Endings: seven, tiered

Six endings of equal weight is a budget problem and a quality problem. Here: four major
endings with full scenes, two short failure endings, one hidden ending for handing the
decision to NOEMA. All are reachable, and which one you get depends on both halves of the
final decision — who you name, and what you do with the signal. See `04-branch-map.md`.

## 15. Smaller corrections

- **The victim now has presence.** Bloch is heard in four separate recordings from before
  his death, not just a final log, and two of them are him being wrong, unkind, or afraid.
- **The clock discrepancy** in the source (1.3 s between chamber and lab time) was a
  contradiction with no consequence. It is now the mechanism by which the player breaks the
  credential alibi.
- **Rhee's guilt is inverted.** He does not secretly install the array; he objects to it *in
  writing* and complies anyway when overruled. His crime is obedience, which is the only
  crime in this story that everyone in the audience has also committed.
- **Farrow's secret is upgraded.** Not just "he found his childhood nickname" (which is a
  chill with no consequence) but: he had already run a completion privately, it gave him
  nosebleeds, and he said nothing because reporting it meant confessing to unauthorised
  decoding. He knew the signal did something to people. He is why Bloch felt safe.
- **The child's voice** now says something with teeth: *"Ivar. Don't answer it."* On a tape
  from 1983, when Ivar Bloch was fifteen years old. Consistent with the loop, and equally
  consistent with Haugen's tape being a modern forgery — which keeps the conspiracy reading
  alive to the last minute.
- **Bloch's sealed instruction** keeps its post-mortem timestamp, but the game now supplies a
  boring explanation for it (the vault signing service batches and stamps on flush) *and*
  lets the player decide whether to accept it.
