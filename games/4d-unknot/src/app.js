import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { Puzzle, planPush, pushWithRoom, reversePath, rampAt } from './knot.js';
import { Orbit } from '../../../shared/orbit.js';
import { Ring, Slide } from '../../../shared/ring.js';
import { LEVELS } from './levels.js';
import { Minimap, rockAt } from './minimap.js';
import { PauseMenu } from '../../../shared/pause.js';

let scene, camera, renderer, raycaster, orbit;
// Start of the rock's clock, so both views swing from the same phase.
const t0 = performance.now();
let pz, level, history, cubes, gridGroup, hoverIdx = -1, selIdx = -1;
// Which w-slice is in focus (4D levels only), and the eased value the frame
// POSITIONS are measured from -- it chases slide.focus rather than jumping to it.
// Keeping the two apart means the logic (which frame is highlighted, which
// slice the cursor is in) stays on exact integers while only the geometry
// slides.
// The slide owns both: `focus` is the exact slice the cursor is in, `shown`
// is the eased value the frame positions are measured from.
const slide = new Slide(0);
// viewAxes[k] says which puzzle axis is drawn along render axis k. Slot 3 is
// the dimension not directly drawn.
let viewAxes = [0, 1, 2, 3];
let frames = null;
let minimap = null;
let pause = null;

const el = (id) => document.getElementById(id);

function init() {
  const canvas = el('view');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1116);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  raycaster = new THREE.Raycaster();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key1 = new THREE.DirectionalLight(0xffffff, 0.9);
  key1.position.set(1, 2, 1.5);
  scene.add(key1);
  const key2 = new THREE.DirectionalLight(0x88aaff, 0.35);
  key2.position.set(-1.5, -0.5, -1);
  scene.add(key2);

  minimap = new Minimap(el('minimap'));
  loadLevel(0);
  bindInput();
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(render);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function loadLevel(idx) {
  level = LEVELS[idx];
  // Every level is played in four dimensions. A level defined in 3D is lifted
  // by giving each cell the same w, which leaves the rope exactly where it was
  // -- the puzzle is unchanged, it has simply gained somewhere new to go. The
  // box is made symmetric at the same time so the view can rotate between any
  // pair of axes.
  const size = Math.max(...level.dims);
  const dims = level.dims.length === 4 ? level.dims : [size, size, size, size];
  // Lift to the MIDDLE of w, not to 0. A blocked w push is refused rather than
  // sliding the whole rope (which would jump it between frames), so starting
  // against the w = 0 wall left half the dimension unreachable: every 'w back'
  // simply failed until the rope had been walked forward first.
  const w0 = Math.floor(((dims.length > 3 ? dims[3] : 1) - 1) / 2);
  const path = level.dims.length === 4
    ? level.path.map((p) => p.slice())
    : level.path.map((p) => [...p, w0]);
  pz = new Puzzle(dims, path);
  history = [];
  viewAxes = [0, 1, 2, 3];
  // Start with the first cell selected so the pad is immediately usable.
  selIdx = 0;
  // Focus the slice the rope was actually lifted into, not slice 0.
  slide.focus = pz.path[selIdx][3];
  slide.shown = slide.focus;  // a new level starts settled, with nothing to slide from
  buildScene();
  updateHUD();
  buildPad();
}

// Just the slices the rope actually lives in -- no focus, no transit. This is
// the set that changes when the puzzle changes rather than when the view moves.
function ropeSlices() {
  const set = new Set();
  for (const p of pz.path) set.add(p[viewAxes[3]]);
  return [...set].sort((a, b) => a - b);
}

// Which w-slices to draw a frame for: the focused one, plus any the rope
// actually visits. Empty slices would just be clutter.
function occupiedSlices() {
  const set = new Set([slide.focus]);
  for (const p of pz.path) set.add(p[viewAxes[3]]);
  // Also every slice the ring is currently passing through. Without this the
  // destination frame does not exist until the move lands, so there is nothing
  // to slide toward -- and worse, with only one frame drawn the ring has
  // nothing to rotate about, so that lone frame slides off-centre instead of
  // staying put while its neighbours come round.
  const lo = Math.floor(Math.min(slide.shown, slide.focus));
  const hi = Math.ceil(Math.max(slide.shown, slide.focus));
  for (let w = lo; w <= hi; w++) {
    if (w >= 0 && w < (pz.dims.length > 3 ? pz.dims[viewAxes[3]] : 1)) set.add(w);
  }
  return [...set].sort((a, b) => a - b);
}

let frameKey = '';

function buildFrames() {
  if (!frames) return;
  const slices = occupiedSlices();
  // The key exists to tell rebuildCubes when the camera needs re-aiming. Only
  // which slices the ROPE occupies matters for that; the focus and the transit
  // slices both change during a slide, and re-aiming mid-animation is what
  // turned a move off a lone cell into a jump.
  frameKey = ropeSlices().join(',');
  for (const o of [...frames.children]) {
    frames.remove(o);
    if (o.geometry) o.geometry.dispose();
  }
  const [X, Y, Z] = pz.dims;
  const centre = [X / 2 - 0.5, Y / 2 - 0.5, Z / 2 - 0.5];
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(X, Y, Z));
  for (const w of slices) {
    const focused = w === slide.focus;
    const box = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: focused ? 0x6f86a8 : 0x3d4a5e,
      transparent: !focused,
      opacity: focused ? 1 : 0.6,
    }));
    const off = sliceOffset(w);
    box.position.set(centre[0] + off[0], centre[1] + off[1], centre[2] + off[2]);
    frames.add(box);
  }

  // The blocker: a solid cube in the spare slot between the last frame and the
  // first, saying plainly that the rope cannot step from one to the other.
  //
  // It is needed whenever a frame is drawn on EITHER side of that gap, since
  // that is when the ring reads as continuous there. Requiring every w value to
  // be on screen was too strict -- with the rope near one end of w the gap sits
  // right beside an occupied frame and looks like somewhere to go.
  const depth = pz.dims.length > 3 ? pz.dims[viewAxes[3]] : 0;
  const nextToGap = depth &&
    (slices.includes(0) || slices.includes(depth - 1));
  if (nextToGap) {
    // The spare slot, one step past the last frame. Absolute, like every other
    // frame -- the ring itself no longer moves.
    const off = slotOffset(depth);
    const solid = new THREE.Mesh(
      new THREE.BoxGeometry(X, Y, Z),
      new THREE.MeshLambertMaterial({ color: 0x11151c })
    );
    solid.position.set(centre[0] + off[0], centre[1] + off[1], centre[2] + off[2]);
    frames.add(solid);
    // An edge outline, so it reads as a wall rather than a hole in the scene.
    const rim = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0x2c3646,
    }));
    rim.position.copy(solid.position);
    frames.add(rim);
  }
}

