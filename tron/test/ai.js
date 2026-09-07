// Tests for the computer rider. Run with: npm test
//
// What is worth testing here is not "does it play well" -- that is a matter of
// taste and a self-play average, and both are checked at the bottom -- but the
// handful of promises the rest of the game leans on: it never returns a move
// that is illegal, it never returns one that is certainly fatal when a safe one
// exists, and the same seed plays the same game twice.
import { Tron } from '../src/tron.js';
import { Rider, LEVELS, DEFAULT_LEVEL } from '../src/ai.js';
import { key, step, makeRng, unitDirs } from '../../shared/grid.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// A rider with a fixed random source, so every test below is reproducible.
const rider = (level, seed = 1) => new Rider({ level, rng: makeRng(seed) });

// A board with both riders placed exactly where a test wants them, matching
// the helper in run.js.
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

// Fill in cells as walls belonging to nobody in particular.
function wall(g, cells, owner = 0) {
  for (const c of cells) g.walls.set(key(c), owner);
}

const E = [1, 0, 0, 0];
const W = [-1, 0, 0, 0];

console.log('\nthe move is always a legal one');
{
  for (const level of Object.keys(LEVELS)) {
    const g = new Tron({ seed: 9 });
    const bot = rider(level, 4);
    let illegal = 0, reversals = 0, suicides = 0;
    for (let t = 0; t < 200 && !g.over; t++) {
      const dir = bot.choose(g, 1);
      if (dir) {
        // A direction is one step along one axis, and nothing else.
        const nonzero = dir.filter((v) => v !== 0);
        if (dir.length !== g.D || nonzero.length !== 1 ||
            Math.abs(nonzero[0]) !== 1) illegal++;
        if (g.isReversal(g.riders[1], dir)) reversals++;
        // It must never choose a cell that is already a wall while some other
        // direction is free -- that is not a hard game, it is a broken one.
        const to = step(g.riders[1].at, dir, g.dims, g.wrap);
        const doomed = !to || g.occupied(to);
        if (doomed && g.openDirections(1).length) suicides++;
        g.turn(1, dir);
      }
      g.step();
    }
    eq(`${level} never returns a malformed direction`, illegal, 0);
    eq(`${level} never asks to reverse`, reversals, 0);
    eq(`${level} never picks a wall with an opening free`, suicides, 0);
  }
}

console.log('\neasy holds its line until the line runs out');
{
  // Open board, heading east, nothing in the way: it should not turn at all.
  const g = board([1, 3, 3, 3], E, [4, 3, 5, 3], W);
  const bot = rider('easy', 7);
  let turns = 0;
  for (let i = 0; i < 3; i++) {
    if (bot.choose(g, 0) !== null) turns++;
  }
  eq('an open road is not a reason to turn', turns, 0);
}
{
  // A wall dead ahead: it must turn, and into somewhere that is actually free.
  const g = board([1, 3, 3, 3], E, [5, 0, 0, 3], W);
  wall(g, [[2, 3, 3, 3]]);
  // rng seeded so the "mistake" (1 in 100) does not fire.
  const dir = rider('easy', 3).choose(g, 0);
  ok('a wall ahead is', dir !== null);
  const to = dir && step(g.riders[0].at, dir, g.dims, g.wrap);
  ok('and it turns somewhere free', !!to && !g.occupied(to),
     JSON.stringify(dir));
}
{
  // Boxed in on every side: there is nothing to choose, and it says so rather
  // than inventing a move.
  const g = board([0, 0, 0, 0], E, [5, 5, 5, 3], W);
  for (const d of unitDirs(4)) {
    const to = step([0, 0, 0, 0], d, g.dims, g.wrap);
    if (to) g.walls.set(key(to), 1);
  }
  eq('nothing open means no answer', rider('easy', 2).choose(g, 0), null);
}

console.log('\nhard takes the bigger room');
{
  // Two ways out of a corridor: a pocket three cells deep, and open board.
  // The fill has to prefer the open board, and the one-step-ahead easy rider
  // has no way to tell the difference -- which is the whole distinction
  // between them, so it is worth stating as a test.
  const g = board([2, 1, 1, 0], E, [5, 5, 5, 3], W);
  // Seal everything except a short dead end going up, and open ground east.
  // Wall the pocket off at the top so the way up holds only two cells.
  wall(g, [[2, 4, 1, 0]], 1);
  const best = rider('hard', 1).rank(g, 0);
  const up = best.find((o) => JSON.stringify(o.dir) === JSON.stringify([0, 1, 0, 0]));
  const east = best.find((o) => JSON.stringify(o.dir) === JSON.stringify([1, 0, 0, 0]));
  ok('both ways are considered', !!up && !!east);
  ok('and the open one scores higher', east.score > up.score,
     `east ${east.score} up ${up.score}`);
}
{
  // A cell the opponent might also enter next tick is avoided, because a
  // head-on is a draw at best and this rider is playing to win.
  const g = board([2, 3, 3, 3], E, [4, 3, 3, 3], W);
  const dir = rider('hard', 1).choose(g, 0);
  const to = step(g.riders[0].at, dir || g.riders[0].heading, g.dims, g.wrap);
  ok('it does not drive into a contested cell',
     JSON.stringify(to) !== JSON.stringify([3, 3, 3, 3]),
     JSON.stringify(to));
}

