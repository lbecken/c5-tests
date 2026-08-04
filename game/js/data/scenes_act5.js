/* ACT V — CHOOSE THE FUTURE  (21:56 – 22:00) and the three endings */
SCENES.push(

{
  id: 'S31',
  act: 5,
  title: 'Four Steps',
  clock: '21:56',
  env: 'control',
  channel: 'future_M',
  sfx: [{ at: 74, id: 'packet_loss' }],
  lines: [
    { sp: 'FMIRA', t: '[fast now, the coldness gone] Analyst. I have about ninety seconds of coherence and then I stop, and I would like to spend them usefully for once in my life.' },
    { sp: 'FMIRA', t: 'You\'ve found the clock. Good. Now hear the part I got wrong and paid for.' },
    { sp: 'FMIRA', t: 'Taking the crystal out does not save anything. It saves me. It does not save the city, because the machine keeps running, and in nine weeks it will not need a clock or a crystal or a room.' },
    { sp: 'FMIRA', t: 'There is a cold collapse. It\'s in the commissioning file, it has been sitting there since before any of us, and it is four steps. Write them down.' },
    { sp: 'FMIRA', t: 'One. Drop the secondary loop to atmosphere. Two. Open the interlock at the analogue desk — yes, that room, there is no way around that and I am sorry. Three. Hold the array at reference through the lock window. Do not let it free-run. It has to be held while it comes down. Four. Pull the reference. Cold.' },
    { sp: 'RAO', t: 'And step three needs what.' },
    { sp: 'FMIRA', t: 'Step three needs the phase key. Sixteen digits, it changes at every lock, and I have not got it. In my night I never think to ask him for it, and by the following Tuesday there is nobody left to ask.' },
    { sp: 'FMIRA', t: '[urgent] Analyst, listen. He will not give that key to a room that is trying to save me. He has spent his entire night making certain this room does not exist.' },
    { sp: 'FMIRA', t: '[packet loss, breaking up] —I don\'t know how much longer this branch is— [distortion] —you have to make him think he has won—' },
    { sp: 'DECLAN', t: '[after silence] She\'s gone. That wasn\'t her hanging up.' }
  ],
  evidence: ['E17'],
  sets: ['collapse_sequence', 'collapse_understood'],
  next: 'S32'
},

{
  id: 'S32',
  act: 5,
  title: 'Sixteen Digits',
  clock: '21:57',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'RAO', t: 'Three minutes. [flatly] He is the only person alive — or otherwise — with that key, and he will only hand it to a room that is letting her die.' },
    { sp: 'DECLAN', t: 'So we tell him the room is letting her die.' },
    { sp: 'RAO', t: 'You want me to lie to a man to talk him into deleting himself.' },
    { sp: 'DECLAN', t: 'I want a hundred and forty megajoules to still be in a hole in the ground at five past ten, Inspector. I\'m not fussy about how.' },
    { sp: 'RAO', t: '[a beat] Six. It\'s your console and it\'s your voice on the log. I\'m not ordering this one.' }
  ],
  choices: [
    {
      label: 'Tell him we are standing down. Let him think he has won.',
      hint: 'He will believe you. That is the worst part of it.',
      next: 'S32A',
      sets: ['chose_deception']
    },
    {
      label: 'Tell him the truth and ask him for it anyway.',
      hint: 'He is a frightened man, not a monster. Ask him.',
      next: 'S32B',
      sets: ['chose_honesty']
    }
  ]
},

