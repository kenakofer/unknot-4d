// Snake model tests. Run with: npm test
//
// Every test builds the board explicitly rather than trusting a seed, because
// the interesting cases -- eating into your own tail, the wall at the end of w,
// the two-turn growth -- are exactly the ones a random board almost never
// produces.
import { Snake, CAUSE, DEFAULTS } from '../src/snake.js';
import { LESSONS } from '../src/tutorial.js';
import { Box, makeRng, allCells, eq as cellEq } from '../../shared/grid.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// A board with no lava and a snake we place ourselves, so a test can say
// exactly what it means. The apple is parked out of the way unless the test
// moves it.
function board(body, opts = {}) {
  const g = new Snake({ seed: 1, lavaCount: 0, ...opts });
  g.lava = opts.lava || [];
  g._glowCache = null;
  g.body = body.map((p) => p.slice());
  // The heading follows the placed body, as the model's own reset derives it.
  // Left over from the seeded snake it would depend on which way that one
  // happened to point.
  g.heading = g.body.length > 1
    ? g.body[0].map((v, d) => g.axisDelta(g.body[1][d], v, d))
    : null;
  g.pending = opts.pending || 0;
  g.apple = opts.apple === undefined ? [5, 5, 5, 5] : opts.apple;
  g.over = false;
  g.cause = null;
  return g;
}

// Step from a cell, honouring the game's own walls and wraps.
const gstep = (g, p, dir) => {
  const out = p.slice();
  for (let d = 0; d < p.length; d++) {
    if (!dir[d]) continue;
    let v = p[d] + dir[d];
    if (g.wrap[d]) v = ((v % g.dims[d]) + g.dims[d]) % g.dims[d];
    else if (v < 0 || v >= g.dims[d]) return null;
    out[d] = v;
  }
  return out;
};

const E = [1, 0, 0, 0];   // east
const W = [-1, 0, 0, 0];  // west
const UP = [0, 1, 0, 0];
const WF = [0, 0, 0, 1];  // forward along w
const WB = [0, 0, 0, -1];
// Every axis is walled by default. The model still supports a wrap per axis,
// which is what an optional all-axes wrap would use, so it stays tested here.
const WRAP_W = { wrap: [false, false, false, true] };

console.log('\nthe board');
{
  const g = new Snake({ seed: 7 });
  eq('default space is 6^4', g.dims, [6, 6, 6, 6]);
  eq('snake starts 4 long', g.length, 4);
  eq('score starts at zero', g.score, 0);
  ok('an apple exists', !!g.apple);
  ok('the apple is not on the snake', !g.occupied(g.apple));
  ok('the apple is not in lava', !g.isLava(g.apple));
  eq('three lava blocks', g.lava.length, 3);
  ok('the snake starts clear of lava', g.body.every((p) => !g.isLava(p)));
  ok('the snake is 4 distinct cells',
     new Set(g.body.map(String)).size === 4);
}
{
  // The starting run must be straight, and consecutive cells adjacent.
  for (let s = 0; s < 40; s++) {
    const g = new Snake({ seed: s });
    let straightAndJoined = true;
    for (let i = 0; i + 1 < g.body.length; i++) {
      let steps = 0;
      for (let d = 0; d < 4; d++) {
        if (g.body[i][d] !== g.body[i + 1][d]) steps++;
      }
      if (steps !== 1) straightAndJoined = false;
    }
    if (!straightAndJoined) { ok(`seed ${s} starts as a joined run`, false); break; }
    if (s === 39) ok('40 seeds all start as a joined straight run', true);
  }
}
{
  // Lava never overlaps lava, and every block is the right size.
  let clean = true, sized = true;
  for (let s = 0; s < 60; s++) {
    const g = new Snake({ seed: s });
    for (let i = 0; i < g.lava.length; i++) {
      const vol = g.lava[i].size.reduce((a, b) => a * b, 1);
      if (vol !== 12) sized = false;
      if ([...g.lava[i].size].sort().join() !== '1,2,2,3') sized = false;
      for (let j = i + 1; j < g.lava.length; j++) {
        if (g.lava[i].overlaps(g.lava[j])) clean = false;
      }
    }
  }
  ok('lava blocks never overlap, across 60 seeds', clean);
  ok('every lava block is a 3x2x2x1 in some orientation', sized);
}
{
  // Random orientation really is random: over many seeds the long axis should
  // land on more than one dimension.
  const axes = new Set();
  for (let s = 0; s < 60; s++) {
    for (const b of new Snake({ seed: s }).lava) axes.add(b.size.indexOf(3));
  }
  ok('the 3-long axis varies across seeds', axes.size >= 3,
     `saw axes ${[...axes]}`);
}
{
  const g = new Snake({ seed: 3 });
  ok('lava stays inside the box',
     g.lava.every((b) => b.origin.every((o, d) => o >= 0 && o + b.size[d] <= 6)));
}

