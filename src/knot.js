// Core lattice-path model. No rendering, no DOM -- pure logic so it can be
// tested headlessly and reused by the 4D version later.
//
// A path is an array of integer lattice points. Consecutive points differ by
// exactly 1 along exactly one axis. The path is self-avoiding, and its two
// endpoints are pinned.
//
// Dimension is not hardcoded: points are arrays of length D, so the same code
// runs the 8^3 puzzle and the 5x5x5x3 one.

export const key = (p) => p.join(',');

export function manhattan(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

function inBounds(p, dims) {
  for (let i = 0; i < p.length; i++) {
    if (p[i] < 0 || p[i] >= dims[i]) return false;
  }
  return true;
}

// Steps differing by one unit along one axis.
function isUnitStep(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d === 1) diff++;
    else if (d !== 0) return false;
  }
  return diff === 1;
}

export class Puzzle {
  constructor(dims, path) {
    this.dims = dims.slice();
    this.path = path.map((p) => p.slice());
    this.occupied = new Map();
    this.path.forEach((p, i) => this.occupied.set(key(p), i));
  }

  clone() {
    return new Puzzle(this.dims, this.path);
  }

  get length() {
    return this.path.length - 1; // number of steps
  }

  // Minimum achievable length: straight-line distance between pinned ends.
  get target() {
    return manhattan(this.path[0], this.path[this.path.length - 1]);
  }

  get solved() {
    return this.length === this.target;
  }

  validate() {
    const seen = new Set();
    for (let i = 0; i < this.path.length; i++) {
      const p = this.path[i];
      if (!inBounds(p, this.dims)) return `point ${i} out of bounds`;
      const k = key(p);
      if (seen.has(k)) return `self-intersection at point ${i}`;
      seen.add(k);
      if (i > 0 && !isUnitStep(this.path[i - 1], p)) {
        return `non-unit step at ${i}`;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Moves
//
// The single atomic edit is a "corner flip": an interior vertex B with
// neighbours A and C that turn a corner (A, B, C not collinear) can be pushed
// to B' = A + C - B, the opposite corner of that unit square.
//
// Legality: B' must be in bounds and unoccupied. That is sufficient -- the
// square swept is exactly {A, B, B', C}, and A and C stay on the path, so no
// strand can pass through the interior of the square. This makes every flip an
// ambient isotopy: it can never change the knot type.
//
// A flip preserves path length, so on its own it can never solve anything.
// Length changes come from the two length-changing moves below.
// ---------------------------------------------------------------------------

export function flipTarget(path, i) {
  if (i <= 0 || i >= path.length - 1) return null;
  const A = path[i - 1], B = path[i], C = path[i + 1];
  const Bp = A.map((a, d) => a + C[d] - B[d]);
  // Collinear (a straight run) -> B' would equal B; nothing to flip.
  if (key(Bp) === key(B)) return null;
  return Bp;
}

export function canFlip(pz, i) {
  const Bp = flipTarget(pz.path, i);
  if (!Bp) return null;
  if (!inBounds(Bp, pz.dims)) return null;
  if (pz.occupied.has(key(Bp))) return null;
  return Bp;
}

export function applyFlip(pz, i) {
  const Bp = canFlip(pz, i);
  if (!Bp) return false;
  pz.occupied.delete(key(pz.path[i]));
  pz.path[i] = Bp;
  pz.occupied.set(key(Bp), i);
  return true;
}

// Shrink: if A and C are the same point (a hairpin: the path steps out to B and
// immediately back), delete the two steps. This is the move that shortens the
// path toward the taut goal.
export function canShrink(pz, i) {
  const p = pz.path;
  if (i <= 0 || i >= p.length - 1) return false;
  return key(p[i - 1]) === key(p[i + 1]);
}

// Slack: the inverse of shrink. A hairpin cannot be inserted at a vertex (that
// would repeat the vertex and break self-avoidance), so slack is added along an
// EDGE: the edge B->C is pushed sideways into B -> B' -> C' -> C, adding two
// steps. This is the true inverse of shrink and, with flips, generates the full
// isotopy group on lattice paths.
export function canGrowEdge(pz, i, dir) {
  const p = pz.path;
  if (i < 0 || i >= p.length - 1) return null;
  const B = p[i], C = p[i + 1];
  // dir must be perpendicular to the edge B->C.
  for (let d = 0; d < dir.length; d++) {
    if (dir[d] !== 0 && B[d] !== C[d]) return null;
  }
  const Bp = B.map((v, d) => v + dir[d]);
  const Cp = C.map((v, d) => v + dir[d]);
  if (!inBounds(Bp, pz.dims) || !inBounds(Cp, pz.dims)) return null;
  if (pz.occupied.has(key(Bp)) || pz.occupied.has(key(Cp))) return null;
  return [Bp, Cp];
}

export function applyGrowEdge(pz, i, dir) {
  const pair = canGrowEdge(pz, i, dir);
  if (!pair) return false;
  const np = pz.path.slice(0, i + 1).concat(pair, pz.path.slice(i + 1));
  pz.path = np;
  pz.occupied = new Map();
  np.forEach((q, j) => pz.occupied.set(key(q), j));
  return true;
}

// Edge shrink: the exact inverse of applyGrowEdge. If the path runs
// A -> B -> C -> D forming three sides of a unit square (A->B and C->D
// antiparallel, B->C one step), the bump collapses: B and C are deleted and the
// path goes straight from A to D. Without this, a square-topped bump can never
// be removed -- flips preserve length and hairpin-shrink does not apply.
export function canShrinkEdge(pz, i) {
  const p = pz.path;
  if (i < 0 || i + 3 >= p.length) return false;
  const A = p[i], B = p[i + 1], C = p[i + 2], D = p[i + 3];
  // A->D must be a single unit step (the collapsed edge).
  if (!isUnitStep(A, D)) return false;
  // B->C must be parallel to A->D, and A->B parallel to C->D (opposite sense).
  for (let d = 0; d < A.length; d++) {
    if (B[d] - A[d] !== C[d] - D[d]) return false;
  }
  return true;
}

export function applyShrinkEdge(pz, i) {
  if (!canShrinkEdge(pz, i)) return false;
  const np = pz.path.slice(0, i + 1).concat(pz.path.slice(i + 3));
  pz.path = np;
  pz.occupied = new Map();
  np.forEach((q, j) => pz.occupied.set(key(q), j));
  return true;
}

export function applyShrink(pz, i) {
  if (!canShrink(pz, i)) return false;
  const np = pz.path.slice(0, i).concat(pz.path.slice(i + 2));
  pz.path = np;
  pz.occupied = new Map();
  np.forEach((q, j) => pz.occupied.set(key(q), j));
  return true;
}

export function unitDirs(D) {
  const out = [];
  for (let d = 0; d < D; d++) {
    const a = Array(D).fill(0), b = Array(D).fill(0);
    a[d] = 1; b[d] = -1; out.push(a, b);
  }
  return out;
}
