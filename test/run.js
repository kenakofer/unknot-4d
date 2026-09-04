// Test suite. Run with: npm test
import { Puzzle, applyFlip, canFlip, applyShrink, applyShrinkEdge,
         applyGrowEdge, canGrowEdge, unitDirs } from '../src/knot.js';
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
