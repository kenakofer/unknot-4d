// Renderer test. diagramFrom() decides the topology; this checks what actually
// gets painted, which is where the 4D links went wrong: they were computed
// correctly enough and then either overpainted as rope or never drawn.
//
// Uses a tiny stub DOM rather than a real one -- the project has no
// dependencies, and all that is needed is to record the elements created.
import { Minimap } from '../src/minimap.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// --- the smallest DOM that render() needs ---------------------------------
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  get firstChild() { return this.children[0] || null; }
}
globalThis.document = {
  createElementNS: (_ns, tag) => new El(tag),
};

// Points on a path 'd' string, as [x, y] pairs.
const pointsOf = (d) =>
  d.slice(1).split('L').map((p) => p.split(',').map(Number));

const LINK_COLOUR = '#9aa6b8';

console.log('\nthe renderer never paints rope over a 4D link');
{
  // Straight rope, with a marked stretch in the middle standing in for a step
  // between w-slices. Geometry is deliberately simple: what is being checked is
  // which strokes cover which samples, not the shape.
  const n = 40;
  const flat = [], raw = [];
  for (let i = 0; i < n; i++) {
    flat.push([10 + i * 5, 80]);
    raw.push([10 + i * 5, 80, 0]);
  }

  const mm = Object.create(Minimap.prototype);
  mm.svg = new El('svg');
  mm.sel = -1;
  // Mark samples 15..24 as the link.
  mm.linkMask = (nPoints, count) => {
    const out = new Array(count).fill(false);
    for (let i = 0; i < count; i++) {
      const k = Math.floor((i / Math.max(1, count - 1)) * (nPoints - 1));
      out[i] = k >= 15 && k <= 24;
    }
    return out;
  };

  mm.render(flat, raw, true);

  const kids = mm.svg.children;
  ok('something was drawn', kids.length > 0, `${kids.length}`);

  const rope = kids.filter((k) =>
    k.tag === 'path' && k.attrs.stroke && k.attrs.stroke.startsWith('rgb('));
  const links = kids.filter((k) =>
    k.tag === 'path' && k.attrs.stroke === LINK_COLOUR);

  ok('rope was drawn', rope.length > 0, `${rope.length}`);
  ok('the link was drawn', links.length > 0, `${links.length}`);

  // The x range the link occupies, taken from what was actually drawn faint.
  let lLo = Infinity, lHi = -Infinity;
  for (const l of links) {
    for (const [x] of pointsOf(l.attrs.d)) {
      lLo = Math.min(lLo, x); lHi = Math.max(lHi, x);
    }
  }
  ok('the faint stroke spans a real stretch', lHi - lLo > 5, `${lLo}..${lHi}`);

  // The heart of it: no rope stroke may sit strictly inside the link's span.
  // Endpoints are allowed to touch, so the two meet without a gap.
  const inset = 2;
  let intruding = 0;
  for (const r of rope) {
    for (const [x] of pointsOf(r.attrs.d)) {
      if (x > lLo + inset && x < lHi - inset) intruding++;
    }
  }
  eq('no rope sample lies inside the link span', intruding, 0);

  // And the rope must still be drawn on BOTH sides -- clipping it away
  // entirely would also pass the check above.
  let before = 0, after = 0;
  for (const r of rope) {
    for (const [x] of pointsOf(r.attrs.d)) {
      if (x < lLo) before++;
      if (x > lHi) after++;
    }
  }
  ok('rope is drawn before the link', before > 0, `${before}`);
  ok('rope is drawn after the link', after > 0, `${after}`);

  // The link goes on last, so it cannot be buried by a later rope stroke.
  const lastRope = kids.map((k, i) => [k, i]).filter(([k]) => rope.includes(k))
    .map(([, i]) => i).pop();
  const firstLink = kids.map((k, i) => [k, i]).filter(([k]) => links.includes(k))
    .map(([, i]) => i)[0];
  ok('links are drawn after all rope', firstLink > lastRope,
     `link@${firstLink} rope@${lastRope}`);

  // It must look like a link, not like rope.
  for (const l of links) {
    ok('the link is faint', l.attrs['stroke-opacity'] === '0.45',
       l.attrs['stroke-opacity']);
    ok('the link is thinner than rope',
       Number(l.attrs['stroke-width']) < 2.9, l.attrs['stroke-width']);
  }
}

console.log('\na rope with no links is drawn unbroken');
{
  const n = 30;
  const flat = [], raw = [];
  for (let i = 0; i < n; i++) {
    flat.push([10 + i * 6, 80]);
    raw.push([10 + i * 6, 80, 0]);
  }
  const mm = Object.create(Minimap.prototype);
  mm.svg = new El('svg');
  mm.sel = -1;
  mm.linkMask = (_n, count) => new Array(count).fill(false);
  mm.render(flat, raw, true);

  const links = mm.svg.children.filter((k) => k.attrs.stroke === LINK_COLOUR);
  eq('nothing is drawn as a link', links.length, 0);

  const rope = mm.svg.children.filter((k) =>
    k.tag === 'path' && k.attrs.stroke && k.attrs.stroke.startsWith('rgb('));
  ok('the rope is still drawn', rope.length > 0, `${rope.length}`);

  // Every sample is covered by some rope stroke: no accidental gaps.
  const covered = new Set();
  for (const r of rope) for (const [x] of pointsOf(r.attrs.d)) covered.add(x);
  let gaps = 0;
  for (const [x] of flat) if (!covered.has(x)) gaps++;
  eq('no sample is left unpainted', gaps, 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
