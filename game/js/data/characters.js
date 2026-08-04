/* THE MAN WHO CALLED FROM TOMORROW — cast
 *
 * `voice` values are ElevenLabs voice IDs, chosen for maximum separability in a
 * headphones-only medium: London / Scottish / West African / Cork / RP.
 * Future selves deliberately reuse the present voice; they are told apart by
 * performance and by the channel processing in audio.js, never by casting.
 */
const CHARACTERS = {
  JONAH: {
    name: 'Jonah Vale',
    short: 'Jonah',
    voice: 'YImgdHB2KYPPVa2Ew8pp',
    color: '#c8703f',
    role: 'Systems engineer, Halcyon Institute',
    note: 'The first caller. Reasonable, which is the problem.',
    direction: 'Male, 36, London. Intelligent and urgent, emotionally contained. ' +
      'Begins factual. Answers questions adjacent to the truth. Breaks rhythm ' +
      'when his own survival comes up.'
  },
  MIRA: {
    name: 'Dr Mira Sayegh',
    short: 'Mira',
    voice: 'pFZP5JQG7iQjIQuC4Bku',
    color: '#5b9dc4',
    role: 'Director, Project Echo',
    note: 'The woman who is going to die at 22:00.',
    direction: 'Female, 47, international English. Measured, authoritative, ' +
      'tired to the bone. Uses precise analogies. Warms when the subject is ' +
      'responsibility rather than physics.'
  },
  FMIRA: {
    name: 'Dr Mira Sayegh',
    short: 'Mira (+18h)',
    voice: 'pFZP5JQG7iQjIQuC4Bku',
    color: '#7fc7e8',
    role: 'Calling from eighteen hours ahead',
    note: 'Branch M. She survived. That is the problem.',
    direction: 'Same voice, colder and far less patient. Has already had every ' +
      'argument the present Mira is about to have, and lost most of them.'
  },
  RAO: {
    name: 'DI Anika Rao',
    short: 'Rao',
    voice: 'zRnPlRhh6uvfi8OMfmwX',
    color: '#8fae6a',
    role: 'Incident commander — call sign Kingfisher',
    note: 'Your hands in the building.',
    direction: 'Female, 42, Scottish. Direct, dry, disciplined. Short ' +
      'operational questions. Summarises without solving it for you.'
  },
  LEONIE: {
    name: 'Leonie Hart',
    short: 'Leonie',
    voice: 'TAXL9Duy50pxAXIMCYbu',
    color: '#b98cc4',
    role: 'Quantum communications researcher',
    note: 'She built the thing that lets the dead talk.',
    direction: 'Female, 29, southern English. Fast, precise, self-correcting. ' +
      'Technical vocabulary gets simpler as she gets more frightened.'
  },
  FLEONIE: {
    name: 'Leonie Hart',
    short: 'Leonie (+11h)',
    voice: 'TAXL9Duy50pxAXIMCYbu',
    color: '#d3a8dd',
    role: 'Calling from eleven hours ahead',
    note: 'Branch J. She has had all night to work out what she did.',
    direction: 'Same voice, wrung out. Slow where the present Leonie is fast. ' +
      'Long pauses. Has stopped self-correcting.'
  },
  OKAFOR: {
    name: 'Emeka Okafor',
    short: 'Okafor',
    voice: 'F18yf5BixLZCvKiiW0yJ',
    color: '#c9a227',
    role: 'Head of security, Halcyon Institute',
    note: 'Controls every door in the building, including that one.',
    direction: 'Male, 39, West African. Calm, practical, low. Concrete sensory ' +
      'detail, no speculation. Long pauses when the subject is personal.'
  },
  DECLAN: {
    name: 'Declan Boyle',
    short: 'Declan',
    voice: 'thYWTC3ObLUgoeN0sEv3',
    color: '#6fbfa8',
    role: 'Forensic audio, night desk (remote)',
    note: 'The one honest instrument in the case.',
    direction: 'Male, 34, Cork. Dry to the point of rudeness, genuinely ' +
      'delighted by hard problems. Explains technical findings plainly ' +
      'because he assumes nobody else has slept either.'
  },
  GRANT: {
    name: 'Dr Elias Grant',
    short: 'Grant',
    voice: 'JBFqnCBsd6RMkjVDRZzb',
    color: '#9b8579',
    role: 'Ethics director, Halcyon board',
    note: 'Heard only in archived voicemail. That is as much of him as this needs.',
    direction: 'Male, 55, RP. Polished, paternal, quietly forceful. Frames ' +
      'every moral question as institutional risk.'
  },
  DISPATCH: {
    name: 'Duty Dispatcher',
    short: 'Control',
    voice: 'Xb7hH8MSUJpSbSDYk0k2',
    color: '#8a8fa3',
    role: 'Coordination centre, night shift',
    direction: 'Female, British, professional. Procedural calm.'
  },
  TANNOY: {
    name: 'Halcyon Facility System',
    short: 'Facility',
    voice: 'onwK4e9ZLuTAKqWW03F9',
    color: '#6a7080',
    role: 'Automated announcements',
    direction: 'Male, British, formal. Flat automated diction, no emotion.'
  },
  CHILD: {
    name: '—',
    short: '—',
    voice: 'MIl0Flub6Sc9KSkX2A42',
    color: '#d8d0c0',
    role: 'Not enrolled',
    direction: 'Two words. Should not be possible.'
  }
};

/* Phase signature = pre-echo delay in ms, applied by audio.js to every
 * future-origin call. Two callers sharing a signature share a branch.
 * This is load-bearing evidence: Future Leonie matches Jonah exactly. */
const PHASE_SIGNATURES = {
  JONAH:   { delay: 41, pips: 'descending', branch: 'J' },
  FLEONIE: { delay: 41, pips: 'descending', branch: 'J' },
  FMIRA:   { delay: 68, pips: 'ascending',  branch: 'M' },
  CHILD:   { delay: 0,  pips: 'none',       branch: '?' }
};
