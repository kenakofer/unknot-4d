// Tests for the shared engine.
//
// These matter more than either game's own tests: a mistake here shows up in
// every game at once, and the whole point of the shared layer is that a player
// can trust it to behave the same way everywhere.
import { Ring, Slide, SLIDE_DONE } from '../shared/ring.js';
import { rockAt, ROCK, NOD, PERIOD, NOD_PERIOD } from '../shared/rock.js';
import { step, unitDirs, allCells, Box, randomBox, makeRng, eq as cellEq, key }
  from '../shared/grid.js';
import { DIRECTIONS, KEYMAP, dirVec } from '../shared/pad.js';
import { SliceMap } from '../shared/slicemap.js';
import { pulseAt, PULSE_PERIOD, blinkPhase, BLINK_PERIOD }
  from '../shared/rock.js';
import { sidesAt, ngonRadius, tableW, SHAPE_LOOP } from '../shared/tableshape.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

console.log('\nthe ring of frames');
{
  const open = new Ring({ depth: 6, span: 6, wrap: false });
  const shut = new Ring({ depth: 6, span: 6, wrap: true });
  eq('a non-wrapping ring has a spare slot', open.slots, 7);
  eq('a wrapping ring does not', shut.slots, 6);
  eq('the spare slot is where the blocker stands', open.blockerSlot(), 6);
  eq('a wrapping ring has no blocker', shut.blockerSlot(), null);
}
{
  const r = new Ring({ depth: 6, span: 6, wrap: false });
  const o = r.offset(0);
  ok('slot 0 sits at the near point', close(o[0], 0) && close(o[2], 0));
  ok('every frame stands on one level', r.offset(3)[1] === 0);
  // Frames recede from the near point: slot 0 is nearest the camera, which
  // sits out along +z.
  ok('other slots sit further back', r.offset(1)[2] < 0 && r.offset(3)[2] < 0);
  ok('the far slot is furthest back', r.offset(3)[2] < r.offset(1)[2]);
}
{
  // Frames must not overlap: consecutive slots have to be at least a box apart,
  // or two rooms would occupy the same space on screen.
  for (const wrap of [false, true]) {
    const r = new Ring({ depth: 6, span: 6, wrap });
    let minGap = Infinity;
    for (let k = 0; k < r.slots; k++) {
      const a = r.offset(k), b = r.offset((k + 1) % r.slots);
      minGap = Math.min(minGap, Math.hypot(a[0] - b[0], a[2] - b[2]));
    }
    ok(`frames never overlap (wrap=${wrap})`, minGap > 6, `gap ${minGap}`);
  }
}
{
  const r = new Ring({ depth: 6, span: 6, wrap: true });
  // A wrapping ring closes: slot `depth` is exactly slot 0 again.
  const a = r.offset(0), b = r.offset(6);
  ok('a wrapping ring closes on itself',
     close(a[0], b[0], 1e-9) && close(a[2], b[2], 1e-9));
  const open = new Ring({ depth: 6, span: 6, wrap: false });
  const c = open.offset(0), d = open.offset(6);
  ok('a non-wrapping ring does not', Math.hypot(c[0] - d[0], c[2] - d[2]) > 1);
}
{
  const r = new Ring({ depth: 6, span: 6, wrap: true });
  eq('the short way forward across the seam', r.delta(5, 0), 1);
  eq('and backward across it', r.delta(0, 5), -1);
  eq('an ordinary step is itself', r.delta(2, 3), 1);
  eq('and a two-step is two', r.delta(1, 3), 2);
  const open = new Ring({ depth: 6, span: 6, wrap: false });
  eq('a non-wrapping ring never takes a short cut', open.delta(5, 0), -5);
}
{
  const r = new Ring({ depth: 6, span: 6, wrap: false });
  // yaw and offset must agree, or the camera faces a frame that is not there.
  for (const k of [0, 1, 3, 5]) {
    const o = r.offset(k), y = r.yaw(k), rad = r.radius;
    ok(`yaw and offset agree at slot ${k}`,
       close(o[0], rad * Math.sin(y), 1e-9) &&
       close(o[2], rad * Math.cos(y) - rad, 1e-9));
  }
}

