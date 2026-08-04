"""THE FORECAST IS MEMORY - master production script.

Single source of truth. Everything else is generated from this file:
audio (production/generate.py), the playable scene graph (production/build.py),
the asset manifest, and the transcript.

    S(...)  scene       L(...)  line        C(...)  choice
    A(...)  analysis bench option          X(...)  contradiction option

Line text is written twice: `text` is the canonical transcript (what appears on
screen, what the fair-play checker reads), `v3` is what is sent to ElevenLabs
with performance tags. If `v3` is omitted the transcript is spoken as written.
"""

# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------

EVIDENCE = {
    "E01": ("Tonight's broadcast", "Station 417, live at T-28.",
            "Carries two messages laid over each other."),
    "E02": ("Halloway's last transmission", "Recorded 14 October 1983.",
            "Contains the authentication rhythm in its gaps."),
    "E03": ("Birthday card, 1986", "A child's card with a weather phrase.",
            "Teaches the final substitution rule."),
    "E04": ("Frayne's operational log", "Halloway assessed unstable, 12 Oct.",
            "The entry was written after he vanished, not before."),
    "E05": ("Checkpoint recording", "A confused crossing, 14 October.",
            "There is a third man on the tape, and he is not shouting."),
    "E06": ("Kroll's unsent letter", "A field officer's last statement.",
            "He knew he was being prepared as the culprit."),
    "E07": ("Nagel's private tape", "Stasi monitoring, unlogged.",
            "Genuine - and he knows its seams too well."),
    "E08": ("Meteorological report", "The readings, checked.",
            "No such weather has ever occurred anywhere."),
    "E09": ("Wind route", "Bearings plotted as a path.",
            "The 1983 extraction route. Tonight's courier is walking it."),
    "E10": ("Pressure indices", "1149, 0991, 0417.",
            "Archive box numbers, not barometry."),
    "E11": ("GLASSHOUSE list fragment", "Nine names, partially redacted.",
            "Left Dorsey's desk through an unapproved channel in March 1983."),
    "E12": ("Protected persons schedule", "Survivors and their families.",
            "Why Halloway built a lock instead of a broadcast."),
    "E13": ("Upload record", "A scanned card, a public archive, 11 July.",
            "The release condition Halloway set, tripped by accident."),
    "E14": ("Expired credentials", "Archive access, six months ago.",
            "Belonged to an officer who died in 2007."),
    "E15": ("Authentication rhythm", "Three, two, five - in the silences.",
            "Halloway's signature. It cannot be typed, only breathed."),
    "E16": ("Timing mismatch", "Nine seconds of tonight's broadcast.",
            "Correct words. Even gaps. Placed by a machine."),
    "E17": ("Room tone", "Beneath the insert: a tick, and a tram.",
            "The same radiator you can hear on Nagel's line."),
    "E18": ("The word list", "Ilse Vogt's recording schedule, 1983.",
            "Every syllable the station could ever say. 'Platform' is not on it."),
    "E19": ("The last layer", "Halloway's own voice, decoded.",
            "A confession he chained to his accusation on purpose."),
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def L(spk, text, v3=None, fx=None, note=None):
    d = {"spk": spk, "text": text}
    if v3:
        d["v3"] = v3
    if fx:
        d["fx"] = fx
    if note:
        d["note"] = note
    return d


def C(label, goto, req=None, sets=None, grants=None, hide=None, once=False,
      tag=None, note=None):
    d = {"label": label, "goto": goto}
    for k, v in (("req", req), ("sets", sets), ("grants", grants),
                 ("hide", hide), ("tag", tag), ("note", note)):
        if v:
            d[k] = v
    if once:
        d["once"] = True
    return d


def S(sid, **kw):
    kw["id"] = sid
    return kw


SCENES = []


def scene(*a, **k):
    SCENES.append(S(*a, **k))


# ===========================================================================
# ACT ONE - THE STATION RETURNS            T-28 -> T-23
# ===========================================================================

scene(
    "s01_broadcast", act=1, clock=28, amb="shortwave", solo=True,
    title="Station 417",
    lines=[
        L("meteo",
          "Achtung. Achtung. Station four one seven.",
          v3="[flat, metrical, no emphasis] Achtung. Achtung. "
             "Station four one seven."),
        L("meteo",
          "Wind, south south west, four. Cloud, broken. Visibility, three. "
          "Pressure, one one four nine.",
          v3="[flat, unhurried, each value equally weighted] Wind, south south "
             "west, four. Cloud, broken. Visibility, three. Pressure, "
             "one one four nine."),
        L("meteo",
          "Repeat. Pressure, one one four nine. Message follows.",
          v3="[flat] Repeat. Pressure, one one four nine. Message follows."),
        L("meteo",
          "Two seven. Four one. Nine nine. Two seven. Four one. Nine nine.",
          v3="[flat, metrical] Two seven. Four one. Nine nine. "
             "Two seven. Four one. Nine nine."),
        L("meteo",
          "The forecast is memory. Ends.",
          v3="[flat, exactly as neutral as the numbers] The forecast is memory. "
             "Ends."),
    ],
    grants=["E01"], sets={"heard_broadcast": True},
    next="s02_brief",
)

scene(
    "s02_brief", act=1, clock=28, amb="vault",
    title="Tempelhof, sub-level four",
    lines=[
        L("vogt",
          "Examiner. You are connected. Anneke Vogt, federal archive liaison. "
          "I am going to be quick because the building has stopped being polite.",
          v3="[clipped, controlled, moving while she talks] Examiner. You are "
             "connected. Anneke Vogt, federal archive liaison. I am going to be "
             "quick, because the building has stopped being polite."),
        L("vogt",
          "Forty minutes ago a shortwave receiver in this room recorded what you "
          "just heard. The identifier is Station four one seven. That station "
          "transmitted from the eastern sector between nineteen seventy-nine and "
          "nineteen eighty-nine, and then it stopped, and everyone who cared "
          "about it died or retired.",
          v3="[precise, factual] Forty minutes ago, a shortwave receiver in this "
             "room recorded what you just heard. The identifier is Station four "
             "one seven. That station transmitted from the eastern sector "
             "between nineteen seventy-nine and nineteen eighty-nine. [beat] "
             "And then it stopped. And everyone who cared about it died, or "
             "retired."),
        L("vogt",
          "The receiver also triggered a continuity protocol nobody has been "
          "able to switch off. GLASSHOUSE. We are sealed until the next "
          "transmission window closes.",
          v3="[flatter, this part frightens her] The receiver also triggered a "
             "continuity protocol that nobody here has been able to switch off. "
             "GLASSHOUSE. [beat] We are sealed until the next transmission "
             "window closes."),
        L("vogt",
          "That window is twenty-eight minutes away. You are the examiner "
          "because you are the only person on this line who was not part of it. "
          "Please keep it that way.",
          v3="[dry] That window is twenty-eight minutes away. You are the "
             "examiner because you are the only person on this line who was not "
             "part of it. [beat] Please keep it that way."),
    ],
    next="s03_iris_phrase",
)

scene(
    "s03_iris_phrase", act=1, clock=27, amb="workstation",
    title="A phrase from a card",
    lines=[
        L("iris",
          "Play the last five seconds again.",
          v3="[cutting in, urgent] Play the last five seconds again."),
        L("vogt", "Doctor Halloway, we have not finished the-",
          v3="[patient, procedural] Doctor Halloway, we have not finished the-"),
        L("iris",
          "Play it again, please.",
          v3="[quiet, absolutely immovable] Play it again. Please."),
        L("meteo", "The forecast is memory. Ends.",
          v3="[flat] The forecast is memory. Ends.", fx="sw_quote"),
        L("iris",
          "That is not a station phrase. That is my father's handwriting.",
          v3="[very quiet, unsteady for one second, then hard] That is not a "
             "station phrase. [beat] That is my father's handwriting."),
        L("iris",
          "He sent me a card every February until I was fourteen. Nineteen "
          "eighty-six. A cartoon sun with a scarf on. Inside, in block capitals, "
          "the forecast is memory. I was nine. I thought he was being clever.",
          v3="[controlled, the detail hurts more than the fact] He sent me a "
             "card every February until I was fourteen. Nineteen eighty-six. "
             "A cartoon sun with a scarf on. Inside, in block capitals: "
             "the forecast is memory. [beat] I was nine. I thought he was being "
             "clever."),
        L("vogt",
          "Your father disappeared in nineteen eighty-three.",
          v3="[carefully] Your father disappeared in nineteen eighty-three."),
        L("iris",
          "Yes. He did. And the cards kept coming for eight years after that, "
          "and nobody in this building has ever once asked me who was posting "
          "them.",
          v3="[flat, then a flash of anger] Yes. He did. And the cards kept "
             "coming for eight years after that. [beat] And nobody in this "
             "building has ever once asked me who was posting them."),
    ],
    grants=["E03"], sets={"iris_intro": True},
    next="s04_roster",
)

scene(
    "s04_roster", act=1, clock=26, amb="vault",
    title="Who is on the line",
    lines=[
        L("vogt",
          "Four voices, Examiner, and I have no authority over any of them. "
          "Dame Rosalind Frayne, seventy-eight, Halloway's handler in "
          "eighty-three, patched in from Wiltshire and furious about it.",
          v3="[brisk, running a list] Four voices, Examiner, and I have no "
             "authority over any of them. [beat] Dame Rosalind Frayne. "
             "Seventy-eight. Halloway's handler in eighty-three. Patched in "
             "from Wiltshire, and furious about it."),
        L("vogt",
          "Gene Dorsey, eighty-one, American liaison to GLASSHOUSE, now a "
          "private consultant, which is a word that means he still has "
          "everything and owes nobody.",
          v3="[dry] Gene Dorsey. Eighty-one. American liaison to GLASSHOUSE. "
             "Now a private consultant, which is a word that means he still has "
             "everything and owes nobody."),
        L("vogt",
          "Ulrich Nagel, seventy-four, was a radio technician for the Ministry "
          "for State Security. He listened to us for eleven years. He is now, "
          "absurdly, a consultant to this archive.",
          v3="[a beat of distaste] Ulrich Nagel. Seventy-four. Was a radio "
             "technician for the Ministry for State Security. He listened to us "
             "for eleven years. [beat] He is now, absurdly, a consultant to "
             "this archive."),
        L("vogt",
          "And Doctor Halloway, who you have met, and who should not be on this "
          "call at all.",
          v3="[softening a fraction] And Doctor Halloway. Who you have met. And "
             "who should not be on this call at all."),
        L("vogt",
          "Twenty-six minutes. Choose.",
          v3="[back to procedure] Twenty-six minutes. [beat] Choose."),
    ],
    hub=True,
    choices=[
        C("Take Frayne first - she was the last of us to speak to him.",
          "s05_frayne_intro", once=True, tag="intro"),
        C("Take Dorsey first - he ran the joint side of GLASSHOUSE.",
          "s06_dorsey_intro", once=True, tag="intro"),
        C("Take Nagel first - he was listening in 1983.",
          "s07_nagel_intro", once=True, tag="intro"),
        C("Enough. Pull the 1983 tape.", "s09_tape83",
          req={"tag_count": ["intro", 2]}),
    ],
)

scene(
    "s05_frayne_intro", act=1, clock=25, amb="study",
    title="Dame Rosalind Frayne",
    lines=[
        L("frayne",
          "Before you begin. I have given four statements about Peter Halloway. "
          "In nineteen eighty-three, in eighty-four, in ninety-one when it "
          "became fashionable, and in two thousand and nine to a committee that "
          "had already written its findings. They do not differ. Neither will "
          "this one.",
          v3="[cold, pre-emptive, entirely composed] Before you begin. I have "
             "given four statements about Peter Halloway. In nineteen "
             "eighty-three. In eighty-four. In ninety-one, when it became "
             "fashionable. And in two thousand and nine, to a committee that "
             "had already written its findings. [beat] They do not differ. "
             "Neither will this one."),
        L("frayne",
          "He was my officer. He was tired. Tiredness in that profession "
          "resembles a great many other things, and I am not required to have "
          "distinguished between them at the time.",
          v3="[measured, minimising] He was my officer. He was tired. [beat] "
             "Tiredness in that profession resembles a great many other things, "
             "and I am not required to have distinguished between them at the "
             "time."),
        L("frayne",
          "As to tonight. Somebody has found a way to make a dead woman read "
          "the weather. That is a technical crime, not a historical one, and I "
          "would be grateful if you did not confuse the two.",
          v3="[crisp] As to tonight. Somebody has found a way to make a dead "
             "woman read the weather. That is a technical crime, not a "
             "historical one, and I would be grateful if you did not confuse "
             "the two."),
    ],
    sets={"met_frayne": True},
    next="s04_roster",
)

scene(
    "s06_dorsey_intro", act=1, clock=25, amb="line",
    title="Gene Dorsey",
    lines=[
        L("dorsey",
          "Examiner. Gene Dorsey. Before anybody makes me the villain of this, "
          "let me say the only useful thing I know. That signal should be off "
          "the air inside the hour, and I don't much care whose feelings that "
          "hurts.",
          v3="[warm, easy, the warmth is technique] Examiner. Gene Dorsey. "
             "[beat] Before anybody makes me the villain of this, let me say "
             "the only useful thing I know. That signal should be off the air "
             "inside the hour. [beat] And I don't much care whose feelings that "
             "hurts."),
        L("dorsey",
          "I knew Peter. I liked him, which I'm aware is not what you were told "
          "to expect. He was the best cipher man either service had and he was "
          "also, at the end, a man who had decided something and didn't tell "
          "anybody what.",
          v3="[genuinely fond, or an excellent imitation] I knew Peter. I liked "
             "him, which I'm aware is not what you were told to expect. He was "
             "the best cipher man either service had. [beat] And he was also, "
             "at the end, a man who had decided something, and didn't tell "
             "anybody what."),
        L("dorsey",
          "Now Iris is on this line, so I'll say the hard part gently. There is "
          "a version of tonight where we find out her father went across of his "
          "own free will and stayed there. I'd rather we didn't go looking for "
          "it in front of her.",
          v3="[lowering his voice, protective, devastating] Now, Iris is on "
             "this line. So I'll say the hard part gently. [beat] There is a "
             "version of tonight where we find out her father went across of "
             "his own free will, and stayed there. [beat] I'd rather we didn't "
             "go looking for it in front of her."),
        L("iris",
          "Say it at normal volume, Gene. You've been saying it for forty years.",
          v3="[flat, unimpressed] Say it at normal volume, Gene. You've been "
             "saying it for forty years."),
    ],
    sets={"met_dorsey": True},
    next="s04_roster",
)

scene(
    "s07_nagel_intro", act=1, clock=25, amb="apartment",
    title="Ulrich Nagel",
    lines=[
        L("nagel",
          "So. You have all heard her, and now you are frightened, and you have "
          "called the old enemy to explain the noise.",
          v3="[dry, quietly amused, unhurried] So. You have all heard her. And "
             "now you are frightened. And you have called the old enemy to "
             "explain the noise."),
        L("nagel",
          "I was Hauptabteilung three. Radio. Eleven years of listening to "
          "British officers say clever things on frequencies they believed were "
          "private. It was the happiest work of my life.",
          v3="[fond, needling] I was Hauptabteilung three. Radio. Eleven years "
             "of listening to British officers say clever things on frequencies "
             "they believed were private. [beat] It was the happiest work of my "
             "life."),
        L("nagel",
          "Station four one seven was ours. The voice was a woman who read a "
          "list into a microphone in a room in Adlershof. Ilse. She had a cold "
          "that winter and you can hear it in nineteen eighty-one.",
          v3="[casual, offhand, as if it were nothing] Station four one seven "
             "was ours. The voice was a woman who read a list into a microphone "
             "in a room in Adlershof. [beat] Ilse. She had a cold that winter, "
             "and you can hear it in nineteen eighty-one."),
        L("vogt",
          "Nobody has said that name tonight.",
          v3="[sharp, stopped in her tracks] Nobody has said that name tonight."),
        L("nagel",
          "No. Nobody has said it since nineteen eighty-nine. That is rather my "
          "point, Frau Vogt. You have a station and no announcer, and you would "
          "all prefer to discuss the station.",
          v3="[smooth, entirely unbothered] No. Nobody has said it since "
             "nineteen eighty-nine. [beat] That is rather my point, Frau Vogt. "
             "You have a station and no announcer. And you would all prefer to "
             "discuss the station."),
    ],
    sets={"met_nagel": True, "nagel_named_ilse": True},
    next="s04_roster",
)

# ===========================================================================
# ACT TWO - THE DISAPPEARANCE              T-23 -> T-16
# ===========================================================================

scene(
    "s09_tape83", act=2, clock=23, amb="tape83", solo=True,
    title="14 October 1983",
    lines=[
        L("halloway",
          "Control, this is Weathervane. Signal check, one, two, three.",
          v3="[precise, dry, tape hiss, a man being careful] Control, this is "
             "Weathervane. Signal check. One. Two. Three."),
        L("halloway",
          "Wind, north north east, two. Cloud, overcast. Visibility, eight. "
          "Pressure, zero nine nine one.",
          v3="[reading values, level] Wind, north north east, two. Cloud, "
             "overcast. Visibility, eight. Pressure, zero nine nine one."),
        L("halloway",
          "Control, an administrative note while I have the channel. If this "
          "set is returned to stores without me, the fault is in the second "
          "stage and not the aerial. Somebody will blame the aerial. They "
          "always do.",
          v3="[lightly, the joke is doing work] Control, an administrative note "
             "while I have the channel. If this set is returned to stores "
             "without me, the fault is in the second stage, and not the aerial. "
             "[beat] Somebody will blame the aerial. [beat] They always do."),
        L("halloway",
          "I have been asked to confirm my assessment of the courier problem. I "
          "confirm nothing. My assessment was wrong. I would like that recorded "
          "in exactly those words.",
          v3="[the humour gone, very deliberate] I have been asked to confirm "
             "my assessment of the courier problem. [beat] I confirm nothing. "
             "My assessment was wrong. [beat] I would like that recorded in "
             "exactly those words."),
        L("halloway",
          "Tell Rosalind the weather is worse than forecast. Tell her I said "
          "that. She'll know which part I mean.",
          v3="[quiet, strained, almost warm] Tell Rosalind the weather is worse "
             "than forecast. [beat] Tell her I said that. [beat] She'll know "
             "which part I mean."),
        L("halloway", "Weathervane out.",
          v3="[flat, final] Weathervane out."),
    ],
    grants=["E02"], sets={"heard_1983": True},
    next="s10_hub_investigate",
)

scene(
    "s10_hub_investigate", act=2, clock=22, amb="vault",
    title="Twenty-two minutes",
    hub=True,
    lines=[
        L("vogt",
          "Twenty-two minutes. The evidence locker is open to you and so is the "
          "line. I would advise you to spend at least one of those minutes on "
          "the recording itself rather than on the people arguing about it.",
          v3="[procedural, a hint of pressure] Twenty-two minutes. The evidence "
             "locker is open to you, and so is the line. [beat] I would advise "
             "you to spend at least one of those minutes on the recording "
             "itself, rather than on the people arguing about it."),
    ],
    choices=[
        C("Frayne: 'My assessment was wrong.' What assessment?",
          "s11_frayne_iv", once=True, tag="iv"),
        C("Dorsey: what was the courier problem?",
          "s13_dorsey_iv", once=True, tag="iv"),
        C("Nagel: you were listening that night. What did you hear?",
          "s15_nagel_iv", once=True, tag="iv"),
        C("Iris: the cards. All of them.",
          "s18_iris_cards", once=True, tag="iv"),
        C("Pull the checkpoint recording.", "s17_checkpoint",
          req={"tag_count": ["iv", 2]}),
    ],
)

scene(
    "s11_frayne_iv", act=2, clock=21, amb="study",
    title="The assessment",
    lines=[
        L("frayne",
          "The courier problem. Yes. In the summer of eighty-three we lost four "
          "sources in eleven weeks. Not arrests. Not trials. They simply became "
          "people who had never existed.",
          v3="[factual, and underneath it, old rage] The courier problem. Yes. "
             "[beat] In the summer of eighty-three we lost four sources in "
             "eleven weeks. Not arrests. Not trials. [beat] They simply became "
             "people who had never existed."),
        L("frayne",
          "Peter was our cipher security. He built a correlation. Every "
          "compromised source had been handled through one courier chain, and "
          "that chain belonged to a West German officer named Willi Kroll.",
          v3="[precise] Peter was our cipher security. He built a correlation. "
             "Every compromised source had been handled through one courier "
             "chain. [beat] And that chain belonged to a West German officer "
             "named Willi Kroll."),
        L("frayne",
          "He was certain. I have never seen him certain about anything before "
          "or since. He asked to go across and confirm it in person, and I let "
          "him, and that is the sentence I have said to four committees.",
          v3="[flat] He was certain. I have never seen him certain about "
             "anything, before or since. He asked to go across and confirm it "
             "in person. And I let him. [beat] And that is the sentence I have "
             "said to four committees."),
        L("frayne",
          "Then, on the fourteenth, he told an open channel that his assessment "
          "was wrong, and forty hours later he was a defector. You may draw the "
          "obvious conclusion. Everyone else did.",
          v3="[dry, inviting the trap] Then, on the fourteenth, he told an open "
             "channel that his assessment was wrong. And forty hours later he "
             "was a defector. [beat] You may draw the obvious conclusion. "
             "[beat] Everyone else did."),
    ],
    grants=["E04"], sets={"knows_kroll": True, "frayne_iv": True},
    choices=[
        C("'You logged him unstable on the twelfth. Two days before.'",
          "s12_frayne_log", tag="press"),
        C("Let it stand. Move on.", "s10_hub_investigate"),
    ],
)

scene(
    "s12_frayne_log", act=2, clock=20, amb="study",
    title="The twelfth of October",
    lines=[
        L("frayne",
          "I did.",
          v3="[nothing at all in it] I did."),
        L("iris",
          "You logged my father unstable two days before he crossed, and then "
          "you signed the authorisation to send him.",
          v3="[very quiet, very dangerous] You logged my father unstable two "
             "days before he crossed. [beat] And then you signed the "
             "authorisation to send him."),
        L("frayne",
          "The entry is dated the twelfth. It was written on the "
          "twenty-third.",
          v3="[absolutely level] The entry is dated the twelfth. [beat] It was "
             "written on the twenty-third."),
        L("vogt",
          "That is nine days after he disappeared. Dame Rosalind, that is a "
          "falsified record.",
          v3="[genuinely shocked, procedural instinct] That is nine days after "
             "he disappeared. [beat] Dame Rosalind, that is a falsified "
             "record."),
        L("frayne",
          "It is. I have known that for forty-three years and I have never once "
          "lost sleep over it, which I imagine disappoints you.",
          v3="[crisp, unapologetic] It is. I have known that for forty-three "
             "years, and I have never once lost sleep over it. [beat] Which I "
             "imagine disappoints you."),
        L("frayne",
          "Understand what a review does, Examiner. If Peter was well, then a "
          "well man walked into the eastern sector and did not come out, and a "
          "review opens. A review reads the source files. The source files have "
          "names in them. Living names, in nineteen eighty-three.",
          v3="[teaching, and the teaching is a defence] Understand what a "
             "review does, Examiner. If Peter was well, then a well man walked "
             "into the eastern sector and did not come out. And a review opens. "
             "[beat] A review reads the source files. The source files have "
             "names in them. [beat] Living names. In nineteen eighty-three."),
        L("frayne",
          "So I made him unwell on paper, and there was no review, and eleven "
          "people who are alive today stayed alive. I would do it again this "
          "evening. I would do it before dinner.",
          v3="[with real steel] So I made him unwell on paper. And there was no "
             "review. And eleven people who are alive today stayed alive. "
             "[beat] I would do it again this evening. I would do it before "
             "dinner."),
    ],
    grants=["E12"], sets={"frayne_confessed": True, "trust_frayne": 1},
    next="s10_hub_investigate",
)

scene(
    "s13_dorsey_iv", act=2, clock=21, amb="line",
    title="Gene Dorsey on the courier problem",
    lines=[
        L("dorsey",
          "The courier problem is what we called it afterward, which tells you "
          "something about us. At the time we called it a run of bad luck, and "
          "then we called it a leak, and then we stopped calling it anything in "
          "writing.",
          v3="[rueful, disarming] The courier problem is what we called it "
             "afterward. Which tells you something about us. [beat] At the time "
             "we called it a run of bad luck. Then we called it a leak. [beat] "
             "Then we stopped calling it anything in writing."),
        L("dorsey",
          "Peter went looking for a person. That was his mistake, and I say "
          "that with affection. He was a mathematician. He believed that if a "
          "thing has an effect, it has a cause, and the cause has a name and an "
          "address.",
          v3="[warm, generous, and entirely self-serving] Peter went looking "
             "for a person. That was his mistake, and I say that with "
             "affection. He was a mathematician. [beat] He believed that if a "
             "thing has an effect, it has a cause. And the cause has a name. "
             "And an address."),
        L("dorsey",
          "Sometimes a network just gets old, Examiner. Sometimes nine people "
          "know a thing and one of them tells his wife. There isn't always a "
          "traitor. There's just a lot of daylight and not enough curtain.",
          v3="[philosophical, avuncular] Sometimes a network just gets old, "
             "Examiner. Sometimes nine people know a thing, and one of them "
             "tells his wife. [beat] There isn't always a traitor. There's just "
             "a lot of daylight, and not enough curtain."),
        L("iris",
          "Nine people.",
          v3="[instantly, quietly] Nine people."),
        L("dorsey", "Figure of speech, sweetheart.",
          v3="[easy] Figure of speech, sweetheart."),
        L("iris",
          "It's a very specific figure of speech. The GLASSHOUSE handling list "
          "had nine names on it. That number has been classified since before I "
          "could read.",
          v3="[cold, closing] It's a very specific figure of speech. [beat] The "
             "GLASSHOUSE handling list had nine names on it. [beat] That number "
             "has been classified since before I could read."),
        L("dorsey",
          "Then I guess I read it somewhere I shouldn't have. At my age that's "
          "most places.",
          v3="[a beat too late, still smiling] Then I guess I read it somewhere "
             "I shouldn't have. [beat] At my age, that's most places."),
    ],
    sets={"dorsey_iv": True, "dorsey_slip_nine": True},
    choices=[
        C("'You've never seen that list. You said so in 2009, under oath.'",
          "s14_dorsey_press", req={"flag": "dorsey_slip_nine"}, tag="press"),
        C("Note it and move on.", "s10_hub_investigate"),
    ],
)

scene(
    "s14_dorsey_press", act=2, clock=20, amb="line",
    title="Under oath",
    lines=[
        L("dorsey",
          "I said I had never held it. Which is true. I have never held that "
          "document in my hands.",
          v3="[unhurried, precise for the first time] I said I had never held "
             "it. [beat] Which is true. I have never held that document in my "
             "hands."),
        L("frayne",
          "Oh, Gene.",
          v3="[weary contempt, from very far away] Oh, Gene."),
        L("dorsey",
          "Rosalind, don't.",
          v3="[a warning, no warmth in it] Rosalind. Don't."),
        L("frayne",
          "Forty-three years and he still parses like a man with counsel in the "
          "room. He was read the list. Aloud. That is how the Americans took "
          "delivery of things they wished to be able to deny.",
          v3="[to the Examiner, brisk, cutting] Forty-three years, and he still "
             "parses like a man with counsel in the room. [beat] He was read "
             "the list. Aloud. That is how the Americans took delivery of "
             "things they wished to be able to deny."),
        L("dorsey",
          "That is a procedure, not a crime.",
          v3="[flat] That is a procedure. Not a crime."),
        L("frayne",
          "It is a procedure that exists for exactly one purpose, and you have "
          "just described it to a review examiner on a recorded line. Do go on.",
          v3="[with genuine enjoyment] It is a procedure that exists for "
             "exactly one purpose. And you have just described it to a review "
             "examiner, on a recorded line. [beat] Do go on."),
    ],
    sets={"dorsey_pressed": True},
    next="s10_hub_investigate",
)

scene(
    "s15_nagel_iv", act=2, clock=21, amb="apartment",
    title="What Nagel heard",
    lines=[
        L("nagel",
          "The fourteenth. Yes. I was on shift. I have thought about that "
          "night more often than about my wedding, which my wife did not "
          "consider a compliment.",
          v3="[dry, comfortable, enjoying himself] The fourteenth. Yes. I was "
             "on shift. [beat] I have thought about that night more often than "
             "about my wedding. Which my wife did not consider a compliment."),
        L("nagel",
          "I will play you something. It is not in your archive. It is not in "
          "our archive either, because I did not put it there. Listen to the "
          "announcer, not the words.",
          v3="[matter of fact] I will play you something. It is not in your "
             "archive. [beat] It is not in our archive either, because I did "
             "not put it there. [beat] Listen to the announcer. Not the words."),
        L("nagel",
          "Now. She says it wrong. Nobody ever noticed. Visibility-",
          v3="[leaning in, delighted, a craftsman showing his work] Now. She "
             "says it wrong. Nobody ever noticed. [beat] Vis-ibility-",
          note="CLUE 1: he speaks the seam a half-second before the tape does."),
        L("meteo", "Visibility, three. Pressure, zero four one seven.",
          v3="[flat, the stress falling oddly on the first syllable] "
             "VIS-ibility, three. Pressure, zero four one seven.",
          fx="sw_quote"),
        L("nagel",
          "There. You hear it? The stress on the front of the word. No trained "
          "announcer does that. It is a seam. The word was cut from two "
          "different afternoons and joined in the middle.",
          v3="[triumphant, generous] There. You hear it? The stress on the "
             "front of the word. [beat] No trained announcer does that. It is a "
             "seam. [beat] The word was cut from two different afternoons, and "
             "joined in the middle."),
        L("nagel",
          "That is what four one seven was. Not a woman reading the news. A "
          "library. She read lists, and we built sentences she never said.",
          v3="[quietly proud] That is what four one seven was. Not a woman "
             "reading the news. [beat] A library. She read lists. And we built "
             "sentences she never said."),
        L("iris",
          "Who is we.",
          v3="[flat] Who is we."),
        L("nagel",
          "Young men with razor blades and a great deal of time. It was the "
          "most beautiful work in the service and they gave it to the ones who "
          "were no good at anything else.",
          v3="[fond, evasive, charming] Young men with razor blades and a great "
             "deal of time. [beat] It was the most beautiful work in the "
             "service, and they gave it to the ones who were no good at "
             "anything else."),
    ],
    grants=["E07"], sets={"nagel_iv": True, "nagel_slip_available": True},
    choices=[
        C("'You said the seam before the tape played it.'",
          "s16_nagel_rhythm", sets={"nagel_slip": True}, tag="press",
          note="Only lands here; if missed, recoverable at the bench."),
        C("Ask how he knows a genuine Halloway transmission.",
          "s16_nagel_rhythm", tag="ask"),
    ],
)

scene(
    "s16_nagel_rhythm", act=2, clock=20, amb="apartment",
    title="Three, two, five",
    lines=[
        L("nagel",
          "Ah. Now you are asking a real question.",
          v3="[pleased] Ah. Now you are asking a real question."),
        L("nagel",
          "Your Halloway was cleverer than all of us. He knew we could forge "
          "any voice, any word, any number. So he did not authenticate with "
          "sound. He authenticated with silence.",
          v3="[serious now, this is his religion] Your Halloway was cleverer "
             "than all of us. He knew we could forge any voice. Any word. Any "
             "number. [beat] So he did not authenticate with sound. [beat] He "
             "authenticated with silence."),
        L("nagel",
          "Between his phrases: three beats. Two beats. Five beats. Always. "
          "Never written, never spoken, never in any manual. A man breathing in "
          "a pattern.",
          v3="[tapping it out] Between his phrases. Three beats. Two beats. "
             "Five beats. [beat] Always. Never written. Never spoken. Never in "
             "any manual. [beat] A man breathing in a pattern."),
        L("iris",
          "Three, two, five.",
          v3="[unsteady] Three. Two. Five."),
        L("nagel", "It means something to you.",
          v3="[curious, gentle] It means something to you."),
        L("iris",
          "The third of February, nineteen seventy-five. It's my birthday. He "
          "authenticated himself with my birthday.",
          v3="[breaking very slightly and hating it] The third of February, "
             "nineteen seventy-five. [beat] It's my birthday. [beat] He "
             "authenticated himself with my birthday."),
        L("nagel",
          "Then you may do something none of us could. You may listen to "
          "tonight, and you will know at once which parts of it are your father.",
          v3="[softly, and it is almost kind] Then you may do something none of "
             "us could. [beat] You may listen to tonight. And you will know at "
             "once which parts of it are your father."),
    ],
    grants=["E15"], sets={"knows_rhythm": True, "trust_nagel": 1},
    next="s10_hub_investigate",
)

scene(
    "s17_checkpoint", act=2, clock=19, amb="checkpoint", solo=False,
    title="Friedrichstrasse, 02:14",
    lines=[
        L("vogt",
          "This is border police tape, western side, two fourteen in the "
          "morning on the fifteenth. It has been in the public catalogue since "
          "two thousand and four and nobody has ever listened to it, because it "
          "is nine minutes of men shouting.",
          v3="[procedural] This is border police tape. Western side. Two "
             "fourteen in the morning, on the fifteenth. [beat] It has been in "
             "the public catalogue since two thousand and four, and nobody has "
             "ever listened to it. Because it is nine minutes of men shouting."),
        L("kroll",
          "Nein - nein, I am expected, my name is on the list, look at the "
          "list-",
          v3="[shouting, panicked, distant, over engine noise] Nein - nein, I "
             "am expected! My name is on the list! Look at the list!",
          fx="far"),
        L("halloway",
          "Willi. Willi, look at me. Put it down.",
          v3="[close to the mic, very calm, almost tender] Willi. [beat] Willi, "
             "look at me. [beat] Put it down.",
          fx="near"),
        L("kroll",
          "They have already written it, Peter. They have already written it "
          "and it is my name in it-",
          v3="[terrified, breaking] They have already written it, Peter! They "
             "have already written it, and it is my name in it!",
          fx="far"),
        L("halloway",
          "I know. I know they have. Give me the envelope.",
          v3="[level, unbearably steady] I know. [beat] I know they have. "
             "[beat] Give me the envelope.",
          fx="near"),
        L("vogt",
          "And then thirty seconds of vehicle noise, and then the tape ends "
          "because the officer's shift ended.",
          v3="[flat, shaken despite herself] And then thirty seconds of vehicle "
             "noise. [beat] And then the tape ends. Because the officer's shift "
             "ended."),
        L("iris",
          "Play the second voice again.",
          v3="[quiet] Play the second voice again."),
        L("vogt",
          "Doctor Halloway-",
          v3="[gently] Doctor Halloway-"),
        L("iris",
          "I know what my father sounds like when he is frightened, Frau Vogt. "
          "That is not it. He is not frightened on that tape. He is deciding.",
          v3="[precise, devastated] I know what my father sounds like when he "
             "is frightened, Frau Vogt. [beat] That is not it. [beat] He is not "
             "frightened on that tape. [beat] He is deciding."),
    ],
    grants=["E05"], sets={"heard_checkpoint": True},
    next="s18_kroll_letter",
)

scene(
    "s18_kroll_letter", act=2, clock=18, amb="tape83", solo=True,
    title="Unsent",
    lines=[
        L("vogt",
          "Kroll's effects were returned to his sister in nineteen eighty-four. "
          "She gave them to this archive in two thousand and eleven. This was "
          "in the lining of the case. It is a dictation cylinder. He never "
          "posted it.",
          v3="[quiet, careful] Kroll's effects were returned to his sister in "
             "nineteen eighty-four. She gave them to this archive in two "
             "thousand and eleven. [beat] This was in the lining of the case. "
             "It is a dictation cylinder. [beat] He never posted it.",
          fx="none"),
        L("kroll",
          "Ilse. If you are hearing this then it has happened the way I think "
          "it will happen.",
          v3="[formal, frightened, holding himself together] Ilse. [beat] If "
             "you are hearing this, then it has happened the way I think it "
             "will happen."),
        L("kroll",
          "For nine weeks my chain has been the only chain they examine. Every "
          "meeting, I am asked the same four questions in a different order. I "
          "am not being investigated. I am being prepared.",
          v3="[bitter, precise] For nine weeks, my chain has been the only "
             "chain they examine. Every meeting, I am asked the same four "
             "questions in a different order. [beat] I am not being "
             "investigated. [beat] I am being prepared."),
        L("kroll",
          "I have asked the Englishman for help. He is honest, which in this "
          "work means he is dangerous to be near. He believes it is me. I can "
          "hear it in how kindly he speaks.",
          v3="[a terrible small laugh] I have asked the Englishman for help. He "
             "is honest, which in this work means he is dangerous to be near. "
             "[beat] He believes it is me. [beat] I can hear it in how kindly "
             "he speaks."),
        L("kroll",
          "If they take me I will not be brave. I want to write that down while "
          "it is still a thing I am choosing. I have names, Ilse. I have your "
          "name. And I am not brave.",
          v3="[breaking, then flat] If they take me, I will not be brave. "
             "[beat] I want to write that down while it is still a thing I am "
             "choosing. [beat] I have names, Ilse. I have your name. [beat] And "
             "I am not brave."),
    ],
    grants=["E06"], sets={"knows_kroll_innocent": True, "knows_kroll_would_talk": True},
    next="s19_hub_cipher",
)

scene(
    "s18_iris_cards", act=2, clock=20, amb="workstation",
    title="Eight years of cards",
    lines=[
        L("iris",
          "Nineteen eighty-four to nineteen ninety-one. Eight cards. Posted "
          "from eight different cities, none of them the one he was in.",
          v3="[businesslike, this is armour] Nineteen eighty-four to nineteen "
             "ninety-one. Eight cards. Posted from eight different cities, none "
             "of them the one he was in."),
        L("iris",
          "Each one has a weather phrase in block capitals. Wind backing "
          "westerly. Fog on the low ground. The forecast is memory. As a child "
          "I assumed it was a joke about English small talk.",
          v3="[reciting from memory, effortlessly] Each one has a weather "
             "phrase in block capitals. [beat] Wind backing westerly. Fog on "
             "the low ground. The forecast is memory. [beat] As a child, I "
             "assumed it was a joke about English small talk."),
        L("iris",
          "It is a substitution table. Eight cards, eight rows. He sent me the "
          "key to his own cipher one line a year, at an age when I could not "
          "possibly understand it, to an address the service did not know I "
          "lived at.",
          v3="[the professional and the daughter at war] It is a substitution "
             "table. Eight cards, eight rows. [beat] He sent me the key to his "
             "own cipher. One line a year. At an age when I could not possibly "
             "understand it. [beat] To an address the service did not know I "
             "lived at."),
        L("vogt", "You have had this since when.",
          v3="[carefully neutral] You have had this since when."),
        L("iris",
          "I have had eight birthday cards since I was seven, Frau Vogt. I have "
          "had a decryption key since about eleven o'clock this morning.",
          v3="[dry, exhausted] I have had eight birthday cards since I was "
             "seven, Frau Vogt. [beat] I have had a decryption key since about "
             "eleven o'clock this morning."),
    ],
    sets={"iris_cards": True, "trust_iris": 1},
    next="s10_hub_investigate",
)

scene(
    "s19_hub_cipher", act=3, clock=17, amb="vault",
    title="Seventeen minutes",
    hub=True,
    lines=[
        L("vogt",
          "Seventeen minutes. Doctor Halloway has the substitution table and "
          "the archive has everything else. Tell us what to do with the "
          "numbers.",
          v3="[urgent now] Seventeen minutes. Doctor Halloway has the "
             "substitution table, and the archive has everything else. [beat] "
             "Tell us what to do with the numbers."),
    ],
    choices=[
        C("Treat the values as real weather. Check them against the record.",
          "s20_impossible", once=True, tag="cipher"),
        C("Plot the wind bearings as a route across the city.",
          "s21_route", once=True, tag="cipher"),
        C("Read the pressure values as archive indices.",
          "s22_index", once=True, tag="cipher"),
        C("Compare tonight's silences against the three-two-five rhythm.",
          "s24_insert", req={"flag": "knows_rhythm"}, once=True, tag="cipher"),
        C("Iris: forget the sound. Measure the silences.",
          "s23b_rhythm_alt", req={"not_flag": "knows_rhythm"},
          once=True, tag="cipher"),
        C("Enough decoding. Go to the archive boxes.", "s23_archive",
          req={"flag": "decoded_index"}),
    ],
)

# ===========================================================================
# ACT THREE - THE WEATHER CIPHER           T-17 -> T-11
# ===========================================================================

scene(
    "s20_impossible", act=3, clock=16, amb="workstation",
    title="No such weather",
    lines=[
        L("iris",
          "I ran tonight's values against the German weather service record and "
          "then against every record there is. Pressure one one four nine.",
          v3="[fast, technical, pleased to be working] I ran tonight's values "
             "against the German weather service record. And then against every "
             "record there is. [beat] Pressure, one one four nine."),
        L("vogt", "Is that high?",
          v3="[flat] Is that high?"),
        L("iris",
          "The highest barometric pressure ever measured on this planet is one "
          "zero eight three point eight, in Mongolia, in nineteen sixty-eight. "
          "One one four nine is not high. One one four nine is not weather.",
          v3="[crisp, enjoying it] The highest barometric pressure ever "
             "measured on this planet is one zero eight three point eight. In "
             "Mongolia. In nineteen sixty-eight. [beat] One one four nine is "
             "not high. [beat] One one four nine is not weather."),
        L("iris",
          "And it is not a mistake either, because he does it every time. "
          "Nineteen eighty-one, eighty-three, tonight. Always one value that "
          "cannot exist. He is holding up a sign that says stop listening to "
          "this as weather.",
          v3="[building] And it is not a mistake, either. Because he does it "
             "every time. Nineteen eighty-one. Eighty-three. Tonight. [beat] "
             "Always one value that cannot exist. [beat] He is holding up a "
             "sign that says: stop listening to this as weather."),
        L("nagel",
          "We noticed in nineteen eighty-four. We assumed a fault in the "
          "encoder and we filed a report and the report was very long and "
          "entirely wrong.",
          v3="[dry, self-mocking] We noticed in nineteen eighty-four. We "
             "assumed a fault in the encoder. [beat] We filed a report. The "
             "report was very long, and entirely wrong."),
    ],
    grants=["E08"], sets={"decoded_impossible": True},
    next="s19_hub_cipher",
)

scene(
    "s21_route", act=3, clock=16, amb="workstation",
    title="Wind backing westerly",
    lines=[
        L("iris",
          "Take every wind bearing in sequence and walk them. Not as weather. "
          "As instructions.",
          v3="[quick] Take every wind bearing in sequence, and walk them. Not "
             "as weather. [beat] As instructions."),
        L("iris",
          "South south west four. North north east two. It is a route. It "
          "starts at the Adlershof transmitter and ends at a border crossing on "
          "Friedrichstrasse.",
          v3="[tracing it] South south west, four. North north east, two. "
             "[beat] It is a route. It starts at the Adlershof transmitter. "
             "[beat] And it ends at a border crossing on Friedrichstrasse."),
        L("vogt",
          "That is the nineteen eighty-three extraction route.",
          v3="[quiet] That is the nineteen eighty-three extraction route."),
        L("iris",
          "Yes. And it is also tonight's, because the bearings in tonight's "
          "transmission are not the same as eighty-three. Four of them have "
          "changed. Whoever is transmitting now has updated the walk for a city "
          "that has a different railway.",
          v3="[hard, alarmed] Yes. And it is also tonight's. [beat] Because the "
             "bearings in tonight's transmission are not the same as "
             "eighty-three. Four of them have changed. [beat] Whoever is "
             "transmitting now has updated the walk. For a city that has a "
             "different railway."),
        L("vogt",
          "Then someone is walking it at this moment. I will call the "
          "Bundespolizei-",
          v3="[moving, urgent] Then someone is walking it at this moment. I "
             "will call the Bundespolizei-"),
        L("dorsey",
          "And say what, Anneke? That a weather report told you a man is going "
          "to a train station? You will be a very entertaining recording at "
          "somebody's hearing.",
          v3="[cutting in, hard, the warmth gone for exactly one line] And say "
             "what, Anneke? [beat] That a weather report told you a man is "
             "going to a train station? [beat] You will be a very entertaining "
             "recording at somebody's hearing."),
    ],
    grants=["E09"], sets={"decoded_route": True, "courier_known": True},
    next="s19_hub_cipher",
)

scene(
    "s22_index", act=3, clock=15, amb="workstation",
    title="One one four nine",
    lines=[
        L("iris",
          "If the pressure values are not weather, they are numbers with "
          "nowhere to live. So give them somewhere. Frau Vogt, does this "
          "archive use four-digit box references?",
          v3="[thinking aloud, fast] If the pressure values are not weather, "
             "they are numbers with nowhere to live. So give them somewhere. "
             "[beat] Frau Vogt. Does this archive use four-digit box "
             "references?"),
        L("vogt",
          "It uses the Ministry's system. Four digits, then a page. One one "
          "four nine would be-",
          v3="[typing] It uses the Ministry's system. Four digits, then a page. "
             "[beat] One one four nine would be-"),
        L("vogt",
          "Box one one four nine is sealed. Zero nine nine one is sealed. Zero "
          "four one seven is sealed. Examiner, all three of the pressure values "
          "from tonight are sealed boxes in a building that has been locked "
          "since ten o'clock.",
          v3="[stopping dead] Box one one four nine is sealed. Zero nine nine "
             "one is sealed. Zero four one seven is sealed. [beat] Examiner. "
             "All three of the pressure values from tonight are sealed boxes. "
             "In a building that has been locked since ten o'clock."),
        L("nagel",
          "He is giving you the shelf number, and he has been giving it to you "
          "since nineteen eighty-four, and you were checking the barometer.",
          v3="[delighted, merciless] He is giving you the shelf number. [beat] "
             "And he has been giving it to you since nineteen eighty-four. "
             "[beat] And you were checking the barometer."),
    ],
    grants=["E10"], sets={"decoded_index": True},
    next="s19_hub_cipher",
)

scene(
    "s23_archive", act=3, clock=14, amb="vault",
    title="Box 1149",
    lines=[
        L("vogt",
          "Box one one four nine. March, nineteen eighty-three. It is a "
          "distribution receipt.",
          v3="[reading, paper] Box one one four nine. March, nineteen "
             "eighty-three. [beat] It is a distribution receipt."),
        L("vogt",
          "Nine cryptonyms. GLASSHOUSE handling list, partial. Released for "
          "oral briefing on the ninth of March to a liaison officer, "
          "countersigned, and the countersignature is a political office. Not an "
          "intelligence office. A political office.",
          v3="[precise, and getting colder] Nine cryptonyms. GLASSHOUSE "
             "handling list, partial. Released for oral briefing on the ninth "
             "of March to a liaison officer. Countersigned. [beat] And the "
             "countersignature is a political office. [beat] Not an "
             "intelligence office. A political office."),
        L("frayne",
          "Read the liaison officer's name.",
          v3="[very quietly] Read the liaison officer's name."),
        L("vogt", "G. Dorsey.",
          v3="[flat] G. Dorsey."),
        L("frayne",
          "Ah.",
          v3="[one syllable, forty-three years long] Ah."),
        L("dorsey",
          "That briefing was authorised. It was authorised at a level none of "
          "you have ever been cleared to know about, and it was authorised for "
          "reasons that are still classified and still correct.",
          v3="[fast, and for the first time not warm at all] That briefing was "
             "authorised. It was authorised at a level none of you have ever "
             "been cleared to know about. And it was authorised for reasons "
             "that are still classified, and still correct."),
        L("iris",
          "Four of those nine were dead within eleven weeks.",
          v3="[flat, absolute] Four of those nine were dead within eleven "
             "weeks."),
        L("dorsey",
          "I know how many.",
          v3="[quiet, and it might even be real] I know how many."),
    ],
    grants=["E11", "E12"], sets={"found_list": True},
    next="s25_iris_upload",
)

scene(
    "s24_insert", act=3, clock=15, amb="workstation",
    title="Nine seconds",
    req={"flag": "knows_rhythm"},
    lines=[
        L("iris",
          "I have laid tonight's transmission against my father's rhythm. "
          "Three, two, five, in the silences. It holds for the whole broadcast.",
          v3="[focused] I have laid tonight's transmission against my father's "
             "rhythm. Three, two, five, in the silences. [beat] It holds for "
             "the whole broadcast."),
        L("iris",
          "Except here. Nine seconds, beginning at one minute four. The words "
          "are right. The vocabulary is right. And the gaps are one point two "
          "zero zero seconds. Every one of them. To the millisecond.",
          v3="[slowing down, cold] Except here. [beat] Nine seconds, beginning "
             "at one minute four. The words are right. The vocabulary is right. "
             "[beat] And the gaps are one point two zero zero seconds. Every "
             "one of them. [beat] To the millisecond."),
        L("nagel",
          "A man cannot breathe to the millisecond.",
          v3="[softly] A man cannot breathe to the millisecond."),
        L("iris",
          "No. A man cannot. Somebody has cut nine seconds into my father's "
          "broadcast and set the gaps with a mouse.",
          v3="[hard] No. A man cannot. [beat] Somebody has cut nine seconds "
             "into my father's broadcast. And set the gaps with a mouse."),
        L("vogt", "Play the nine seconds.",
          v3="[grim] Play the nine seconds."),
        L("meteo",
          "Courier. East platform. Destroy blue key. Close glasshouse.",
          v3="[flat, evenly spaced, mechanical] Courier. East platform. Destroy "
             "blue key. Close glasshouse.",
          fx="insert"),
        L("frayne",
          "That is not a message from nineteen eighty-three, Examiner. That is "
          "somebody giving an order this evening, in a dead woman's voice, on a "
          "channel we were all too sentimental to switch off.",
          v3="[icy, precise] That is not a message from nineteen eighty-three, "
             "Examiner. [beat] That is somebody giving an order this evening. "
             "In a dead woman's voice. [beat] On a channel we were all too "
             "sentimental to switch off."),
    ],
    grants=["E16"], sets={"found_insert": True},
    next="s19_hub_cipher",
)

scene(
    "s25_iris_upload", act=3, clock=13, amb="workstation",
    title="The eleventh of July",
    lines=[
        L("iris",
          "Before anyone else finds it and makes it sound worse than it is. It "
          "was me. I woke the station.",
          v3="[flat, getting it over with] Before anyone else finds it and "
             "makes it sound worse than it is. [beat] It was me. I woke the "
             "station."),
        L("vogt", "Explain that.",
          v3="[sharp] Explain that."),
        L("iris",
          "On the eleventh of July I scanned the nineteen eighty-six card and "
          "uploaded it to an open cryptography forum. I wanted somebody to tell "
          "me it was nothing. It had been thirty-nine years and I wanted a "
          "stranger to tell me it was a card from a father to a child.",
          v3="[the professional voice failing] On the eleventh of July, I "
             "scanned the nineteen eighty-six card, and I uploaded it to an "
             "open cryptography forum. [beat] I wanted somebody to tell me it "
             "was nothing. [beat] It had been thirty-nine years, and I wanted a "
             "stranger to tell me it was a card from a father to a child."),
        L("iris",
          "It was a release condition. He built a lock that opens when the last "
          "row of the table becomes public, and he gave the last row to a "
          "nine-year-old, and he waited.",
          v3="[hollow] It was a release condition. [beat] He built a lock that "
             "opens when the last row of the table becomes public. And he gave "
             "the last row to a nine-year-old. [beat] And he waited."),
        L("frayne",
          "He waited for you to be ready, Iris. Not for the row. That is what "
          "the mechanism is for. He had no way to measure whether the world was "
          "safe, so he measured whether his daughter had gone looking.",
          v3="[unexpectedly, and it costs her] He waited for you to be ready, "
             "Iris. Not for the row. [beat] That is what the mechanism is for. "
             "[beat] He had no way to measure whether the world was safe. So he "
             "measured whether his daughter had gone looking."),
        L("iris",
          "Don't.",
          v3="[cracking] Don't."),
        L("frayne", "No. Quite right. I apologise.",
          v3="[gently, awkward with it] No. Quite right. [beat] I apologise."),
    ],
    grants=["E13"], sets={"iris_confessed": True, "trust_iris": 1},
    next="s26_hub_network",
)

# ===========================================================================
# ACT FOUR - THE LIVING NETWORK            T-11 -> T-4
# ===========================================================================

scene(
    "s26_hub_network", act=4, clock=11, amb="vault",
    title="Eleven minutes",
    hub=True,
    lines=[
        L("vogt",
          "Eleven minutes. There is a courier walking a route out of a weather "
          "report, and there are nine seconds in tonight's broadcast that "
          "somebody made. I would like to know who, and I would like to know "
          "before the window.",
          v3="[urgent, controlled] Eleven minutes. [beat] There is a courier "
             "walking a route out of a weather report. And there are nine "
             "seconds in tonight's broadcast that somebody made. [beat] I would "
             "like to know who. And I would like to know before the window."),
    ],
    choices=[
        C("Take the nine seconds to the analysis bench.",
          "s27_bench", req={"flag": "found_insert"}, once=True, tag="net"),
        C("Who could voice her? Find the recording schedule.",
          "s28_library", once=True, tag="net"),
        C("Who opened this archive six months ago?",
          "s29_credentials", once=True, tag="net"),
        C("Dorsey. The ninth of March.",
          "s30_dorsey_admit", req={"flag": "found_list"}, once=True, tag="net"),
        C("Frau Vogt: why have you been redacting your own archive?",
          "s31_vogt_mother", req={"flag": "syllable_gap"}, once=True, tag="net"),
        C("Open the last layer of the cipher.", "s32_confession",
          req={"flag": "iris_confessed", "tag_count": ["net", 2]}),
    ],
)

scene(
    "s27_bench", act=4, clock=10, amb="bench", bench=True,
    title="Analysis bench",
    lines=[
        L("vogt",
          "Nine seconds, isolated and looped. The bench will do whatever you "
          "ask it and nothing you do not. Choose carefully, we are short of "
          "minutes.",
          v3="[terse] Nine seconds. Isolated, and looped. [beat] The bench will "
             "do whatever you ask it, and nothing you do not. [beat] Choose "
             "carefully. We are short of minutes."),
    ],
    bench_options=[
        {"id": "slow", "label": "Slow to half speed, preserve pitch",
         "correct": False, "cost": 1,
         "result": "The words separate. Courier. East platform. Nothing new in "
                   "them; they were always clear. The evenness gets worse the "
                   "slower it goes.",
         "line": L("iris", "It is cleaner slowed down, which is itself an "
                   "answer. Tape is never cleaner slowed down.",
                   v3="[dry] It is cleaner slowed down. [beat] Which is itself "
                      "an answer. Tape is never cleaner slowed down.")},
        {"id": "speech", "label": "Isolate the speech band, 300 to 3400 hertz",
         "correct": False, "cost": 1,
         "result": "The announcer, alone, with everything else stripped away. "
                   "Flawless. Too flawless.",
         "line": L("nagel", "You have removed the room. In my day we would have "
                   "called that destroying the evidence, but very politely.",
                   v3="[amused] You have removed the room. [beat] In my day we "
                      "would have called that destroying the evidence. But very "
                      "politely.")},
        {"id": "floor", "label": "Gate the speech. Lift the noise floor between phrases.",
         "correct": True, "cost": 1,
         "result": "Under the announcer there is a room. A metallic tick, "
                   "regular, every 2.1 seconds. Beneath it, once, a long low "
                   "rumble that rises and falls away.",
         "line": L("iris",
                   "There is a room under her. A tick, every two seconds or "
                   "so, absolutely regular. And once, something heavy going "
                   "past outside.",
                   v3="[quiet, focused] There is a room under her. [beat] A "
                      "tick. Every two seconds or so. Absolutely regular. "
                      "[beat] And once, something heavy going past. "
                      "Outside.")},
        {"id": "compare", "label": "Compare that room against the 1983 archive.",
         "correct": True, "cost": 1, "req": "bench_floor",
         "result": "The 1983 station recordings have a room too: a large, dead, "
                   "curtained studio. This is a small room with a radiator and "
                   "a tram line.",
         "line": L("vogt",
                   "The eighty-three recordings were made in a treated studio. "
                   "There is no radiator in Adlershof and there is no tram. "
                   "Examiner, this room is not in nineteen eighty-three. This "
                   "room is somewhere tonight.",
                   v3="[flat, and then very fast] The eighty-three recordings "
                      "were made in a treated studio. There is no radiator in "
                      "Adlershof, and there is no tram. [beat] Examiner. This "
                      "room is not in nineteen eighty-three. [beat] This room "
                      "is somewhere tonight.")},
    ],
    on_correct={"grants": ["E17"], "sets": {"room_tone": True}},
    next="s26_hub_network",
)

scene(
    "s28_library", act=4, clock=10, amb="vault",
    title="The word list",
    lines=[
        L("vogt",
          "Box zero four one seven. The station's own file. Recording "
          "schedules, nineteen seventy-nine to nineteen eighty-six.",
          v3="[reading] Box zero four one seven. The station's own file. "
             "Recording schedules. Nineteen seventy-nine to nineteen "
             "eighty-six."),
        L("vogt",
          "The announcer attended eleven sessions. She read a fixed vocabulary. "
          "Numbers zero to nine. Cardinal points. Cloud states. Twelve nouns. "
          "That is the entire language of Station four one seven. Nine hundred "
          "and forty words.",
          v3="[precise] The announcer attended eleven sessions. She read a "
             "fixed vocabulary. [beat] Numbers, zero to nine. Cardinal points. "
             "Cloud states. Twelve nouns. [beat] That is the entire language of "
             "Station four one seven. Nine hundred and forty words."),
        L("iris",
          "Platform is not a cloud state.",
          v3="[instantly] Platform is not a cloud state."),
        L("vogt",
          "No. Platform is not on the list. Courier is not on the list. Neither "
          "word exists in any session she ever recorded, and neither can be "
          "assembled from the syllables of the ones that do. I have had the "
          "system check.",
          v3="[slowly, the ground moving] No. Platform is not on the list. "
             "[beat] Courier is not on the list. [beat] Neither word exists in "
             "any session she ever recorded. And neither can be assembled from "
             "the syllables of the ones that do. [beat] I have had the system "
             "check."),
        L("iris",
          "Then tonight, somebody made her say two words she never said. Not "
          "cut. Made.",
          v3="[cold] Then tonight, somebody made her say two words she never "
             "said. [beat] Not cut. [beat] Made."),
        L("nagel",
          "That would require her voice. All of it. Not the tapes the archive "
          "holds. The session masters.",
          v3="[carefully, too carefully] That would require her voice. All of "
             "it. [beat] Not the tapes the archive holds. [beat] The session "
             "masters."),
        L("vogt",
          "Which were destroyed in nineteen ninety.",
          v3="[flat] Which were destroyed in nineteen ninety."),
        L("nagel",
          "Which were signed for as destroyed in nineteen ninety. It was a busy "
          "spring. A great many things were signed for.",
          v3="[light, and he should not have said it] Which were signed for as "
             "destroyed in nineteen ninety. [beat] It was a busy spring. A "
             "great many things were signed for."),
    ],
    grants=["E18"], sets={"syllable_gap": True},
    next="s26_hub_network",
)

scene(
    "s29_credentials", act=4, clock=9, amb="vault",
    title="An officer who died in 2007",
    lines=[
        L("vogt",
          "I have been sitting on this for four hours and I am going to say it "
          "badly. On the sixth of February somebody opened this archive's "
          "audio holdings using a valid credential.",
          v3="[stiff, this costs her] I have been sitting on this for four "
             "hours, and I am going to say it badly. [beat] On the sixth of "
             "February, somebody opened this archive's audio holdings using a "
             "valid credential."),
        L("vogt",
          "The credential belongs to Oberst Manfred Reuss, who was cleared for "
          "this material in nineteen ninety-four, and who died in Rostock in "
          "two thousand and seven.",
          v3="[precise] The credential belongs to Oberst Manfred Reuss. Who was "
             "cleared for this material in nineteen ninety-four. [beat] And who "
             "died in Rostock, in two thousand and seven."),
        L("frayne",
          "What did the dead man look at?",
          v3="[dry] What did the dead man look at?"),
        L("vogt",
          "Four hours of Station four one seven session material. He did not "
          "copy the transcripts. He copied only the audio, and only the "
          "sessions where she is alone in the room.",
          v3="[bleak] Four hours of Station four one seven session material. "
             "[beat] He did not copy the transcripts. He copied only the audio. "
             "[beat] And only the sessions where she is alone in the room."),
        L("iris",
          "That's not an intelligence officer stealing a secret. That's "
          "somebody collecting clean voice samples.",
          v3="[grim, technical] That's not an intelligence officer stealing a "
             "secret. [beat] That's somebody collecting clean voice samples."),
        L("dorsey",
          "Or it's a researcher with a dead man's password, and we are "
          "constructing a monster out of a filing error while an actual courier "
          "walks to an actual station.",
          v3="[reasonable, urgent, steering] Or it's a researcher with a dead "
             "man's password. [beat] And we are constructing a monster out of a "
             "filing error, while an actual courier walks to an actual "
             "station."),
    ],
    grants=["E14"], sets={"knows_credentials": True},
    next="s26_hub_network",
)

scene(
    "s30_dorsey_admit", act=4, clock=8, amb="line",
    title="The ninth of March",
    lines=[
        L("dorsey",
          "You want the ninth of March. All right. I'll give you the ninth of "
          "March, and then I'd like somebody to notice what it isn't.",
          v3="[tired, and the tiredness is real] You want the ninth of March. "
             "[beat] All right. I'll give you the ninth of March. [beat] And "
             "then I'd like somebody to notice what it isn't."),
        L("dorsey",
          "In March of eighty-three there was a vote coming that would have put "
          "our people out of three cities. I needed a man in a political office "
          "to believe that the network was worth the trouble. So I read him "
          "nine cryptonyms. Not names. Cryptonyms.",
          v3="[flat, factual, a confession delivered as a briefing] In March of "
             "eighty-three, there was a vote coming that would have put our "
             "people out of three cities. [beat] I needed a man in a political "
             "office to believe that the network was worth the trouble. [beat] "
             "So I read him nine cryptonyms. [beat] Not names. Cryptonyms."),
        L("frayne",
          "You read nine cryptonyms to a politician.",
          v3="[quiet, and it is worse than shouting] You read nine cryptonyms "
             "to a politician."),
        L("dorsey",
          "I read nine cryptonyms to a man with a safe and a clearance, and he "
          "repeated four of them to an aide who did not have either, and that "
          "aide talked at a dinner in Bonn, and eleven weeks later four people "
          "were dead.",
          v3="[steady, this is the sentence he has assembled over forty years] "
             "I read nine cryptonyms to a man with a safe and a clearance. And "
             "he repeated four of them to an aide who did not have either. And "
             "that aide talked at a dinner in Bonn. [beat] And eleven weeks "
             "later, four people were dead."),
        L("dorsey",
          "I have known that since November of eighty-three. I did not sell "
          "anybody. I was careless in a building where careless is the same as "
          "murder, and I have spent forty-three years being extremely useful to "
          "make up for it.",
          v3="[and now the warmth is gone entirely] I have known that since "
             "November of eighty-three. [beat] I did not sell anybody. I was "
             "careless. In a building where careless is the same as murder. "
             "[beat] And I have spent forty-three years being extremely useful, "
             "to make up for it."),
        L("iris",
          "And Willi Kroll?",
          v3="[flat] And Willi Kroll?"),
        L("dorsey",
          "Kroll was the shape the investigation was already making. I did not "
          "put him there.",
          v3="[carefully] Kroll was the shape the investigation was already "
             "making. [beat] I did not put him there."),
        L("iris", "Did you take him out of it?",
          v3="[precise] Did you take him out of it?"),
        L("dorsey",
          "No.",
          v3="[after a long moment, quietly] [long pause] No."),
    ],
    grants=[], sets={"dorsey_admitted": True},
    next="s26_hub_network",
)

scene(
    "s32_confession", act=4, clock=7, amb="workstation",
    title="The last layer",
    lines=[
        L("iris",
          "The eighth row of the table is the last substitution. I have never "
          "run it because I have never had all eight rows in the same room as "
          "the broadcast. It is running now.",
          v3="[very controlled] The eighth row of the table is the last "
             "substitution. [beat] I have never run it, because I have never "
             "had all eight rows in the same room as the broadcast. [beat] It "
             "is running now."),
        L("vogt", "How long?",
          v3="[quiet] How long?"),
        L("iris",
          "It's done. It's a voice file. He left a voice file.",
          v3="[unsteady] It's done. [beat] It's a voice file. [beat] He left a "
             "voice file."),
        L("halloway",
          "This will be very late reaching you and I am sorry for that. If you "
          "are hearing it, then the last card is public, which means Iris went "
          "looking, which means she is well, which is the only part of this I "
          "have ever actually wanted to know.",
          v3="[older, thinner, tape hiss, dry and gentle] This will be very "
             "late reaching you, and I am sorry for that. [beat] If you are "
             "hearing it, then the last card is public. Which means Iris went "
             "looking. Which means she is well. [beat] Which is the only part "
             "of this I have ever actually wanted to know.",
          fx="tape91"),
        L("halloway",
          "The compromise was not a traitor. It was a briefing. Gene Dorsey "
          "read nine cryptonyms to a political office in March of eighty-three "
          "and the room leaked, as rooms do. The archive reference is one one "
          "four nine.",
          v3="[precise, businesslike] The compromise was not a traitor. It was "
             "a briefing. [beat] Gene Dorsey read nine cryptonyms to a "
             "political office in March of eighty-three, and the room leaked, "
             "as rooms do. [beat] The archive reference is one one four nine.",
          fx="tape91"),
        L("halloway",
          "Willi Kroll did not betray anybody. I believed he had. I was wrong "
          "in the way that only a careful man can be wrong, which is slowly and "
          "with a great deal of arithmetic.",
          v3="[and here it starts to cost him] Willi Kroll did not betray "
             "anybody. [beat] I believed he had. [beat] I was wrong in the way "
             "that only a careful man can be wrong. Which is slowly. And with a "
             "great deal of arithmetic.",
          fx="tape91"),
        L("halloway",
          "On the fifteenth of October, at a crossing on Friedrichstrasse, "
          "Willi Kroll had an envelope containing six names and he was going to "
          "hand it across to buy himself a night's sleep. He was not a wicked "
          "man. He was a frightened one, and I have been both.",
          v3="[very quiet now] On the fifteenth of October, at a crossing on "
             "Friedrichstrasse, Willi Kroll had an envelope containing six "
             "names. And he was going to hand it across, to buy himself a "
             "night's sleep. [beat] He was not a wicked man. He was a "
             "frightened one. [beat] And I have been both.",
          fx="tape91"),
        L("halloway",
          "I killed him. I want that in the plainest available English. Not a "
          "struggle. Not an accident. I stood in front of a man I had wronged "
          "and I made a decision and then I carried it out, and six people I "
          "have never met are grandmothers.",
          v3="[flat, absolutely steady, the steadiness is the horror] I killed "
             "him. [beat] I want that in the plainest available English. Not a "
             "struggle. Not an accident. [beat] I stood in front of a man I had "
             "wronged, and I made a decision, and then I carried it out. [beat] "
             "And six people I have never met are grandmothers.",
          fx="tape91"),
        L("halloway",
          "So I have chained the two together. You cannot have Dorsey without "
          "having me. If that seems unfair to you, consider that it is the only "
          "fair thing in the entire affair. A man who has done what I have done "
          "does not get to be the one who accuses.",
          v3="[measured] So I have chained the two together. [beat] You cannot "
             "have Dorsey without having me. [beat] If that seems unfair to "
             "you, consider that it is the only fair thing in the entire "
             "affair. [beat] A man who has done what I have done does not get "
             "to be the one who accuses.",
          fx="tape91"),
        L("halloway",
          "Iris. The forecast is memory. It means the weather has already "
          "happened. It means you cannot be warned, only told. I have told you. "
          "I am sorry it is this.",
          v3="[gentle, ruined] Iris. [beat] The forecast is memory. It means "
             "the weather has already happened. It means you cannot be warned. "
             "Only told. [beat] I have told you. [beat] I am sorry it is this.",
          fx="tape91"),
        L("halloway", "Weathervane out.",
          v3="[a breath] Weathervane out.", fx="tape91"),
    ],
    grants=["E19"], sets={"has_confession": True},
    next="s33_courier",
)

scene(
    "s33_courier", act=4, clock=5, amb="vault",
    title="East platform",
    lines=[
        L("vogt",
          "Bundespolizei have a man on the east platform at Ostbahnhof "
          "matching a route that does not officially exist. He is carrying a "
          "case. They will not move without an authority and I do not have one.",
          v3="[fast, clipped] Bundespolizei have a man on the east platform at "
             "Ostbahnhof, matching a route that does not officially exist. He "
             "is carrying a case. [beat] They will not move without an "
             "authority. [beat] And I do not have one."),
        L("vogt",
          "Five minutes to the window. Examiner, this is the part where you "
          "stop listening and start being responsible for something.",
          v3="[hard] Five minutes to the window. [beat] Examiner. This is the "
             "part where you stop listening, and start being responsible for "
             "something."),
    ],
    next="s34_confront",
)

scene(
    "s34_confront", act=4, clock=4, amb="apartment", confront=True,
    title="Nagel",
    lines=[
        L("nagel",
          "You have gone quiet, Examiner. In my experience that means either "
          "you have understood something, or you are about to embarrass "
          "yourself. Both are entertaining.",
          v3="[easy, amused, entirely relaxed] You have gone quiet, Examiner. "
             "[beat] In my experience that means either you have understood "
             "something, or you are about to embarrass yourself. [beat] Both "
             "are entertaining."),
    ],
    accuse_prompt="Put it to him. Choose what you put.",
    challenges=[
        {"id": "seam", "correct": True, "req": "nagel_slip",
         "label": "\"You spoke the seam a half-second before the tape played it.\"",
         "lines": [
             L("nagel", "I have heard that recording many times.",
               v3="[smoothly] I have heard that recording many times."),
             L("iris",
               "You told us you never filed it. You told us it was not in "
               "anyone's archive. There is no copy of that tape for you to have "
               "heard many times. There is only the one you kept.",
               v3="[fast, hard] You told us you never filed it. You told us it "
                  "was not in anyone's archive. [beat] There is no copy of that "
                  "tape for you to have heard many times. [beat] There is only "
                  "the one you kept."),
             L("nagel",
               "[a long breath] That is a good point. That is a very good "
               "point.",
               v3="[a long breath, and the amusement finally goes] "
                  "[long pause] That is a good point. [beat] That is a very "
                  "good point."),
         ]},
        {"id": "room", "correct": True, "req": "room_tone",
         "label": "\"The insert is breathing in your flat. Radiator. Tram.\"",
         "lines": [
             L("vogt",
               "Herr Nagel, there is a radiator behind you. It ticks every two "
               "point one seconds. It has ticked three times since you began "
               "speaking and I have counted every one of them.",
               v3="[relentless, reading it off a screen] Herr Nagel. There is a "
                  "radiator behind you. [beat] It ticks every two point one "
                  "seconds. [beat] It has ticked six times since you began "
                  "speaking. And I have counted every one of them."),
             L("nagel",
               "You are aware how many flats in this city have a radiator.",
               v3="[dry, but slower] You are aware how many flats in this city "
                  "have a radiator."),
             L("vogt",
               "Under the nine seconds there is a tick every two point one "
               "seconds. Same period. Same decay. And a tram passes at the same "
               "offset from it as the one that passed your window while you "
               "were denying this.",
               v3="[flat, closing] Under the nine seconds, there is a tick "
                  "every two point one seconds. [beat] Same period. Same "
                  "decay. [beat] And a tram passes at the same offset from it "
                  "as the one that passed your window. [beat] While you were "
                  "denying this."),
             L("vogt",
               "It is not a flat with a radiator, Herr Nagel. It is your "
               "radiator, and it is in tonight's broadcast.",
               v3="[quiet, final] It is not a flat with a radiator, Herr Nagel. "
                  "[beat] It is your radiator. [beat] And it is in tonight's "
                  "broadcast."),
         ]},
        {"id": "word", "correct": True, "req": "syllable_gap",
         "label": "\"'Platform' isn't in her word list. Somebody built it.\"",
         "lines": [
             L("nagel",
               "Then somebody had the session masters.",
               v3="[carefully] Then somebody had the session masters."),
             L("iris",
               "Somebody who knew there were session masters. Everyone else in "
               "this call believed they were destroyed in ninety. You corrected "
               "us. Nobody asked you to.",
               v3="[quiet, precise] Somebody who knew there were session "
                  "masters. [beat] Everyone else in this call believed they "
                  "were destroyed in ninety. [beat] You corrected us. [beat] "
                  "Nobody asked you to."),
             L("nagel", "Ah.",
               v3="[one syllable, and it is the sound of a man reviewing his "
                  "own evening] Ah."),
         ]},
        {"id": "stasi", "correct": False,
         "label": "\"You were Stasi. You have always been the obvious answer.\"",
         "lines": [
             L("nagel",
               "Yes. I was. And for forty years that sentence has been the "
               "cheapest one available in this country, and every time somebody "
               "reaches for it they stop thinking about ninety seconds too "
               "early.",
               v3="[contemptuous, and genuinely wounded] Yes. I was. [beat] And "
                  "for forty years that sentence has been the cheapest one "
                  "available in this country. [beat] And every time somebody "
                  "reaches for it, they stop thinking. About ninety seconds too "
                  "early."),
             L("dorsey",
               "He's right, Examiner. And you just spent a minute you didn't "
               "have.",
               v3="[quietly satisfied] He's right, Examiner. [beat] And you "
                  "just spent a minute you didn't have."),
         ], "cost": 1},
        {"id": "rhythm", "correct": False,
         "label": "\"You knew the three-two-five rhythm. Only the forger would.\"",
         "lines": [
             L("nagel",
               "I knew it because I spent eleven years failing to break it. It "
               "is in my service file. It is in the file you are sitting on top "
               "of, Frau Vogt, box zero four one seven, page ninety.",
               v3="[flat, almost bored] I knew it because I spent eleven years "
                  "failing to break it. [beat] It is in my service file. It is "
                  "in the file you are sitting on top of, Frau Vogt. Box zero "
                  "four one seven. Page ninety."),
             L("vogt", "...It is. It is on page ninety.",
               v3="[checking, deflated] ...It is. [beat] It is on page ninety."),
         ], "cost": 1},
    ],
    break_lines=[
        L("nagel",
          "Forty-one years ago they gave me a woman's voice in a box and told "
          "me to make her say whatever the service required. I was twenty-two. "
          "I was very good at it.",
          v3="[quiet, no performance left] Forty-one years ago they gave me a "
             "woman's voice in a box, and told me to make her say whatever the "
             "service required. [beat] I was twenty-two. [beat] I was very good "
             "at it."),
        L("nagel",
          "In ninety I was told to destroy her and I signed the paper and I did "
          "not do it. Everyone was destroying things that spring. I saved the "
          "only thing I had ever made properly.",
          v3="[factual] In ninety I was told to destroy her, and I signed the "
             "paper, and I did not do it. [beat] Everyone was destroying things "
             "that spring. [beat] I saved the only thing I had ever made "
             "properly."),
        L("nagel",
          "And then, Examiner, nothing happened for a very long time. And then "
          "people began to want voices again. Different people. Better paid.",
          v3="[a small dry laugh] And then, Examiner, nothing happened. For a "
             "very long time. [beat] And then people began to want voices "
             "again. [beat] Different people. Better paid."),
        L("nagel",
          "I did not know whose order I was carrying tonight. I have never "
          "known. That is the service they are buying. I was given nine seconds "
          "of text and a window, and I put her on the air one last time.",
          v3="[level] I did not know whose order I was carrying tonight. I have "
             "never known. [beat] That is the service they are buying. [beat] I "
             "was given nine seconds of text, and a window. And I put her on "
             "the air. One last time."),
        L("nagel",
          "I did help your father, Doctor Halloway. That was also true. A man "
          "can do one decent thing in nineteen eighty-three and be a supplier "
          "in twenty twenty-six. Nobody is a single sentence.",
          v3="[to Iris, and it is not an excuse, only information] I did help "
             "your father, Doctor Halloway. [beat] That was also true. [beat] A "
             "man can do one decent thing in nineteen eighty-three, and be a "
             "supplier in twenty twenty-six. [beat] Nobody is a single "
             "sentence."),
    ],
    fail_lines=[
        L("nagel",
          "You have four minutes and you have spent them on me. I am "
          "flattered, and you are finished.",
          v3="[the amusement back, and colder] You have four minutes, and you "
             "have spent them on me. [beat] I am flattered. [beat] And you are "
             "finished."),
    ],
    next="s35_theory",
)

# ===========================================================================
# ACT FIVE - FORECAST                      T-4 -> T-0
# ===========================================================================

scene(
    "s35_theory", act=5, clock=3, amb="vault", theory=True,
    title="Submit your finding",
    lines=[
        L("vogt",
          "Three minutes. The finding goes on the record in three parts and it "
          "goes on my authority, which means if you are wrong I lose this "
          "building and you lose rather more. Speak.",
          v3="[taut] Three minutes. [beat] The finding goes on the record in "
             "three parts, and it goes on my authority. Which means if you are "
             "wrong, I lose this building. [beat] And you lose rather more. "
             "[beat] Speak."),
    ],
    questions=[
        {"id": "insert", "prompt": "Who put nine seconds into tonight's broadcast?",
         "options": [("nagel", "Ulrich Nagel", True),
                     ("dorsey", "Gene Dorsey", False),
                     ("frayne", "Dame Rosalind Frayne", False),
                     ("iris", "Iris Halloway", False),
                     ("vogt", "Anneke Vogt", False),
                     ("unknown", "A client whose name nobody here knows", False)]},
        {"id": "compromise", "prompt": "Who compromised GLASSHOUSE in 1983?",
         "options": [("dorsey", "Gene Dorsey, by briefing a political office", True),
                     ("kroll", "Willi Kroll, the courier", False),
                     ("halloway", "Peter Halloway, who defected", False),
                     ("frayne", "Dame Rosalind Frayne, who falsified the log", False),
                     ("nagel", "Ulrich Nagel, listening from the East", False)]},
        {"id": "kroll", "prompt": "What happened to Willi Kroll?",
         "options": [("halloway", "Halloway killed him at the crossing", True),
                     ("stasi", "The Stasi took him", False),
                     ("framed", "He was framed and disappeared", False),
                     ("unknown", "The record does not say", False)]},
    ],
    next="s36_disclosure",
)

scene(
    "s36_disclosure", act=5, clock=2, amb="vault", disclosure=True,
    title="The window",
    lines=[
        L("vogt",
          "Ninety seconds. The transmitter will carry whatever we give it. "
          "Everything in the file, nothing in the file, or the part that can be "
          "said without a name in it. Choose, Examiner.",
          v3="[very quiet, very fast] Ninety seconds. The transmitter will "
             "carry whatever we give it. [beat] Everything in the file. Nothing "
             "in the file. [beat] Or the part that can be said without a name "
             "in it. [beat] Choose, Examiner."),
        L("iris",
          "Whatever you send, send all of him. Not the useful half. He chained "
          "them together so that nobody could do to him what he did to Willi "
          "Kroll. If you unchain them to make him a martyr, you have learned "
          "nothing tonight.",
          v3="[steady, and it is the hardest thing she says] Whatever you send. "
             "[beat] Send all of him. Not the useful half. [beat] He chained "
             "them together so that nobody could do to him what he did to Willi "
             "Kroll. [beat] If you unchain them to make him a martyr, you have "
             "learned nothing tonight."),
    ],
    options=[
        {"id": "redacted",
         "label": "Release the accusation and the confession. Redact the names.",
         "desc": "Dorsey's briefing and Halloway's killing, both. The protected "
                 "persons schedule stays sealed."},
        {"id": "suppress",
         "label": "Release nothing. Seal it and let the window close.",
         "desc": "Four families stay invisible. So does everything else."},
        {"id": "total",
         "label": "Release everything, unredacted.",
         "desc": "The file as it is, names included. Let it be judged whole."},
    ],
)

scene(
    "s31_vogt_mother", act=4, clock=8, amb="vault",
    title="Why she took the posting",
    lines=[
        L("iris",
          "Frau Vogt. You have been redacting this collection for four years. I "
          "have seen the version history. Nine hundred entries, all of them "
          "family names, all of them yours to approve.",
          v3="[not unkind, but not stopping] Frau Vogt. You have been redacting "
             "this collection for four years. I have seen the version history. "
             "[beat] Nine hundred entries. All of them family names. All of "
             "them yours to approve."),
        L("vogt",
          "Yes.",
          v3="[flat] Yes."),
        L("iris", "Why?",
          v3="[simply] Why?"),
        L("vogt",
          "Because in nineteen eighty-three a woman in Adlershof read a list "
          "into a microphone eleven times, and she was not paid, and she was "
          "not asked, and she was told what would happen to her daughter if she "
          "declined.",
          v3="[very level, the levelness is enormous effort] Because in "
             "nineteen eighty-three, a woman in Adlershof read a list into a "
             "microphone eleven times. [beat] And she was not paid. And she was "
             "not asked. [beat] And she was told what would happen to her "
             "daughter if she declined."),
        L("iris", "...Ilse Vogt.",
          v3="[quietly] ...Ilse Vogt."),
        L("vogt",
          "Ilse Vogt. She died in two thousand and four, in Pankow, having "
          "never once told me what she did. I found out from a card index. I "
          "took this posting fourteen months later.",
          v3="[precise, unbearable] Ilse Vogt. [beat] She died in two thousand "
             "and four, in Pankow. Having never once told me what she did. "
             "[beat] I found out from a card index. [beat] I took this posting "
             "fourteen months later."),
        L("vogt",
          "So yes. I have been removing names. I have not removed one fact, one "
          "date, or one crime. I have removed the addresses of frightened "
          "people. If that ends my career, then a great many people in this "
          "story have paid more for less.",
          v3="[hardening back into procedure, which is her armour] So yes. I "
             "have been removing names. [beat] I have not removed one fact. One "
             "date. Or one crime. [beat] I have removed the addresses of "
             "frightened people. [beat] If that ends my career, then a great "
             "many people in this story have paid more, for less."),
        L("nagel",
          "[very quietly] I did not know she had a daughter.",
          v3="[very quietly, and it is the first true thing he has said] "
             "[long pause] I did not know she had a daughter."),
        L("vogt",
          "You had her voice for forty years, Herr Nagel. You never once "
          "wondered whose it was.",
          v3="[flat, and it lands like a slap] You had her voice for forty "
             "years, Herr Nagel. [beat] You never once wondered whose it was."),
    ],
    sets={"vogt_mother": True, "trust_vogt": 1},
    next="s26_hub_network",
)

# ===========================================================================
# ENDINGS
# ===========================================================================

scene(
    "end_forecast", act=6, clock=0, amb="vault", ending=True,
    title="Ending: The Forecast Is Memory",
    lines=[
        L("vogt",
          "Finding entered. Ulrich Nagel, insertion of a covert instruction "
          "into a civil broadcast. Gene Dorsey, unauthorised disclosure, March "
          "nineteen eighty-three. Willi Kroll, exonerated of espionage, "
          "unlawfully killed. Transmitting the redacted file.",
          v3="[formal, fast, hands shaking somewhere under the voice] Finding "
             "entered. [beat] Ulrich Nagel. Insertion of a covert instruction "
             "into a civil broadcast. [beat] Gene Dorsey. Unauthorised "
             "disclosure, March nineteen eighty-three. [beat] Willi Kroll. "
             "Exonerated of espionage. Unlawfully killed. [beat] Transmitting "
             "the redacted file."),
        L("vogt",
          "Bundespolizei took the courier on the east platform at four minutes "
          "past. The case held a one-time pad and a phone with one number in "
          "it. The number is disconnected. It has been disconnected since "
          "before the arrest.",
          v3="[flat] Bundespolizei took the courier on the east platform at "
             "four minutes past. The case held a one-time pad, and a phone with "
             "one number in it. [beat] The number is disconnected. [beat] It "
             "has been disconnected since before the arrest."),
        L("frayne",
          "Of course it is. You have cut one wire out of a switchboard, "
          "Examiner. Do not mistake that for the end of the exchange. But it "
          "was the correct wire, and it has been forty-three years, and I find "
          "I am not sorry.",
          v3="[dry, tired, and something almost like warmth] Of course it is. "
             "[beat] You have cut one wire out of a switchboard, Examiner. Do "
             "not mistake that for the end of the exchange. [beat] But it was "
             "the correct wire. And it has been forty-three years. [beat] And I "
             "find I am not sorry."),
        L("iris",
          "They will make him a villain by Thursday. Both of them. My father "
          "killed a frightened man at a border and then spent eight years "
          "posting the proof to a child, and there is no headline that holds "
          "both halves of that.",
          v3="[exhausted, clear] They will make him a villain by Thursday. Both "
             "of them. [beat] My father killed a frightened man at a border, "
             "and then spent eight years posting the proof to a child. [beat] "
             "And there is no headline that holds both halves of that."),
        L("iris",
          "But it is out, and it is whole, and Willi Kroll's sister is "
          "eighty-one and can read it tomorrow. That will do. That will have to "
          "do.",
          v3="[steadying] But it is out. And it is whole. And Willi Kroll's "
             "sister is eighty-one, and can read it tomorrow. [beat] That will "
             "do. [beat] That will have to do."),
        L("vogt",
          "Examiner. Herr Nagel has sent one further file from custody. It is "
          "not evidence. He has marked it, in English, personal.",
          v3="[hesitant, out of procedure for once] Examiner. [beat] Herr Nagel "
             "has sent one further file from custody. [beat] It is not "
             "evidence. He has marked it, in English: personal."),
        L("nagel",
          "Session four, nineteen eighty-one. Between takes. I never cut this "
          "one because there was nothing in it I could use. Frau Vogt, I am too "
          "old to apologise usefully. Take it anyway.",
          v3="[quiet, no performance] Session four. Nineteen eighty-one. "
             "Between takes. [beat] I never cut this one, because there was "
             "nothing in it I could use. [beat] Frau Vogt. I am too old to "
             "apologise usefully. [beat] Take it anyway."),
        L("meteo",
          "Is it still running? It is still running. Oh - one moment - my "
          "daughter has a concert this evening and I have promised, so if we "
          "could possibly-",
          v3="[warm, quick, alive, laughing, entirely unlike the station voice, "
             "slightly off-mic] Is it still running? [beat] It is still "
             "running. [beat] Oh - one moment - my daughter has a concert this "
             "evening, and I have promised, so if we could possibly-",
          fx="reel81"),
        L("meteo",
          "Yes. Sorry. Ready.",
          v3="[composing herself, still smiling] Yes. Sorry. [beat] Ready.",
          fx="reel81"),
        L("meteo",
          "Wind, south south west, four. Cloud, broken. Visibility, three.",
          v3="[and now flat, the station voice, the mask going back on] Wind, "
             "south south west, four. Cloud, broken. Visibility, three.",
          fx="reel81"),
    ],
    coda_total=[
        L("vogt",
          "One correction to the record. You released the file entire. At "
          "eleven minutes past, a woman in Schwerin rang this facility to ask "
          "why her mother's name is on the internet. I did not have an answer "
          "for her. I do not have one now.",
          v3="[very quiet, wrecked] One correction to the record. [beat] You "
             "released the file entire. [beat] At eleven minutes past, a woman "
             "in Schwerin rang this facility, to ask why her mother's name is "
             "on the internet. [beat] I did not have an answer for her. [beat] "
             "I do not have one now."),
    ],
    ending_id="forecast",
)

scene(
    "end_necessary_lie", act=6, clock=0, amb="vault", ending=True,
    title="Ending: The Necessary Lie",
    lines=[
        L("vogt",
          "The window has closed. Nothing was transmitted. The finding is "
          "sealed under the continuity provision for ninety-nine years, which "
          "means all of us will be dead and so will anyone who cared.",
          v3="[flat, hollow] The window has closed. Nothing was transmitted. "
             "[beat] The finding is sealed under the continuity provision, for "
             "ninety-nine years. [beat] Which means all of us will be dead. And "
             "so will anyone who cared."),
        L("vogt",
          "Herr Nagel was collected at his flat at twenty past. There will be "
          "no charge. There will be an arrangement. The courier was allowed to "
          "board.",
          v3="[reciting, refusing to editorialise] Herr Nagel was collected at "
             "his flat at twenty past. [beat] There will be no charge. There "
             "will be an arrangement. [beat] The courier was allowed to board."),
        L("dorsey",
          "You did the adult thing, Examiner, and nobody is ever going to tell "
          "you so. Four families went to bed tonight not knowing there was a "
          "decision about them. That's the whole job. That was always the whole "
          "job.",
          v3="[gentle, grateful, and it is the most frightening thing he says] "
             "You did the adult thing, Examiner. And nobody is ever going to "
             "tell you so. [beat] Four families went to bed tonight not knowing "
             "there was a decision about them. [beat] That's the whole job. "
             "That was always the whole job."),
        L("frayne",
          "Gene, if you thank the examiner one more time I shall come to "
          "Virginia.",
          v3="[icy] Gene. If you thank the examiner one more time, I shall come "
             "to Virginia."),
        L("iris",
          "I have been given a copy. Personal use. Not to be reproduced. Forty "
          "years, and my inheritance is a file I am not allowed to show anyone.",
          v3="[very quiet, no anger left] I have been given a copy. Personal "
             "use. Not to be reproduced. [beat] Forty years. [beat] And my "
             "inheritance is a file I am not allowed to show anyone."),
        L("iris",
          "He killed a man to keep six names quiet and you have kept his name "
          "quiet to protect four more, and I cannot tell any longer whether "
          "that is the moral of the story or just the story repeating.",
          v3="[level, and it is an accusation] He killed a man to keep six "
             "names quiet. [beat] And you have kept his name quiet, to protect "
             "four more. [beat] And I cannot tell, any longer, whether that is "
             "the moral of the story. [beat] Or just the story repeating."),
        L("vogt",
          "Examiner. The carrier is still up. There is no modulation on it. "
          "There has been no modulation for six minutes.",
          v3="[quiet, uneasy] Examiner. The carrier is still up. [beat] There "
             "is no modulation on it. [beat] There has been no modulation for "
             "six minutes."),
        L("vogt",
          "It is simply open. As though something is waiting to see whether we "
          "will say anything at all.",
          v3="[almost a whisper] It is simply open. [beat] As though something "
             "is waiting. To see whether we will say anything at all."),
    ],
    ending_id="necessary_lie",
)

scene(
    "end_repeated", act=6, clock=0, amb="shortwave", ending=True,
    title="Ending: You Have Repeated 1983",
    lines=[
        L("vogt",
          "The window is open. The transmission is going out and I cannot stop "
          "it from this room.",
          v3="[fast, alarmed] The window is open. The transmission is going "
             "out. [beat] And I cannot stop it from this room."),
        L("meteo",
          "Achtung. Station four one seven. Wind, west, two. Cloud, overcast. "
          "Visibility, one. Pressure, one one four nine.",
          v3="[flat, metrical] Achtung. Station four one seven. [beat] Wind, "
             "west, two. Cloud, overcast. Visibility, one. Pressure, one one "
             "four nine."),
        L("meteo",
          "Courier confirmed. Blue key destroyed. Glasshouse closed.",
          v3="[flat, evenly spaced, mechanical] Courier confirmed. Blue key "
             "destroyed. Glasshouse closed.",
          fx="insert"),
        L("vogt",
          "The courier boarded at four minutes past. The case was opened at "
          "Erkner and the pad had already been burned. The archive was seized "
          "at half past under the continuity provision. I am told my access "
          "ends at midnight.",
          v3="[dead flat, reading a list of losses] The courier boarded at four "
             "minutes past. The case was opened at Erkner, and the pad had "
             "already been burned. [beat] The archive was seized at half past, "
             "under the continuity provision. [beat] I am told my access ends "
             "at midnight."),
        L("iris",
          "You named a person. You had four minutes and a room full of "
          "recordings, and you named a person, because that is what everybody "
          "does. That is what my father did to Willi Kroll.",
          v3="[quiet, and the quietness is worse than shouting] You named a "
             "person. [beat] You had four minutes, and a room full of "
             "recordings. And you named a person. [beat] Because that is what "
             "everybody does. [beat] That is what my father did to Willi "
             "Kroll."),
        L("frayne",
          "It is nineteen eighty-three again, and this time I watched it "
          "happen in real time, on a conference line, with the countdown "
          "showing. Good night, Examiner.",
          v3="[bitter, exhausted] It is nineteen eighty-three again. [beat] And "
             "this time I watched it happen in real time. On a conference line. "
             "With the countdown showing. [beat] Good night, Examiner."),
        L("vogt",
          "Examiner - the station has not closed down. It is still "
          "transmitting. This is not in tonight's schedule. This is new "
          "material.",
          v3="[sharp, frightened] Examiner - the station has not closed down. "
             "It is still transmitting. [beat] This is not in tonight's "
             "schedule. [beat] This is new material."),
        L("meteo",
          "Message follows. Review terminal, seven, four, one, nine. Examiner "
          "present. Examiner listening. Examiner logged.",
          v3="[flat, unhurried, exactly as neutral as the numbers] Message "
             "follows. [beat] Review terminal. Seven. Four. One. Nine. [beat] "
             "Examiner present. Examiner listening. [beat] Examiner logged."),
        L("meteo",
          "The forecast is memory. Ends.",
          v3="[flat] The forecast is memory. Ends."),
    ],
    ending_id="repeated",
)

scene(
    "s23b_rhythm_alt", act=3, clock=15, amb="workstation",
    title="The silences",
    lines=[
        L("iris",
          "I have been looking at the wrong part of the signal all evening. I "
          "have been looking at the sound.",
          v3="[slow, working it out live] I have been looking at the wrong part "
             "of the signal all evening. [beat] I have been looking at the "
             "sound."),
        L("iris",
          "My father's entire discipline was that sound can be forged and "
          "structure cannot. So measure the gaps. Eighty-one, eighty-three, "
          "tonight.",
          v3="[quick] My father's entire discipline was that sound can be "
             "forged, and structure cannot. [beat] So measure the gaps. "
             "Eighty-one. Eighty-three. Tonight."),
        L("iris",
          "Three beats. Two beats. Five beats. In every authentic transmission, "
          "in the silence between the phrases, for forty-five years.",
          v3="[flat, then unsteady] Three beats. Two beats. Five beats. [beat] "
             "In every authentic transmission. In the silence between the "
             "phrases. [beat] For forty-five years."),
        L("vogt", "Does three, two, five mean anything?",
          v3="[carefully] Does three, two, five mean anything?"),
        L("iris",
          "The third of the second, nineteen seventy-five. It's my birthday, "
          "Frau Vogt. He signed forty-five years of transmissions with my "
          "birthday and no one on either side ever thought to check the parts "
          "where nobody was talking.",
          v3="[holding it together by a thread] The third of the second, "
             "nineteen seventy-five. [beat] It's my birthday, Frau Vogt. [beat] "
             "He signed forty-five years of transmissions with my birthday. "
             "[beat] And no one, on either side, ever thought to check the "
             "parts where nobody was talking."),
    ],
    grants=["E15"], sets={"knows_rhythm": True},
    next="s19_hub_cipher",
)
