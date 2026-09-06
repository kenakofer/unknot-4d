// Tron, in four dimensions.
//
// Two riders move one cell per tick, always, whether or not anyone presses
// anything. Every cell either of them leaves becomes a permanent wall. Crash
// into a wall, a trail, the board edge, or each other, and the round is over.
// The space only ever gets smaller, so a round always ends.
//
// This is the opposite design to Snake's, deliberately. Snake has no clock
// because it is about reading a four-dimensional position carefully. Tron has
// one because it is about committing to a line and living with it -- and a
// fourth direction you can flee down changes that calculation in a way three
// dimensions cannot.
//
// The model knows nothing about drawing, input, or how many dimensions there
// are.

import { key, eq, step, allCells, makeRng } from '../../shared/grid.js';
import { PLAYER_NAMES } from './copy.js';

// Why a rider died. The view turns these into a sentence.
export const CAUSE = {
  WALL: 'wall',
  TRAIL: 'trail',
  SELF: 'self',
  HEAD_ON: 'head-on',
};

export const DEFAULTS = {
  dims: [6, 6, 6, 6],
  // Walls on x, y and z; w wraps. Same asymmetry as Snake, for the same
  // reason: the fourth direction should feel like somewhere you can always go.
  // Here it does more work than in Snake, because a rider cut off in three
  // dimensions can still have a lane open in the fourth.
  wrap: [false, false, false, true],
  // How long a tick is, in ms. The view owns the actual clock; the model just
  // says what a tick does.
  tickMs: 420,
  // Rounds needed to take the match.
  rounds: 3,
};

// Two riders, their colours fixed here so the model, the HUD, the trails and
// the slice panels can never disagree about who is who.
export const PLAYERS = [
  { id: 0, name: PLAYER_NAMES[0], colour: 0x35e3f0 },
  { id: 1, name: PLAYER_NAMES[1], colour: 0xff9e6d },
];

export class Tron {
  constructor(opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    this.dims = cfg.dims.slice();
    this.wrap = cfg.wrap.slice();
    this.cfg = cfg;
    this.rng = cfg.rng || (cfg.seed === undefined ? Math.random : makeRng(cfg.seed));
    this.wins = [0, 0];
    this.round = 0;
    this.newRound();
  }

  get D() { return this.dims.length; }

  // --- setting up a round --------------------------------------------------

  newRound() {
    this.round++;
    this.over = false;
    this.winner = null;      // player id, or null for a draw
    this.tick = 0;

    const [a, b] = this.startPositions();
    this.riders = [
      this.makeRider(0, a.at, a.heading),
      this.makeRider(1, b.at, b.heading),
    ];
    // Every occupied cell, as a key -> rider id. One map for both riders: a
    // trail is a wall whoever laid it, and looking up "is this cell taken" has
    // to be one question rather than two.
    this.walls = new Map();
    for (const r of this.riders) this.walls.set(key(r.at), r.id);
  }

  makeRider(id, at, heading) {
    return {
      id,
      at: at.slice(),
      heading: heading.slice(),
      // What the player has asked for next. Applied at the top of the tick, so
      // a press between ticks is never lost and never applied twice.
      want: null,
      alive: true,
      cause: null,
      // The cells this rider has left, oldest first -- the view draws these.
      trail: [at.slice()],
    };
  }

  // The two riders start facing each other along the longest axis, offset so
  // neither is on the other's line. Head-on from the first tick would make the
  // opening a coin flip rather than a game.
  startPositions() {
    const D = this.D;
    const mid = this.dims.map((n) => Math.floor(n / 2));
    // Face each other along axis 0.
    const a = mid.slice(); a[0] = 1;
    const b = mid.slice(); b[0] = this.dims[0] - 2;
    // Offset on axis 2 so their opening lines do not meet.
    if (D > 2) {
      a[2] = Math.max(0, mid[2] - 1);
      b[2] = Math.min(this.dims[2] - 1, mid[2] + 1);
    }
    const east = Array(D).fill(0); east[0] = 1;
    const west = Array(D).fill(0); west[0] = -1;
    return [{ at: a, heading: east }, { at: b, heading: west }];
  }

  // --- input ---------------------------------------------------------------

  // Ask a rider to turn. The turn is not taken now -- it is remembered and
  // applied at the next tick, so the clock stays the only thing that moves the
  // world and a fast double-press cannot smuggle in two moves per tick.
  //
  // Reversing into your own trail is refused rather than fatal: the cell right
  // behind you is always your own trail, so a reversal is never anything but
  // instant death, and a control that exists only to kill you is a trap.
  turn(id, dir) {
    const r = this.riders[id];
    if (!r || !r.alive || this.over) return false;
    if (this.isReversal(r, dir)) return false;
    r.want = dir.slice();
    return true;
  }

  isReversal(rider, dir) {
    for (let d = 0; d < this.D; d++) {
      if (dir[d] !== -rider.heading[d]) return false;
    }
    return true;
  }

  // --- the tick ------------------------------------------------------------

