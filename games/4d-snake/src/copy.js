// Everything the player reads in 4D Snake.
//
// Prose, meant to be edited like a document. Anything written here by an AI is
// a draft: the author reads, edits or approves every player-visible sentence
// before it ships, which is only possible while the copy is gathered in a few
// known files. See shared/copy.js for the rule in full.

export const HUD = {
  title: '4D Snake', //kenan approved
  blurb: 'Collect the green apples, don\'t run into walls or lava.', //kenan approved
  score: 'Score', //kenan approved
  length: 'Length', //kenan approved
  padFoot: 'menu · drag to look', //kenan approved
};

export const GAME_OVER = {
  heading: 'Game over', //kenan approved
  finalScore: 'Final score', //kenan approved
  playAgainKey: 'Space', //kenan approved
  playAgain: 'Play Again', //kenan approved
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

// What you hit, keyed by the model's own cause names.
export const INTO = {
  wall: 'into the wall', //kenan approved
  lava: 'into the lava', //kenan approved
  self: 'into yourself', //kenan approved
};

// When the direction is unknown for some reason, which should not happen but
// is better than an empty card if it does.
export const DIED_PLAINLY = 'You went'; //kenan approved

// ---------------------------------------------------------------------------
// The tutorial.
//
// Three lessons, each adding exactly two keys. The text carries the argument,
// so it is worth reading these four blocks together: they should build.
// ---------------------------------------------------------------------------

export const TUTORIAL = {
  stepLabel: (n, total) => `Step ${n} of ${total}`, //kenan approved
  skip: 'Skip the tutorial (Can be accessed through the menu)', //kenan approved
  // The last card's button. "Continue" when the player was sent here by
  // another game and is about to be handed back to it.
  finish: 'Play', //kenan approved
  finishAndReturn: 'Continue', //kenan approved

  lessons: [
    {
      title: '2D Snake', //kenan approved
      blurb: 'You know this one', //kenan approved
      text: 'Snake in the classic 2D. Use <b>arrow keys</b> to eat the ' +
            'apple. Avoid the walls and lava.', //kenan approved
    },
    {
      title: 'Well done. Now Snake in 3D', //kenan approved
      blurb: 'Snake can float obviously', //kenan approved
      text: 'Let\'s add two more keys: <b>W</b> and <b>S</b> move up and ' + //kenan approved
            'down. The minimap gives a top-down perspective.', //kenan approved
    },
    {
      title: 'And with a strenuous rearrangement of the parietal lobe…',
      blurb: '',
      text: 'Two last keys: <b>A</b> and <b>D</b> move <b>kata</b> and ' +
            '<b>ana</b>, along a fourth dimension.' //kenan approved
    },
  ],

  done: {
    title: 'Tutorial finished', //kenan approved
    text: 'You\'ve taken your first steps to move and play in 4D! You ' + //kenan approved
          'can get back to this tutorial from the pause menu anytime.' //kenan approved
  },
};

// The slice panels' footers, which name the axes each is holding still.
export const PANELS = {
  heldFixed: (axis, value) => `${axis} <b>${value}</b> held fixed`, //kenan approved
  pair: (a, av, b, bv) => `${a} <b>${av}</b> &middot; ${b} <b>${bv}</b>`, //kenan approved
};
