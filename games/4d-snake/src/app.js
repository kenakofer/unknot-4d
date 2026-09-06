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
import { SliceMap } from '../../../shared/slicemap.js';
import { addLights, sliceFrame, blocker, visibleWalls, wallSetKey, wallBar,
         wallDot, wallRoundedRect, roundedBox, projectionMaterial, setGeometry,
         blinkPhase, COLORS }
  from '../../../shared/scene.js';

let scene, camera, renderer, orbit, game, pad, smap;
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
  // The slice panel: the y-w plane, taken at the head's own x and z.
  //
  // Horizontal is the fourth dimension with A on the left and D on the right,
  // matching the keyboard and the direction the ring of frames advances.
  // Vertical is up/down, matching W and S. So the panel's four edges are four
  // keys, and everything on it is genuinely one keypress away -- which is the
  // question the main view is worst at answering.
  smap = new SliceMap(el('minimap'), {
    axes: [3, 1], dims: game.dims, wrap: game.wrap,
  });
  smap.labels = ['A', 'D', 'S', 'W'];
  smap.cellFill = (p) => (game.isLava(p)
    ? { colour: '#ff2b1d', opacity: 0.8 }
    : null);
  smap.glow = game.lavaGlow();
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
  // The resting view: due north, looking 60 degrees down.
  //
  // Due north means the compass directions on the pad are the compass
  // directions on screen -- north is away from you, east is to the right --
  // with nothing to mentally rotate. The camera used to sit an eighth of a turn
  // east of that, to stop a snake pointing at the viewer collapsing into a dot;
  // the steep angle does that job better, since looking well down the y axis
  // separates runs along x and z from each other and from the viewing
  // direction, and the rock keeps anything that does line up from staying lined
  // up.
  //
  // Azimuth places the EYE, so π/2 puts it south of the target looking north;
  // elevation is measured up from the horizontal, so π/3 is 60 degrees above,
  // looking 60 degrees down.
  orbit.az = Math.PI * 0.5;
  orbit.el_ = Math.PI / 3;
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

// Built once per game and left alone -- lava does not move. `slabs` keeps the
// meshes so the focus fade can reach them without walking the scene graph.
let lava = null, glow = null, slabs = [];

// Dim the slabs that are not in the focused slice, the same way the snake's own
// cells are dimmed. Without it every slab on the ring competes equally for
// attention and the room you are actually in stops standing out.
function fadeLava() {
  for (const m of slabs) {
    const f = m.userData.w === slide.focus ? 1 : 0.45;
    m.material.opacity = m.userData.baseOpacity * f;
  }
}

