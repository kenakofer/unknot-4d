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
import { Table, tableW } from '../../../shared/table.js';
import { Orbs } from '../../../shared/orbs.js';
import { makeRng } from '../../../shared/grid.js';
import { PauseMenu } from '../../../shared/pause.js';
import { Tutorial, tutorialSeen } from './tutorial.js';
import { tutorialReturnTo } from '../../../shared/tutorial-entry.js';
import { WARD, VERBS, VERBS_BY_DIR, INTO, DIED_PLAINLY, TUTORIAL, PANELS,
         HUD, GAME_OVER } from './copy.js';
import { addLights, sliceFrame, blocker, visibleWalls, wallSetKey, wallBar,
         wallDot, wallRoundedRect, roundedBox, projectionMaterial, setGeometry,
         blinkPhase, pulseAt, COLORS }
  from '../../../shared/scene.js';

let scene, camera, renderer, orbit, game, pad, mapWY, mapXZ, pause, tutorial;
let table, orbs;
// Fixed, so a board always has the same lights standing in the same places. The
// scene should be somewhere you can come back to rather than a fresh
// arrangement on every reload.
const ORB_SEED = 20260906;

// How far the camera looks down at the board, in degrees.
//
// Shallow enough to see the horizon the orbs stand on. It was 52, which is a
// good angle for reading a board and a poor one for a scene with a distance in
// it -- looking that far down puts everything past the table off the top of the
// screen. Written in degrees because that is how it gets discussed and tuned.
const LOOK_DOWN_DEG = 35;

// A notch closer than the framing that just fits the board, which reads better
// than leaving a margin of empty room around it.
const ZOOM_IN = 1 / 1.12;
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
// The three axes drawn as space. A board with fewer than three gets padded to
// one cell deep on the missing ones, so a 2D lesson is drawn as a single slab
// rather than needing its own code path.
const dims3 = () => {
  const d = game.dims.slice(0, 3);
  while (d.length < 3) d.push(1);
  return d;
};

// How deep the fourth axis is. A board without one is one slice deep, which
// makes the ring a single frame at the origin -- so every "which slice" answer
// below is 0 and the machinery quietly disappears rather than being switched
// off case by case.
const wDepth = () => (game.dims.length > 3 ? game.dims[3] : 1);

// Which slice a cell is in. Cells on a board with no fourth axis are all in
// slice 0.
const wOf = (p) => (p.length > 3 ? p[3] : 0);

// The same two questions for a box: which slice it starts in, and how many it
// spans. A box on a board with no fourth axis is one slice deep at slice 0.
const boxW = (b) => (b.origin.length > 3 ? b.origin[3] : 0);
const boxDepth = (b) => (b.size.length > 3 ? b.size[3] : 1);

// Is there a fourth dimension to show at all? The ring, the second slice panel
// and the ana/kata keys all hang off this.
const has4D = () => game.dims.length > 3 && game.dims[3] > 1;

// Fill in every fixed label on the page. The markup carries the structure and
// the copy file carries the words, so neither repeats the other and there is
// one place to edit a phrase.
function writeLabels() {
  const set = (id, text) => { const e = el(id); if (e) e.textContent = text; };
  set('title', HUD.title);
  set('blurb', HUD.blurb);
  set('scoreLabel', HUD.score);
  set('lengthLabel', HUD.length);
  set('padFoot', HUD.padFoot);
  set('overHeading', GAME_OVER.heading);
  set('overScoreLabel', GAME_OVER.finalScore);
  set('restartKey', GAME_OVER.playAgainKey);
  set('restartSub', GAME_OVER.playAgain);
}

function init() {
  writeLabels();
  const canvas = el('view');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  // The far plane has to clear the orbs, which stand as much as a hundred table
  // radii out -- a couple of thousand units on a 6^4 board. Everything else in
  // the scene is within about fifty of the camera, so the depth buffer is not
  // being asked to do anything hard by this: the far objects never overlap the
  // near ones in a way that needs resolving.
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000);
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

// Start the ordinary game again.
//
// Separate from newGame so it can be used as an event handler without the
// event arriving as a board specification -- which is exactly the kind of bug
// that produces a board with `isTrusted` for dimensions.
function restartRun() {
  newGame(lessonOpts);
}

// The layout the current run was started from, so restarting repeats it. Null
// for the ordinary game.
let lessonOpts = null;

