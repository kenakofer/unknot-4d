// 4D Snake -- the view.
//
// The rules live in snake.js and know nothing about any of this. Everything
// here is about making a position in four dimensions legible: which frame you
// are in, where the head sits inside it, and what is about to kill you.
//
// The spatial language is the shared one. Each w value gets its own cube frame,
// the frames stand on a ring in w order, and the camera travels round to
// whichever holds the head. Unknot draws its fourth dimension exactly this way,
// so a player arriving from that game already knows how to read this one.
//
// The one difference, and it is deliberate: snake's w WRAPS. The ring closes
// with no blocker in it, which says the step from the last frame to the first
// is available -- the same geometry making the opposite statement.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { Snake, CAUSE } from './snake.js';
import { Orbit } from '../../../shared/orbit.js';
import { Ring, Slide } from '../../../shared/ring.js';
import { rockAt } from '../../../shared/rock.js';
import { Pad, dirVec } from '../../../shared/pad.js';
import { addLights, sliceFrame, blocker, visibleWalls, wallSetKey, wallBar,
         wallDot, projectionMaterial, setGeometry, blinkPhase, COLORS }
  from '../../../shared/scene.js';

let scene, camera, renderer, orbit, game, pad;
// Start of the rock's clock, so the view swings from a fixed phase.
const t0 = performance.now();
// The eased focus along w. `focus` is the exact slice the head is in; `shown`
// chases it, and the frame geometry is measured from `shown`.
let slide;
let ring;
let frames, world;
let parts = null;

const el = (id) => document.getElementById(id);

// The drawn extent of one slice: the three axes that are shown as space.
const dims3 = () => game.dims.slice(0, 3);
const wDepth = () => game.dims[3];

