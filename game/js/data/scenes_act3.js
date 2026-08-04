/* ACT III — COMPETING TOMORROWS  (21:31 – 21:45) */
SCENES.push(

{
  id: 'S15',
  act: 3,
  title: 'The Second Caller',
  clock: '21:32',
  env: 'control',
  channel: 'future_M',
  lines: [
    { sp: 'DISPATCH', t: '[tense] Six — line six is still open and you have a second call arriving on the same extension. Forty-four again.' },
    { sp: 'DECLAN', t: 'That isn\'t possible, the line\'s in use, you can\'t have two—' },
    { sp: 'FMIRA', t: '[narrow, cold, unhurried] Analyst. Don\'t talk. Listen, and don\'t waste it, because I have paid a great deal for these seconds. My name is Mira Sayegh and I am calling you from tomorrow afternoon. Wednesday, about four.' },
    { sp: 'FMIRA', t: 'Whatever the man on your other line has asked you to do — do the opposite of it. He is not trying to save me. He needs me dead tonight, because I am the only person who will ever give the order to take this thing apart.' },
    { sp: 'RAO', t: 'Doctor Sayegh is forty metres below me. I am looking at her on a monitor.' },
    { sp: 'FMIRA', t: '[a small pause] Yes. I remember. [flatly] I remember standing in the array hall while a Scottish policewoman said that about me.' },
    { sp: 'FMIRA', t: 'So here is your night, Inspector. You will save me. You will be extremely pleased with yourselves and there will be a photograph. And nine weeks after that, the channel widens past its design bound and this city begins receiving telephone calls that it cannot answer.' },
    { sp: 'RAO', t: 'Nine weeks. You said you were eighteen hours away.' },
    { sp: 'FMIRA', t: 'I am. I know about the nine weeks because an hour ago I took a call from a woman with my voice who was standing a great deal further away than I am. It walks backwards, Inspector — eleven hours at a time, hand to hand, and by the time it reaches you it has been through six people. [beat] It doesn\'t stop, Inspector. That\'s the thing nobody has told you yet. It doesn\'t stop.' },
    { sp: 'FMIRA', t: 'Saving me is necessary. It is not sufficient. Echo has to be collapsed cold — and I don\'t manage it, because by the time I understand that, the only man still holding the phase key is under six metres of concrete. [beat] I haven\'t watched that happen. She told me. The one standing further out.' },
    { sp: 'RAO', t: 'Which man.' },
    { sp: 'FMIRA', t: '[flat] The one on your other line.' }
  ],
  evidence: ['E10'],
  sets: ['future_mira_arrives', 'phase_key_exists'],
  next: 'S16'
},

{
  id: 'S16',
  act: 3,
  title: 'Homework',
  clock: '21:35',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'DECLAN', t: '[fast, unusually serious] Right. I want to say this before anybody makes a decision, because I think it changes what all of you are doing.' },
    { sp: 'DECLAN', t: 'Your first caller knew the Inspector\'s call sign. He knew the substation, to the second. And the woman just now — she knew the Inspector said "I am looking at her on a monitor." She said she remembered it. She said that about four seconds after it was said.' },
    { sp: 'RAO', t: 'Then she\'s listening to this room now.' },
    { sp: 'DECLAN', t: 'No. No, that\'s the wrong shape entirely. She isn\'t listening. She\'s remembering. Which means she read it. [beat] Where does everything on that console go?' },
    { sp: 'DISPATCH', t: 'The incident log.' },
    { sp: 'DECLAN', t: 'And how long does an incident log live?' },
    { sp: 'DISPATCH', t: 'Seven years.' },
    { sp: 'DECLAN', t: '[quiet] So by half past eight tomorrow morning, every single thing Six types tonight is an exhibit. Timestamped. In a file, with her name on it, and his name on it, and every question anybody thought to ask.' },
    { sp: 'RAO', t: '...They\'re reading our paperwork.' },
    { sp: 'DECLAN', t: 'They\'re reading tonight\'s paperwork tomorrow morning and telephoning it back at us. That is not prophecy, Inspector. That\'s homework.' },
    { sp: 'JONAH', t: '[cutting in, tight] I was going to tell you that.' },
    { sp: 'DECLAN', t: '[dry] Course you were.' },
    { sp: 'RAO', t: 'Six. If he\'s working from the log, then he knows what you ask and when you ask it. He\'s answered you early twice. [beat] So get off the script. Your console, your call — but make it something the log can\'t have.' }
  ],
  evidence: ['E20'],
  sets: ['log_leak_known'],
  choices: [
    {
      label: 'Say nothing. Hold the line open for thirty seconds.',
      hint: 'The log records that you spoke. Do not speak.',
      next: 'S17A',
      sets: ['went_silent']
    },
    {
      label: 'Ask him exactly what he is expecting. See how comfortable he gets.',
      hint: 'Let him think the night is running to plan.',
      next: 'S17B',
      sets: ['stayed_on_script']
    }
  ]
},