function buildScene() {
  if (gridGroup) scene.remove(gridGroup);
  gridGroup = new THREE.Group();
  // Follow the live puzzle, so a level lifted into 4D gets the right box.
  const [X, Y, Z] = pz.dims;
  const c = [X / 2, Y / 2, Z / 2];

  frames = new THREE.Group();
  gridGroup.add(frames);
  scene.add(gridGroup);
  buildFrames();

  // Frame the focused slice. The frames sit at fixed points around the ring, so
  // this has to start on whichever one has the focus -- slot 0 is only the
  // right answer when the level happens to open on w = 0.
  const start = slotOffset(slide.shown);
  const mid = [c[0] - 0.5 + start[0], c[1] - 0.5 + start[1], c[2] - 0.5 + start[2]];
  // Far enough out to be OUTSIDE the ring of frames, not among them.
  //
  // This used to be a multiple of the box alone (X * 2.4), which was fine while
  // the camera turned to face each frame -- pointing outward from the circle's
  // centre, it never mattered that the eye sat inside the circle. Now that the
  // camera holds one fixed orientation, an eye inside the ring looks straight
  // through its neighbours. So the distance is measured from the ring: far
  // enough past its edge that every frame is seen from outside it.
  const rest = Math.max(X * 2.4, ring().radius + X * 1.6);
  orbit = new Orbit(renderer.domElement, mid, rest);
  // The radius at which the puzzle just fits: the panel reads the camera's
  // zoom relative to this, so 1 means 'framed as intended'.
  orbit.restRadius = rest;
  orbit.onChange = () => {
    camera.position.set(...orbit.position());
    camera.lookAt(...orbit.target);
  };
  camera.position.set(...orbit.position());
  camera.lookAt(...orbit.target);

  rebuildCubes();
}

