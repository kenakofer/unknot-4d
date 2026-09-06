// Everything the player reads in 4D Tron.
//
// Prose, meant to be edited like a document. See shared/copy.js for the rule.

export const HUD = {
  title: '4D Tron',
  round: 'Round',
  cellsLeft: 'Cells left',
  padFoot: 'menu',
};

// The two riders. Their names appear in the HUD, on the panels and in every
// round-over message, so they live here rather than beside their colours.
export const PLAYER_NAMES = ['Cyan', 'Orange'];

export const CONTROLLER = {
  // Shown until a controller is used. A browser cannot see one before a button
  // is pressed on it, so this is an invitation rather than a report.
  none: 'Press a controller button to join as Orange',
  some: (n) => `${n} controller${n > 1 ? 's' : ''} connected`,
};

export const ROUND_OVER = {
  // What killed a rider, as the tail of "Orange went ___".
  cause: {
    wall: 'into the wall',
    trail: "into the other rider's trail",
    self: 'into their own trail',
    'head-on': 'head-on',
  },
  draw: 'Draw',
  roundWinner: (name) => `${name} wins the round`,
  matchWinner: (name) => `${name} takes the match`,
  lostBy: (name, cause) => `${name} went ${cause}`,
  bothWent: (cause) => `Both went ${cause}`,
  eachWent: (a, ca, b, cb) => `${a} ${ca}, ${b} ${cb}`,
  roundsWon: 'Rounds won',
  nextRound: 'Next round',
  newMatch: 'New match',
};
