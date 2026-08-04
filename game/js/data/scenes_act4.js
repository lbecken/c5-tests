/* ACT IV — THE WEAPON IN THE CLOCK  (21:46 – 21:55) */
SCENES.push(

{
  id: 'S24',
  act: 4,
  title: 'Twenty-Two Kilohertz',
  clock: '21:46',
  env: 'echo',
  channel: 'radio',
  lines: [
    { sp: 'MIRA', t: '[sharp] Why is a police officer reading my medical file, Inspector?' },
    { sp: 'RAO', t: 'Because a man on my telephone says you die in a sealed room tonight with no wound anywhere on you, and I have run out of polite ways to get there.' },
    { sp: 'MIRA', t: '[a long pause] ...Then you don\'t want the medical file. You want the two thousand and nineteen file. They\'re the same file.' },
    { sp: 'MIRA', t: 'After the containment failure I had seizures. Temporal lobe. They didn\'t stop, and drugs didn\'t stop them. In twenty-twenty they put a responsive neurostimulator into my skull. It sits just here. It watches for the onset and it interrupts it, several hundred times a day, and I have had four years of an ordinary life because of it.' },
    { sp: 'RAO', t: 'How is it configured?' },
    { sp: 'MIRA', t: 'Over a short-range acoustic link. A technician holds a wand against my head and it talks to the device in a band just above hearing — it\'s how you avoid running a wire through the skin. There\'s nothing sinister about it, Inspector, half a million people—' },
    { sp: 'RAO', t: 'What band.' },
    { sp: 'MIRA', t: 'Twenty-two kilohertz.' },
    { sp: 'DECLAN', t: '[after a beat, very quietly] Doctor Sayegh. Would you say that number again.' },
    { sp: 'MIRA', t: '[slower] ...Twenty-two kilohertz. [pause] Why.' }
  ],
  evidence: ['E07'],
  sets: ['implant_known'],
  next: 'S25'
},

{
  id: 'S25',
  act: 4,
  title: 'A Very Good Loudspeaker',
  clock: '21:47',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'DECLAN', t: 'Right. Somebody stop me if I have this wrong, and I would genuinely love to have this wrong.' },
    { sp: 'DECLAN', t: 'There is an oscillator in that clock and it has been there since half past two this afternoon. And it does nothing. I\'ve had the feed for twenty-five minutes and it sits there doing absolutely nothing except tick and hum in the top of the band.' },
    { sp: 'LEONIE', t: '[fast, dawning] Because it isn\'t a clock crystal. A clock crystal free-runs — you switch it on and it goes. That thing is phase-referenced. It has nothing to lock to. There is nothing in that building for it to lock to until—' },
    { sp: 'RAO', t: 'Until ten o\'clock.' },
    { sp: 'LEONIE', t: 'Until phase lock. At phase lock the array hands it a reference and it does whatever it was built to do, and it does it through a brass case, in a room with acoustic tile on all six surfaces, which is—' },
    { sp: 'DECLAN', t: '—which is a very good loudspeaker in a very quiet box.' },
    { sp: 'MIRA', t: '[flat, over the radio, having heard all of it] And I will be standing in the middle of it. At that exact second. Because the procedure says I have to be.' },
    { sp: 'RAO', t: 'Doctor. You will not go anywhere near that room.' },
    { sp: 'MIRA', t: 'Inspector, if I don\'t, a hundred and forty megajoules—' },
    { sp: 'RAO', t: 'I have heard about the megajoules. I am going to hear about them at the inquest either way. [beat] Six — twelve minutes. Get me the person who put it in there.' }
  ],
  evidence: ['E21'],
  sets: ['mechanism_known'],
  next: 'S26'
},

