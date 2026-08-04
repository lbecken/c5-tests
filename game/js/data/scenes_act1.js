/* ACT I — THE IMPOSSIBLE WARNING  (21:13 – 21:20)
 *
 * Scene fields:
 *   env      ambience preset in audio.js: control | halcyon | studio | echo | dead
 *   channel  processing on the dialogue bed: direct | phone | radio | future_J |
 *            future_M | voicemail | studio_feed
 *   sfx      one-shot procedural effects fired at a time offset (seconds)
 *   lines    [{sp, t}] — t carries ElevenLabs v3 performance tags in [brackets],
 *            which are stripped for subtitles
 */
SCENES.push(

{
  id: 'S01',
  act: 1,
  title: 'Line Six',
  clock: '21:13',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'DISPATCH', t: '[brisk, low] Six — I\'m pushing something to your console. Line six. Male, adult, landline. He won\'t give a location.' },
    { sp: 'DISPATCH', t: 'He\'s not distressed. That\'s what I don\'t like about him. He isn\'t distressed, he\'s... reading.' },
    { sp: 'RAO', t: '[off-mic, dry] Reading what?' },
    { sp: 'DISPATCH', t: 'A statement, ma\'am. He says there\'s going to be a murder.' },
    { sp: 'RAO', t: 'Then he\'s not a witness, he\'s a suspect. [closer] Six — take it. Record from the top. Everything on that console is evidence from the moment you open the line.' },
    { sp: 'DISPATCH', t: 'Putting him through to you now.' }
  ],
  sets: ['shift_open'],
  next: 'S02'
},

{
  id: 'S02',
  act: 1,
  title: 'The Man Who Called',
  clock: '21:13',
  env: 'control',
  channel: 'future_J',
  lines: [
    { sp: 'JONAH', t: '[controlled, fast] My name is Jonah Vale. V, A, L, E. I\'m a systems engineer at the Halcyon Institute on the Coupure. Please don\'t interrupt me — I have about ninety seconds of usable line and I can\'t get it back.' },
    { sp: 'JONAH', t: 'At twenty-two hundred hours tonight, Doctor Mira Sayegh will die inside Studio B at the Institute. The room will be sealed. There will be nobody in it with her.' },
    { sp: 'JONAH', t: '[quieter] I\'m not threatening her. I\'m telling you what happened.' },
    { sp: 'RAO', t: 'What happened.' },
    { sp: 'JONAH', t: 'Yes.' },
    { sp: 'RAO', t: 'You\'re using the past tense about something forty-seven minutes from now.' },
    { sp: 'JONAH', t: '[a breath] Because where I am it\'s Wednesday. It\'s eight seventeen in the morning and it has stopped raining. [beat] Is Detective Inspector Rao on this line? Kingfisher. Her call sign is Kingfisher, and I know that isn\'t in the phone book.' }
  ],
  evidence: [],
  sets: ['first_call'],
  next: 'S03'
},

{
  id: 'S03',
  act: 1,
  title: 'Eighteen Seconds',
  clock: '21:15',
  env: 'control',
  channel: 'future_J',
  sfx: [{ at: 26, id: 'transformer' }],
  lines: [
    { sp: 'RAO', t: '[flat, cold] Where did you get that.' },
    { sp: 'JONAH', t: 'From the incident log. Your incident log. The one that\'s being written right now, in that room, by the person I\'m talking to.' },
    { sp: 'RAO', t: 'That is not an answer that helps you.' },
    { sp: 'JONAH', t: 'No. Here\'s one that does. [steadier] In about eighteen seconds the Sint-Baafs substation is going to drop. You\'ll hear it before it reaches your board — it\'s mechanical, there\'s an arc, and it is loud. Your lights will dip and come back. The Institute stays up, because the Institute is on its own supply.' },
    { sp: 'JONAH', t: '[counting, almost gentle] Fourteen. Twelve.' },
    { sp: 'DISPATCH', t: '[uneasy] Six, is he giving us a—' },
    { sp: 'JONAH', t: 'Three. Two.' },
    { sp: 'RAO', t: '[after the blast, very quietly] ...All right.' },
    { sp: 'RAO', t: 'He\'s asking for me by a call sign four people know. Six — your console, your decision. Do I talk to him, or do you?' }
  ],
  evidence: ['E01'],
  sets: ['prediction_verified'],
  choices: [
    {
      label: 'Put DI Rao on the line.',
      hint: 'She will push him harder than you can. He may give up detail. He may also close up.',
      next: 'S04A',
      sets: ['rao_direct']
    },
    {
      label: 'Keep him with me. Tell Rao to work the room instead.',
      hint: 'He is talking to you and nobody else. That is worth something later.',
      next: 'S04B',
      sets: ['jonah_rapport']
    }
  ]
},