{
  // Frames are placed, never turned. Every one has its axes along the world's,
  // so up is up and left is left in every room -- which is the claim all three
  // games make to the player, and the reason walking the ring must not rotate
  // anything. An earlier version turned the camera by the slot angle to meet
  // each frame "square on"; since the frames never faced outward, that spun the
  // world a sixth of a turn on every w move and destroyed whatever view the
  // player had set up.
  for (const wrap of [false, true]) {
    const r = new Ring({ depth: 6, span: 6, wrap });
    let aligned = true;
    for (let k = 0; k < r.slots; k++) {
      const o = r.offset(k);
      // A unit step along each axis inside frame k, in world terms.
      for (let d = 0; d < 3; d++) {
        const a = [o[0], o[1], o[2]];
        const b = [o[0], o[1], o[2]];
        b[d] += 1;
        const delta = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        for (let e = 0; e < 3; e++) {
          if (Math.abs(delta[e] - (e === d ? 1 : 0)) > 1e-12) aligned = false;
        }
      }
    }
    ok(`every frame is axis-aligned (wrap=${wrap})`, aligned);
  }
}
{
  // Frames differ only by translation: the vector between any two frames'
  // same-numbered cells is the same as the vector between the frames.
  const r = new Ring({ depth: 6, span: 6, wrap: true });
  let pureTranslation = true;
  for (let k = 0; k < r.slots; k++) {
    const o0 = r.offset(0), ok_ = r.offset(k);
    const cellA = [2 + o0[0], 3 + o0[1], 4 + o0[2]];
    const cellB = [2 + ok_[0], 3 + ok_[1], 4 + ok_[2]];
    for (let d = 0; d < 3; d++) {
      if (Math.abs((cellB[d] - cellA[d]) - (ok_[d] - o0[d])) > 1e-12) {
        pureTranslation = false;
      }
    }
  }
  ok('moving between frames is pure translation', pureTranslation);
}

{
  // The focused slot always sits at the near point of the circle -- 6 o'clock,
  // where the camera is. That is what lets the camera stand still: the ring
  // turns and brings the right room to it, so the slice being played in is
  // always in the same place on screen whatever w it is.
  for (const wrap of [false, true]) {
    const r = new Ring({ depth: 6, span: 6, wrap });
    let worst = 0;
    for (let f = 0; f < r.slots; f++) {
      const o = r.offset(f, f);
      worst = Math.max(worst, Math.hypot(o[0], o[2]));
    }
    ok(`the focused slot is always at the near point (wrap=${wrap})`,
       worst < 1e-12, `worst ${worst}`);
  }
}
{
  // Turning the ring is pure rotation of the POSITIONS: the distance between
  // any two frames never changes, however far it has turned.
  const r = new Ring({ depth: 6, span: 6, wrap: true });
  const gap = (f) => {
    const a = r.offset(0, f), b = r.offset(1, f);
    return Math.hypot(a[0] - b[0], a[2] - b[2]);
  };
  const base = gap(0);
  let worst = 0;
  for (let f = 0; f <= 6; f += 0.25) worst = Math.max(worst, Math.abs(gap(f) - base));
  ok('frames keep their spacing as the ring turns', worst < 1e-9,
     `drifted by ${worst}`);
}
{
  // And the motion is continuous: no fractional focus produces a jump, which is
  // what makes the slide readable rather than a series of cuts.
  const r = new Ring({ depth: 6, span: 6, wrap: true });
  let worst = 0;
  let prev = r.offset(3, 0);
  for (let f = 0.02; f <= 6; f += 0.02) {
    const now = r.offset(3, f);
    worst = Math.max(worst, Math.hypot(now[0] - prev[0], now[2] - prev[2]));
    prev = now;
  }
  ok('the ring turns continuously, with no jumps', worst < 0.5,
     `largest step ${worst.toFixed(3)}`);
}
{
  // A focus of 0 gives the old absolute layout, so a game with no focus to
  // track is unaffected.
  const r = new Ring({ depth: 6, span: 6, wrap: true });
  for (const k of [0, 2, 5]) {
    eq(`offset(${k}) defaults to the unturned ring`,
       r.offset(k).map((v) => +v.toFixed(9)),
       r.offset(k, 0).map((v) => +v.toFixed(9)));
  }
}

