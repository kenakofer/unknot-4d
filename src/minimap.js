// A small SVG view of the whole puzzle, drawn beside the main scene.
//
// A note on reading the diagram: the rope is an OPEN arc with both ends pinned
// to the walls, not a closed loop. Walking the strand, the over/under sequence
// does not alternate, which looks wrong for a trefoil -- an alternating knot.
// It is not: the two tails running out to the box faces cross the knotted
// bundle, and those crossings belong to the tails, not the knot. Ignore them and
// the core reads U O U O U O across exactly three crossings, as a trefoil
// should.
//
// It rocks gently rather than orbiting: a full spin would keep swapping which
// way is left and which is right, and the point of this panel is to stay
// readable while the parallax does the work of separating strands that overlap
// in any single still view.
//
// The colour ramp comes from knot.js so this panel and the main view always
// agree on which end is green -- two copies of that rule would drift apart.
import { rampForward } from './knot.js';
//
// Drawn as SVG rather than a second WebGL canvas so the strokes stay crisp at
// this size and the whole thing costs almost nothing to redraw.

const NS = 'http://www.w3.org/2000/svg';

// Matches the panel background, so a nearer strand appears to cut a clean gap
// in the one behind rather than laying a dark line over it.
const HALO = '#161c26';

// How far the view rocks, and how long a full there-and-back takes.
const ROCK = 0.42;          // radians of yaw either side of centre
const PERIOD = 9000;        // ms for a full yaw swing
const TILT = 0.34;          // the eye level the vertical drift moves around
// A slower nod on top of the side-to-side swing. The two periods are chosen not
// to divide into each other, so the view never repeats exactly and a strand
// that happens to be hidden at one moment comes clear a little later.
const NOD = 0.16;           // radians of tilt either side of TILT
const NOD_PERIOD = 14300;   // ms, deliberately not a multiple of PERIOD
// The rock is centred here rather than at zero. Looking straight down an axis
// of the lattice lines the rope up with the viewing direction, so depth ends up
// tracking how far along the strand a point is and every crossing reads the
// same way -- the diagram becomes a ramp instead of a knot. A quarter turn off
// axis breaks that alignment.
const FACING = 0.35;

export class Minimap {
  constructor(svg) {
    this.svg = svg;
    this.t0 = performance.now();
    this.paused = false;
    // Filled in by draw(): the puzzle state to render.
    this.path = [];
    this.dims = [8, 8, 8];
    this.sel = -1;
    this.sliceOf = () => 0;      // maps a point to its w-slice
    this.sliceOffset = () => [0, 0, 0];
    this.crossesSlice = () => false;
    // Bumped by the app whenever the rope changes, so the fitted scale is
    // recomputed then and only then.
    this.stamp = 0;
  }

  // The extent of the shape across the whole rocking cycle, so the scale can be
  // fixed instead of changing every frame. Recomputed only when the rope does.
  fitBox(path) {
    const key = path.length + ':' + JSON.stringify(path[0]) +
                JSON.stringify(path[path.length - 1]) + ':' + this.stamp;
    if (this._fit && this._fitKey === key) return this._fit;
    // Centre on the union of all angles, so the shape turns about a fixed
    // point rather than sliding across the panel...
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    // ...but size to the WIDEST SINGLE frame, not to that union. The union is
    // much larger than the shape ever looks at one instant, and fitting to it
    // leaves the drawing small and marooned in the middle of the panel.
    let fw = 0, fh = 0;
    const STEPS = 16;
    for (let i = 0; i < STEPS; i++) {
      const a = FACING + Math.sin((i / STEPS) * Math.PI * 2) * ROCK;
      for (let j = 0; j < 3; j++) {
        const tl = TILT + (j - 1) * NOD;
        let flo = [Infinity, Infinity], fhi = [-Infinity, -Infinity];
        for (const p of path) {
          const q = this.project(p, a, tl);
          for (let d = 0; d < 2; d++) {
            if (q[d] < lo[d]) lo[d] = q[d];
            if (q[d] > hi[d]) hi[d] = q[d];
            if (q[d] < flo[d]) flo[d] = q[d];
            if (q[d] > fhi[d]) fhi[d] = q[d];
          }
        }
        fw = Math.max(fw, fhi[0] - flo[0]);
        fh = Math.max(fh, fhi[1] - flo[1]);
      }
    }
    this._fitKey = key;
    this._fit = { cx: (lo[0] + hi[0]) / 2, cy: (lo[1] + hi[1]) / 2,
                  w: fw, h: fh };
    return this._fit;
  }

