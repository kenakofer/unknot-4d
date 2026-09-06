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
import { valueNoise, fbm, marble, marbleTiled } from '../shared/noise.js';
import { sliceRadius } from '../shared/orbshape.js';
import { UV_SCALE, MARBLE_RINGS, MARBLE_TEXELS, VEINS, WARP, YAW_FLOW,
  YAW_FLOW_TURNS, DRIFT_RADIUS, DRIFT_SPIN, OUTLINE_STEP } from '../shared/tableconst.js';
import { topSegments, topVertexCount, topIndex, fillTop } from '../shared/tablegrid.js';

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

console.log('\nthe marbling');
{
  // Determinism is the whole reason this is a hash rather than a random number.
  // The table's mesh is thrown away and rebuilt every time its shape changes,
  // so a field that answered differently on the second ask would boil.
  ok('the same point gives the same value, always',
     marble([1.3, 0.2, 4.7, 2.1]) === marble([1.3, 0.2, 4.7, 2.1]));
  ok('and so does the noise underneath',
     valueNoise([3.5, 1.25, 0.5]) === valueNoise([3.5, 1.25, 0.5]));

  // Everything downstream maps these onto a colour ramp, so a value outside
  // 0..1 would silently clip to the wrong end of it.
  let lo = Infinity, hi = -Infinity, rng = makeRng(7);
  for (let i = 0; i < 3000; i++) {
    const p = [rng() * 20 - 10, rng() * 20 - 10, rng() * 20 - 10, rng() * 20 - 10];
    const v = marble(p);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
    if (fbm(p) < 0 || fbm(p) > 1) { lo = -1; break; }
  }
  ok('values stay inside 0..1', lo >= 0 && hi <= 1, `saw ${lo.toFixed(3)}..${hi.toFixed(3)}`);
  ok('and actually use the range', hi - lo > 0.8, `spread ${(hi - lo).toFixed(3)}`);

  // Smooth, or the surface shows facets and the veins crawl as the table turns.
  //
  // Stepped at the spacing the table actually samples at, not in raw field
  // units. Measuring in field units instead asks whether the noise is smooth
  // over distances the surface never spans.
  const VEIN_OPTS = { veins: VEINS, warp: WARP };
  // One texel of the baked tile, in tile units. The pattern is an image now,
  // so smoothness is about the image not being noise at texel scale.
  const STEP = 1 / MARBLE_TEXELS;
  let biggest = 0, prev = marbleTiled(0, 0.3, VEIN_OPTS);
  for (let t = STEP; t <= 1; t += STEP) {
    const v = marbleTiled(t, 0.3, VEIN_OPTS);
    biggest = Math.max(biggest, Math.abs(v - prev));
    prev = v;
  }
  // A fortieth of the ramp between neighbouring texels. The ramp spans two
  // near-blacks a few percent of full brightness apart, so a step this size is
  // far below what linear filtering can show as a step -- the threshold is
  // about the texel grid being invisible, not about the noise being flat.
  //
  // Held against MARBLE_TEXELS, the size the table actually bakes at, so
  // sharpening the veins without enlarging the tile fails here rather than
  // quietly pixelating. The vertex-painted version of this test caught the
  // same mistake once, when the vein scale doubled and the ring count did not.
  ok('it varies smoothly across the surface', biggest < 0.026,
     `largest step ${biggest.toFixed(4)}`);

  // The tile has to repeat without a join, or sliding it would step across a
  // visible seam every time the offset wrapped. This is what sampling the
  // square as a torus buys.
  let seam = 0;
  for (let j = 0; j < 128; j++) {
    const t = j / 128;
    seam = Math.max(seam, Math.abs(marbleTiled(0, t) - marbleTiled(1 - 1e-9, t)));
    seam = Math.max(seam, Math.abs(marbleTiled(t, 0) - marbleTiled(t, 1 - 1e-9)));
  }
  ok('and the baked tile has no seam', seam < 1e-6,
     `worst join ${seam.toExponential(2)}`);

  // Marble, not corduroy. A vein ramp driven along an axis survives being baked
  // onto a tile as a set of parallel waves -- measured once at 1.00 of
  // variation along u against 0.09 along v, which reads as a gradient rather
  // than as stone. The pattern must have no preferred direction.
  const swing = (fix) => {
    let most = 0;
    for (let i = 0; i < 24; i++) {
      let lo = 1, hi = 0;
      for (let j = 0; j < 24; j++) {
        const m = fix(i / 24, j / 24);
        lo = Math.min(lo, m); hi = Math.max(hi, m);
      }
      most = Math.max(most, hi - lo);
    }
    return most;
  };
  const alongV = swing((a, b) => marbleTiled(a, b, VEIN_OPTS));
  const alongU = swing((a, b) => marbleTiled(b, a, VEIN_OPTS));
  ok('and it is not banded along either axis',
     Math.min(alongU, alongV) / Math.max(alongU, alongV) > 0.5,
     `u ${alongU.toFixed(3)} vs v ${alongV.toFixed(3)}`);
  ok('and it varies richly in both', Math.min(alongU, alongV) > 0.3,
     `weaker axis swings ${Math.min(alongU, alongV).toFixed(3)}`);

  // w wraps, so the marbling has to wrap with it: walk all the way round and
  // the stone must be the stone you started on.
  //
  // The drift used to be a straight line across the tile, which does not close
  // -- over a lap of a six-deep board it moved the offset by 0.651 and -0.399
  // of a tile, so the same slice came back wearing a different pattern. The
  // path is a circle now, which returns to its own start for any radius and any
  // depth rather than only for numbers that happen to divide.
  const where = (turns) => {
    const a = turns * Math.PI * 2;
    return [Math.cos(a) * DRIFT_RADIUS, Math.sin(a) * DRIFT_RADIUS,
            a * DRIFT_SPIN];
  };
  const home = where(0), lap = where(1);
  ok('a full lap of w returns the offset exactly',
     Math.abs(lap[0] - home[0]) < 1e-12 && Math.abs(lap[1] - home[1]) < 1e-12,
     `off by ${Math.abs(lap[0] - home[0]).toExponential(2)}`);
  // The angle has to come home as well. A fractional spin leaves the tile
  // sampled at a tilt after a lap, which is a seam that the offset returning
  // exactly does nothing to hide -- 0.15 turns per lap left it 54 degrees out.
  ok('and the rotation returns to a whole number of turns',
     Math.abs(DRIFT_SPIN - Math.round(DRIFT_SPIN)) < 1e-12,
     `${DRIFT_SPIN} turns per lap`);
  ok('and every lap after it, too',
     [2, 3, 7].every((k) => {
       const p = where(k);
       return Math.abs(p[0] - home[0]) < 1e-9 && Math.abs(p[1] - home[1]) < 1e-9;
     }));
  // Halfway round must NOT be home, or the loop is a there-and-back rather than
  // a journey and half the board's w looks like the other half.
  const half = where(0.5);
  ok('while halfway round is somewhere else entirely',
     Math.hypot(half[0] - home[0], half[1] - home[1]) > DRIFT_RADIUS,
     `moved ${Math.hypot(half[0] - home[0], half[1] - home[1]).toFixed(3)}`);
  // And the lap should be worth taking: the circumference is how much distinct
  // pattern a full trip travels over.
  ok('and a lap covers a good stretch of the tile',
     2 * Math.PI * DRIFT_RADIUS > 1.5,
     `${(2 * Math.PI * DRIFT_RADIUS).toFixed(2)} tiles`);

  // It has to be a FIELD, not a function of one axis: a table whose marbling
  // only varied with x would read as stripes.
  ok('it varies in every dimension', [0, 1, 2, 3].every((d) => {
    const a = [1, 1, 1, 1], b = [1, 1, 1, 1];
    b[d] += 3.7;
    return Math.abs(marble(a) - marble(b)) > 1e-6;
  }));

  // The camera's own swing has to move the sample enough to SEE, which is the
  // thing that broke: the outline and the marbling were sharing one gain, and
  // ROCK is a fifth of a slice on a six-slot ring, shrunk again by W_SCALE. A
  // full swing moved the sample by 0.0016 and the surface sat still while the
  // view rocked over it.
  {
    const ROCK_RAD = 0.105;
    const swing = 2 * ROCK_RAD * YAW_FLOW;
    ok('a rock moves the marbling by something visible', swing > 0.25,
       `full swing shifts the sample by ${swing.toFixed(3)}`);
    // Averaged over the surface rather than checked at one point: any single
    // spot can happen to sit in a flat part of the field and move very little,
    // which says nothing about whether the marbling as a whole shifted.
    let moved = 0, at = 0;
    for (let x = -8; x <= 8; x += 1.7) {
      for (let z = -8; z <= 8; z += 1.7) {
        const lo = marble([x * 0.34, -ROCK_RAD * YAW_FLOW, z * 0.34, 0], VEIN_OPTS);
        const hi = marble([x * 0.34, +ROCK_RAD * YAW_FLOW, z * 0.34, 0], VEIN_OPTS);
        moved += Math.abs(hi - lo); at++;
      }
    }
    ok('and the surface actually shifts across one', moved / at > 0.02,
       `mean change ${(moved / at).toFixed(4)} over ${at} points`);
  }

  // The point of sampling in 4D: moving along w has to flow the pattern rather
  // than leave it alone, or the marbling is painted on rather than sliced out.
  const still = marble([2, 0, 3, 0], VEIN_OPTS);
  ok('and moving through w changes the surface',
     Math.abs(marble([2, 0, 3, 1.5], VEIN_OPTS) - still) > 0.01);

  // But a step through w must not tear it -- the stone should drift, so that a
  // slice looks like the same table seen a little differently.
  // Stepped at a frame's worth of drift rather than a whole slice: a slide
  // crosses a slice over many frames, so this is the largest jump the pattern
  // can actually make between two drawn frames.
  let jump = 0, was = marble([2, 0, 3, 0], VEIN_OPTS);
  for (let w = 0.005; w < 6; w += 0.005) {
    const v = marble([2, 0, 3, w * 0.35], VEIN_OPTS);
    jump = Math.max(jump, Math.abs(v - was));
    was = v;
  }
  ok('the flow through w has no seam in it', jump < 0.02,
     `largest step ${jump.toFixed(4)}`);

  // Octaves must add detail, not just scale one shape.
  ok('more octaves means more detail', (() => {
    const one = [], four = [];
    for (let t = 0; t < 6; t += 0.02) {
      one.push(fbm([t, 0.5], { octaves: 1 }));
      four.push(fbm([t, 0.5], { octaves: 4 }));
    }
    const wiggle = (a) => a.reduce((s, v, i) => i ? s + Math.abs(v - a[i - 1]) : 0, 0);
    return wiggle(four) > wiggle(one) * 1.2;
  })());

  // Dimension-agnostic, like everything else in shared/.
  ok('it works in any number of dimensions',
     [2, 3, 4, 5].every((D) => {
       const v = fbm(Array(D).fill(1.5));
       return v >= 0 && v <= 1;
     }));
}