function rebuildCubes() {
  const before = frameKey;
  buildFrames();
  // New slices change how much space the scene occupies, so re-aim the camera.
  if (frameKey !== before) recentreOrbit();
  if (cubes) {
    for (const key of ['mesh', 'pickMesh', 'projMesh',
                       'endMesh', 'selMesh']) {
      const m = cubes[key];
      if (!m) continue;
      gridGroup.remove(m);
      m.geometry.dispose();
    }
  }
  const n = pz.path.length;
  // Cells are drawn two ways. Most of the rope gets a bare wireframe box, which
  // marks where the strand runs without stacking dozens of translucent shells
  // in front of each other -- with a long rope that haze was most of what you
  // were looking at. The cells that need to be picked out at a glance (the two
  // pinned ends and the cursor) keep the solid translucent shell.
  //
  // Both are instanced meshes over the SAME index space, so instance i means
  // cell i in either. Whichever one should not show a given cell scales that
  // instance to nothing rather than shuffling the indices, which keeps
  // painting, picking and hover all agreeing about what i means.
  const solidGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const solidMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(solidGeo, solidMat, n);
  // Draw the translucent shells after the opaque rope so they blend over it
  // rather than z-fighting it away.
  mesh.renderOrder = 2;

  // An invisible mesh is what the raycaster hits. Plain cells are not drawn at
  // all, so picking off the visible mesh would miss every one of them -- and
  // the face normal is what tells a click which direction it meant.
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickMesh = new THREE.InstancedMesh(solidGeo, pickMat, n);

  // Projections of the rope onto the three walls furthest from the resting
  // camera. Not shadows -- no light, no shadow map. The lattice is axis
  // aligned, so flattening one coordinate onto a wall is exact and costs
  // nothing: it reads as a plan and two elevations, which is what makes a
  // shape in a box legible without turning it.
  // Two meshes, because the cursor's mark has to paint OVER the rope's rather
  // than blend with it. One geometry could not do that: within a single draw
  // the triangles are not ordered, and with depthWrite off whichever happened
  // to come last would win.
  //
  // The stencil buffer is what stops the layer compounding with itself. A
  // translucent ribbon that overlaps its own geometry blends TWICE over the
  // same pixel, so every joint -- where a dot and two bar ends meet -- came out
  // brighter than the straight runs. That is the same fault additive blending
  // had, and switching to alpha did not fix it, because the cause is the
  // overlap rather than the blend mode.
  //
  // So each pixel is claimed the first time the ribbon covers it: write 1 into
  // the stencil, and only accept fragments where the stencil is still 0. The
  // second and third layers over a joint are rejected outright, and the whole
  // projection paints at an even strength however tangled the rope is.
  const projMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,   // only where nothing drawn yet
    stencilZPass: THREE.ReplaceStencilOp,     // claim the pixel
  });
  const projMesh = new THREE.Mesh(new THREE.BufferGeometry(), projMat);
  // Behind the rope and the cells, so it never veils them.
  projMesh.renderOrder = 0;

  // The cursor's mark: a solid square in the selection colour, drawn after the
  // rope's ribbon so it covers whatever passes under it.
  // The two pinned ends get a square as well, in their own yellow. Drawn after
  // the ribbon so they sit on top of it, but BEFORE the cursor's square, which
  // is what makes them lower priority: when the cursor is parked on an end,
  // the pink is what shows.
  const endMat = new THREE.MeshBasicMaterial({
    color: COL.end,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 3,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  const endMesh = new THREE.Mesh(new THREE.BufferGeometry(), endMat);
  endMesh.renderOrder = 0.25;

  // The cursor's square claims its pixels with a different reference value, so
  // it paints over the ribbon rather than being rejected by it -- and it does
  // not compound with itself either.
  const selMat = new THREE.MeshBasicMaterial({
    color: COL.sel,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 2,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  const selMesh = new THREE.Mesh(new THREE.BufferGeometry(), selMat);
  selMesh.renderOrder = 0.5;
  // The blink scales these rather than replacing them, so changing the layer's
  // weight above does not have to be mirrored in the animation.
  selMesh.userData.baseOpacity = selMat.opacity;

  cubes = { mesh, pickMesh, projMesh, endMesh, selMesh, n };
  gridGroup.add(mesh);
  gridGroup.add(pickMesh);
  gridGroup.add(projMesh);
  gridGroup.add(endMesh);
  gridGroup.add(selMesh);
  paintCubes();
  rebuildRope();
}

// ---------------------------------------------------------------------------
// The rope. Drawn as opaque tube segments between consecutive cells plus a
// sphere at each joint, so the path reads as one continuous strand even where
// it passes behind itself. A colour ramp runs end to end, which makes the
// strand easy to follow where it crosses itself. The ramp is anchored to the
// pinned ends rather than to array order, so walking backwards -- which
// reverses the stored path -- leaves the rope looking exactly the same.
// ---------------------------------------------------------------------------
let rope = null;

const ROPE_A = new THREE.Color(0x37d6a0); // low end
const ROPE_B = new THREE.Color(0xa06bff); // high end

function rebuildRope() {
  if (rope) {
    gridGroup.remove(rope.group);
    rope.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  const group = new THREE.Group();
  const n = pz.path.length;
  const TUBE = 0.115;
  // A sphere that fills the notch where two perpendicular tubes meet has to
  // reach the outer corner between them, which is r*sqrt(2) from the centre.
  // Smaller leaves a visible bite out of the bend; larger is a bead on a
  // string. This is the one radius that sits flush.
  const JOINT = TUBE * Math.SQRT2;
  const segGeo = new THREE.CylinderGeometry(TUBE, TUBE, 1, 12);
  const jointGeo = new THREE.SphereGeometry(JOINT, 14, 12);
  const up = new THREE.Vector3(0, 1, 0);

  // A joint is drawn where the tube actually needs one: at the two pinned ends
  // and either side of a step between w-slices, to cap the exposed tube; and at
  // a BEND, to fill the notch between two perpendicular segments. A cell the
  // rope runs straight through needs nothing -- the two segments are collinear
  // and meet flush, so a ball there is the lump that made the rope look beaded.
  const jointAt = new Set([0, n - 1]);
  for (let i = 0; i + 1 < n; i++) {
    if (pz.path[i][viewAxes[3]] !== pz.path[i + 1][viewAxes[3]]) {
      jointAt.add(i);
      jointAt.add(i + 1);
    }
  }
  // Bends: the step in differs from the step out.
  const stepOf = (a, b) => b.map((v, d) => v - a[d]).join(',');
  for (let i = 1; i + 1 < n; i++) {
    if (stepOf(pz.path[i - 1], pz.path[i]) !== stepOf(pz.path[i], pz.path[i + 1])) {
      jointAt.add(i);
    }
  }

  for (let i = 0; i < n; i++) {
    const col = ROPE_A.clone().lerp(ROPE_B, rampAt(pz.path, i));
    const f = wFade(pz.path[i]);
    if (jointAt.has(i)) {
      const jm = new THREE.Mesh(jointGeo, new THREE.MeshLambertMaterial({
        color: col, emissive: col, emissiveIntensity: 0.28,
        transparent: f < 1, opacity: f }));
      jm.position.set(...proj(pz.path[i]));
      group.add(jm);
    }

    if (i < n - 1) {
      const a = new THREE.Vector3(...proj(pz.path[i]));
      const b = new THREE.Vector3(...proj(pz.path[i + 1]));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a);
      const len = dir.length();
      const fs = Math.min(wFade(pz.path[i]), wFade(pz.path[i + 1]));
      const unit = dir.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, unit);

      // A step in w joins two different frames. Drawing it as rope would be a
      // lie -- it is not a length of strand lying in space, it is the same
      // strand continuing in the next slice. Draw a thin grey line instead, so
      // the continuation is visible without pretending to have substance.
      if (pz.path[i][viewAxes[3]] !== pz.path[i + 1][viewAxes[3]]) {
        const lg = new THREE.BufferGeometry().setFromPoints([a, b]);
        const lk = new THREE.Line(lg, new THREE.LineBasicMaterial({
          color: 0x9aa6b8, transparent: true, opacity: 0.55 }));
        group.add(lk);
        continue;
      }

      const sc = ROPE_A.clone().lerp(ROPE_B,
        (rampAt(pz.path, i) + rampAt(pz.path, i + 1)) / 2);
      const sm = new THREE.Mesh(segGeo, new THREE.MeshLambertMaterial({
        color: sc, emissive: sc, emissiveIntensity: 0.24,
        transparent: fs < 1, opacity: fs }));
      sm.position.copy(mid);
      sm.scale.set(1, len, 1);
      sm.quaternion.copy(q);
      group.add(sm);
    }
  }
  group.renderOrder = 1;
  rope = { group };
  gridGroup.add(group);
}

// Project a lattice point to 3D render space. In 3D this is the identity. In
// 4D the w axis is drawn as a small diagonal offset, so each w-slice sits in
// its own shifted copy of the cube -- parallel worlds you can see at once.
// ---------------------------------------------------------------------------
// Showing the 4th dimension.
//
// Each w-slice gets its own cube frame. The slice holding the selection sits in
// front; the others recede behind and to the left, spaced along a parabola so
// the near ones separate clearly and the far ones tuck in without running off
// the screen. A strand that steps in w is then visibly a rope leaving one box
// and entering the next, rather than two overlapping ghosts in one box.
// ---------------------------------------------------------------------------

// Where the frame for slice w sits, relative to the focused slice's frame.
// How the w-slice frames are laid out around the focused one. The frames sit
// on a flat circle, in w order, with the focused one nearest the camera.
//
// The circle has one more slot than the w axis is deep. That spare slot is what
// separates the last frame from the first: without it a full set of frames
// would close the ring seamlessly and w = max would sit next to w = 0, which
// reads as though the rope could step between them. A dark solid cube stands in
// the gap to say plainly that it cannot -- and if a wrapping variant ever wants
// that step, removing the blocker is all it takes.
//
// The ring layout and the slide easing live in the shared engine, so every
// game in this repository lays its fourth dimension out the same way and a
// player's sense of where they are carries between them. Unknot's w does not
// wrap, so the ring gets a spare slot with a blocker standing in it.
function ring() {
  const depth = pz.dims.length > 3 ? pz.dims[viewAxes[3]] : 1;
  return new Ring({ depth, span: Math.max(...pz.dims), wrap: false });
}

function sliceSlots() { return ring().slots; }
// Where slot `k`'s frame stands right now.
//
// The eased focus is applied here and nowhere else, so no call site can forget
// it -- and a stale one would leave a frame behind while the rest of the ring
// turned around it.
function slotOffset(k) { return ring().offset(k, slide.shown); }
function sliceOffset(w) { return slotOffset(w); }
function slotYaw(k) { return ring().yaw(k); }

function stepSlide(dt) { return slide.step(dt); }

function proj(p) {
  if (p.length < 4) return [p[0], p[1], p[2]];
  // viewAxes decides which puzzle axis is drawn where; the one in slot 3 is
  // the dimension split out into separate frames.
  const off = sliceOffset(p[viewAxes[3]]);
  return [
    p[viewAxes[0]] + off[0],
    p[viewAxes[1]] + off[1],
    p[viewAxes[2]] + off[2],
  ];
}

// How prominent a point is, given the focused w-slice.
// Slices other than the focused one are drawn slightly dimmer, so it is clear
// which frame you are working in. The frames themselves do the heavy lifting of
// separating the slices, so this only needs to be a hint.
function wFade(p) {
  if (p.length < 4) return 1;
  return p[viewAxes[3]] === slide.focus ? 1 : 0.72;
}

// Follows the live puzzle rather than the level definition, so the 4D toggle
// takes effect immediately.

// The cursor blinks, like a text caret. Slow and shallow: it should catch the
// eye when you are hunting for the selection without pulling at it while you
// are looking somewhere else. One phase drives the cell and all three of its
// wall shadows, so they pulse together.
const BLINK_PERIOD = 800;    // ms for a full cycle
// 0 for the first part of the cycle, 1 for the rest: a caret blinks, it does
// not breathe. The edge is what makes it read as a cursor rather than a glow.
// Slightly longer lit than dim, so the cursor is easier to find at a glance
// than it is to lose.
const BLINK_DUTY = 0.58;     // fraction of the cycle spent at full strength
const blinkPhase = (ms) =>
  ((ms % BLINK_PERIOD) / BLINK_PERIOD) < BLINK_DUTY ? 0 : 1;
// How far each surface swings. Shallower than a fade would need: a hard switch
// carries itself, and going much further makes the cursor flicker rather than
// blink. The wall shadow still swings further than the cell, since the same
// fraction of a 10% wash is a smaller change than of a solid shell.
const BLINK_CELL = 0.22;
const BLINK_SHADOW = 0.5;

// A cell centre sits on an integer, and the box's face is half a cell beyond
// the outermost one; the nudge pulls the quad just inside so it does not
// z-fight the frame's own edge lines.
// How far a projection sits inside its wall: just enough to win the depth test
// against the frame's own edge lines, and no more. This is a nudge, not an
// inset -- half a cell would leave the marks visibly floating in the room.
const WALL_NUDGE = 0.004;

// Which walls of a frame the camera can see the inside of, as {axis, at} in
// that frame's own coordinates.
//
// A wall faces the viewer from inside whenever the eye is on the interior side
// of it -- so the low wall on an axis shows while the eye is above its
// coordinate, and the high wall while the eye is below. Looking squarely into a
// corner shows three; from a typical angle four; from low down, where floor and
// ceiling are both edge-on to nothing, five. The count changes as the camera
// rocks, which is the point: the projections stay on whatever the player can
// actually see into.
// Which walls are showing, across every frame on screen, as a short string. The
// rock moves the camera every frame but crosses a wall's plane only now and
// then, so this is what decides whether the projections need rebuilding.
//
// Every frame has to be included: they sit at different points around the ring,
// so the camera can be inside one frame's x range and outside another's, and
// the sets genuinely differ from frame to frame.
let wallKey = '';
function wallSetKey() {
  if (!orbit) return '';
  const eye = orbit.position();
  let k = '';
  for (const w of occupiedSlices()) {
    const off = sliceOffset(w);
    for (let d = 0; d < 3; d++) {
      k += (eye[d] > off[d] - 0.5 ? '1' : '0');
      k += (eye[d] < off[d] + pz.dims[d] - 0.5 ? '1' : '0');
    }
  }
  return k;
}

function visibleWalls(off) {
  if (!orbit) return [];
  const eye = orbit.position();
  const out = [];
  for (let d = 0; d < 3; d++) {
    const lo = off[d] - 0.5, hi = off[d] + pz.dims[d] - 0.5;
    if (eye[d] > lo) out.push({ axis: d, at: lo + WALL_NUDGE });
    if (eye[d] < hi) out.push({ axis: d, at: hi - WALL_NUDGE });
  }
  return out;
}
// Half-width of the projected ribbon. Roughly the rope's own radius, so the
// mark on the wall reads as the same strand rather than a smear.
const PROJ_W = 0.13;

// A rectangle on a wall, spanning from `p0` to `p1` and `h` wide either side.
// Both points are flattened onto the wall first, so the result is the shadow
// the segment between them would cast straight onto it. `at` is in world
// space, with the 4D slice offset already baked in.
//
// A segment that runs perpendicular to the wall flattens to a point: there is
// nothing to draw, and the joint squares at each end cover that spot anyway.
function wallBar(p0, p1, axis, at, h) {
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  const A = [p0[a], p0[b]], B = [p1[a], p1[b]];
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [];
  dx /= len; dy /= len;
  // Normal to the run, in the wall's own two axes.
  const nx = -dy * h, ny = dx * h;
  const corner = (P, sx, sy) => {
    const v = [0, 0, 0];
    v[axis] = at;
    v[a] = P[0] + sx;
    v[b] = P[1] + sy;
    return v;
  };
  const c0 = corner(A, nx, ny), c1 = corner(A, -nx, -ny);
  const c2 = corner(B, -nx, -ny), c3 = corner(B, nx, ny);
  return [c0, c1, c2, c0, c2, c3];   // 6 points = 2 triangles
}

// A small square on a wall, to round off a joint where two bars meet.
function wallDot(p, axis, at, h) {
  const q = [];
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  for (const [da, db] of [[-h, -h], [h, -h], [h, h], [-h, -h], [h, h], [-h, h]]) {
    const v = [0, 0, 0];
    v[axis] = at;
    v[a] = p[a] + da;
    v[b] = p[b] + db;
    q.push(v);
  }
  return q;   // 6 points = 2 triangles
}

const COL = {
  end:   new THREE.Color(0xffd166),
  body:  new THREE.Color(0x7fb0d8),
  hover: new THREE.Color(0xa8ffd8),
  // The cell itself no longer uses this -- being solid among wireframes is
  // what marks the cursor -- but its projection does, so the three marks on
  // the walls say where along each axis the cursor is sitting. Cyan keeps it
  // clear of the yellow ends and of the rope's own green-to-purple ramp.
  sel:   new THREE.Color(0x35e3f0),
};

function paintCubes() {
  const m = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const n = pz.path.length;
  const pv = [], pc = [];
  const sv = [], ev = [];
  for (let i = 0; i < n; i++) {
    const p = proj(pz.path[i]);
    m.makeTranslation(p[0], p[1], p[2]);

    // Only the cells worth calling out get a shell: the two pinned ends, the
    // cursor, and whatever is under the pointer. The plain run of rope between
    // them is drawn as rope alone -- no box around it, so nothing competes
    // with the strand for attention.
    const isEnd = i === 0 || i === n - 1;
    const solid = isEnd || i === selIdx || i === hoverIdx;

    // The cursor keeps the ordinary cell colour: having a shell at all is what
    // picks it out, so it needs no colour of its own.
    let c = COL.body;
    if (isEnd) c = COL.end;
    if (i === hoverIdx) c = COL.hover;

    const f = wFade(pz.path[i]);
    const col = f < 1 ? c.clone().multiplyScalar(f) : c;

    cubes.mesh.setMatrixAt(i, solid ? m : hidden);
    cubes.mesh.setColorAt(i, col);
    // Stash the cursor's unblinked colour: applyBlink scales this every frame,
    // so it needs the value paintCubes settled on rather than whatever the
    // instance buffer happens to hold mid-pulse.
    if (i === selIdx) cubes.mesh.userData.selColour = col.clone();
    // The pick mesh is invisible, so every cell stays hittable either way.
    cubes.pickMesh.setMatrixAt(i, m);

    // Flatten onto each far wall as a rope-shaped ribbon rather than a block:
    // a bar along each segment, and a dot at each joint so corners are round
    // instead of notched.
    const cell = pz.path[i];
    const off = sliceOffset(cell.length > 3 ? cell[viewAxes[3]] : 0);
    // The next cell, if it shares this slice -- a step in w is not a length of
    // rope lying in the box, so it casts nothing.
    const nxt = i + 1 < n ? pz.path[i + 1] : null;
    const sameSlice = nxt && (cell.length < 4 ||
      cell[viewAxes[3]] === nxt[viewAxes[3]]);
    const q = nxt ? proj(nxt) : null;
    // The ribbon is the ROPE's shadow, so it uses the body colour the whole way
    // along -- including at the two ends, whose cells are yellow. Taking `col`
    // here tinted the first and last segments yellow, and since a bar runs a
    // full cell while the end's own square is a fraction of one, the tint
    // showed as a yellow rope-shaped tail poking out from under the square.
    //
    // Full strength: the fade is the material's 10% opacity, and dimming the
    // colour here as well would compound the two. `f` still applies, since that
    // is the 4D slice fade rather than part of the shadow's own weight.
    const pcol = COL.body.clone().multiplyScalar(f);

    for (const { axis, at } of visibleWalls(off)) {
      const push = (v) => { pv.push(v[0], v[1], v[2]); pc.push(pcol.r, pcol.g, pcol.b); };
      for (const v of wallDot(p, axis, at, PROJ_W)) push(v);
      if (sameSlice) for (const v of wallBar(p, q, axis, at, PROJ_W)) push(v);

      // The cursor and the two pinned ends also get a full square, each on its
      // own mesh so it paints over the ribbon instead of blending into it -- a
      // clear marker on each wall saying where along that axis they sit.
      if (i === selIdx) {
        for (const v of wallDot(p, axis, at, 0.42)) sv.push(v[0], v[1], v[2]);
      }
      if (isEnd) {
        for (const v of wallDot(p, axis, at, 0.42)) ev.push(v[0], v[1], v[2]);
      }
    }
  }
  for (const key of ['mesh', 'pickMesh']) {
    const mesh = cubes[key];
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // Replace the wall-projection buffers. paintCubes runs on every hover, so the
  // old geometry is disposed rather than left for the GPU to hold on to.
  const pg = cubes.projMesh.geometry;
  pg.dispose();
  const pNext = new THREE.BufferGeometry();
  pNext.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3));
  pNext.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
  pNext.computeBoundingSphere();
  cubes.projMesh.geometry = pNext;

  for (const [key, data] of [['endMesh', ev], ['selMesh', sv]]) {
    cubes[key].geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(data, 3));
    g.computeBoundingSphere();
    cubes[key].geometry = g;
  }
}

