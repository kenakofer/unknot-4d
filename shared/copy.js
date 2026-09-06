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
//     <game>/src/copy.js         that game's own text
//
// The reason: no AI-written sentence should reach a player unreviewed. Every
// string in these files is read, edited or approved by the repository's author
// before it ships, and that is only possible while there is a short list of
// places to look. Text added anywhere else escapes that review -- not through
// anyone's carelessness, but because new strings arrive faster than they can be
// hunted down.
//
// So text added here is a DRAFT. Write it as well as you can and expect it to
// be rewritten.
//
// What does NOT belong here: key names ('Escape', ' '), CSS classes, element
// ids, or anything else the player never sees. Those are code that happens to
// be a string.

// The direction names on the pad. These are the shared spatial vocabulary --
// the same word means the same axis in every game -- so they live here rather
// than beside the key bindings they label.
export const DIRECTIONS = {
  north: 'north', //kenan approved
  south: 'south', //kenan approved
  west: 'west', //kenan approved
  east: 'east', //kenan approved
  up: 'up', //kenan approved
  down: 'down', //kenan approved
  // Hinton's names for the two ways along a fourth spatial axis, from Greek
  // ana "up" and kata "down". Worth their strangeness: a direction with a name
  // of its own is somewhere you can think about, which is the whole difficulty
  // these games are made of.
  kata: 'kata', //kenan approved
  ana: 'ana', //kenan approved
};

// The pause menu. Shared because a player who finds it in one game should read
// exactly the same words in the next.
export const PAUSE = {
  heading: 'Paused', //kenan approved
  resume: 'Resume', //kenan approved
  restart: 'Restart', //kenan approved
  // Named for what it teaches rather than which game hosts it: it covers the
  // controls and the ring of rooms, not the rules of any one game.
  tutorial: 'Movement tutorial', //kenan approved
  home: 'All games', //kenan approved
  soundOn: 'Sound: On', //kenan approved
  soundOff: 'Sound: Off', //kenan approved
};
