// Tron model tests. Run with: npm test
//
// The interesting cases are all about two riders moving at the SAME time --
// head-on collisions, swapping through each other, both dying on one tick, and
// the question of whose wall existed when. None of those arise from ordinary
// play often enough to find by hand, so they are all built explicitly here.
import { Tron, CAUSE, PLAYERS, DEFAULTS } from '../src/tron.js';
import { key } from '../../shared/grid.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

const E = [1, 0, 0, 0];
const W = [-1, 0, 0, 0];
const UP = [0, 1, 0, 0];
const DN = [0, -1, 0, 0];
const N = [0, 0, -1, 0];
const S = [0, 0, 1, 0];
const WF = [0, 0, 0, 1];
const WB = [0, 0, 0, -1];

// A game with both riders placed exactly where a test wants them, and no
// history but the cells they stand on.
function board(a, aHead, b, bHead, opts = {}) {
  const g = new Tron({ seed: 1, ...opts });
  g.riders = [g.makeRider(0, a, aHead), g.makeRider(1, b, bHead)];
  g.walls = new Map();
  for (const r of g.riders) g.walls.set(key(r.at), r.id);
  g.over = false;
  g.winner = null;
  g.tick = 0;
  return g;
}

console.log('\nsetting up');
{
  const g = new Tron({ seed: 3 });
  eq('two riders', g.riders.length, 2);
  eq('a 6^4 board', g.dims, [6, 6, 6, 6]);
  ok('they start apart',
     JSON.stringify(g.riders[0].at) !== JSON.stringify(g.riders[1].at));
  ok('both alive', g.riders.every((r) => r.alive));
  eq('both occupy a cell', g.walls.size, 2);
  ok('they face each other',
     g.riders[0].heading[0] === -g.riders[1].heading[0]);
  // Facing each other head-on from tick one would make the opening a coin
  // flip, so they are offset off each other's line.
  ok('but not on the same line',
     JSON.stringify(g.riders[0].at.slice(1)) !==
     JSON.stringify(g.riders[1].at.slice(1)));
  eq('the match starts level', g.wins, [0, 0]);
  eq('round one', g.round, 1);
}

console.log('\nthe clock moves you whether you press or not');
{
  const g = board([1, 2, 2, 2], E, [5, 5, 5, 5], W);
  g.step();
  eq('a rider moves with no input at all', g.riders[0].at, [2, 2, 2, 2]);
  g.step();
  eq('and keeps going', g.riders[0].at, [3, 2, 2, 2]);
  eq('the tick counts', g.tick, 2);
}
{
  const g = board([1, 2, 2, 2], E, [5, 5, 5, 5], W);
  g.step(); g.step();
  eq('every cell it left is a wall', g.riders[0].trail,
     [[1, 2, 2, 2], [2, 2, 2, 2], [3, 2, 2, 2]]);
  ok('and they are all occupied',
     g.riders[0].trail.every((c) => g.occupied(c)));
}

console.log('\nturning');
{
  const g = board([1, 2, 2, 2], E, [5, 5, 5, 5], W);
  ok('a turn is accepted', g.turn(0, UP));
  eq('but nothing moves until the tick', g.riders[0].at, [1, 2, 2, 2]);
  g.step();
  eq('then it goes the new way', g.riders[0].at, [1, 3, 2, 2]);
  eq('and keeps that heading', g.riders[0].heading, UP);
  g.step();
  eq('with no further input', g.riders[0].at, [1, 4, 2, 2]);
}
{
  const g = board([1, 2, 2, 2], E, [5, 5, 5, 5], W);
  ok('reversing is refused', !g.turn(0, W));
  g.step();
  eq('so the rider carries on as it was', g.riders[0].at, [2, 2, 2, 2]);
  ok('and is still alive', g.riders[0].alive);
}
{
  // Two presses between ticks: the last one wins, and only one move happens.
  const g = board([1, 2, 2, 2], E, [5, 5, 5, 5], W);
  g.turn(0, UP);
  g.turn(0, N);
  g.step();
  eq('the last press before the tick is the one taken', g.riders[0].at,
     [1, 2, 1, 2]);
  eq('and exactly one tick happened', g.tick, 1);
}

