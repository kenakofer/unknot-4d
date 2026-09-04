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
    const ang = this.paused ? 0
      : Math.sin(((now - this.t0) / PERIOD) * Math.PI * 2) * ROCK;

    const pts = this.path.map((p) => this.project(p, ang));

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

    // One smooth curve, sampled so each drawn piece spans one lattice step.
    const curve = smoothPoints(flat, 14);
    const per = 14;

    const pieces = [];
    for (let i = 0; i + per < curve.length; i += per) {
      // Overlap each piece by one sample into the next, so the depth-sorted
      // pieces butt together instead of leaving hairline gaps at the joins.
      const seg = curve.slice(i, Math.min(curve.length, i + per + 2));
      const k = Math.min(n - 1, Math.floor(i / per));
      const depth = (raw[k][2] + raw[Math.min(n - 1, k + 1)][2]) / 2;
      pieces.push({ seg, depth, i: k, t: k / Math.max(1, n - 1) });
    }
    pieces.sort((a, b) => a.depth - b.depth);

    // Draw in depth order, but group pieces into runs that are contiguous
    // ALONG THE ROPE as well as close in depth. A halo must not bite the strand
    // it belongs to -- neighbouring pieces of one run sit at slightly different
    // depths, and ordering them individually let each cut its own neighbour,
    // which showed up as dashes along an unbroken strand. Grouping by run means
    // a halo only ever falls across a different part of the rope, which is
    // exactly where a crossing should break.
    const ordered = pieces.slice().sort((a, b) => a.i - b.i);
    const depths = ordered.map((p) => p.depth);
    const spread = Math.max(...depths) - Math.min(...depths);
    // Break a run where the depth jumps sharply: that is the rope diving behind
    // or rising in front of something, which is where a crossing belongs.
    const JUMP = Math.max(0.6, spread * 0.12);
    const runs = [];
    for (const piece of ordered) {
      const last = runs[runs.length - 1];
      const cont = last && piece.i === last.end + 1 &&
        Math.abs(piece.depth - last.segs[last.segs.length - 1].depth) < JUMP;
      if (cont) { last.end = piece.i; last.segs.push(piece); }
      else runs.push({ end: piece.i, segs: [piece] });
    }
    // Each run is drawn at the depth of its nearest piece, so a strand passing
    // in front is drawn later and its halo cuts what is behind.
    for (const run of runs) run.depth = Math.max(...run.segs.map((p) => p.depth));
    runs.sort((a, b) => a.depth - b.depth);

    for (const run of runs) {
      const d = run.segs.map((p) => polyPath(p.seg)).join(' ');
      const u = document.createElementNS(NS, 'path');
      u.setAttribute('d', d);
      u.setAttribute('fill', 'none');
      u.setAttribute('stroke', '#0e1116');
      u.setAttribute('stroke-width', '7');
      u.setAttribute('stroke-linecap', 'round');
      u.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(u);
      for (const piece of run.segs) {
        const o = document.createElementNS(NS, 'path');
        o.setAttribute('d', polyPath(piece.seg));
        o.setAttribute('fill', 'none');
        o.setAttribute('stroke', ropeColour(piece.t));
        o.setAttribute('stroke-width', '2.8');
        o.setAttribute('stroke-linecap', 'round');
        o.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(o);
      }
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
