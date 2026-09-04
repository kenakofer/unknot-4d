import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { Puzzle, applyFlip, canFlip, applyShrink, canShrink, applyShrinkEdge,
         canShrinkEdge, applyGrowEdge, canGrowEdge, unitDirs, key } from './knot.js';
import { Orbit } from './orbit.js';
import { LEVELS } from './levels.js';
import { arcDeterminant } from './invariant.js';

const CELL = 1;
let scene, camera, renderer, raycaster, orbit;
let pz, level, history, cubes, gridGroup, hoverIdx = -1, selIdx = -1;

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
  selIdx = -1;
  buildScene();
  updateHUD();
}

function buildScene() {
  ghostGroup = null; // owned by the old gridGroup, which is about to go
  if (gridGroup) scene.remove(gridGroup);
  gridGroup = new THREE.Group();
  const [X, Y, Z] = level.dims;
  const c = [X / 2, Y / 2, Z / 2];

  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(X, Y, Z)),
    new THREE.LineBasicMaterial({ color: 0x2c3646 })
  );
  box.position.set(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5);
  gridGroup.add(box);
  scene.add(gridGroup);

  orbit = new Orbit(renderer.domElement, [c[0] - 0.5, c[1] - 0.5, c[2] - 0.5], X * 2.2);
  orbit.onChange = () => {
    camera.position.set(...orbit.position());
    camera.lookAt(...orbit.target);
  };
  camera.position.set(...orbit.position());
  camera.lookAt(...orbit.target);

  rebuildCubes();
}

function rebuildCubes() {
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
  const segGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 12);
  const jointGeo = new THREE.SphereGeometry(0.225, 14, 12);
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
      const sm = new THREE.Mesh(segGeo, new THREE.MeshLambertMaterial({
        color: col, emissive: col, emissiveIntensity: 0.28,
        transparent: fs < 1, opacity: fs }));
      sm.position.copy(mid);
      sm.scale.set(1, len, 1);
      sm.quaternion.setFromUnitVectors(up, dir.normalize());
      group.add(sm);
    }
  }
  group.renderOrder = 1;
  rope = { group };
  gridGroup.add(group);
}

// ---------------------------------------------------------------------------
// Affordance ghosts: the invisible tutorial. Whenever the pointer is over a
// vertex, every legal destination for it is shown as a faint outlined cell.
// The player learns the move set by seeing it, not by reading it.
// ---------------------------------------------------------------------------
let ghostGroup = null;

function clearGhosts() {
  if (!ghostGroup) return;
  gridGroup.remove(ghostGroup);
  ghostGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  ghostGroup = null;
}

function showGhosts(i) {
  clearGhosts();
  if (i < 0 || i >= pz.path.length) return;
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.62, 0.62, 0.62);

  // Where can this vertex go? A corner flip has exactly one destination.
  const flip = canFlip(pz, i);
  if (flip) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffe27a, transparent: true, opacity: 0.5, wireframe: true }));
    m.position.set(...proj(flip));
    g.add(m);
  }

  // Which directions can pull slack out of the adjacent edges?
  for (const d of unitDirs(pz.dims.length)) {
    for (const j of [i, i - 1]) {
      const pair = canGrowEdge(pz, j, d);
      if (!pair) continue;
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x6ee7a8, transparent: true, opacity: 0.28, wireframe: true }));
      m.position.set(...proj(pair[0]));
      g.add(m);
      break;
    }
  }
  ghostGroup = g;
  gridGroup.add(g);
}

// Which w-slice is in focus (4D levels only).
let wFocus = 0;

// Project a lattice point to 3D render space. In 3D this is the identity. In
// 4D the w axis is drawn as a small diagonal offset, so each w-slice sits in
// its own shifted copy of the cube -- parallel worlds you can see at once.
const W_SHIFT = [0.34, 0.30, -0.26];
function proj(p) {
  if (p.length < 4) return [p[0], p[1], p[2]];
  const w = p[3];
  return [
    p[0] + w * W_SHIFT[0] * 3,
    p[1] + w * W_SHIFT[1] * 3,
    p[2] + w * W_SHIFT[2] * 3,
  ];
}

// How prominent a point is, given the focused w-slice.
function wFade(p) {
  if (p.length < 4) return 1;
  const d = Math.abs(p[3] - wFocus);
  return d === 0 ? 1 : Math.max(0.25, 1 - d * 0.45);
}