function init() {
  const canvas = el('view');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  addLights(scene);

  newGame();
  bindInput();
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(render);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

function newGame() {
  game = new Snake();
  // A tighter gap than unknot's default: with all six frames always drawn,
  // spacing them a full box and a half apart pushes the far ones off screen.
  ring = new Ring({ depth: wDepth(), span: Math.max(...dims3()), wrap: true,
                    gap: 1.25 });
  slide = new Slide(game.head[3], ring);
  buildScene();
  el('over').classList.remove('show');
  updateHUD();
  if (pad) pad.update();
}

// ---------------------------------------------------------------------------
// Projecting a 4D cell into the 3D scene.
//
// Three coordinates are drawn as space; the fourth picks which frame the cell
// belongs to, and the frame's position on the ring is added on. So a cell's
// place on screen says both where it is in its room AND which room that is.
// ---------------------------------------------------------------------------
function proj(p) {
  const off = ring.offset(p[3]);
  return [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
}

// How prominent a cell is, given which slice has the focus. Other slices are
// drawn dimmer, so it is clear which room you are in without hiding what is
// waiting in the next one -- seeing the lava you are about to wrap into is the
// whole reason the other frames are on screen at all.
function wFade(p) {
  return p[3] === slide.focus ? 1 : 0.45;
}

// Which slices to draw. All of them: a snake in four dimensions has to be able
// to see where it is going before it goes there, and with only six frames the
// whole space fits on screen at once. Unknot draws only occupied slices because
// its rope is long and the clutter would win; here the opposite is true.
function allSlices() {
  return Array.from({ length: wDepth() }, (_, i) => i);
}

function buildScene() {
  if (world) {
    scene.remove(world);
    world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  world = new THREE.Group();
  scene.add(world);

  frames = new THREE.Group();
  world.add(frames);
  buildFrames();
  buildLava();
  buildParts();

  const [X, Y, Z] = dims3();
  const off = ring.offset(slide.shown);
  const mid = [X / 2 - 0.5 + off[0], Y / 2 - 0.5 + off[1], Z / 2 - 0.5 + off[2]];
  // Far enough back that the focused room fits with air around it, and the
  // frames either side of it are readable at the edges of the view. Snake needs
  // more of this than unknot does: what is in the NEXT room decides the move
  // you are about to make, so the neighbours have to be legible rather than
  // merely present.
  const rest = X * 4.2;
  orbit = new Orbit(renderer.domElement, mid, rest);
  orbit.restRadius = rest;
  orbit.maxR = rest * 3;
  orbit.onChange = () => {
    camera.position.set(...orbit.position());
    camera.lookAt(...orbit.target);
  };
  // Sit off the lattice axes rather than square on to them.
  //
  // Looking straight down an axis lines every run of snake up with the viewing
  // direction, so a body heading toward the camera collapses to a single dot
  // and its length becomes unreadable -- which is fatal in a game where the
  // length is the thing you are managing. An eighth of a turn off breaks that
  // alignment for every axis at once, so a snake along any of the three drawn
  // directions still shows as a line. Same reasoning as the minimap's FACING.
  orbit.az += Math.PI / 8;
  aimAtFocus();
}

function buildFrames() {
  for (const o of [...frames.children]) {
    frames.remove(o);
    if (o.geometry) o.geometry.dispose();
  }
  for (const w of allSlices()) {
    frames.add(sliceFrame(dims3(), ring.offset(w), w === slide.focus));
  }
  // No blocker: w wraps, so the ring closes and every step between frames is
  // one the snake can actually take. `ring.blockerSlot()` returns null here,
  // and that is the geometry stating the rule.
  const slot = ring.blockerSlot();
  if (slot !== null) frames.add(blocker(dims3(), ring.offset(slot)));
}

// ---------------------------------------------------------------------------
// Lava.
//
// Bright red and nearly opaque, because it is the thing that kills you and it
// must never be mistaken for anything else. The cells around it carry a faint
// red wash, so danger has an outline you can see coming rather than a hard edge
// you discover by crossing it. Both are built once -- lava does not move.
// ---------------------------------------------------------------------------
const LAVA_COL = 0xff2b1d;
const GLOW_COL = 0xff5a3c;

// Built once per game and left alone -- lava does not move.
let lava = null, glow = null;

function buildLava() {
  const cellGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
  const glowGeo = new THREE.BoxGeometry(0.94, 0.94, 0.94);

  // Every lava cell in every slice, as one instanced mesh per fade level. Two
  // meshes rather than per-instance opacity, which instanced materials do not
  // offer: one for the focused slice at full strength, one for the rest.
  const lavaCells = [];
  for (const b of game.lava) lavaCells.push(...b.cells());
  const glowCells = [...game.lavaGlow()].map((k) => k.split(',').map(Number));

  const mk = (cells, geo, colour, opacity, order) => {
    if (!cells.length) return null;
    // depthWrite stays OFF even for the near-opaque lava. Writing depth would
    // let it occlude the snake through the depth buffer whatever the render
    // order says, and a snake hidden behind scenery is a move made blind. With
    // it off, render order alone decides: lava paints first, the snake over it.
    const mat = new THREE.MeshLambertMaterial({
      color: colour, emissive: colour, emissiveIntensity: 0.5,
      transparent: true, opacity, depthWrite: false,
    });
    const m = new THREE.InstancedMesh(geo, mat, cells.length);
    m.renderOrder = order;
    const mat4 = new THREE.Matrix4();
    cells.forEach((c, i) => {
      const p = proj(c);
      mat4.makeTranslation(p[0], p[1], p[2]);
      m.setMatrixAt(i, mat4);
    });
    m.instanceMatrix.needsUpdate = true;
    world.add(m);
    return { mesh: m, cells };
  };

  // 80% opaque, as the lava should be: solid enough to read as a wall, sheer
  // enough that a snake behind it is still findable.
  // renderOrder 1: BEHIND the snake (which is 2). The snake is the thing being
  // steered and must never be hidden by scenery -- lava seen through a snake
  // still reads as lava, but a snake lost behind lava is a move made blind.
  lava = mk(lavaCells, cellGeo, LAVA_COL, 0.8, 1);
  // 10%: a wash rather than a block. It marks the cells a step from death.
  //
  // depthWrite is off for it (opacity <= 0.5), which matters: a hundred and
  // sixty translucent shells that wrote depth would each occlude the ones
  // behind, and the far side of the board would disappear behind a red fog.
  glow = mk(glowCells, glowGeo, GLOW_COL, 0.1, 0.6);
}


// ---------------------------------------------------------------------------
// The snake, the apple, and the wall projections.
//
// The snake is drawn the way unknot draws its rope -- tubes between cell
// centres with a ball at each bend -- so the two games' moving parts look like
// the same kind of object. A step in w is drawn as a thin grey line instead,
// because it is not a length of snake lying in a room: it is the same snake
// continuing in the next one.
// ---------------------------------------------------------------------------

const HEAD_COL = new THREE.Color(0x8dffc8);
const TAIL_COL = new THREE.Color(0x2a8f6a);
const APPLE_COL = new THREE.Color(0x24ff5e);
const PROJ_W = 0.13;

function buildParts() {
  if (parts) {
    for (const o of parts.group.children) if (o.geometry) o.geometry.dispose();
    world.remove(parts.group);
  }
  const group = new THREE.Group();
  group.renderOrder = 2;

  // The rope's shadow on each wall, and the head's own mark over it. Separate
  // meshes with different stencil refs, so the head's square paints over the
  // body's ribbon rather than blending with it.
  const bodyProj = new THREE.Mesh(new THREE.BufferGeometry(),
    projectionMaterial({ color: 0x7fb0d8, opacity: 0.1, ref: 1 }));
  bodyProj.renderOrder = 0;
  const headProj = new THREE.Mesh(new THREE.BufferGeometry(),
    projectionMaterial({ color: 0x35e3f0, opacity: 0.1, ref: 2 }));
  headProj.renderOrder = 0.5;
  // The apple's mark, so you can find it on the walls before you can see it in
  // the room -- which, with six rooms on screen, is most of the time.
  const appleProj = new THREE.Mesh(new THREE.BufferGeometry(),
    projectionMaterial({ color: 0x24ff5e, opacity: 0.14, ref: 3 }));
  appleProj.renderOrder = 0.4;

  group.add(bodyProj, headProj, appleProj);
  world.add(group);
  parts = { group, bodyProj, headProj, appleProj, dynamic: [] };
  redraw();
}

// Everything that moves: rebuilt each turn. The snake is short and the board is
// small, so building it fresh is simpler than diffing it and costs nothing.
function redraw() {
  for (const o of parts.dynamic) {
    parts.group.remove(o);
    if (o.geometry) o.geometry.dispose();
  }
  parts.dynamic = [];

  const body = game.body;
  const n = body.length;
  const TUBE = 0.17;
  // A ball that fills the notch where two perpendicular tubes meet has to reach
  // the outer corner between them, which is r*sqrt(2) from the centre. Smaller
  // leaves a bite out of the bend; larger is a bead on a string.
  const JOINT = TUBE * Math.SQRT2;
  const segGeo = new THREE.CylinderGeometry(TUBE, TUBE, 1, 12);
  const jointGeo = new THREE.SphereGeometry(JOINT, 14, 12);
  const up = new THREE.Vector3(0, 1, 0);

  const add = (o) => { parts.group.add(o); parts.dynamic.push(o); };
  // A ramp from bright at the head to dark at the tail, so which end is which
  // is never in question -- the thing you steer has to be findable at a glance.
  const colAt = (i) => HEAD_COL.clone().lerp(TAIL_COL, n < 2 ? 0 : i / (n - 1));

  for (let i = 0; i < n; i++) {
    const p = body[i];
    const f = wFade(p);
    const col = colAt(i);

    // A ball at the head, the tail, either side of a step between slices, and
    // at a bend -- the places where a bare tube would show a notch or an open
    // end. A cell the snake runs straight through needs none.
    const bend = i > 0 && i + 1 < n &&
      stepOf(body[i - 1], body[i]) !== stepOf(body[i], body[i + 1]);
    const hop = (i > 0 && body[i - 1][3] !== p[3]) ||
                (i + 1 < n && body[i + 1][3] !== p[3]);
    if (i === 0 || i === n - 1 || bend || hop) {
      const m = new THREE.Mesh(jointGeo, new THREE.MeshLambertMaterial({
        color: col, emissive: col, emissiveIntensity: 0.3,
        transparent: f < 1, opacity: f }));
      m.position.set(...proj(p));
      add(m);
    }

    if (i + 1 < n) {
      const q = body[i + 1];
      const a = new THREE.Vector3(...proj(p));
      const b = new THREE.Vector3(...proj(q));
      // A step in w joins two different frames, and so does a step that wraps
      // around the board. Neither is a length of snake lying in space, so
      // neither is drawn as one: a thin grey line says the snake continues over
      // there without pretending to have substance in between.
      if (p[3] !== q[3] || !adjacent3(p, q)) {
        const lg = new THREE.BufferGeometry().setFromPoints([a, b]);
        add(new THREE.Line(lg, new THREE.LineBasicMaterial({
          color: 0x9aa6b8, transparent: true, opacity: 0.5 })));
        continue;
      }
      const dir = b.clone().sub(a);
      const len = dir.length();
      const sc = colAt(i + 0.5);
      const fs = Math.min(f, wFade(q));
      const m = new THREE.Mesh(segGeo, new THREE.MeshLambertMaterial({
        color: sc, emissive: sc, emissiveIntensity: 0.26,
        transparent: fs < 1, opacity: fs }));
      m.position.copy(a.clone().add(b).multiplyScalar(0.5));
      m.scale.set(1, len, 1);
      m.quaternion.copy(
        new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
      add(m);
    }
  }

  // The apple: a bright green ball, opaque, sitting a little proud of a cell so
  // it never hides inside the lava glow.
  if (game.apple) {
    const f = wFade(game.apple);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14),
      new THREE.MeshLambertMaterial({
        color: APPLE_COL, emissive: APPLE_COL, emissiveIntensity: 0.55,
        transparent: f < 1, opacity: f }));
    m.position.set(...proj(game.apple));
    add(m);
    parts.apple = m;
  } else {
    parts.apple = null;
  }

  paintProjections();
}

const stepOf = (a, b) => b.map((v, d) => v - a[d]).join(',');
// Are two cells neighbours in the three drawn axes? A wrap along x, y or z
// cannot happen (they have walls), but the snake can wrap along w, and a body
// that has just wrapped must not be drawn with a tube stretched across the room.
function adjacent3(a, b) {
  let diff = 0;
  for (let d = 0; d < 3; d++) diff += Math.abs(a[d] - b[d]);
  return diff <= 1;
}

// Flatten the snake, its head and the apple onto whichever walls the camera can
// see into.
function paintProjections() {
  if (!orbit) return;
  const eye = orbit.position();
  const bv = [], hv = [], av = [];
  const D3 = dims3();

  for (let i = 0; i < game.body.length; i++) {
    const cell = game.body[i];
    const p = proj(cell);
    const off = ring.offset(cell[3]);
    const nxt = game.body[i + 1];
    const joined = nxt && nxt[3] === cell[3] && adjacent3(cell, nxt);
    const q = nxt ? proj(nxt) : null;
    for (const { axis, at } of visibleWalls(eye, off, D3)) {
      for (const v of wallDot(p, axis, at, PROJ_W)) bv.push(v[0], v[1], v[2]);
      if (joined) {
        for (const v of wallBar(p, q, axis, at, PROJ_W)) bv.push(v[0], v[1], v[2]);
      }
      // The head gets a full square on each wall, saying where along that axis
      // the thing you are steering actually is.
      if (i === 0) {
        for (const v of wallDot(p, axis, at, 0.42)) hv.push(v[0], v[1], v[2]);
      }
    }
  }

  if (game.apple) {
    const p = proj(game.apple);
    const off = ring.offset(game.apple[3]);
    for (const { axis, at } of visibleWalls(eye, off, D3)) {
      for (const v of wallDot(p, axis, at, 0.36)) av.push(v[0], v[1], v[2]);
    }
  }

  setGeometry(parts.bodyProj, bv);
  setGeometry(parts.headProj, hv);
  setGeometry(parts.appleProj, av);
}

// ---------------------------------------------------------------------------
// The camera follows the head around the ring.
// ---------------------------------------------------------------------------
function aimAtFocus() {
  if (!orbit) return;
  const [X, Y, Z] = dims3();
  const off = ring.offset(slide.shown);
  orbit.target = [X / 2 - 0.5 + off[0], Y / 2 - 0.5 + off[1], Z / 2 - 0.5 + off[2]];
  // Turn with the ring as well as travelling round it, so every frame is met
  // square on rather than at an angle that grows with the distance from slot 0.
  // Negated: the azimuth places the EYE, so it runs against the slot direction.
  orbit.ringYaw = -ring.yaw(slide.shown);
  orbit.onChange();
}

// ---------------------------------------------------------------------------
// Input.
// ---------------------------------------------------------------------------

function doMove(axis, sign) {
  if (game.over) return;
  const dir = dirVec(axis, sign, game.D);
  const before = game.head[3];
  const plan = game.move(dir);

  if (plan.kind === 'reversal') { pad.flash(axis, sign, false); return; }

  // Follow the head to its new slice. The ring takes the short way round, so a
  // wrap from the last frame to the first is one step of camera travel rather
  // than five backwards.
  if (game.head && game.head[3] !== before) slide.focus = game.head[3];

  buildFrames();
  redraw();
  updateHUD();
  pad.update();
  pad.flash(axis, sign, plan.kind !== 'die');

  if (game.over) showGameOver();
}

const CAUSE_TEXT = {
  [CAUSE.WALL]: 'You ran into the wall.',
  [CAUSE.LAVA]: 'You went into the lava.',
  [CAUSE.SELF]: 'You ran into yourself.',
};

function showGameOver() {
  el('overScore').textContent = game.score;
  el('overCause').textContent = CAUSE_TEXT[game.cause] || '';
  el('over').classList.add('show');
}

function updateHUD() {
  el('score').textContent = game.score;
  el('length').textContent = game.length;
  el('slice').textContent = `${game.head[3]} / ${wDepth()}`;
}

function bindInput() {
  pad = new Pad(el('pad'), {
    onPush: (axis, sign) => doMove(axis, sign),
    // Only a reversal is greyed out. A step into lava or into your own flank
    // stays lit, because finding those out is the game -- a pad that refused
    // every fatal move would play it for you.
    isLive: (axis, sign) =>
      !game.over && game.plan(dirVec(axis, sign, game.D)).kind !== 'reversal',
  });
  pad.bindKeys();

  addEventListener('keydown', (ev) => {
    if (ev.key === 'r' || ev.key === 'R') newGame();
  });
  el('restart').addEventListener('click', newGame);

  // Dragging the background looks around; nothing else pointer-driven touches
  // the game. Every move is named on the pad, so there is no gesture to
  // misread.
  const c = renderer.domElement;
  let down = null;
  c.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    down = { lastX: ev.clientX, lastY: ev.clientY };
    c.setPointerCapture(ev.pointerId);
  });
  c.addEventListener('pointermove', (ev) => {
    if (!down) return;
    orbit.rotate(ev.clientX - down.lastX, ev.clientY - down.lastY);
    down.lastX = ev.clientX;
    down.lastY = ev.clientY;
  });
  const release = (ev) => {
    if (!down) return;
    try { c.releasePointerCapture(ev.pointerId); } catch (e) {}
    down = null;
  };
  c.addEventListener('pointerup', release);
  c.addEventListener('pointercancel', () => { down = null; });
  c.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    orbit.zoom(ev.deltaY);
  }, { passive: false });
}