console.log('\nthe opening position is never a trap');
{
  // The head must have clear air in EVERY direction it could turn -- not just
  // ahead of it. A player who dies on their first press was cheated rather
  // than beaten, and a 6^4 board has room to be fair with.
  //
  // The neck is excluded: pressing back into it is refused rather than fatal,
  // so it is not a way to die and not a way to be trapped.
  let bad = null;
  for (let s = 0; s < 400 && !bad; s++) {
    const g = new Snake({ seed: s });
    const head = g.body[0], neck = g.body[1];
    for (let d = 0; d < 4 && !bad; d++) {
      for (const sign of [-1, 1]) {
        const dir = [0, 0, 0, 0];
        dir[d] = sign;
        const to = gstep(g, head, dir);
        if (!to) { bad = `seed ${s}: wall at axis ${d}${sign > 0 ? '+' : '-'}`; break; }
        if (neck && cellEq(to, neck)) continue;
        if (g.isLava(to)) { bad = `seed ${s}: lava at axis ${d}${sign > 0 ? '+' : '-'}`; break; }
        if (g.body.some((b) => cellEq(b, to))) {
          bad = `seed ${s}: own body at axis ${d}${sign > 0 ? '+' : '-'}`; break;
        }
      }
    }
  }
  ok('no direction from the head is fatal, across 400 seeds', !bad, bad || '');
}
{
  // Every direction is genuinely available on turn one -- the model's own
  // planner agrees with the geometry above.
  let allOpen = true;
  for (let s = 0; s < 200; s++) {
    const g = new Snake({ seed: s });
    const dirs = [];
    for (let d = 0; d < 4; d++) for (const sg of [-1, 1]) {
      const v = [0, 0, 0, 0]; v[d] = sg; dirs.push(v);
    }
    const kinds = dirs.map((d) => g.plan(d).kind);
    // Seven moves and exactly one reversal; nothing fatal.
    if (kinds.filter((k) => k === 'move').length !== 7) allOpen = false;
    if (kinds.filter((k) => k === 'reversal').length !== 1) allOpen = false;
    if (kinds.some((k) => k === 'die')) allOpen = false;
  }
  ok('every first press is a legal move, across 200 seeds', allOpen);
}
{
  // The snake is never laid along w. A snake spread along the fourth axis
  // starts as disconnected cubes in several rooms -- the least readable
  // opening possible, and the least like a snake.
  const axes = {};
  let alongW = 0;
  for (let s = 0; s < 400; s++) {
    const g = new Snake({ seed: s });
    const ax = [0, 1, 2, 3].find((d) => g.body[0][d] !== g.body[1][d]);
    axes[ax] = (axes[ax] || 0) + 1;
    if (ax === 3) alongW++;
  }
  eq('never laid along w', alongW, 0);
  ok('and it uses all three drawn axes',
     [0, 1, 2].every((d) => axes[d] > 0), JSON.stringify(axes));
  ok('so the whole snake starts in one slice, across 400 seeds',
     (() => {
       for (let s = 0; s < 400; s++) {
         const g = new Snake({ seed: s });
         const w = g.body[0][3];
         if (!g.body.every((c) => c[3] === w)) return false;
       }
       return true;
     })());
}
{
  // Wrapping changes nothing about where the snake is laid: still along a
  // drawn axis, still one joined run.
  const g = new Snake({ dims: [6, 6, 6, 6], wrap: [true, true, true, true],
                        seed: 5 });
  eq('an all-wrapping board still gets a snake', g.length, 4);
  ok('and it is a joined run', (() => {
    for (let i = 0; i + 1 < g.body.length; i++) {
      let steps = 0;
      for (let d = 0; d < 4; d++) if (g.body[i][d] !== g.body[i + 1][d]) steps++;
      if (steps !== 1) return false;
    }
    return true;
  })());
}

