// A small SVG view of the whole puzzle, drawn beside the main scene.
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

    // Standard hidden-line treatment for a knot diagram: walk the curve, find
    // where it genuinely crosses itself in 2D, and cut it at those points. Each
    // resulting arc is drawn whole, back to front, halo first. No proximity
    // thresholds and no depth margins -- a crossing either exists or it does
    // not, so nothing wobbles as the view rocks.
    const curve = smoothPoints(flat, 10);
    const depth = sampleDepths(raw, curve.length);
    const linkAt = this.linkMask(flat.length, curve.length);

    // Split points: the parameter along the curve where it passes under itself.
    const cuts = new Set();
    for (let a = 0; a + 1 < curve.length; a++) {
      for (let b = a + 2; b + 1 < curve.length; b++) {
        const hit = segIntersect(curve[a], curve[a + 1], curve[b], curve[b + 1]);
        if (!hit) continue;
        // Cut whichever side is further away; the nearer one stays whole and
        // its halo does the occluding.
        const da = depth[a] + (depth[a + 1] - depth[a]) * hit.t;
        const db = depth[b] + (depth[b + 1] - depth[b]) * hit.u;
        if (Math.abs(da - db) < 1e-9) continue;
        cuts.add(da < db ? a : b);
      }
    }

    // Build arcs between the cuts.
    const arcs = [];
    let head = 0;
    for (let i = 1; i < curve.length; i++) {
      if (cuts.has(i) || i === curve.length - 1) {
        if (i - head >= 1) {
          arcs.push({
            pts: curve.slice(head, i + 1),
            depth: depth[Math.floor((head + i) / 2)],
            t: head / Math.max(1, curve.length - 1),
            link: linkAt[Math.floor((head + i) / 2)],
          });
        }
        head = i;
      }
    }
    arcs.sort((a, b) => a.depth - b.depth);

    for (const arc of arcs) {
      const d = polyPath(arc.pts);
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
      o.setAttribute('stroke', ropeColour(arc.t));
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
