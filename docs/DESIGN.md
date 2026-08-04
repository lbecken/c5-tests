# THE FORECAST IS MEMORY

**A thirty-minute interactive radio drama.** Berlin, 2026. A numbers station
that went silent in 1989 is transmitting again, and everyone who could explain
it is sealed in an archive under Tempelhof with twenty-eight minutes to go.

This document is the mystery bible: what actually happened, what the player can
find out, and why the design is built the way it is. It is a rewrite of an
earlier brief, *The Cipher at Checkpoint Charlie*; the reasoning behind each
departure is in [CHANGES.md](CHANGES.md).

---

## 1. The premise the player is given

You are an Independent Signals Review Examiner, patched in by secure audio
terminal. You were chosen because you were not part of it. Four people are on
the line, two more speak only from the archive, and a courier is walking across
Berlin toward something the broadcast told him to do.

You cannot go anywhere. You can only listen, compare, and decide.

## 2. What actually happened

**1979–82.** GLASSHOUSE, a joint Western network for handling East German
sources. One of those sources is Ilse Vogt, a signals clerk in Adlershof. She
is also, under coercion, the voice of Station 417: over eleven sessions she
reads a fixed vocabulary of 940 words into a microphone for a 22-year-old Stasi
technician named Ulrich Nagel, who is building a library from which sentences
she never said can be assembled. No announcer who can be identified, and none
who can defect.

**March 1983.** Gene Dorsey, the American liaison, needs a West German
political office to believe GLASSHOUSE is worth protecting before a vote. He
reads nine cryptonyms aloud to a man with a safe and a clearance. That man
repeats four of them to an aide who has neither. The aide talks at a dinner in
Bonn. Eleven weeks later four sources are dead. Dorsey did not sell anybody; he
was careless in a building where careless is the same as murder.

**Mid 1983.** Peter Halloway, cipher security for GLASSHOUSE, builds a
correlation and it points at Willi Kroll, the West German officer whose courier
chain handled every compromised source. Halloway is certain. He is wrong, in
the way only a careful man can be wrong.

**14 October 1983.** Halloway crosses into East Berlin. He learns — partly from
Nagel — that the leak came from the West and from above, and that Kroll is
being prepared to carry it. He signals on an open channel that his assessment
was wrong, and asks for it recorded in exactly those words.

**15 October 1983, a crossing on Friedrichstrasse.** Kroll, who has worked out
that he is being burned, is carrying an envelope with six names in it, Ilse
Vogt's among them, and is going to hand it across to buy himself a night's
sleep. Halloway kills him. Not a struggle, not an accident: a decision, then
the carrying out of it.

**After.** A man who killed a Western officer at a Berlin crossing cannot be
tried without the names coming out, so Halloway lets the service call it
defection. Nagel helps him disappear. Dame Rosalind Frayne, his handler,
back-dates a log entry making him unstable so that no review opens and no
review reads the source files. He builds the delayed cipher, posts his daughter
one row of its substitution table a year in a birthday card, and dies in 1991.

**Six months ago.** Someone opens the archive's audio holdings with the
credentials of an officer who died in 2007 and copies four hours of Station 417
session material — audio only, and only the sessions where Ilse is alone in the
room. Clean voice samples.

**Three weeks ago.** Iris Halloway scans a birthday card and uploads it to a
public cryptography forum because she wants a stranger to tell her it is
nothing. That is the release condition. The station wakes.

**Tonight.** Nagel, paid by a client whose name he has never known, inserts
nine seconds into the revived broadcast in Ilse Vogt's voice. He assumes nobody
alive can tell. He is wrong, because two of the words he needed do not exist in
the 1983 library, so he had to build them — and because he recorded them in his
flat, with the radiator on.

## 3. The solution, in the shape the player must produce

| Question | Answer |
|---|---|
| Who put nine seconds into tonight's broadcast? | **Ulrich Nagel** |
| Who compromised GLASSHOUSE in 1983? | **Gene Dorsey**, by briefing a political office |
| What happened to Willi Kroll? | **Halloway killed him** at the crossing |

The three are deliberately not the same person, and the emotional weight sits
on the third. The player is hunting a traitor and finds an accident, a
technician, and a confession.

## 4. The clue chain

The central deduction is audio-native. Five independent seeds point at Nagel;
the player needs two to break him.

1. **The half-second.** In his interview Nagel plays a tape and speaks its
   splice — the odd stress on *VIS-ibility* — a beat before the tape does. He
   has told you the tape exists in no archive because he never filed it. There
   is no copy he could have "heard many times." *(Flag: `nagel_slip`)*
2. **The room.** Under the nine-second insert there is a radiator ticking every
   2.1 seconds and a tram passing. The same tick is under Nagel's line. This is
   physically in the audio files — see §6. *(Flag: `room_tone`)*
3. **The impossible word.** Station 417's entire vocabulary is 940 words from
   eleven recording sessions. *Platform* and *courier* are not among them and
   cannot be assembled from what is. Somebody built them. Nagel is also the
   only person on the call who knows the session masters survived. *(Flag:
   `syllable_gap`)*
4. **The rhythm.** Halloway authenticated with silence, not sound: 3-2-5 beats
   in the gaps, which is his daughter's birthday. The insert has the right
   words and gaps of exactly 1.200 seconds. A man cannot breathe to the
   millisecond. *(Flag: `found_insert`)*
5. **Ilse.** Nagel names her in his first scene, before anyone else in the
   building has said it aloud.

