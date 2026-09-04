import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { Puzzle, planPush, pushWithRoom, reversePath } from './knot.js';
import { Orbit } from './orbit.js';
import { LEVELS } from './levels.js';
import { arcDeterminant } from './invariant.js';
import { Minimap } from './minimap.js';

let scene, camera, renderer, raycaster, orbit;
let pz, level, history, cubes, gridGroup, hoverIdx = -1, selIdx = -1;
// viewAxes[k] says which puzzle axis is drawn along render axis k. Slot 3 is
// the dimension not directly drawn.
let viewAxes = [0, 1, 2, 3];
let frames = null;
let minimap = null;

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
  pz = new Puzzle(level.dims, level.path);
  history = [];
  viewAxes = [0, 1, 2, 3];
  // Start with the first cell selected so the pad is immediately usable.
  selIdx = 0;
  buildScene();
  updateHUD();
  buildPad();
  sync4DToggle();
}

// Which w-slices to draw a frame for: the focused one, plus any the rope
// actually visits. Empty slices would just be clutter.
function occupiedSlices() {
  if (!is4D()) return [0];
  const set = new Set([wFocus]);
  for (const p of pz.path) set.add(p[viewAxes[3]]);
  return [...set].sort((a, b) => a - b);
}

let frameKey = '';

function buildFrames() {
  if (!frames) return;
  frameKey = occupiedSlices().join(',') + '|' + wFocus;
  for (const o of [...frames.children]) {
    frames.remove(o);
    if (o.geometry) o.geometry.dispose();
  }
  const [X, Y, Z] = pz.dims;
  const centre = [X / 2 - 0.5, Y / 2 - 0.5, Z / 2 - 0.5];
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(X, Y, Z));
  for (const w of occupiedSlices()) {
    const focused = w === wFocus;
    const box = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: focused ? 0x6f86a8 : 0x3d4a5e,
      transparent: !focused,
      opacity: focused ? 1 : 0.6,
    }));
    const off = sliceOffset(w);
    box.position.set(centre[0] + off[0], centre[1] + off[1], centre[2] + off[2]);
    frames.add(box);
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

  // Frame everything that is drawn, which in 4D is a spread of slice boxes
  // rather than a single cube.
  const slices = occupiedSlices();
  const offs = slices.map(sliceOffset);
  const lo = [0, 1, 2].map((d) => Math.min(...offs.map((o) => o[d])));
  const hi = [0, 1, 2].map((d) => Math.max(...offs.map((o) => o[d])));
  const mid = [0, 1, 2].map((d) => c[d] - 0.5 + (lo[d] + hi[d]) / 2);
  const spread = Math.max(...[0, 1, 2].map((d) => hi[d] - lo[d]));
  orbit = new Orbit(renderer.domElement, mid, (X + spread) * 1.8);
  // In 4D the frames recede along the ground, so drop the eyeline: from low
  // down they read as boxes standing on a shared surface rather than a stack
  // climbing away into the distance.
  if (is4D()) orbit.el_ = Math.PI * 0.10;
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
    gridGroup.remove(cubes.mesh);
    cubes.mesh.geometry.dispose();
  }
  const n = pz.path.length;
  // Cells are translucent shells: they show WHERE the rope may sit without
  // hiding the rope threaded through them.
  const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  // Draw the translucent shells after the opaque rope so they blend over it
  // rather than z-fighting it away.
  mesh.renderOrder = 2;
  cubes = { mesh, n };
  gridGroup.add(mesh);
  paintCubes();
  rebuildRope();
}

// ---------------------------------------------------------------------------
// The rope. Drawn as opaque tube segments between consecutive cells plus a
// sphere at each joint, so the path reads as one continuous strand even where
// it passes behind itself. Direction is shown by a colour ramp from the start
// end to the finish end -- no legend needed, the gradient IS the arrow.
// ---------------------------------------------------------------------------
let rope = null;

const ROPE_A = new THREE.Color(0x37d6a0); // start
const ROPE_B = new THREE.Color(0xa06bff); // end