{
  id: 'S17A',
  act: 3,
  title: 'Thirty Seconds of Nothing',
  clock: '21:37',
  env: 'control',
  channel: 'future_J',
  silenceIntro: 11,
  requires: ['went_silent'],
  lines: [
    { sp: 'JONAH', t: '[after a long silence] ...Six?' },
    { sp: 'JONAH', t: 'You\'re there. The line\'s open, I can hear the room. I can hear the rain on your window.' },
    { sp: 'JONAH', t: '[a laugh with nothing in it] All right. At twenty-one thirty-seven you ask me whether the ventilation duct can be reached from the roof space. You always ask about the duct, you ask it at thirty-seven, and I say—' },
    { sp: 'JONAH', t: '[stops]' },
    { sp: 'JONAH', t: '[very quietly] ...You didn\'t ask.' },
    { sp: 'RAO', t: 'Say that again, Mister Vale.' },
    { sp: 'JONAH', t: '[unsteady] The corridor I\'m standing in is going to change. I don\'t know by how much. I don\'t— [breath] I don\'t know how much of it I get to keep.' },
    { sp: 'DECLAN', t: '[softly] There it is.' },
    { sp: 'RAO', t: 'That\'s your proof, Six. He isn\'t describing tomorrow. He\'s bidding for it.' }
  ],
  evidence: ['E10'],
  sets: ['branch_proven', 'jonah_rattled'],
  next: 'S18'
},

{
  id: 'S17B',
  act: 3,
  title: 'On Time',
  clock: '21:37',
  env: 'control',
  channel: 'future_J',
  requires: ['stayed_on_script'],
  lines: [
    { sp: 'JONAH', t: '[smooth, warm with relief] Yes — twenty-one thirty-seven, the ventilation duct. No. It\'s grilled at both ends and it dog-legs twice; you could not get a cat through it, let alone a person. [beat] Thank you. You\'re on time.' },
    { sp: 'RAO', t: 'On time for what?' },
    { sp: 'JONAH', t: '[catching himself] For the shift. It\'s a long night, Inspector, that\'s all I—' },
    { sp: 'DECLAN', t: 'Inspector, mark that. He has just thanked her for being punctual about a question.' },
    { sp: 'RAO', t: 'Six, that\'s the same proof by the other road. It\'s a script, and we have been reading it to him beautifully.' },
    { sp: 'JONAH', t: '[pressing on, expansive now] Then let me save you some of it. The maintenance docket taped inside the Studio B door frame — don\'t waste your minutes on it. It\'s routine. Every clock in that building gets one.' },
    { sp: 'DECLAN', t: '[very flat] Nobody has mentioned a docket to you.' },
    { sp: 'JONAH', t: '[beat] ...It\'s in the log.' },
    { sp: 'RAO', t: 'It\'s in tomorrow\'s log, Mister Vale. It went into tonight\'s eleven minutes ago. [pause] Six — put a ring round that clock.' }
  ],
  evidence: ['E10'],
  sets: ['branch_proven', 'jonah_trust', 'clock_flagged'],
  next: 'S18'
},

