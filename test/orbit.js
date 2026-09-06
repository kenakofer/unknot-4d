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

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                         a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

// Screen-x of a world point, with the perspective divide, or null if the point
// is behind the camera. viewX above omits the divide, which is fine for the
// sign of a single comparison but not for sweeping across headings.
function screenX(P, o) {
  const eye = o.position(), T = o.target;
  const Z = unit([eye[0] - T[0], eye[1] - T[1], eye[2] - T[2]]);
  const X = unit(cross([0, 1, 0], Z));
  const d = [P[0] - eye[0], P[1] - eye[1], P[2] - eye[2]];
  const depth = -(d[0] * Z[0] + d[1] * Z[1] + d[2] * Z[2]);
  if (depth <= 0.5) return null;
  return (d[0] * X[0] + d[1] * X[1] + d[2] * X[2]) / depth;
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
  // Swept across every heading, not checked from one spot.
  //
  // The earlier version of this test used a single fixed world point, and that
  // gave a FALSE PASS: for any one point, whether increasing azimuth slides it
  // left or right depends on where the point sits relative to the camera, so
  // the probe happened to sit in the half where the sign came out right. When
  // the resting azimuth later moved, the same code started failing without the
  // code having changed. Probing at every heading removes that dependence.
  //
  // The probe is placed two units to the camera's own right each time, so it
  // is always comfortably on screen and always starts off-centre -- a point on
  // the view axis has a screen-x of zero, where the sign is just noise.
  const probeRight = (o, d) => {
    const eye = o.position();
    const Z = unit([eye[0] - o.target[0], eye[1] - o.target[1], eye[2] - o.target[2]]);
    const X = unit(cross([0, 1, 0], Z));
    return [o.target[0] + X[0] * d, o.target[1], o.target[2] + X[2] * d];
  };

  // Turntable: dragging right spins the puzzle right, so its near face swings
  // away to the LEFT across the view. The scene deliberately moves opposite the
  // pointer -- the drag grips the object, it does not push the picture.
  for (const [name, dx, want] of [['right', 60, -1], ['left', -60, 1]]) {
    let checked = 0, wrong = 0;
    for (let k = 0; k < 48; k++) {
      const o = new Orbit(null, [0, 0, 0], 10);
      o.az = (k / 48) * Math.PI * 2;
      o.el_ = 0;
      const P = probeRight(o, 2);
      const before = screenX(P, o);
      o.rotate(dx, 0);
      const after = screenX(P, o);
      if (before === null || after === null) continue;
      checked++;
      if (Math.sign(after - before) !== want) wrong++;
    }
    ok(`drag ${name} turns the puzzle ${name} at all ${checked} headings`,
       checked > 40 && wrong === 0, `${wrong} of ${checked} wrong`);
  }
}
{
  // Drag DOWN tips the top of the puzzle toward you, which lifts the camera.
  const o = new Orbit(null, target, 17.6);
  const before = o.position()[1];
  o.rotate(0, 60);
  const after = o.position()[1];
  ok('drag down tips the top toward you', after > before,
     `camera y ${before.toFixed(2)} -> ${after.toFixed(2)}`);
}
{
  const o = new Orbit(null, target, 17.6);
  const before = o.position()[1];
  o.rotate(0, -60);
  const after = o.position()[1];
  ok('drag up tips the top away', after < before,
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

console.log('\nthe 4D slice frames recede away from the resting camera');
{
  // Each extra w-slice must sit FURTHER from the eye than the one before, or
  // the stack reads as frames piling toward the viewer instead of receding.
  // This depends on the resting azimuth, so it breaks silently if the camera's
  // home angle moves without sliceOffset following -- which is exactly what
  // happened when the camera was first pointed away from its old corner.
  const span = 10;
  const sliceOffset = (k) => {
    if (k === 0) return [0, 0, 0];
    const s = Math.sign(k), n = Math.abs(k);
    const step = n * span * 1.18 + n * n * span * 0.10;
    return [-s * step * 0.95, 0, -step * 0.55];
  };

  const o = new Orbit(null, [0, 0, 0], 30);
  const eye = o.position();
  const dist = (p) => Math.hypot(eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]);

  let rising = true;
  let prev = dist(sliceOffset(0));
  const seen = [prev];
  for (let k = 1; k <= 4; k++) {
    const d = dist(sliceOffset(k));
    if (d <= prev) rising = false;
    prev = d;
    seen.push(d);
  }
  ok('each slice is further from the eye than the last', rising,
     seen.map((d) => d.toFixed(1)).join(' < '));

  // And symmetrically for slices on the other side.
  let rising2 = true;
  prev = dist(sliceOffset(0));
  for (let k = -1; k >= -4; k--) {
    const d = dist(sliceOffset(k));
    if (d <= prev) rising2 = false;
    prev = d;
  }
  ok('slices on the other side recede too', rising2);
}

console.log('\nthe resting view looks due north from 45 degrees up');
{
  const o = new Orbit(null, [0, 0, 0], 10);
  const eye = o.position();
  // Axis 2 is north/south with north negative, so looking north means the view
  // direction has a negative z and the eye sits on the positive-z side.
  const look = [-eye[0], -eye[1], -eye[2]];
  const len = Math.hypot(...look);
  ok('the view faces north', look[2] / len < -0.7, `${(look[2] / len).toFixed(3)}`);
  ok('and does not drift east or west',
     Math.abs(look[0]) < 1e-9, `${look[0]}`);
  ok('from 45 degrees above the horizontal',
     Math.abs(o.el_ - Math.PI / 4) < 1e-12, `${o.el_}`);
}

// --- ringYaw turns the camera to face each frame square on ------------------
//
// The slice frames sit around a circle, each facing outward from its centre, so
// travelling to one is not enough -- the camera has to turn by the same angle
// or it views the far frames at an obliquity that grows with the distance from
// slot 0. The sign matters and is easy to get backwards: azimuth places the
// EYE, so it runs against the direction the slot advances.
{
  const SLICE_GAP = 1.5, dims = [6, 6, 6, 8];
  const slots = dims[3] + 1;
  const R = (slots * Math.max(...dims) * SLICE_GAP) / (2 * Math.PI);
  const slotOffset = (k) => [R * Math.sin(2 * Math.PI * k / slots), 0,
                             R * Math.cos(2 * Math.PI * k / slots) - R];
  const slotYaw = (k) => (2 * Math.PI * k) / slots;
  const C = [2.5, 2.5, 2.5];
  const centre = [C[0], C[1], C[2] - R];

  const offBy = (k, sign) => {
    const off = slotOffset(k);
    const target = [C[0] + off[0], C[1] + off[1], C[2] + off[2]];
    const o = new Orbit(null, target, 14.4);
    o.ringYaw = sign * slotYaw(k);
    const eye = o.position();
    // View direction and the frame's inward normal, flattened to the ground.
    const v = [target[0] - eye[0], target[2] - eye[2]];
    const n = [centre[0] - target[0], centre[2] - target[2]];
    const vL = Math.hypot(...v), nL = Math.hypot(...n);
    if (!nL) return 0;                       // slot 0 sits at the ring centre
    const cos = (v[0] * n[0] + v[1] * n[1]) / (vL * nL);
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  };

  let worstNeg = 0, worstPos = 0;
  for (let k = 1; k < slots; k++) {
    worstNeg = Math.max(worstNeg, offBy(k, -1));
    worstPos = Math.max(worstPos, offBy(k, +1));
  }
  // A hair of floating-point slack: acos near 1 loses precision.
  ok('negated ringYaw faces every frame square on', worstNeg < 1e-3,
     `worst ${worstNeg.toExponential(2)} deg`);
  ok('the opposite sign does not', worstPos > 90,
     `worst only ${worstPos.toFixed(1)} deg -- test would not catch a flip`);

  // And it must stay independent of the player's own aim.
  const o = new Orbit(null, [0, 0, 0], 10);
  const az0 = o.az;
  o.ringYaw = -slotYaw(3);
  ok('ringYaw leaves the player azimuth alone', o.az === az0);
  ok('but does change where the eye ends up',
     JSON.stringify(o.position()) !== JSON.stringify(new Orbit(null, [0, 0, 0], 10).position()));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