{
  id: 'S32A',
  act: 5,
  title: 'What He Wanted to Hear',
  clock: '21:58',
  env: 'control',
  channel: 'future_J',
  requires: ['chose_deception'],
  lines: [
    { sp: 'RAO', t: '[reading off the console, carefully neutral] Mister Vale. We\'re standing down. The perimeter holds where it is and Doctor Sayegh proceeds with the shutdown as written.' },
    { sp: 'JONAH', t: '[an enormous breath out] ...Thank you. Thank you. [unsteady] I know what that cost. I do know.' },
    { sp: 'RAO', t: 'The shutdown as written needs the array held at reference through the window. She hasn\'t got the key for it. If she free-runs the lock she takes the hall out and there\'s no Wednesday for anybody, yours included.' },
    { sp: 'JONAH', t: '[a pause. weighing it. wanting it to be true] ...Yes. Yes, she would need to hold it. She never did remember to ask for it.' },
    { sp: 'JONAH', t: 'Four. Seven. Two. Two. Nine. One. Zero. Six. Three. Three. Eight. Five. Four. Zero. One. Nine.' },
    { sp: 'JONAH', t: '[quieter] Tell her— [stops] ...No. Don\'t tell her anything. She\'d know it was me.' },
    { sp: 'DECLAN', t: '[flat, after a moment] Sixteen digits. Checksum\'s good. It\'s real.' },
    { sp: 'RAO', t: '[very quietly] Log the exact wording of that, Six. Every word of it, both sides. [beat] Somebody is going to want to read what we said to him.' }
  ],
  sets: ['phase_key_obtained'],
  next: 'S33'
},

{
  id: 'S32B',
  act: 5,
  title: 'Asking',
  clock: '21:58',
  env: 'control',
  channel: 'future_J',
  requires: ['chose_honesty'],
  lines: [
    { sp: 'RAO', t: 'Mister Vale. I\'m going to be straight with you, because I don\'t believe anybody has been tonight, including us.' },
    { sp: 'RAO', t: 'We can put her in that room, hold the array at reference and bring the whole thing down cold. Nobody dies in this building. But it needs your key. And if we use it, your night stops. All of it. You, that corridor, the woman who telephoned us at twenty past eight. It doesn\'t happen.' },
    { sp: 'RAO', t: 'I\'m asking you for it anyway.' },
    { sp: 'JONAH', t: '[a very long silence; only the rain]' },
    { sp: 'JONAH', t: '[thick] ...You\'re asking me to hand you the thing that un-happens me.' },
    { sp: 'RAO', t: 'Yes.' },
    { sp: 'JONAH', t: 'I\'ve got a nephew. He\'s eleven. He\'s in the version where I\'m alive, he\'s asleep about four streets from here, and in yours he just... has a different Tuesday. And nobody tells him.' },
    { sp: 'RAO', t: 'I know.' },
    { sp: 'JONAH', t: '[breaking, and then hardening through it] ...No. [pause] No. I\'m sorry. I have been dead once already this week and I am not going to do it politely.' },
    { sp: 'DECLAN', t: '[after the click] He\'s gone. Line six isn\'t dead, it\'s just — it isn\'t anything.' },
    { sp: 'RAO', t: '[a long breath] Right. Then we do it without him. Six — two minutes and no key.' }
  ],
  sets: ['phase_key_refused', 'jonah_gone'],
  next: 'S33'
},

{
  id: 'S33',
  act: 5,
  title: 'On the Record',
  clock: '21:58',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'RAO', t: 'Six. Before I give an order that either gets a woman killed or doesn\'t, I need what you\'ve got. Four parts, on the record, in your own words. This is the bit that ends up read out in front of a coroner.' },
    { sp: 'RAO', t: 'How does she die. Whose hands put it there. Who meant it. And what in God\'s name these telephone calls actually are.' },
    { sp: 'RAO', t: '[beat] Ninety seconds. Go.' }
  ],
  accusation: true,
  next: 'S34'
},

/* ── verdict inserts, chosen by accusation accuracy ─────────────────── */

