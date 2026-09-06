// Showing a fourth dimension as a ring of frames.
//
// Three of the four axes are drawn as space. The fourth is drawn as SEPARATE
// COPIES of that space -- one cube frame per w value -- laid out on a flat
// circle in w order. The frame holding the player sits nearest the camera; the
// others recede around the ring. Something that steps in w is then visibly the
// same thing continuing in the next box, rather than two ghosts overlapping in
// one.
//
// This is the piece every game here shares. A player who has learned that
// "the frames are a ring, and A/D walks around it" in one game already knows
// where they are in the next, which is the whole reason these games sit in one
// repository.
//
// Two things are configured per game:
//
//   depth   how many w values there are
//   wrap    whether w = max is adjacent to w = 0
//
// A non-wrapping dimension gets ONE MORE SLOT than it has values. That spare
// slot is the gap between the last frame and the first, and a game fills it
// with a solid blocker (see blockerSlot) to say plainly that the step is not
// available. A wrapping dimension uses exactly as many slots as values, so the
// ring closes seamlessly and stepping off the end really does arrive at the
// beginning -- the geometry states the rule before any text does.

// Centre-to-centre spacing along the circle, in box widths. Sets the radius,
// since the circumference has to hold every slot.
export const SLICE_GAP = 1.5;

export class Ring {
  // `span` is the widest the drawn box gets, in cells -- it fixes the spacing
  // so frames never overlap whatever the grid's proportions.
  constructor({ depth, span, wrap = false, gap = SLICE_GAP }) {
    this.depth = depth;
    this.span = span;
    this.wrap = wrap;
    this.gap = gap;
  }

  // Slots around the ring: one per w value, plus the blocker's when the
  // dimension does not wrap.
  get slots() {
    return this.wrap ? this.depth : this.depth + 1;
  }

  get radius() {
    return (this.slots * this.span * this.gap) / (2 * Math.PI);
  }

  // Where slot `k` sits, in world space, given that `focus` is the slot being
  // looked at. `k` and `focus` may both be fractional, which is what makes the
  // slide between frames continuous.
  //
  // The focused slot always sits at the near point of the circle -- 6 o'clock,
  // nearest the camera -- and the others recede around it in order. So the ring
  // TURNS as the focus moves, carrying every frame with it, rather than the
  // camera travelling round a fixed ring to find the frame it wants.
  //
  // The frames do not turn as the ring does. Each is placed by translation
  // alone, so all of them keep one fixed orientation however far the ring has
  // rotated: the ring is a carousel of positions, not of objects. That is what
  // lets up, down, left and right go on meaning one thing while the room you
  // are working in is always the one in front of you.
  //
  // Passing focus = 0 gives the old absolute layout, which is what a game with
  // no focus to track wants.
  offset(k, focus = 0) {
    const r = this.radius;
    const theta = this.yaw(k - focus);
    return [r * Math.sin(theta), 0, r * Math.cos(theta) - r];
  }

  // The angle slot `k` sits at around the circle. This is where the frame is
  // PLACED; it is not a rotation applied to anything (see the note below).
  yaw(k) {
    return (2 * Math.PI * k) / this.slots;
  }

  // A note on orientation, because it is the thing that makes the ring usable.
  //
  // Frames sit at different points on the circle but are NEVER turned: each one
  // is placed by translation alone, so every frame's x axis is world x, and all
  // of them face the viewer identically. Travelling from one to the next is
  // pure sideways movement.
  //
  // That matters because every game here rests on up, down, left and right
  // meaning one fixed thing. If the frames faced outward from the circle's
  // centre -- or if the camera turned to meet them, which amounts to the same
  // picture -- then walking the ring would spin the world under the player:
  // dial in a view where the directions make sense, press A, and the next frame
  // arrives rotated a sixth of a turn. The ring is a way of laying out slices,
  // not a carousel to be ridden.

  // The slot the blocker stands in, or null when the dimension wraps and there
  // is no gap to block.
  blockerSlot() {
    return this.wrap ? null : this.depth;
  }

  // The shortest way round the ring from `from` to `to`, as a signed number of
  // slots. On a wrapping dimension a step from the last frame to the first is
  // one slot forward, not depth-1 slots back -- so the camera takes the short
  // way and the move reads as the single step it was.
  delta(from, to) {
    let d = to - from;
    if (!this.wrap) return d;
    const n = this.slots;
    while (d > n / 2) d -= n;
    while (d < -n / 2) d += n;
    return d;
  }
}

// ---------------------------------------------------------------------------
// Sliding between frames.
//
// The focus is kept apart from the position the geometry is measured from:
// `focus` is the exact integer slice the player is in, and `shown` chases it.
// Keeping the two apart means the logic -- which frame is highlighted, which
// slice something is in -- stays on exact integers while only the view slides.
// ---------------------------------------------------------------------------

// e-folds per second; higher is snappier. Exponential easing moves off briskly
// and settles without overshoot, and is frame-rate independent: the same
// fraction of the remaining distance is covered per unit time however often it
// is stepped.
export const SLIDE_RATE = 11;
// Close enough to snap. A frame is a whole box wide, so a hundredth of a slice
// is far below anything visible -- and every frame of the tail may cost a full
// rebuild, so there is no point animating it.
export const SLIDE_DONE = 0.01;

export class Slide {
  constructor(at = 0, ring = null) {
    this.focus = at;
    this.shown = at;
    // Supplied when the dimension wraps, so the slide takes the short way
    // round rather than unwinding the long way.
    this.ring = ring;
  }

  // Jump with no animation -- a new game, or a view rotation that changes which
  // axis w even is, where interpolating between two unrelated numbers would be
  // meaningless.
  snap(at) {
    this.focus = at;
    this.shown = at;
  }

  // Advance by `dt` seconds. Returns true while there is still movement to
  // draw.
  step(dt) {
    const gap = this.ring
      ? this.ring.delta(this.shown, this.focus)
      : this.focus - this.shown;
    if (Math.abs(gap) < SLIDE_DONE) {
      if (this.shown !== this.focus) { this.shown = this.focus; return true; }
      return false;
    }
    this.shown += gap * (1 - Math.exp(-SLIDE_RATE * dt));
    // Keep `shown` in range on a wrapping ring, so it never drifts off after
    // repeated trips around.
    if (this.ring && this.ring.wrap) {
      const n = this.ring.slots;
      this.shown = ((this.shown % n) + n) % n;
    }
    return true;
  }
}