console.log('\na lesson can place its own layout');
{
  // A tutorial that teaches "go around the wall" needs the wall in the way,
  // which random placement cannot promise. So lava, the starting body and the
  // first apple can all be given explicitly.
  const g = new Snake({
    dims: [8, 8], wrap: [false, false],
    lava: [{ origin: [4, 0], size: [1, 6] }],
    body: [[1, 4], [1, 3], [1, 2]],
    apple: [6, 4],
  });
  eq('the body is where it was put', g.body, [[1, 4], [1, 3], [1, 2]]);
  eq('the apple is where it was put', g.apple, [6, 4]);
  eq('one lava block', g.lava.length, 1);
  eq('of the size asked for', g.lava[0].cells().length, 6);
  ok('blocking the column it was given', g.isLava([4, 0]) && g.isLava([4, 5]));
  ok('and leaving the gap above it', !g.isLava([4, 6]) && !g.isLava([4, 7]));
}
{
  // Only the FIRST apple is placed. Later ones go wherever there is room --
  // by then the lesson has been made, and a fixed apple would be a fixed
  // answer rather than a lesson.
  const g = new Snake({
    dims: [8, 8], wrap: [false, false], lava: [],
    body: [[1, 4], [1, 3]], apple: [2, 4],
  });
  eq('the placed apple comes first', g.apple, [2, 4]);
  g.move([1, 0]);                       // eat it
  eq('and it scores', g.score, 10);
  ok('the next apple is somewhere else', JSON.stringify(g.apple) !== '[2,4]');
  ok('but still somewhere legal',
     !g.isLava(g.apple) && !g.occupied(g.apple));
}
{
  // Placing nothing leaves the ordinary random behaviour alone.
  const a = new Snake({ seed: 9 });
  const b = new Snake({ seed: 9 });
  eq('unplaced games are still seeded and identical', a.body, b.body);
  eq('with the usual three lava blocks', a.lava.length, 3);
}

console.log('\nmoving the head');
{
  const g = board([[2, 2, 2, 2], [1, 2, 2, 2], [0, 2, 2, 2]]);
  g.move(E);
  eq('the head steps east', g.head, [3, 2, 2, 2]);
  eq('the body follows', g.body, [[3, 2, 2, 2], [2, 2, 2, 2], [1, 2, 2, 2]]);
  eq('length is unchanged', g.length, 3);
}
{
  const g = board([[2, 2, 2, 2], [1, 2, 2, 2], [0, 2, 2, 2]]);
  const before = g.body.map((p) => p.slice());
  const plan = g.move(W);
  eq('pushing into the neck is refused', plan.kind, 'reversal');
  eq('and the snake does not move', g.body, before);
  ok('and it is not fatal', !g.over);
  eq('and the turn does not count', g.turns, 0);
}
{
  const g = board([[2, 2, 2, 2], [1, 2, 2, 2], [0, 2, 2, 2]]);
  g.move(UP);
  eq('turning perpendicular is fine', g.head, [2, 3, 2, 2]);
  ok('not over', !g.over);
}
{
  // A one-segment snake has no neck, so nothing is a reversal.
  const g = board([[2, 2, 2, 2]]);
  eq('a lone head can go anywhere', g.plan(W).kind, 'move');
}

