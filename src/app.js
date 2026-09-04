import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { Puzzle, applyFlip, canFlip, applyShrink, canShrink, applyShrinkEdge,
         canShrinkEdge, applyGrowEdge, canGrowEdge, unitDirs, key } from './knot.js';
import { Orbit } from './orbit.js';
import { LEVELS } from './levels.js';

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
  if (cubes) { gridGroup.remove(cubes.mesh); cubes.mesh.geometry.dispose(); }
  const n = pz.path.length;
  const geo = new THREE.BoxGeometry(0.82, 0.82, 0.82);
  // Per-instance tint comes from instanceColor. Do NOT set vertexColors:
  // that makes three sample a per-vertex colour attribute the geometry does
  // not have, multiplying every instance to black.
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  cubes = { mesh, n };
  gridGroup.add(mesh);
  paintCubes();
}

const COL = {
  end:   new THREE.Color(0xffd166),
  body:  new THREE.Color(0x4cc9f0),
  sel:   new THREE.Color(0xff5d8f),
  hover: new THREE.Color(0xa8ffd8),
};

function paintCubes() {
  const m = new THREE.Matrix4();
  const n = pz.path.length;
  for (let i = 0; i < n; i++) {
    const p = pz.path[i];
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
      if (i !== hoverIdx) { hoverIdx = i; paintCubes(); }
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
