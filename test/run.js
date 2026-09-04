// Test suite. Run with: npm test
import { Puzzle, applyFlip, canFlip, flipTarget, applyShrink, applyShrinkEdge,
         applyGrowEdge, canGrowEdge, unitDirs, planPush, applyPush,
         pushWithRoom, reversePath } from '../src/knot.js';
import { knotDeterminant, arcDeterminant } from '../src/invariant.js';
import { LEVELS } from '../src/levels.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

console.log('\nlattice model');
{
  const pz = new Puzzle([8,8,8], [[0,0,0],[1,0,0],[2,0,0]]);
  eq('straight path is valid', pz.validate(), null);
  eq('length counts steps', pz.length, 2);
  eq('target is manhattan distance', pz.target, 2);
  ok('straight path is solved', pz.solved);
}
{
  const pz = new Puzzle([8,8,8], [[0,0,0],[2,0,0]]);
  ok('non-unit step rejected', pz.validate() !== null);
}
{
  const pz = new Puzzle([8,8,8], [[0,0,0],[1,0,0],[0,0,0]]);
  ok('self-intersection rejected', pz.validate() !== null);
}

console.log('\nmoves preserve validity');
{
  const pz = new Puzzle([8,8,8], [[0,0,0],[1,0,0],[1,1,0],[1,2,0]]);
  const before = pz.length;
  ok('flip applies at a corner', applyFlip(pz, 1));
  eq('flip preserves length', pz.length, before);
  eq('flip keeps path valid', pz.validate(), null);
}
{
  const pz = new Puzzle([8,8,8], [[0,0,0],[1,0,0],[2,0,0]]);
  eq('no flip on a straight run', canFlip(pz, 1), null);
}
{
  // grow then shrink returns to the original path
  const start = [[0,0,0],[1,0,0],[2,0,0],[3,0,0]];
  const pz = new Puzzle([8,8,8], start);
  ok('grow-edge applies', applyGrowEdge(pz, 1, [0,1,0]));
  eq('grow adds two steps', pz.length, 5);
  eq('grown path valid', pz.validate(), null);
  ok('shrink-edge undoes it', applyShrinkEdge(pz, 1));
  eq('back to original', pz.path, start);
}
{
  const pz = new Puzzle([8,8,8], [[0,0,0],[1,0,0],[1,1,0],[1,0,0]]);
  ok('hairpin detected as invalid path', pz.validate() !== null);
}

console.log('\nsliding a bend along the rope');
{
  // A corner flip IS a one-step slide: the bend moves one cell down the strand
  // and the rope's length and shape are unchanged.
  const dims = [12, 12, 12];
  const path = [];
  for (let x = 0; x <= 6; x++) path.push([x, 0, 0]);
  for (let y = 1; y <= 5; y++) path.push([6, y, 0]);

  const isBend = (p, i) =>
    i > 0 && i < p.path.length - 1 && flipTarget(p.path, i) !== null;
  const slideOnce = (p, i, toward) => {
    if (!isBend(p, i) || !canFlip(p, i)) return -1;
    applyFlip(p, i);
    for (const j of (toward > 0 ? [i + 1, i - 1] : [i - 1, i + 1])) {
      if (isBend(p, j)) return j;
    }
    return -1;
  };

  const pz = new Puzzle(dims, path);
  const len0 = pz.length;
  let i = 6, steps = 0;
  while (true) {
    const ni = slideOnce(pz, i, -1);
    if (ni < 0) break;
    i = ni;
    steps++;
  }
  ok('bend walks the length of a free run', steps === 5, `walked ${steps}`);
  eq('sliding preserves rope length', pz.length, len0);
  eq('slid path is still valid', pz.validate(), null);
  eq('the two ends never move', [pz.path[0], pz.path[pz.path.length - 1]],
     [[0, 0, 0], [6, 5, 0]]);
}
{
  // A bend cannot slide into rope that is already there.
  const dims = [8, 8, 8];
  const pz = new Puzzle(dims, [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,2,0],[1,2,0]]);
  const blocked = canFlip(pz, 2);
  ok('a blocked bend refuses to slide', blocked === null,
     `canFlip gave ${JSON.stringify(blocked)}`);
}