console.log('\nwalls, on w like everywhere else');
{
  const g = board([[5, 2, 2, 2], [4, 2, 2, 2]]);
  const plan = g.move(E);
  eq('running east off the edge is fatal', plan.kind, 'die');
  eq('the cause is the wall', g.cause, CAUSE.WALL);
  ok('the run is over', g.over);
}
{
  for (const [axis, dir] of [[0, E], [1, UP], [2, [0, 0, 1, 0]]]) {
    const p = [2, 2, 2, 2];
    p[axis] = 5;
    const q = p.slice(); q[axis] = 4;
    const g = board([p, q]);
    ok(`axis ${axis} has a wall`, g.move(dir).kind === 'die');
  }
}
{
  // w is a direction like the other three: it ends where the box does. This
  // used to wrap, and was changed so the fourth dimension is not taught as
  // something unlike the first three.
  const g = board([[2, 2, 2, 5], [2, 2, 2, 4]]);
  eq('stepping off the far end of w is fatal', g.move(WF).kind, 'die');
  eq('by the wall', g.cause, CAUSE.WALL);
  const h = board([[2, 2, 2, 0], [2, 2, 2, 1]]);
  eq('and so is stepping off the near end', h.move(WB).kind, 'die');
  eq('the default board wraps on no axis', DEFAULTS.wrap, [false, false, false, false]);
}

console.log('\nand the wrap, when asked for');
{
  const g = board([[2, 2, 2, 5], [2, 2, 2, 4]], WRAP_W);
  const plan = g.move(WF);
  eq('stepping off the far end of a wrapping w is legal', plan.kind, 'move');
  eq('and arrives at the near end', g.head, [2, 2, 2, 0]);
  ok('and does not end the run', !g.over);
}
{
  const g = board([[2, 2, 2, 0], [2, 2, 2, 1]], WRAP_W);
  const plan = g.move(WB);
  eq('and it wraps the other way too', plan.kind, 'move');
  eq('arriving at the far end', g.head, [2, 2, 2, 5]);
}
{
  // Across the wrap seam the neck is still the neck: at w = 0 with the second
  // segment at w = 5, pressing w-back must be refused rather than treated as a
  // five-step move.
  const g = board([[2, 2, 2, 0], [2, 2, 2, 5]], WRAP_W);
  eq('a reversal across the w seam is still a reversal', g.plan(WB).kind, 'reversal');
  eq('and forward across it is a move', g.plan(WF).kind, 'move');
}

console.log('\nthe apple');
{
  const g = board([[2, 2, 2, 2], [1, 2, 2, 2]], { apple: [3, 2, 2, 2] });
  const plan = g.move(E);
  ok('eating is reported', plan.eats);
  eq('an apple is worth 10', g.score, 10);
  eq('both segments are owed', g.pending, 2);
  // The turn you eat on is an ordinary turn -- the growth starts next turn.
  eq('the snake is not longer yet', g.length, 2);
  ok('a new apple appears', !!g.apple);
  ok('and not where the old one was', !cellEq(g.apple, [3, 2, 2, 2]));
}
{
  // The two segments arrive over the two turns after eating, one per turn.
  const g = board([[2, 2, 2, 2], [1, 2, 2, 2], [0, 2, 2, 2]],
                  { apple: [3, 2, 2, 2] });
  eq('starts at 3', g.length, 3);
  g.move(E);
  eq('the turn it eats on is an ordinary turn: still 3', g.length, 3);
  g.apple = [9, 9, 9, 9];   // out of reach, so nothing more is eaten
  g.move(E);
  eq('one turn later, a segment arrives: 4', g.length, 4);
  g.move(E);
  eq('and the second the turn after: 5', g.length, 5);
  eq('nothing left owed', g.pending, 0);
  g.move(UP);
  eq('and it stops there', g.length, 5);
  eq('so an apple is worth exactly two segments', g.length - 3, 2);
}
{
  const g = board([[2, 2, 2, 2], [1, 2, 2, 2]], { apple: [3, 2, 2, 2] });
  g.move(E);
  ok('the new apple is not under the snake', !g.occupied(g.apple));
  ok('the new apple is not in lava', !g.isLava(g.apple));
}
{
  // Placement only ever chooses free cells, checked exhaustively on a small
  // board rather than by sampling.
  const g = new Snake({ seed: 5, dims: [4, 4, 4, 4], wrap: [false, false, false, true] });
  let allFree = true;
  for (let i = 0; i < 300; i++) {
    g.placeApple();
    if (!g.apple) continue;
    if (g.isLava(g.apple) || g.occupied(g.apple)) allFree = false;
  }
  ok('300 placements all land on empty cells', allFree);
}