  // Which samples of the smoothed curve belong to a step between w-slices.
  linkMask(nPoints, count) {
    const out = new Array(count).fill(false);
    for (let i = 0; i < count; i++) {
      const k = Math.floor((i / Math.max(1, count - 1)) * (nPoints - 1));
      out[i] = this.crossesSlice(k);
    }
    return out;
  }

  // Project a lattice point to panel coordinates at the current rock angle.
  project(p, ang, tilt = TILT) {
    const off = this.sliceOffset(this.sliceOf(p));
    const x = p[0] + off[0];
    const y = p[1] + off[1];
    const z = p[2] + off[2];
    // Yaw about the vertical axis, then a fixed tilt. Orthographic: no
    // perspective divide, so nothing balloons as it swings toward the viewer.
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = x * ca - z * sa;
    const rz = x * sa + z * ca;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    // Third component is depth: larger means nearer the viewer.
    return [rx, y * ct - rz * st, rz * ct + y * st];
  }

  draw(now) {
    const svg = this.svg;
    if (!svg || !this.path.length) return;
    const path = relax(this.path, this.keep ? this.keep() : []);
    const t = now - this.t0;
    const ang = this.paused ? FACING
      : FACING + Math.sin((t / PERIOD) * Math.PI * 2) * ROCK;
    const tilt = this.paused ? TILT
      : TILT + Math.sin((t / NOD_PERIOD) * Math.PI * 2) * NOD;

    const pts = path.map((p) => this.project(p, ang, tilt));

    // Scale is fixed for the whole cycle -- picked so the widest single frame
    // just fits -- while the centre follows the current frame. A fixed scale
    // stops the drawing breathing in and out as the view swings; recentring
    // stops it sliding off to one side, which is what a fixed centre does once
    // the shape starts turning about a point that is not its own middle.
    const box = this.fitBox(path);
    // Draw in the viewBox's own units, not the element's CSS size. On a narrow
    // screen the SVG is styled smaller (120x80) while the viewBox stays
    // 240x160, so using clientWidth put every coordinate at half scale in the
    // top-left quadrant -- the drawing looked off-centre and shrunken on a
    // phone while being perfect on a desktop, where the two happen to match.
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const w = (vb && vb.width) || svg.clientWidth || 200;
    const h = (vb && vb.height) || svg.clientHeight || 120;
    // Enough margin for the halo, which is 8px wide, plus the end dots.
    const pad = 11;
    const sx = box.w > 1e-6 ? (w - pad * 2) / box.w : 1;
    const sy = box.h > 1e-6 ? (h - pad * 2) / box.h : 1;
    // One scale for both axes, so the shape is never stretched.
    const s = Math.min(sx, sy);
    let flo = [Infinity, Infinity], fhi = [-Infinity, -Infinity];
    for (const q of pts) {
      for (let d = 0; d < 2; d++) {
        if (q[d] < flo[d]) flo[d] = q[d];
        if (q[d] > fhi[d]) fhi[d] = q[d];
      }
    }
    const cx = (flo[0] + fhi[0]) / 2, cy = (flo[1] + fhi[1]) / 2;
    const map = (q) => [w / 2 + (q[0] - cx) * s, h / 2 - (q[1] - cy) * s];

    // The colour ramp is anchored to the pinned ends, not to array order, so
    // it does not flip when the player walks backwards and the path reverses.
    // Same rule as the main view, so the two panels always agree.
    // flat carries panel x/y; pts still carries depth for sorting.
    this.render(pts.map(map), pts, rampForward(this.path));
  }