{
  id: 'VERDICT_STRONG',
  act: 5, title: 'It Will Hold', clock: '21:59', env: 'control', channel: 'direct',
  lines: [
    { sp: 'RAO', t: '[reading it back, steady] For the record. At twenty-one fifty-eight the analyst on duty gave me the following. Method — an oscillator concealed in the Studio B wall clock, triggered by the experiment itself at phase lock, lethal by way of the doctor\'s implant. Hands — Leonie Hart, without knowledge of what she was holding. Intent — Jonah Vale.' },
    { sp: 'RAO', t: 'And the calls are four different tomorrows, arguing about which one of them is allowed to happen.' },
    { sp: 'RAO', t: '[beat] I have read a great many of these. That one is going to hold.' }
  ],
  next: 'S34'
},
{
  id: 'VERDICT_PARTIAL',
  act: 5, title: 'It Will Do for Tonight', clock: '21:59', env: 'control', channel: 'direct',
  lines: [
    { sp: 'RAO', t: '[reading it back] ...Right. That\'s most of it.' },
    { sp: 'RAO', t: 'It isn\'t all of it, and the piece you\'ve got wrong is exactly the piece a barrister goes looking for first, because it\'s the piece that makes the rest of it optional.' },
    { sp: 'RAO', t: '[beat] It\'ll do for tonight. It will not do in March. Stand by.' }
  ],
  next: 'S34'
},
{
  id: 'VERDICT_WEAK',
  act: 5, title: 'Something to Act On', clock: '21:59', env: 'control', channel: 'direct',
  lines: [
    { sp: 'RAO', t: '[a pause] ...Six. I am going to log that the analyst on duty provided a theory, and I am not going to log what it was.' },
    { sp: 'RAO', t: 'That isn\'t unkindness. That\'s me keeping your name out of a transcript that gets read out loud.' },
    { sp: 'RAO', t: '[hard] Now give me something to act on in the next forty seconds, or I act on nothing — and nothing has a body attached to it.' }
  ],
  next: 'S34'
},

{
  id: 'S34',
  act: 5,
  title: 'Twenty-Two Hundred in Sixty Seconds',
  clock: '21:59',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'RAO', t: 'Right. Sixty seconds. Last thing, Six, and it\'s the only one that ever mattered.' },
    { sp: 'RAO', t: 'What do we do.' }
  ],
  choices: [
    {
      label: 'Stand down. She runs the shutdown as written.',
      hint: 'The procedure is the procedure. It is also the trap.',
      next: 'END1_2200',
      sets: ['ending_1']
    },
    {
      label: 'Pull her out. Nobody goes through that door tonight.',
      hint: 'She lives. The machine keeps running.',
      next: 'END2_2200',
      sets: ['ending_2']
    },
    {
      label: 'Protected shutdown — full sequence, hold at reference. And take this console off the log.',
      hint: 'Everything, at once, in the dark. It needs the sequence and the key, and it needs tonight to leave no record for them to read.',
      requiresAll: ['collapse_sequence', 'phase_key_obtained'],
      lockedHint: 'You do not have both halves. One future gave you the sequence; the other still has the key.',
      next: 'END3_GODARK',
      sets: ['ending_3', 'go_dark']
    }
  ]
},

/* ── ENDING 1 — THE PREDICTED MURDER ────────────────────────────────── */