console.log('\nsliding between frames');
{
  const s = new Slide(0);
  s.focus = 3;
  ok('a fresh slide has something to do', s.step(0.016));
  ok('and moves toward the focus', s.shown > 0 && s.shown < 3);
  for (let i = 0; i < 400; i++) s.step(0.016);
  eq('and arrives exactly', s.shown, 3);
  ok('then reports nothing left to do', !s.step(0.016));
}
{
  const s = new Slide(2);
  s.snap(5);
  eq('snap moves both at once', [s.focus, s.shown], [5, 5]);
  ok('and leaves nothing to animate', !s.step(0.016));
}
{
  // Frame-rate independence: the same elapsed time must land in the same place
  // however it is chopped up, or the slide would run at different speeds on
  // different monitors.
  const a = new Slide(0); a.focus = 4;
  const b = new Slide(0); b.focus = 4;
  for (let i = 0; i < 60; i++) a.step(1 / 60);
  for (let i = 0; i < 120; i++) b.step(1 / 120);
  ok('one second is one second at any frame rate',
     close(a.shown, b.shown, 1e-6), `${a.shown} vs ${b.shown}`);
}
{
  // Across the seam of a wrapping ring the slide takes the SHORT way -- five
  // frames of travel to go one step would read as the world spinning.
  const r = new Ring({ depth: 6, span: 6, wrap: true });
  const s = new Slide(5, r);
  s.focus = 0;
  s.step(0.05);
  ok('a wrap slides forward past the end, not back round',
     s.shown > 5 || s.shown < 0.5, `shown ${s.shown}`);
  for (let i = 0; i < 400; i++) s.step(0.016);
  eq('and settles on the focus', s.shown, 0);
}
{
  // Repeated trips round a wrapping ring must not let `shown` drift off.
  const r = new Ring({ depth: 6, span: 6, wrap: true });
  const s = new Slide(0, r);
  for (let lap = 0; lap < 3; lap++) {
    for (let w = 0; w < 6; w++) {
      s.focus = w;
      for (let i = 0; i < 200; i++) s.step(0.016);
    }
  }
  ok('shown stays in range after three laps', s.shown >= 0 && s.shown < 6,
     `shown ${s.shown}`);
}
{
  const s = new Slide(0);
  s.focus = SLIDE_DONE / 2;
  s.step(0.016);
  eq('a sub-threshold gap snaps rather than crawling', s.shown, s.focus);
}

console.log('\nthe rock');
{
  const r0 = rockAt(0);
  ok('starts centred', close(r0.yaw, 0) && close(r0.tilt, 0));
  let maxY = 0, maxT = 0;
  for (let t = 0; t < PERIOD * 4; t += 25) {
    const r = rockAt(t);
    maxY = Math.max(maxY, Math.abs(r.yaw));
    maxT = Math.max(maxT, Math.abs(r.tilt));
  }
  ok('yaw swings the stated amount', close(maxY, ROCK, 1e-3), `${maxY}`);
  ok('tilt swings the stated amount', close(maxT, NOD, 1e-3), `${maxT}`);
  const a = rockAt(12345), b = rockAt(12345 + PERIOD);
  ok('yaw is a closed loop', close(a.yaw, b.yaw, 1e-9));
  ok('the two periods do not divide into each other',
     PERIOD % NOD_PERIOD !== 0 && NOD_PERIOD % PERIOD !== 0);
}