  // Draw the rope in short pieces, furthest first, each with a wide dark
  // stroke under a narrower bright one. Where the rope crosses itself the
  // nearer piece's dark halo cuts the one behind, which is exactly how a knot
  // diagram shows which strand passes over.
  render(flat, raw, forward = true) {
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const n = flat.length;
    if (n < 2) return;

    const curveInput = smoothPoints(flat, 10);
    const depthInput = sampleDepths(raw, curveInput.length);
    const linkAt = this.linkMask(n, curveInput.length);

    // Same computation the tests check: where the curve crosses itself, which
    // side is in front, and what order to draw the arcs in.
    const dg = diagramFrom(curveInput, depthInput, linkAt);

    // Draw the rope as ONE continuous line, then punch a hole at each place it
    // passes behind itself.
    //
    // Splitting the curve into arcs and drawing them separately was the source
    // of the dark stripes: every boundary between two arcs leaves a rounded cap
    // with background showing beside it, whether or not anything crosses there.
    // Painting one unbroken line and adding a short halo stub only where a
    // strand genuinely passes in front means the only breaks are real ones.
    const pts = dg.curve;

    // A sample belongs to a link if the step into or out of it crosses slices.
    // Rope must not be painted over those samples at all -- not by the base
    // pass and not by the over-strand pass at a crossing -- or the link shows
    // up as solid rope. The links go on last, over everything.
    const link = new Array(pts.length).fill(false);
    for (const [a, b] of (dg.links || [])) {
      for (let i = Math.max(0, a - 1); i <= Math.min(pts.length - 1, b); i++) {
        link[i] = true;
      }
    }
    // Draw only maximal runs of ordinary rope, so a link is a genuine gap.
    const ropeRuns = [];
    for (let i = 0; i < pts.length; ) {
      if (link[i]) { i++; continue; }
      let j = i;
      while (j + 1 < pts.length && !link[j + 1]) j++;
      if (j > i) ropeRuns.push([i, j]);
      i = j + 1;
    }
    // Clip a span to the rope runs, so nothing paints across a link.
    const solidParts = (lo, hi) => {
      const out = [];
      for (const [a, b] of ropeRuns) {
        const s0 = Math.max(lo, a), s1 = Math.min(hi, b);
        if (s1 > s0) out.push([s0, s1]);
      }
      return out;
    };

    // The rope itself, unbroken except where links interrupt it.
    // Drawn in a handful of overlapping runs so the colour can follow position
    // along the strand. They overlap by a sample, so no cap ever shows.
    const RUNS = 24;
    for (let r = 0; r < RUNS; r++) {
      const lo = Math.floor((r / RUNS) * (pts.length - 1));
      const hi = Math.min(pts.length - 1,
        Math.ceil(((r + 1) / RUNS) * (pts.length - 1)) + 1);
      for (const [a, b] of solidParts(lo, hi)) {
        const seg = document.createElementNS(NS, 'path');
        seg.setAttribute('d', polyPath(pts.slice(a, b + 1)));
        seg.setAttribute('fill', 'none');
        seg.setAttribute('stroke',
          ropeColour(lo / Math.max(1, pts.length - 1), forward));
        seg.setAttribute('stroke-width', '2.9');
        seg.setAttribute('stroke-linecap', 'round');
        seg.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(seg);
      }
    }

    // Then, for every crossing, a halo stub over the strand that goes behind,
    // followed by a stub of the strand in front redrawn on top.
    const CUT = 7;    // samples of under-strand to hide either side
    for (const c of dg.crossings) {
      const lo = Math.max(0, c.under - CUT);
      const hi = Math.min(pts.length - 1, c.under + CUT);
      const gap = document.createElementNS(NS, 'path');
      gap.setAttribute('d', polyPath(pts.slice(lo, hi + 1)));
      gap.setAttribute('fill', 'none');
      gap.setAttribute('stroke', HALO);
      gap.setAttribute('stroke-width', '8');
      gap.setAttribute('stroke-linecap', 'butt');
      svg.appendChild(gap);

      const oLo = Math.max(0, c.over - CUT - 3);
      const oHi = Math.min(pts.length - 1, c.over + CUT + 3);
      for (const [a, b] of solidParts(oLo, oHi)) {
        const front = document.createElementNS(NS, 'path');
        front.setAttribute('d', polyPath(pts.slice(a, b + 1)));
        front.setAttribute('fill', 'none');
        front.setAttribute('stroke',
          ropeColour(c.over / Math.max(1, pts.length - 1), forward));
        front.setAttribute('stroke-width', '2.9');
        front.setAttribute('stroke-linecap', 'round');
        svg.appendChild(front);
      }
    }

    // The 4D links, last and over everything. They take no part in the depth
    // logic above -- a step between slices is the same strand continuing, not a
    // length of rope in the scene, so it can be neither in front of nor behind
    // anything. Drawn straight from the link spans rather than from arcs, which
    // is what used to drop them when an arc boundary fell mid-link.
    for (const [a, b] of ropeGaps(pts.length, ropeRuns)) {
      const l = document.createElementNS(NS, 'path');
      l.setAttribute('d', polyPath(pts.slice(a, b + 1)));
      l.setAttribute('fill', 'none');
      l.setAttribute('stroke', '#9aa6b8');
      l.setAttribute('stroke-width', '1.4');
      l.setAttribute('stroke-opacity', '0.45');
      l.setAttribute('stroke-linecap', 'round');
      svg.appendChild(l);
    }

    // The two pinned ends.
    for (const i of [0, n - 1]) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', flat[i][0]);
      c.setAttribute('cy', flat[i][1]);
      c.setAttribute('r', '3');
      c.setAttribute('fill', '#ffd166');
      svg.appendChild(c);
    }