function rebuildRope() {
  if (rope) {
    gridGroup.remove(rope.group);
    rope.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  const group = new THREE.Group();
  const n = pz.path.length;
  const segGeo = new THREE.CylinderGeometry(0.115, 0.115, 1, 12);
  const jointGeo = new THREE.SphereGeometry(0.155, 14, 12);
  // A solid cone on every segment shows the direction of travel. Real geometry
  // rather than a wrapped texture, so it reads from any viewing angle instead
  // of vanishing when the cylinder turns it edge-on.
  const headGeo = new THREE.ConeGeometry(0.235, 0.6, 16);
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const col = ROPE_A.clone().lerp(ROPE_B, t);
    const f = wFade(pz.path[i]);
    const jm = new THREE.Mesh(jointGeo, new THREE.MeshLambertMaterial({
      color: col, emissive: col, emissiveIntensity: 0.28,
      transparent: f < 1, opacity: f }));
    jm.position.set(...proj(pz.path[i]));
    group.add(jm);

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
      if (is4D() && pz.path[i][viewAxes[3]] !== pz.path[i + 1][viewAxes[3]]) {
        const lg = new THREE.BufferGeometry().setFromPoints([a, b]);
        const lk = new THREE.Line(lg, new THREE.LineBasicMaterial({
          color: 0x9aa6b8, transparent: true, opacity: 0.55 }));
        group.add(lk);
        continue;
      }

      const sm = new THREE.Mesh(segGeo, new THREE.MeshLambertMaterial({
        color: col, emissive: col, emissiveIntensity: 0.24,
        transparent: fs < 1, opacity: fs }));
      sm.position.copy(mid);
      sm.scale.set(1, len, 1);
      sm.quaternion.copy(q);
      group.add(sm);

      // The cone's own axis is +y, and q maps +y onto the direction of travel,
      // so it points from this cell toward the next one.
      const hm = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35,
        transparent: fs < 1, opacity: fs }));
      hm.position.copy(mid);
      hm.quaternion.copy(q);
      group.add(hm);
    }
  }
  group.renderOrder = 1;
  rope = { group };
  gridGroup.add(group);
}

// Which w-slice is in focus (4D levels only).
let wFocus = 0;

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
function sliceOffset(w) {
  const k = w - wFocus;
  if (k === 0) return [0, 0, 0];
  const span = Math.max(...pz.dims);
  const s = Math.sign(k), n = Math.abs(k);
  // Back and to the left along the ground: every frame sits on the same
  // surface, so the stack reads as boxes standing on a countertop rather than
  // drifting off into space. The extra quadratic term opens the gaps up as the
  // slices recede, which keeps the near ones distinct and stops the far ones
  // from piling up in the distance.
  const step = n * span * 1.18 + n * n * span * 0.10;
  // Recede away from where the camera starts (the +x/+z corner), so later
  // slices sit behind the focused one on the same surface rather than beside
  // it or in front of it.
  return [-s * step * 0.95, 0, -s * step * 0.55];
}

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
  return p[viewAxes[3]] === wFocus ? 1 : 0.72;
}

// Follows the live puzzle rather than the level definition, so the 4D toggle
// takes effect immediately.
const is4D = () => pz.dims.length === 4;

const COL = {
  end:   new THREE.Color(0xffd166),
  body:  new THREE.Color(0x7fb0d8),
  sel:   new THREE.Color(0xff5d8f),
  hover: new THREE.Color(0xa8ffd8),
};

function paintCubes() {
  const m = new THREE.Matrix4();
  const n = pz.path.length;
  for (let i = 0; i < n; i++) {
    const p = proj(pz.path[i]);
    m.makeTranslation(p[0], p[1], p[2]);
    cubes.mesh.setMatrixAt(i, m);
    let c = COL.body;
    if (i === 0 || i === n - 1) c = COL.end;
    if (i === hoverIdx) c = COL.hover;
    if (i === selIdx) c = COL.sel;
    const f = wFade(pz.path[i]);
    cubes.mesh.setColorAt(i, f < 1 ? c.clone().multiplyScalar(f) : c);
  }
  cubes.mesh.instanceMatrix.needsUpdate = true;
  if (cubes.mesh.instanceColor) cubes.mesh.instanceColor.needsUpdate = true;
}