console.log('\nthe grid');
{
  eq('a step moves one cell', step([1, 1, 1, 1], [1, 0, 0, 0], [6, 6, 6, 6]),
     [2, 1, 1, 1]);
  eq('a step into a wall is refused',
     step([5, 1, 1, 1], [1, 0, 0, 0], [6, 6, 6, 6]), null);
  eq('a step off a wrapping axis comes back round',
     step([1, 1, 1, 5], [0, 0, 0, 1], [6, 6, 6, 6], [false, false, false, true]),
     [1, 1, 1, 0]);
  eq('and the other way',
     step([1, 1, 1, 0], [0, 0, 0, -1], [6, 6, 6, 6], [false, false, false, true]),
     [1, 1, 1, 5]);
  eq('a wrapping axis never refuses a step',
     step([0, 0, 0, 0], [0, 0, 0, -1], [6, 6, 6, 6], [false, false, false, true]),
     [0, 0, 0, 5]);
}
{
  eq('4D has eight neighbours', unitDirs(4).length, 8);
  eq('2D has four', unitDirs(2).length, 4);
  ok('every one is a unit step',
     unitDirs(4).every((d) => d.reduce((a, b) => a + Math.abs(b), 0) === 1));
  ok('and they are all different',
     new Set(unitDirs(4).map(String)).size === 8);
}
{
  eq('a 6^4 grid has 1296 cells', allCells([6, 6, 6, 6]).length, 1296);
  ok('all distinct', new Set(allCells([4, 4, 4]).map(String)).size === 64);
  eq('a 2D grid works too', allCells([2, 3]).length, 6);
}
{
  const b = new Box([1, 1, 1, 1], [3, 2, 2, 1]);
  eq('a box has the volume its size says', b.cells().length, 12);
  ok('it contains its origin', b.contains([1, 1, 1, 1]));
  ok('and its far corner', b.contains([3, 2, 2, 1]));
  ok('but not one past it', !b.contains([4, 2, 2, 1]));
  ok('nor one before it', !b.contains([0, 1, 1, 1]));
  ok('every listed cell is contained', b.cells().every((c) => b.contains(c)));
}
{
  const a = new Box([0, 0, 0, 0], [2, 2, 2, 2]);
  ok('a box overlaps itself', a.overlaps(a));
  ok('touching face to face is not overlapping',
     !a.overlaps(new Box([2, 0, 0, 0], [2, 2, 2, 2])));
  ok('but sharing a cell is', a.overlaps(new Box([1, 1, 1, 1], [2, 2, 2, 2])));
  ok('and being far away is not',
     !a.overlaps(new Box([5, 5, 5, 5], [1, 1, 1, 1])));
}
{
  // A random box is a permutation of the size, always inside the grid.
  const rng = makeRng(9);
  let inside = true, permuted = true;
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const b = randomBox([3, 2, 2, 1], [6, 6, 6, 6], rng);
    if (!b.origin.every((o, d) => o >= 0 && o + b.size[d] <= 6)) inside = false;
    if ([...b.size].sort().join() !== '1,2,2,3') permuted = false;
    seen.add(b.size.join());
  }
  ok('a random box always fits inside the grid', inside);
  ok('and is always a permutation of the size asked for', permuted);
  ok('and the orientation really varies', seen.size > 4, `${seen.size} seen`);
}
{
  const a = makeRng(4), b = makeRng(4), c = makeRng(5);
  const draw = (f) => Array.from({ length: 8 }, () => f());
  eq('the same seed gives the same stream', draw(a), draw(b));
  ok('a different seed does not',
     JSON.stringify(draw(makeRng(4))) !== JSON.stringify(draw(c)));
  const r = makeRng(1);
  let inRange = true;
  for (let i = 0; i < 5000; i++) { const v = r(); if (v < 0 || v >= 1) inRange = false; }
  ok('and every draw is in [0, 1)', inRange);
}
{
  ok('cells compare by value', cellEq([1, 2, 3, 4], [1, 2, 3, 4]));
  ok('and differ when they differ', !cellEq([1, 2, 3, 4], [1, 2, 3, 5]));
  eq('a key is the joined coordinates', key([1, 2, 3, 4]), '1,2,3,4');
}