function updateHUD() {
  el('level').textContent = level.name;
  el('blurb').textContent = level.blurb;
  el('status').textContent = pz.solved ? 'SOLVED' : '';
  el('status').className = pz.solved ? 'solved' : '';
}

// How the panel's yaw relates to the main camera's azimuth.
//
// The two projections were written independently and do not share a
// convention, so the relation is checked in test/orbit.js by comparing where a
// world point lands in each: ang = pi/2 - az, verified across a full turn.
// The negated az means the panel's yaw sweeps OPPOSITE to the camera's, which
// is why the rock offset is handed over with rockSign = -1. Tilt needs no such
// correction -- both grow as the view rises.
const YAW_PHASE = Math.PI / 2;
const panelYaw = (az) => YAW_PHASE - az;

// Feed the minimap the current state. It projects independently of the main
// camera, so it needs the puzzle rather than anything from the scene graph.
function syncMinimap() {
  if (!minimap) return;
  minimap.path = pz.path;
  // Any change to the rope, the level or the 4D view rescales the panel.
  minimap.stamp = `${pz.length}/${pz.path.length}/${viewAxes.join(',')}/${slide.focus}`;
  minimap.dims = pz.dims;
  minimap.sel = selIdx;
  minimap.sliceOf = (p) => (p.length > 3 ? p[viewAxes[3]] : 0);
  minimap.sliceOffset = (w) => sliceOffset(w);
  // Which steps hop between w-slices; those are drawn as faint links, not rope.
  // Points the smoothing must not move: the selection, so the dot stays on the
  // rope, and either side of a slice hop, so the frames stay separated.
  minimap.keep = () => {
    const out = [];
    if (selIdx >= 0) out.push(selIdx);
    for (let k = 0; k + 1 < pz.path.length; k++) {
      if (pz.path[k][viewAxes[3]] !== pz.path[k + 1][viewAxes[3]]) {
        out.push(k, k + 1);
      }
    }
    return out;
  };
  minimap.crossesSlice = (k) => {
    if (k < 0 || k + 1 >= pz.path.length) return false;
    return pz.path[k][viewAxes[3]] !== pz.path[k + 1][viewAxes[3]];
  };
}