console.log('\nhyperspheres over the table');
{
  const D = 6;
  // A ball sliced through its own centre is at full size; the slice shrinks by
  // Pythagoras from there and reaches nothing at the ball's edge.
  eq('a slice through the centre is the full ball', sliceRadius(2, 3, 3, D), 2);
  ok('one step off centre follows the circle',
     close(sliceRadius(2, 3, 4, D), Math.sqrt(3)));
  eq('and the slice at the very edge is a point', sliceRadius(2, 3, 5, D), 0);

  // Vanishing, not fading. An orb further away than its own radius is not
  // there at all -- that is the difference between a 4D object passing through
  // the slice and a light someone turned down.
  eq('further than its radius and it is simply gone', sliceRadius(2, 3, 0, D), 0);
  eq('and stays gone', sliceRadius(1, 0, 3, D), 0);

  // w wraps, so an orb near the seam has to swell for slices at both ends.
  ok('an orb near the seam is seen from both ends',
     close(sliceRadius(2, 0.5, 5.5, D), sliceRadius(2, 0.5, 1.5, D)));
  ok('and its size is symmetric about its centre',
     close(sliceRadius(2.5, 1, 0, D), sliceRadius(2.5, 1, 2, D)));

  // Smooth, so an orb grows rather than pops.
  //
  // Measured away from the ends, because the circle has a genuinely vertical
  // tangent where it meets zero -- dr/dw is unbounded as the slice reaches the
  // ball's edge. That is the shape being correct, not a defect: an orb really
  // does arrive quickly and then settle. Half the radius is where the curve has
  // flattened enough for "smooth" to mean anything.
  let biggest = 0, prev = sliceRadius(2, 3, 0, D);
  for (let w = 0.01; w <= D; w += 0.01) {
    const v = sliceRadius(2, 3, w, D);
    if (v > 1 && prev > 1) biggest = Math.max(biggest, Math.abs(v - prev));
    prev = v;
  }
  ok('it swells smoothly once it is well in view', biggest < 0.02,
     `largest step ${biggest.toFixed(4)}`);

  // And the arrival really is abrupt, which is the point -- a 4D ball entering
  // the slice is not a light being turned up.
  ok('but arrives abruptly, as a sphere entering a slice does',
     sliceRadius(2, 3, 1.02, D) - sliceRadius(2, 3, 1.0, D) > 0.02,
     'the tangent at the edge is vertical');

  // Never imaginary, never negative, whatever it is asked.
  let sane = true;
  for (let i = 0; i < 500; i++) {
    const r = sliceRadius(1 + (i % 7) * 0.4, (i * 0.37) % D, (i * 0.61) % D, D);
    if (!(r >= 0) || Number.isNaN(r)) sane = false;
  }
  ok('and is never negative or NaN', sane);

  // A big orb is present for more of the loop than a small one, which is what
  // makes a spread of sizes worth having: some are almost always around, others
  // are a brief event.
  const seen = (R) => {
    let n = 0;
    for (let w = 0; w < D; w += 0.02) if (sliceRadius(R, 3, w, D) > 0) n++;
    return n;
  };
  ok('a larger orb is present for longer', seen(2.6) > seen(1.5));
  ok('and a small one is only briefly there', seen(1.5) < seen(2.6));
}