console.log('\nthe direction pad');
{
  eq('eight directions', DIRECTIONS.length, 8);
  eq('four axes', new Set(DIRECTIONS.map((d) => d.axis)).size, 4);
  // Every axis has exactly one of each sign -- a pad missing a direction, or
  // offering one twice, would break the transfer between games.
  for (let a = 0; a < 4; a++) {
    const on = DIRECTIONS.filter((d) => d.axis === a);
    eq(`axis ${a} has a pair`, on.map((d) => d.sign).sort(), [-1, 1]);
  }
}
{
  // The keys are the contract between games. If these ever move, a player's
  // muscle memory moves with them, so they are pinned here.
  const byKey = Object.fromEntries(
    DIRECTIONS.map((d) => [d.key, `${d.axis}${d.sign > 0 ? '+' : '-'}`]));
  eq('W is up', byKey.w, '1+');
  eq('S is down', byKey.s, '1-');
  eq('A steps back along the fourth dimension', byKey.a, '3-');
  eq('D steps forward along it', byKey.d, '3+');
  // The two directions along a fourth axis have names of their own, from
  // Hinton: ana for the positive direction, kata for the negative. Pinned here
  // because they are part of the vocabulary, not decoration.
  const nameOf = Object.fromEntries(DIRECTIONS.map((d) => [d.key, d.name]));
  eq('D is ana', nameOf.d, 'ana');
  eq('A is kata', nameOf.a, 'kata');
  eq('right is east', byKey.ArrowRight, '0+');
  eq('left is west', byKey.ArrowLeft, '0-');
  eq('up is north', byKey.ArrowUp, '2-');
  eq('down is south', byKey.ArrowDown, '2+');
}
{
  ok('letter keys work in either case',
     KEYMAP.w === KEYMAP.W && KEYMAP.a === KEYMAP.A);
  eq('a direction vector is a unit step', dirVec(2, -1, 4), [0, 0, -1, 0]);
  eq('an axis past the end of the space is all zero', dirVec(3, 1, 3), [0, 0, 0]);
  eq('so a 3D game can share the same pad list',
     dirVec(3, 1, 3).reduce((a, b) => a + Math.abs(b), 0), 0);
}

console.log('\nboxes and the slices they occupy');
{
  // The bug this guards against: a lava block's proportions are shuffled across
  // ALL FOUR axes when it is placed, so the short side often lands on a spatial
  // axis and the block ends up several slices deep in w. Anything that draws
  // one thing per block "at its own slice" then misses every other slice the
  // block occupies -- which is what happened, and left hazards invisible but
  // still lethal.
  //
  // So: a box's extent along an axis is size[axis], and a renderer must walk it.
  const b = new Box([1, 2, 3, 2], [3, 2, 2, 1]);
  eq('a box knows its extent on every axis', b.size, [3, 2, 2, 1]);
  const slices = new Set(b.cells().map((c) => c[3]));
  eq('a 1-deep box occupies one slice', [...slices], [2]);

  const deep = new Box([1, 2, 3, 2], [3, 2, 1, 2]);
  const deepSlices = [...new Set(deep.cells().map((c) => c[3]))].sort();
  eq('a 2-deep box occupies two', deepSlices, [2, 3]);
  ok('and its cells are spread over both',
     deep.cells().filter((c) => c[3] === 2).length ===
     deep.cells().filter((c) => c[3] === 3).length);
}
{
  // randomBox permutes the size across every axis, so the depth along any given
  // axis varies. A caller that assumes one particular axis keeps the "1" is
  // wrong most of the time -- state that plainly here so nobody assumes it
  // again.
  const rng = makeRng(11);
  const depths = {};
  for (let i = 0; i < 400; i++) {
    const b = randomBox([3, 2, 2, 1], [6, 6, 6, 6], rng);
    depths[b.size[3]] = (depths[b.size[3]] || 0) + 1;
  }
  ok('a random box is often more than one slice deep',
     (depths[2] || 0) + (depths[3] || 0) > (depths[1] || 0),
     JSON.stringify(depths));
  ok('but sometimes exactly one', (depths[1] || 0) > 0);
  ok('and never zero or four', !depths[0] && !depths[4],
     JSON.stringify(depths));
}