{
  id: 'S26',
  act: 4,
  title: 'Four Screws',
  clock: '21:49',
  env: 'echo',
  channel: 'radio',
  lines: [
    { sp: 'RAO', t: 'Miss Hart. The maintenance docket in that door frame has your initials on it.' },
    { sp: 'LEONIE', t: '[immediately, no defence at all] Yes.' },
    { sp: 'RAO', t: 'Say the rest.' },
    { sp: 'LEONIE', t: 'This afternoon. About half two. I took the back off the clock. I replaced the timing crystal with a component I\'d been sent. I put the back on. I signed the docket. [flatly] Then I went downstairs and had a cheese sandwich.' },
    { sp: 'RAO', t: 'Sent by whom.' },
    { sp: 'LEONIE', t: 'Through the channel. A design file — forty bits a second, it took nine hours to come through and I sat with it the entire time like it was a kettle I was waiting on.' },
    { sp: 'LEONIE', t: 'The note said the phase reference was drifting and this would hold it, and that if it wasn\'t in before the next lock we\'d get a feedback event and lose the array and probably the hall. [her voice going] It was a good note. It was a really good note. It used my own variable names.' },
    { sp: 'RAO', t: 'Who sent it.' },
    { sp: 'LEONIE', t: '[barely] Jonah. Jonah sent it.' },
    { sp: 'RAO', t: '[after a moment] Six. She has just confessed to installing a murder weapon, on an open channel, in a building with nineteen people in it and eleven minutes on the clock. [beat] Your console. Tell me what to do with her.' }
  ],
  evidence: ['E12'],
  sets: ['leonie_confession'],
  choices: [
    {
      label: 'Arrest her. Get her out of the building.',
      hint: 'Clean, defensible, and she stops talking the moment she is cautioned.',
      next: 'S27A',
      sets: ['leonie_arrested']
    },
    {
      label: 'Keep her on the channel. Have her push the design file to Boyle.',
      hint: 'She is the only person who can hand you the thing itself.',
      next: 'S27B',
      sets: ['design_file_obtained', 'leonie_cooperating']
    },
    {
      label: 'Send her in. She put it in — she can take it out.',
      hint: 'The safest thing you can do to that room. It is not the safest thing you can do to tonight.',
      next: 'S27C',
      sets: ['leonie_in_studio']
    }
  ]
},

{
  id: 'S27A',
  act: 4,
  title: 'Cautioned',
  clock: '21:50',
  env: 'halcyon',
  channel: 'radio',
  requires: ['leonie_arrested'],
  sfx: [{ at: 1, id: 'door_release' }],
  lines: [
    { sp: 'RAO', t: 'Constable — Miss Hart goes to the lobby. Caution her on the way.' },
    { sp: 'LEONIE', t: '[receding, rising] No — no, I need to tell you what else was in the note—' },
    { sp: 'RAO', t: 'You\'ll tell a solicitor.' },
    { sp: 'LEONIE', t: 'There isn\'t time for a solicitor, there\'s ten minutes, there\'s TEN—' },
    { sp: 'OKAFOR', t: '[after the door] She\'s out. Lobby, two officers with her.' },
    { sp: 'RAO', t: '[a pause] Six. Log that as my order, not your advice. That\'s how it goes on the sheet and that\'s how it goes at the inquiry.' },
    { sp: 'DECLAN', t: 'For what it\'s worth, Inspector — I\'ve got her workstation open from here. If the file\'s on it, I\'ll have it without her. It\'ll just take me longer and I\'ll be ruder about it.' }
  ],
  sets: ['leonie_safe', 'design_file_obtained'],
  next: 'S28'
},

