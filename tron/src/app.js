// 4D Tron -- the view.
//
// Two players, one board, one clock. The rules live in tron.js and know nothing
// about any of this.
//
// The camera is the interesting departure from the other games here. Snake and
// Unknot both put the camera on the ring and travel it to whichever frame the
// player is in -- there is one player, so there is one right frame to face. With
// two players in different slices there is no such frame: following either one
// abandons the other, and following both means facing neither.
//
// So the main view stops trying. It is a fixed overview of the whole ring,
// framing every room at once, and the moment-to-moment reading moves to a slice
// panel per player -- which is exactly what a slice panel is for. The overview
// answers "where is everyone and how full is the board"; the panels answer
// "what is one step away from me", which with a clock running is the only
// question there is time for.

import { sendToTutorialIfNew, tutorialUrl } from '../../shared/tutorial-entry.js';
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { Tron, CAUSE, PLAYERS } from './tron.js';
import { Ring } from '../../shared/ring.js';
import { Orbit } from '../../shared/orbit.js';
import { Props, FAR_PLANE } from '../../shared/props.js';
import { rockAt } from '../../shared/rock.js';
import { dirVec, KEYMAP } from '../../shared/pad.js';
import { SliceMap } from '../../shared/slicemap.js';
import { Gamepads } from '../../shared/gamepad.js';
import { PauseMenu } from '../../shared/pause.js';
import { HUD, CONTROLLER, ROUND_OVER } from './copy.js';
import { addLights, sliceFrame, COLORS } from '../../shared/scene.js';

let scene, camera, renderer, game, ring, world, pads, pause, props;
let maps = [null, null];
let trailGroup = null, riderGroup = null;
const t0 = performance.now();

// The clock. `running` is false between rounds and while the match card is up,
// so the world holds still whenever there is something to read.
let running = false;
let lastTick = 0;
let tickMs = 420;

const el = (id) => document.getElementById(id);
const dims3 = () => game.dims.slice(0, 3);
const wDepth = () => game.dims[3];

// Fill in the fixed labels. The markup carries structure, copy.js carries
// words, and neither repeats the other.
function writeLabels() {
  const set = (id, text) => { const e = el(id); if (e) e.textContent = text; };
  set('title', HUD.title);
  set('roundLabel', HUD.round);
  set('freeLabel', HUD.cellsLeft);
  set('overScoreLabel', ROUND_OVER.roundsWon);
  PLAYERS.forEach((p) => set(`name${p.id}`, p.name));
  // The controller note starts as an invitation. It was only written when a
  // controller connected, which left it blank for everyone who has not
  // plugged one in -- exactly the people it is addressed to.
  set('padnote', CONTROLLER.none);
}

function init() {
  writeLabels();
  const canvas = el('view');
  // Stencil for the reflections on the table (see props.js).
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, FAR_PLANE);
  addLights(scene);

  newMatch();
  bindInput();
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(render);
}

function newMatch() {
  game = new Tron();
  tickMs = game.cfg.tickMs;
  ring = new Ring({ depth: wDepth(), span: Math.max(...dims3()), wrap: true,
                    gap: 1.25 });
  buildScene();
  buildMaps();
  startRound();
}

function startRound() {
  el('over').classList.remove('show');
  redraw();
  updateHUD();
  // A beat before the clock starts, so both players can see where they are
  // before the world starts moving. Starting the instant a round loads makes
  // the first two ticks a scramble rather than a decision.
  running = false;
  el('countdown').classList.add('show');
  let n = 3;
  el('countdown').textContent = n;
  clearInterval(startRound._timer);
  startRound._timer = setInterval(() => {
    n--;
    if (n > 0) { el('countdown').textContent = n; return; }
    clearInterval(startRound._timer);
    el('countdown').classList.remove('show');
    running = true;
    lastTick = performance.now();
  }, 700);
}