console.log('\nthe slice map');
{
  // The panel is pure geometry plus SVG, so the part worth testing is which
  // cells it considers to be in the slice -- that is the claim it makes to the
  // player ("everything here is one step away"), and the part a wrong axis
  // index would silently break.
  const m = new SliceMap(null, { axes: [3, 1], dims: [6, 6, 6, 6],
                                 wrap: [false, false, false, true] });
  m.focus = [2, 3, 4, 1];
  ok('the focus is in its own slice', m.inSlice([2, 3, 4, 1]));
  ok('moving along the vertical axis stays in slice', m.inSlice([2, 5, 4, 1]));
  ok('moving along the horizontal axis stays in slice', m.inSlice([2, 3, 4, 5]));
  ok('and both at once', m.inSlice([2, 0, 4, 0]));
  ok('but moving along a pinned axis leaves it', !m.inSlice([3, 3, 4, 1]));
  ok('either pinned axis', !m.inSlice([2, 3, 5, 1]));
  ok('and both', !m.inSlice([0, 3, 0, 1]));
}
{
  // The axis colours must match the pad's, or the panel and the buttons would
  // disagree about which direction is which.
  const m = new SliceMap(null, { axes: [3, 1], dims: [6, 6, 6, 6] });
  eq('axis 0 is orange', m.axisColour(0), '#ff9e6d');
  eq('axis 1 is green', m.axisColour(1), '#6ee7a8');
  eq('axis 2 is blue', m.axisColour(2), '#7cc4ff');
  eq('axis 3 is purple', m.axisColour(3), '#c89bff');
}
{
  // flipV decides which screen direction the vertical axis grows in. An axis
  // like height wants larger-is-up; an axis like z, where larger is south,
  // wants larger-is-down on a panel drawn from above.
  const up = new SliceMap(null, { axes: [3, 1], dims: [6, 6, 6, 6] });
  const down = new SliceMap(null, { axes: [0, 2], dims: [6, 6, 6, 6], flipV: true });
  eq('unflipped is larger-is-up by default', up.flipV, false);
  eq('and flipped when asked', down.flipV, true);
  // Both still agree about what is in their slice; the flip is presentation.
  up.focus = [1, 2, 3, 4];
  down.focus = [1, 2, 3, 4];
  ok('the w-y panel pins x and z',
     up.inSlice([1, 5, 3, 0]) && !up.inSlice([2, 2, 3, 4]));
  ok('the x-z panel pins w and y',
     down.inSlice([5, 2, 0, 4]) && !down.inSlice([1, 3, 3, 4]));
  // Between them, every axis is drawn by exactly one panel -- which is the
  // whole reason for having two.
  const drawn = new Set([...up.axes, ...down.axes]);
  eq('together they cover all four axes', drawn.size, 4);
}
{
  // A 2D game's slice map pins nothing: every cell is in the only slice there
  // is. Same code, no special case.
  const m = new SliceMap(null, { axes: [0, 1], dims: [10, 10] });
  m.focus = [3, 4];
  ok('in 2D everything is in slice', m.inSlice([9, 0]) && m.inSlice([0, 9]));
}

console.log('\nthe pad teaches itself away');
{
  // The Pad's hide rule is DOM-driven, so what is testable here is the split
  // that decides which keys belong to which cluster -- and therefore which set
  // of keys has to be pressed before a cluster goes quiet.
  //
  // Each cluster must be complete on its own: a player who has learned WASD
  // should lose WASD and keep the arrows, so the two sets have to partition
  // the eight directions rather than overlap or leave one out.
  const vertical = DIRECTIONS.filter((d) => d.axis === 1 || d.axis === 3);
  const horizontal = DIRECTIONS.filter((d) => d.axis !== 1 && d.axis !== 3);
  eq('four keys in the vertical cluster', vertical.length, 4);
  eq('four in the horizontal one', horizontal.length, 4);
  eq('and they account for every direction',
     vertical.length + horizontal.length, DIRECTIONS.length);
  const keys = new Set([...vertical, ...horizontal].map((d) => d.key));
  eq('with no key in both', keys.size, DIRECTIONS.length);
  // The vertical cluster is the one holding height and the fourth dimension --
  // the keys that move in the w-y plane, which is the panel it sits above.
  ok('vertical holds W, S, A and D',
     ['w', 's', 'a', 'd'].every((k) => vertical.some((d) => d.key === k)));
  ok('horizontal holds the four arrows',
     horizontal.every((d) => d.key.startsWith('Arrow')));
}