{
  id: 'S18',
  act: 3,
  title: 'Two Signatures',
  clock: '21:40',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'DECLAN', t: 'I\'ve been doing something extremely dull for six minutes and it has paid off, so nobody interrupt me.' },
    { sp: 'DECLAN', t: 'Both calls carry a pre-echo. A ghost of the first syllable, sitting slightly ahead of the syllable. That\'s the reconstruction guessing before the residue lands — it\'s the model getting impatient.' },
    { sp: 'DECLAN', t: 'Vale\'s ghost sits forty-one milliseconds ahead. Every utterance, every time, forty-one. Sayegh\'s sits at sixty-eight.' },
    { sp: 'RAO', t: 'And that means?' },
    { sp: 'DECLAN', t: 'The interval is fixed by the coherence state of the array at the moment of sending. Different interval, different phase state. And a different phase state is a—' },
    { sp: 'LEONIE', t: '[breaking in, overlapping, urgent] —a different night. They\'re not from the same tomorrow. They can\'t be, it\'s not a matter of opinion. [fast] Oh. Oh, that isn\'t two people disagreeing about what happened. That\'s two worlds disagreeing about what\'s going to.' },
    { sp: 'RAO', t: 'Can you tell me which one is the real one.' },
    { sp: 'LEONIE', t: 'Neither of them is real yet. That\'s the entire—' },
    { sp: 'DECLAN', t: 'That\'s the entire problem, yes.' },
    { sp: 'RAO', t: '[after a moment] Six. Log it in plain words so a jury could read it. Two callers. Two futures. Both of them want something from this room.' }
  ],
  evidence: ['E11'],
  sets: ['multiple_branches'],
  next: 'S19'
},

{
  id: 'S19',
  act: 3,
  title: 'Twenty Minutes',
  clock: '21:41',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'RAO', t: 'Twenty minutes. [beat] Two more, Six, and then I want you looking at that room and nothing else.' }
  ],
  hub: {
    pick: 2,
    prompt: 'Two channels. Choose.',
    options: [
      { label: 'Private channel — Okafor. He asked for fewer ears.', next: 'S20' },
      { label: 'Private channel — Rao. She has been carrying something all night.', next: 'S21' },
      { label: 'Array hall — Hart. Ask her how this actually started.', next: 'S22' }
    ],
    after: 'S23'
  }
},

{
  id: 'S20',
  act: 3,
  title: 'Half Seven This Evening',
  clock: '21:42',
  env: 'halcyon',
  channel: 'radio',
  lines: [
    { sp: 'OKAFOR', t: 'You gave me fewer ears. I\'ll take that as a kindness and pay for it. [pause] This evening. Nineteen twenty.' },
    { sp: 'OKAFOR', t: 'I opened Studio B. Doctor Sayegh went in ahead of me. I closed the door behind us both, and we were in that room for fifty minutes.' },
    { sp: 'RAO', t: 'Doing what.' },
    { sp: 'OKAFOR', t: '[long pause] Talking. And then not talking. [flat] I am forty-nine days divorced, Inspector. She is my employer. There is a clause in my contract about it and there is a clause in hers.' },
    { sp: 'OKAFOR', t: 'An hour later I took the entry out of the access log. It took me four minutes and it is the most stupid thing I have done in eleven years of this work.' },
    { sp: 'RAO', t: 'You\'ve made yourself the only human being who could have done this.' },
    { sp: 'OKAFOR', t: 'Yes. I understood that at about half past nine tonight, when a man on the telephone said the door log would be clean. [quietly] I have been standing outside that room since, trying to decide when to say it.' },
    { sp: 'OKAFOR', t: '[a shift] Inspector — one other thing, and I only have it because I was in there. The clock. When we were in that room at half seven tonight, the clock was ticking.' },
    { sp: 'RAO', t: 'Clocks do.' },
    { sp: 'OKAFOR', t: 'That one hadn\'t run in six years. I know, because I put it in a facilities report in twenty twenty-one and nobody ever came.' }
  ],
  evidence: ['E08', 'E25'],
  sets: ['okafor_secret', 'okafor_resolved', 'clock_started'],
  hubReturn: true
},

{
  id: 'S21',
  act: 3,
  title: 'What She Asked For',
  clock: '21:42',
  env: 'halcyon',
  channel: 'radio',
  lines: [
    { sp: 'RAO', t: '[private channel, lower] Six. Before you get it from somebody with worse manners.' },
    { sp: 'RAO', t: 'Two thousand and nineteen. There was a containment failure in the array hall downstairs. Official finding: one injured, one fatality, contractor error, file closed in eleven weeks.' },
    { sp: 'RAO', t: 'The injured party was Doctor Sayegh. The fatality was a plant engineer called Tomas Rao. He was thirty-four.' },
    { sp: 'RAO', t: '[even] He was my brother, and we had not spoken in two years, which is a thing I would very much like to undo and can\'t.' },
    { sp: 'RAO', t: 'I asked for this posting. In writing. Three times. So when I sound like a woman who wants this building shut and the doors welded — that\'s because I am one.' },
    { sp: 'RAO', t: 'I\'m telling you because you are the one signing the log tonight. If this goes badly, somebody in a warm room is going to ask whether the officer in charge was impartial. [beat] She wasn\'t. She was competent. They are not the same thing, but tonight they\'ll have to do.' }
  ],
  evidence: ['E23'],
  sets: ['rao_brother'],
  hubReturn: true
},

