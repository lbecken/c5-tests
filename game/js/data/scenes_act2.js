/* ACT II — THE PROTECTED VICTIM  (21:20 – 21:31) */
SCENES.push(

{
  id: 'S07',
  act: 2,
  title: 'The Director',
  clock: '21:22',
  env: 'echo',
  channel: 'radio',
  lines: [
    { sp: 'MIRA', t: '[tired, precise] Inspector. I\'m told a man has telephoned to say I\'ll be dead in thirty-eight minutes. I\'d like to be efficient about this, because I have a machine to take apart.' },
    { sp: 'RAO', t: 'You\'ll be taking it apart from the other side of the road.' },
    { sp: 'MIRA', t: 'No.' },
    { sp: 'RAO', t: 'Doctor—' },
    { sp: 'MIRA', t: '[overlapping, level] There are a hundred and forty megajoules sitting in a superconducting loop under your feet, Inspector, and it is held there by a timing array that has been running continuously for nine years. If you cut the power to this building, that energy does not politely stay where it is. It comes out through the array, and the array runs under the Coupure, and the Coupure has houses on it.' },
    { sp: 'MIRA', t: 'At twenty-two hundred the array reaches phase lock. It\'s a coherence window about four seconds wide. I initiate a controlled collapse inside that window, or I wait eleven hours for the next one — and I am not leaving this thing running for another eleven hours. Not after tonight.' },
    { sp: 'RAO', t: 'Then do it from your control room.' },
    { sp: 'MIRA', t: 'There is exactly one console in this building that is not referenced to Echo\'s own clock, and it is the analogue desk in Studio B — because it was wired in nineteen sixty-one by men who had never heard of us. [beat] That is not sentiment. It\'s the only interlock the machine cannot lie to.' },
    { sp: 'RAO', t: 'Who wrote that procedure?' },
    { sp: 'MIRA', t: '[without hesitation] I did. With Hart. Eight weeks ago.' }
  ],
  evidence: ['E04'],
  sets: ['shutdown_requirement'],
  next: 'S08'
},

{
  id: 'S08',
  act: 2,
  title: 'Studio B, Clean',
  clock: '21:26',
  env: 'studio',
  channel: 'radio',
  sfx: [{ at: 3, id: 'door_release' }],
  lines: [
    { sp: 'OKAFOR', t: 'Kingfisher, Okafor. I\'m opening Studio B. The log will show this and I want that on the record before I touch it.' },
    { sp: 'OKAFOR', t: '[interior, close, dead acoustic] Six metres by four. Acoustic tile, floor to ceiling — you can hear it eating my voice. One door, reinforced. No windows. Ventilation duct, hundred and fifty millimetre, grilled at both ends, I can get two fingers through it.' },
    { sp: 'OKAFOR', t: 'Analogue desk. Forty channels. There\'s dust sitting on the faders. Two microphones — one on a boom arm to the left, one fixed on the desk. Emergency telephone on the wall, handset in the cradle where it should be.' },
    { sp: 'RAO', t: 'Anything on the surfaces.' },
    { sp: 'OKAFOR', t: 'Nothing. It isn\'t wiped clean, it\'s just... not used. [pause] There\'s a wall clock above the door. Brass case, about so big. It is comfortably the loudest thing in here.' },
    { sp: 'RAO', t: 'The loudest thing in a soundproofed room.' },
    { sp: 'OKAFOR', t: 'Yes, ma\'am.' },
    { sp: 'DECLAN', t: '[remote] Mister Okafor — do me a kindness and stop moving for ten seconds. I\'d like the room without you in it.' },
    { sp: 'DECLAN', t: '[after] ...Lovely. That is going straight on the record and I may frame it.' },
    { sp: 'OKAFOR', t: 'One more thing. There\'s a maintenance docket taped inside the door frame. Wall clock, recalibration. Signed today. Initials L. H.' }
  ],
  evidence: ['E03', 'E05'],
  sets: ['studio_baseline', 'clock_docket', 'studio_feed_available'],
  next: 'S09'
},

{
  id: 'S09',
  act: 2,
  title: 'Reconstruction',
  clock: '21:28',
  env: 'echo',
  channel: 'radio',
  lines: [
    { sp: 'LEONIE', t: '[fast, wound tight] You want to know whether the voice is real. The answer is no, and I\'m afraid that doesn\'t help you at all.' },
    { sp: 'LEONIE', t: 'The channel carries about forty bits a second. Forty. You cannot put a human voice through forty bits a second. You can\'t put a fax through forty bits a second.' },
    { sp: 'RAO', t: 'And yet.' },
    { sp: 'LEONIE', t: 'And yet. Because it doesn\'t send the voice. It sends the residue — pitch contour, timing, a phoneme index, about a sentence\'s worth of shape — and then my model builds the rest of it back out of a stored profile.' },
    { sp: 'RAO', t: 'A profile of what?' },
    { sp: 'LEONIE', t: 'Of the speaker. Of that specific speaker. I have to have modelled you in advance — forty hours of clean audio, minimum. If I haven\'t, you don\'t come through badly. You come through as... [searching] ...as weather.' },
    { sp: 'RAO', t: 'Who is enrolled?' },
    { sp: 'LEONIE', t: 'Everyone on the project. It\'s in the ethics annexe, it was all consented, we sat in a booth for a week reading out newspapers. [pause] Fourteen people.' },
    { sp: 'RAO', t: 'So whoever is telephoning us—' },
    { sp: 'LEONIE', t: '[quiet] Is one of fourteen people, all of whom work in this building. Yes. I worked that out in the lift on the way up and I have not been enjoying it since.' }
  ],
  evidence: ['E19'],
  sets: ['enrollment_known', 'channel_understood'],
  next: 'S10'
},

{
  id: 'S10',
  act: 2,
  title: 'Twenty Minutes Gone',
  clock: '21:29',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'RAO', t: 'Right. He said forty-seven minutes. We\'re twenty into it and I have three people queuing to tell you three different stories.' },
    { sp: 'RAO', t: 'Six — pick two. I\'d like to say pick all three, but I\'ve been doing this a long time and we will not get the chance.' }
  ],
  hub: {
    pick: 2,
    prompt: 'Two channels. Choose.',
    options: [
      { label: 'Line 6 — Vale. Get his account of the morning.', next: 'S11' },
      { label: 'Array hall — Sayegh. Ask what she is not saying.', next: 'S12' },
      { label: 'Security — Okafor. Put the door log to him.', next: 'S13' }
    ],
    after: 'S14'
  }
},

