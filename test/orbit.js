// Orbit direction test.
//
// This behaviour is easy to get backwards and hard to eyeball, so it is
// asserted from the camera geometry rather than by looking at the screen: a
// fixed world point must slide the SAME way the pointer drags.
import { Orbit } from '../src/orbit.js';
import { rockAt, ROCK, NOD } from '../src/minimap.js';

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

console.log('\nthe rock rides on top of the drag, without disturbing it');
{
  const o = new Orbit(null, [0, 0, 0], 20);
  const az0 = o.az, el0 = o.el_;

  o.rock(0.3, 0.1);
  ok('rocking leaves the player angles alone', o.az === az0 && o.el_ === el0,
     `az ${o.az} el ${o.el_}`);
  const a = o.angles();
  ok('but the view angle includes it',
     Math.abs(a.az - (az0 + 0.3)) < 1e-12, `${a.az}`);
  ok('for tilt too', Math.abs(a.el - (el0 + 0.1)) < 1e-12, `${a.el}`);

  // A full swing must not leave any drift behind: this is the bug that would
  // show up as the view slowly wandering off over minutes of play.
  for (let k = 0; k <= 400; k++) {
    const r = rockAt((k / 400) * 9000);
    o.rock(r.yaw, r.tilt);
  }
  o.rock(0, 0);
  ok('a full cycle leaves the angles exactly where they started',
     o.az === az0 && o.el_ === el0, `az ${o.az} el ${o.el_}`);

  // Dragging during the rock must still land where the drag says.
  o.rock(0.4, 0.15);
  const before = o.az;
  o.rotate(50, 0);
  o.rock(0, 0);
  ok('a drag moves the resting angle by the drag alone',
     Math.abs((o.az - before) - 50 * 0.004) < 1e-12, `${o.az - before}`);
}

console.log('\nthe rock stays inside the elevation limits');
{
  const o = new Orbit(null, [0, 0, 0], 20);
  o.el_ = 1.45;                       // already at the top of the drag range
  let worst = 0;
  for (let k = 0; k <= 400; k++) {
    const r = rockAt((k / 400) * 30000);
    o.rock(r.yaw, r.tilt);
    worst = Math.max(worst, Math.abs(o.angles().el));
  }
  ok('the swing never tips past the limit', worst <= 1.45 + 1e-12, `${worst}`);
}

console.log('\nthe panel and the main camera show the same face');
{
  // The two projections were written independently, so this checks they agree
  // rather than trusting the derivation. For a set of camera angles, a world
  // point must land on the same SIDE of centre in both views.
  const YAW_PHASE = Math.PI / 2;
  const panelYaw = (az) => YAW_PHASE - az;
  // The panel's screen-x, straight out of its projection.
  const panelX = (P, ang) => P[0] * Math.cos(ang) - P[2] * Math.sin(ang);

  const probes = [[3, 0, 0], [0, 0, 3], [-3, 0, 0], [0, 0, -3], [2, 0, 2]];
  let checked = 0, disagreed = 0;
  for (let k = 0; k < 24; k++) {
    const az = (k / 24) * Math.PI * 2;
    const o = new Orbit(null, [0, 0, 0], 20);
    o.az = az;
    const eye = o.position();
    for (const P of probes) {
      const a = viewX(P, eye, o.target);
      const b = panelX(P, panelYaw(az));
      if (Math.abs(a) < 1e-9 || Math.abs(b) < 1e-9) continue;
      checked++;
      if (Math.sign(a) !== Math.sign(b)) disagreed++;
    }
  }
  ok(`${checked} probes compared across a full turn`, checked > 80, `${checked}`);
  ok('every probe falls the same side in both views', disagreed === 0,
     `${disagreed} disagreed`);
}

console.log('\nthe two views stay locked THROUGH the rock, not just at rest');
{
  // Agreeing on the resting angle is not enough: the panel's yaw runs the
  // other way, so its rock has to be negated. If that sign were wrong the two
  // would drift apart and meet again twice a cycle, which a rest-only check
  // would miss entirely.
  const panelYaw = (az) => Math.PI / 2 - az;
  const panelX = (P, ang) => P[0] * Math.cos(ang) - P[2] * Math.sin(ang);
  const probes = [[3, 0, 0], [0, 0, 3], [2, 0, 2], [-1, 0, 3]];

  let checked = 0, disagreed = 0;
  for (const az of [0, 0.7, 2.1, 4.4]) {
    for (let k = 0; k <= 120; k++) {
      const r = rockAt((k / 120) * 9000);
      const o = new Orbit(null, [0, 0, 0], 20);
      o.az = az; o.el_ = 0;
      o.rock(r.yaw, 0);
      const eye = o.position();
      const ang = panelYaw(o.az) + r.yaw * -1;   // rockSign = -1
      for (const P of probes) {
        const a = viewX(P, eye, o.target);
        const b = panelX(P, ang);
        if (Math.abs(a) < 1e-9 || Math.abs(b) < 1e-9) continue;
        checked++;
        if (Math.sign(a) !== Math.sign(b)) disagreed++;
      }
    }
  }
  ok(`${checked} probes across four headings and a full cycle`,
     checked > 1000, `${checked}`);
  ok('the views never disagree mid-swing', disagreed === 0,
     `${disagreed} of ${checked}`);
}

console.log('\nthe rock is a closed loop with the amplitude it claims');
{
  let maxYaw = 0, maxTilt = 0;
  for (let k = 0; k <= 2000; k++) {
    const r = rockAt((k / 2000) * 9000 * 143);   // many periods of both
    maxYaw = Math.max(maxYaw, Math.abs(r.yaw));
    maxTilt = Math.max(maxTilt, Math.abs(r.tilt));
  }
  ok('yaw swings the stated amount', Math.abs(maxYaw - ROCK) < 0.01, `${maxYaw}`);
  ok('tilt swings the stated amount', Math.abs(maxTilt - NOD) < 0.01, `${maxTilt}`);
  const z = rockAt(0);
  ok('and starts centred', z.yaw === 0 && z.tilt === 0, JSON.stringify(z));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
