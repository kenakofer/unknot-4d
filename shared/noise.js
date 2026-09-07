// Deterministic value noise, in as many dimensions as you hand it.
//
// Marbling a surface needs a field that is smooth, endless, and the SAME every
// time the thing is rebuilt. The table's geometry is thrown away and remade
// whenever its shape changes, so a random colour per vertex would boil: the
// pattern would change every frame the slice moved. A hash of the position is
// the fix -- ask twice and get the same answer, however many times the mesh has
// been rebuilt in between.
//
// It is written over an array of coordinates rather than (x, y, z, w) for the
// reason everything else here is: the table is a 4D solid, so its marbling
// wants sampling in 4D, and a 3D game should be able to reuse this without a
// second implementation. Nothing below counts the dimensions except the loop
// over the corners of a cell.
//
// This is value noise rather than gradient (Perlin) noise. Value noise is a few
// lines, has no gradient table to seed, and its slight blockiness is invisible
// once several octaves are stacked -- and marble is blotchy anyway.

// Hash an integer lattice point to a number in 0..1.
//
// The mixing is arbitrary but not careless: the multipliers are large odd
// numbers so each coordinate stirs the whole word rather than a few low bits,
// and the shifts fold the high bits back down. Weak mixing here reads directly
// as visible grid alignment in the noise.
// `D` is passed rather than read from `coords.length`: the caller's array is a
// reused scratch row that may be longer than the point, and trailing entries
// from a wider call would stir into the hash.
function hash(coords, D, seed) {
  let h = seed | 0;
  for (let d = 0; d < D; d++) {
    h ^= Math.imul(coords[d] | 0, [0x27d4eb2d, 0x165667b1, 0x9e3779b1, 0x85ebca6b][d & 3]);
    h = Math.imul(h ^ (h >>> 15), 0x2545f491);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smootherstep. Zero first AND second derivative at both ends, so cell
// boundaries do not show up as faint creases the way smoothstep's discontinuous
// curvature does across a large flat surface.
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Scratch rows for the hot path below, grown on demand and reused.
//
// Baking the table's tile is twenty-nine million hashes, and every array these
// once allocated was a fresh one per call -- ten million short-lived arrays for
// one texture. None of them outlive the call that fills them, so one set at
// module scope serves every caller. Nothing here is re-entrant or async, so
// there is no one to share them with; the dimension count is still read from
// the point rather than fixed, so a wider point simply grows them.
// `scaled` is kept apart from the other three because fbm holds it across the
// call it makes into valueNoise, which fills the others.
let CELL = { base: [], frac: [], corner: [] };
let SCALED = [];
function cell(D) {
  if (CELL.base.length < D) {
    CELL = { base: new Array(D), frac: new Array(D), corner: new Array(D) };
  }
  return CELL;
}
function scaledRow(D) {
  if (SCALED.length < D) SCALED = new Array(D);
  return SCALED;
}

// Value noise at a point, 0..1. Interpolates the hashes at the corners of the
// lattice cell the point falls in -- 2^D of them, which is 16 in 4D and is why
// this stays a loop rather than a written-out formula.
//
// `dims` says how many of `p`'s entries to read, for callers handing in a
// scratch row that is longer than the point. It defaults to all of them, so
// an ordinary caller passes a point and nothing else, and the dimension count
// still comes from the data rather than being fixed here.
export function valueNoise(p, seed = 0, dims = p.length) {
  const D = dims;
  const { base, frac, corner } = cell(D);
  for (let d = 0; d < D; d++) {
    const f = Math.floor(p[d]);
    base[d] = f;
    frac[d] = fade(p[d] - f);
  }
  let sum = 0;
  for (let i = 0; i < (1 << D); i++) {
    let weight = 1;
    for (let d = 0; d < D; d++) {
      const bit = (i >> d) & 1;
      corner[d] = base[d] + bit;
      weight *= bit ? frac[d] : 1 - frac[d];
    }
    // Corners on the far side of the cell contribute nothing when the point is
    // flush against the near face; skipping them is worth it in 4D, where most
    // of the sixteen are usually near zero.
    if (weight > 0) sum += weight * hash(corner, D, seed);
  }
  return sum;
}

// Several octaves of value noise stacked, each half the amplitude and twice the
// frequency of the one before.
//
// One octave is too even to read as a material -- it looks like a soft gradient.
// Marble wants a large slow shape with finer detail riding on it, which is
// exactly what summing octaves gives. Four is plenty at this scale; beyond that
// the detail is finer than a pixel.
export function fbm(p, { octaves = 4, seed = 0, lacunarity = 2, gain = 0.5 } = {}) {
  const D = p.length;
  // The scaled point goes in a scratch row too: `p.map` here was an array per
  // octave, four per fbm call, on top of the three valueNoise made below it.
  // The row can be longer than the point, so the dimension count is passed.
  const scaled = scaledRow(D);
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let o = 0; o < octaves; o++) {
    for (let d = 0; d < D; d++) scaled[d] = p[d] * freq;
    sum += amp * valueNoise(scaled, seed + o * 1013, D);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// The classic marble turbulence: run a smooth ramp through the noise so the
// field folds back on itself, which produces veins rather than blotches.
//
// Without the sine this is just fbm and reads as clouds. The sine is what makes
// the level sets long and thin -- a stone that has been folded -- and `veins`
// is how many times the ramp wraps across a unit of space, so it controls how
// close together those bands sit.
export function marble(p, { veins = 1.6, warp = 3.2, ...rest } = {}) {
  const t = p[0] * veins + fbm(p, rest) * warp;
  return 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
}

// The torus point and its slower copy. Four entries because a tiled surface is
// two circles, and two circles are four coordinates -- this is not the general
// n-dimensional path, so naming the four here fixes nothing that was free.
const TORUS = [0, 0, 0, 0];
const TORUS_SLOW = [0, 0, 0, 0];

// Marble on a torus, so the image tiles.
//
// A field sampled on a flat patch does not repeat: butt two copies together and
// the join shows. Sampling the unit square as a TORUS instead -- each of u and v
// taken round a circle in two more dimensions -- makes opposite edges the same
// points of the field rather than merely similar ones, so a tile can be
// repeated, and slid, without a seam anywhere.
//
// That is what lets the table's drift be a texture offset: the pattern can
// travel forever across a finite image. `reps` is how many vein-scales fit in
// one tile, which sets how much unique pattern there is before it repeats.
export function marbleTiled(u, v, { reps = 2, warp = 3.2, veins = 1.6, ...opts } = {}) {
  const a = u * Math.PI * 2, b = v * Math.PI * 2;
  const r = reps / (Math.PI * 2);
  // Two more scratch rows: this runs once per texel of the tile, a quarter of
  // a million times for a 512 bake, and the two points were a pair of arrays
  // each time.
  const p = TORUS;
  p[0] = Math.cos(a) * r; p[1] = Math.sin(a) * r;
  p[2] = Math.cos(b) * r; p[3] = Math.sin(b) * r;

  // The ramp is driven by the NOISE, not by a coordinate.
  //
  // Running it along an axis -- t = u * veins + noise -- is the classic marble
  // formula, and on a plane it works because the noise term is large enough to
  // bend the bands out of recognition. Bake that onto a tile with a modest warp
  // and what survives is the axis: measured, the pattern varied by 1.0 along u
  // and 0.09 along v, which is a set of parallel waves, not stone.
  //
  // Feeding a second, slower field in instead means the bands follow something
  // that has no preferred direction, so they close into loops and lenses the
  // way a folded rock does. The two fields are offset in the lattice rather
  // than merely reseeded, so they cannot drift into agreement.
  for (let d = 0; d < 4; d++) TORUS_SLOW[d] = p[d] * 0.45;
  const slow = fbm(TORUS_SLOW, { ...opts, octaves: 3, seed: (opts.seed || 0) + 7717 });
  const fine = fbm(p, opts);
  const t = (slow - 0.5) * veins * Math.PI * 4 + (fine - 0.5) * warp * Math.PI * 2;
  return 0.5 + 0.5 * Math.sin(t);
}