console.log('\nlava');
{
  const lava = [new Box([3, 2, 2, 2], [1, 1, 1, 1])];
  const g = board([[2, 2, 2, 2], [1, 2, 2, 2]], { lava });
  const plan = g.move(E);
  eq('stepping into lava is fatal', plan.kind, 'die');
  eq('the cause is lava', g.cause, CAUSE.LAVA);
  eq('and the head is drawn in the lava it hit', g.head, [3, 2, 2, 2]);
}
{
  const lava = [new Box([3, 2, 2, 2], [1, 1, 1, 1])];
  const g = board([[2, 2, 2, 2], [1, 2, 2, 2]], { lava });
  const glow = g.lavaGlow();
  ok('the cell beside the lava glows', glow.has('2,2,2,2'));
  ok('and the one past it', glow.has('4,2,2,2'));
  ok('and along w', glow.has('3,2,2,3'));
  ok('the lava cell itself does not glow', !glow.has('3,2,2,2'));
  ok('a distant cell does not glow', !glow.has('0,0,0,0'));
  eq('a lone lava cell lights its 8 neighbours', glow.size, 8);
}
{
  // The glow stops at the wall, like everything else; and wraps when w does.
  const lava = [new Box([2, 2, 2, 0], [1, 1, 1, 1])];
  const g = board([[0, 0, 0, 0]], { lava });
  ok('the glow stops at the end of w', !g.lavaGlow().has('2,2,2,5'));
  eq('so a cell at the end lights seven', g.lavaGlow().size, 7);
  const w = board([[0, 0, 0, 0]], { lava, ...WRAP_W });
  ok('and wraps round w when w wraps', w.lavaGlow().has('2,2,2,5'));
}
{
  // The glow can be asked for along particular axes only. The 3D view wants w
  // alone: a halo around a slab in the room you are looking at only repeats
  // what the slab already says, while a halo along w is the one warning the
  // view cannot otherwise give -- lava in the next room, one press away.
  const lava = [new Box([3, 2, 2, 2], [1, 1, 1, 1])];
  const g = board([[0, 0, 0, 0]], { lava });
  const wOnly = g.lavaGlow([3]);
  eq('along w alone, a lone cell lights two', wOnly.size, 2);
  ok('the cell one step forward in w', wOnly.has('3,2,2,3'));
  ok('and one step back', wOnly.has('3,2,2,1'));
  ok('but nothing in its own slice', !wOnly.has('2,2,2,2') && !wOnly.has('4,2,2,2'));
  ok('nor above or below it', !wOnly.has('3,3,2,2') && !wOnly.has('3,1,2,2'));

  // The default is still every direction, which is what the flat panel wants.
  eq('all axes still lights eight', g.lavaGlow().size, 8);
  const xOnly = g.lavaGlow([0]);
  eq('and a single spatial axis lights two', xOnly.size, 2);
  ok('the right two', xOnly.has('2,2,2,2') && xOnly.has('4,2,2,2'));
}
{
  // Each axis set is cached separately, so asking for one does not poison the
  // answer to another.
  const lava = [new Box([3, 2, 2, 2], [1, 1, 1, 1])];
  const g = board([[0, 0, 0, 0]], { lava });
  const a = g.lavaGlow([3]).size;
  const b = g.lavaGlow().size;
  const c = g.lavaGlow([3]).size;
  eq('w-only stays w-only after asking for all', c, a);
  ok('and the two answers differ', a !== b, `${a} vs ${b}`);
}
{
  // The w-only glow honours the same wall and the same wrap.
  const lava = [new Box([2, 2, 2, 0], [1, 1, 1, 1])];
  const g = board([[0, 0, 0, 0]], { lava });
  ok('w-only glow stops at the wall', !g.lavaGlow([3]).has('2,2,2,5'));
  ok('and lights slice 1', g.lavaGlow([3]).has('2,2,2,1'));
  const w = board([[0, 0, 0, 0]], { lava, ...WRAP_W });
  ok('and wraps to the far end when w wraps', w.lavaGlow([3]).has('2,2,2,5'));
}
{
  // The point of the change, stated as a number: on a real board the w-only
  // glow is a small fraction of the all-axes one.
  let all = 0, wOnly = 0;
  for (let s = 0; s < 30; s++) {
    const g = new Snake({ seed: s });
    all += g.lavaGlow().size;
    wOnly += g.lavaGlow([3]).size;
  }
  ok('w-only glow is far smaller than all-axes', wOnly * 2 < all,
     `${wOnly} vs ${all} over 30 seeds`);
}
{
  const lava = [new Box([2, 2, 2, 2], [3, 2, 2, 1])];
  const g = board([[0, 0, 0, 0]], { lava });
  ok('a 3x2x2x1 block contains its far corner', g.isLava([4, 3, 3, 2]));
  ok('and not one cell past it', !g.isLava([5, 3, 3, 2]));
  eq('and it is 12 cells', lava[0].cells().length, 12);
}

