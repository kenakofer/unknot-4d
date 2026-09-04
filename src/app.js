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
  orbit.onChange = () => camera.position.set(...orbit.position());
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
    const jm = new THREE.Mesh(jointGeo, new THREE.MeshLambertMaterial({
      color: col, emissive: col, emissiveIntensity: 0.28 }));
    jm.position.set(...proj(pz.path[i]));
    group.add(jm);

    if (i < n - 1) {
      const a = new THREE.Vector3(...proj(pz.path[i]));
      const b = new THREE.Vector3(...proj(pz.path[i + 1]));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a);
      const len = dir.length();
      const sm = new THREE.Mesh(segGeo, new THREE.MeshLambertMaterial({
        color: col, emissive: col, emissiveIntensity: 0.28 }));
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

// Project a lattice point to 3D render space. In 3D this is the identity; the
// 4D build overrides it to fold the w axis in.
function proj(p) { return [p[0], p[1], p[2]]; }

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
    cubes.mesh.setColorAt(i, c);
  }
  cubes.mesh.instanceMatrix.needsUpdate = true;
  if (cubes.mesh.instanceColor) cubes.mesh.instanceColor.needsUpdate = true;
}

function updateHUD() {
  el('level').textContent = level.name;
  el('blurb').textContent = level.blurb;
  el('len').textContent = pz.length;
  el('target').textContent = pz.target;
  // The determinant is recomputed from the live path, so the player can watch
  // it stay put no matter what they do -- that invariance IS the lesson.
  const det = arcDeterminant(pz.path, Math.max(...level.dims));
  el('det').textContent = det;
  el('det').className = det === 1 ? 'ok' : 'stuck';
  el('status').textContent = pz.solved ? 'SOLVED' : '';
  el('status').className = pz.solved ? 'solved' : '';
}

function render() { renderer.render(scene, camera); }

// ---------------------------------------------------------------------------
// Input. A drag on empty space orbits the camera. A drag starting on a path
// cube performs one atomic edit: the drag direction is projected onto the six
// axis directions in screen space, and whichever legal move that direction
// affords is applied (flip if the vertex turns a corner, otherwise push the
// adjacent edge out to add slack). Shrinks are offered automatically whenever
// a bump can collapse, via double-click.
// ---------------------------------------------------------------------------

function pickIndex(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(cubes.mesh, false)[0];
  return hit ? hit.instanceId : -1;
}

// Screen-space direction of each unit axis, so a drag maps to a lattice move.
function bestAxis(dx, dy) {
  const dirs = unitDirs(3);
  let bestD = null, bestScore = -Infinity;
  const origin = new THREE.Vector3();
  const proj = (v) => {
    const p = v.clone().project(camera);
    return new THREE.Vector2(p.x, -p.y);
  };
  const o = proj(origin);
  for (const d of dirs) {
    const q = proj(new THREE.Vector3(d[0], d[1], d[2]));
    const sv = q.sub(o);
    if (sv.lengthSq() < 1e-9) continue;
    sv.normalize();
    const score = sv.x * dx + sv.y * dy;
    if (score > bestScore) { bestScore = score; bestD = d; }
  }
  return bestD;
}

function snapshot() {
  history.push(pz.path.map((p) => p.slice()));
  if (history.length > 200) history.shift();
}

function tryEdit(i, dir) {
  // 1. Corner flip, if this vertex turns a corner and the drag agrees with it.
  const target = canFlip(pz, i);
  if (target) {
    const cur = pz.path[i];
    const delta = target.map((v, d) => v - cur[d]);
    // A flip moves diagonally; accept it when the drag has a positive
    // component along the flip's displacement.
    const dot = delta.reduce((s, v, d) => s + v * dir[d], 0);
    if (dot > 0) { snapshot(); applyFlip(pz, i); return 'flip'; }
  }
  // 2. Otherwise add slack by pushing an adjacent edge sideways.
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

function bindInput() {
  const c = renderer.domElement;
  let down = null;

  c.addEventListener('pointerdown', (ev) => {
    const i = pickIndex(ev);
    down = { x: ev.clientX, y: ev.clientY, idx: i, moved: false, acted: false };
    selIdx = i > 0 && i < pz.path.length - 1 ? i : -1;
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

    if (down.idx < 0) {
      orbit.rotate(ev.movementX, ev.movementY);
      camera.lookAt(...orbit.target);
      return;
    }
    // One edit per drag.
    if (!down.acted && Math.hypot(dx, dy) > 22) {
      const dir = bestAxis(dx, dy);
      if (dir && tryEdit(down.idx, dir)) {
        down.acted = true;
        rebuildCubes();
        updateHUD();
        showGhosts(down.idx);
      }
    }
  });

  const end = (ev) => {
    if (down) { try { c.releasePointerCapture(ev.pointerId); } catch (e) {} }
    down = null;
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);

  c.addEventListener('dblclick', (ev) => {
    const i = pickIndex(ev);
    if (i >= 0 && tryShrinkAt(i)) { rebuildCubes(); updateHUD(); }
  });

  c.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    orbit.zoom(ev.deltaY);
    camera.lookAt(...orbit.target);
  }, { passive: false });

  addEventListener('keydown', (ev) => {
    if (ev.key === 'z' && (ev.ctrlKey || ev.metaKey)) {
      if (history.length) {
        pz = new Puzzle(level.dims, history.pop());
        rebuildCubes(); updateHUD();
      }
    }
    if (ev.key === 'r') loadLevel(LEVELS.indexOf(level));
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

// Debug handle (harmless in production; useful for headless inspection).
window.__unknot = { get scene(){return scene;}, get cubes(){return cubes;}, get pz(){return pz;}, get camera(){return camera;}, THREE };
