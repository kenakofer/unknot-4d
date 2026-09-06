// The table's top surface, as a grid of vertices. Pure arithmetic.
//
// Kept apart from table.js, which owns the three.js buffers, for the same
// reason tableshape.js is: the suite has to check the layout -- winding,
// coverage, where the rim lands -- without pulling in three.js.
//
// The grid is `rings` rows of `segments` vertices running from the middle out
// to the n-gon outline. Its topology never changes -- only the radius at each
// column moves -- which is what lets table.js build the buffers once and
// rewrite positions in place on a shape change.

import { ngonRadius } from './tableshape.js';

// Enough segments that the gap between neighbours around the rim is about the
// same as the gap between rings. A fixed count over-tessellates the middle and
// leaves the rim coarse -- measured, the worst edge on a 128-segment grid was
// 2.2 units long, and a colour step spread over an edge that size is exactly
// the blockiness the ring count was raised to avoid.
export function topSegments(rings) {
  return Math.max(96, Math.ceil((2 * Math.PI * rings) / 2 / 4) * 4);
}

// The centre ring is a full row of coincident points rather than one vertex,
// so every row is the same length.
export function topVertexCount(rings, S) {
  return (rings + 1) * S;
}

// The triangle index, built once.
//
// Wound anticlockwise seen from above. Getting this backwards does not draw an
// upside-down table, it draws a black one: back-face culling hides the surface
// entirely, which looks exactly like the marbling having no effect.
//
// The innermost ring's quads collapse to a point at the centre, so each
// contributes one triangle rather than two.
export function topIndex(rings, S) {
  const idx = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * S + j, b = i * S + (j + 1) % S;
      const c = (i + 1) * S + j, d = (i + 1) * S + (j + 1) % S;
      if (i > 0) idx.push(a, b, c);
      idx.push(b, d, c);
    }
  }
  return idx;
}

// Write the positions and UVs for an n-gon of circumradius R into `pos` and
// `uv`, flat arrays sized by topVertexCount. Returns the furthest radius
// reached, so the caller can bound the result without a second pass.
//
// Rings are spaced by the square root of the fraction, so each covers a similar
// area; even spacing crowds vertices into the middle. UVs are planar, in
// `uvPerUnit` per world unit, so the veins keep one size whatever the table's
// dimensions or shape.
//
// The outline is evaluated once per column and scaled per ring: the radius
// depends only on the angle and the side count, so evaluating it per vertex was
// 252 answers repeated 80 times each.
export function fillTop(pos, uv, n, R, rings, S, uvPerUnit) {
  const cx = new Float64Array(S), cz = new Float64Array(S);
  let reach = 0;
  for (let j = 0; j < S; j++) {
    const th = (j / S) * Math.PI * 2;
    const r = ngonRadius(th, n) * R;
    cx[j] = Math.cos(th) * r;
    cz[j] = Math.sin(th) * r;
    if (r > reach) reach = r;
  }
  let p = 0, q = 0;
  for (let i = 0; i <= rings; i++) {
    const f = Math.sqrt(i / rings);
    for (let j = 0; j < S; j++) {
      const px = cx[j] * f, pz = cz[j] * f;
      pos[p++] = px; pos[p++] = 0; pos[p++] = pz;
      uv[q++] = px * uvPerUnit; uv[q++] = pz * uvPerUnit;
    }
  }
  return reach;
}