{
  id: 'S27B',
  act: 4,
  title: 'phaseref_v4',
  clock: '21:50',
  env: 'echo',
  channel: 'radio',
  requires: ['design_file_obtained'],
  lines: [
    { sp: 'LEONIE', t: '[fast, grateful to have a task] It\'s on my workstation. It\'s called phaseref underscore v four. I\'m pushing it to your desk now, Mister Boyle, it\'s small, it\'s tiny, it\'s—' },
    { sp: 'DECLAN', t: 'Got it. [pause] Oh, that\'s lovely work, that is. That\'s really— sorry. That was inappropriate.' },
    { sp: 'DECLAN', t: 'Right. It\'s a phase-referenced oscillator with a drive stage hung off the output. The output goes to a piezo element bonded to a brass plate. And there\'s a gate on the whole thing, and the gate opens on a coherence reference.' },
    { sp: 'RAO', t: 'In English, Mister Boyle.' },
    { sp: 'DECLAN', t: 'It sleeps. It sleeps for as long as you like. And then the machine downstairs tells it that it\'s ten o\'clock, and it screams — very high, very loud, and it keeps screaming for as long as the reference holds.' },
    { sp: 'LEONIE', t: '[tiny] ...At what frequency.' },
    { sp: 'DECLAN', t: 'Twenty-two point one kilohertz. [beat] I\'m sorry, Miss Hart.' },
    { sp: 'LEONIE', t: '[a sound, not quite a word]' }
  ],
  next: 'S28'
},

{
  id: 'S27C',
  act: 4,
  title: 'Ninety Seconds',
  clock: '21:50',
  env: 'studio',
  channel: 'radio',
  requires: ['leonie_in_studio'],
  sfx: [{ at: 8, id: 'door_release' }, { at: 46, id: 'relay_click' }],
  lines: [
    { sp: 'RAO', t: 'Miss Hart. You put it in. Can you get it out?' },
    { sp: 'LEONIE', t: 'Yes. Four screws and one connector. Ninety seconds. Less than that.' },
    { sp: 'RAO', t: 'Mister Okafor, open the door. Hart goes in alone.' },
    { sp: 'OKAFOR', t: 'Inspector — with respect — if that thing comes on while she\'s standing under it—' },
    { sp: 'RAO', t: 'She hasn\'t got a stimulator in her head, Mister Okafor.' },
    { sp: 'DECLAN', t: '[mildly] That we know of.' },
    { sp: 'RAO', t: 'Thank you, Declan.' },
    { sp: 'LEONIE', t: '[interior, close, breathing hard against the dead acoustic] I\'m at the clock. I\'ve got the case off. [pause] It\'s warm. Why is it warm, it shouldn\'t be warm, there\'s nothing in here drawing—' },
    { sp: 'RAO', t: 'Keep talking and keep working.' },
    { sp: 'LEONIE', t: 'Four screws — three — [effort] — two—' },
    { sp: 'LEONIE', t: '[stopping dead] ...Did everyone hear it do that?' },
    { sp: 'DECLAN', t: 'Yes. Keep going.' },
    { sp: 'LEONIE', t: '[a shaky breath, then a small hard click] It\'s out. It\'s in my hand. [beat] It\'s still warm.' },
    { sp: 'JONAH', t: '[cutting in, and for the first time genuinely frightened] What did you just do? What did she just DO — the corridor\'s— I can\'t— the door at the end of this corridor is not where it was—' }
  ],
  sets: ['crystal_removed', 'jonah_panicked'],
  next: 'S28'
},