console.log('\nrunning into yourself');
{
  // A loop tight enough that the head can reach its own flank.
  const g = board([[2, 2, 2, 2], [2, 3, 2, 2], [3, 3, 2, 2], [3, 2, 2, 2],
                   [4, 2, 2, 2]]);
  const plan = g.move(E);
  eq('stepping onto your own body is fatal', plan.kind, 'die');
  eq('the cause is self', g.cause, CAUSE.SELF);
}
{
  // The tail cell vacates on the same move, so following it is legal.
  const g = board([[2, 2, 2, 2], [2, 3, 2, 2], [3, 3, 2, 2], [3, 2, 2, 2]]);
  const plan = g.move([0, 0, 0, 0].map((_, d) => (d === 0 ? 1 : 0)));
  eq('chasing the tail into the cell it leaves is legal', plan.kind, 'move');
  eq('and the head takes it', g.head, [3, 2, 2, 2]);
}
{
  // ...unless the snake is growing this turn, when the tail stays put.
  const g = board([[2, 2, 2, 2], [2, 3, 2, 2], [3, 3, 2, 2], [3, 2, 2, 2]],
                  { pending: 1 });
  const plan = g.move(E);
  eq('but not while the tail is staying put', plan.kind, 'die');
  eq('which is a self collision', g.cause, CAUSE.SELF);
}
{
  // Eating on the tail cell is fine: the apple's segments start arriving next
  // turn, so the tail still vacates on this one.
  const g = board([[2, 2, 2, 2], [2, 3, 2, 2], [3, 3, 2, 2], [3, 2, 2, 2]],
                  { apple: [3, 2, 2, 2] });
  eq('eating on the cell the tail vacates is legal', g.plan(E).kind, 'move');
}

console.log('\nthe move that killed you is remembered');
{
  // The view names the direction in its death message, so the model has to
  // record which way the fatal press went. It cannot read `heading` for this:
  // heading is not updated on a fatal move, so it still holds the direction
  // travelled BEFORE the press that ended the run.
  const g = board([[5, 2, 2, 2], [4, 2, 2, 2]]);
  eq('no fatal direction before dying', g.fatalDir, null);
  g.move(E);
  eq('the fatal direction is the press that killed you', g.fatalDir, E);
}
{
  // The case that makes fatalDir necessary: dying on a TURN. heading still
  // holds the direction travelled before the press, so a message built from it
  // would name the wrong direction entirely.
  const g = board([[2, 5, 2, 2], [1, 5, 2, 2]]);   // travelling east
  g.move(UP);                                       // turn up, into the ceiling
  eq('a fatal turn records the turn', g.fatalDir, UP);
  ok('not the direction travelled before it',
     JSON.stringify(g.heading) !== JSON.stringify(g.fatalDir));
}
{
  // Every cause records it, not just walls.
  const lava = [new Box([3, 2, 2, 2], [1, 1, 1, 1])];
  const a = board([[2, 2, 2, 2], [1, 2, 2, 2]], { lava });
  a.move(E);
  eq('lava records it too', a.fatalDir, E);

  const b = board([[2, 2, 2, 2], [2, 3, 2, 2], [3, 3, 2, 2], [3, 2, 2, 2],
                   [4, 2, 2, 2]]);
  b.move(E);
  eq('and a self collision', b.fatalDir, E);
}
{
  // A w death records the w direction, which is the one the message calls
  // ana-ward or kata-ward.
  const lava = [new Box([2, 2, 2, 3], [1, 1, 1, 1])];
  const g = board([[2, 2, 2, 2], [2, 2, 2, 1]], { lava });
  g.move(WF);
  eq('an ana-ward death records ana', g.fatalDir, WF);
}
{
  const g = board([[5, 2, 2, 2], [4, 2, 2, 2]]);
  g.move(E);
  g.reset();
  eq('a new run forgets it', g.fatalDir, null);
}