// ---------------------------------------------------------------------------
// The loop.
// ---------------------------------------------------------------------------
let lastFrameAt = 0;
let wallKey = '';

function render(now) {
  const t = now || performance.now();
  // Seconds since the last frame, clamped so a backgrounded tab returning does
  // not jump the slide to its end in one step.
  const dt = lastFrameAt ? Math.min((t - lastFrameAt) / 1000, 0.1) : 0;
  lastFrameAt = t;

  if (dt && slide.step(dt)) {
    buildFrames();
    redraw();
  }
  // Aim every frame, not only while the slide is stepping: a move sets the
  // focus and rebuilds the cells at their new absolute positions straight
  // away, so a camera that only caught up inside the stepping branch would sit
  // on the old frame while the data jumped to the new one.
  aimAtFocus();

  if (orbit) {
    const r = rockAt(t - t0);
    orbit.rock(r.yaw, r.tilt);
  }

  // The rock swings the camera past a wall's plane now and then, which changes
  // which walls it can see into. Repaint when that happens -- not every frame,
  // since rebuilding the projection buffers is not free.
  if (parts && orbit) {
    const k = wallSetKey(orbit.position(),
                         allSlices().map((w) => ring.offset(w)), dims3());
    if (k !== wallKey) { wallKey = k; paintProjections(); }
  }

  // Blink the head, so the thing you are steering is findable in a board with
  // six rooms in it.
  if (parts && parts.dynamic.length && !game.over) {
    const lit = blinkPhase(t - t0) === 0;
    const headMesh = parts.dynamic[0];
    if (headMesh && headMesh.material && headMesh.material.emissiveIntensity !== undefined) {
      headMesh.material.emissiveIntensity = lit ? 0.85 : 0.3;
    }
  }

  renderer.render(scene, camera);
}

init();

// Handle for inspection from the console.
window.__snake = {
  get game() { return game; },
  get orbit() { return orbit; },
  get scene() { return scene; },
  THREE,
};