function buildLava() {
  // One rounded SLAB per lava block PER SLICE it occupies.
  //
  // Rounding each cell on its own would put a bulge at every internal seam and
  // the block would read as a heap of beads. A block is one object -- a
  // 3x2x2x1 slab in some orientation -- so within a slice it is drawn as one
  // object, and only its outer edges are filleted. That is what makes it a pill
  // rather than a pile.
  //
  // The per-slice part is not a detail. A block's proportions are shuffled
  // across all four axes when it is placed, so the "1" often lands on a spatial
  // axis and the block ends up two or three slices DEEP in w -- better than
  // three quarters of them are, in practice. Drawing only the slab at
  // b.origin[3] left every other slice it occupied with no lava drawn at all,
  // while the glow (which is computed per cell, and was right) still showed
  // around it. Lava you could see the halo of, walk into, and die on.
  //
  // Each slice gets its own slab because each is its own room: a block spanning
  // w is not one object in space, it is the same hazard appearing in several
  // rooms, exactly as a snake crossing w is drawn as separate runs joined by a
  // link rather than one continuous body.
  const R = 0.34;   // fillet radius, in cells
  slabs = [];

  for (const b of game.lava) {
   for (let dw = 0; dw < b.size[3]; dw++) {
    // The slab's extent in the three drawn axes. Cell centres sit on integers
    // and a cell is one across, so a run of n cells spans n.
    const size = [0, 1, 2].map((d) => b.size[d] * 0.98);
    const centre = [0, 1, 2].map((d) => b.origin[d] + (b.size[d] - 1) / 2);
    // Which slice this piece sits in, and where that slice's frame stands.
    // w wraps, so a block running off the end continues at the beginning.
    const w = (b.origin[3] + dw) % game.dims[3];
    const off = ring.offset(w);

    const mat = new THREE.MeshLambertMaterial({
      color: LAVA_COL, emissive: LAVA_COL, emissiveIntensity: 0.5,
      // 80% opaque: solid enough to read as a wall, sheer enough that a snake
      // behind it is still findable.
      transparent: true, opacity: 0.8,
      // depthWrite stays OFF. Writing depth would let lava occlude the snake
      // through the depth buffer whatever the render order says, and a snake
      // hidden behind scenery is a move made blind.
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(roundedBox(size, R), mat);
    mesh.position.set(centre[0] + off[0], centre[1] + off[1], centre[2] + off[2]);
    // renderOrder 1: BEHIND the snake, which is 2.
    mesh.renderOrder = 1;
    // Which slice this slab belongs to, so the focus fade can find it again.
    mesh.userData.w = w;
    mesh.userData.baseOpacity = 0.8;
    world.add(mesh);
    slabs.push(mesh);
   }
  }
  fadeLava();

  // The glow, along w only.
  //
  // It stays per-cell and square: it marks which CELLS are a step from death,
  // and rounding it would round off the very cells it is there to name.
  //
  // But it is drawn only for the w neighbours now. A halo around a slab in the
  // room you are looking at repeats what the slab already says plainly, six
  // times over, and with three blocks spread across several slices each that
  // was most of what was on screen. Along w it is the one warning the view
  // cannot otherwise give: the lava is in the next room, one press of A or D
  // away, where you cannot see it. So a glowing cell now means exactly that,
  // and nothing else.
  const W_AXIS = game.D - 1;
  const glowCells = [...game.lavaGlow([W_AXIS])]
    .map((k) => k.split(',').map(Number));
  if (glowCells.length) {
    const mat = new THREE.MeshLambertMaterial({
      color: GLOW_COL, emissive: GLOW_COL, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.1, depthWrite: false,
    });
    const m = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.94, 0.94, 0.94), mat, glowCells.length);
    m.renderOrder = 0.6;
    const mat4 = new THREE.Matrix4();
    glowCells.forEach((c, i) => {
      const p = proj(c);
      mat4.makeTranslation(p[0], p[1], p[2]);
      m.setMatrixAt(i, mat4);
    });
    m.instanceMatrix.needsUpdate = true;
    world.add(m);
    glow = { mesh: m, cells: glowCells };
  }
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

  // The lava's own mark on the walls. Drawn FIRST and lowest, so the snake and
  // the apple paint over it -- what the player is steering must never be lost
  // under scenery, on the walls any more than in the room.
  //
  // It is the one projection that is not about position but about danger: it
  // says which stripes of each wall have lava somewhere along that line, so a
  // hazard in a far corner of the room announces itself on the near wall.
  const lavaProj = new THREE.Mesh(new THREE.BufferGeometry(),
    projectionMaterial({ color: 0xff2b1d, opacity: 0.13, ref: 4 }));
  lavaProj.renderOrder = 0.2;

  group.add(lavaProj, bodyProj, headProj, appleProj);
  world.add(group);
  parts = { group, lavaProj, bodyProj, headProj, appleProj, dynamic: [] };
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

  // The focus may have moved to another slice, so the slabs are re-faded with
  // everything else rather than only when they are built.
  fadeLava();
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

  // The lava's shadow: one rounded rectangle per slab per visible wall, with
  // the same corner radius as the slab itself so the mark is recognisably the
  // shape that cast it.
  const lv = [];
  for (const b of game.lava) {
    // A mark in every slice the block occupies, for the same reason it gets a
    // slab in each: each slice is its own room with its own walls, and a room
    // holding lava must say so.
    for (let dw = 0; dw < b.size[3]; dw++) {
      const off = ring.offset((b.origin[3] + dw) % game.dims[3]);
      for (const { axis, at } of visibleWalls(eye, off, D3)) {
        const a = (axis + 1) % 3, c = (axis + 2) % 3;
        // The slab flattened onto this wall: its extent in the wall's two axes.
        const lo = [b.origin[a] - 0.5 + off[a], b.origin[c] - 0.5 + off[c]];
        const hi = [b.origin[a] + b.size[a] - 0.5 + off[a],
                    b.origin[c] + b.size[c] - 0.5 + off[c]];
        for (const v of wallRoundedRect(lo, hi, axis, at, 0.34)) {
          lv.push(v[0], v[1], v[2]);
        }
      }
    }
  }

  setGeometry(parts.lavaProj, lv);
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
  // The camera TRACKS the focused frame and never turns to it.
  //
  // Every frame is placed by translation alone, so they all face the viewer the
  // same way; the camera only has to slide sideways to look at a different one.
  // Turning it as well -- which this used to do, to meet each frame "square on"
  // -- was correcting for a rotation that was never there, and it spun the
  // world a sixth of a turn on every w move. Whatever view the player has
  // dialled in, A and D now leave it exactly as it was.
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
  drawSlice();
}

// Hand the slice panel the state it draws from. It runs on every board change
// rather than every frame: nothing on it moves except when the game does, so
// redrawing it in the render loop would be work for no picture.
function drawSlice() {
  if (!smap) return;
  smap.focus = game.head;
  smap.body = game.body;
  smap.apple = game.apple;
  smap.draw();
  // Say which axes are being held still, since that is what decides what the
  // panel is showing and it changes with every move.
  el('mapX').textContent = game.head[0];
  el('mapZ').textContent = game.head[2];
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
