// Everything the player reads in 4D Tron.
//
// Prose, meant to be edited like a document. Anything written here by an AI is
// a draft: the author reads, edits or approves every player-visible sentence
// before it ships, which is only possible while the copy is gathered in a few
// known files. See shared/copy.js for the rule in full.

export const HUD = {
  title: '4D Tron', //kenan approved
  round: 'Round', //kenan approved
  cellsLeft: 'Cells left', //kenan approved
  padFoot: 'menu', //kenan approved
  // Over the score in the top bar. Only on a phone, where Orange's panel is
  // not on screen to hold its own half of the score.
  score: 'Score',
};

// The two riders. Their names appear in the HUD, on the panels and in every
// round-over message, so they live here rather than beside their colours.
export const PLAYER_NAMES = ['Cyan', 'Orange']; //kenan approved

export const CONTROLLER = {
  // Shown while the computer is driving Orange. It has to do two jobs at once:
  // say who the first player is up against, and say how to take that seat. A
  // browser cannot see a controller before a button is pressed on it, so the
  // keyboard has to be offered too -- it is the only route that is certain to
  // work.
  join: 'Orange is the computer — press IJKL or a controller to take over',
  // The same fact on a phone, where there are no keys to name and no second
  // set of controls to hand over to. It is a statement rather than an
  // invitation, because on a touch screen there is nothing to accept it with.
  soloJoin: 'Orange is the computer',
  // Shown once a person has taken the seat and no controller is connected,
  // which means they are on the fallback keys.
  none: 'Connect a controller to join as Orange', //kenan approved
  some: (n) => `${n} controller${n > 1 ? 's' : ''} connected`, //kenan approved
};

export const ROUND_OVER = {
  // What killed a rider, as the tail of "Orange went ___".
  cause: {
    wall: 'into the wall', //kenan approved
    trail: "into the other rider's trail", //kenan approved
    self: 'into their own trail', //kenan approved
    'head-on': 'head-on', //kenan approved
  },
  draw: 'Draw', //kenan approved
  roundWinner: (name) => `${name} wins the round`, //kenan approved
  matchWinner: (name) => `${name} wins the match`, //kenan approved
  lostBy: (name, cause) => `${name} went ${cause}`, //kenan approved
  bothWent: (cause) => `Both players went ${cause}`, //kenan approved
  eachWent: (a, ca, b, cb) => `${a} ${ca}, ${b} ${cb}`, //kenan approved
  roundsWon: 'Rounds won', //kenan approved
  nextRound: 'Next round', //kenan approved
  newMatch: 'New match', //kenan approved
};
