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
// Drawn as SVG rather than a second WebGL canvas so the strokes stay crisp at
// this size and the whole thing costs almost nothing to redraw.

const NS = 'http://www.w3.org/2000/svg';

// Matches the panel background, so a nearer strand appears to cut a clean gap
// in the one behind rather than laying a dark line over it.
const HALO = '#161c26';

// How far the view rocks, and how long a full there-and-back takes.
const ROCK = 0.42;          // radians either side of centre
const PERIOD = 9000;        // ms
const TILT = 0.30;          // fixed downward tilt, so we look slightly from above

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
  project(p, ang) {
    const off = this.sliceOffset(this.sliceOf(p));
    const x = p[0] + off[0];
    const y = p[1] + off[1];
    const z = p[2] + off[2];
    // Yaw about the vertical axis, then a fixed tilt. Orthographic: no
    // perspective divide, so nothing balloons as it swings toward the viewer.
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = x * ca - z * sa;
    const rz = x * sa + z * ca;
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    // Third component is depth: larger means nearer the viewer.
    return [rx, y * ct - rz * st, rz * ct + y * st];
  }

  draw(now) {
    const svg = this.svg;
    if (!svg || !this.path.length) return;
    const path = relax(this.path, this.keep ? this.keep() : []);
    const ang = this.paused ? 0
      : Math.sin(((now - this.t0) / PERIOD) * Math.PI * 2) * ROCK;

    const pts = path.map((p) => this.project(p, ang));

    // Fit the drawing to the panel, with a little margin.
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const q of pts) {
      for (let d = 0; d < 2; d++) {
        if (q[d] < lo[d]) lo[d] = q[d];
        if (q[d] > hi[d]) hi[d] = q[d];
      }
    }
    const w = svg.clientWidth || 200, h = svg.clientHeight || 120;
    const pad = 10;
    const sx = (hi[0] - lo[0]) > 1e-6 ? (w - pad * 2) / (hi[0] - lo[0]) : 1;
    const sy = (hi[1] - lo[1]) > 1e-6 ? (h - pad * 2) / (hi[1] - lo[1]) : 1;
    // One scale for both axes, so the shape is never stretched.
    const s = Math.min(sx, sy);
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
    const map = (q) => [w / 2 + (q[0] - cx) * s, h / 2 - (q[1] - cy) * s];

    // flat carries panel x/y; pts still carries depth for sorting.
    this.render(pts.map(map), pts);
  }

  // Draw the rope in short pieces, furthest first, each with a wide dark
  // stroke under a narrower bright one. Where the rope crosses itself the
  // nearer piece's dark halo cuts the one behind, which is exactly how a knot
  // diagram shows which strand passes over.
  render(flat, raw) {
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

    for (const ai of dg.order) {
      const arc = dg.arcs[ai];
      const pts = dg.curve.slice(arc.from, arc.to + 1);
      const d = polyPath(pts);
      const t = arc.from / Math.max(1, dg.curve.length - 1);
      if (arc.link) {
        const l = document.createElementNS(NS, 'path');
        l.setAttribute('d', d);
        l.setAttribute('fill', 'none');
        l.setAttribute('stroke', '#9aa6b8');
        l.setAttribute('stroke-width', '1.4');
        l.setAttribute('stroke-opacity', '0.45');
        l.setAttribute('stroke-linecap', 'round');
        svg.appendChild(l);
        continue;
      }
      const u = document.createElementNS(NS, 'path');
      u.setAttribute('d', d);
      u.setAttribute('fill', 'none');
      u.setAttribute('stroke', HALO);
      u.setAttribute('stroke-width', '8');
      u.setAttribute('stroke-linecap', 'round');
      u.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(u);

      const o = document.createElementNS(NS, 'path');
      o.setAttribute('d', d);
      o.setAttribute('fill', 'none');
      o.setAttribute('stroke', ropeColour(t));
      o.setAttribute('stroke-width', '2.9');
      o.setAttribute('stroke-linecap', 'round');
      o.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(o);
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

// The same green-to-purple ramp the rope uses in the main view.
function ropeColour(t) {
  const a = [0x37, 0xd6, 0xa0], b = [0xa0, 0x6b, 0xff];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
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
  for (let a = 0; a + 1 < curve.length; a++) {
    for (let b = a + 2; b + 1 < curve.length; b++) {
      const hit = segIntersect(curve[a], curve[a + 1], curve[b], curve[b + 1]);
      if (!hit) continue;
      const da = depth[a] + (depth[a + 1] - depth[a]) * hit.t;
      const db = depth[b] + (depth[b + 1] - depth[b]) * hit.u;
      if (Math.abs(da - db) < 1e-9) continue;
      const under = da < db ? a : b;
      const over = da < db ? b : a;
      crossings.push({ over, under, overIsLater: over > under, da, db });
      // Cut on BOTH sides: cutting only the far side lets one arc be in front
      // at one crossing and behind at another, a cycle no order can satisfy.
      cuts.add(under);
      cuts.add(over);
    }
  }

  const arcs = [];
  let head = 0;
  for (let i = 1; i < curve.length; i++) {
    if (cuts.has(i) || i === curve.length - 1) {
      const m = Math.floor((head + i) / 2);
      arcs.push({ from: head, to: i, depth: depth[m],
                  link: linkAt ? linkAt[m] : false });
      head = i;
    }
  }
  const order = drawOrder(arcs, crossings);
  const rank = new Map();
  order.forEach((ai, r) => rank.set(ai, r));
  const owner = (idx) => arcs.findIndex((a) => idx >= a.from && idx <= a.to);
  for (const c of crossings) {
    c.overRank = rank.get(owner(c.over));
    c.underRank = rank.get(owner(c.under));
  }
  return { curve, depth, crossings, arcs, order };
}

export function diagram(path3, { yaw = 0, tilt = TILT, per = 10, smooth = true } = {}) {
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
  return diagramFrom(curve, depth, null);
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
