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

// ---------------------------------------------------------------------------
// Push: the single sculpting move.
//
// The player selects a cell and names a direction. What happens depends only on
// what is in the cell one step that way:
//
//   next along the rope  -> move there, rope untouched
//   3 along the rope     -> cut out the 2 cells in between, move there
//   further along        -> nothing (cutting a long loop would untie knots)
//   empty                -> grow the strand out to it, move there
//
// In every case the cursor ends up in the cell it was pushed toward, and it is
// always on the rope. A push never reshapes a part of the strand the player is
// not pointing at: it either walks, cuts the little detour it is pointing
// across, or extends toward the empty cell it is pointing at.
// ---------------------------------------------------------------------------

// Does the rope leave cell i heading along `dir`?
function stepMatches(path, i, dir) {
  if (i < 0 || i + 1 >= path.length) return false;
  for (let d = 0; d < dir.length; d++) {
    if (path[i + 1][d] - path[i][d] !== dir[d]) return false;
  }
  return true;
}

export function planPush(pz, i, dir) {
  const p = pz.path;
  if (i < 0 || i >= p.length) return null;

  // 0. Move, don't reshape. If the cell one step along `dir` is already part of
  //    the rope, the cursor simply goes there and the rope is left alone. This
  //    covers walking along the strand, and also the case where the rope loops
  //    back so the neighbouring cell belongs to a distant part of the path.
  //
  //    Moving always wins over reshaping: a direction key either follows the
  //    rope or reshapes it, and which one it is can be read straight off the
  //    rope's own shape. The cost is that a corner fold can no longer be
  //    triggered from the bend cell itself (a fold's displacement is diagonal,
  //    so it always shares a component with a direction the rope already runs),
  //    but the fold is not lost -- it is a detour plus a shrink, and the cursor
  //    moves freely, so the player can stand where the rope does not run and
  //    push from there.
  const straightTo = pz.occupied.get(key(p[i].map((v, d) => v + dir[d])));
  if (straightTo !== undefined) {
    // The cell is the very next one along the strand: a plain step.
    if (Math.abs(straightTo - i) === 1) return { kind: 'advance', at: straightTo };
    // The rope comes back to a cell right next to us, but by a longer route.
    // Pushing that way means "cut out the little detour in between".
    //
    // This is only safe for a SHORT span. Deleting an arbitrary excursion
    // erases a loop that may be threaded through another part of the knot --
    // that is a strand passing through itself, not a deformation, and it would
    // untie knots that must stay tied. A three-step span is the longest that
    // cannot enclose anything: it is a unit square's worth of bump, the same
    // thing shrink removes, so nothing can be caught inside it.
    const lo = Math.min(i, straightTo), hi = Math.max(i, straightTo);
    if (hi - lo === 3) return { kind: 'shortcut', from: lo, to: hi };
    // A longer way round is not something a push may cut through. Fall through
    // to the reshaping moves.
  }


  // 2. Drag a corner along. If the rope turns at the cell next to us and that
  //    corner folds exactly onto the empty cell we are pushing toward, move it
  //    there. No cells are added or removed -- the bend just slides one step,
  //    which is how a detour gets walked along the rope until it collapses.
  const want = key(p[i].map((v, d) => v + dir[d]));
  for (const j of [i + 1, i - 1]) {
    if (j < 1 || j > p.length - 2) continue;
    const t = canFlip(pz, j);
    if (t && key(t) === want) return { kind: 'flip', at: j };
  }

  // 3. The target cell is empty and nothing could be folded into it, so reach
  //    it by pushing the strand out that way: two cells are added and the
  //    cursor lands on the one it asked for. Nothing else about the rope
  //    changes -- a push never reshapes a distant part of the strand.
  for (const j of [i, i - 1]) {
    if (canGrowEdge(pz, j, dir)) return { kind: 'grow', at: j, dir };
  }
  return null;
}

