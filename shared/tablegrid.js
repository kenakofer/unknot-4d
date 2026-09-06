// The table's top surface, as a grid of vertices. Pure arithmetic.
//
// Kept apart from table.js, which owns the three.js buffers, for the same
// reason tableshape.js is: the suite has to check the layout -- winding,
// coverage, where the rim lands -- without pulling in three.js.
//
// The grid is `rings` rows of `segments` vertices running from the middle out
// to the n-gon outline. Its TOPOLOGY never changes: the same rows, the same
// columns, the same triangles, whatever shape the table currently is. Only the
// radius at each column moves. That is what lets table.js build the index and
// the buffers once and rewrite positions in place on a shape change, instead of
// remaking twenty thousand vertices on every frame of a slide.

import { ngonRadius } from './tableshape.js';

// Enough segments that the gap between neighbours around the rim is about the
// same as the gap between rings. A fixed count over-tessellates the middle and
// leaves the rim coarse -- measured, the worst edge on a 128-segment grid was
// 2.2 units long, and a colour step spread over an edge that size is exactly
// the blockiness the ring count was raised to avoid.
export function topSegments(rings) {
  return Math.max(96, Math.ceil((2 * Math.PI * rings) / 2 / 4) * 4);
}

// How many vertices the grid has: the centre ring is a full row of coincident
// points rather than one vertex, so the rows are all the same length and the
// index below has no special case.
export function topVertexCount(rings, S) {
  return (rings + 1) * S;
}

// The triangle index, built once.
//
// Wound anticlockwise seen from ABOVE, so the face normals come out pointing
// up. Getting this backwards does not draw an upside-down table, it draws a
// black one: the normals face away from the lights and front-face culling hides
// the surface from the camera entirely, which looks exactly like the marbling
// having no effect.
//
// The innermost ring is a cone of degenerate quads around the centre, so it
// contributes one triangle each rather than two.
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

// Write the vertex positions and UVs for an n-gon of circumradius R into `pos`
// and `uv`, which are flat arrays sized by topVertexCount. Returns the
// circumradius actually reached, for whoever has to bound the result.
//
// Rings are spaced by the SQUARE ROOT of the fraction, so each one covers a
// similar area. Even spacing crowds detail into the middle, where a table has
// the least of it.
//
// UVs are planar, in units of `uvPerUnit` per world unit, so the veins keep one
// size on screen whatever the table's dimensions and whatever shape it is.
//
// The outline is evaluated once per column and scaled per ring. The radius at
// an angle depends on the angle and the side count only, so asking for it at
// every vertex -- twenty thousand times a rebuild -- was two hundred and fifty
// answers repeated eighty times each.
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