Two contradictions are wrong and cost the player a minute each: *you were
Stasi* (cheap, and he is entitled to be insulted) and *you knew the rhythm*
(he knew it because he spent eleven years failing to break it, and it is in his
service file, page ninety).

**Dorsey's 1983 role** has two independent supports: the distribution receipt
in box 1149 with his countersignature, and his own account of the ninth of
March. Neither depends on the other.

**Kroll's innocence** is established by his unsent letter before any scene lets
the player conclude anything about him, and Halloway's confession is not
required to accuse Nagel — the accusation must stand on the forensics alone.

## 5. Cast

Seven voices plus one archive bit part. Cast for acoustic separation first: the
game is meant to be playable with the screen turned away, so no two characters
who share a scene sit close in pitch, and every adjacent pair on the ladder
also differs in accent, era, or processing.

| Voice | F0 | Who |
|---|---|---|
| Willi Kroll | 96 Hz | West German field officer. One recording: an unsent letter. |
| Ulrich Nagel | 115 Hz | Ex-Stasi radio technician. Sardonic. Built the voice. |
| Gene Dorsey | 132 Hz | Ex-CIA liaison. Warm, paternal, practised at sounding candid. |
| Peter Halloway | 138 Hz | The cryptographer. 1983 and 1991 tape only. |
| Rosalind Frayne | 158 Hz | His handler. Imperious. Minimises. Falsified the log. |
| Iris Halloway | 178 Hz | His daughter. Cryptanalyst. Presses, refuses euphemism. |
| Anneke Vogt | 188 Hz | Archive liaison. Procedural. Ilse's daughter. |
| The Meteorologist | 215 Hz | Not a person. Ilse Vogt's syllables, cut and re-cut. |

Every principal has a secret that is true and a motive that is defensible.
Frayne falsified a record and would do it again before dinner. Iris woke the
station and knows it. Vogt has been quietly redacting her own archive to keep
frightened people's addresses out of it. Dorsey is guilty of 1983 and innocent
of tonight — which is the trap: a player who solves this the conventional way,
by accusing the smooth American of everything, gets the history right and lets
the forger walk.

## 6. The room tone is real

`production/beds.py` generates the radiator tick and tram deterministically and
`production/generate.py` mixes the same bed into two places that must match:
every segment recorded in Nagel's flat, and the nine-second insert.

Both the tick and the tram are built with strong energy inside the speech band
— a 2.1 kHz ring, a broadband transient, a traction-motor whine sweeping
400–900 Hz. Shortwave AM is band-limited to roughly 300–3000 Hz, so a clue
carried only by low frequencies would be destroyed by the very processing that
makes the broadcast sound like a broadcast, and the player would be asked to
hear something that is not in the file.

The analysis bench does real DSP in the browser on the same decoded buffer:
it builds a short-time envelope of the insert and inverts it, pushing the
speech down and lifting the floor between phrases. The ticks are audible
because they are there.

## 7. Structure

Five acts, hub-and-spoke, 40 scenes, ~42 minutes of authored audio of which a
normal path hears roughly 27–30.

```
ACT 1  T-28  the station returns          cold open, briefing, three witnesses
ACT 2  T-23  the disappearance            1983 tape, interviews, the crossing
ACT 3  T-17  the weather cipher           decode approaches, the insert found
ACT 4  T-11  the living network           the bench, the library, the confession
ACT 5  T-4   forecast                     confrontation, finding, disclosure
```

The clock advances at scene boundaries, not in real time, so the player can
replay anything without being punished for listening carefully. Wrong
contradictions cost a minute; that is the only place time is spent as a
resource.

## 8. Endings

| Ending | Reached by |
|---|---|
| **The Forecast Is Memory** | Nagel named and broken, insert found, redacted release. Dorsey's role public, Halloway's confession with it, names sealed. Ends with Ilse Vogt off-script in 1981, alive, laughing about her daughter's concert. |
| **The Necessary Lie** | The truth found and suppressed. Four families stay invisible. So does everything else. The carrier stays open, unmodulated, as though something is waiting to see whether you will say anything at all. |
| **You Have Repeated 1983** | Wrong name, or the insert never found. The command goes out, the archive is seized, and the station starts reading your terminal identifier back to you. |

Releasing everything unredacted reaches the first ending with a coda: a woman
in Schwerin rings to ask why her mother's name is on the internet.

Iris argues, before the disclosure choice, that whatever you send you must send
all of him — that Halloway chained the accusation to the confession precisely
so nobody could do to him what he did to Kroll, and unchaining them to make him
a martyr means you learned nothing.

## 9. Fair play

`production/build.py` enforces these mechanically on every build:

- Fixed-point reachability over the whole graph: no scene, flag, or ending
  is unreachable under any satisfiable requirement chain.
- At least three correct contradictions, each depending on a different flag,
  so no single missed clue locks the player out of the true ending.
- Every gate flag settable by a route the player can actually reach.
- The authentication rhythm — which is what makes the insert detectable —
  has two routes in two different acts, so a player who never warms to Nagel
  can still get it from Iris in Act 3.
- The accusation may not depend on the confession scene.
- Kroll's innocence and Dorsey's two supports exist before any scene lets the
  player conclude anything.

`production/qa.py` transcribes every rendered file with Scribe and compares it
to the canonical script, which catches performance tags spoken aloud, dropped
lines, and truncation across a corpus too large to audition by hand.