console.log('\nafter the run ends');
{
  const g = board([[5, 2, 2, 2], [4, 2, 2, 2]]);
  g.move(E);
  const after = g.body.map((p) => p.slice());
  const plan = g.move(UP);
  eq('further moves do nothing', plan.kind, 'over');
  eq('and the snake is left where it died', g.body, after);
}
{
  const g = new Snake({ seed: 11 });
  g.over = true;
  g.score = 40;
  g.reset();
  eq('reset clears the score', g.score, 0);
  ok('reset clears the game over', !g.over);
  eq('reset restores the starting length', g.length, 4);
  eq('reset has no cause', g.cause, null);
  eq('and nothing owed', g.pending, 0);
}

console.log('\nthe plan matches what the move does');
{
  // The pad greys out what plan() refuses, so a disagreement between plan and
  // move would show as a button that lies. Walk a seeded game and check every
  // direction agrees at every step.
  const dirs = [];
  for (let d = 0; d < 4; d++) for (const s of [-1, 1]) {
    const v = [0, 0, 0, 0]; v[d] = s; dirs.push(v);
  }
  let agree = true;
  for (let seed = 0; seed < 25; seed++) {
    const g = new Snake({ seed });
    for (let t = 0; t < 25 && !g.over; t++) {
      // Compare every direction's plan against a move made on a copy.
      for (const dir of dirs) {
        const plan = g.plan(dir);
        const twin = new Snake({ seed });
        twin.lava = g.lava;
        twin.body = g.body.map((p) => p.slice());
        twin.apple = g.apple ? g.apple.slice() : null;
        twin.pending = g.pending;
        twin.over = false;
        const got = twin.move(dir);
        if (got.kind !== plan.kind) agree = false;
      }
      const live = dirs.filter((d) => g.plan(d).kind === 'move');
      if (!live.length) break;
      g.move(live[Math.floor(g.rng() * live.length)]);
    }
  }
  ok('plan and move agree everywhere, over 25 seeded games', agree);
}
{
  // Exactly one direction is ever a reversal, and it is never the only option
  // reported -- a snake with a neck always has at least the way it came barred
  // and nothing else.
  let ok1 = true;
  for (let seed = 0; seed < 30; seed++) {
    const g = new Snake({ seed });
    const dirs = [];
    for (let d = 0; d < 4; d++) for (const s of [-1, 1]) {
      const v = [0, 0, 0, 0]; v[d] = s; dirs.push(v);
    }
    const rev = dirs.filter((d) => g.plan(d).kind === 'reversal');
    if (rev.length !== 1) ok1 = false;
  }
  ok('exactly one direction is the neck, on every seed', ok1);
}

console.log('\nreplay is deterministic');
{
  const a = new Snake({ seed: 42 });
  const b = new Snake({ seed: 42 });
  eq('the same seed gives the same snake', a.body, b.body);
  eq('the same lava', a.lava.map((l) => [l.origin, l.size]),
     b.lava.map((l) => [l.origin, l.size]));
  eq('the same apple', a.apple, b.apple);
  const c = new Snake({ seed: 43 });
  ok('a different seed gives a different board',
     JSON.stringify(c.lava.map((l) => l.origin)) !==
     JSON.stringify(a.lava.map((l) => l.origin)));
}

