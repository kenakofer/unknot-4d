// Everything the player reads in 4D Snake.
//
// Prose, meant to be edited like a document. Anything written here by an AI is
// a draft: the author reads, edits or approves every player-visible sentence
// before it ships, which is only possible while the copy is gathered in a few
// known files. See shared/copy.js for the rule in full.

export const HUD = {
  title: '4D Snake',
  blurb: 'Six cubes, six deep. The fourth direction wraps around.',
  score: 'Score',
  length: 'Length',
  padFoot: 'menu · drag to look',
};

export const GAME_OVER = {
  heading: 'Game over',
  finalScore: 'Final score',
  playAgainKey: 'Space',
  playAgain: 'Play Again',
};

// ---------------------------------------------------------------------------
// How a death reads.
//
// A verb, a direction, and what you hit: "You bonked eastward into the wall."
// Naming the direction turns "you died" into an account of what you actually
// did, and it gets ana and kata into an ordinary sentence, where they start
// sounding like places rather than jargon.
// ---------------------------------------------------------------------------

// The direction each way of going is called, as an adverb. Keyed by axis and
// sign, which is how the game asks for them.
export const WARD = {
  '0:-1': 'westward',
  '0:1': 'eastward',
  '1:1': 'upward',
  '1:-1': 'downward',
  '2:-1': 'northward',
  '2:1': 'southward',
  '3:-1': 'kata-ward',
  '3:1': 'ana-ward',
};

// Picked at random per death, so a run of them does not read the same way
// twice. All blunt, none cruel: dying is the ordinary outcome here and the
// message should be cheerful about it.
export const VERBS = ['plowed', 'slammed', 'crashed', 'bonked', 'bashed',
                      'barrelled'];

// Two directions get their own, because they are not the same motion as the
// rest. Bonking downward would be a missed joke.
export const VERBS_BY_DIR = {
  '1:-1': ['fell', 'plummeted', 'dropped', 'tumbled'],
  '1:1': ['launched', 'vaulted', 'rocketed', 'soared'],
};

// What you hit, keyed by the model's own cause names.
export const INTO = {
  wall: 'into the wall',
  lava: 'into the lava',
  self: 'into yourself',
};

// When the direction is unknown for some reason, which should not happen but
// is better than an empty card if it does.
export const DIED_PLAINLY = 'You went';

// ---------------------------------------------------------------------------
// The tutorial.
//
// Three lessons, each adding exactly two keys. The text carries the argument,
// so it is worth reading these four blocks together: they should build.
// ---------------------------------------------------------------------------

export const TUTORIAL = {
  stepLabel: (n, total) => `Step ${n} of ${total}`,
  skip: 'Skip the tutorial',
  // The last card's button. "Continue" when the player was sent here by
  // another game and is about to be handed back to it.
  finish: 'Play',
  finishAndReturn: 'Continue',

  lessons: [
    {
      blurb: 'Eight by eight, flat.',
      title: 'You know this one',
      text: 'Snake, in two dimensions. Use the <b>arrow keys</b> to reach the ' +
            'apple. Do not hit the walls or the lava.',
    },
    {
      blurb: 'Eight by eight by eight. One room.',
      title: 'Well done. Now in three',
      text: 'Same game, two more keys: <b>W</b> and <b>S</b> move up and ' +
            'down. The lava ahead spans the whole floor — go <b>over</b> it.',
    },
    {
      blurb: 'Four rooms, side by side along a fourth direction.',
      title: 'And with a strenuous rearrangement of the parietal lobe…',
      text: 'Two more keys: <b>A</b> and <b>D</b> move <b>kata</b> and ' +
            '<b>ana</b>, along a fourth direction. The wall ahead of you ' +
            'fills this room floor to ceiling and wall to wall — but it is ' +
            'only in <i>this</i> room. The rooms beside it are empty.',
    },
  ],

  done: {
    title: 'That is the tutorial',
    text: 'The real board is six cubes, six deep, and the fourth direction ' +
          'wraps — step off one end and you arrive at the other. Go and get ' +
          'a high score.',
  },
};

// The slice panels' footers, which name the axes each is holding still.
export const PANELS = {
  heldFixed: (axis, value) => `${axis} <b>${value}</b> held fixed`,
  pair: (a, av, b, bv) => `${a} <b>${av}</b> &middot; ${b} <b>${bv}</b>`,
};