// ---------------------------------------------------------------------------
// The scene. Built once per match: the frames never move, and neither does the
// camera.
// ---------------------------------------------------------------------------
function buildScene() {
  if (world) {
    scene.remove(world);
    world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  world = new THREE.Group();
  scene.add(world);

  // Every slice gets its frame, and none of them is "focused" -- with two
  // players there is no one room the view belongs to, so highlighting one would
  // be picking a side. They are all drawn at the same weight, and the riders'
  // own colour is what tells each player where to look.
  for (let w = 0; w < wDepth(); w++) {
    world.add(sliceFrame(dims3(), ring.offset(w), false));
  }
  // No blocker: w wraps here as it does in Snake, so the ring closes.

  // The table the ring stands on, and the hyperspheres over it.
  props = new Props({ dims3: dims3(), ring, depth: wDepth(), orbs: wDepth() > 1 });
  world.add(props.group);

  trailGroup = new THREE.Group();
  riderGroup = new THREE.Group();
  world.add(trailGroup, riderGroup);

  aimCamera();
}

// A fixed vantage on the whole ring. High enough to see into the near rooms,
// far enough back that the far side of the ring is still on screen, and off the
// lattice axes so a trail running toward the camera does not collapse to a dot.
//
// The framing is measured rather than guessed: every frame's box is a room
// spanning [-0.5, dim - 0.5] around its ring offset, so the union of those is
// the whole world, and the distance that fits it is set by its bounding sphere
// and the camera's own field of view. Eyeballing these numbers is what put the
// camera inside the ring the first time.
function aimCamera() {
  const D3 = dims3();
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let w = 0; w < wDepth(); w++) {
    const o = ring.offset(w);
    for (let d = 0; d < 3; d++) {
      lo[d] = Math.min(lo[d], o[d] - 0.5);
      hi[d] = Math.max(hi[d], o[d] + D3[d] - 0.5);
    }
  }
  const centre = [0, 1, 2].map((d) => (lo[d] + hi[d]) / 2);
  const size = [0, 1, 2].map((d) => hi[d] - lo[d]);
  const bound = Math.hypot(...size) / 2;
  // The distance at which a sphere of that radius fills the vertical field of
  // view, with a little margin so it does not touch the edges of the screen.
  const fov = (camera.fov * Math.PI) / 180;
  const dist = (bound / Math.sin(fov / 2)) * 1.02;
  // Off-axis, as in Snake. Measured from the resting azimuth every game
  // shares, since that is the zero the table takes its yaw from.
  const az = Orbit.AZ0 + Math.PI / 7;
  // Lower than it was (54 degrees) so the top of the view reaches the horizon
  // and the orbs standing on it; the near rooms still read from here.
  const el_ = Math.PI * 0.21;
  camera.position.set(
    centre[0] + dist * Math.cos(el_) * Math.cos(az),
    centre[1] + dist * Math.sin(el_),
    centre[2] + dist * Math.cos(el_) * Math.sin(az)
  );
  camera.lookAt(centre[0], centre[1], centre[2]);
  camera.userData.centre = centre;
  camera.userData.dist = dist;
  camera.userData.az = az;
  camera.userData.el = el_;
}

function buildMaps() {
  for (const p of PLAYERS) {
    maps[p.id] = new SliceMap(el(`map${p.id}`), {
      axes: [3, 1], dims: game.dims, wrap: game.wrap,
    });
    maps[p.id].labels = ['A', 'D', 'S', 'W'];
    if (p.id === 1) maps[p.id].labels = ['LB', 'RB', 'B', 'A'];
  }
}

// ---------------------------------------------------------------------------
// Drawing the riders and their trails.
//
// A trail is a wall, so it is drawn as one: a solid cell in its owner's colour.
// The rider itself is a brighter, slightly larger cube, so the live end of the
// line is findable at a glance in a board that is mostly line.
// ---------------------------------------------------------------------------
function proj(p) {
  const off = ring.offset(p[3]);
  return [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
}

function redraw() {
  for (const g of [trailGroup, riderGroup]) {
    for (const o of [...g.children]) {
      g.remove(o);
      if (o.geometry) o.geometry.dispose();
    }
  }

  const cellGeo = new THREE.BoxGeometry(0.82, 0.82, 0.82);
  for (const p of PLAYERS) {
    const r = game.riders[p.id];
    // The trail, minus the cell the rider is standing in -- that one is drawn
    // as the rider.
    const cells = r.trail.slice(0, -1);
    if (cells.length) {
      const mat = new THREE.MeshLambertMaterial({
        color: p.colour, emissive: p.colour, emissiveIntensity: 0.34,
        transparent: true, opacity: 0.85,
      });
      const mesh = new THREE.InstancedMesh(cellGeo, mat, cells.length);
      const m4 = new THREE.Matrix4();
      cells.forEach((c, i) => {
        const q = proj(c);
        m4.makeTranslation(q[0], q[1], q[2]);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      trailGroup.add(mesh);
    }

    // The rider itself. In a board that is mostly trail, the live end of the
    // line has to be findable instantly, so it gets three things its trail does
    // not: full brightness, a larger cube, and a wireframe cage standing off it
    // that no trail cell has. The cage is what actually does the work -- colour
    // and size alone are lost among a hundred cells of the same colour.
    const alive = r.alive;
    const q = proj(r.at);
    const rm = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.0, 1.0),
      new THREE.MeshLambertMaterial({
        color: p.colour, emissive: p.colour,
        emissiveIntensity: alive ? 1.1 : 0.15,
        transparent: !alive, opacity: alive ? 1 : 0.5,
      })
    );
    rm.position.set(q[0], q[1], q[2]);
    rm.userData.player = p.id;
    riderGroup.add(rm);

    if (alive) {
      const cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.6, 1.6, 1.6)),
        new THREE.LineBasicMaterial({ color: p.colour, transparent: true,
                                      opacity: 0.85 })
      );
      cage.position.set(q[0], q[1], q[2]);
      cage.userData.isCage = true;
      riderGroup.add(cage);
    }
  }

  drawMaps();
}

