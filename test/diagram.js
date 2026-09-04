// Tests for the minimap's knot diagram, using shapes whose crossings can be
// worked out by hand. Reading them off a 240x160 picture is not a reliable
// check; these are.
//
// Each case states, in its own coordinates, exactly which strand should pass in
// front at each crossing, so a wrong picture fails with a specific complaint
// rather than "looks off".

import { diagram } from '../src/minimap.js';
import { LEVELS } from '../src/levels.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// Look straight down -y so x,z map to the page and y is depth. Then a point's
// y coordinate IS how near it is, which makes the expected answers obvious.
const TOP = { yaw: 0, tilt: Math.PI / 2, smooth: false };

console.log('\nthe simplest crossing');
{
  // One strand along x at height y=0, another along z at height y=5, meeting
  // over the origin. The second is higher, so it must pass in front.
  const path = [
    [-5, 0, 0], [5, 0, 0],          // low, running in x
    [5, 5, -5],                     // lift and come back
    [0, 5, -5], [0, 5, 5],          // high, running in z across the first
  ];
  const d = diagram(path, TOP);
  eq('one crossing found', d.crossings.length, 1);
  const c = d.crossings[0];
  ok('the higher strand passes in front', c.overIsLater === true,
     JSON.stringify(c));
}

console.log('\nthe same crossing, flipped');
{
  // Identical, but the crossing strand is now BELOW: it must pass behind.
  const path = [
    [-5, 0, 0], [5, 0, 0],
    [5, -5, -5],
    [0, -5, -5], [0, -5, 5],
  ];
  const d = diagram(path, TOP);
  eq('one crossing found', d.crossings.length, 1);
  ok('the lower strand passes behind', d.crossings[0].overIsLater === false,
     JSON.stringify(d.crossings[0]));
}

console.log('\na strand with no crossings');
{
  const path = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0]];
  const d = diagram(path, TOP);
  eq('a straight run crosses nothing', d.crossings.length, 0);
  eq('and is drawn as a single arc', d.arcs.length, 1);
}

console.log('\ndrawing order matches the depths');
{
  // Every crossing must have its front strand drawn after its back strand,
  // whatever else the ordering does.
  const path = [
    [-6, 0, 0], [6, 0, 0], [6, 4, -6], [0, 4, -6], [0, 4, 6],
    [-3, 4, 6], [-3, -4, 0], [3, -4, 0], [3, -4, -3], [-6, -4, -3],
  ];
  const d = diagram(path, TOP);
  ok('some crossings exist to check', d.crossings.length > 0,
     `${d.crossings.length}`);
  const wrong = d.crossings.filter((c) => c.overRank <= c.underRank);
  eq('every crossing is drawn front-strand-last', wrong.length, 0);
}

console.log('\nthe over-strand stays whole');
{
  // The whole point of the halo is that at a crossing ONE strand is unbroken
  // and the other is interrupted. If both are cut, the picture is just a pile
  // of disconnected pieces and no crossing can be read.
  const tre = [];
  for (let k = 0; k < 90; k++) {
    const t = 2 * Math.PI * k / 90;
    tre.push([Math.sin(t) + 2 * Math.sin(2 * t),
              Math.cos(t) - 2 * Math.cos(2 * t),
              -Math.sin(3 * t)]);
  }
  tre.push(tre[0]);
  const d = diagram(tre, { yaw: 0.3 });
  // A cut lands at an arc boundary. The over side of a crossing must NOT be
  // one: the strand passing in front runs straight through.
  const bounds = new Set();
  for (const a of d.arcs) { bounds.add(a.from); bounds.add(a.to); }
  const NEAR = 2;   // a cut within a sample or two of the crossing point
  const cutAtOver = d.crossings.filter((c) =>
    [...bounds].some((b) => Math.abs(b - c.over) <= NEAR));
  const cutAtUnder = d.crossings.filter((c) =>
    [...bounds].some((b) => Math.abs(b - c.under) <= NEAR));
  eq('the under-strand is cut at every crossing', cutAtUnder.length, d.crossings.length);
  eq('the over-strand is cut at none of them', cutAtOver.length, 0);
}

console.log('\na real trefoil, where the answer is known');
{
  // A smooth parametric trefoil. Whatever angle it is seen from, a correct
  // diagram shows exactly three crossings and the strand alternates over,
  // under, over -- that is what makes it an alternating knot.
  const tre = [];
  for (let k = 0; k < 90; k++) {
    const t = 2 * Math.PI * k / 90;
    tre.push([Math.sin(t) + 2 * Math.sin(2 * t),
              Math.cos(t) - 2 * Math.cos(2 * t),
              -Math.sin(3 * t)]);
  }
  tre.push(tre[0]);
  for (const yaw of [0, 0.3, 0.7, -0.5]) {
    const d = diagram(tre, { yaw });
    eq(`trefoil at yaw ${yaw}: three crossings`, d.crossings.length, 3);
    const ev = [];
    for (const c of d.crossings) {
      ev.push({ at: c.over, over: true });
      ev.push({ at: c.under, over: false });
    }
    ev.sort((a, b) => a.at - b.at);
    const seq = ev.map((e) => (e.over ? 'O' : 'U')).join('');
    ok(`trefoil at yaw ${yaw}: alternates (${seq})`,
       seq === 'UOUOUO' || seq === 'OUOUOU', seq);
    const wrong = d.crossings.filter((c) => c.overRank <= c.underRank);
    eq(`trefoil at yaw ${yaw}: drawn front-last`, wrong.length, 0);
  }
}

console.log('\nno severed front strands, no stray breaks');
{
  // Two checks that only show up in bulk, and that reading the picture is bad
  // at: the strand passing in front must never end at an arc boundary, and
  // every boundary must be a crossing or a deliberate seam.
  const TILT = 0.34, FACING = 0.35, ROCK = 0.42;
  const shapes = [];
  const tre = [];
  for (let k = 0; k < 90; k++) {
    const t = 2 * Math.PI * k / 90;
    tre.push([Math.sin(t) + 2 * Math.sin(2 * t),
              Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)]);
  }
  tre.push(tre[0]);
  shapes.push(tre);
  for (const L of LEVELS) shapes.push(L.path.map((p) => p.slice(0, 3)));

  let total = 0, severed = 0, stray = 0;
  for (const shape of shapes) {
    for (let s = 0; s <= 20; s++) {
      const yaw = FACING - ROCK + 2 * ROCK * s / 20;
      const d = diagram(shape, { yaw, tilt: TILT });
      total += d.crossings.length;
      const owner = (i) => d.arcs.findIndex((a) => i >= a.from && i <= a.to);
      for (const c of d.crossings) {
        const a = d.arcs[owner(c.over)];
        if (!a || c.over <= a.from + 1 || c.over >= a.to - 1) severed++;
      }
      const under = new Set(d.crossings.map((c) => c.under));
      for (let i = 1; i < d.arcs.length; i++) {
        const b = d.arcs[i].from;
        if (![...under].some((u) => Math.abs(u - b) <= 2) && !d.arcs[i].seamStart) stray++;
      }
    }
  }
  ok(`${total} crossings checked`, total > 200, `${total}`);
  eq('no front strand is severed at a crossing', severed, 0);
  eq('no arc boundary is unexplained', stray, 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