  // Advance the world one tick. Both riders move at once, which is what makes
  // the collision rules below more than a formality: with simultaneous moves
  // there is no "first" rider whose trail is already down when the second
  // arrives, and resolving them in array order would quietly hand player one
  // every tie.
  step() {
    if (this.over) return null;
    this.tick++;

    // 1. Apply the turns everyone asked for.
    for (const r of this.riders) {
      if (r.alive && r.want) { r.heading = r.want; r.want = null; }
    }

    // 2. Work out where everyone is going, without moving anyone yet.
    const moves = this.riders.map((r) => {
      if (!r.alive) return null;
      const to = step(r.at, r.heading, this.dims, this.wrap);
      return { rider: r, to };
    });

    // 3. Head-on first: two riders claiming the same empty cell, or swapping
    //    places through each other. This is judged BEFORE the trail check,
    //    because a swap looks like each rider driving into the other's
    //    occupied cell and would otherwise be reported as two trail hits --
    //    true in a sense, but it is a head-on, and the players will read it as
    //    one. Neither can be said to have hit a wall the other had already
    //    laid, so both go and the round is a draw.
    const deaths = [];
    const dead = new Set();
    const kill = (rider, cause) => {
      if (dead.has(rider)) return;
      dead.add(rider);
      deaths.push([rider, cause]);
    };

    const live = moves.filter((m) => m && m.to);
    if (live.length === 2) {
      const [p, q] = live;
      const sameCell = eq(p.to, q.to);
      const swapped = eq(p.to, q.rider.at) && eq(q.to, p.rider.at);
      if (sameCell || swapped) {
        kill(p.rider, CAUSE.HEAD_ON);
        kill(q.rider, CAUSE.HEAD_ON);
      }
    }

    // 4. Then the walls, judged against the board as it stood at the START of
    //    the tick -- minus the cells the riders are themselves leaving.
    //
    //    That subtraction is the whole subtlety of simultaneous movement. Both
    //    riders committed to their move when neither had yet laid this tick's
    //    wall, so a rider must not be killed by a cell its opponent is
    //    vacating on the very same tick. Judging against `this.walls` as-is
    //    would do exactly that, and would hand the win to whichever rider the
    //    array happened to list first.
    const vacating = new Set();
    for (const m of moves) {
      if (m && m.to) vacating.add(key(m.rider.at));
    }
    for (const m of moves) {
      if (!m) continue;
      if (!m.to) { kill(m.rider, CAUSE.WALL); continue; }
      const k = key(m.to);
      if (vacating.has(k)) continue;   // being left as we speak; not a wall
      const owner = this.walls.get(k);
      if (owner !== undefined) {
        kill(m.rider, owner === m.rider.id ? CAUSE.SELF : CAUSE.TRAIL);
      }
    }

    // 5. Move everyone who is still going, and lay their trail. This happens
    //    even for a rider that died this tick when it had somewhere to go: it
    //    should be drawn in the cell that killed it rather than a step short.
    for (const m of moves) {
      if (!m || !m.to) continue;
      // The cell being left becomes this rider's wall: it is behind them now,
      // and it is what makes the board shrink. (It was already in the map from
      // the moment they arrived, so this is only re-asserting ownership -- but
      // stating it here is what makes the trail and the wall map the same
      // thing rather than two records that could drift.)
      this.walls.set(key(m.rider.at), m.rider.id);
      m.rider.at = m.to;
      m.rider.trail.push(m.to.slice());
      // A rider that died does not claim the cell it crashed into -- that cell
      // belongs to whatever killed it, or to nobody if it was the edge.
      if (!dead.has(m.rider)) this.walls.set(key(m.to), m.rider.id);
    }

    // 6. Apply the deaths, and see whether the round is finished.
    for (const [rider, cause] of deaths) {
      if (!rider.alive) continue;
      rider.alive = false;
      rider.cause = cause;
    }
    this.checkRoundOver();
    return { tick: this.tick, deaths: deaths.map(([r, c]) => ({ id: r.id, cause: c })) };
  }

  checkRoundOver() {
    const alive = this.riders.filter((r) => r.alive);
    if (alive.length > 1) return;
    this.over = true;
    this.winner = alive.length === 1 ? alive[0].id : null;
    if (this.winner !== null) this.wins[this.winner]++;
  }

  // The match is done when someone has taken enough rounds.
  get matchOver() {
    return Math.max(...this.wins) >= this.cfg.rounds;
  }

  get matchWinner() {
    if (!this.matchOver) return null;
    return this.wins[0] > this.wins[1] ? 0 : 1;
  }

  resetMatch() {
    this.wins = [0, 0];
    this.round = 0;
    this.newRound();
  }

  // --- queries the view and the tests use ----------------------------------

  occupied(p) {
    return this.walls.has(key(p));
  }

  // What a rider's next tick would do if nothing changed. The view uses this
  // to warn a player their current line is about to end -- with a clock
  // running there is no time to work it out, and a rider who dies to a wall
  // they could not see was cheated rather than beaten.
  lookahead(id) {
    const r = this.riders[id];
    if (!r || !r.alive) return null;
    const dir = r.want || r.heading;
    const to = step(r.at, dir, this.dims, this.wrap);
    if (!to) return { to: null, fatal: true, cause: CAUSE.WALL };
    const owner = this.walls.get(key(to));
    if (owner !== undefined) {
      return { to, fatal: true, cause: owner === id ? CAUSE.SELF : CAUSE.TRAIL };
    }
    return { to, fatal: false, cause: null };
  }

  // Which directions are still survivable from where a rider stands. Not shown
  // as a hint during play -- that would play the game for you -- but the view
  // greys out the one direction that is refused outright, and the tests use
  // this to check a rider is never boxed in without the model noticing.
  openDirections(id) {
    const r = this.riders[id];
    if (!r || !r.alive) return [];
    const out = [];
    for (let d = 0; d < this.D; d++) {
      for (const s of [-1, 1]) {
        const dir = Array(this.D).fill(0);
        dir[d] = s;
        if (this.isReversal(r, dir)) continue;
        const to = step(r.at, dir, this.dims, this.wrap);
        if (to && !this.occupied(to)) out.push(dir);
      }
    }
    return out;
  }

  // How much of the board is still free. The view shows this: watching it fall
  // is watching the round approach its end.
  get freeCells() {
    let n = 1;
    for (const d of this.dims) n *= d;
    return n - this.walls.size;
  }
}