function updateHUD() {
  document.body.classList.toggle('four-d', is4D());
  el('level').textContent = level.name;
  el('blurb').textContent = level.blurb;
  el('len').textContent = pz.length;
  el('target').textContent = pz.target;
  // The determinant is recomputed from the live path, so the player can watch
  // it stay put no matter what they do -- that invariance IS the lesson.
  // The determinant is a 3D invariant. In 4D every knot comes undone, so the
  // number would be both wrong to compute and beside the point.
  if (is4D()) {
    el('det').textContent = '—';
    el('det').className = '';
    el('detRow').title = 'Knots do not exist in 4D';
  } else {
    const det = arcDeterminant(pz.path, Math.max(...pz.dims));
    el('det').textContent = det;
    el('det').className = det === 1 ? 'ok' : 'stuck';
  }
  el('status').textContent = pz.solved ? 'SOLVED' : '';
  el('status').className = pz.solved ? 'solved' : '';
}

// Feed the minimap the current state. It projects independently of the main
// camera, so it needs the puzzle rather than anything from the scene graph.
function syncMinimap() {
  if (!minimap) return;
  minimap.path = pz.path;
  minimap.dims = pz.dims;
  minimap.sel = selIdx;
  minimap.sliceOf = (p) => (p.length > 3 ? p[viewAxes[3]] : 0);
  minimap.sliceOffset = (w) => (is4D() ? sliceOffset(w) : [0, 0, 0]);
}

