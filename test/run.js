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
  eq('an empty cell is reached by growing', planPush(pz, 2, UP).kind, 'grow');
  const sel = applyPush(pz, 2, UP);
  eq('pushing out adds a detour', pz.length, 6);
  eq('detour is valid', pz.validate(), null);
  eq('the cursor lands on the new cell, in the pushed direction',
     pz.path[sel], [3,2,1]);

  // The detour is undone by pushing ACROSS it -- from the cell before it to the
  // cell after, which is three along the rope. Pushing away from it does not
  // touch it: a push never reshapes a part of the strand it is not pointing at.
  eq('pushing back down from the detour walks along the rope',
     planPush(pz, sel, DOWN).kind, 'advance');
  const origin = pz.occupied.get('3,1,1');
  eq('pushing east across the detour cuts it out',
     planPush(pz, origin, [1,0,0]).kind, 'shortcut');
  applyPush(pz, origin, [1,0,0]);
  eq('and that restores the rope', pz.path, straight);
}
{
  // Pushing off the rope's own line still reshapes it.
  const dims = [10, 10, 10];
  const pz = new Puzzle(dims, [[0,0,0],[1,0,0],[2,0,0],[2,1,0],[2,2,0]]);
  const plan = planPush(pz, 2, [0,0,1]);
  ok('an off-axis push reshapes', plan && plan.kind === 'grow',
     `got ${JSON.stringify(plan)}`);
  applyPush(pz, 2, [0,0,1]);
  eq('reshaped path is valid', pz.validate(), null);
}

console.log('\nthe null motion');
{
  // Pushing the way the rope already runs means "travel", not "reshape":
  // it walks the selection along the strand without touching the rope.
  const dims = [10, 10, 10];
  const straight = [[1,1,1],[2,1,1],[3,1,1],[4,1,1],[5,1,1]];
  const EAST = [1,0,0], WEST = [-1,0,0];
  const pz = new Puzzle(dims, straight);

  eq('pushing along the rope advances', planPush(pz, 1, EAST).kind, 'advance');
  eq('and lands on the next cell', applyPush(pz, 1, EAST), 2);
  eq('travelling leaves the rope alone', pz.path, straight);
  eq('pushing back down the rope retreats', applyPush(pz, 2, WEST), 1);
  eq('a pinned end can still be left', applyPush(pz, 0, EAST), 1);
  eq('still nothing changed', pz.path, straight);
}
{
  // Travel must not shadow the reshaping moves. After growing a detour the
  // selection sits where the rope turns; pushing back has to absorb it rather
  // than walk the cursor past it.
  const dims = [10, 10, 10];
  const straight = [[1,1,1],[2,1,1],[3,1,1],[4,1,1],[5,1,1]];
  const pz = new Puzzle(dims, straight);
  applyPush(pz, 2, [0,1,0]);
  eq('detour added', pz.length, 6);
  // Undo it by pushing across it, not by pushing away from it.
  const origin = pz.occupied.get('3,1,1');
  eq('pushing across the detour cuts it out',
     planPush(pz, origin, [1,0,0]).kind, 'shortcut');
  applyPush(pz, origin, [1,0,0]);
  eq('the round trip restores the rope', pz.path, straight);
}

{
  // Travel wins outright, including at a bend: a direction key either follows
  // the rope or reshapes it, and the rope's shape says which.
  const dims = [10, 10, 10];
  const pz = new Puzzle(dims, [[0,0,0],[1,0,0],[2,0,0],[2,1,0],[2,2,0]]);
  eq('at a bend, travelling wins', planPush(pz, 2, [0,1,0]).kind, 'advance');
  eq('and backwards along the rope too', planPush(pz, 2, [-1,0,0]).kind, 'advance');
  eq('the rope is untouched by travel', (applyPush(pz, 2, [0,1,0]), pz.path),
     [[0,0,0],[1,0,0],[2,0,0],[2,1,0],[2,2,0]]);
}