// Pulse the selection. The wall square rides on material opacity; the cell
// itself is one instance in a shared mesh, so it rides on instance colour --
// there is no per-instance opacity to reach for.
function applyBlink(ms) {
  if (!cubes) return;
  const sel = cubes.selMesh;
  if (selIdx < 0) {
    // Nothing selected: leave the material at rest rather than frozen wherever
    // the last pulse happened to stop, so the next selection starts clean.
    sel.material.opacity = sel.userData.baseOpacity;
    return;
  }
  const phase = blinkPhase(ms);

  sel.material.opacity = sel.userData.baseOpacity * (1 - BLINK_SHADOW * phase);

  const cellCol = cubes.mesh.userData.selColour;
  if (cellCol) {
    cubes.mesh.setColorAt(selIdx,
      cellCol.clone().multiplyScalar(1 - BLINK_CELL * phase));
    cubes.mesh.instanceColor.needsUpdate = true;
  }
}

let lastFrameAt = 0;

function render(now) {
  const t = now || performance.now();
  // Seconds since the last frame, clamped so a backgrounded tab returning does
  // not jump the slide to its end in one step.
  const dt = lastFrameAt ? Math.min((t - lastFrameAt) / 1000, 0.1) : 0;
  lastFrameAt = t;

  // Slide between slice frames rather than cutting. The frames' positions are
  // measured from slide.shown, so easing that toward slide.focus carries the whole ring
  // around smoothly -- and since the focused frame is always the one at the
  // origin, the camera stays put while the ring turns beneath it.
  if (dt && stepSlide(dt)) {
    buildFrames();
    paintCubes();
    rebuildRope();
  }
  // The frames stand still; the camera is what moves. Aim it at the point on
  // the ring the eased focus has reached. This runs EVERY frame, not just while
  // the slide is stepping: a move sets slide.focus and rebuilds the cells at their
  // new absolute positions straight away, so if the camera only caught up
  // inside the stepping branch it would sit on the old frame while the data
  // jumped to the new one -- the rope teleporting past a static camera.
  aimAtFocus();
  // One rock, two views. The camera swings around wherever the player has
  // pointed it, and the panel is told to centre on the same place, so the two
  // never disagree about which face of the puzzle is showing.
  if (orbit) {
    const r = rockAt(t - t0);
    orbit.rock(r.yaw, r.tilt);
    if (minimap) {
      // Hand the panel the camera's angles, mapped into its convention. It
      // adds the same rock itself from the same clock, so the two stay in
      // phase without either owning the other's animation.
      // rockYaw is not included: the panel re-creates the rock itself from the
      // shared clock. There is nothing else to add -- the camera no longer
      // turns as the focus moves round the ring, so its azimuth is simply
      // wherever the player has aimed it.
      minimap.baseYaw = panelYaw(orbit.az);
      minimap.baseTilt = orbit.el_;
      minimap.rockSign = -1;   // panel yaw runs opposite the camera's
      minimap.t0Override = t0; // one clock, so the two swings stay in phase
      // Zoom, as a ratio of the resting frame. Closer camera -> larger number.
      // The panel clamps this so the puzzle can never leave its frame.
      minimap.zoom = orbit.restRadius ? orbit.restRadius / orbit.radius : 1;
    }
  }
  // The rock swings the camera past a wall's plane now and then, which changes
  // which walls it can see into. Repaint when that happens -- not every frame,
  // since rebuilding the projection buffers is not free.
  if (cubes) {
    const k = wallSetKey();
    if (k !== wallKey) { wallKey = k; paintCubes(); }
  }

  // Blink the cursor: its cell and all three of its wall shadows, together.
  applyBlink(t - t0);

  renderer.render(scene, camera);
  if (minimap) { syncMinimap(); minimap.draw(t); }
}

