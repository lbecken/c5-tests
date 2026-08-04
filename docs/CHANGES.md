# What changed from *The Cipher at Checkpoint Charlie*

The original brief is a thorough production document. Most of it survives: the
1983/2026 double timeline, the numbers station, the weather-report cipher, the
locked-circle structure, the countdown, the disclosure dilemma, and the
fair-play discipline. What follows is what I changed and why.

---

## 1. The solution

**Was:** Gene Mercer, the smooth American liaison who demands the evidence be
destroyed, is the 1983 betrayer; Julian Cross, the ministerial outsider, is
tonight's manipulator. Ward and Adler look guilty and are innocent.

**Now:** the American (Dorsey) is still guilty of 1983 — but of carelessness,
not treachery, and he has an alibi for tonight. Tonight's forger is **Ulrich
Nagel**, the ex-Stasi technician the original brief marked as trustworthy.
Underneath both, the cipher everyone is racing to decode turns out to be
Halloway's own encrypted confession to killing the man he wrongly suspected.

**Why:** the original culprit is the first person any mystery-literate player
suspects. He is the outsider, the charmer, the one arguing for suppression —
genre convention says "him" on his first line, and the brief then confirms it.
The brief also telegraphs its own misdirection by stating in the character
notes that Ward and Adler are secretly innocent, which leaves nothing to
deduce.

The rewrite keeps the American's guilt (the history should not be a fake-out)
but moves the *accusable* crime to the one person the player has been told to
trust, and makes the deduction turn on physical evidence rather than on who
seems shifty. Dorsey becomes a trap rather than an answer: a player who solves
this the conventional way gets the history right, names him for tonight, and
lets the forger walk.

The confession is the part I would defend hardest. A hunt for a traitor that
ends in "the traitor was a filing error and the hero was a killer" is a better
thirty minutes than a hunt that ends in a named villain, and it turns the
disclosure choice from a policy question into a personal one.

## 2. The cast: ten voices to eight

**Was:** six present-day principals, two archive voices, an announcer, and a
dispatcher — with Vale, Ward, Cross and Beck all one-syllable English
surnames.

**Now:** five speaking principals, two archive voices, the announcer.

**Why:** the brief's own acceptance criteria say the game must be
understandable with the screen turned away. Ten voices in thirty minutes is
more than a listener can hold, and four rhyming monosyllabic surnames is a
casting hazard rather than a cast. Julian Cross's political-pressure function
folded into Dorsey, which also makes Dorsey a better suspect — he now both
wants it buried and has a reason to.

Names were re-chosen for phonetic distance, and voices cast on measured
fundamental frequency so that no two characters who share a scene sit within
about 12 Hz of each other. The ladder is in [DESIGN.md](DESIGN.md) §5.

## 3. Cross's father

**Cut.** The original has the modern manipulator's father be the aide who
passed the 1983 leak. Two generations of the same family sitting at both ends
of a forty-three-year conspiracy is the kind of coincidence the brief's own
non-goals list warns against. The leak now travels through an anonymous
political office, which is both more plausible and more damning: no one had to
be wicked for four people to die.

## 4. The Meteorologist

**Was:** noted in §5.8 as appearing in recordings made after the woman
associated with the station had died, and then never paid off.

**Now:** load-bearing. She is a syllable library cut from a coerced woman's
recordings, which is what makes tonight's forgery possible, what gives Nagel
his tell, and what gives Anneke Vogt a reason to have spent her career in that
archive. The dangling thread became the mechanism.

## 5. Endings: eight to three

**Why:** eight endings across thirty minutes is roughly three minutes of
authored ending each, and several of the brief's eight differ only in
epilogue. Three endings with real weight, plus a variant coda for releasing
the file unredacted, gives each one room. The brief's "Total Disclosure" and
"Empty Channel" survive as a coda and as the closing image of the failure
ending respectively.

## 6. Title

*The Cipher at Checkpoint Charlie* names a landmark the story does not use —
and a British officer crossing under diplomatic cover would have used
Friedrichstrasse, not the Allied checkpoint. **The Forecast Is Memory** is the
brief's own authentication phrase; it states the theme, it is the last thing
said in every ending, and it is the phrase the daughter recognises in the first
sixty seconds.

## 7. Fair play, enforced rather than asserted

The brief has an excellent fair-play checklist (§21) as prose. It is now
executable: `production/build.py` runs a fixed-point reachability analysis over
the whole graph on every build and fails if any scene, flag or ending is
unreachable, if fewer than three independent contradictions can convict the
culprit, or if the accusation can be made to depend on the confession scene.

Two real defects surfaced this way and were fixed: the authentication rhythm
originally had a single route, through a witness the player can decline to
interview, which locked a careless player out of the entire third act; and one
alternate route I added to fix that was itself behind the door it was meant to
bypass.

## 8. The audio clue is real

The brief asks for "enhanced versions where hearing detail matters". Rather
than describe the clue in text over a normal clip, the radiator that convicts
Nagel is generated deterministically and mixed into both his scenes and the
forged insert, the analysis bench performs genuine DSP on the decoded buffer in
the browser, and `production/test_clue.py` reproduces that DSP offline and
fails the build if the tick is not recoverable — with a 1983 archive segment as
a negative control.

That test earned its place. It caught that the clue as first built was
inaudible: the insert rendered too short for a period to be established, the
tick's energy sat below the shortwave passband and was being destroyed by the
band-limiting that makes the broadcast sound like a broadcast, and the bench's
gating suppressed the tick along with the speech it was hiding under.