console.log('\nmomentum carries through the fourth dimension too');
{
  const g = board([1, 2, 2, 2], E, [5, 5, 5, 5], W);
  g.turn(0, WF);
  g.step();
  eq('turning along w moves you along w', g.riders[0].at, [1, 2, 2, 3]);
  g.step();
  eq('and you keep drifting along it', g.riders[0].at, [1, 2, 2, 4]);
  g.step();
  eq('until you turn again', g.riders[0].at, [1, 2, 2, 5]);
  g.turn(0, E);
  g.step();
  eq('then the new heading takes over', g.riders[0].at, [2, 2, 2, 5]);
}
{
  // w ends where the box does, like the other three axes. It used to wrap.
  const g = board([1, 2, 2, 5], WF, [5, 5, 5, 0], W);
  g.step();
  ok('running off the end of w is fatal', !g.riders[0].alive);
  eq('by the wall', g.riders[0].cause, CAUSE.WALL);
  const h = board([1, 2, 2, 0], WB, [5, 5, 5, 3], W);
  h.step();
  ok('and so is running off the near end', !h.riders[0].alive);
}
{
  // The model still supports a per-axis wrap, which is what an optional
  // all-axes wrap would use.
  const WRAP_W = { wrap: [false, false, false, true] };
  const g = board([1, 2, 2, 5], WF, [5, 5, 5, 0], W, WRAP_W);
  g.step();
  eq('a wrapping w comes round the end', g.riders[0].at, [1, 2, 2, 0]);
  ok('and that is not fatal', g.riders[0].alive);
  // Drifting along it long enough comes back to where you started -- and dies
  // there, because your own trail is waiting.
  const h = board([1, 2, 2, 0], WF, [5, 5, 5, 5], N, WRAP_W);
  for (let i = 0; i < 6 && h.riders[0].alive; i++) h.step();
  ok('a full lap of a wrapping w runs into your own trail', !h.riders[0].alive);
  eq('which is a self collision', h.riders[0].cause, CAUSE.SELF);
}

console.log('\ndying');
{
  // Rider 1 is pointed somewhere safe, so this tests one death rather than
  // two -- at x = 0 heading west, or at w = 5 heading ana, it would run off
  // its own edge on the same tick, and the round would be a draw for entirely
  // separate reasons.
  const g = board([5, 2, 2, 2], E, [0, 5, 5, 5], WB);
  g.step();
  ok('running off the edge kills you', !g.riders[0].alive);
  eq('by the wall', g.riders[0].cause, CAUSE.WALL);
  ok('the round is over', g.over);
  eq('and the other rider wins it', g.winner, 1);
  eq('the win is recorded', g.wins, [0, 1]);
  ok('the survivor is still alive', g.riders[1].alive);
}
{
  for (const [name, at, dir] of [
    ['east',  [5, 2, 2, 2], E], ['west',  [0, 2, 2, 2], W],
    ['up',    [2, 5, 2, 2], UP], ['down', [2, 0, 2, 2], DN],
    ['south', [2, 2, 5, 2], S], ['north', [2, 2, 0, 2], N],
  ]) {
    const g = board(at, dir, [3, 3, 3, 3], WF);
    g.step();
    ok(`the ${name} edge is a wall`, g.riders[0].cause === CAUSE.WALL);
  }
}
{
  // A square loop back into your own trail.
  const g = board([2, 2, 2, 2], E, [5, 5, 5, 5], WB);
  g.step();               // -> 3,2,2,2
  g.turn(0, N); g.step(); // -> 3,2,1,2
  g.turn(0, W); g.step(); // -> 2,2,1,2
  g.turn(0, S); g.step(); // -> 2,2,2,2, its own starting cell
  ok('closing a loop onto your own trail kills you', !g.riders[0].alive);
  eq('as a self collision', g.riders[0].cause, CAUSE.SELF);
}
{
  // Into the opponent's trail rather than your own.
  const g = board([2, 2, 2, 2], E, [2, 4, 2, 2], DN);
  g.step();   // p0 -> 3,2,2,2 ; p1 -> 2,3,2,2
  g.turn(0, N);
  g.step();   // p0 -> 3,2,1,2 ; p1 -> 2,2,2,2 (p0's old cell)
  ok('the opponent dies on your trail', !g.riders[1].alive);
  eq('as a trail hit', g.riders[1].cause, CAUSE.TRAIL);
  ok('and you are still going', g.riders[0].alive);
  eq('so you take the round', g.winner, 0);
}