// `opts` lets a caller start a board of any shape with any layout -- which is
// what the tutorial's lessons are. No argument means the ordinary game.
function newGame(opts) {
  lessonOpts = opts || null;
  game = new Snake(opts);
  // A tighter gap than unknot's default: with all six frames always drawn,
  // spacing them a full box and a half apart pushes the far ones off screen.
  // With no fourth axis this is a ring of one, whose single slot sits at the
  // origin -- so every frame, offset and slide below carries on working and
  // simply has nothing to move between. That is why the 2D and 3D lessons need
  // no separate drawing code: the ring does not have to be switched off, it
  // just has nowhere to go.
  ring = new Ring({ depth: wDepth(), span: Math.max(...dims3()), wrap: has4D(),
                    gap: 1.25 });
  slide = new Slide(wOf(game.head), ring);
  buildScene();
  // The slice panel: the y-w plane, taken at the head's own x and z.
  //
  // Horizontal is the fourth dimension with A on the left and D on the right,
  // matching the keyboard and the direction the ring of frames advances.
  // Vertical is up/down, matching W and S. So the panel's four edges are four
  // keys, and everything on it is genuinely one keypress away -- which is the
  // question the main view is worst at answering.
  // Two slices through the head, showing different pairs of axes.
  //
  // The w-y panel holds x and z still, so its two directions are the ones W, S,
  // A and D move in. The x-z panel holds w and y still, so its two are the
  // arrow keys' horizontal plane. Between them every direction on the pad is on
  // exactly one panel -- which is what makes a second panel worth its space
  // rather than being the same information twice.
  const lava = (p) => (game.isLava(p)
    ? { colour: '#ff2b1d', opacity: 0.8 }
    : null);

  // The w-y panel only exists where w does. Its PANEL is hidden otherwise --
  // a panel of one column would be a strange thing to show, and its footer
  // would name an axis the board does not have.
  //
  // The keys above it are a separate question. W and S exist on a 3D board and
  // the lesson that introduces them is exactly the case where the panel does
  // not, so the cluster stays and only the drawing goes. Hiding the column
  // wholesale took the keys with it, which left the lesson about W and S with
  // no W and S on screen.
  const showWY = has4D();
  el('mapWY').classList.toggle('absent', !showWY);
  const wyFootEl = el('mapWYFoot');
  if (wyFootEl) wyFootEl.classList.toggle('absent', !showWY);

  mapWY = has4D() ? new SliceMap(el('mapWY'), {
    axes: [3, 1], dims: game.dims, wrap: game.wrap,
  }) : null;
  if (mapWY) {
    mapWY.cellFill = lava;
    // The full halo: on a flat panel a glow is real information about the
    // plane being drawn, rather than a restatement of a solid you can already
    // see.
    mapWY.glow = game.lavaGlow();
  }

  // Horizontal is x (west/east), vertical is z. North is negative z, so it
  // belongs at the TOP of the panel and south at the bottom -- which matches
  // both the arrow keys and the compass the main view is aimed along.
  // On a 2D board there is no z, so the panel's vertical axis is y instead --
  // which makes it simply the board, drawn flat, which is exactly what a 2D
  // lesson wants beside its 3D view.
  // Which plane the remaining panel draws.
  //
  // Always x-z: the panel is a plan view, looked at from above, pinning y.
  //
  // That holds at every dimension. In four it is the horizontal plane, with
  // the other panel covering w and y. In three it is the floor plan of the one
  // room, which is the map you want when the camera is low and looking into
  // the room rather than down at it -- the two views answer different
  // questions instead of repeating one. In two it is simply the board.
  const vAxis = 2;
  mapXZ = new SliceMap(el('mapXZ'), {
    axes: [0, vAxis], dims: game.dims, wrap: game.wrap,
    // z grows southward, and on a plan view seen from above south belongs at
    // the bottom -- so the coordinate and the screen run the same way.
    flipV: true,
  });
  mapXZ.cellFill = lava;
  mapXZ.glow = game.lavaGlow();
  el('over').classList.remove('show');
  updateHUD();
  if (pad) { pad.resetTaught(); pad.update(); }
}

// ---------------------------------------------------------------------------
// Projecting a 4D cell into the 3D scene.
//
// Three coordinates are drawn as space; the fourth picks which frame the cell
// belongs to, and the frame's position on the ring is added on. So a cell's
// place on screen says both where it is in its room AND which room that is.
// ---------------------------------------------------------------------------
// Where slot `w`'s frame stands right now.
//
// Every position in the scene goes through this, so the eased focus is applied
// in exactly one place and no call site can forget it. That matters because the
// ring turns: a frame's world position depends on where the focus has got to,
// and a single stale call would leave one thing behind while everything else
// moved.
function slotAt(w) {
  return ring.offset(w, slide.shown);
}

