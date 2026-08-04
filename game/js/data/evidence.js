/* Evidence ledger.
 *
 * `seems` is what the notebook shows when the item is first logged.
 * `means` is revealed once the linked flag is set — usually much later, and
 * usually it inverts the first reading. Mandatory items are reachable on the
 * shared spine; optional items add motive, colour and ending quality only.
 */
const EVIDENCE = {
  E01: {
    title: 'The substation prediction',
    seems: 'He named the failure eighteen seconds before it happened. He is genuinely speaking from a later time.',
    means: 'It authenticates the channel. It says nothing whatever about his honesty, and he is counting on you to confuse the two.',
    unlock: 'jonah_motive', mandatory: true
  },
  E02: {
    title: 'Blood on the near microphone',
    seems: 'She was attacked. Something violent happened in that room.',
    means: 'There is no wound. She goes into the boom arm on the way down, and the blood is the only mark on her — which is why, in his branch, everybody in that corridor called it a stroke and went home.',
    unlock: 'mechanism_known', mandatory: true
  },
  E03: {
    title: 'Studio B is sealed and clean',
    seems: 'No weapon, no attacker, no way in. Whatever he is describing cannot happen.',
    means: 'Nothing has to get in. The weapon was hung above the door six decades ago and only the timing crystal inside it is new.',
    unlock: 'mechanism_known', mandatory: true
  },
  E04: {
    title: 'She must be at the desk at phase lock',
    seems: 'A stubborn woman walking into the room she has been warned about.',
    means: 'It is the whole plan. Put the weapon in the room, then write the document that makes her stand in front of it, then have it handed to her by someone she trusts.',
    unlock: 'procedure_traced', mandatory: true
  },
  E25: {
    title: 'The clock started running this afternoon',
    seems: 'A detail dragged out of a man protecting an affair.',
    means: 'It had not worked since 2021. Whatever went into it this afternoon did not just change the timing — it woke the thing up. Okafor\'s worst night is also the only independent date-stamp on the sabotage.',
    unlock: 'mechanism_known', mandatory: false
  },
  E18: {
    title: 'Caller ID: Halcyon extension 44',
    seems: 'Someone inside the building is making these calls. It is a hoax run from an office upstairs.',
    means: 'Echo\'s receiver is wired into Halcyon\'s legacy trunk. A transmission from tomorrow dials out on the institute\'s own line. The calls come from inside the building because they have nowhere else to come from.',
    unlock: 'channel_understood', mandatory: true
  },
  E19: {
    title: 'Enrolled speaker profiles',
    seems: 'A technical footnote about how the compression model reconstructs speech.',
    means: 'Forty bits a second cannot carry a voice. The model rebuilds it from a stored profile. If Halcyon never modelled you, you arrive as noise — so every caller tonight, from every tomorrow, is Halcyon staff. It is a closed circle of suspects.',
    unlock: 'enrollment_known', mandatory: true
  },
  E20: {
    title: 'They are reading the console log',
    seems: 'The caller knows things about this shift he could not know.',
    means: 'This console autologs every call, replay, request and order. The log survives the night in every branch. By tomorrow morning it is an exhibit, and he has read it. He does not have second sight. He has your paperwork.',
    unlock: 'log_leak_known', mandatory: true
  },
  E10: {
    title: 'A caller remembers something you did not do',
    seems: 'One of them is lying about what happened tonight.',
    means: 'You departed from the log, so the branch he is speaking from is no longer the future of this room. They are not describing tomorrow. They are bidding for it.',
    unlock: 'branch_proven', mandatory: true
  },
  E11: {
    title: 'Two phase signatures',
    seems: 'Inconsistent pre-echo intervals — a sign of forgery, or of two different recordings.',
    means: 'Pre-echo is set by the array\'s coherence state at the moment of sending. Different intervals mean different phase states mean different tomorrows. And Leonie\'s call carries Jonah\'s interval to the millisecond: she is calling from his branch.',
    unlock: 'signature_matched', mandatory: true
  },
  E05: {
    title: 'The clock was recalibrated this afternoon',
    seems: 'Routine maintenance on a sixty-year-old wall clock, seven hours ago.',
    means: 'The only physical change to a sealed room in the fortnight before a murder in it — made seven hours before the murder, by the one person nobody would question about a clock.',
    unlock: 'mechanism_known', mandatory: true
  },
  E06: {
    title: 'An alias tone under the studio feed',
    seems: 'Equipment noise. Old room, old wiring.',
    means: 'A fold-down of something above the audible band, and a relay tick that is not the clock\'s escapement. The trigger circuit is already running, waiting for phase lock.',
    unlock: 'mechanism_known', mandatory: true, requiresAnalysis: true
  },
  E07: {
    title: 'Mira\'s neurostimulator',
    seems: 'Medical background. She had a seizure disorder after the 2019 incident.',
    means: 'It is configured over a short-range acoustic link just above hearing. It is the reason a sound can be a murder weapon, and the reason it can only be a murder weapon aimed at her.',
    unlock: 'mechanism_known', mandatory: true
  },
  E21: {
    title: 'The method',
    seems: '—',
    means: 'A phase-referenced oscillator in the clock takes its reference from the array at phase lock, drives the brass casing as a transducer, and floods the room with the implant\'s telemetry band. No weapon, no attacker, no open door. The experiment pulls its own trigger.',
    unlock: 'mechanism_known', mandatory: true
  },
  E12: {
    title: 'Leonie installed the crystal',
    seems: 'She had the access, the skill and the opportunity. She is the killer.',
    means: 'She is the hands. She was sent a design file through the channel with a note calling it a stabiliser, and she believed it, because it came from someone she trusted and it arrived by the only route she thought was safe.',
    unlock: 'leonie_confession', mandatory: true
  },
  E22: {
    title: 'The shutdown procedure came through the channel',
    seems: 'A safety revision. The reason Mira has to be in that room at 22:00.',
    means: 'Nobody at Halcyon wrote it. It arrived eight weeks ago through Echo and was handed to Mira as a stabilisation update. He did not only put a weapon in the room — he wrote the reason she would walk into it and had it delivered by a friend.',
    unlock: 'procedure_traced', mandatory: true
  },
  E13: {
    title: 'Jonah dies in the dismantling',
    seems: 'A tragic footnote to a branch that no longer exists.',
    means: 'In his tomorrow, Mira lives, exposes Echo and orders it taken apart. Containment fails during the work. Six people die and he is one of them. Everything he has told you tonight is a man refusing to be dead.',
    unlock: 'jonah_motive', mandatory: true
  },
  E16: {
    title: 'The build stamp',
    seems: 'The design file was authored on Leonie\'s toolchain. She has been lying from the start.',
    means: 'The stamp is dated eleven hours from now. She has not written it yet. She will write it tomorrow, from the installation, working backwards — and hand it to Jonah, who starts it back down the chain until it reaches her this morning. The design has no author. It only has a circumference.',
    unlock: 'bootstrap_known', mandatory: true
  },
  E17: {
    title: 'Collapse needs two futures',
    seems: 'Only one of these callers can be telling the truth.',
    means: 'Neither of them has the whole thing. She has the sequence and no phase key; he has the key and will not give it to anyone trying to save her. A cold collapse needs both, which means it needs you to lie to one of them.',
    unlock: 'collapse_understood', mandatory: false
  },
  E08: {
    title: 'A falsified door event',
    seems: 'The head of security edited the access log for Studio B. He let something in, or he was in there himself.',
    means: 'He deleted a nineteen-twenty entry to conceal that he and Mira were together in that room two hours ago. He has been covering an affair, badly, all evening, and it has made him look like the only person who could have done it.',
    unlock: 'okafor_resolved', mandatory: false
  },
  E09: {
    title: 'Grant\'s voicemail',
    seems: 'A board member authorising the destruction of Echo\'s data. Institutional conspiracy.',
    means: 'He was arranging to shred a funding trail before an audit. It is criminal and it is squalid and it has nothing to do with the murder. He would have been delighted by tonight and he did not cause it.',
    unlock: 'grant_resolved', mandatory: false
  },
  E15: {
    title: 'Mira has done this before',
    seems: 'She is a hypocrite — she took a call from the future and acted on it while telling you not to.',
    means: 'Three weeks ago she was warned about a coolant failure and quietly fixed it. Nobody died and there is no record. The loop predates tonight, everyone in this building has already bent causality once, and she is the only one who admits it.',
    unlock: null, mandatory: false
  },
  E23: {
    title: 'The 2019 containment incident',
    seems: 'The accident that gave Mira her implant.',
    means: 'It also killed Rao\'s brother. She requested this posting. She has been standing in a building she has wanted to close down for six years, taking orders from you.',
    unlock: null, mandatory: false
  },
  E24: {
    title: '"Can you hear me?"',
    seems: 'The first successful test. Four words, thirty seconds into the past.',
    means: 'The reply did not come back in her voice. She logged it as an artifact, buried it, and kept testing. Every call tonight is downstream of a woman who was too frightened of her own result to report it.',
    unlock: null, mandatory: false
  }
};