{
  id: 'S11',
  act: 2,
  title: 'The Morning After',
  clock: '21:30',
  env: 'control',
  channel: 'future_J',
  lines: [
    { sp: 'JONAH', t: 'You want my morning. [exhales] All right.' },
    { sp: 'JONAH', t: 'I woke at six because every phone in my flat was going. By seven the Institute was full of your people. At about eight they let me as far as the corridor outside Studio B, and the door was standing open, and there was a photographer in there.' },
    { sp: 'JONAH', t: 'She\'s on the floor at the foot of the console. There\'s blood on the near microphone, on the boom arm — she went into it on the way down. [flatly] There is no wound. That\'s the part nobody could account for. No wound, no marks, nothing broken, door log clean, and the room sealed since half past two yesterday afternoon.' },
    { sp: 'RAO', t: 'Then what makes it a murder and not a stroke?' },
    { sp: 'JONAH', t: 'Because I know who put her in that room.' },
    { sp: 'RAO', t: 'Who?' },
    { sp: 'JONAH', t: '[a beat too long] ...The procedure did. The shutdown procedure. She followed it exactly and it killed her, and everybody stood in that corridor calling it an accident.' },
    { sp: 'RAO', t: '[slowly] The procedure she says she wrote herself.' },
    { sp: 'JONAH', t: '[recovering, brisk] Inspector, I have four minutes of line left and you want to talk about paperwork. Get her out of the building.' }
  ],
  evidence: ['E02'],
  sets: ['jonah_account', 'blood_detail', 'procedure_hint'],
  hubReturn: true
},