console.log('\nthe model does not care how many dimensions there are');
{
  const g2 = new Snake({ dims: [10, 10], wrap: [false, false], seed: 2,
                         lavaCount: 2, lavaSize: [3, 2] });
  eq('a 2D board works', g2.D, 2);
  eq('with a 4-long snake', g2.length, 4);
  ok('and lava', g2.lava.length === 2);
  ok('and an apple somewhere free',
     !!g2.apple && !g2.isLava(g2.apple) && !g2.occupied(g2.apple));

  const g3 = new Snake({ dims: [6, 6, 6], wrap: [false, false, false], seed: 2,
                         lavaCount: 3, lavaSize: [3, 2, 2] });
  eq('a 3D board works', g3.D, 3);
  ok('with three lava blocks', g3.lava.length === 3);

  const g5 = new Snake({ dims: [5, 5, 5, 5, 5],
                         wrap: [false, false, false, true, true], seed: 2,
                         lavaCount: 3, lavaSize: [3, 2, 2, 1, 1] });
  eq('a 5D board works', g5.D, 5);
  const p = g5.body[0].slice();
  ok('and both wrapping axes wrap', (() => {
    const q = g5.body[0].slice(); q[4] = 4;
    const t = new Snake({ dims: [5, 5, 5, 5, 5],
                          wrap: [false, false, false, true, true], seed: 2 });
    t.lava = []; t.apple = null;
    t.body = [[0, 0, 0, 0, 4], [0, 0, 0, 0, 3]];
    const r = t.move([0, 0, 0, 0, 1]);
    return r.kind === 'move' && t.head[4] === 0;
  })());
  void p;
}

console.log('\nthe tutorial teaches what it claims to');
{
  // Two things have to be true of every lesson, and the second is the one that
  // matters: it must be solvable, and it must NOT be solvable with only the
  // keys the player already had. A step you can finish the old way teaches
  // nothing -- and my first 3D lesson was exactly that, with a gap in the lava
  // you could walk around instead of over.
  const reach = (g, axes) => {
    const k = (p) => p.join(',');
    const blocked = new Set(g.body.slice(1).map(k));
    const seen = new Set([k(g.head)]);
    let frontier = [g.head], n = 0;
    while (frontier.length && n < 400) {
      const next = [];
      for (const p of frontier) {
        for (const d of axes) {
          for (const s of [-1, 1]) {
            const q = p.slice();
            let v = q[d] + s;
            if (g.wrap[d]) v = ((v % g.dims[d]) + g.dims[d]) % g.dims[d];
            else if (v < 0 || v >= g.dims[d]) continue;
            q[d] = v;
            const kk = k(q);
            if (seen.has(kk) || blocked.has(kk) || g.isLava(q)) continue;
            seen.add(kk);
            next.push(q);
          }
        }
      }
      frontier = next;
      n++;
    }
    return seen.has(k(g.apple));
  };

  const byId = Object.fromEntries(LESSONS.map((l) => [l.id, new Snake(l.opts)]));
  const all = (g) => [...Array(g.D).keys()];

  for (const l of LESSONS) {
    const g = byId[l.id];
    ok(`the ${l.id} lesson is solvable`, reach(g, all(g)));
  }
  // The arrows drive axes 0 and 2; W/S drive 1; A/D drive 3.
  ok('the 3D lesson cannot be done with the arrows alone',
     !reach(byId['3d'], [0, 2]));
  ok('the 4D lesson cannot be done without ana and kata',
     !reach(byId['4d'], [0, 1, 2]));
  // And the 2D one needs nothing but the arrows, since that is its whole claim.
  ok('the 2D lesson needs only the arrows', reach(byId['2d'], [0, 2]));
}
{
  // Every lesson starts somewhere legal, or the first press is a death the
  // player did not earn.
  for (const l of LESSONS) {
    const g = new Snake(l.opts);
    ok(`the ${l.id} lesson starts clear of lava`,
       g.body.every((c) => !g.isLava(c)));
    ok(`the ${l.id} lesson's apple is reachable ground`,
       !g.isLava(g.apple) && !g.occupied(g.apple));
    // A joined run, like any snake.
    let joined = true;
    for (let i = 0; i + 1 < g.body.length; i++) {
      let steps = 0;
      for (let d = 0; d < g.D; d++) {
        if (g.body[i][d] !== g.body[i + 1][d]) steps++;
      }
      if (steps !== 1) joined = false;
    }
    ok(`the ${l.id} lesson's snake is a joined run`, joined);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