console.log('\nthe cursor goes where you pushed');
{
  // The contract of the control: after any legal push, the cursor sits one step
  // along the direction pressed. The only exception is an absorbing push whose
  // target cell is not on the rope afterwards -- there is nothing to select
  // there, so the cursor stays put.
  let checked = 0, unexplained = [];
  for (const L of LEVELS) {
    const dims = L.dims, dirs = unitDirs(dims.length);
    let pz = new Puzzle(dims, L.path);
    for (let step = 0; step < 400; step++) {
      const i = Math.floor(Math.random() * pz.path.length);
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const from = pz.path[i].slice();
      const plan = planPush(pz, i, dir);
      if (!plan) continue;
      const q = new Puzzle(dims, pz.path);
      const sel = applyPush(q, i, dir);
      if (sel < 0) continue;
      checked++;
      const to = q.path[sel];
      if (to.every((v, d) => v - from[d] === dir[d])) { pz = q; continue; }
      const want = from.map((v, d) => v + dir[d]).join(',');
      const absorbing = plan.kind === 'shrink' || plan.kind === 'shrinkEdge';
      if (!(absorbing && !q.occupied.has(want))) {
        unexplained.push({ kind: plan.kind, from, to, dir });
      }
      pz = q;
      if (pz.path.length > 120) pz = new Puzzle(dims, L.path);
    }
  }
  ok(`${checked} legal pushes land the cursor in the pushed direction`,
     unexplained.length === 0,
     unexplained.length ? JSON.stringify(unexplained[0]) : '');
}

{
  // Pushing toward a cell the rope reaches by a short way round cuts the little
  // detour out -- the cells in between go, and the cursor lands on the target.
  const dims = [10, 10, 10];
  const pz = new Puzzle(dims, [[1,1,1],[2,1,1],[3,1,1],[3,2,1],[4,2,1],[4,1,1],[5,1,1]]);
  const plan = planPush(pz, 2, [1,0,0]);       // [3,1,1] east toward [4,1,1]
  eq('a three-step detour ahead is cut out', plan.kind, 'shortcut');
  const sel = applyPush(pz, 2, [1,0,0]);
  eq('the two intermediate cells are gone', pz.length, 4);
  eq('the rope runs straight now', pz.path,
     [[1,1,1],[2,1,1],[3,1,1],[4,1,1],[5,1,1]]);
  eq('and the cursor is one step east, on the rope', pz.path[sel], [4,1,1]);
}
{
  // A LONGER way round must not be cut. Deleting an arbitrary excursion erases
  // a loop that may be threaded through another strand -- that is the rope
  // passing through itself, and it would untie knots that must stay tied.
  const dims = [10, 10, 10];
  const pz = new Puzzle(dims,
    [[1,1,1],[2,1,1],[2,2,1],[2,3,1],[3,3,1],[4,3,1],[4,2,1],[4,1,1],[3,1,1],[3,0,1]]);
  const plan = planPush(pz, 1, [1,0,0]);       // [2,1,1] east toward [3,1,1], 7 apart
  ok('a long way round is never cut through',
     !plan || plan.kind !== 'shortcut', `got ${JSON.stringify(plan)}`);
}
{
  // The cursor is always on the rope, before and after.
  let checked = 0, off = 0;
  for (const L of LEVELS) {
    const dims = L.dims, dirs = unitDirs(dims.length);
    let pz = new Puzzle(dims, L.path);
    for (let s = 0; s < 300; s++) {
      const i = Math.floor(Math.random() * pz.path.length);
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      if (!planPush(pz, i, dir)) continue;
      const q = new Puzzle(dims, pz.path);
      const sel = applyPush(q, i, dir);
      if (sel < 0) continue;
      checked++;
      if (sel < 0 || sel >= q.path.length) off++;
      pz = q;
      if (pz.path.length > 120) pz = new Puzzle(dims, L.path);
    }
  }
  ok(`the cursor stays on the rope across ${checked} pushes`, off === 0, `${off} off-rope`);
}

