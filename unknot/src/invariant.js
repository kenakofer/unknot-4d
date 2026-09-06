// Knot determinant |Delta(-1)| via the Goeritz/crossing matrix, computed from a
// 2D projection of the lattice path. This is what lets us label a level
// "impossible" honestly: the unknot has determinant 1, the trefoil 3, the
// figure-eight 5. Our moves are all ambient isotopies, so this value can never
// change during play -- if it starts at 3, the level can never be solved.

// Project to the xy-plane, using z to decide over/under.
// Returns crossings as {i, j, sign, overIsI}.
function crossings2D(pts) {
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 2; j < segs.length; j++) {
      const c = segIntersect(segs[i], segs[j]);
      if (c) out.push({ i, j, ...c });
    }
  }
  return out;
}

// 2D segment intersection in the xy-plane with interpolated heights.
function segIntersect([a, b], [c, d]) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null; // parallel
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  const eps = 1e-9;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  const zi = a[2] + t * (b[2] - a[2]);
  const zj = c[2] + u * (d[2] - c[2]);
  if (Math.abs(zi - zj) < 1e-12) return null; // degenerate: coincident heights
  const sign = Math.sign(den);
  return { sign, overIsI: zi > zj, t, u };
}

export function countCrossings(pts) {
  return crossings2D(pts).length;
}

// A lattice path's segments are axis-aligned, so an axis projection produces
// collinear overlaps rather than transversal crossings. Project along a generic
// direction instead: rotate by irrational-ish angles so no two segments align.
function genericProject(pts) {
  const ca = Math.cos(0.4472135955), sa = Math.sin(0.4472135955);
  const cb = Math.cos(0.3162277660), sb = Math.sin(0.3162277660);
  return pts.map(([x, y, z]) => {
    // rotate about z, then about x
    const x1 = x * ca - y * sa, y1 = x * sa + y * ca, z1 = z;
    const y2 = y1 * cb - z1 * sb, z2 = y1 * sb + z1 * cb;
    return [x1, y2, z2];
  });
}

// Determinant of a knot = |det(Goeritz-style Alexander matrix at t=-1)|.
// We build the Alexander matrix from the crossing/arc structure of the diagram.
export function knotDeterminant(closedPts) {
  const pts = genericProject(closedPts);
  const n = pts.length - 1; // closed: last == first
  const segs = [];
  for (let i = 0; i < n; i++) segs.push([pts[i], pts[i + 1]]);

  // Collect crossings with their position along each segment.
  const cross = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = segIntersect(segs[i], segs[j]);
      if (c) cross.push({ i, j, ...c });
    }
  }
  if (cross.length === 0) return 1; // no crossings -> unknot

  // Order crossings along the curve to split it into arcs.
  const events = [];
  for (let k = 0; k < cross.length; k++) {
    events.push({ pos: cross[k].i + cross[k].t, k, over: cross[k].overIsI });
    events.push({ pos: cross[k].j + cross[k].u, k, over: !cross[k].overIsI });
  }
  events.sort((a, b) => a.pos - b.pos);

  // Underpasses split the diagram into arcs.
  const unders = events.filter((e) => !e.over);
  const A = unders.length;
  if (A === 0) return 1;

  // arcId(pos): which arc a point at curve-position pos lies on.
  const underPos = unders.map((e) => e.pos);
  const arcOf = (pos) => {
    let a = 0;
    while (a < underPos.length && underPos[a] <= pos) a++;
    return a % A;
  };

  // Alexander matrix at t=-1 (the "determinant" / Goeritz relation):
  // at each crossing, over-arc o, incoming under a, outgoing under b:
  //   2*o - a - b = 0   (mod the usual sign conventions)
  const M = Array.from({ length: A }, () => new Array(A).fill(0));
  let row = 0;
  for (const c of cross) {
    const overPos = c.overIsI ? c.i + c.t : c.j + c.u;
    const underPos_ = c.overIsI ? c.j + c.u : c.i + c.t;
    const o = arcOf(overPos);
    const before = arcOf(underPos_ - 1e-7);
    const after = arcOf(underPos_ + 1e-7);
    if (row >= A) break;
    M[row][o] = (M[row][o] + 2) % 1000000;
    M[row][before] -= 1;
    M[row][after] -= 1;
    row++;
  }

  // Delete one row and column, take |det| over the integers.
  const m = A - 1;
  if (m <= 0) return 1;
  const B = [];
  for (let r = 0; r < m; r++) B.push(M[r].slice(0, m).map(Number));
  return Math.round(Math.abs(detFraction(B)));
}

// Fraction-free-ish Gaussian elimination in floating point (matrices are tiny).
function detFraction(B) {
  const m = B.length;
  let det = 1;
  for (let c = 0; c < m; c++) {
    let piv = -1, best = 1e-9;
    for (let r = c; r < m; r++) if (Math.abs(B[r][c]) > best) { best = Math.abs(B[r][c]); piv = r; }
    if (piv < 0) return 0;
    if (piv !== c) { const t = B[piv]; B[piv] = B[c]; B[c] = t; det = -det; }
    det *= B[c][c];
    for (let r = c + 1; r < m; r++) {
      const f = B[r][c] / B[c][c];
      if (!f) continue;
      for (let k = c; k < m; k++) B[r][k] -= f * B[c][k];
    }
  }
  return det;
}

// Close an OPEN arc into a loop for invariant computation. The chord must not
// sweep through the region the path lives in, or the closure's knot type
// changes as the path moves and the invariant is not conserved. Routing far
// outside the box (the standard "long knot" closure) keeps it stable.
export function closeArc(path, box) {
  const R = box * 6 + 40;
  const a = path[0], b = path[path.length - 1];
  return path.concat([
    [R, b[1], b[2]], [R, R, b[2]], [R, R, R], [-R, R, R],
    [-R, R, a[2]], [-R, a[1], a[2]], [a[0] - 1, a[1], a[2]], a,
  ]);
}

// Determinant of an open arc, via the far-field closure. Invariant under every
// move in the move set.
export function arcDeterminant(path, box) {
  return knotDeterminant(closeArc(path, box));
}