function drawMaps() {
  for (const p of PLAYERS) {
    const m = maps[p.id];
    if (!m) continue;
    const r = game.riders[p.id];
    m.focus = r.at;
    // Both riders' trails go on both panels -- a panel that hid the opponent's
    // wall would be lying about what is one step away, which is the one thing
    // it exists to tell the truth about.
    //
    // Each wall is drawn in the colour of whoever laid it, so a player can see
    // at a glance whether the thing about to stop them is their own line or the
    // other rider cutting across. Those are completely different situations and
    // one colour for both would hide the difference.
    m.cellFill = (cell) => {
      // The cell the rider is standing in is the rider, drawn separately.
      if (cell[0] === r.at[0] && cell[1] === r.at[1] &&
          cell[2] === r.at[2] && cell[3] === r.at[3]) return null;
      const owner = game.walls.get(cell.join(','));
      if (owner === undefined) return null;
      const hex = '#' + PLAYERS[owner].colour.toString(16).padStart(6, '0');
      // Your own wall is drawn a little softer than theirs: both will kill you,
      // but the opponent's is the one that arrived without your choosing it.
      return { colour: hex, opacity: owner === p.id ? 0.5 : 0.85 };
    };
    m.glow = null;
    m.body = [r.at];
    m.apple = null;
    m.draw();
    el(`slice${p.id}`).textContent = `${r.at[3]}`;
  }
}

function updateHUD() {
  for (const p of PLAYERS) {
    el(`wins${p.id}`).textContent = game.wins[p.id];
    const r = game.riders[p.id];
    el(`state${p.id}`).textContent = r.alive ? '' : 'OUT';
  }
  el('round').textContent = game.round;
  el('free').textContent = game.freeCells;
}

// ---------------------------------------------------------------------------
// Input.
//
// Player one is on the keyboard, using exactly the shared layout -- arrows,
// W/S, A/D -- so nothing learned in Snake or Unknot has to be unlearned.
//
// Player two is on a controller. If none has been used yet, they fall back to a
// second keyboard set, because a browser cannot even see a gamepad until a
// button is pressed on it and a game that refused to start without one would be
// unplayable for the wrong reason.
// ---------------------------------------------------------------------------

// P2's keyboard fallback. Chosen to sit under a right hand on a shared
// keyboard, and to avoid every key P1 uses.
const P2_KEYS = {
  i: { axis: 2, sign: -1 }, k: { axis: 2, sign: 1 },
  j: { axis: 0, sign: -1 }, l: { axis: 0, sign: 1 },
  o: { axis: 1, sign: 1 },  u: { axis: 1, sign: -1 },
  n: { axis: 3, sign: -1 }, m: { axis: 3, sign: 1 },
};

