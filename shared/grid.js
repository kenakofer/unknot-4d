// Grid primitives shared by every game here.
//
// A cell is a plain array of integers, one per dimension, and NOTHING in this
// file knows how many there are. That is deliberate: the same rules have to run
// a 2D board, a 3D one, a 4D one and, if it comes to that, a 5D one. Writing
// `p[0], p[1], p[2], p[3]` anywhere would quietly fix the dimension count and
// the family of games would stop being one family.
//
// `wrap` is a per-axis flag rather than a single setting, because the games
// mix them: 4D snake has walls on x, y and z and wraps around w, which is what
// makes the fourth direction feel like somewhere you can always go rather than
// another box to get cornered in.

export const key = (p) => p.join(',');

export function eq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Every unit step in a D-dimensional lattice: 2D of them, in axis order, minus
// first then plus. Used to enumerate neighbours -- for the lava glow, and for
// any game that needs to ask what is next to a cell.
export function unitDirs(D) {
  const out = [];
  for (let d = 0; d < D; d++) {
    for (const s of [-1, 1]) {
      const v = Array(D).fill(0);
      v[d] = s;
      out.push(v);
    }
  }
  return out;
}

// Step from `p` along `dir`, applying each axis's wall-or-wrap rule.
//
// Returns null when the step runs into a wall. A wrapping axis never returns
// null -- it comes out the other side -- which is the whole difference between
// the two and is stated here once rather than at every call site.
export function step(p, dir, dims, wrap = []) {
  const out = p.slice();
  for (let d = 0; d < p.length; d++) {
    if (!dir[d]) continue;
    let v = p[d] + dir[d];
    if (wrap[d]) {
      v = ((v % dims[d]) + dims[d]) % dims[d];
    } else if (v < 0 || v >= dims[d]) {
      return null;
    }
    out[d] = v;
  }
  return out;
}

export function inBounds(p, dims) {
  for (let d = 0; d < p.length; d++) {
    if (p[d] < 0 || p[d] >= dims[d]) return false;
  }
  return true;
}

// Every cell of the grid, in odometer order. Small grids only -- 6^4 is 1296,
// which is nothing; this is not for a space that could not be listed.
export function allCells(dims) {
  const out = [];
  const p = Array(dims.length).fill(0);
  for (;;) {
    out.push(p.slice());
    let d = dims.length - 1;
    while (d >= 0 && ++p[d] >= dims[d]) { p[d] = 0; d--; }
    if (d < 0) return out;
  }
}

// ---------------------------------------------------------------------------
// A boxed region: a rectangular block of cells given by a corner and a size.
// Lava is made of these, and so is anything else a game wants to fence off.
// ---------------------------------------------------------------------------

export class Box {
  constructor(origin, size) {
    this.origin = origin.slice();
    this.size = size.slice();
  }

  contains(p) {
    for (let d = 0; d < this.origin.length; d++) {
      const v = p[d] - this.origin[d];
      if (v < 0 || v >= this.size[d]) return false;
    }
    return true;
  }

  cells() {
    const out = [];
    const rel = Array(this.size.length).fill(0);
    for (;;) {
      out.push(this.origin.map((o, d) => o + rel[d]));
      let d = this.size.length - 1;
      while (d >= 0 && ++rel[d] >= this.size[d]) { rel[d] = 0; d--; }
      if (d < 0) return out;
    }
  }

  // Does this box share a cell with another? Boxes are axis-aligned, so they
  // overlap exactly when they overlap on every axis at once.
  overlaps(other) {
    for (let d = 0; d < this.origin.length; d++) {
      const aLo = this.origin[d], aHi = aLo + this.size[d];
      const bLo = other.origin[d], bHi = bLo + other.size[d];
      if (aHi <= bLo || bHi <= aLo) return false;
    }
    return true;
  }
}

// A permutation of `size` placed at a random corner, so a block of given
// proportions can appear in any orientation. `rng` is passed in rather than
// reached for, so a game can be replayed exactly from a seed.
//
// This is what puts the lava in "random orientations": a 3x2x2x1 block is the
// same block however its axes are ordered, and shuffling them is precisely the
// set of axis-aligned orientations it has.
export function randomBox(size, dims, rng = Math.random) {
  const perm = size.slice();
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const origin = perm.map((s, d) => Math.floor(rng() * (dims[d] - s + 1)));
  return new Box(origin, perm);
}

// A deterministic random source, so a game can be seeded and replayed. mulberry32.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