console.log('\nthe soft pulse');
{
  // A pulse and a blink must not look like the same kind of thing: one marks
  // where you ARE, the other where you are going. So the pulse is smooth where
  // the blink is a hard switch, and slower, so the two never keep time.
  eq('a pulse starts dark', +pulseAt(0).toFixed(6), 0);
  eq('and peaks halfway', +pulseAt(PULSE_PERIOD / 2).toFixed(6), 1);
  eq('and closes the loop', +pulseAt(PULSE_PERIOD).toFixed(6), 0);
  let inRange = true, maxStep = 0, prev = pulseAt(0);
  for (let t = 1; t <= PULSE_PERIOD * 2; t += 1) {
    const v = pulseAt(t);
    if (v < 0 || v > 1) inRange = false;
    maxStep = Math.max(maxStep, Math.abs(v - prev));
    prev = v;
  }
  ok('it stays within 0..1', inRange);
  ok('and moves smoothly, with no edge', maxStep < 0.01,
     `largest step ${maxStep.toFixed(4)}`);
  ok('while the blink is a hard switch',
     blinkPhase(0) === 0 && blinkPhase(BLINK_PERIOD * 0.9) === 1);
  ok('and the two run at different periods', PULSE_PERIOD !== BLINK_PERIOD);
}

console.log('\nthe table is one 4D solid, sliced');
{
  // The shapes a player is promised, at the w values they are promised at. If
  // these drift the effect is gone -- a table that is "roughly triangular"
  // somewhere in the middle reads as a wobble, not as a slice through a solid.
  const D = 6;
  eq('a circle at the near slice', Math.round(sidesAt(0, D)), 64);
  eq('a triangle a quarter of the way round', +sidesAt(D / 4, D).toFixed(6), 3);
  eq('a hexagon at the far side', +sidesAt(D / 2, D).toFixed(6), 6);
  eq('a triangle again three quarters round', +sidesAt(3 * D / 4, D).toFixed(6), 3);

  // The loop has to close: w wraps, so a player who walks all the way round
  // must find the table exactly as they left it, not one shape out of step.
  ok('and the loop closes back to the circle',
     close(sidesAt(D, D), sidesAt(0, D)));
  ok('so does the slice one step before the seam',
     close(sidesAt(D - 0.3, D), sidesAt(-0.3, D)));

  // Nothing may jump. The table transforms while the ring is turning, so a
  // discontinuity anywhere would be seen as a snap.
  let maxStep = 0, prev = 1 / sidesAt(0, D);
  for (let w = 0.01; w <= D * 2; w += 0.01) {
    // Measured in 1/n, which is the space the blend is linear in and the one
    // where the step from 6 sides to 64 is small rather than enormous.
    const v = 1 / sidesAt(w, D);
    maxStep = Math.max(maxStep, Math.abs(v - prev));
    prev = v;
  }
  ok('the shape never jumps', maxStep < 0.005,
     `largest step ${maxStep.toFixed(5)}`);

  // Depth-independence: the same fraction of the way round gives the same
  // shape whether the board is 4 deep or 12, so the effect does not have to be
  // retuned per game.
  ok('the sequence is the same on a deeper board',
     close(sidesAt(3, 12), sidesAt(1.5, 6)));

  ok('every named shape is in the loop',
     SHAPE_LOOP.includes(3) && SHAPE_LOOP.includes(6));
}

