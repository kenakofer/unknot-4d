// The tutorial.
//
// Four steps, and the shape of it is the argument: each one adds exactly two
// keys, and the machinery for those two keys appears on screen at the same
// moment. Two dimensions is a game everyone already knows. Three is that game
// with W and S. Four is that game with A and D, and a ring of rooms to put
// them in.
//
// Nothing here explains the fourth dimension in words, because words are what
// everyone else has already tried. Instead the third lesson puts a wall
// squarely between the player and the apple, gives them a direction the wall
// does not extend along, and lets them find out what that means by using it.
//
// Every lesson is a real game on a real board, drawn by the ordinary renderer.
// That is why the renderer learned to handle 2, 3 and 4 dimensions rather than
// the lessons being drawn as diagrams: a tutorial that does not look like the
// game teaches the wrong thing.

// A note on the axes.
//
// The arrow keys drive x and z; W and S drive y. So a "2D" lesson is a board
// with x and z, one cell deep in y -- flat, and steered entirely by the arrows,
// which is what a player expects from a game they already know. The 3D lesson
// opens y up. The 4D lesson adds w.
export const LESSONS = [
  {
    id: '2d',
    blurb: 'Eight by eight, flat.',
    title: 'You know this one',
    text: 'Snake, in two dimensions. Use the <b>arrow keys</b> to reach the ' +
          'apple. Do not hit the walls or the lava.',
    // Flat: 8 by 8, one cell deep in y.
    opts: {
      dims: [8, 1, 8],
      wrap: [false, false, false],
      lavaCount: 0,
      // A wall of lava between the snake and the apple, with a gap at the far
      // end. Going straight at the apple does not work; going around does.
      lava: [{ origin: [4, 0, 0], size: [1, 1, 6] }],
      body: [[1, 0, 4], [1, 0, 3], [1, 0, 2]],
      apple: [6, 0, 4],
    },
  },
  {
    id: '3d',
    blurb: 'Eight by eight by eight. One room.',
    title: 'Well done. Now in three',
    text: 'Same game, two more keys: <b>W</b> and <b>S</b> move up and down. ' +
          'The lava ahead spans the whole floor — go <b>over</b> it.',
    opts: {
      dims: [8, 8, 8],
      wrap: [false, false, false],
      lavaCount: 0,
      // A slab across the whole floor of the room, with headroom above it.
      // It spans every x and z the snake can reach at floor level, so no
      // amount of going around gets past it -- the only way through is over,
      // which is what the two new keys are for. Checked by the suite: this
      // lesson is unsolvable without axis 1.
      lava: [{ origin: [4, 0, 0], size: [1, 5, 8] }],
      body: [[1, 0, 4], [1, 0, 3], [1, 0, 2]],
      apple: [6, 0, 4],
    },
  },
  {
    id: '4d',
    blurb: 'Four rooms, side by side along a fourth direction.',
    title: 'And with a strenuous rearrangement of the parietal lobe…',
    text: 'Two more keys: <b>A</b> and <b>D</b> move <b>kata</b> and ' +
          '<b>ana</b>, along a fourth direction. The wall ahead of you fills ' +
          'this room floor to ceiling and wall to wall — but it is only in ' +
          '<i>this</i> room. The rooms beside it are empty.',
    opts: {
      dims: [8, 8, 8, 4],
      wrap: [false, false, false, true],
      lavaCount: 0,
      // A wall filling the whole cross-section of slice 0 -- there is no way
      // around it in three dimensions. It exists only in slice 0, so ana or
      // kata is the only way through, which is the entire lesson.
      lava: [{ origin: [4, 0, 0, 0], size: [1, 8, 8, 1] }],
      body: [[1, 4, 4, 0], [1, 4, 3, 0], [1, 4, 2, 0]],
      apple: [6, 4, 4, 0],
    },
  },
];

export const DONE = {
  title: 'That is the tutorial',
  text: 'The real board is six cubes, six deep, and the fourth direction ' +
        'wraps — step off one end and you arrive at the other. Go and get a ' +
        'high score.',
};

// The flag is shared across every game, so finishing this counts everywhere.
export { tutorialSeen, markTutorialSeen } from '../../../shared/tutorial-flag.js';
import { markTutorialSeen } from '../../../shared/tutorial-flag.js';

// ---------------------------------------------------------------------------
// The overlay.
//
// A card in the corner rather than a modal: the lesson is played, not read, so
// the board has to stay visible and reachable the whole time. It sits opposite
// the slice panels so it never covers the thing the lesson is about.
// ---------------------------------------------------------------------------

export class Tutorial {
  // `onLesson(lesson)` starts a board and describes it; `onFinish()` returns
  // to the real game.
  constructor({ onLesson, onFinish, finishLabel = 'Play' }) {
    this.onLesson = onLesson;
    this.onFinish = onFinish;
    this.finishLabel = finishLabel;
    this.step = -1;
    this.build();
  }

  build() {
    const el = document.createElement('div');
    el.id = 'tut';
    el.innerHTML = `
      <div class="card">
        <div class="step" id="tutStep"></div>
        <h2 id="tutTitle"></h2>
        <p id="tutText"></p>
        <div class="row">
          <button id="tutNext">Start</button>
          <button id="tutSkip" class="quiet">Skip</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('#tutNext').addEventListener('click', () => this.next());
    el.querySelector('#tutSkip').addEventListener('click', () => this.finish());
  }

  start() {
    this.step = -1;
    this.el.classList.add('show');
    this.next();
  }

  get active() { return this.el.classList.contains('show'); }

  next() {
    this.step++;
    if (this.step >= LESSONS.length) return this.showDone();
    const lesson = LESSONS[this.step];
    this.el.querySelector('#tutStep').textContent =
      `Step ${this.step + 1} of ${LESSONS.length}`;
    this.el.querySelector('#tutTitle').textContent = lesson.title;
    this.el.querySelector('#tutText').innerHTML = lesson.text;
    // No "next" while a lesson is being played: eating the apple is what
    // advances it. A button that skipped ahead would let a player leave
    // without doing the one thing the step exists to make them do.
    this.el.querySelector('#tutNext').hidden = true;
    this.el.querySelector('#tutSkip').textContent = 'Skip the tutorial';
    this.onLesson(lesson);
  }

  // The lesson's board says the player has done it -- they ate the apple.
  solved() {
    if (!this.active || this.step < 0 || this.step >= LESSONS.length) return;
    this.next();
  }

  // They died. The lesson restarts, since the point is to do it rather than to
  // be told about it, and losing a tutorial should cost nothing.
  failed() {
    if (!this.active || this.step < 0 || this.step >= LESSONS.length) return;
    this.onLesson(LESSONS[this.step]);
  }

  showDone() {
    this.el.querySelector('#tutStep').textContent = '';
    this.el.querySelector('#tutTitle').textContent = DONE.title;
    this.el.querySelector('#tutText').innerHTML = DONE.text;
    const next = this.el.querySelector('#tutNext');
    next.hidden = false;
    next.textContent = this.finishLabel;
    this.el.querySelector('#tutSkip').textContent = '';
    this.el.querySelector('#tutSkip').hidden = true;
    // The final card's button finishes rather than advancing.
    next.onclick = () => this.finish();
  }

  finish() {
    this.el.classList.remove('show');
    this.step = -1;
    markTutorialSeen();
    this.onFinish();
  }
}
