// The point of the whole project: a knot that cannot be untied in 3D comes
// undone in 4D. Same rope, same move set, one extra dimension.
import { Puzzle, applyShrink, applyShrinkEdge, applyFlip, applyGrowEdge } from '../src/knot.js';
import { LEVELS } from '../src/levels.js';

function shrinkAll(dims, p) {
  let did = true;
  while (did) {
    did = false;
    for (let i = 1; i < p.path.length - 1; i++) {
      const q = new Puzzle(dims, p.path);
      if (applyShrink(q, i)) { p = q; did = true; break; }
    }
    if (did) continue;
    for (let i = 0; i < p.path.length - 3; i++) {
      const q = new Puzzle(dims, p.path);
      if (applyShrinkEdge(q, i)) { p = q; did = true; break; }
    }
  }
  return p;
}

// Lift random sub-arcs into other w-slices, jiggle, then pull slack out.
// In 4D a lifted strand cannot collide with what it left behind, so the
// crossings that make the knot simply dissolve.
export function untangle4D(dims, path, rounds = 4000) {
  let pz = shrinkAll(dims, new Puzzle(dims, path));
  const target = pz.target;
  let best = pz.length, bestPath = pz.path;
  for (let r = 0; r < rounds && best > target; r++) {
    let cur = new Puzzle(dims, bestPath);
    const n = cur.path.length;
    const a = 1 + Math.floor(Math.random() * (n - 3));
    const b = Math.min(n - 2, a + 1 + Math.floor(Math.random() * 8));
    const wUp = Array(dims.length).fill(0);
    wUp[3] = Math.random() < 0.5 ? 1 : -1;
    for (let i = a; i <= b; i++) {
      const q = new Puzzle(dims, cur.path);
      if (applyGrowEdge(q, i, wUp)) cur = q;
    }
    for (let k = 0; k < 40; k++) {
      const i = 1 + Math.floor(Math.random() * (cur.path.length - 2));
      const q = new Puzzle(dims, cur.path);
      if (applyFlip(q, i)) cur = q;
    }
    cur = shrinkAll(dims, cur);
    if (cur.length < best) { best = cur.length; bestPath = cur.path; }
  }
  return { best, target, solved: best === target, path: bestPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const L = LEVELS.find((l) => l.name === 'Trefoil');
  const dims = [10, 10, 10, 4];
  const r = untangle4D(dims, L.path.map((p) => [...p, 0]));
  const valid = new Puzzle(dims, r.path).validate();
  console.log(`4D trefoil: ${r.best} steps (target ${r.target}) solved=${r.solved} valid=${valid || 'ok'}`);
  process.exit(r.solved && !valid ? 0 : 1);
}