{
  id: 'S12',
  act: 2,
  title: 'Three Weeks Ago',
  clock: '21:30',
  env: 'echo',
  channel: 'radio',
  lines: [
    { sp: 'RAO', t: 'Doctor. Is this the first time your machine has telephoned anybody?' },
    { sp: 'MIRA', t: '[a long pause] No.' },
    { sp: 'RAO', t: 'Go on.' },
    { sp: 'MIRA', t: 'Three weeks ago. The fourth, ten past two in the morning. The Studio B extension rang through to my office, which it should not be able to do. A woman\'s voice told me the secondary coolant loop would fail on the Thursday at around six, and that I should look at valve nine.' },
    { sp: 'MIRA', t: 'I looked at valve nine. The seat was cracked through. I replaced it. Nothing whatever happened on Thursday.' },
    { sp: 'RAO', t: 'And you didn\'t report it.' },
    { sp: 'MIRA', t: '[dry, bitter] To whom, Inspector? "The machine telephoned me in the night and I did as I was told." I have spent six years assuring a board that this project is not dangerous.' },
    { sp: 'MIRA', t: '[quieter] I recognised the voice.' },
    { sp: 'RAO', t: 'Whose was it?' },
    { sp: 'MIRA', t: 'Mine.' }
  ],
  evidence: ['E15'],
  sets: ['mira_prior_call'],
  hubReturn: true
},

{
  id: 'S13',
  act: 2,
  title: 'The Door Log',
  clock: '21:30',
  env: 'halcyon',
  channel: 'radio',
  lines: [
    { sp: 'RAO', t: 'The Studio B access log. This afternoon, this evening, all of it.' },
    { sp: 'OKAFOR', t: 'It\'s clean.' },
    { sp: 'RAO', t: 'Emeka.' },
    { sp: 'OKAFOR', t: '[flat] The log is accurate.' },
    { sp: 'DECLAN', t: '[remote, apologetic] It\'s really not, though. Sorry. I\'ve got the file up. Sequence numbers run contiguous, which is what he\'d want you to look at — but the write timestamps don\'t. There\'s a rewrite at nineteen twenty this evening and something came out of the middle of it.' },
    { sp: 'RAO', t: 'Mister Okafor.' },
    { sp: 'OKAFOR', t: '[very long pause] I would like to answer that when there are fewer people on the channel.' },
    { sp: 'RAO', t: 'There is a woman in this building who has thirty minutes to live and you are negotiating about privacy.' },
    { sp: 'OKAFOR', t: '[low, controlled] I am aware of the time, Inspector. I have been aware of the time since twenty past nine.' }
  ],
  sets: ['okafor_evasive'],
  hubReturn: true
},

{
  id: 'S14',
  act: 2,
  title: 'For the File',
  clock: '21:31',
  env: 'control',
  channel: 'voicemail',
  lines: [
    { sp: 'DECLAN', t: '[remote] While everyone\'s being candid. I\'ve pulled the Institute\'s voicemail store — the warrant\'s in, don\'t look at me in that tone of voice. There\'s one from Monday you\'ll want.' },
    { sp: 'GRANT', t: '[voicemail, polished, unhurried] Elias Grant, Monday, for the file. Regarding the ministry audit on Thursday — I want the funding annexe and the whole of the two thousand and nineteen correspondence off the servers before anybody from the ministry sits down at a terminal. Not archived. Off.' },
    { sp: 'GRANT', t: 'If Mira wants a fight about disclosure she may certainly have one. She can have it without documents. [pause] And the board does not need to hear the phrase "human trials" again. Not from her, and not from you.' },
    { sp: 'RAO', t: 'Human trials.' },
    { sp: 'DECLAN', t: 'That\'ll be the voice enrollment, most likely. Fourteen people reading out newspapers for a week.' },
    { sp: 'RAO', t: '[dry] Or it won\'t.' }
  ],
  evidence: ['E09'],
  sets: ['grant_motive'],
  next: 'S15'
}

);