console.log('\npush: one key, whichever move is legal');
{
  const dims = [10, 10, 10];
  const straight = [[1,1,1],[2,1,1],[3,1,1],[4,1,1],[5,1,1]];
  const UP = [0,1,0], DOWN = [0,-1,0];

  const pz = new Puzzle(dims, straight);
  eq('a straight run has nothing to shrink', planPush(pz, 2, UP).kind, 'grow');
  const sel = applyPush(pz, 2, UP);
  eq('pushing out adds a detour', pz.length, 6);
  eq('detour is valid', pz.validate(), null);
  ok('selection follows the rope', sel > 0);

  // Pushing back the other way must absorb it, not pile on more slack.
  eq('pushing back removes the detour', planPush(pz, sel, DOWN).kind, 'shrinkEdge');
  applyPush(pz, sel, DOWN);
  eq('push then push-back is a true undo', pz.path, straight);
}
{
  // A bend that folds the pushed way is offset, keeping the length.
  const dims = [10, 10, 10];
  const pz = new Puzzle(dims, [[0,0,0],[1,0,0],[2,0,0],[2,1,0],[2,2,0]]);
  const before = pz.length;
  const plan = planPush(pz, 2, [-1,0,0]);
  ok('a bend offsets rather than growing', plan && plan.kind === 'flip',
     `got ${JSON.stringify(plan)}`);
  applyPush(pz, 2, [-1,0,0]);
  eq('offsetting keeps the length', pz.length, before);
  eq('offset path is valid', pz.validate(), null);
}

console.log('\nroom to work');
{
  // Pressed against a wall, the rope slides over rather than refusing.
  const dims = [6, 6, 6];
  const path = [[1,5,1],[2,5,1],[3,5,1],[4,5,1]];
  eq('a plain push into the wall fails', applyPush(new Puzzle(dims, path), 1, [0,1,0]), -1);
  const pz = new Puzzle(dims, path);
  const sel = pushWithRoom(pz, 1, [0,1,0]);
  ok('pushWithRoom makes room and succeeds', sel >= 0);
  eq('the rope stays valid after shifting', pz.validate(), null);
  eq('shifting does not change the rope length', pz.length, 5);
}
{
  // With no room on either side it must fail cleanly, leaving the rope alone.
  const dims = [1, 3, 1];
  const path = [[0,0,0],[0,1,0],[0,2,0]];
  const pz = new Puzzle(dims, path);
  const before = JSON.stringify(pz.path);
  eq('a truly boxed-in push fails', pushWithRoom(pz, 1, [1,0,0]), -1);
  eq('and leaves the rope untouched', JSON.stringify(pz.path), before);
}

console.log('\nreversing the rope');
{
  const dims = [8, 8, 8];
  const path = [[0,0,0],[1,0,0],[1,1,0],[2,1,0]];
  const pz = new Puzzle(dims, path);
  const sel = reversePath(pz, 0);
  eq('reversing flips the path', pz.path, path.slice().reverse());
  eq('the selection follows its cell', sel, 3);
  eq('reversed path is valid', pz.validate(), null);
  eq('reversing twice restores the original', (reversePath(pz, sel), pz.path), path);
}

