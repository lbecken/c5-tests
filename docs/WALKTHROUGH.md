# Walkthrough

Spoilers throughout. For the design reasoning see [DESIGN.md](DESIGN.md).

The three answers the game wants:

| | |
|---|---|
| Who inserted the nine seconds tonight | **Ulrich Nagel** |
| Who compromised GLASSHOUSE in 1983 | **Gene Dorsey**, by briefing a political office |
| What happened to Willi Kroll | **Peter Halloway killed him** at the crossing |

---

## Ending A — The Forecast Is Memory

The complete run. Roughly 33 minutes.

**Opening.** Tune to 4.921 MHz. Hear the broadcast; note *pressure one one four
nine*. Iris recognises "the forecast is memory" from a birthday card.

**Act 1 — take all three witnesses.** Frayne pre-empts you with a statement she
has given four times. Dorsey argues for suppression and calls Iris
"sweetheart". Nagel says the announcer's name — *Ilse* — which nobody in the
building has said tonight. That is your first free clue and it costs nothing.

**Act 2 — take all four interviews, and press every time.**

- **Frayne** → the courier problem, four sources lost in eleven weeks, and
  Halloway's certainty about Kroll. Press with *"You logged him unstable on the
  twelfth"* → she admits back-dating the log, and gives you the protected
  persons schedule (E12).
- **Dorsey** → "nine people know a thing and one of them tells his wife." Iris
  catches *nine*. Press with *"You said so in 2009, under oath"* → Frayne
  explains that being read a list aloud is how the Americans took delivery of
  deniable things.
- **Nagel** → he plays his private tape and speaks the splice a half-second
  before the tape does. **Take the first option, "You said the seam before the
  tape played it."** This sets `nagel_slip`, one of the three contradictions
  that can break him. Then he explains the 3-2-5 authentication rhythm, and
  Iris realises it is her birthday.
- **Iris** → the eight cards, one row of the substitution table per year.

Then pull the checkpoint recording. Halloway is not frightened on that tape; he
is deciding. Kroll's unsent letter follows automatically: *"I am not being
investigated. I am being prepared."*

**Act 3 — run all four decodes.** The readings are meteorologically impossible.
The wind bearings are a route, and four bearings have changed since 1983 — so
somebody is walking it tonight. The pressure values are sealed archive boxes.
And with the rhythm in hand, compare tonight's silences: nine seconds with gaps
of exactly 1.200 s. A man cannot breathe to the millisecond.

Then go to the archive boxes. Box 1149 is a distribution receipt: nine
cryptonyms, released for oral briefing, countersigned by a political office.
Liaison officer: **G. Dorsey**. Iris admits the upload afterwards.

**Act 4 — take every thread.**

- **The bench.** Run *Gate the speech* first, then *Compare that room against
  the 1983 archive*. Under the announcer there is a radiator ticking every 2.1
  seconds and a tram. The 1983 station was a treated studio: no radiator, no
  tram. Sets `room_tone`.
- **The word list.** 940 words across eleven sessions. *Platform* and *courier*
  are not among them and cannot be assembled from what is. Nagel volunteers,
  unprompted, that the session masters were only *signed for* as destroyed.
  Sets `syllable_gap`.
- **The credentials.** Someone copied four hours of session audio six months
  ago using a dead officer's login — audio only, and only the sessions where
  she is alone. Clean voice samples.
- **Vogt.** Ask why she has been redacting her own archive. Ilse Vogt was her
  mother. Nagel, quietly: *"I did not know she had a daughter."*
- **Dorsey.** The ninth of March. He gives it straight, and then Iris asks
  whether he took Kroll out of the investigation, and after a long moment he
  says no.

Open the last layer. Halloway's confession plays: Dorsey's briefing, Kroll's
innocence, the killing, and why he chained the two together.

**Act 5.** Confront Nagel with **two of** the seam, the room, or the word list.
Two landing breaks him. Avoid *"You were Stasi"* and *"You knew the rhythm"* —
both are wrong, both cost a minute, and he is entitled to be insulted by the
first.

Answer the finding: Nagel / Dorsey / Halloway killed him. Then **release the
accusation and the confession, redacting the names.**

Ends with a tape Nagel never sold: Ilse Vogt in 1981, between takes, laughing
about her daughter's concert — and then, flatly, the station voice.

## Ending B — The Necessary Lie

Play exactly as above, then at the disclosure choose **release nothing**.

The finding is sealed for ninety-nine years. Nagel is collected; there will be
no charge, there will be an arrangement. The courier is allowed to board. Iris
gets a copy marked *personal use, not to be reproduced*, and asks whether this
is the moral of the story or just the story repeating.

The carrier stays up afterwards with no modulation on it, as though something
is waiting to see whether you will say anything at all.

## Ending C — You Have Repeated 1983

Any of:

- name someone other than Nagel for the insert,
- never find the insert (skip Nagel's interview *and* the "measure the
  silences" route in Act 3), or
- fail to land two correct contradictions in the confrontation.

The transmission goes out. The courier boards, the pad has already been burned,
the archive is seized. Iris: *"You had four minutes and a room full of
recordings, and you named a person. That is what my father did to Willi Kroll."*

Then the station keeps transmitting, off-schedule, and reads your terminal
identifier back to you in the number groups.

**Coda — unredacted.** Reaching Ending A but choosing *release everything*
adds a final beat: a woman in Schwerin rings the facility at eleven minutes
past to ask why her mother's name is on the internet.

---

## Things a first run usually misses

- Nagel names Ilse in his first scene, before anyone else does.
- The wind bearings in tonight's broadcast differ from 1983 in four places —
  someone updated the walk for a city with a different railway.
- Frayne's log was falsified to *prevent* a review, because a review reads the
  source files and the source files have living names in them.
- Nagel is telling the truth about having helped Halloway. Both things are
  true. *"Nobody is a single sentence."*
- Iris's argument before the disclosure: send all of him or none of him.
  Halloway chained the accusation to the confession so that nobody could do to
  him what he did to Kroll.