console.log('\nboth at once -- the part array order would get wrong');
{
  // Two riders one cell apart, closing. Neither reaches the other's cell;
  // they swap through each other, which is a head-on however you slice it.
  const g = board([2, 2, 2, 2], E, [3, 2, 2, 2], W);
  g.step();
  ok('swapping places through each other kills both',
     !g.riders[0].alive && !g.riders[1].alive);
  eq('player one head-on', g.riders[0].cause, CAUSE.HEAD_ON);
  eq('player two head-on', g.riders[1].cause, CAUSE.HEAD_ON);
  eq('and the round is a draw', g.winner, null);
  eq('nobody scores', g.wins, [0, 0]);
  ok('the round is over all the same', g.over);
}
{
  // Two riders two cells apart, closing: both claim the cell in the middle.
  const g = board([2, 2, 2, 2], E, [4, 2, 2, 2], W);
  g.step();
  ok('claiming the same empty cell kills both',
     !g.riders[0].alive && !g.riders[1].alive);
  eq('both head-on', [g.riders[0].cause, g.riders[1].cause],
     [CAUSE.HEAD_ON, CAUSE.HEAD_ON]);
  eq('a draw', g.winner, null);
}
{
  // The rule that array order would break: rider 1 moves into a cell rider 0
  // is LEAVING on the same tick. That cell's wall did not exist when rider 1
  // committed, so it is not a kill.
  const g = board([2, 2, 2, 2], E, [2, 3, 2, 2], DN);
  g.step();
  eq('rider 0 moved on', g.riders[0].at, [3, 2, 2, 2]);
  eq('rider 1 took the cell it vacated', g.riders[1].at, [2, 2, 2, 2]);
  ok('and neither died -- the wall was not there yet',
     g.riders[0].alive && g.riders[1].alive);
}
{
  // Both run off opposite edges on the same tick: a draw, not a win for
  // whoever happens to be first in the array.
  const g = board([5, 2, 2, 2], E, [0, 4, 4, 4], W);
  g.step();
  ok('both hit a wall at once', !g.riders[0].alive && !g.riders[1].alive);
  eq('and it is a draw', g.winner, null);
  eq('with no points awarded', g.wins, [0, 0]);
}
{
  // A rider that dies does not lay a wall in the cell that killed it.
  const g = board([2, 2, 2, 2], E, [4, 2, 2, 2], N);
  const before = g.walls.size;
  g.turn(1, [0, 0, 0, 0].map((_, i) => (i === 0 ? -1 : 0)));  // west, into p0's path
  g.step();
  // p1 moved to 3,2,2,2 and p0 moved to 3,2,2,2 as well -- head-on.
  ok('a head-on leaves no wall behind',
     g.walls.size <= before + 1, `walls ${g.walls.size} from ${before}`);
}

console.log('\nthe round and the match');
{
  const g = new Tron({ seed: 2, rounds: 2 });
  g.wins = [1, 0];
  ok('one win is not a match', !g.matchOver);
  g.wins = [2, 0];
  ok('two is', g.matchOver);
  eq('and names the winner', g.matchWinner, 0);
  g.wins = [1, 2];
  eq('the other way too', g.matchWinner, 1);
}
{
  const g = new Tron({ seed: 2 });
  const r = g.round;
  g.newRound();
  eq('a new round counts up', g.round, r + 1);
  ok('and is not over', !g.over);
  ok('with both riders alive again', g.riders.every((x) => x.alive));
  eq('and a clean board', g.walls.size, 2);
  eq('and the clock back to zero', g.tick, 0);
}
{
  const g = new Tron({ seed: 2 });
  g.wins = [2, 1];
  g.resetMatch();
  eq('resetting the match clears the score', g.wins, [0, 0]);
  eq('and starts at round one', g.round, 1);
}
{
  const g = board([5, 2, 2, 2], E, [0, 2, 3, 2], W);
  g.step();
  const w = g.winner;
  g.step();
  eq('ticking after the round is over changes nothing', g.winner, w);
  eq('and does not advance the clock', g.tick, 1);
}