function proj(p) {
  const off = slotAt(wOf(p));
  return [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
}

// How prominent a cell is, given which slice has the focus. Other slices are
// drawn dimmer, so it is clear which room you are in without hiding what is
// waiting in the next one -- seeing the lava you are about to wrap into is the
// whole reason the other frames are on screen at all.
function wFade(p) {
  return wOf(p) === slide.focus ? 1 : 0.45;
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

  // The table the frames stand on: a 4D slab whose w-slice is what gets drawn,
  // so moving along the fourth dimension is visibly cutting a solid rather than
  // just changing rooms.
  //
  // Both the centre and the radius come from the ring's own geometry rather
  // than a guess. Ring.offset() places slot k at
  //
  //   [r sin(theta), 0, r cos(theta) - r]
  //
  // so the circle of frames is centred at z = -r, not at the origin -- that
  // "- r" is what keeps the focused frame at 6 o'clock. Cells are then drawn at
  // p + offset, so a room runs from its corner and its middle sits half a room
  // further along. Miss either term and the table sits visibly off centre.
  const tableMid = [X / 2 - 0.5, Z / 2 - 0.5 - ring.radius];
  // Far enough that the outermost frame stands fully on it: out to the ring,
  // plus the half-diagonal of a room, since it is a room's CORNER that reaches
  // furthest from the room's middle.
  // The furthest a frame's corner gets from the table's middle. Measured from
  // the ring rather than approximated: a frame at angle theta sits at
  // ring.offset(), and its own corner reaches half a room's diagonal past that.
  const reach = ring.radius + Math.hypot(X, Y, Z) / 2;
  // Passed as the table's inradius, so this is the distance the edge is
  // guaranteed to reach at every slice -- the frames stay on it whatever shape
  // it currently is, and it does not balloon when it comes round to a circle.
  // The margin is what makes it read as a surface continuing past the frames
  // rather than an edge they are perched on.
  table = new Table({ radius: reach * 1.15, y: -0.9 });
  table.group.position.set(tableMid[0], 0, tableMid[1]);
  world.add(table.group);

  // Hyperspheres standing about the table. Their 3D slices swell and vanish as
  // the player moves along w, which is the table's own trick told quickly and
  // in the small -- the table changes shape slowly, these appear out of nothing.
  //
  // Seeded, so a given board always has the same lights in the same places: the
  // scene should be somewhere you can come back to, not a new arrangement every
  // reload.
  //
  // Sat on the table's own group so they inherit its position, and given the
  // table's top as their mirror plane.
  if (has4D()) {
    orbs = new Orbs({
      depth: wDepth(),
      radius: ring.radius,
      y: -0.9 + 0.01,
      // Roughly where the camera rides, so the orbs hang around its line of
      // sight rather than below the bottom of the view. The orbit is not built
      // yet at this point, so this reconstructs its resting height from the
      // same two numbers it will use.
      eye: X * 4.2 * ZOOM_IN * Math.sin((LOOK_DOWN_DEG * Math.PI) / 180),
      rng: makeRng(ORB_SEED),
    });
    table.attached.add(orbs.group);
  } else {
    orbs = null;
  }

  const off = slotAt(slide.shown);
  const mid = [X / 2 - 0.5 + off[0], Y / 2 - 0.5 + off[1], Z / 2 - 0.5 + off[2]];
  // Far enough back that the focused room fits with air around it, and the
  // frames either side of it are readable at the edges of the view. Snake needs
  // more of this than unknot does: what is in the NEXT room decides the move
  // you are about to make, so the neighbours have to be legible rather than
  // merely present.
  //
  // ZOOM_IN is one notch of the scroll wheel, applied once. A wheel click is
  // deltaY 100, which the orbit turns into a factor of 1.12, so coming in by
  // one click is dividing by that. Expressed the same way the control is, so
  // "one click closer" stays true if the wheel's sensitivity is ever retuned.
  const rest = X * 4.2 * ZOOM_IN;
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
  // elevation is measured up from the horizontal, so this is the angle the view
  // looks DOWN by. Written in degrees because that is how it gets discussed and
  // how it gets tuned -- a radian expression here would have to be decoded
  // every time someone wanted to nudge it.
  // Square on to the focused frame. The same constant the table measures its
  // yaw from, so a fresh view sits at the table's own centre.
  orbit.az = Orbit.AZ0;
  // A board one cell deep in y is flat, and a flat board wants to be looked at
  // face-on rather than from 52 degrees up, where it is nearly edge-on and
  // almost unreadable. Looking straight down at it makes it the 2D board the
  // lesson says it is.
  const flat = game.dims.length > 1 && game.dims[1] === 1;
  // A board with no fourth dimension is one room seen on its own, with no ring
  // of frames behind it to look over. There is nothing to see past, so the
  // camera comes down to a shallower angle where the room reads as a room --
  // you are looking INTO it rather than down at its floor.
  const deg = flat ? 87 : (has4D() ? LOOK_DOWN_DEG : 35);
  orbit.el_ = (deg * Math.PI) / 180;
  aimAtFocus();
}

function buildFrames() {
  for (const o of [...frames.children]) {
    frames.remove(o);
    if (o.geometry) o.geometry.dispose();
  }
  for (const w of allSlices()) {
    frames.add(sliceFrame(dims3(), slotAt(w), w === slide.focus));
  }
  // No blocker: w wraps, so the ring closes and every step between frames is
  // one the snake can actually take. `ring.blockerSlot()` returns null here,
  // and that is the geometry stating the rule.
  // The blocker marks the gap between the last frame and the first, so it only
  // means anything when there are several frames to sit between. A board with
  // no fourth dimension has one frame and no gap; drawing a blocker there puts
  // a solid slab next to a flat board for no reason.
  const slot = has4D() ? ring.blockerSlot() : null;
  if (slot !== null) frames.add(blocker(dims3(), slotAt(slot)));
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
// How strongly a w hint is drawn. Faint: it is a warning about the next room,
// not a thing in this one.
const HINT_OPACITY = 0.05;

// Built once per game and left alone -- lava does not move. `slabs` keeps every
// lava mesh and every hint mesh, so the focus fade can reach them without
// walking the scene graph.
let slabs = [];

// Dim the slabs that are not in the focused slice, the same way the snake's own
// cells are dimmed. Without it every slab on the ring competes equally for
// attention and the room you are actually in stops standing out.
function fadeLava() {
  for (const m of slabs) {
    const f = m.userData.w === slide.focus ? 1 : 0.45;
    m.material.opacity = m.userData.baseOpacity * f;
  }
}

// Put every lava and hint slab where the turning ring has carried its slice.
//
// The frames and the snake are rebuilt from scratch on each step of the slide,
// but these are built once and kept -- so they are the one thing that would be
// left behind as the ring turned. Moving them is cheaper than rebuilding them,
// and they never change shape.
function placeSlabs() {
  for (const m of slabs) {
    const off = slotAt(m.userData.w);
    const c = m.userData.centre;
    m.position.set(c[0] + off[0], c[1] + off[1], c[2] + off[2]);
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
  // Fillet radius, in cells. A block's thinnest axis is one cell (0.98 wide
  // after the shrink), so 0.49 is the ceiling -- at that point the axis has no
  // flat left and the slab is a capsule. This sits just under it, which rounds
  // the corners hard while keeping a little flat on even the thinnest block.
  const R = 0.42;
  slabs = [];

  for (const b of game.lava) {
   for (let dw = 0; dw < boxDepth(b); dw++) {
    // The slab's extent in the three drawn axes. Cell centres sit on integers
    // and a cell is one across, so a run of n cells spans n.
    const size = [0, 1, 2].map((d) => b.size[d] * 0.98);
    const centre = [0, 1, 2].map((d) => b.origin[d] + (b.size[d] - 1) / 2);
    // Which slice this piece sits in, and where that slice's frame stands.
    // w wraps, so a block running off the end continues at the beginning.
    const w = (boxW(b) + dw) % wDepth();
    const off = slotAt(w);

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
    // The ring turns, so a slab's world position depends on where the focus has
    // got to. Keep its cell-space centre and which slice it is in, and let
    // placeSlabs() put it where it belongs on every frame of the slide.
    mesh.userData.centre = centre;
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

  // The hints: where lava sits one step along w.
  //
  // Drawn only for the w neighbours. A halo around a slab in the room you are
  // looking at repeats what the slab already says plainly, six times over, and
  // with three blocks spread across several slices each that was most of what
  // was on screen. Along w it is the one warning the view cannot otherwise
  // give: the lava is in the next room, one press of A or D away, where you
  // cannot see it. So a hint means exactly that, and nothing else.
  //
  // Drawn as ONE ROUNDED SLAB per block per edge, not as a heap of rounded
  // cells. That is the same mistake the lava itself used to make: rounding
  // each cell separately fillets every internal seam too, and a run of them
  // reads as a stack of separate pills rather than one shape. A hint is the
  // shadow of a block cast one step along w, so it has that block's own
  // footprint -- and it is drawn the way the block is, which is what makes the
  // two read as the same kind of thing.
  //
  // The two edge slices are the ones just before and just after the block's w
  // extent, wrapping like everything else on that axis. Checked against the
  // model's own cell-by-cell answer over 200 seeds: the two agree exactly.
  // R is the lava's own fillet radius, declared above -- the hints reuse it so
  // the two can never drift apart.
  const G = 0.94;   // a shade smaller than the lava, so it reads as a hint
  for (const b of game.lava) {
    const size = [0, 1, 2].map((d) => b.size[d] * G);
    const centre = [0, 1, 2].map((d) => b.origin[d] + (b.size[d] - 1) / 2);
    const depth = wDepth();
    const wLo = boxW(b);
    const wHi = boxW(b) + boxDepth(b) - 1;
    for (const we of [((wLo - 1) % depth + depth) % depth, (wHi + 1) % depth]) {
      // A block deep enough to wrap onto itself would put a hint inside its own
      // lava, which is not a hint at all -- skip it, exactly as the model does
      // when it refuses to light a cell that is already lava.
      if (b.cells().some((c) => wOf(c) === we)) continue;
      const off = slotAt(we);
      const mat = new THREE.MeshLambertMaterial({
        color: GLOW_COL, emissive: GLOW_COL, emissiveIntensity: 0.5,
        // Half the weight it used to carry. A hint is a warning about the next
        // room, not a thing in this one, and at the old strength a board with
        // several blocks on it still read as mostly hint.
        transparent: true, opacity: HINT_OPACITY, depthWrite: false,
      });
      // Rounded harder than the lava, which pulls the silhouette in and makes a
      // hint read as the smaller, softer thing it is. Past 0.49 a one-cell axis
      // has no flat left at all, so this is nearly the roundest it can be.
      const m = new THREE.Mesh(roundedBox(size, 0.47 * G, 8), mat);
      m.userData.centre = centre;
      m.position.set(centre[0] + off[0], centre[1] + off[1], centre[2] + off[2]);
      m.renderOrder = 0.6;
      m.userData.w = we;
      m.userData.baseOpacity = HINT_OPACITY;
      world.add(m);
      slabs.push(m);
    }
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

  // The hints get no wall mark.
  //
  // They had one briefly, and it was too much: the walls already carry the
  // snake, the head, the apple and the lava, and adding a fifth layer for a
  // warning about a room you are not in turned the projections into noise. The
  // hint solids in the room say it well enough, and the slice panel says it
  // exactly. A projection layer has to earn its place against everything else
  // sharing the same three walls.
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
    const hop = (i > 0 && wOf(body[i - 1]) !== wOf(p)) ||
                (i + 1 < n && wOf(body[i + 1]) !== wOf(p));
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
      if (wOf(p) !== wOf(q) || !adjacent3(p, q)) {
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
    // The slice fade is the base the pulse rides on, so an apple in another
    // room never pulses brighter than one in this one.
    m.userData.baseOpacity = f;
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
  // A flat board has nothing to project. The whole point of the wall marks is
  // to say where along each axis a thing sits when depth is hard to judge, and
  // on a board you are looking straight down at there is no depth to judge --
  // the marks just paint large shadows across the board itself.
  if (game.dims.length > 1 && game.dims[1] === 1) {
    for (const k of ['lavaProj', 'bodyProj', 'headProj', 'appleProj']) {
      if (parts[k]) setGeometry(parts[k], []);
    }
    return;
  }
  const eye = orbit.position();
  const bv = [], hv = [], av = [];
  const D3 = dims3();

  for (let i = 0; i < game.body.length; i++) {
    const cell = game.body[i];
    const p = proj(cell);
    const off = slotAt(wOf(cell));
    const nxt = game.body[i + 1];
    const joined = nxt && wOf(nxt) === wOf(cell) && adjacent3(cell, nxt);
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
    const off = slotAt(wOf(game.apple));
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
    for (let dw = 0; dw < boxDepth(b); dw++) {
      const off = slotAt((boxW(b) + dw) % wDepth());
      for (const { axis, at } of visibleWalls(eye, off, D3)) {
        const a = (axis + 1) % 3, c = (axis + 2) % 3;
        // The slab flattened onto this wall: its extent in the wall's two axes.
        const lo = [b.origin[a] - 0.5 + off[a], b.origin[c] - 0.5 + off[c]];
        const hi = [b.origin[a] + b.size[a] - 0.5 + off[a],
                    b.origin[c] + b.size[c] - 0.5 + off[c]];
        for (const v of wallRoundedRect(lo, hi, axis, at, 0.42)) {
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
// The camera does not move at all.
//
// The ring turns instead. The focused frame is always the one at the near point
// of the circle, so there is nothing for the camera to follow -- it sits where
// the player has aimed it and the world brings the right room to it.
//
// That is the whole reason for the change. A camera travelling round a ring to
// find its frame arrives from a different angle each time, and everything the
// player had lined up shifts under them; with the ring turning instead, the
// room in front of you is always the one you are playing in, in the same place
// on screen, at the same distance, whatever w you are at.
// ---------------------------------------------------------------------------
function aimAtFocus() {
  if (!orbit) return;
  const [X, Y, Z] = dims3();
  // slotAt(slide.shown) is the near point by construction -- the focused slot
  // sits at angle zero -- so this is a constant. It is written out rather than
  // hard-coded so that changing the ring's geometry moves the camera with it.
  const off = slotAt(slide.shown);
  orbit.target = [X / 2 - 0.5 + off[0], Y / 2 - 0.5 + off[1], Z / 2 - 0.5 + off[2]];
  orbit.onChange();

  // The table is reshaped here, alongside the camera, because the two follow
  // the same thing: the EASED focus, not the integer one, plus however far the
  // view has swung sideways. That is what makes the table transform
  // continuously as the ring turns rather than snapping when the slice changes,
  // and what keeps it moving with the rock instead of ignoring it.
  //
  // The camera's azimuth is measured from where it starts rather than from
  // zero, so a view that has not been dragged sits at the table's own centre
  // and the shapes land at the slices they were designed for.
  //
  // It has to be here rather than in the slide's stepping branch for the same
  // reason the camera does -- this runs every frame, and a table that only
  // caught up while a slide happened to be running would lag behind the world
  // it is holding up.
  if (table) {
    // The aim and the rock go in separately: the outline answers to the aim, so
    // it does not rebuild under the sway, while the marbling answers to both.
    table.update(slide.shown, wDepth(), orbit.az - Orbit.AZ0, ring.slots,
                 orbit.rockYaw);
  }
}

// ---------------------------------------------------------------------------
// Input.
// ---------------------------------------------------------------------------

function doMove(axis, sign) {
  if (game.over) return;
  const dir = dirVec(axis, sign, game.D);
  const before = wOf(game.head);
  const plan = game.move(dir);

  if (plan.kind === 'reversal') { pad.flash(axis, sign, false); return; }

  // Follow the head to its new slice. The ring takes the short way round, so a
  // wrap from the last frame to the first is one step of camera travel rather
  // than five backwards.
  if (game.head && wOf(game.head) !== before) slide.focus = wOf(game.head);

  buildFrames();
  redraw();
  updateHUD();
  pad.update();
  pad.flash(axis, sign, plan.kind !== 'die');

  // During a lesson the apple is the goal and death is a retry, so the
  // tutorial takes both rather than the ordinary game-over card appearing.
  if (tutorial && tutorial.active) {
    if (plan.eats) tutorial.solved();
    else if (game.over) setTimeout(() => tutorial.failed(), 700);
    return;
  }

  if (game.over) showGameOver();
}

// How a death reads as a sentence. The words live in copy.js; what happens
// here is choosing among them.

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function deathSentence() {
  const into = INTO[game.cause];
  if (!into) return '';
  const d = game.fatalDir;
  if (!d) return `${DIED_PLAINLY} ${into}.`;
  const axis = d.findIndex((v) => v !== 0);
  const key = `${axis}:${d[axis]}`;
  const ward = WARD[key];
  if (!ward) return `${DIED_PLAINLY} ${into}.`;
  return `You ${pick(VERBS_BY_DIR[key] || VERBS)} ${ward} ${into}.`;
}

function showGameOver() {
  el('overScore').textContent = game.score;
  el('overCause').textContent = deathSentence();
  el('over').classList.add('show');
}

// What the HUD says the board is. The real game's line is in the markup; a
// lesson replaces it, since "six cubes, six deep" is untrue of an 8x8 board
// and the first thing a new player reads should not be wrong.
function setBlurb(text) {
  const el2 = el('blurb');
  if (el2) el2.textContent = text;
}

function updateHUD() {
  el('score').textContent = game.score;
  el('length').textContent = game.length;
  // No slice readout: the panel below already shows which slice the head is in,
  // and shows it as a place rather than a number.
  drawSlice();
}

// Hand the slice panel the state it draws from. It runs on every board change
// rather than every frame: nothing on it moves except when the game does, so
// redrawing it in the render loop would be work for no picture.
function drawSlice() {
  if (!mapXZ) return;
  for (const m of [mapWY, mapXZ]) {
    if (!m) continue;
    m.focus = game.head;
    m.body = game.body;
    m.apple = game.apple;
    m.draw();
  }
  // Each panel says which axes it is holding still, since that is what decides
  // what it is showing and it changes with every move.
  // Each footer names the axes ITS panel is holding still, which depends on the
  // board. The w-y panel pins x and z, and only exists in four dimensions. The
  // other panel pins w and y in four dimensions, z alone in three, and nothing
  // in two -- where it is simply the whole board.
  const h = game.head;
  const wyFoot = el('mapWYFoot');
  if (wyFoot) {
    wyFoot.innerHTML = has4D() ? PANELS.pair('x', h[0], 'z', h[2]) : '';
  }
  const xzFoot = el('mapXZFoot');
  if (xzFoot) {
    // A flat board pins nothing worth naming: its one squashed axis is not a
    // place the player can be, so saying it is held fixed would be describing
    // a dimension they do not have.
    // The panel pins y always, and w as well when there is one. A flat board
    // has no y worth naming -- its single layer is not a place the player can
    // be -- so it says nothing.
    const flatBoard = game.dims.length > 1 && game.dims[1] === 1;
    if (has4D()) xzFoot.innerHTML = PANELS.pair('w', wOf(h), 'y', h[1]);
    else if (flatBoard) xzFoot.textContent = '';
    else xzFoot.innerHTML = PANELS.heldFixed('y', h[1]);
  }
}

function bindInput() {
  // The pad is split across the two map columns: the vertical/ana-kata keys
  // over the w-y panel, the arrows over the x-z panel. Each cluster sits above
  // the plane it moves in, which is what lets the panels drop their own axis
  // labels -- the key IS the label.
  pad = new Pad([el('padVertical'), el('padHorizontal')], {
    // Fade each cluster once the player has used all of its keys. It comes
    // back next run, so the offer is made again to anyone who wants it.
    teachOnly: true,
    onPush: (axis, sign) => doMove(axis, sign),
    // Only a reversal is greyed out. A step into lava or into your own flank
    // stays lit, because finding those out is the game -- a pad that refused
    // every fatal move would play it for you.
    // A direction the board does not have is not merely dead, it is absent:
    // the 2D lesson has no up, and offering a greyed-out W would suggest a
    // direction that will become available rather than one that does not
    // exist here.
    // A direction is present only if the board has room to move along it. An
    // axis one cell deep is a flat board's missing dimension, not a direction
    // you could take -- and offering it would let a tutorial that says "use
    // the arrows" be lost by pressing W.
    isPresent: (axis) => axis < game.D && game.dims[axis] > 1,
    isLive: (axis, sign) =>
      !game.over && game.plan(dirVec(axis, sign, game.D)).kind !== 'reversal',
  });
  // The pad's keys are gated on the menu being closed, so a press meant for the
  // menu never also moves the snake behind it.
  pad.bindKeys(window, () => !(pause && pause.open));

  addEventListener('keydown', (ev) => {
    // R is deliberately NOT bound.
    //
    // It used to restart mid-run, sitting one key away from the movement
    // cluster, which meant a good game was always one slip from being thrown
    // away for nothing. Restarting now lives in the pause menu, where it takes
    // a deliberate Escape and a click, and where it can be reconsidered.
    if (ev.key === ' ' || ev.code === 'Space') {
      ev.preventDefault();
      if (game.over) restartRun();
    }
  });
  el('restart').addEventListener('click', () => restartRun());

  // Escape opens the pause menu, which is the only way to abandon a run.
  // Snake has no clock, so there is nothing to stop -- but the menu still
  // pauses in the sense that matters: while it is up, a keypress meant for the
  // menu cannot also move the snake.
  pause = new PauseMenu({
    onRestart: () => restartRun(),
    // Replaying the tutorial is the one menu item that starts something other
    // than the game, so it is passed in rather than assumed.
    onTutorial: () => { pause.hide(); tutorial.start(); },
  });

  const REAL_BLURB = HUD.blurb;
  // A player sent here by another game returns to it when the lessons end.
  // They asked for that game; the tutorial is something they were given on the
  // way, and it should hand them back rather than leaving them somewhere else.
  const returnTo = tutorialReturnTo();
  tutorial = new Tutorial({
    onLesson: (lesson) => { newGame(lesson.opts); setBlurb(lesson.blurb); },
    onFinish: () => {
      if (returnTo) { location.replace(returnTo); return; }
      newGame();
      setBlurb(REAL_BLURB);
    },
    // The last card says "Play" normally, but "Back to Unknot" is a promise
    // about where the button goes, so it says so.
    finishLabel: returnTo ? TUTORIAL.finishAndReturn : TUTORIAL.finish,
  });
  // New visitors get it unasked -- including anyone redirected here by another
  // game, which is what the return address means.
  if (!tutorialSeen() || returnTo) tutorial.start();

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
    placeSlabs();
    redraw();
  }
  // Set the rock BEFORE aiming. aimAtFocus reads the camera's total lateral
  // angle to shape the table, so rocking afterwards would shape it from the
  // previous frame's swing -- which is small, constant, and reads exactly as
  // the table lagging the camera.
  if (orbit) {
    const r = rockAt(t - t0);
    // The rock exists to separate things that overlap in depth. A flat board
    // has no depth to separate, and near the top of the elevation range a
    // small nod swings the view a long way -- so a board seen face-on gets
    // none of it, and stays face-on.
    const flat = game.dims.length > 1 && game.dims[1] === 1;
    if (flat) orbit.rock(0, 0);
    else orbit.rock(r.yaw, r.tilt);
  }

  // Aim every frame, not only while the slide is stepping: a move sets the
  // focus and rebuilds the cells at their new absolute positions straight
  // away, so a camera that only caught up inside the stepping branch would sit
  // on the old frame while the data jumped to the new one.
  aimAtFocus();

  // The orbs are cut at BACKGROUND w, like the table and like every 4D prop
  // here: the camera's lateral angle turned into slices at the ring's own rate.
  // Turning the view is what reveals a different slice of the scenery, not
  // walking along the board's own fourth dimension.
  //
  // The only clock they get is the slow bob, which is why this is here rather
  // than in aimAtFocus.
  if (orbs && orbit) {
    orbs.update(tableW(slide.shown, orbit.az - Orbit.AZ0 + orbit.rockYaw,
                       ring.slots), t - t0);
  }

  // The rock swings the camera past a wall's plane now and then, which changes
  // which walls it can see into. Repaint when that happens -- not every frame,
  // since rebuilding the projection buffers is not free.
  if (parts && orbit) {
    const k = wallSetKey(orbit.position(),
                         allSlices().map((w) => slotAt(w)), dims3());
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

  // Pulse the apple, in the room and on the panel from the same clock, so the
  // two read as one object seen two ways.
  //
  // A soft pulse rather than the head's hard blink: the head is a caret and
  // wants an edge, the apple is a prize and should breathe. Different shapes
  // keep them from looking like the same kind of thing.
  const fade = pulseAt(t - t0);
  if (parts && parts.apple && !game.over) {
    const m = parts.apple.material;
    // The apple's own slice fade is its base, so a pulse never makes an apple
    // in another room look brighter than one in this one.
    const base = parts.apple.userData.baseOpacity;
    m.opacity = base * (0.55 + 0.45 * fade);
    m.emissiveIntensity = 0.35 + 0.5 * fade;
    m.transparent = true;
  }
  for (const m of [mapWY, mapXZ]) {
    if (!m) continue;
    m.appleFade = game.over ? 1 : fade;
    // Only the apple animates between moves, so redrawing the whole panel every
    // frame would be waste; the apple's own mark is updated in place instead.
    m.pulseApple();
  }

  renderer.render(scene, camera);
}

init();

// Handle for inspection from the console.
window.__snake = {
  newGame,
  // A single frame on demand. The animation loop is the only thing that draws,
  // and a headless or backgrounded tab does not run it -- so without this there
  // is no way to check what the scene looks like from a script.
  draw: () => render(performance.now()),
  get slide() { return slide; },
  get table() { return table; },
  get orbs() { return orbs; },
  get camera() { return camera; },
  get game() { return game; },
  get orbit() { return orbit; },
  get scene() { return scene; },
  THREE,
};
