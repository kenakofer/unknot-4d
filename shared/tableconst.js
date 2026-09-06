// The numbers that decide what the table's marbling looks like.
//
// Split out for the same reason tableshape.js is: the suite has to check that
// the veining is smooth at the density the table actually samples it, and it
// cannot import table.js without pulling in three.js. Keeping these here rather
// than restating them in the test is not tidiness -- the two drifted apart
// once, when MARBLE_SCALE doubled and the test went on asserting the old value,
// so it kept passing while the surface had started to facet.

// The two near-blacks the marbling runs between, as linear RGB.
//
// Both are barely off the background. A table is the one thing on screen that
// must never compete for attention -- it is what the game stands on -- so the
// veining has to be findable rather than visible: something the eye picks up
// when it rests on the background, and does not notice at all while the player
// is reading the board.
// Set by reading rendered pixels, not by picking values that look right in a
// swatch. The background is 0x0e1116 -- 14,17,22 in sRGB -- and the surface has
// to sit just above that: close enough that the table still reads as the
// darkest thing on screen, far enough that the veining has somewhere to swing.
//
// The range between them is the whole effect. Too narrow and the marbling is a
// flat slab; too wide and the table starts glowing and competing with the board
// it is supposed to sit behind.
export const LO = [0.013, 0.017, 0.026];
export const HI = [0.030, 0.037, 0.050];

// How many times the baked tile repeats across the table's width. This is the
// density knob: raise it for finer veining.
export const UV_SCALE = 1.9;

// The baked tile, in texels. Large enough that the veining is not soft when the
// table fills the screen, and it is built once at startup rather than per
// frame, so this is a memory cost rather than a running one.
export const MARBLE_TEXELS = 512;
export const VEINS = 1.35;
export const WARP = 1.6;

// How fast the pattern flows as the table moves through w. Well under one, so
// crossing a slice drifts the stone rather than replacing it -- the surface
// should look like the same table seen a little differently, which is what it
// is.
export const W_SCALE = 0.35;

// How much the camera's own swing counts for, in slices, on top of that.
//
// The marbling reads the yaw separately from the shape, and much more keenly,
// because the two want opposite things from it. The OUTLINE should barely
// notice a rock -- a table that morphed as it swayed would be seasick. The
// SURFACE should notice it plainly, because that is the thing being claimed:
// look at the stone from a slightly different angle in the fourth dimension and
// you are seeing a slightly different slice of it.
//
// Sharing one gain is what made the rock invisible. ROCK is 0.105 radians,
// which is a fifth of a slice on a six-slot ring, and W_SCALE then shrank it
// again -- a full swing moved the sample by 0.0016, which is nothing. This is
// the gain that makes a swing worth about a third of a slice of drift.
export const YAW_FLOW = 1.7;

// Rings of vertices from the middle to the rim. This is the resolution the
// marbling is drawn at: too few and the veins turn into visible facets, too
// many and every shape change rebuilds a mesh that costs more than it shows.
//
// Chosen against the clock as much as against the look. Every vertex costs a
// four-octave noise lookup, and the whole surface is repainted whenever the
// outline changes -- at 80 rings with a matching segment count that came to 20k
// vertices and a 193ms rebuild, which is a visible stall mid-slide. The mesh is
// sized so a rebuild stays a few milliseconds, and evenness is bought by
// spacing the rings and segments to match rather than by piling on more of
// both.
export const MARBLE_RINGS = 80;