// ---------------------------------------------------------------------------
// Input.
//
// Clicking a FACE of a cube moves that vertex in the direction the face points.
// The face you click is the direction you mean -- no drag vector to interpret,
// and the affordance ghosts already show which faces will do something.
//
// The 4th dimension has no face to click (it points nowhere on screen), so w
// moves are the one gesture that is a drag: drag up/down on a cube to slide it
// along w.
//
// Dragging the background orbits. Double-clicking pulls slack back in.
// ---------------------------------------------------------------------------

function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(cubes.pickMesh, false)[0];
  if (!hit) return null;
  // The instance is axis-aligned and unrotated, so the local face normal is
  // already the lattice direction.
  const n = hit.face ? hit.face.normal : null;
  let dir = null;
  if (n) {
    const D = pz.dims.length;
    dir = Array(D).fill(0);
    const ax = Math.abs(n.x) > Math.abs(n.y)
      ? (Math.abs(n.x) > Math.abs(n.z) ? 0 : 2)
      : (Math.abs(n.y) > Math.abs(n.z) ? 1 : 2);
    dir[ax] = Math.sign([n.x, n.y, n.z][ax]);
  }
  return { idx: hit.instanceId, dir };
}

function pickIndex(ev) {
  const p = pick(ev);
  return p ? p.idx : -1;
}