{
  // Cutting out a detour must never untie a knot. This is the property the
  // whole puzzle rests on: if a push could delete a loop that is threaded
  // through another strand, the rope would be passing through itself and the
  // impossible levels would become solvable.
  const L = LEVELS.find((l) => l.name === 'Trefoil');
  const box = Math.max(...L.dims);
  const dirs = unitDirs(3);
  let pz = new Puzzle(L.dims, L.path);
  const det0 = arcDeterminant(pz.path, box);
  let shortcuts = 0, changed = false;
  for (let s = 0; s < 1200 && !changed; s++) {
    const i = Math.floor(Math.random() * pz.path.length);
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    const plan = planPush(pz, i, dir);
    if (!plan) continue;
    const q = new Puzzle(L.dims, pz.path);
    if (applyPush(q, i, dir) < 0 || q.validate()) continue;
    if (plan.kind === 'shortcut') shortcuts++;
    pz = q;
    if (s % 150 === 0 && arcDeterminant(pz.path, box) !== det0) changed = true;
    if (pz.path.length > 140) pz = new Puzzle(L.dims, L.path);
  }
  eq('the trefoil starts knotted', det0, 3);
  ok(`the knot survives ${shortcuts} detour cuts`, !changed);
}

{
  // A push only ever does one of three things, and never reshapes a part of the
  // strand the player is not pointing at. Standing beside a detour and pushing
  // away from it must grow toward the empty cell, not collapse the detour.
  const dims = [10, 10, 10];
  const pz = new Puzzle(dims, [[1,1,1],[2,1,1],[3,1,1],[3,2,1],[4,2,1],[4,1,1],[5,1,1]]);
  const plan = planPush(pz, 2, [0,-1,0]);     // at [3,1,1], push away from the bump
  eq('pushing into empty space grows', plan.kind, 'grow');
  const sel = applyPush(pz, 2, [0,-1,0]);
  eq('and the cursor goes where it was pushed', pz.path[sel], [3,0,1]);
  ok('the detour above is left alone',
     pz.occupied.has('3,2,1') && pz.occupied.has('4,2,1'));
}
{
  // Only these four outcomes are reachable at all.
  const seen = new Set();
  for (const L of LEVELS) {
    const dims = L.dims, dirs = unitDirs(dims.length);
    let pz = new Puzzle(dims, L.path);
    for (let s = 0; s < 500; s++) {
      const i = Math.floor(Math.random() * pz.path.length);
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const plan = planPush(pz, i, dir);
      if (!plan) continue;
      seen.add(plan.kind);
      const q = new Puzzle(dims, pz.path);
      if (applyPush(q, i, dir) >= 0 && !q.validate()) pz = q;
      if (pz.path.length > 120) pz = new Puzzle(dims, L.path);
    }
  }
  eq('a push is only ever move, slide a corner, cut, or grow',
     [...seen].sort(), ['advance', 'flip', 'grow', 'shortcut']);
}

{
  // The corner walk: on First bump, pressing right repeatedly should drag the
  // bend along the rope until the detour collapses, without ever adding cells.
  const L = LEVELS.find((l) => l.name === 'First bump');
  const pz = new Puzzle(L.dims, L.path);
  const kinds = [];
  const lengths = [];
  let sel = 0;
  for (let k = 0; k < 4; k++) {
    const plan = planPush(pz, sel, [1,0,0]);
    if (!plan) break;
    kinds.push(plan.kind);
    sel = pushWithRoom(pz, sel, [1,0,0]);
    lengths.push(pz.length);
  }
  eq('right, right, right walks the corner and drops the detour',
     kinds, ['advance', 'flip', 'shortcut', 'advance']);
  eq('sliding the corner adds no cells', lengths[1], 7);
  eq('and the detour collapse takes two off', lengths[2], 5);
  ok('the level is solved by pressing right', pz.solved);
  eq('the rope is still valid', pz.validate(), null);
}