function render(now) {
  renderer.render(scene, camera);
  if (minimap) { syncMinimap(); minimap.draw(now || performance.now()); }
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
  const hit = raycaster.intersectObject(cubes.mesh, false)[0];
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

function snapshot() {
  history.push(pz.path.map((p) => p.slice()));
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
  { key: 'a', label: 'A', name: 'out',  axis: 3, sign:  1 },
  { key: 'd', label: 'D', name: 'in',   axis: 3, sign: -1 },
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
  if (!is4D() || selIdx < 0 || selIdx >= pz.path.length) return;
  const w = pz.path[selIdx][viewAxes[3]];
  if (w !== wFocus) { wFocus = w; return true; }
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
  pz = new Puzzle(pz.dims, history.pop());
  if (selIdx >= pz.path.length) selIdx = pz.path.length - 1;
  rebuildCubes();
  updateHUD();
  updatePad();
}

// ---------------------------------------------------------------------------
// The 4D toggle.
//
// Any level can be given a fourth dimension to move in. Lifting adds a w
// coordinate of 0 to every cell, which leaves the rope exactly where it was --
// the puzzle is unchanged, it has simply gained somewhere new to go. Dropping
// back is only allowed while the rope is still flat in w, so no part of it can
// be stranded off the slice.
// ---------------------------------------------------------------------------

function canDrop4D() {
  return pz.dims.length === 4 && pz.path.every((p) => p[3] === 0);
}

function set4D(on) {
  if (on === is4D()) return;
  if (on) {
    const size = Math.max(...pz.dims);
    // A symmetric box, so the view can rotate between any pair of axes.
    const dims = [size, size, size, size];
    const path = pz.path.map((p) => [...p, 0]);
    history.push(pz.path.map((p) => p.slice()));
    pz = new Puzzle(dims, path);
  } else {
    if (!canDrop4D()) return;
    const dims = pz.dims.slice(0, 3);
    const path = pz.path.map((p) => p.slice(0, 3));
    history.push(pz.path.map((p) => p.slice()));
    pz = new Puzzle(dims, path);
  }
  viewAxes = [0, 1, 2, 3];
  wFocus = 0;
  buildScene();
  recentreOrbit();
  updateHUD();
  updatePad();
  sync4DToggle();
}

function sync4DToggle() {
  const box = el('use4d');
  if (!box) return;
  box.checked = is4D();
  // Refuse to drop back while part of the rope is off the w = 0 slice: it would
  // have nowhere to go.
  const stuck = is4D() && !canDrop4D();
  box.disabled = stuck;
  el('use4dNote').textContent = stuck
    ? 'rope is using the 4th dimension'
    : '';
}

function push(axis, sign) {
  if (selIdx < 0) return;
  if (axis >= pz.dims.length) return;   // no 4th dimension on a 3D level
  const dir = dirVec(axis, sign);

  // Travelling along the rope only moves the cursor: no snapshot to undo, and
  // no geometry to rebuild.
  const plan = planPush(pz, selIdx, dir);
  if (plan && plan.kind === 'advance') {
    selIdx = plan.at;
    if (syncFocus()) rebuildCubes();
    paintCubes();
    updatePad();
    flashPad(axis, sign, true);
    return;
  }

  const before = pz.path.map((p) => p.slice());
  const next = pushWithRoom(pz, selIdx, dir);
  if (next < 0) { flashPad(axis, sign, false); return; }
  history.push(before);
  if (history.length > 200) history.shift();
  selIdx = next;
  syncFocus();
  rebuildCubes();
  updateHUD();
  updatePad();
  sync4DToggle();
  flashPad(axis, sign, true);
}

function reverse() {
  if (selIdx < 0) selIdx = 0;
  history.push(pz.path.map((p) => p.slice()));
  selIdx = reversePath(pz, selIdx);
  syncFocus();
  rebuildCubes();
  updateHUD();
  updatePad();
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
function recentreOrbit() {
  if (!orbit) return;
  if (is4D()) {
    const [X, Y, Z] = pz.dims;
    const c = [X / 2 - 0.5, Y / 2 - 0.5, Z / 2 - 0.5];
    const offs = occupiedSlices().map(sliceOffset);
    const lo = [0, 1, 2].map((d) => Math.min(...offs.map((o) => o[d])));
    const hi = [0, 1, 2].map((d) => Math.max(...offs.map((o) => o[d])));
    orbit.target = [0, 1, 2].map((d) => c[d] + (lo[d] + hi[d]) / 2);
    const spread = Math.max(...[0, 1, 2].map((d) => hi[d] - lo[d]));
    orbit.radius = (X + spread) * 1.8;
    orbit.maxR = orbit.radius * 3;
    // Keep the low eyeline while the slice stack grows, so the frames go on
    // reading as boxes on one surface.
    if (orbit.el_ > Math.PI * 0.16) orbit.el_ = Math.PI * 0.10;
    orbit.onChange();
    return;
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pz.path) {
    const q = proj(p);
    for (let d = 0; d < 3; d++) {
      if (q[d] < lo[d]) lo[d] = q[d];
      if (q[d] > hi[d]) hi[d] = q[d];
    }
  }
  orbit.target = [0, 1, 2].map((d) => (lo[d] + hi[d]) / 2);
  orbit.onChange();
}

function rotateView(axis, sign) {
  if (!is4D()) return;
  // Swap the named visible axis with the hidden one, so the 4th dimension
  // rotates into view along the direction the player asked for.
  const visible = axis < 3 ? axis : 2;
  const i = viewAxes.indexOf(visible);
  const h = 3;                       // render slot 3 is the axis not drawn
  const t = viewAxes[i];
  viewAxes[i] = viewAxes[h];
  viewAxes[h] = t;
  syncFocus();
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
    btn.title = `${b.name} (${b.key === ' ' ? 'space' : b.key})`;
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
  el('selInfo').textContent = selIdx >= 0
    ? `cell ${selIdx + 1} of ${pz.path.length}`
    : 'nothing selected';
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
    if (ev.key === 'r') { loadLevel(LEVELS.indexOf(level)); return; }
    if (ev.key === ' ') { ev.preventDefault(); reverse(); return; }

    const hit = KEYMAP[ev.key];
    if (!hit) return;
    ev.preventDefault();
    // Shift turns a direction into a 4D view rotation instead of a push.
    if (ev.shiftKey) rotateView(hit.axis, hit.sign);
    else push(hit.axis, hit.sign);
  });

  el('use4d').addEventListener('change', (e) => set4D(e.target.checked));
  el('levels').addEventListener('change', (e) => loadLevel(+e.target.value));
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