{
  id: 'S28',
  act: 4,
  title: 'The Man Who Is Already Dead',
  clock: '21:52',
  env: 'control',
  channel: 'future_J',
  lines: [
    { sp: 'RAO', t: 'Mister Vale. The component in that clock reached Leonie Hart through your channel, with a note on it, over your name.' },
    { sp: 'JONAH', t: '[nothing]' },
    { sp: 'RAO', t: 'You told this room you didn\'t know how she dies.' },
    { sp: 'JONAH', t: 'I said I didn\'t know how. I didn\'t say I didn\'t know what.' },
    { sp: 'RAO', t: 'That is a lawyer\'s answer out of a man who has spent forty minutes saying he\'s trying to save her.' },
    { sp: 'JONAH', t: '[the change; low and level and finally honest] Do you want to know what my Wednesday looks like, Inspector? [beat] I don\'t have one.' },
    { sp: 'JONAH', t: 'In the night you are all so determined to protect — she lives. She walks out of Studio B at four minutes past ten and she is magnificent. She stands up in front of the board on the Thursday and she tells them every single thing, and on the Monday they start taking Echo apart.' },
    { sp: 'JONAH', t: 'They do it in the wrong order. There is a containment failure in the array hall at eleven forty on the Tuesday morning. Six people. [flat] I\'m in the second group, by the north stair. I\'m the one they find last.' },
    { sp: 'RAO', t: 'You\'re eleven hours ahead of me, Mister Vale. Next Tuesday is a week past the end of you.' },
    { sp: 'JONAH', t: '[quietly] Yes. I don\'t remember dying, Inspector. Nobody remembers dying.' },
    { sp: 'JONAH', t: 'It reached me the way everything reaches anybody in that building now. Eleven hours at a time, hand to hand, back down a line of people who were all trying to warn somebody about something. By the time it got as far as Wednesday morning it was four sentences and a list of names, and mine was the fourth one.' },
    { sp: 'JONAH', t: 'I had eleven hours. Eleven hours of being a man who has been told, and one channel forty bits wide, and I used it.' },
    { sp: 'RAO', t: 'You used it to kill her.' },
    { sp: 'JONAH', t: 'I used it to not be dead. [beat] You keep saying murder because you are standing in the version where she\'s still alive.' },
    { sp: 'RAO', t: 'I am standing in the only version there is.' },
    { sp: 'JONAH', t: '[quietly] No. You\'re not. And that is the one thing in this building that I know for certain and not one of you does.' }
  ],
  evidence: ['E13'],
  sets: ['jonah_motive', 'jonah_confessed'],
  next: 'S28B'
},

{
  id: 'S28B',
  act: 4,
  title: 'Provenance',
  clock: '21:53',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'DECLAN', t: 'Inspector, while everybody was having that conversation I did something boring, and I\'d like to read it out because it is the single worst thing I have found tonight.' },
    { sp: 'DECLAN', t: 'The shutdown procedure. The one that says Doctor Sayegh has to be stood at that desk at twenty-two hundred hours exactly. It was revised eight weeks ago. Revision four.' },
    { sp: 'MIRA', t: '[over the radio] By me. With Hart. I told you.' },
    { sp: 'DECLAN', t: 'No, Doctor. You accepted it. There\'s a difference and it\'s all over the document metadata. Revision four didn\'t come off anyone\'s desk in that building. It came in through the channel on the ninth of June and it was handed to you as a stabilisation update.' },
    { sp: 'MIRA', t: '[a long silence]' },
    { sp: 'RAO', t: 'Say what that means, Mister Boyle. Plainly.' },
    { sp: 'DECLAN', t: 'It means somebody put a weapon in a room, and then wrote the piece of paper that would walk her into it, and then had that piece of paper delivered by a friend of hers so she\'d never think to check it. [beat] The clock is only half of it. The other half is that she volunteers.' },
    { sp: 'MIRA', t: '[very quietly] ...I have been arguing for eight weeks with anyone who tried to keep me out of that room. I thought it was courage.' },
    { sp: 'RAO', t: 'And the rest of it. Grant. Okafor. Clear them or don\'t.' },
    { sp: 'DECLAN', t: 'Cleared, both. Grant\'s shredding order is an audit dodge — funding annexe, ministry on Thursday, squalid and criminal and nothing whatever to do with a clock. And Mister Okafor edited a door log to hide a couple of hours this evening he\'d rather nobody knew about, which was idiotic, and which is also the only independent proof anybody has of when that clock started running.' },
    { sp: 'RAO', t: '[flat] Wonderful. Two liars and neither of them is any use to me.' },
    { sp: 'OKAFOR', t: '[quietly] I\'m still outside the door, Inspector.' },
    { sp: 'RAO', t: 'I know you are, Emeka. Stay there.' }
  ],
  evidence: ['E22', 'E04'],
  sets: ['procedure_traced', 'grant_resolved', 'okafor_resolved'],
  next: 'S29'
},