{
  id: 'END1_2200',
  act: 6,
  title: 'Twenty-Two Hundred',
  clock: '22:00',
  env: 'studio',
  channel: 'studio_feed',
  ending: 1,
  sfx: [{ at: 40, id: 'phase_lock' }, { at: 44, id: 'kill_tone' }, { at: 52, id: 'body_fall' }],
  lines: [
    { sp: 'TANNOY', t: '[distant, through the door] Phase lock in sixty seconds.' },
    { sp: 'MIRA', t: '[close, in the dead room] I\'m at the desk. Secondary loop is open. Interlock is open. [pause] It is very quiet in here.' },
    { sp: 'RAO', t: 'Doctor—' },
    { sp: 'MIRA', t: 'It\'s quite all right, Inspector. It\'s a little late to start being sentimental about it now.' },
    { sp: 'TANNOY', t: 'Ten. Nine. Eight.' },
    { sp: 'MIRA', t: '[lighter, almost amused] Analyst. Six, is it? [beat] Thank you for taking it seriously. Most people wouldn\'t have.' },
    { sp: 'TANNOY', t: 'Three. Two. One. Phase lock.' },
    { sp: 'MIRA', t: '[a small sound; nothing dramatic at all]' },
    { sp: 'OKAFOR', t: '[hammering on the door, distant] Open it — open the door — OPEN IT—' },
    { sp: 'DECLAN', t: '[very quietly] ...The clock\'s stopped.' },
    { sp: 'RAO', t: '[after a long silence] Time of death, twenty-two hundred hours. [flat] Log it, Six.' }
  ],
  next: 'END1_STING'
},
{
  id: 'END1_STING',
  act: 6, title: 'Breakfast', clock: '08:17', env: 'dead', channel: 'future_J', ending: 1,
  lines: [
    { sp: 'JONAH', t: '[warm, rested, entirely at peace] Six. I don\'t know whether you\'ll ever hear this. [a small laugh] I think you will, actually. I think it\'s in the log.' },
    { sp: 'JONAH', t: 'I wanted to say thank you. You did exactly what I remembered you doing. Every bit of it, right down to the pause before you answered.' },
    { sp: 'JONAH', t: '[a breath] I\'m having breakfast. That\'s all. That\'s the whole of what I wanted to tell you. I\'m sitting down and I\'m having breakfast.' },
    { sp: 'JONAH', t: 'It\'s stopped raining.' }
  ],
  terminal: true
},

/* ── ENDING 2 — THE WORSE TOMORROW ──────────────────────────────────── */

{
  id: 'END2_2200',
  act: 6,
  title: 'An Empty Room',
  clock: '22:00',
  env: 'halcyon',
  channel: 'radio',
  ending: 2,
  sfx: [{ at: 30, id: 'phase_lock' }, { at: 34, id: 'kill_tone' }],
  lines: [
    { sp: 'RAO', t: 'Get her out. Now. Bodily if you have to.' },
    { sp: 'OKAFOR', t: 'I have her. Doctor — walk. Walk with me.' },
    { sp: 'MIRA', t: '[furious, being moved] Inspector, the array — if it free-runs the lock without a hold on the reference—' },
    { sp: 'RAO', t: 'Then the array can have a bad night. I\'ve had one.' },
    { sp: 'TANNOY', t: 'Phase lock.' },
    { sp: 'DECLAN', t: '[after] ...It went off. Twenty-two hundred exactly, full drive, into an empty room, for about four seconds. If she\'d been standing at that desk she\'d be on the floor.' },
    { sp: 'RAO', t: 'And the array.' },
    { sp: 'MIRA', t: '[breathing hard; alive; reading a screen] ...Holding. It\'s holding. It free-ran the window and it came through it. [a shaky laugh] It\'s fine. Everything is fine.' },
    { sp: 'RAO', t: '[letting the breath out] Then that is a good night\'s work, and I\'ll take it.' },
    { sp: 'MIRA', t: '[slowly, not quite with her] ...Yes.' },
    { sp: 'MIRA', t: '[quieter] It\'s still running, Inspector.' }
  ],
  next: 'END2_STING'
},
{
  id: 'END2_STING',
  act: 6, title: 'Nine Weeks', clock: '—', env: 'control', channel: 'direct', ending: 2,
  sfx: [{ at: 6, id: 'switchboard' }],
  lines: [
    { sp: 'DISPATCH', t: '[strained] Control — line one. Line four. Line— Six, I have got seven calls on the board and not one of them has a number attached to it.' },
    { sp: 'FMIRA', t: '[thin, layered, distant] —this is Sayegh, the date here is the fourteenth of—' },
    { sp: 'FLEONIE', t: '[overlapping, further off] —please, whoever is listening, I don\'t know when you are—' },
    { sp: 'DISPATCH', t: 'They\'re all giving different dates. Six, they\'re all giving different dates.' },
    { sp: 'RAO', t: '[distant, exhausted] ...How many.' },
    { sp: 'DISPATCH', t: '[after a beat] It\'s still climbing.' }
  ],
  terminal: true
},

