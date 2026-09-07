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

// A rider the computer is driving, wherever its name appears -- the panel, the
// round-over card, the match result. It is the same name with the fact
// attached rather than a different name, because it is the same rider: the
// seat can be taken mid-round, and a player who beat "Orange (computer)"
// should read the same score line they would have read beating a person.
export const computerName = (name) => `${name} (computer)`;

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

// ---------------------------------------------------------------------------
// How a death reads.
//
// A verb, a direction and what they hit: "Orange barrelled ana-ward into the
// wall." The same shape as Snake's, and for the same reason -- naming the
// direction turns "they died" into an account of what they actually did, and
// it gets ana and kata into an ordinary sentence where they start sounding
// like places rather than jargon.
//
// Third person here rather than Snake's second, because there are two riders
// and one of them may be the computer: "you" would have to be one of them, and
// the card is read by whoever is watching.
// ---------------------------------------------------------------------------

// The direction each way of going is called, as an adverb. Keyed by axis and
// sign, which is how the game asks for them.
export const WARD = {
  '0:-1': 'westward', //kenan approved
  '0:1': 'eastward', //kenan approved
  '1:1': 'upward', //kenan approved
  '1:-1': 'downward', //kenan approved
  '2:-1': 'northward', //kenan approved
  '2:1': 'southward', //kenan approved
  '3:-1': 'kata-ward', //kenan approved
  '3:1': 'ana-ward', //kenan approved
};

// Picked at random per death, so a run of them does not read the same way
// twice. All blunt, none cruel: dying is the ordinary outcome here and the
// message should be cheerful about it.
export const VERBS = ['plowed', 'slammed', 'crashed', 'bonked', 'bashed',
                      'barrelled']; //kenan approved

// Two directions get their own, because they are not the same motion as the
// rest. Bonking downward would be a missed joke.
export const VERBS_BY_DIR = {
  '1:-1': ['fell', 'plummeted', 'dropped', 'tumbled'], //kenan approved
  '1:1': ['launched', 'vaulted', 'rocketed', 'soared'], //kenan approved
};

export const ROUND_OVER = {
  // What killed a rider, as the tail of "Orange went ___".
  cause: {
    wall: 'into the wall', //kenan approved
    trail: "into the other rider's trail", //kenan approved
    self: 'into their own trail', //kenan approved
    'head-on': 'head-on', //kenan approved
  },
  // The same, as the tail of "Orange barrelled ana-ward ___". A head-on has no
  // entry: it is not something one rider did in a direction, it is something
  // the two of them did to each other, and it keeps the plain sentence.
  into: {
    wall: 'into the wall', //kenan approved
    trail: "into the other rider's trail", //kenan approved
    self: 'into their own trail', //kenan approved
  },
  // Verb, direction, and what they hit.
  crashed: (name, verb, ward, into) => `${name} ${verb} ${ward} ${into}`,
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
