// Text the player reads, for the parts every game shares.
//
// This file is prose. It is meant to be edited like a document rather than
// like code: nothing here does anything, and changing a word here changes it
// everywhere that word appears.
//
// THE RULE, for anyone -- human or otherwise -- adding to this codebase:
//
//   User-facing text belongs in a copy file. Never write a sentence the player
//   will read directly into a component, a template or a handler.
//
//     shared/copy.js        text that must read identically in every game
//     games/<game>/src/copy.js   that game's own text
//
// The reason is not tidiness. Copy scattered through the source cannot be
// reviewed as writing -- you cannot read the game's voice without reading the
// game's code, and a phrase that drifts out of step with the rest is invisible
// until a player hits it. Gathered, it can be read start to finish in a minute.
//
// What does NOT belong here: key names ('Escape', ' '), CSS classes, element
// ids, or anything else the player never sees. Those are code that happens to
// be a string.

// The direction names on the pad. These are the shared spatial vocabulary --
// the same word means the same axis in every game -- so they live here rather
// than beside the key bindings they label.
export const DIRECTIONS = {
  north: 'north',
  south: 'south',
  west: 'west',
  east: 'east',
  up: 'up',
  down: 'down',
  // Hinton's names for the two ways along a fourth spatial axis, from Greek
  // ana "up" and kata "down". Worth their strangeness: a direction with a name
  // of its own is somewhere you can think about, which is the whole difficulty
  // these games are made of.
  kata: 'kata',
  ana: 'ana',
};

// The pause menu. Shared because a player who finds it in one game should read
// exactly the same words in the next.
export const PAUSE = {
  heading: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  // Named for what it teaches rather than which game hosts it: it covers the
  // controls and the ring of rooms, not the rules of any one game.
  tutorial: 'Movement tutorial',
  home: 'All games',
  soundOn: 'Sound: On',
  soundOff: 'Sound: Off',
};