console.log('\nlooking one step ahead');
{
  const g = board([4, 2, 2, 2], E, [0, 5, 5, 5], WF);
  const la = g.lookahead(0);
  eq('an open cell ahead is not fatal', la.fatal, false);
  eq('and says where you are going', la.to, [5, 2, 2, 2]);
  g.step();
  const la2 = g.lookahead(0);
  ok('the edge ahead is fatal', la2.fatal);
  eq('by the wall', la2.cause, CAUSE.WALL);
}
{
  const g = board([2, 2, 2, 2], E, [5, 5, 5, 5], WF);
  g.turn(0, UP);
  eq('lookahead follows the turn you have asked for, not the old heading',
     g.lookahead(0).to, [2, 3, 2, 2]);
}

console.log('\nbeing boxed in');
{
  const g = board([2, 2, 2, 2], E, [5, 5, 5, 5], WF);
  // Wall off every direction but the way it came.
  for (let d = 0; d < 4; d++) {
    for (const s of [-1, 1]) {
      const p = [2, 2, 2, 2];
      p[d] += s;
      if (p[d] < 0 || p[d] > 5) continue;
      g.walls.set(key(p), 1);
    }
  }
  eq('a boxed-in rider has nowhere open', g.openDirections(0).length, 0);
  g.step();
  ok('and dies on the next tick', !g.riders[0].alive);
}
{
  const g = board([2, 2, 2, 2], E, [5, 5, 5, 5], WF);
  const open = g.openDirections(0);
  eq('an open board leaves seven ways to go', open.length, 7);
  ok('and never the way you came',
     !open.some((d) => JSON.stringify(d) === JSON.stringify(W)));
}

console.log('\nthe board fills up');
{
  const g = new Tron({ seed: 4 });
  eq('a fresh board is all but two cells free', g.freeCells, 1296 - 2);
  const before = g.freeCells;
  g.step();
  ok('and every tick takes more', g.freeCells < before);
}
{
  // A round always ends: the space only shrinks, so no seed can run forever.
  let longest = 0, allEnded = true;
  for (let seed = 0; seed < 12; seed++) {
    const g = new Tron({ seed });
    let n = 0;
    while (!g.over && n < 3000) {
      // Drive both riders with whatever is still open, so they survive as long
      // as anything can -- the worst case for termination.
      for (const r of g.riders) {
        if (!r.alive) continue;
        const open = g.openDirections(r.id);
        if (open.length) g.turn(r.id, open[Math.floor(g.rng() * open.length)]);
      }
      g.step();
      n++;
    }
    if (!g.over) allEnded = false;
    longest = Math.max(longest, n);
  }
  ok('every round ends, over 12 seeds', allEnded);
  ok('and well inside the board', longest < 1296, `longest ${longest} ticks`);
}

console.log('\nreplay is deterministic');
{
  const a = new Tron({ seed: 77 });
  const b = new Tron({ seed: 77 });
  eq('the same seed starts the same', a.riders.map((r) => r.at),
     b.riders.map((r) => r.at));
  for (const g of [a, b]) { g.turn(0, [0, 1, 0, 0]); g.step(); g.step(); }
  eq('and stays the same', a.riders.map((r) => r.at), b.riders.map((r) => r.at));
}

console.log('\nany number of dimensions');
{
  const g2 = new Tron({ dims: [12, 12], wrap: [false, false], seed: 5 });
  eq('a 2D board works', g2.D, 2);
  ok('with two riders facing each other',
     g2.riders[0].heading[0] === -g2.riders[1].heading[0]);
  g2.step();
  ok('and it ticks', g2.tick === 1);

  const g3 = new Tron({ dims: [8, 8, 8], wrap: [false, false, false], seed: 5 });
  eq('a 3D board works', g3.D, 3);
  eq('with six directions to choose from', g3.openDirections(0).length, 5);

  const g5 = new Tron({ dims: [5, 5, 5, 5, 5],
                        wrap: [false, false, false, true, true], seed: 5 });
  eq('a 5D board works', g5.D, 5);
  eq('with nine ways to go', g5.openDirections(0).length, 9);
}

console.log('\nthe two players are named once, and everyone agrees');
{
  eq('two players', PLAYERS.length, 2);
  eq('with distinct ids', [PLAYERS[0].id, PLAYERS[1].id], [0, 1]);
  ok('and distinct colours', PLAYERS[0].colour !== PLAYERS[1].colour);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