function snapshot(path, sel) {
  history.push({
    path: (path || pz.path).map((p) => p.slice()),
    sel: sel === undefined ? selIdx : sel,
  });
  if (history.length > 200) history.shift();
}

// ---------------------------------------------------------------------------
// The direction pad.
//
// Sculpting is: select a cell, name a direction. The rope goes that way and the
// selection follows, so you can walk along the strand shaping it as you go.
// Which of the three moves happens -- remove a detour, offset a corner, add a
// detour -- is decided by what is legal there (see planPush).
//
// Axis 0 is east/west, 1 is up/down, 2 is north/south, 3 is the 4th dimension.
// ---------------------------------------------------------------------------

const PAD = [
  { key: 'ArrowUp',    label: '\u2191', name: 'north', axis: 2, sign: -1 },
  { key: 'ArrowDown',  label: '\u2193', name: 'south', axis: 2, sign:  1 },
  { key: 'ArrowLeft',  label: '\u2190', name: 'west',  axis: 0, sign: -1 },
  { key: 'ArrowRight', label: '\u2192', name: 'east',  axis: 0, sign:  1 },
  { key: 'w', label: 'W', name: 'up',   axis: 1, sign:  1 },
  { key: 's', label: 'S', name: 'down', axis: 1, sign: -1 },
  // The slice ring runs left to right in w order, so A steps to the frame on
  // the left and D to the one on the right -- matching where they sit on the
  // keyboard, and where the frames sit on screen.
  { key: 'a', label: 'A', name: 'w back', axis: 3, sign: -1 },
  { key: 'd', label: 'D', name: 'w fwd',  axis: 3, sign:  1 },
];

const KEYMAP = {};
for (const b of PAD) {
  KEYMAP[b.key] = b;
  if (b.key.length === 1) KEYMAP[b.key.toUpperCase()] = b;
}

function dirVec(axis, sign) {
  const v = Array(pz.dims.length).fill(0);
  if (axis < v.length) v[axis] = sign;
  return v;
}

// The sharp slice is whichever one the selected cell lives in, so the player is
// always looking at the part of the space they are working in.
function syncFocus() {
  if (selIdx < 0 || selIdx >= pz.path.length) return;
  const w = pz.path[selIdx][viewAxes[3]];
  if (w !== slide.focus) {
    slide.focus = w;
    return true;
  }
  return false;
}

function select(i) {
  selIdx = i;
  if (syncFocus()) rebuildCubes();
  paintCubes();
  updatePad();
}

function undo() {
  if (!history.length) return;
  const prev = history.pop();
  pz = new Puzzle(pz.dims, prev.path);
  selIdx = Math.min(prev.sel, pz.path.length - 1);
  syncFocus();
  rebuildCubes();
  updateHUD();
  updatePad();
}

function push(axis, sign) {
  if (selIdx < 0) return;
  if (axis >= pz.dims.length) return;   // no 4th dimension on a 3D level
  const dir = dirVec(axis, sign);

  // Travelling along the rope only moves the cursor, so there is no geometry to
  // rebuild -- but stepping BACKWARDS also turns the rope around. Sculpting
  // always works forwards from the cursor, so walking back down the strand and
  // having it face the way you are now heading is what you want every time; it
  // saves a separate reverse control.
  const plan = planPush(pz, selIdx, dir);
  if (plan && plan.kind === 'advance') {
    const back = plan.at < selIdx;
    if (back) snapshot();
    selIdx = back ? reversePath(pz, plan.at) : plan.at;
    // Reversing renumbers every cell, so the cubes carry stale indices.
    //
    // syncFocus() must run whichever branch we are on: `back || syncFocus()`
    // short-circuits, so stepping backwards skipped it entirely and the focus
    // stayed on the slice the cursor had left. Nothing then had a reason to
    // move the camera, and the next move that did change focus started from a
    // stale position and jumped.
    const moved = syncFocus();
    if (back || moved) rebuildCubes();
    else paintCubes();
    updateHUD();
    updatePad();
    flashPad(axis, sign, true);
    return;
  }

  const before = pz.path.map((p) => p.slice());
  const beforeSel = selIdx;
  // A w move must never slide the whole rope to make room: the slices are
  // separate frames on the ring, so that reads as the rope jumping between
  // frames for no reason the player can see. Refuse instead.
  const next = pushWithRoom(pz, selIdx, dir, axis !== viewAxes[3]);
  if (next < 0) { flashPad(axis, sign, false); return; }
  snapshot(before, beforeSel);
  selIdx = next;
  syncFocus();
  rebuildCubes();
  updateHUD();
  updatePad();
  flashPad(axis, sign, true);
}

// ---------------------------------------------------------------------------
// 4D view rotation.
//
// Shift + a direction rotates which 3D slice of the 4D space you are looking
// at. The rope is untouched -- this only changes how its four coordinates are
// mapped onto the three axes you can see, like turning a 4D object to catch a
// different cross-section. Needs a symmetric box, which the 4D level has.
// ---------------------------------------------------------------------------

// Centre the orbit target on the rope's projected bounding box, so a view
// rotation leaves the puzzle in front of the camera instead of off-screen.
// Point the camera at the frame the slide has reached. Separate from
// recentreOrbit because this runs every animated frame, and must not touch the
// zoom the player has dialled in.
function aimAtFocus() {
  if (!orbit) return;
  const [X, Y, Z] = pz.dims;
  const off = slotOffset(slide.shown);
  orbit.target = [X / 2 - 0.5 + off[0], Y / 2 - 0.5 + off[1], Z / 2 - 0.5 + off[2]];
  // The camera does not move: the RING turns instead, bringing the focused
  // frame round to the near point where the camera already is. So the slice
  // being worked in is always in the same place on screen, at the same
  // distance, whatever w it happens to be -- and the view the player dialled in
  // survives every move along the fourth dimension.
  //
  // slotOffset(slide.shown) is the near point by construction, so the target
  // below is constant; it is written out rather than hard-coded so a change to
  // the ring's geometry carries the camera with it.
  orbit.onChange();
}