{
  id: 'S22',
  act: 3,
  title: 'Can You Hear Me',
  clock: '21:42',
  env: 'echo',
  channel: 'radio',
  lines: [
    { sp: 'LEONIE', t: '[quiet, wrung out] You\'ll get this out of me eventually. I\'d rather it was now, and I\'d much rather it was to you than to her.' },
    { sp: 'LEONIE', t: 'In March I ran the channel on my own at three in the morning, which you are not supposed to do. Thirty seconds of reach. Four words. I sent "Can you hear me" thirty seconds into my own past, into a receiver I was sitting directly in front of.' },
    { sp: 'LEONIE', t: 'And thirty seconds before I sent it, the receiver produced four words.' },
    { sp: 'RAO', t: 'The same four words.' },
    { sp: 'LEONIE', t: '[a long pause] No. It said: "Yes. I always did."' },
    { sp: 'LEONIE', t: '[faster, cracking] And it wasn\'t my voice. It wasn\'t anyone\'s voice I have ever enrolled, and I have enrolled all fourteen of them personally. There is no profile in that system that produces that sound.' },
    { sp: 'LEONIE', t: 'I sat in that room until half past five in the morning. And then I wrote it up as a reconstruction artifact, and I filed it, and I never told one living person. [beat] Everything that has happened tonight is downstream of me deciding not to be embarrassed.' }
  ],
  evidence: ['E24'],
  sets: ['first_cause_known'],
  hubReturn: true
},

{
  id: 'S23',
  act: 3,
  title: 'The Room Without Anyone In It',
  clock: '21:44',
  env: 'studio',
  channel: 'studio_feed',
  lines: [
    { sp: 'DECLAN', t: 'Six. I\'ve put the Studio B feed on your console and left it live. Room\'s empty, door\'s shut, nothing is happening in there at all.' },
    { sp: 'DECLAN', t: 'And there is something sitting in the top of that band that I cannot put a name to.' },
    { sp: 'DECLAN', t: '[carefully] I\'m not going to tell you what I think it is, because if I say it first then everything you find afterwards is suggestion, and some barrister with good hair will say so in eight months\' time. [beat] You\'ve got the same tools I have. Isolate the band. Slow it down. Lift the quiet end.' },
    { sp: 'DECLAN', t: 'Go on. I\'ll wait. It\'s not as though I\'m going anywhere.' }
  ],
  analysis: {
    id: 'studio_alias',
    prompt: 'Studio B — live feed. Find what is in the room.',
    goal: 'Isolate the high band and lift the quiet detail.',
    require: ['isolate_high', 'boost'],
    optional: ['slow'],
    onSolve: 'S23_SOLVED',
    onSkip: 'S24'
  }
},

{
  id: 'S23_SOLVED',
  act: 3,
  title: 'Something Checking the Time',
  clock: '21:45',
  env: 'studio',
  channel: 'studio_feed',
  lines: [
    { sp: 'DECLAN', t: '[genuinely delighted, then not] There. There it is. Hear it?' },
    { sp: 'DECLAN', t: 'That is a fold-down. Something above the top of your hearing being mirrored back down into it by the sampling — an alias. Which means there is something above the top of your hearing, and it is in that room, and it is running right now.' },
    { sp: 'DECLAN', t: 'And underneath it — wait for it — there. That tick. That is not the escapement. An escapement is a bit of bent metal and it wanders; it never lands twice in the same place. That thing is arriving on the same sample every single time. That\'s a relay. That is a circuit waking up and checking the time.' },
    { sp: 'RAO', t: 'Checking the time for what.' },
    { sp: 'DECLAN', t: '[quietly] For twenty-two hundred, I should think.' },
    { sp: 'RAO', t: 'Okafor. Nobody opens that door. Not you, not me, not her. [beat] Six — we have got fifteen minutes and I think we have just found the murder weapon hanging above the door where everyone could see it.' }
  ],
  evidence: ['E06'],
  sets: ['ultrasonic_alias_found', 'mechanism_hint'],
  next: 'S24'
}

);
