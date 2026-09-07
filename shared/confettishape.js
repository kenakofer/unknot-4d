// Confetti, the arithmetic.
//
// A handful of coloured rectangles dropped from the top of the screen, falling
// under gravity through air, swaying as they go. Everything here is in CSS
// pixels and seconds and knows nothing about a canvas, so the suite can run a
// drop start to finish and check that every piece leaves the screen.
//
// Drawing lives in confetti.js.

// Pixels per second squared, and the fraction of velocity lost per second.
// Together they set the terminal speed, GRAVITY / DRAG: 300 px/s, which is a
// flutter rather than a plummet.
export const GRAVITY = 600;
export const DRAG = 2;
// Sideways sway: how far it reaches, in px/s, and how fast it swings.
export const SWAY = 60;
export const SWAY_RATE = 4;
// The fastest a piece may tumble, in radians per second either way.
export const SPIN = 8;
// How much of the screen's height the pieces are staggered over at launch.
// Zero would drop them as one sheet; this spreads the fall over a few seconds.
export const STAGGER = 0.4;
// How many pieces a window this wide gets. A wider window gets more in
// proportion, so the shower is as dense on a big monitor as on a laptop; a
// narrower one gets no fewer, since a phone's worth of confetti is still a
// handful.
export const COUNT = 140;
export const COUNT_WIDTH = 1200;

export function pieceCount(width) {
  return Math.round(COUNT * Math.max(1, width / COUNT_WIDTH));
}
// Longest side of a piece, in pixels, from the smallest to the largest.
export const SIZE = [6, 12];

// The pieces at the moment of release, spread across `width` and staggered
// above the top edge. `rng` returns numbers in [0, 1); `palette` is a list of
// colours, drawn from evenly.
export function makePieces(width, height, palette, rng,
                           count = pieceCount(width)) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const size = SIZE[0] + rng() * (SIZE[1] - SIZE[0]);
    out.push({
      x: rng() * width,
      y: -size - rng() * height * STAGGER,
      vx: (rng() - 0.5) * 120,
      vy: rng() * 60,
      w: size,
      h: size * (0.4 + rng() * 0.4),
      rot: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 2 * SPIN,
      phase: rng() * Math.PI * 2,
      color: palette[Math.floor(rng() * palette.length)],
      t: 0,
    });
  }
  return out;
}

// Move every piece on by `dt` seconds. Returns the pieces still on screen; a
// piece that has fallen below `height` is dropped, and when none are left the
// drop is over.
export function advance(pieces, dt, height) {
  const keep = [];
  for (const p of pieces) {
    p.t += dt;
    p.vy += GRAVITY * dt;
    p.vy -= p.vy * DRAG * dt;
    p.vx -= p.vx * DRAG * dt;
    p.x += (p.vx + SWAY * Math.cos(p.phase + p.t * SWAY_RATE)) * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    if (p.y - p.w <= height) keep.push(p);
  }
  return keep;
}