function recentreOrbit() {
  if (!orbit) return;
  const [X, Y, Z] = pz.dims;
  // Frame the slice being worked in, and nothing else.
  //
  // The frames sit at fixed points on the ring and the camera travels to the
  // one in focus, so re-aiming is just a matter of reading off where the eased
  // focus has got to. Fitting the bounding box of every slice, as this once
  // did, made the camera lurch: the box's centre swung about 35 units from one
  // focus to the next and its radius changed by half again.
  // The target belongs to aimAtFocus, which runs every frame from the render
  // loop. Setting it here too would aim at wherever slide.shown happened to be when
  // the puzzle changed -- the frame just left, not the one being moved to.
  // Keep whatever zoom the player has dialled in; only set it the first time.
  if (!orbit.restRadius) {
    orbit.restRadius = Math.max(X * 2.4, ring().radius + X * 1.6);
    orbit.radius = orbit.restRadius;
    orbit.maxR = orbit.restRadius * 3;
  }
  orbit.onChange();
}

function rotateView(axis, sign) {
  // Swap the named visible axis with the hidden one, so the 4th dimension
  // rotates into view along the direction the player asked for.
  const visible = axis < 3 ? axis : 2;
  const i = viewAxes.indexOf(visible);
  const h = 3;                       // render slot 3 is the axis not drawn
  const t = viewAxes[i];
  viewAxes[i] = viewAxes[h];
  viewAxes[h] = t;
  syncFocus();
  // A view rotation swaps which axis w even IS, so sliding between the old and
  // new focus would be interpolating between two unrelated numbers. Snap.
  slide.shown = slide.focus;
  void sign;
  rebuildCubes();
  recentreOrbit();
  updateHUD();
  updatePad();
}

// ---------------------------------------------------------------------------
// Pad rendering
// ---------------------------------------------------------------------------

function buildPad() {
  const host = el('pad');
  host.innerHTML = '';
  for (const b of PAD) {
    const btn = document.createElement('button');
    btn.className = 'padbtn ax' + b.axis;
    btn.dataset.axis = b.axis;
    btn.dataset.sign = b.sign;
    btn.innerHTML = `<span class="glyph">${b.label}</span><span class="nm">${b.name}</span>`;
    btn.title = `${b.name} (${b.key})`;
    btn.addEventListener('click', (ev) => {
      if (ev.shiftKey) rotateView(b.axis, b.sign);
      else push(b.axis, b.sign);
    });
    host.appendChild(btn);
  }
  updatePad();
}

// Grey out directions that would do nothing, so the pad shows what is possible.
function updatePad() {
  const host = el('pad');
  if (!host.children.length) return;
  [...host.children].forEach((btn, k) => {
    const b = PAD[k];
    let live = selIdx >= 0 && b.axis < pz.dims.length;
    if (live) {
      const probe = new Puzzle(pz.dims, pz.path);
      live = planPush(probe, selIdx, dirVec(b.axis, b.sign)) !== null;
    }
    btn.classList.toggle('dead', !live);
  });
}

function flashPad(axis, sign, good) {
  const host = el('pad');
  const k = PAD.findIndex((b) => b.axis === axis && b.sign === sign);
  const btn = host.children[k];
  if (!btn) return;
  btn.classList.remove('hit', 'miss');
  void btn.offsetWidth;              // restart the animation
  btn.classList.add(good ? 'hit' : 'miss');
}

function bindInput() {
  const c = renderer.domElement;
  let down = null;

  // Clicking selects a cell. That is all pointer input does to the rope --
  // every edit goes through the direction pad, where the move is named
  // explicitly rather than inferred from which face you managed to hit.
  c.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    down = { x: ev.clientX, y: ev.clientY, lastX: ev.clientX, lastY: ev.clientY,
             idx: pickIndex(ev), moved: false };
    c.setPointerCapture(ev.pointerId);
  });

  c.addEventListener('pointermove', (ev) => {
    if (!down) {
      const i = pickIndex(ev);
      if (i !== hoverIdx) { hoverIdx = i; paintCubes(); }
      return;
    }
    const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 4) down.moved = true;
    if (!down.moved) return;
    orbit.rotate(ev.clientX - down.lastX, ev.clientY - down.lastY);
    down.lastX = ev.clientX;
    down.lastY = ev.clientY;
  });

  const release = (ev) => {
    if (!down) return;
    try { c.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (!down.moved && down.idx >= 0) select(down.idx);
    down = null;
  };
  c.addEventListener('pointerup', release);
  c.addEventListener('pointercancel', () => { down = null; });

  c.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    orbit.zoom(ev.deltaY);
  }, { passive: false });

  addEventListener('keydown', (ev) => {
    if (ev.key === 'z' && (ev.ctrlKey || ev.metaKey)) { undo(); return; }
    // R is not bound. Resetting the level lives in the pause menu and on the
    // Reset button, both of which take a deliberate act -- unlike a bare key
    // sitting beside the ones used to play.
    if (pause && pause.open) return;

    const hit = KEYMAP[ev.key];
    if (!hit) return;
    ev.preventDefault();
    // Shift turns a direction into a 4D view rotation instead of a push.
    if (ev.shiftKey) rotateView(hit.axis, hit.sign);
    else push(hit.axis, hit.sign);
  });

  el('levels').addEventListener('change', (e) => loadLevel(+e.target.value));

  // Escape opens the shared pause menu. Unknot has no clock to stop, so
  // "restart" here means starting the current level over.
  pause = new PauseMenu({ onRestart: () => loadLevel(LEVELS.indexOf(level)) });
  el('reset').addEventListener('click', () => loadLevel(LEVELS.indexOf(level)));
}

for (let i = 0; i < LEVELS.length; i++) {
  const o = document.createElement('option');
  o.value = i; o.textContent = LEVELS[i].name;
  el('levels').appendChild(o);
}

init();

// Handle for inspection from the console.
window.__unknot = {
  get scene() { return scene; },
  get orbit() { return orbit; },
  get cubes() { return cubes; },
  get pz() { return pz; },
  get camera() { return camera; },
  THREE,
};