    // The selection.
    if (this.sel >= 0 && this.sel < n) {
      const [x, y] = flat[this.sel];
      const halo = document.createElementNS(NS, 'circle');
      halo.setAttribute('cx', x); halo.setAttribute('cy', y);
      halo.setAttribute('r', '6');
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', '#ff5d8f');
      halo.setAttribute('stroke-width', '1.5');
      halo.setAttribute('opacity', '0.8');
      svg.appendChild(halo);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      dot.setAttribute('r', '2.6');
      dot.setAttribute('fill', '#ff5d8f');
      svg.appendChild(dot);
    }
  }
}

// The same green-to-purple ramp the rope uses in the main view. `forward` is
// false when the stored path runs from the purple end to the green one, in
// which case the ramp is read backwards so the colours stay put on the rope.
function ropeColour(t, forward = true) {
  const a = [0x37, 0xd6, 0xa0], b = [0xa0, 0x6b, 0xff];
  const u = forward ? t : 1 - t;
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// The spans a link occupies: everything the rope runs do not cover, widened by
// one sample at each end so the faint line meets the rope it joins.
function ropeGaps(n, runs) {
  const out = [];
  let at = 0;
  for (const [a, b] of runs) {
    if (a > at) out.push([Math.max(0, at - 1), Math.min(n - 1, a + 1)]);
    at = b + 1;
  }
  if (at < n) out.push([Math.max(0, at - 1), n - 1]);
  return out.filter(([a, b]) => b > a);
}

function polyPath(pts) {
  return 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L');
}

// Sample a Catmull-Rom curve through the points. The lattice path is all right
// angles; rounding it off makes the shape much easier to follow at this size,
// and this panel is a guide rather than a second playfield.
function smoothPoints(pts, per) {
  if (pts.length < 2) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (
        2 * p1[d] +
        (-p0[d] + p2[d]) * t +
        (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
        (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice(0, 2));
  return out;
}

// Pull the lattice path toward the line it is approximating.
//
// A run of right-angle steps climbing diagonally is a staircase standing in for
// a straight line, and drawing the steps at this size just makes noise. Each
// interior point is repeatedly moved toward the midpoint of its neighbours,
// which flattens a staircase into the diagonal it approximates while leaving a
// genuine corner -- where the neighbours really do sit at right angles over a
// long span -- still bent.
//
// The two pinned ends never move, and neither does anything in `pinned`, so the
// shape stays anchored to what the player sees in the main view.
function relax(path, pinned) {
  const D = path[0].length;
  const lock = new Set(pinned);
  lock.add(0);
  lock.add(path.length - 1);
  let cur = path.map((p) => p.slice());
  const ROUNDS = 14, PULL = 0.5;
  for (let r = 0; r < ROUNDS; r++) {
    const next = cur.map((p) => p.slice());
    for (let i = 1; i < cur.length - 1; i++) {
      if (lock.has(i)) continue;
      for (let d = 0; d < D; d++) {
        const mid = (cur[i - 1][d] + cur[i + 1][d]) / 2;
        next[i][d] = cur[i][d] + (mid - cur[i][d]) * PULL;
      }
    }
    cur = next;
  }
  return cur;
}

// Where two segments cross, as parameters along each. Returns null when they
// merely touch or run parallel, so a curve joining end to end is not treated as
// crossing itself.
function segIntersect(p1, p2, p3, p4) {
  const rx = p2[0] - p1[0], ry = p2[1] - p1[1];
  const sx = p4[0] - p3[0], sy = p4[1] - p3[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qpx = p3[0] - p1[0], qpy = p3[1] - p1[1];
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  const e = 1e-6;
  if (t <= e || t >= 1 - e || u <= e || u >= 1 - e) return null;
  return { t, u };
}

// Depth for every sample of the smoothed curve, interpolated from the lattice
// points it was built from.
function sampleDepths(raw, count) {
  const out = new Array(count);
  const n = raw.length;
  for (let i = 0; i < count; i++) {
    const f = (i / Math.max(1, count - 1)) * (n - 1);
    const a = Math.min(n - 1, Math.floor(f));
    const b = Math.min(n - 1, a + 1);
    out[i] = raw[a][2] + (raw[b][2] - raw[a][2]) * (f - a);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The diagram, as data.
//
// Everything that decides what the picture MEANS -- where the curve crosses
// itself, which side is in front, and the order the arcs are drawn in -- with
// no SVG involved, so it can be checked against shapes whose answers are known.
// ---------------------------------------------------------------------------

// The crossings, arcs and draw order for an already-projected curve.
export function diagramFrom(curve, depth, linkAt) {
  const crossings = [];
  const cuts = new Set();
  const overs = [];
  // Cuts that were slid away from a crossing. Nothing passes in front at these,
  // so they must be drawn as seams or they show up as a dark bar mid-strand.
  const shifted = new Set();
  // A step between w-slices is not a length of rope lying in the scene, so it
  // has no business in the over/under logic: it cannot pass in front of or
  // behind anything. Leaving it in produced two visible faults -- a link that
  // won a crossing got redrawn as solid rope by the over-strand pass, and a
  // link swallowed into an arc whose midpoint was ordinary rope lost its flag
  // and vanished. Skip link segments here and draw them separately, on top.
  const isLink = (i) => !!(linkAt && (linkAt[i] || linkAt[i + 1]));
  for (let a = 0; a + 1 < curve.length; a++) {
    if (isLink(a)) continue;
    for (let b = a + 2; b + 1 < curve.length; b++) {
      if (isLink(b)) continue;
      const hit = segIntersect(curve[a], curve[a + 1], curve[b], curve[b + 1]);
      if (!hit) continue;
      const da = depth[a] + (depth[a + 1] - depth[a]) * hit.t;
      const db = depth[b] + (depth[b + 1] - depth[b]) * hit.u;
      if (Math.abs(da - db) < 1e-9) continue;
      const under = da < db ? a : b;
      const over = da < db ? b : a;
      crossings.push({ over, under, overIsLater: over > under, da, db });
      // Only the strand that dives behind is cut. The one in front runs
      // straight through -- that unbroken strand IS how a crossing is read.
      cuts.add(under);
      overs.push(over);
    }
  }

  // Where two crossings sit almost on top of each other, one's under-cut can
  // land on the other's over-point and sever the strand that ought to pass in
  // front. Slide such a cut clear of the over-point instead of dropping it --
  // the arc still gets split, so the ordering still works, but the break lands
  // where nothing is passing in front.
  const clear = 3;
  for (const o of overs) {
    for (const c of [...cuts]) {
      if (Math.abs(c - o) > clear) continue;
      cuts.delete(c);
      const moved = c < o ? o - clear - 1 : o + clear + 1;
      if (moved > 0 && moved < curve.length - 1) { cuts.add(moved); shifted.add(moved); }
    }
  }

  const arcs = [];
  let head = 0;
  for (let i = 1; i < curve.length; i++) {
    if (cuts.has(i) || i === curve.length - 1) {
      const m = Math.floor((head + i) / 2);
      arcs.push({ from: head, to: i, depth: depth[m],
                  link: linkAt ? linkAt[m] : false,
                  seamStart: shifted.has(head), seamEnd: shifted.has(i) });
      head = i;
    }
  }
  // An arc that is in front at one crossing and behind at another cannot be
  // ordered against both. Split it at a quiet point in between: the strand
  // stays visually continuous either side of every crossing, and the two halves
  // can then be ordered independently.
  splitMixed(arcs, crossings, curve.length);
  splitCycles(arcs, crossings, curve.length);

  // Fold away slivers. A split that leaves an arc a few samples long draws as a
  // stub with a rounded cap at each end, and the background showing between one
  // stub and the next is exactly the dark stripe that has no business being
  // there. Anything shorter than the halo is too small to read as a strand.
  mergeSlivers(arcs);

  const order = drawOrder(arcs, crossings);
  const rank = new Map();
  order.forEach((ai, r) => rank.set(ai, r));
  const owner = (idx) => arcs.findIndex((a) => idx >= a.from && idx <= a.to);
  for (const c of crossings) {
    c.overRank = rank.get(owner(c.over));
    c.underRank = rank.get(owner(c.under));
  }
  // Contiguous runs of link samples, for the renderer to skip and then overlay.
  const links = [];
  if (linkAt) {
    let start = -1;
    for (let i = 0; i < curve.length; i++) {
      if (linkAt[i]) { if (start < 0) start = i; }
      else if (start >= 0) { links.push([start, i]); start = -1; }
    }
    if (start >= 0) links.push([start, curve.length - 1]);
  }

  return { curve, depth, crossings, arcs, order, links, linkAt: linkAt || null };
}

export function diagram(path3,
  { yaw = 0, tilt = TILT, per = 10, smooth = true, linkAt = null } = {}) {
  const src = smooth ? relax(path3, []) : path3.map((p) => p.slice());

  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const raw = src.map((p) => {
    const rx = p[0] * ca - p[2] * sa;
    const rz = p[0] * sa + p[2] * ca;
    return [rx, p[1] * ct - rz * st, rz * ct + p[1] * st];
  });

  const curve = smoothPoints(raw.map((q) => [q[0], q[1]]), per);
  const depth = sampleDepths(raw, curve.length);
  // linkAt is per lattice point; the curve is resampled, so spread it across.
  let mask = null;
  if (linkAt) {
    mask = new Array(curve.length).fill(false);
    for (let i = 0; i < curve.length; i++) {
      const k = Math.floor((i / Math.max(1, curve.length - 1)) * (src.length - 1));
      mask[i] = !!linkAt[k];
    }
  }
  return diagramFrom(curve, depth, mask);
}

// Split any arc that is in front at one crossing and behind at another.
//
// Such an arc has to be painted both before and after the same neighbour, and
// whichever way the sort resolves it, one of its crossings comes out inverted.
// Splitting between the two crossings lets each half be ordered on its own.
function splitMixed(arcs, crossings, curveLen) {
  for (let guard = 0; guard < 12; guard++) {
    const owner = (idx) => arcs.findIndex((a) => idx >= a.from && idx <= a.to);
    let target = -1, cutAt = -1;
    for (let ai = 0; ai < arcs.length && target < 0; ai++) {
      const overs = [], unders = [];
      for (const c of crossings) {
        if (owner(c.over) === ai) overs.push(c.over);
        if (owner(c.under) === ai) unders.push(c.under);
      }
      if (!overs.length || !unders.length) continue;
      // Cut between the nearest over/under pair on this arc.
      let best = Infinity;
      for (const o of overs) {
        for (const u of unders) {
          const gap = Math.abs(o - u);
          if (gap > 1 && gap < best) {
            best = gap;
            cutAt = Math.floor((o + u) / 2);
            target = ai;
          }
        }
      }
    }
    if (target < 0) return;
    const arc = arcs[target];
    if (cutAt <= arc.from || cutAt >= arc.to) return;
    const tail = { from: cutAt, to: arc.to, depth: arc.depth, link: arc.link,
                   seamStart: true, seamEnd: arc.seamEnd };
    arc.to = cutAt;
    arc.seamEnd = true;
    arcs.splice(target + 1, 0, tail);
    void curveLen;
  }
}

// Absorb arcs too short to be drawn as their own strand into their neighbour.
function mergeSlivers(arcs, min = 14) {
  for (let i = arcs.length - 1; i >= 0; i--) {
    if (arcs.length <= 1) break;
    const a = arcs[i];
    if (a.to - a.from >= min) continue;
    const prev = arcs[i - 1], next = arcs[i + 1];
    if (prev) {
      prev.to = a.to;
      prev.seamEnd = a.seamEnd;
    } else if (next) {
      next.from = a.from;
      next.seamStart = a.seamStart;
    } else continue;
    arcs.splice(i, 1);
  }
}

// Break the arcs that take part in an ordering cycle.
//
// A cycle means some arc must be drawn both before and after another. Cutting
// it midway between two of its crossings removes the conflict without touching
// either crossing, so no strand is broken where a break would be read as
// passing behind.
function splitCycles(arcs, crossings, curveLen) {
  for (let guard = 0; guard < 8; guard++) {
    const cyc = findCycle(arcs, crossings);
    if (!cyc) return;
    // Split the arc in the cycle that spans the most crossings; that is the one
    // doing the conflicting duty.
    const owner = (idx) => arcs.findIndex((a) => idx >= a.from && idx <= a.to);
    const count = new Map();
    for (const c of crossings) {
      for (const idx of [c.over, c.under]) {
        const o = owner(idx);
        if (cyc.includes(o)) count.set(o, (count.get(o) || 0) + 1);
      }
    }
    let target = cyc[0], best = -1;
    for (const [ai, n] of count) if (n > best) { best = n; target = ai; }
    const arc = arcs[target];
    // Cut between the two crossings furthest apart along this arc.
    const marks = [];
    for (const c of crossings) {
      for (const idx of [c.over, c.under]) {
        if (idx > arc.from && idx < arc.to) marks.push(idx);
      }
    }
    marks.sort((x, y) => x - y);
    let at = -1;
    if (marks.length >= 2) {
      // Cut in the widest gap between crossings on this arc.
      let gap = -1;
      for (let i = 1; i < marks.length; i++) {
        const g = marks[i] - marks[i - 1];
        if (g > gap) { gap = g; at = Math.floor((marks[i] + marks[i - 1]) / 2); }
      }
    } else {
      at = Math.floor((arc.from + arc.to) / 2);
    }
    // Never cut within sight of a crossing: a break there reads as the strand
    // passing behind, which is exactly the lie we are trying not to tell. Slide
    // the cut to the roomiest spot on the arc that is clear of every crossing.
    const clearance = 4;
    const busy = [];
    for (const c of crossings) {
      for (const idx of [c.over, c.under]) {
        if (idx > arc.from && idx < arc.to) busy.push(idx);
      }
    }
    const tooClose = (x) => busy.some((m) => Math.abs(m - x) <= clearance);
    if (tooClose(at)) {
      let bestAt = -1, bestRoom = -1;
      for (let x = arc.from + clearance + 1; x < arc.to - clearance; x++) {
        if (tooClose(x)) continue;
        const room = busy.length
          ? Math.min(...busy.map((m) => Math.abs(m - x)))
          : Math.min(x - arc.from, arc.to - x);
        if (room > bestRoom) { bestRoom = room; bestAt = x; }
      }
      if (bestAt < 0) return;      // nowhere safe: leave the cycle to depth
      at = bestAt;
    }
    if (at <= arc.from || at >= arc.to) return;
    // Both halves remember that this boundary is not a crossing, so the
    // renderer can overlap them and avoid painting a halo cap mid-strand.
    const tail = { from: at, to: arc.to, depth: arc.depth, link: arc.link,
                   seamStart: true, seamEnd: arc.seamEnd };
    arc.to = at;
    arc.seamEnd = true;
    arcs.splice(target + 1, 0, tail);
    void curveLen;
  }
}

// Any arc caught in an ordering cycle, or null when the order is achievable.
function findCycle(arcs, crossings) {
  const owner = (idx) => arcs.findIndex((a) => idx >= a.from && idx <= a.to);
  const after = arcs.map(() => []);
  const indeg = arcs.map(() => 0);
  for (const c of crossings) {
    const o = owner(c.over), u = owner(c.under);
    if (o < 0 || u < 0 || o === u) continue;
    if (after[u].includes(o)) continue;
    after[u].push(o);
    indeg[o]++;
  }
  const ready = arcs.map((a, i) => i).filter((i) => indeg[i] === 0);
  const seen = [];
  while (ready.length) {
    const i = ready.shift();
    seen.push(i);
    for (const j of after[i]) if (--indeg[j] === 0) ready.push(j);
  }
  if (seen.length === arcs.length) return null;
  return arcs.map((a, i) => i).filter((i) => !seen.includes(i));
}

// Order the arcs so that at every crossing the front strand is drawn last.
export function drawOrder(arcs, crossings) {
  const owner = (idx) => arcs.findIndex((a) => idx >= a.from && idx <= a.to);
  const after = arcs.map(() => []);
  const indeg = arcs.map(() => 0);
  for (const c of crossings) {
    const o = owner(c.over), u = owner(c.under);
    if (o < 0 || u < 0 || o === u) continue;
    if (after[u].includes(o)) continue;
    after[u].push(o);
    indeg[o]++;
  }
  const ready = arcs.map((a, i) => i).filter((i) => indeg[i] === 0)
    .sort((x, y) => arcs[x].depth - arcs[y].depth);
  const order = [];
  while (ready.length) {
    const i = ready.shift();
    order.push(i);
    for (const j of after[i]) {
      if (--indeg[j] === 0) {
        let k = 0;
        while (k < ready.length && arcs[ready[k]].depth <= arcs[j].depth) k++;
        ready.splice(k, 0, j);
      }
    }
  }
  for (let i = 0; i < arcs.length; i++) if (!order.includes(i)) order.push(i);
  return order;
}