/* The four questions the accusation board asks, and the defensible answer. */
const ACCUSATION = {
  method: {
    prompt: 'How does she die?',
    options: {
      crystal: 'A phase-referenced oscillator in the wall clock, triggered by phase lock',
      intruder: 'Someone is already hidden inside Studio B',
      poison:   'A delayed-onset agent administered before she enters',
      electrical: 'A remote attack through the studio console',
      unknown:  'Insufficient evidence'
    },
    correct: 'crystal',
    supports: ['E05', 'E06', 'E07', 'E21']
  },
  hands: {
    prompt: 'Who physically put it there?',
    options: {
      leonie: 'Leonie Hart',
      okafor: 'Emeka Okafor',
      grant:  'Elias Grant',
      mira:   'Mira Sayegh herself',
      jonah:  'Jonah Vale, in person'
    },
    correct: 'leonie',
    supports: ['E12', 'E05']
  },
  architect: {
    prompt: 'Who intended it?',
    options: {
      jonah:  'Jonah Vale',
      fmira:  'Future Mira',
      leonie: 'Leonie Hart',
      grant:  'Elias Grant',
      nobody: 'No single actor — the loop has no author'
    },
    correct: 'jonah',
    // 'nobody' is the half-right answer: true of the design, false of the murder.
    partial: 'nobody',
    supports: ['E13', 'E22', 'E16']
  },
  calls: {
    prompt: 'What are the calls?',
    options: {
      branches: 'Competing future branches, each bidding to become real',
      prophecy: 'One fixed future, correctly foreseen',
      staged:   'Recordings staged by someone in the building',
      single:   'One mutable future, revising itself',
      sim:      'A simulation or test of the emergency service'
    },
    correct: 'branches',
    supports: ['E10', 'E11', 'E20']
  }
};