console.log('\nlifting a level into 4D');
{
  // Lifting adds a w of 0 to every cell: the rope does not move, it just gains
  // somewhere new to go. The knot is unchanged, so the puzzle is too.
  const path3 = [[1,1,1],[2,1,1],[2,2,1],[3,2,1],[4,2,1],[4,1,1],[5,1,1],[6,1,1]];
  const pz3 = new Puzzle([8,8,8], path3);
  const lifted = path3.map((p) => [...p, 0]);
  const size = 8;
  const pz4 = new Puzzle([size,size,size,size], lifted);
  eq('lifted path is valid', pz4.validate(), null);
  eq('lifting does not change the length', pz4.length, pz3.length);
  eq('lifting does not change the taut target', pz4.target, pz3.target);
  ok('the lifted box is symmetric', new Set(pz4.dims).size === 1);
  eq('dropping back recovers the original', pz4.path.map((p) => p.slice(0,3)), path3);
}
{
  // A rope that has moved off the w = 0 slice cannot be dropped back to 3D --
  // part of it would have nowhere to go.
  const pz = new Puzzle([6,6,6,6], [[1,1,1,0],[2,1,1,0],[2,1,1,1].slice(0,3).concat([1])]);
  const flat = pz.path.every((p) => p[3] === 0);
  ok('a rope using w is detected as not flat', !flat);
}

console.log('\nknot invariant');
{
  eq('unknot square', knotDeterminant([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,0]]), 1);
  const tre = [];
  for (let k = 0; k < 120; k++) {
    const t = 2*Math.PI*k/120;
    tre.push([Math.sin(t)+2*Math.sin(2*t), Math.cos(t)-2*Math.cos(2*t), -Math.sin(3*t)]);
  }
  tre.push(tre[0]);
  eq('trefoil determinant', knotDeterminant(tre), 3);
  const fig = [];
  for (let k = 0; k < 160; k++) {
    const t = 2*Math.PI*k/160;
    fig.push([(2+Math.cos(2*t))*Math.cos(3*t), (2+Math.cos(2*t))*Math.sin(3*t), Math.sin(4*t)]);
  }
  fig.push(fig[0]);
  eq('figure-eight determinant', knotDeterminant(fig), 5);
}

console.log('\nlevels');
for (const L of LEVELS) {
  const pz = new Puzzle(L.dims, L.path);
  eq(`${L.name}: valid`, pz.validate(), null);
  ok(`${L.name}: starts unsolved`, !pz.solved);
  // The determinant is a 3D invariant: it is computed from a planar diagram,
  // which only makes sense for a path in 3-space. The 4D level's 3D shadow is
  // still a trefoil (det 3), but that says nothing about whether it can be
  // untied -- in 4D it can. So only 3D levels are checked here.
  if (L.dims.length > 3) continue;
  const det = arcDeterminant(L.path, Math.max(...L.dims));
  if (L.expect === 'solvable') eq(`${L.name}: unknotted (det 1)`, det, 1);
  else ok(`${L.name}: knotted (det ${det} > 1)`, det > 1);
}

console.log('\ninvariant is conserved by every move');
{
  const L = LEVELS.find((l) => l.expect === 'impossible');
  const box = Math.max(...L.dims);
  let pz = new Puzzle(L.dims, L.path);
  const det0 = arcDeterminant(pz.path, box);
  const dirs = unitDirs(3);
  let changed = false, steps = 0;
  for (let s = 0; s < 400; s++) {
    const cand = [];
    for (let i = 1; i < pz.path.length - 1; i++) cand.push(['flip', i]);
    for (let i = 0; i < pz.path.length - 1; i++) for (const d of dirs) cand.push(['grow', i, d]);
    for (let i = 0; i < pz.path.length - 3; i++) cand.push(['shrinkE', i]);
    cand.sort(() => Math.random() - 0.5);
    let applied = false;
    for (const m of cand) {
      const q = new Puzzle(L.dims, pz.path);
      let good = false;
      if (m[0] === 'flip') good = applyFlip(q, m[1]);
      else if (m[0] === 'grow') good = q.length < pz.length + 8 && applyGrowEdge(q, m[1], m[2]);
      else good = applyShrinkEdge(q, m[1]);
      if (good) { pz = q; applied = true; break; }
    }
    if (!applied) break;
    steps++;
    if (s % 80 === 0 && arcDeterminant(pz.path, box) !== det0) { changed = true; break; }
  }
  ok(`determinant unchanged over ${steps} random legal moves`, !changed);
  eq('path still valid after random play', pz.validate(), null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
