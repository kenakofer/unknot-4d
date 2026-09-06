// The shape of the table, as a function of where you are along w.
//
// Kept apart from table.js, which draws it, because this half is pure
// arithmetic and the test suite has to reach it without pulling in three.js --
// the same split rock.js makes for the clocks.
//
// THE OBJECT
//
// Define, in 4D:
//
//   S = { (x, y, z, w) : hypot(x, z) <= r(atan2(z, x), w), |y| <= thickness }
//
// where r(theta, w) is the polar radius of a regular n-gon, with n varying
// smoothly with w. That is a genuine 4D region -- for each w it fixes a closed
// curve in the x-z plane and extrudes it a little in y -- and its slice at any
// fixed w is exactly a prism over that curve. So the shapes the player sees are
// honestly obtained by slicing one object, not faked by swapping models.
//
// It is not convex and it is not a named polytope. Nothing about a table
// requires either.

// How many sides the cross-section has at each point around the w loop. The
// values are what the player sees: a circle, a triangle, a hexagon, and back
// through the triangle -- so a full trip round the ring returns the table to
// where it started, as the ring itself does.
//
// 64 stands in for a circle. Fractional counts in between are the whole point:
// a shape with 4.5 sides is not a polygon anyone can name, and watching one
// resolve into a hexagon is the effect worth having.
export const SHAPE_LOOP = [64, 3, 6, 3];

// The polar radius of a regular n-gon of circumradius 1, at angle theta.
//
//   r(theta) = cos(pi/n) / cos(theta mod 2pi/n - pi/n)
//
// A circle is the n -> infinity limit, which is why "circular" is drawn as a
// many-sided polygon rather than special-cased: at 64 sides no one can tell,
// and the transition into and out of it stays continuous.
//
// Written to accept a fractional n. The formula is periodic in theta with
// period 2pi/n and does not care whether that divides the circle evenly, so a
// non-integer n gives a shape that is polygon-like with one seam -- which reads
// as a shape mid-transformation, which is what it is.
export function ngonRadius(theta, n) {
  const seg = (2 * Math.PI) / n;
  const a = ((theta % seg) + seg) % seg - seg / 2;
  return Math.cos(Math.PI / n) / Math.cos(a);
}

// Smoothstep, so the table eases between shapes rather than sliding linearly.
// A linear blend spends most of its time visibly mid-way; this one spends it
// near the shapes worth recognising.
const smooth = (t) => t * t * (3 - 2 * t);

// How many sides the table has at position `w` around the loop. Interpolated in
// 1/n rather than n, so the approach to the circle is not dominated by the jump
// from 6 to 64 -- in reciprocal space those are close together, which matches
// how the shapes actually look.
export function sidesAt(w, depth) {
  const loop = SHAPE_LOOP.length;
  const t = ((w / Math.max(1, depth)) * loop) % loop;
  const i = Math.floor(t);
  const f = t - i;
  const a = SHAPE_LOOP[((i % loop) + loop) % loop];
  const b = SHAPE_LOOP[(((i + 1) % loop) + loop) % loop];
  const inv = (1 / a) + ((1 / b) - (1 / a)) * smooth(f);
  return 1 / inv;
}
