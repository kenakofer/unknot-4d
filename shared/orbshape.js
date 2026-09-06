// The size of a hypersphere's slice.
//
// Kept apart from orbs.js, which draws them, so the suite can check the shape
// without pulling in three.js -- the same split tableshape.js makes.
//
// A 4D ball of radius R sliced at a fixed w is a 3D ball of radius
// sqrt(R^2 - d^2), where d is how far the slice is from the ball's centre along
// w. So an orb swells as the player walks toward it in w, shrinks as they walk
// past, and reaches ZERO SIZE at d = R rather than fading out -- which is what
// a sphere leaving a hyperplane actually does, and the thing worth showing.

export function sliceRadius(R, cw, w, depth) {
  // The shortest way round, since w wraps: an orb sitting near the seam is
  // close to slices at both ends and has to swell for both.
  let d = Math.abs(w - cw) % depth;
  if (d > depth / 2) d = depth - d;
  const r2 = R * R - d * d;
  return r2 > 0 ? Math.sqrt(r2) : 0;
}