/* ── ENDING 3 — THE NARROW DOOR ─────────────────────────────────────── */

{
  id: 'END3_GODARK',
  act: 6,
  title: 'Off the Log',
  clock: '21:59',
  env: 'control',
  channel: 'direct',
  ending: 3,
  lines: [
    { sp: 'RAO', t: 'Off the log. [beat] Six. You understand what you\'re asking me to authorise. If this goes wrong, there is no record that this room ever knew anything.' },
    { sp: 'DECLAN', t: 'And if it goes right there\'s no record either, Inspector. That is rather the entire point. They are reading it. [simply] So stop writing it.' },
    { sp: 'RAO', t: '[a long pause] ...Control, note by hand, on paper, in ink: at twenty-one fifty-nine the incident log for this console is suspended by my order. Not the analyst\'s. Mine.' },
    { sp: 'DISPATCH', t: '[quietly] Noted. Console six is dark.' },
    { sp: 'RAO', t: 'Right. Doctor Sayegh — you\'re going in, and I want you to know that I\'ve been trying to close this building for six years and I would rather you came out of it.' }
  ],
  next: 'END3_2200'
},
{
  id: 'END3_2200',
  act: 6,
  title: 'Cold',
  clock: '22:00',
  env: 'studio',
  channel: 'studio_feed',
  ending: 3,
  sfx: [{ at: 26, id: 'phase_lock' }, { at: 30, id: 'held_tone' }, { at: 50, id: 'collapse' }],
  lines: [
    { sp: 'MIRA', t: '[close, in the room] Secondary loop is open to atmosphere. Interlock open. Ready on the reference.' },
    { sp: 'DECLAN', t: 'Key going in. Four, seven, two, two, nine, one, zero, six, three, three, eight, five, four, zero, one, nine.' },
    { sp: 'TANNOY', t: 'Phase lock in ten.' },
    { sp: 'MIRA', t: 'Holding.' },
    { sp: 'MIRA', t: '[strained, over a rising tone] It\'s— it is fighting me, it wants to run, it wants to—' },
    { sp: 'DECLAN', t: 'Hold it. Hold it. Hold—' },
    { sp: 'MIRA', t: '[a breath, into total silence] ...It\'s cold. [pause] It\'s cold, and it\'s down.' },
    { sp: 'OKAFOR', t: 'Door\'s open. She\'s walking out. She\'s walking out on her own.' },
    { sp: 'DECLAN', t: '[oddly, after a long pause] Inspector. The recordings.' },
    { sp: 'RAO', t: 'What about them.' },
    { sp: 'DECLAN', t: 'Line six. The first call, the substation, all of it. It\'s noise. [quietly] I have forty-seven minutes of a man\'s voice on a disk in front of me and it is turning into weather.' }
  ],
  next: 'END3_STING'
},
{
  id: 'END3_STING',
  act: 6, title: 'I Was Here', clock: '22:04', env: 'dead', channel: 'direct', ending: 3,
  sfx: [{ at: 22, id: 'last_packet' }],
  lines: [
    { sp: 'RAO', t: '[not to anyone in particular] Did we just save a life.' },
    { sp: 'RAO', t: '[beat] Or did we just spend a few thousand of them we\'re never going to meet.' },
    { sp: 'DECLAN', t: '[after a silence] ...I don\'t know, Inspector. I only do the audio.' },
    { sp: 'CHILD', t: '[tiny, through packet loss, from nothing at all] I was here.' }
  ],
  terminal: true
}

);
