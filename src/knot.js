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
// The player selects a cell and names a direction. Exactly one thing happens,
// chosen by what is legal there:
//
//   0. travel           -- if the rope already runs that way, walk the cursor
//                          along it and leave the rope alone
//   1. remove a detour  -- if the rope bulges the other way, pushing back
//                          absorbs it (the rope gets shorter)
//   2. offset a corner  -- if the cell is a bend that folds that way, slide it
//                          (same length)
//   3. add a detour     -- otherwise push the strand out that way (longer)
//
// Travel wins outright: a direction key either follows the rope or reshapes it,
// and which one it does can be read off the rope's own shape. Among the
// reshaping moves, shrink is tried first so pushing out and back is a true undo
// rather than a pile of slack.
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

  // 0. Travel -- the null motion, and it always wins. If the rope already runs
  //    this way, pushing means "walk along the strand": the cursor moves and
  //    the rope is untouched.
  //
  //    Winning outright is what makes the control predictable: a direction key
  //    either follows the rope or reshapes it, and which one it is can be read
  //    straight off the rope's own shape. The cost is that a corner fold can no
  //    longer be triggered from the bend cell itself (a fold's displacement is
  //    diagonal, so it always shares a component with a travel direction), but
  //    the fold is not lost -- it is the composition of a detour and a shrink,
  //    and the cursor is free to move, so the player can always stand somewhere
  //    the rope does not run and push from there.
  if (stepMatches(p, i, dir)) return { kind: 'advance', at: i + 1 };
  if (i > 0 && stepMatches(p, i - 1, dir.map((v) => -v))) {
    return { kind: 'advance', at: i - 1 };
  }


  // 1. Remove a detour. A hairpin at i+1 or i-1 pointing against `dir` means
  //    the rope doubles back; collapsing it is the natural "push back".
  for (const j of [i, i - 1, i + 1]) {
    if (j > 0 && j < p.length - 1 && canShrink(pz, j)) {
      const out = p[j].map((v, d) => v - p[j - 1][d]);
      // only if that hairpin sticks out opposite to where we are pushing
      let opposes = false;
      for (let d = 0; d < dir.length; d++) if (out[d] === -dir[d] && dir[d] !== 0) opposes = true;
      if (opposes) return { kind: 'shrink', at: j };
    }
  }
  for (let j = Math.max(0, i - 2); j <= i && j + 3 < p.length; j++) {
    if (!canShrinkEdge(pz, j)) continue;
    const out = p[j + 1].map((v, d) => v - p[j][d]);
    let opposes = false;
    for (let d = 0; d < dir.length; d++) if (out[d] === -dir[d] && dir[d] !== 0) opposes = true;
    if (opposes) return { kind: 'shrinkEdge', at: j };
  }

  // 2. Offset a corner: a bend here that folds toward `dir`.
  const t = canFlip(pz, i);
  if (t) {
    let along = 0;
    for (let d = 0; d < dir.length; d++) along += (t[d] - p[i][d]) * dir[d];
    if (along > 0) return { kind: 'flip', at: i };
  }

  // 3. Add a detour on whichever adjacent edge can take it.
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
  // Travelling along the rope changes nothing but the selection.
  if (plan.kind === 'advance') return plan.at;
  if (plan.kind === 'shrink') {
    applyShrink(pz, plan.at);
    return Math.min(i, pz.path.length - 1);
  }
  if (plan.kind === 'shrinkEdge') {
    applyShrinkEdge(pz, plan.at);
    return Math.min(i, pz.path.length - 1);
  }
  if (plan.kind === 'flip') {
    applyFlip(pz, plan.at);
    return plan.at;
  }
  applyGrowEdge(pz, plan.at, plan.dir);
  // Stay on the cell the push came from. Travel always wins, so if the cursor
  // followed the rope out onto the new detour, pushing back would walk along it
  // instead of absorbing it. Staying put keeps "push out, push back" a true
  // undo, and the player can travel onto the detour whenever they want it.
  return plan.at;
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