function bindInput() {
  addEventListener('keydown', (ev) => {
    // R is not bound. Restarting lives in the pause menu, where it takes a
    // deliberate Escape and a click rather than one slip of the hand next to
    // the movement keys.
    if (pause && pause.open) return;
    if (ev.key === ' ') {
      ev.preventDefault();
      if (game.over) nextRound();
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    // Player two's fallback set is checked first, so its letters are never
    // also read as player one's W/S/A/D.
    const two = P2_KEYS[ev.key.toLowerCase()];
    if (two) { ev.preventDefault(); turn(1, two.axis, two.sign); return; }

    const one = KEYMAP[ev.key];
    if (one) { ev.preventDefault(); turn(0, one.axis, one.sign); }
  });

  pads = new Gamepads({
    onPress: (axis, sign, index) => {
      // The first controller drives player two. A second one, if anybody has
      // two, drives player one -- so two people on controllers works without
      // anyone touching the keyboard.
      turn(index === 0 ? 1 : 0, axis, sign);
    },
    onConnect: () => updatePadNote(),
    onDisconnect: () => updatePadNote(),
  });

  el('again').addEventListener('click', () => {
    if (game.matchOver) newMatch(); else nextRound();
  });

  // Tron has a real clock, so pausing has to stop it -- and resuming has to
  // restart it from NOW rather than from whenever the last tick was, or the
  // world would jump forward by however long the menu was open.
  //
  // `wasRunning` is remembered so that opening the menu between rounds, while
  // the countdown is up, does not start the clock on resume.
  let wasRunning = false;
  pause = new PauseMenu({
    onRestart: newMatch,
    // The tutorial runs on Snake's board and returns here when it ends.
    onTutorial: () => { location.href = tutorialUrl(); },
    onPause: () => { wasRunning = running; running = false; },
    onResume: () => { running = wasRunning; lastTick = performance.now(); },
  });
}

function turn(id, axis, sign) {
  if (!game || game.over) return;
  // A controller must not steer through the menu any more than a keyboard can.
  if (pause && pause.open) return;
  if (axis >= game.D) return;
  game.turn(id, dirVec(axis, sign, game.D));
}

function updatePadNote() {
  const n = pads ? pads.count : 0;
  el('padnote').textContent = n ? CONTROLLER.some(n) : CONTROLLER.none;
}

function nextRound() {
  if (game.matchOver) { newMatch(); return; }
  game.newRound();
  buildScene();
  startRound();
}

const CAUSE_TEXT = ROUND_OVER.cause;

function showRoundOver() {
  const card = el('over');
  if (game.matchOver) {
    const w = PLAYERS[game.matchWinner];
    el('overTitle').textContent = ROUND_OVER.matchWinner(w.name);
    el('overTitle').style.color = '#' + w.colour.toString(16).padStart(6, '0');
    el('overCause').textContent = `${game.wins[0]} – ${game.wins[1]}`;
    el('again').textContent = ROUND_OVER.newMatch;
  } else if (game.winner === null) {
    el('overTitle').textContent = ROUND_OVER.draw;
    el('overTitle').style.color = '';
    el('overCause').textContent = both();
    el('again').textContent = ROUND_OVER.nextRound;
  } else {
    const w = PLAYERS[game.winner];
    const l = PLAYERS[1 - game.winner];
    el('overTitle').textContent = ROUND_OVER.roundWinner(w.name);
    el('overTitle').style.color = '#' + w.colour.toString(16).padStart(6, '0');
    el('overCause').textContent =
      ROUND_OVER.lostBy(l.name, CAUSE_TEXT[game.riders[l.id].cause] || 'out');
    el('again').textContent = ROUND_OVER.nextRound;
  }
  el('overScore').textContent = `${game.wins[0]} – ${game.wins[1]}`;
  card.classList.add('show');
}

function both() {
  const a = CAUSE_TEXT[game.riders[0].cause];
  const b = CAUSE_TEXT[game.riders[1].cause];
  return a === b ? ROUND_OVER.bothWent(a)
    : ROUND_OVER.eachWent(PLAYERS[0].name, a, PLAYERS[1].name, b);
}

// ---------------------------------------------------------------------------
// The loop.
// ---------------------------------------------------------------------------
function render(now) {
  const t = now || performance.now();
  if (pads) pads.poll();

  if (running && !game.over && t - lastTick >= tickMs) {
    lastTick = t;
    game.step();
    redraw();
    updateHUD();
  }

  // Noticing the round has ended is kept OUT of the branch above, so it does
  // not depend on the round having ended inside a tick. Anything that finishes
  // a round -- the tick, a console call, a future spectator mode -- lands here
  // and shows the card exactly once.
  if (game.over && running) {
    running = false;
    // A moment on the final frame before the card covers it: seeing what
    // killed you is most of what makes the next round better.
    setTimeout(showRoundOver, 550);
  }

  // The camera holds still, but the rock still rides on it -- the parallax is
  // what separates trails that overlap in any one still view, and with a board
  // that fills up with lines it earns its keep more here than anywhere else.
  const c = camera.userData;
  if (c && c.centre) {
    const r = rockAt(t - t0);
    const az = c.az + r.yaw, el_ = c.el + r.tilt;
    camera.position.set(
      c.centre[0] + c.dist * Math.cos(el_) * Math.cos(az),
      c.centre[1] + c.dist * Math.sin(el_),
      c.centre[2] + c.dist * Math.cos(el_) * Math.sin(az)
    );
    camera.lookAt(c.centre[0], c.centre[1], c.centre[2]);
    // There is no focus to slide between here, so the scenery's w comes from
    // the camera alone: its fixed offset from the resting azimuth, plus the
    // rock (see props.js).
    if (props) props.update(0, c.az - Orbit.AZ0, r.yaw, t - t0, camera);
  }

  renderer.render(scene, camera);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

// A first-time visitor is sent to the movement tutorial before the game loads.
// It runs on Snake's board -- the fourth dimension has to be used to be
// learned, and that is the simplest game to use it in -- and hands the player
// back here when it ends. If it redirects, there is no point building a scene
// nobody will see.
if (!sendToTutorialIfNew()) init();

window.__tron = {
  get game() { return game; },
  get pads() { return pads; },
  step: () => { game.step(); redraw(); updateHUD(); },
  showRoundOver,
  nextRound,
  set running(v) { running = v; },
  get running() { return running; },
  THREE,
};