const is4D = () => level.dims.length === 4;

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
    const det = arcDeterminant(pz.path, Math.max(...level.dims));
    el('det').textContent = det;
    el('det').className = det === 1 ? 'ok' : 'stuck';
  }
  el('status').textContent = pz.solved ? 'SOLVED' : '';
  el('status').className = pz.solved ? 'solved' : '';
}

function render() { renderer.render(scene, camera); }

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

// Apply the one legal move that `dir` affords at vertex i.
function tryEdit(i, dir) {
  // A corner flip, when the clicked face points the way the corner folds.
  const target = canFlip(pz, i);
  if (target) {
    const cur = pz.path[i];
    const delta = target.map((v, d) => v - cur[d]);
    const dot = delta.reduce((sum, v, d) => sum + v * dir[d], 0);
    if (dot > 0) { snapshot(); applyFlip(pz, i); return 'flip'; }
  }
  // Otherwise push an adjacent edge that way, adding slack.
  for (const j of [i, i - 1]) {
    if (canGrowEdge(pz, j, dir)) { snapshot(); applyGrowEdge(pz, j, dir); return 'grow'; }
  }
  return null;
}

function tryShrinkAt(i) {
  if (canShrink(pz, i)) { snapshot(); applyShrink(pz, i); return true; }
  for (const j of [i - 1, i - 2, i]) {
    if (canShrinkEdge(pz, j)) { snapshot(); applyShrinkEdge(pz, j); return true; }
  }
  return false;
}

function afterEdit(i) {
  rebuildCubes();
  updateHUD();
  showGhosts(i);
}

function bindInput() {
  const c = renderer.domElement;
  let down = null;

  c.addEventListener('pointerdown', (ev) => {
    const hit = pick(ev);
    down = {
      x: ev.clientX, y: ev.clientY,
      lastX: ev.clientX, lastY: ev.clientY,
      hit, moved: false, acted: false,
    };
    selIdx = hit && hit.idx > 0 && hit.idx < pz.path.length - 1 ? hit.idx : -1;
    paintCubes();
    c.setPointerCapture(ev.pointerId);
  });

  c.addEventListener('pointermove', (ev) => {
    if (!down) {
      const i = pickIndex(ev);
      if (i !== hoverIdx) {
        hoverIdx = i;
        paintCubes();
        if (i < 0) clearGhosts(); else showGhosts(i);
      }
      return;
    }
    const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 4) down.moved = true;
    if (!down.moved) return;

    // Dragging the background looks around. Track the delta from client
    // coordinates rather than ev.movementX/Y, which are raw device deltas and
    // go wrong under pointer capture.
    if (!down.hit) {
      orbit.rotate(ev.clientX - down.lastX, ev.clientY - down.lastY);
      down.lastX = ev.clientX;
      down.lastY = ev.clientY;
      return;
    }

    // Dragging a cube is reserved for the 4th dimension, which has no face to
    // click. One move per drag.
    if (is4D() && !down.acted && Math.abs(dy) > 26) {
      const dir = Array(pz.dims.length).fill(0);
      dir[3] = dy < 0 ? 1 : -1;
      if (tryEdit(down.hit.idx, dir)) {
        down.acted = true;
        afterEdit(down.hit.idx);
      }
    }
  });

  const end = (ev) => {
    if (!down) return;
    try { c.releasePointerCapture(ev.pointerId); } catch (e) {}
    // A click (no drag) on a face moves the vertex that way.
    if (!down.moved && down.hit && down.hit.dir) {
      if (tryEdit(down.hit.idx, down.hit.dir)) afterEdit(down.hit.idx);
    }
    down = null;
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', () => { down = null; });

  c.addEventListener('dblclick', (ev) => {
    const i = pickIndex(ev);
    if (i >= 0 && tryShrinkAt(i)) afterEdit(i);
  });

  c.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    orbit.zoom(ev.deltaY);
  }, { passive: false });

  addEventListener('keydown', (ev) => {
    if (ev.key === 'z' && (ev.ctrlKey || ev.metaKey)) {
      if (history.length) {
        pz = new Puzzle(level.dims, history.pop());
        rebuildCubes(); updateHUD(); clearGhosts();
      }
    }
    if (ev.key === 'r') loadLevel(LEVELS.indexOf(level));
    // Move the focused w-slice in 4D levels.
    if (is4D() && (ev.key === '[' || ev.key === ']')) {
      const W = level.dims[3];
      wFocus = Math.max(0, Math.min(W - 1, wFocus + (ev.key === ']' ? 1 : -1)));
      rebuildCubes(); updateHUD();
    }
  });

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
  get cubes() { return cubes; },
  get pz() { return pz; },
  get camera() { return camera; },
  THREE,
};