// Apply a plan from planPush. Returns the index the selection should move to,
// or -1 if nothing happened.
export function applyPush(pz, i, dir) {
  const plan = planPush(pz, i, dir);
  if (!plan) return -1;
  const p0 = pz.path[i].slice();
  // Travelling along the rope changes nothing but the selection.
  if (plan.kind === 'advance') return plan.at;
  if (plan.kind === 'shortcut') {
    // Splice out everything strictly between the two cells.
    const np = pz.path.slice(0, plan.from + 1).concat(pz.path.slice(plan.to));
    pz.path = np;
    pz.occupied = new Map();
    np.forEach((q, j) => pz.occupied.set(key(q), j));
  }
  else if (plan.kind === 'flip') applyFlip(pz, plan.at);
  else applyGrowEdge(pz, plan.at, plan.dir);

  // The cursor lands on the cell one step along `dir`, and it is always a cell
  // of the rope -- that is the contract: press a direction, end up there, still
  // on the strand. If the reshape did not put rope in that cell (absorbing a
  // detour removes the very cells it spanned), stay on the cell we started
  // from, which the rope still occupies.
  const at = pz.occupied.get(key(p0.map((v, d) => v + dir[d])));
  if (at !== undefined) return at;
  const home = pz.occupied.get(key(p0));
  if (home !== undefined) return home;
  // Unreachable in practice: every move above either keeps p0 on the rope or
  // puts rope in the target cell. Clamp rather than hand back a bad index.
  return Math.max(0, Math.min(i, pz.path.length - 1));
}

// ---------------------------------------------------------------------------
// Room to work.
//
// If a push would leave the box but the rope is not actually pressed against
// the far side, the whole path can slide the other way to make room. The
// puzzle is unchanged -- it is the same rope, just re-centred -- so this costs
// the player nothing and saves them from getting wedged in a corner.
// ---------------------------------------------------------------------------

// The path's bounding box along each axis.
export function extent(path) {
  const D = path[0].length;
  const lo = Array(D).fill(Infinity), hi = Array(D).fill(-Infinity);
  for (const p of path) {
    for (let d = 0; d < D; d++) {
      if (p[d] < lo[d]) lo[d] = p[d];
      if (p[d] > hi[d]) hi[d] = p[d];
    }
  }
  return { lo, hi };
}

// Can the whole rope shift by `dir` and stay in bounds? If so, do it.
export function shiftToMakeRoom(pz, dir) {
  const { lo, hi } = extent(pz.path);
  for (let d = 0; d < dir.length; d++) {
    if (dir[d] > 0 && hi[d] + dir[d] > pz.dims[d] - 1) return false;
    if (dir[d] < 0 && lo[d] + dir[d] < 0) return false;
  }
  pz.path = pz.path.map((p) => p.map((v, d) => v + dir[d]));
  pz.occupied = new Map();
  pz.path.forEach((p, j) => pz.occupied.set(key(p), j));
  return true;
}

// Push, making room first if the move is only blocked by the wall.
export function pushWithRoom(pz, i, dir) {
  const direct = applyPush(pz, i, dir);
  if (direct >= 0) return direct;
  // Blocked. If sliding the rope back against `dir` frees space, do that and
  // retry -- the player asked to go this way, so give them the room.
  const back = dir.map((v) => -v);
  if (!shiftToMakeRoom(pz, back)) return -1;
  const retry = applyPush(pz, i, dir);
  if (retry < 0) { shiftToMakeRoom(pz, dir); return -1; } // undo the shift
  return retry;
}

// Reverse the rope. Sculpting always works forwards from the selected cell, so
// flipping the strand end-for-end lets the player work the other way without
// any new controls.
export function reversePath(pz, sel) {
  pz.path = pz.path.slice().reverse();
  pz.occupied = new Map();
  pz.path.forEach((p, j) => pz.occupied.set(key(p), j));
  return pz.path.length - 1 - sel;
}