{
  id: 'S04A',
  act: 1,
  title: 'Kingfisher',
  clock: '21:16',
  env: 'control',
  channel: 'future_J',
  requires: ['rao_direct'],
  lines: [
    { sp: 'RAO', t: 'This is Rao.' },
    { sp: 'JONAH', t: '[relief] Good. Thank you. Now please stop investigating me and start—' },
    { sp: 'RAO', t: 'I\'ll decide what I do. You say she dies at ten. How.' },
    { sp: 'JONAH', t: 'I don\'t know how.' },
    { sp: 'RAO', t: 'You know my call sign. You don\'t know how she dies.' },
    { sp: 'JONAH', t: '[tight, clipped] I know what I was shown. She is on the floor at the foot of the console. There is blood on the near microphone — the one on the boom arm, left of the desk. And the door log says the door never opened. [harder] That is everything I have and I have spent my entire night trying to get it into that room.' },
    { sp: 'RAO', t: 'Your night.' },
    { sp: 'JONAH', t: '[beat] My night. Yes.' },
    { sp: 'RAO', t: '[aside, to you] Six. He\'s rehearsed. Log the time and keep hold of him — he\'s decided he doesn\'t like me.' }
  ],
  evidence: ['E02'],
  sets: ['jonah_wary', 'blood_detail'],
  next: 'S05'
},

{
  id: 'S04B',
  act: 1,
  title: 'Ninety Seconds',
  clock: '21:16',
  env: 'control',
  channel: 'future_J',
  requires: ['jonah_rapport'],
  lines: [
    { sp: 'JONAH', t: '[a long breath out] Thank you. [quieter] You\'re the first person tonight who hasn\'t tried to keep me talking long enough to find me.' },
    { sp: 'JONAH', t: 'I know how this sounds. I\'ve had eleven hours to think about how it sounds. I sat in a corridor at the Institute all night working out what four facts I could give a stranger that would make them move.' },
    { sp: 'JONAH', t: 'The substation was one. [pause] I\'d rather not spend the others proving myself. I\'d rather spend them on her.' },
    { sp: 'RAO', t: '[off, low] He\'s good, Six. Note that he\'s good.' },
    { sp: 'JONAH', t: 'She goes into Studio B at twenty-two hundred to shut the experiment down. That part is her own idea and you will not talk her out of it. [beat] Whatever else you do tonight — do not let anybody tell you that room is safe because it\'s empty.' },
    { sp: 'JONAH', t: 'It was empty in mine, too.' }
  ],
  sets: ['jonah_rapport', 'room_warning'],
  next: 'S05'
},

{
  id: 'S05',
  act: 1,
  title: 'The Trunk Line',
  clock: '21:18',
  env: 'control',
  channel: 'direct',
  lines: [
    { sp: 'DECLAN', t: '[remote, unbothered] Night desk, Boyle. Somebody wanted a trace on line six?' },
    { sp: 'RAO', t: 'How long do you need.' },
    { sp: 'DECLAN', t: 'None at all, it isn\'t hiding. That\'s rather the thing. [tapping] Your caller is on a Halcyon Institute extension. Internal line forty-four.' },
    { sp: 'DECLAN', t: '[beat] Forty-four is the wall telephone in Studio B.' },
    { sp: 'RAO', t: 'Say that again.' },
    { sp: 'DECLAN', t: 'The man telling you there\'s going to be a murder in Studio B is telephoning you from inside Studio B.' },
    { sp: 'JONAH', t: '[distorted, overlapping] —it isn\'t what you think, please, don\'t send anyone in, just listen to me—' },
    { sp: 'RAO', t: 'Okafor. Is there a person in that room.' },
    { sp: 'OKAFOR', t: '[radio, calm] Negative. I have the camera up in front of me. The room is empty, the lights are off, and the door has not cycled since half past two this afternoon.' },
    { sp: 'RAO', t: '[quietly] Then who is holding the phone.' }
  ],
  evidence: ['E18'],
  sets: ['caller_id_known'],
  next: 'S06'
},

{
  id: 'S06',
  act: 1,
  title: 'Containment',
  clock: '21:19',
  env: 'halcyon',
  channel: 'radio',
  sfx: [{ at: 2, id: 'door_release' }],
  lines: [
    { sp: 'TANNOY', t: '[flat, automated] Attention. The Institute is now under external direction. All personnel remain at your stations. Do not attempt to leave the building.' },
    { sp: 'OKAFOR', t: 'Kingfisher, Okafor. Perimeter\'s set. Two on the lobby, two on the stairwell, one outside Studio B. Nobody goes through that door without you saying so.' },
    { sp: 'RAO', t: 'Head count.' },
    { sp: 'OKAFOR', t: 'Nineteen in the building. Sixteen accounted for on the ground floor. Doctor Sayegh is downstairs in the array hall, Hart is with her, and I am eight metres from a room that is making telephone calls.' },
    { sp: 'RAO', t: 'Anyone by the name of Vale?' },
    { sp: 'OKAFOR', t: '[pause] Jonah Vale is on staff. Systems, third floor. [slower] He badged out at eighteen forty and he has not come back. I\'m looking at the entry now. He\'s been gone three hours.' },
    { sp: 'RAO', t: 'Then find out where he is. Because he is either at home asleep, or he is standing in a room I have got a man outside of.' }
  ],
  sets: ['halcyon_locked', 'jonah_absent'],
  next: 'S07'
}

);
