// Orbit direction test.
//
// This behaviour is easy to get backwards and hard to eyeball, so it is
// asserted from the camera geometry rather than by looking at the screen: a
// fixed world point must slide the SAME way the pointer drags.
import { Orbit } from '../src/orbit.js';

// View-space x of a world point, i.e. the axis that maps to screen x.
// Mirrors what three.js lookAt() builds.
function viewX(P, eye, target) {
  const z = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
  const zl = Math.hypot(...z);
  const Z = z.map((v) => v / zl);
  const up = [0, 1, 0];
  const x = [
    up[1] * Z[2] - up[2] * Z[1],
    up[2] * Z[0] - up[0] * Z[2],
    up[0] * Z[1] - up[1] * Z[0],
  ];
  const xl = Math.hypot(...x);
  const X = x.map((v) => v / xl);
  const d = [P[0] - eye[0], P[1] - eye[1], P[2] - eye[2]];
  return d[0] * X[0] + d[1] * X[1] + d[2] * X[2];
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const target = [3.5, 3.5, 3.5];
// A landmark well off to one side, so its motion is unambiguous.
const P = [9, 1, 1];

console.log('\norbit follows the pointer');
{
  const o = new Orbit(null, target, 17.6);
  const before = viewX(P, o.position(), target);
  o.rotate(60, 0);                     // drag RIGHT
  const after = viewX(P, o.position(), target);
  ok('drag right moves the scene right', after > before,
     `viewX ${before.toFixed(3)} -> ${after.toFixed(3)}`);
}
{
  const o = new Orbit(null, target, 17.6);
  const before = viewX(P, o.position(), target);
  o.rotate(-60, 0);                    // drag LEFT
  const after = viewX(P, o.position(), target);
  ok('drag left moves the scene left', after < before,
     `viewX ${before.toFixed(3)} -> ${after.toFixed(3)}`);
}
{
  // Drag DOWN should lower the viewpoint, so the scene tips down with the hand.
  const o = new Orbit(null, target, 17.6);
  const before = o.position()[1];
  o.rotate(0, 60);
  const after = o.position()[1];
  ok('drag down lowers the viewpoint', after < before,
     `camera y ${before.toFixed(2)} -> ${after.toFixed(2)}`);
}
{
  const o = new Orbit(null, target, 17.6);
  const before = o.position()[1];
  o.rotate(0, -60);
  const after = o.position()[1];
  ok('drag up raises the viewpoint', after > before,
     `camera y ${before.toFixed(2)} -> ${after.toFixed(2)}`);
}
{
  // Elevation must stay clamped away from the poles however hard you drag.
  const o = new Orbit(null, target, 17.6);
  for (let i = 0; i < 50; i++) o.rotate(0, 200);
  ok('elevation clamps at the bottom', o.el_ >= -1.45);
  for (let i = 0; i < 100; i++) o.rotate(0, -200);
  ok('elevation clamps at the top', o.el_ <= 1.45);
}
{
  // Zoom stays inside its bounds.
  const o = new Orbit(null, target, 17.6);
  for (let i = 0; i < 80; i++) o.zoom(400);
  ok('zoom out is bounded', o.radius <= o.maxR + 1e-9);
  for (let i = 0; i < 200; i++) o.zoom(-400);
  ok('zoom in is bounded', o.radius >= o.minR - 1e-9);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