{
  id: 'S29',
  act: 4,
  title: 'The Build Stamp',
  clock: '21:54',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'DECLAN', t: 'Inspector. I\'ve been through that design file properly now and I need to tell you something, and I need you to let me get to the end of it before you react.' },
    { sp: 'DECLAN', t: 'Every toolchain leaves a stamp on what it builds. Compiler version, machine identifier, build time. It\'s the dullest end of forensics and it never lies, because nobody ever remembers it\'s there.' },
    { sp: 'DECLAN', t: 'This file was built on Leonie Hart\'s workstation.' },
    { sp: 'RAO', t: 'Then she has been—' },
    { sp: 'DECLAN', t: 'Let me get to the end of it. [beat] It was built on her machine at oh seven forty-one tomorrow morning.' },
    { sp: 'LEONIE', t: '[barely audible] ...That\'s not — I haven\'t —' },
    { sp: 'DECLAN', t: 'No. You haven\'t. [gently] You will.' },
    { sp: 'RAO', t: 'Put that in words I can write in a statement, Mister Boyle.' },
    { sp: 'DECLAN', t: 'Tomorrow morning, twenty to eight, Leonie Hart sits down at that desk and works out what she installed this afternoon. She reverse-engineers it off the bench, and she writes it up properly, because that is what she does when she is frightened. And then it goes back down the channel — hop by hop, eleven hours at a time, the way everything in this case travels — until it lands on her desk this morning. And she installs it.' },
    { sp: 'RAO', t: 'Then who designed it.' },
    { sp: 'DECLAN', t: '[a long pause] Nobody, Inspector. That\'s what I\'m telling you. It hasn\'t got an author. It\'s only got a circumference.' },
    { sp: 'JONAH', t: '[quietly, from the other line] I told her it was mine. [beat] It seemed kinder than the truth.' }
  ],
  evidence: ['E16'],
  sets: ['bootstrap_known'],
  next: 'S30'
},

{
  id: 'S30',
  act: 4,
  title: 'Not On Purpose',
  clock: '21:55',
  env: 'control',
  channel: 'future_J',
  lines: [
    { sp: 'DISPATCH', t: 'Six — third call. Same extension. Forty-four.' },
    { sp: 'DECLAN', t: '[checking, then stopping] Pre-echo is forty-one milliseconds. Forty-one, dead on. [beat] Inspector, that\'s his signature. Whoever this is, they are calling from his night.' },
    { sp: 'FLEONIE', t: '[slow, hollowed out, none of the present Leonie\'s speed] It\'s Leonie. It\'s— I know. I know exactly how that sounds. She\'s standing next to you. I remember standing next to me.' },
    { sp: 'FLEONIE', t: 'It\'s twenty past eight in the morning here and I\'ve been awake for twenty-six hours and I have just come off the telephone to a very kind man called Boyle who wanted to talk to me about a build stamp.' },
    { sp: 'FLEONIE', t: 'I want to say something to her. To me. Is she— can she hear this?' },
    { sp: 'LEONIE', t: '[a whisper] I\'m here.' },
    { sp: 'FLEONIE', t: '[a very long pause] ...You did it, love. Not on purpose. But your hands.' },
    { sp: 'FLEONIE', t: 'And there is going to be a moment tonight where somebody offers you a way to have not done it. And you\'re going to take it. [beat] I need you to know that it doesn\'t work. I have tried it from this end all night long and it does not come out.' },
    { sp: 'RAO', t: 'Miss Hart. Listen to me. The design. Where did you get it.' },
    { sp: 'FLEONIE', t: 'This morning? I worked it out. Off the bench, in about four hours. [beat] And then I gave it to Jonah. Because he asked me for it, and he said he needed it for the inquiry.' },
    { sp: 'FLEONIE', t: '[quietly] He wasn\'t lying, was he. He just never said which inquiry.' }
  ],
  evidence: ['E11'],
  sets: ['future_leonie_heard', 'signature_matched'],
  next: 'S31'
}

);