console.log('\nit uses the fourth dimension when three are closing');
{
  // Walled in on x, y and z, with only w open. A rider that thought in three
  // dimensions would be dead here; this one has to find the way out.
  const g = board([1, 1, 1, 1], E, [5, 5, 5, 3], W);
  for (const d of unitDirs(4)) {
    if (d[3] !== 0) continue;                    // leave w alone
    const to = step([1, 1, 1, 1], d, g.dims, g.wrap);
    if (to) g.walls.set(key(to), 1);
  }
  for (const level of Object.keys(LEVELS)) {
    const dir = rider(level, 5).choose(g, 0);
    ok(`${level} escapes along w`, !!dir && dir[3] !== 0, JSON.stringify(dir));
  }
}

console.log('\nany number of dimensions');
{
  // The rider is written over the length of a cell, like everything else here,
  // so it has to drive a 2D and a 5D board without being told.
  const g2 = new Tron({ dims: [10, 10], wrap: [false, false], seed: 5 });
  const b2 = rider('hard', 1);
  for (let t = 0; t < 30 && !g2.over; t++) {
    const d = b2.choose(g2, 1);
    if (d) { eq('a 2D direction has two components', d.length, 2); g2.turn(1, d); }
    g2.step();
  }
  ok('a 2D board plays', g2.tick > 0);

  const g5 = new Tron({ dims: [5, 5, 5, 5, 5],
                        wrap: [false, false, false, false, false], seed: 5 });
  const b5 = rider('easy', 1);
  for (let t = 0; t < 30 && !g5.over; t++) {
    const d = b5.choose(g5, 1);
    if (d) { eq('a 5D direction has five', d.length, 5); g5.turn(1, d); }
    g5.step();
  }
  ok('a 5D board plays', g5.tick > 0);
}

console.log('\nthe same seed plays the same game');
{
  const run = () => {
    const g = new Tron({ seed: 21 });
    const bot = rider('easy', 99);
    const moves = [];
    for (let t = 0; t < 120 && !g.over; t++) {
      const d = bot.choose(g, 1);
      moves.push(d);
      if (d) g.turn(1, d);
      g.step();
    }
    return { moves, at: g.riders[1].at, tick: g.tick };
  };
  const a = run(), b = run();
  eq('every move is the same', a.moves, b.moves);
  eq('and it ends in the same place', a.at, b.at);
}

console.log('\nit is a real opponent, and the levels differ');
{
  // Against a rider that only ever goes straight, both levels should win
  // every time -- losing to that is not a difficulty setting, it is a bug.
  for (const level of Object.keys(LEVELS)) {
    let losses = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = new Tron({ seed });
      const bot = rider(level, seed + 500);
      while (!g.over && g.tick < 1500) {
        const d = bot.choose(g, 1);
        if (d) g.turn(1, d);
        g.step();
      }
      if (g.winner === 0) losses++;
    }
    eq(`${level} beats a rider that never turns`, losses, 0);
  }

  // And the two levels are genuinely different players: the fill survives
  // longer against itself than the one-step rider does, because filling space
  // is what keeps a Tron round going.
  const survive = (level) => {
    let total = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = new Tron({ seed });
      const a = rider(level, seed), b = rider(level, seed + 900);
      while (!g.over && g.tick < 2000) {
        const da = a.choose(g, 0); if (da) g.turn(0, da);
        const db = b.choose(g, 1); if (db) g.turn(1, db);
        g.step();
      }
      total += g.tick;
    }
    return total / 8;
  };
  const easy = survive('easy'), hard = survive('hard');
  ok('hard fills more board than easy', hard > easy * 1.3,
     `easy ${easy.toFixed(0)} hard ${hard.toFixed(0)}`);
  // A round always ends, whoever is driving. The model promises this and an
  // opponent that could stall forever would break it.
  ok('and a round always ends', easy < 2000 && hard < 2000);
}

console.log('\nthe default is the gentle one');
{
  ok('easy by default', DEFAULT_LEVEL === 'easy');
  const d = new Rider();
  ok('and a rider made with no options uses it',
     d.cfg.look === LEVELS.easy.look && d.cfg.mistake === LEVELS.easy.mistake);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