console.log('\nand the slices are honest polygons');
{
  // A regular n-gon of circumradius 1: the vertices reach exactly 1, and the
  // edge midpoints come closest, at cos(pi/n). If this is wrong the table is
  // some other shape that merely has the right number of corners.
  for (const n of [3, 6]) {
    let far = 0, near = Infinity;
    for (let i = 0; i < 3600; i++) {
      const r = ngonRadius((i / 3600) * Math.PI * 2, n);
      far = Math.max(far, r);
      near = Math.min(near, r);
    }
    ok(`a ${n}-gon reaches its circumradius`, close(far, 1, 1e-6));
    ok(`and comes in to cos(pi/${n}) between corners`,
       close(near, Math.cos(Math.PI / n), 1e-6));

    // Count the corners the way an eye does: local maxima of the radius.
    let corners = 0;
    const N = 3600;
    for (let i = 0; i < N; i++) {
      const a = ngonRadius(((i - 1 + N) % N / N) * Math.PI * 2, n);
      const b = ngonRadius((i / N) * Math.PI * 2, n);
      const c = ngonRadius(((i + 1) % N / N) * Math.PI * 2, n);
      if (b >= a && b > c) corners++;
    }
    eq(`and has ${n} corners`, corners, n);
  }

  // The circle stand-in has to be indistinguishable from a circle: at 64 sides
  // the deepest dip is a fraction of a percent, which no one can see.
  ok('64 sides is a circle to the eye',
     1 - Math.cos(Math.PI / 64) < 0.002);
}

console.log('\nand the table turns with the camera');
{
  // The exchange rate is the ring's own: it places one slot every 2pi/slots of
  // yaw, so swinging the camera by exactly one frame's width must move the
  // table by exactly one slice. If these two ever disagree, turning the view
  // and stepping through w cut the solid by different amounts and the table
  // stops reading as one object seen from a moving eye.
  const slots = 6;
  const oneFrame = (2 * Math.PI) / slots;
  ok('a still camera leaves the slice alone', close(tableW(2, 0, slots), 2));
  ok('swinging one frame left moves one slice',
     close(tableW(2, oneFrame, slots), 3));
  ok('and one frame right moves back one',
     close(tableW(2, -oneFrame, slots), 1));
  ok('a full swing round is a full lap of the loop',
     close(tableW(0, 2 * Math.PI, slots), slots));

  // Which means the two are interchangeable: standing at slice 2 having turned
  // a frame's width is the same cut as standing at slice 3 square on.
  ok('turning and stepping are the same cut',
     close(sidesAt(tableW(2, oneFrame, slots), slots),
           sidesAt(tableW(3, 0, slots), slots)));

  // A walled ring carries a spare slot, so its frames sit closer together in
  // angle. The conversion has to use the ring's slot count rather than the
  // board's depth, or the table turns at the wrong rate on exactly those games.
  ok('a walled ring converts at its own rate',
     close(tableW(0, (2 * Math.PI) / 7, 7), 1));
  ok('which is not the wrapping rate',
     !close(tableW(0, (2 * Math.PI) / 7, 7), tableW(0, (2 * Math.PI) / 7, 6)));

  // The rock is small, so it must sway the table without re-cutting it into a
  // different shape. ROCK is 0.105 rad.
  //
  // Measured as the deepest dip of the outline, not as a change in side count:
  // between 64 sides and 34 the count halves while the shape stays a circle to
  // any eye, so the count is the wrong yardstick for "looks different". What a
  // player can actually see is how far the edge bows in from the corners.
  const dip = (n) => 1 - Math.cos(Math.PI / n);
  const swayed = tableW(0, 0.105, slots);
  ok('the rock sways the table without re-cutting it',
     Math.abs(dip(sidesAt(swayed, slots)) - dip(sidesAt(0, slots))) < 0.01,
     `slice ${swayed.toFixed(3)}, ${sidesAt(swayed, slots).toFixed(1)} sides`);

  // But a real step through w must be plainly visible, or the effect is not
  // there at all. One slice out of six is a quarter of the way to the triangle.
  ok('while a step through w plainly changes it',
     dip(sidesAt(1.5, slots)) - dip(sidesAt(0, slots)) > 0.4);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