{
  // A flip slides a corner NEXT to the cursor, never the cursor's own cell, so
  // the cell the push came from is on the rope before and after.
  let flips = 0, sourceGone = 0;
  for (const L of LEVELS) {
    const dims = L.dims, dirs = unitDirs(dims.length);
    let pz = new Puzzle(dims, L.path);
    for (let s = 0; s < 400; s++) {
      const i = Math.floor(Math.random() * pz.path.length);
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const plan = planPush(pz, i, dir);
      if (!plan) continue;
      const from = pz.path[i].slice().join(',');
      const q = new Puzzle(dims, pz.path);
      if (applyPush(q, i, dir) < 0) continue;
      if (plan.kind === 'flip') {
        flips++;
        if (!q.occupied.has(from)) sourceGone++;
      }
      pz = q;
      if (pz.path.length > 120) pz = new Puzzle(dims, L.path);
    }
  }
  ok(`the source cell survives all ${flips} corner slides`, sourceGone === 0,
     `${sourceGone} lost it`);
}
{
  // Sliding a corner is preferred to growing a detour behind: it reaches the
  // same cell without lengthening the rope.
  let both = 0, notFlip = 0;
  for (const L of LEVELS) {
    const dims = L.dims, dirs = unitDirs(dims.length);
    let pz = new Puzzle(dims, L.path);
    for (let s = 0; s < 400; s++) {
      const i = Math.floor(Math.random() * pz.path.length);
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const plan = planPush(pz, i, dir);
      if (!plan) continue;
      const want = pz.path[i].map((v, d) => v + dir[d]).join(',');
      let flipOk = false;
      for (const j of [i + 1, i - 1]) {
        if (j < 1 || j > pz.path.length - 2) continue;
        const t = canFlip(pz, j);
        if (t && t.join(',') === want) flipOk = true;
      }
      const growOk = !!(canGrowEdge(pz, i, dir) || canGrowEdge(pz, i - 1, dir));
      if (flipOk && growOk) { both++; if (plan.kind !== 'flip') notFlip++; }
      const q = new Puzzle(dims, pz.path);
      if (applyPush(q, i, dir) >= 0) pz = q;
      if (pz.path.length > 120) pz = new Puzzle(dims, L.path);
    }
  }
  ok(`sliding a corner beats growing in all ${both} contested cases`,
     notFlip === 0, `${notFlip} grew instead`);
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

console.log('\nstepping backwards turns the rope around');
{
  // The UI has no reverse key: walking back down the strand flips it, so the
  // cursor is always pointing the way the player is heading. Model the step the
  // way app.js does and check the cell under the cursor never moves.
  const dims = [8, 8, 8];
  const path = [[0,0,0],[1,0,0],[2,0,0],[2,1,0],[3,1,0]];
  const pz = new Puzzle(dims, path);

  const stepBack = (sel, dir) => {
    const plan = planPush(pz, sel, dir);
    eq('  a backwards push is a plain advance', plan.kind, 'advance');
    eq('  and it goes back down the strand', plan.at < sel, true);
    return reversePath(pz, plan.at);
  };

  const sel = stepBack(3, [0,-1,0]);          // at [2,1,0], push down -> [2,0,0]
  eq('the cursor sits on the cell it moved to', pz.path[sel], [2,0,0]);
  eq('which is now nearer the tail', sel, 2);
  eq('the rope runs the other way', pz.path[0], [3,1,0]);
  eq('the rope is still valid', pz.validate(), null);

  // Ahead of the cursor is where the old rope came FROM, so pushing on lands on
  // the neighbour the player just left.
  const on = planPush(pz, sel, [-1,0,0]);   // [2,0,0] -> [1,0,0], down the strand
  eq('pushing on keeps travelling', on.kind, 'advance');
  eq('and moves forwards now', on.at, sel + 1);
  eq('onto the next cell along', pz.path[on.at], [1,0,0]);

  // Stepping back again flips it back, so the pair is a no-op on the shape.
  const sel2 = stepBack(on.at, [1,0,0]);    // [1,0,0] -> [2,0,0], back again
  eq('back again restores the original path', pz.path, path);
  eq('with the cursor where it started', pz.path[sel2], [2,0,0]);
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
