// The rock: a gentle, endless sway added on top of wherever the player has
// aimed the camera.
//
// It is not an orbit. A full spin would keep swapping which way is left and
// which is right, and every one of these games rests on left, right, up and
// down meaning one fixed thing. A small swing keeps those stable while the
// parallax does the real work: two things that overlap exactly in one still
// view come apart a moment later, so a 3D shape in a box reads as a shape
// rather than a flat tangle.
//
// It lives here rather than in any one view because more than one view uses it
// at once -- the main camera and a diagram panel, say -- and they must swing
// from the SAME clock. Two copies of this rule would drift apart within a
// minute and the two views would start disagreeing about which face of the
// puzzle is showing.

export const ROCK = 0.105;       // radians of yaw either side of centre
export const PERIOD = 9000;      // ms for a full yaw swing
// A slower nod on top of the side-to-side swing. The two periods are chosen
// not to divide into each other, so the view never repeats exactly and
// anything hidden at one moment comes clear a little later.
export const NOD = 0.04;         // radians of tilt either side of centre
export const NOD_PERIOD = 14300; // ms, deliberately not a multiple of PERIOD

// The rock, as offsets to add to whatever the camera is already looking at.
// Every view calls this with the same clock, so they swing together.
export function rockAt(ms) {
  return {
    yaw: Math.sin((ms / PERIOD) * Math.PI * 2) * ROCK,
    tilt: Math.sin((ms / NOD_PERIOD) * Math.PI * 2) * NOD,
  };
}

// ---------------------------------------------------------------------------
// Two ways of drawing the eye, kept apart on purpose.
// ---------------------------------------------------------------------------

// The cursor blink. Slow and shallow: it should catch the eye when you are
// hunting for the thing you are steering without pulling at it while you are
// looking somewhere else. A hard switch rather than a fade -- a caret blinks,
// it does not breathe -- and slightly longer lit than dim, so the mark is
// easier to find than to lose.
export const BLINK_PERIOD = 800;   // ms for a full cycle
export const BLINK_DUTY = 0.58;    // fraction of the cycle spent at full strength

export const blinkPhase = (ms) =>
  ((ms % BLINK_PERIOD) / BLINK_PERIOD) < BLINK_DUTY ? 0 : 1;

// A soft pulse, 0..1 and back, for things that should draw the eye without
// demanding it.
//
// Deliberately not the hard switch above. A cursor blinks -- the edge is what
// makes it read as a caret rather than a glow -- but a prize should breathe.
// Using the same shape for both would make them look like the same kind of
// object, and they are not: one is where you are, the other is where you are
// going. Slower, too, so the two never look like they are keeping time.
export const PULSE_PERIOD = 1500;   // ms for a full cycle

export const pulseAt = (ms) =>
  0.5 - 0.5 * Math.cos((ms % PULSE_PERIOD) / PULSE_PERIOD * Math.PI * 2);
