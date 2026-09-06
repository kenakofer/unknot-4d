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
function hash(coords, seed) {
  let h = seed | 0;
  for (let d = 0; d < coords.length; d++) {
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

// Value noise at a point, 0..1. Interpolates the hashes at the corners of the
// lattice cell the point falls in -- 2^D of them, which is 16 in 4D and is why
// this stays a loop rather than a written-out formula.
export function valueNoise(p, seed = 0) {
  const D = p.length;
  const base = [], frac = [];
  for (let d = 0; d < D; d++) {
    const f = Math.floor(p[d]);
    base.push(f);
    frac.push(fade(p[d] - f));
  }
  let sum = 0;
  const corner = new Array(D);
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
    if (weight > 0) sum += weight * hash(corner, seed);
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
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(p.map((v) => v * freq), seed + o * 1013);
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
