// tunes.js — the demo material that ships in the box.
//
// The 1979 cassette came with two routines. We're a bit more generous.

import { parseTune } from './audio.js';

export const TUNES = [
  {
    name: 'Demon Rag',
    notes: parseTune(`
      a4 . e4 a4 c5 - b4 a4  g4 . e4 g4 a4 - . .
      a4 . e4 a4 c5 - d5 c5  b4 a4 g4 e4 a4 - - .
      c5 - b4 g4 a4 - e4 .   c5 - d5 e5 a4 - . .
      a4 g4 e4 d4 c4 - e4 .  a4 - - - . . . .`),
  },
  {
    name: 'Yankee Doodle',
    notes: parseTune(`
      c4 c4 d4 e4 c4 e4 d4 g3
      c4 c4 d4 e4 c4 - b3 -
      c4 c4 d4 e4 f4 e4 d4 c4
      b3 g3 a3 b3 c4 - c4 .`),
  },
  {
    name: 'Camptown Races',
    notes: parseTune(`
      g4 g4 e4 g4 a4 g4 e4 .
      e4 d4 c4 d4 e4 - . .
      g4 g4 e4 g4 a4 g4 e4 .
      e4 g4 e4 d4 c4 - - .`),
  },
  {
    name: 'Oh! Susanna',
    notes: parseTune(`
      c4 d4 e4 g4 g4 a4 g4 e4
      c4 d4 e4 e4 d4 c4 d4 -
      c4 d4 e4 g4 g4 a4 g4 e4
      c4 d4 e4 e4 d4 d4 c4 -
      f4 f4 f4 a4 a4 - g4 -
      e4 c4 e4 g4 g4 f4 e4 d4
      c4 d4 e4 e4 d4 d4 c4 - `),
  },
  {
    name: 'Tap Break',
    notes: parseTune(`
      a3 . . . a3 . e3 .
      a3 . . . e3 . . .
      a3 . . . a3 . e3 .
      c4 - b3 - a3 - . .`),
  },
];

export const ROUTINES = [
  { name: 'Warm-Up', codes: 'ABABCDMNKL' },
  { name: 'Soft Shoe', codes: 'MNCDOMNQ' },
  { name: 'Showstopper', codes: 'IJEFGHOPLRQ' },
  { name: 'Hot Foot', codes: 'AACCBBDDEFIOLR' },
];