console.log('\nthe top surface is one grid, reshaped');
{
  // The grid is built once and its vertices are moved when the shape changes,
  // so the layout has to be right for EVERY shape from a single index. These
  // check the things that go wrong silently: a winding error draws a black
  // table, an index off the end draws garbage, and a rim that misses the
  // inradius leaves the frames hanging off the edge.
  const rings = MARBLE_RINGS;
  const S = topSegments(rings);
  const count = topVertexCount(rings, S);
  ok('segments come in fours, at least ninety-six', S % 4 === 0 && S >= 96);

  const idx = topIndex(rings, S);
  // One triangle per column on the degenerate centre ring, two everywhere else.
  eq('the index has a triangle for every quad, and one for each centre wedge',
     idx.length, 3 * S * (2 * rings - 1));
  ok('and never points past the last vertex',
     idx.every((i) => i >= 0 && i < count && Number.isInteger(i)));

  const radius = 30;
  const pos = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const at = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
  const upward = (n) => {
    const R = radius / Math.cos(Math.PI / n);
    fillTop(pos, uv, n, R, rings, S, UV_SCALE / radius);
    // Every non-degenerate triangle faces up, seen from above: the cross
    // product of two edges has positive y.
    let lowest = Infinity, flat = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [at(idx[t]), at(idx[t + 1]), at(idx[t + 2])];
      const ux = b[0] - a[0], uz = b[2] - a[2];
      const vx = c[0] - a[0], vz = c[2] - a[2];
      const ny = uz * vx - ux * vz;
      if (Math.abs(ny) < 1e-9) { flat++; continue; }
      lowest = Math.min(lowest, ny);
    }
    return { lowest, flat };
  };
  for (const n of [3, 4.5, 6, 64]) {
    const { lowest, flat } = upward(n);
    ok(`every triangle faces up at ${n} sides`, lowest > 0, `lowest normal ${lowest}`);
    ok(`and none but the centre wedges are degenerate at ${n} sides`, flat === 0,
       `${flat} flat`);
  }

  // The rim lands where the shape says. A column that points at the middle of
  // an edge sits at the INRADIUS whatever the shape, which is what keeps the
  // frames on the table all the way round the loop; a column that points at a
  // corner sits at the circumradius, which is what fillTop reports as the
  // reach so the bounding sphere can be set without a second pass.
  for (const n of [3, 6]) {
    const R = radius / Math.cos(Math.PI / n);
    const reach = fillTop(pos, uv, n, R, rings, S, UV_SCALE / radius);
    const rim = rings * S;
    const corner = at(rim), mid = at(rim + S / (2 * n));
    ok(`a corner column reaches the circumradius at ${n} sides`,
       close(Math.hypot(corner[0], corner[2]), R, 1e-4));
    ok(`an edge column sits at the inradius at ${n} sides`,
       close(Math.hypot(mid[0], mid[2]), radius, 1e-4));
    ok(`and the reported reach is the corner at ${n} sides`, close(reach, R, 1e-9));
    const centre = at(0);
    ok(`the centre ring stays at the origin at ${n} sides`,
       centre[0] === 0 && centre[2] === 0);
  }

  // The UVs are planar in table-radius units, so a point at the rim's edge
  // midpoint is UV_SCALE from the middle whatever the table's actual size.
  {
    const R = radius / Math.cos(Math.PI / 6);
    fillTop(pos, uv, 6, R, rings, S, UV_SCALE / radius);
    const k = rings * S + S / 12;
    ok('UVs are in table-radius units',
       close(Math.hypot(uv[k * 2], uv[k * 2 + 1]), UV_SCALE, 1e-4));
  }

  // The rebuild threshold. It has to match the old hundredth of a side at the
  // triangle, where the shape is most sensitive, and it has to stop the table
  // rebuilding through the circular quarter of the loop, where it is not.
  ok('a hundredth of a side still rebuilds at the triangle',
     Math.abs(1 / 3 - 1 / 3.011) >= OUTLINE_STEP);
  ok('but a 60-gon is the same table as a 64-gon',
     Math.abs(1 / 60 - 1 / 64) < OUTLINE_STEP);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
