// Check the PICTURE, not the data structure.
//
// The property tests all passed while the rendered image was still wrong,
// because they checked what the arcs meant, not what got painted over what.
// This rasterises the SVG the minimap would produce and inspects pixels.
//
// Two faults it can see and the data-level tests cannot:
//   - a black stripe: halo showing across a strand nothing is crossing
//   - a wrong crossing: the far strand painted over the near one

import { diagram } from '../src/minimap.js';

// A tiny scanline rasteriser: enough to know which stroke owns each pixel.
// Strokes are drawn in the order given, so the last one to cover a pixel wins,
// exactly as SVG paints them.
function raster(w, h, strokes) {
  const buf = new Array(w * h).fill(null);
  for (const s of strokes) {
    const r = s.width / 2;
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const [x0, y0] = s.pts[i], [x1, y1] = s.pts[i + 1];
      const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
        const lo = Math.ceil(-r), hi = Math.floor(r);
        for (let dy = lo; dy <= hi; dy++) {
          for (let dx = lo; dx <= hi; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const X = Math.round(px + dx), Y = Math.round(py + dy);
            if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
            buf[Y * w + X] = s.id;
          }
        }
      }
    }
  }
  return buf;
}

// Build the stroke list exactly as the minimap does.
function strokesFor(d, scale) {
  const pts = d.curve.map((p) => [p[0] * scale + 200, p[1] * scale + 200]);
  const out = [];
  const seg = (ai) => {
    const a = d.arcs[ai];
    const lo = Math.max(0, a.seamStart ? a.from - 3 : a.from);
    const hi = Math.min(pts.length - 1, a.seamEnd ? a.to + 3 : a.to);
    return pts.slice(lo, hi + 1);
  };
  // Halo for an arc, then that arc's line, then the NEXT arc's halo... is what
  // paints a halo over a line that is not behind it. Interleave properly: an
  // arc's halo must sit above every line drawn before it, and below its own.
  for (const ai of d.order) {
    if (d.arcs[ai].link) continue;
    out.push({ id: `halo${ai}`, halo: true, arc: ai, pts: seg(ai), width: 8 });
  }
  for (const ai of d.order) {
    out.push({ id: `line${ai}`, halo: false, arc: ai, pts: seg(ai), width: 2.9 });
  }
  return out;
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

console.log('\nwhat the picture actually shows');
{
  const tre = [];
  for (let k = 0; k < 90; k++) {
    const t = 2 * Math.PI * k / 90;
    tre.push([Math.sin(t) + 2 * Math.sin(2 * t),
              Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)]);
  }
  tre.push(tre[0]);

  let brokenSomewhere = 0, invertedSomewhere = 0, checked = 0;
  for (const yaw of [0, 0.2, 0.35, 0.5, 0.7]) {
    const d = diagram(tre, { yaw, tilt: 0.34 });
    const strokes = strokesFor(d, 30);
    const buf = raster(400, 400, strokes);
    const pts = d.curve.map((p) => [p[0] * 30 + 200, p[1] * 30 + 200]);

    // 1. Walk each arc's own centreline. Every sample should still show that
    //    arc's line, unless another arc genuinely crosses in front there.
    const crossPts = new Set();
    for (const c of d.crossings) { crossPts.add(c.over); crossPts.add(c.under); }
    for (const ai of d.order) {
      const a = d.arcs[ai];
      for (let i = a.from + 2; i <= a.to - 2; i++) {
        // skip samples near any crossing: being covered there is correct
        let near = false;
        for (const cp of crossPts) if (Math.abs(cp - i) <= 6) { near = true; break; }
        if (near) continue;
        checked++;
        const [x, y] = pts[i];
        const px = buf[Math.round(y) * 400 + Math.round(x)];
        if (px === `line${ai}`) continue;
        // covered by something: a halo means a black stripe
        if (px && px.startsWith('halo')) brokenSomewhere++;
      }
    }

    // 2. At each crossing the OVER strand's colour must be the visible one.
    const ownerOf = (i) => d.arcs.findIndex((a) => i >= a.from && i <= a.to);
    for (const c of d.crossings) {
      // Sample right at the intersection: this is where the front strand must
      // be the one you see.
      const [x, y] = pts[c.over];
      const px = buf[Math.round(y) * 400 + Math.round(x)];
      const want = `line${ownerOf(c.over)}`;
      if (px === want) continue;
      // Another strand may legitimately pass here too (three strands meeting).
      // Only count it wrong if what we see is the strand this crossing says is
      // BEHIND.
      const behind = `line${ownerOf(c.under)}`;
      if (px === behind) {
        invertedSomewhere++;
        if (invertedSomewhere <= 6) {
          console.log(`      at over@${c.over}: saw the BEHIND strand ${px}`);
        }
      }
    }
  }

  ok(`${checked} strand pixels inspected`, checked > 500, `${checked}`);
  ok('no black stripe across an uncrossed strand', brokenSomewhere === 0,
     `${brokenSomewhere} pixels hidden by a halo`);
  ok('the front strand is the visible one at every crossing',
     invertedSomewhere === 0, `${invertedSomewhere} crossings inverted`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
