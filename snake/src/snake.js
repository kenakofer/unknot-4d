// Snake, in as many dimensions as you like.
//
// The model knows nothing about drawing. Everything below is the rules: where
// the snake is, what a move does to it, and what ends the run. Keeping it apart
// from the view is what lets the same file run under Node in the test suite,
// where a bug is cheap to find, rather than only in a browser where it is not.
//
// The snake does not move on its own. A direction is a TURN, and the turn is
// the whole move -- one press, one step. That is a deliberate departure from
// arcade snake: this game is about reading a four-dimensional position, and a
// clock ticking underneath would make it a game about panic instead. It can be
// given a clock later without changing anything here.

import { key, eq, step, unitDirs, allCells, Box, randomBox, makeRng }
  from '../../shared/grid.js';

// Why a run ended. The view turns these into a sentence; the model just names
// them, so a test can assert on the cause rather than on prose.
export const CAUSE = {
  WALL: 'wall',
  LAVA: 'lava',
  SELF: 'self',
};

export const DEFAULTS = {
  dims: [6, 6, 6, 6],
  // Walls on every side, w included. The fourth axis used to wrap, which made
  // it feel like a direction that was always open -- but it also taught that
  // the fourth dimension is somehow unlike the other three, which is the
  // opposite of the point. It is a direction like any other, and it stops
  // where the box does. If wrapping comes back it will be on every axis at
  // once, for the same reason; the model still honours a per-axis `wrap`.
  wrap: [false, false, false, false],
  startLength: 4,
  lavaCount: 3,
  lavaSize: [3, 2, 2, 1],
  applePoints: 10,
  // An apple is worth two segments, and they arrive one per turn over the two
  // turns after eating rather than all at once. Growth you can see arriving is
  // growth you can plan around.
  growPerApple: 2,
};

export class Snake {
  constructor(opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    this.dims = cfg.dims.slice();
    this.wrap = cfg.wrap.slice();
    this.cfg = cfg;
    this.rng = cfg.rng || (cfg.seed === undefined ? Math.random : makeRng(cfg.seed));
    this.reset();
  }

  get D() { return this.dims.length; }

  reset() {
    const cfg = this.cfg;
    this.score = 0;
    this.over = false;
    this.cause = null;
    // Segments still owed to the tail. While this is positive the tail stays
    // put on a move, so the snake lengthens by one per turn.
    this.pending = 0;
    this.turns = 0;
    this.fatalDir = null;

    this.lava = this.placeLava();
    this._glowCache = null;
    this._appleWasPlaced = false;
    this.body = this.placeSnake();
    // The direction the head last travelled. Used only to reject a reversal --
    // the snake has no momentum of its own.
    this.heading = this.body.length > 1
      ? this.body[0].map((v, d) => this.axisDelta(this.body[1][d], v, d))
      : null;
    this.apple = null;
    this.placeApple();
  }

  // The signed step from `from` to `to` along axis `d`, taking the short way
  // round on a wrapping axis. On a 6-deep wrapping w, 5 -> 0 is +1, not -5.
  axisDelta(from, to, d) {
    let v = to - from;
    if (this.wrap[d]) {
      const n = this.dims[d];
      while (v > n / 2) v -= n;
      while (v < -n / 2) v += n;
    }
    return v;
  }

  // --- setup ---------------------------------------------------------------

  // Three blocks of the given proportions, in random orientations, none
  // overlapping another. Placement retries rather than solving anything: the
  // grid is 1296 cells and the blocks are 12, so a clear spot is found almost
  // at once, and a bounded retry keeps a pathological seed from hanging.
  placeLava() {
    // A lesson supplies its own obstacles: a tutorial that teaches "the wall is
    // in the way, go around it in the fourth dimension" needs the wall to be in
    // the way, which random placement cannot promise. Boxes are given as
    // {origin, size} and become Boxes here so a caller never has to import one.
    if (this.cfg.lava) {
      return this.cfg.lava.map((b) =>
        (b instanceof Box ? b : new Box(b.origin, b.size)));
    }
    const out = [];
    for (let i = 0; i < this.cfg.lavaCount; i++) {
      for (let tries = 0; tries < 200; tries++) {
        const b = randomBox(this.cfg.lavaSize, this.dims, this.rng);
        if (out.some((o) => o.overlaps(b))) continue;
        out.push(b);
        break;
      }
    }
    return out;
  }

  isLava(p) {
    return this.lava.some((b) => b.contains(p));
  }

  // Cells next to lava but not lava themselves -- where the glow goes.
  //
  // `axes` says which directions count as "next to". The default is all of
  // them, which is what a flat panel wants: it draws one plane, so a halo there
  // is genuine information about that plane.
  //
  // The 3D view asks for the w axis alone. In three dimensions the slab is
  // already drawn solid in the room you are looking at, so a halo around it
  // repeats what you can plainly see and multiplies the clutter by six. Along
  // w it is the opposite: lava one step into the next room is the one hazard
  // the view cannot show you from where you stand, and a halo is the only
  // warning available. Restricted this way the glow stops being decoration and
  // starts meaning exactly one thing -- there is lava one step along the fourth
  // dimension.
  //
  // Cached per axis set, since the lava never moves.
  lavaGlow(axes = null) {
    const which = axes || [...Array(this.D).keys()];
    const ck = which.join(',');
    this._glowCache = this._glowCache || new Map();
    if (this._glowCache.has(ck)) return this._glowCache.get(ck);
    const lit = new Set();
    const dirs = [];
    for (const d of which) {
      for (const sign of [-1, 1]) {
        const v = Array(this.D).fill(0);
        v[d] = sign;
        dirs.push(v);
      }
    }
    for (const b of this.lava) {
      for (const c of b.cells()) {
        for (const d of dirs) {
          const q = step(c, d, this.dims, this.wrap);
          if (q && !this.isLava(q)) lit.add(key(q));
        }
      }
    }
    this._glowCache.set(ck, lit);
    return lit;
  }

  // The starting snake: a straight run of `startLength`, laid along one of the
  // three DRAWN axes, somewhere with clear air all round the head.
  //
  // Two rules, both about not losing a run to something the player never had a
  // chance to react to:
  //
  //   Never along w. A snake laid along the fourth axis is spread across
  //   several frames of the ring at once -- the opening position is then a row
  //   of disconnected cubes in different rooms, which is the hardest possible
  //   thing to read and the least like a snake. Laid along x, y or z it starts
  //   as one line in one room, and the fourth dimension is somewhere to go
  //   rather than where you already are.
  //
  //   Nothing dangerous beside the head. Not just ahead of it: EVERY direction
  //   the head could turn must be survivable, so the first press can never be
  //   the last. A player who dies before they have understood the board has
  //   been cheated rather than beaten, and on a 6^4 grid there is no shortage
  //   of room to be fair with.
  placeSnake() {
    // Likewise a placed starting body, so a lesson can begin somewhere that
    // makes its point rather than somewhere random.
    if (this.cfg.body) return this.cfg.body.map((p) => p.slice());
    const n = this.cfg.startLength;
    // Only the axes drawn as one room are candidates -- see above. Three is
    // how many the view draws, not how many the board has.
    const pool = [...Array(Math.min(this.D, 3)).keys()];

    for (let tries = 0; tries < 800; tries++) {
      const axis = pool[Math.floor(this.rng() * pool.length)];
      const dir = Array(this.D).fill(0);
      dir[axis] = 1;
      const start = this.dims.map((s, d) => {
        if (d !== axis) return Math.floor(this.rng() * s);
        if (this.wrap[d]) return Math.floor(this.rng() * s);
        return Math.floor(this.rng() * Math.max(1, s - n));
      });
      // Build from the tail forward, so body[0] ends up the head.
      const cells = [];
      let p = start;
      let ok = true;
      for (let i = 0; i < n; i++) {
        if (!p || this.isLava(p)) { ok = false; break; }
        cells.push(p);
        p = step(p, dir, this.dims, this.wrap);
      }
      if (!ok) continue;
      const body = cells.reverse();
      if (!this.headHasRoom(body)) continue;
      return body;
    }

    // Nothing satisfied the full rule. Rather than return a position that could
    // kill on the first press, relax to the older, weaker test -- one clear
    // cell ahead -- so a pathological board still starts somewhere legal.
    for (let tries = 0; tries < 400; tries++) {
      const axis = pool[Math.floor(this.rng() * pool.length)];
      const dir = Array(this.D).fill(0);
      dir[axis] = 1;
      const start = this.dims.map((s, d) => (d === axis && !this.wrap[d]
        ? Math.floor(this.rng() * Math.max(1, s - n))
        : Math.floor(this.rng() * s)));
      const cells = [];
      let p = start;
      let ok = true;
      for (let i = 0; i < n; i++) {
        if (!p || this.isLava(p)) { ok = false; break; }
        cells.push(p);
        p = step(p, dir, this.dims, this.wrap);
      }
      if (!ok || !p || this.isLava(p)) continue;
      return cells.reverse();
    }

    // Still nothing, which a 6^4 grid with 36 lava cells makes vanishingly
    // unlikely. A straight run at the origin rather than nothing at all.
    return Array.from({ length: n }, (_, i) => {
      const p = Array(this.D).fill(0);
      p[0] = n - 1 - i;
      return p;
    });
  }

  // Is every direction the head could turn survivable?
  //
  // The neck is excluded, because pressing back into it is refused rather than
  // fatal -- it is not a way to die, so it is not a way to be trapped. Every
  // other direction must lead somewhere that exists, is not lava, and is not
  // the snake's own body.
  headHasRoom(body) {
    const head = body[0];
    const neck = body[1];
    for (let d = 0; d < this.D; d++) {
      for (const sign of [-1, 1]) {
        const dir = Array(this.D).fill(0);
        dir[d] = sign;
        const to = step(head, dir, this.dims, this.wrap);
        // Off the board: a wall right beside the head.
        if (!to) return false;
        // The neck is not a way to die; pressing that way does nothing.
        if (neck && eq(to, neck)) continue;
        if (this.isLava(to)) return false;
        if (body.some((b) => eq(b, to))) return false;
      }
    }
    return true;
  }

  occupied(p) {
    return this.body.some((b) => eq(b, p));
  }

  // Somewhere empty for the apple: not lava, not snake. There is always exactly
  // one on the board.
  placeApple() {
    // A lesson can name where the FIRST apple goes -- the one whose position is
    // the puzzle. Later apples are placed normally, since by then the lesson
    // has been made and a fixed apple would just be a fixed answer.
    if (this.cfg.apple && !this._appleWasPlaced) {
      this._appleWasPlaced = true;
      this.apple = this.cfg.apple.slice();
      return this.apple;
    }
    const free = allCells(this.dims).filter(
      (p) => !this.isLava(p) && !this.occupied(p));
    if (!free.length) { this.apple = null; return null; }
    this.apple = free[Math.floor(this.rng() * free.length)];
    return this.apple;
  }

  // --- the move ------------------------------------------------------------

  // Is `dir` the direction of the second segment? Pressing that way is ignored
  // rather than fatal: on a real snake the neck is simply not somewhere the
  // head can go, and killing the player for a keypress that means "stay put"
  // would be a trap rather than a rule.
  isReversal(dir) {
    if (this.body.length < 2) return false;
    const neck = this.body[1];
    const head = this.body[0];
    for (let d = 0; d < this.D; d++) {
      if (dir[d] !== this.axisDelta(head[d], neck[d], d)) return false;
    }
    return true;
  }

  // What a move in `dir` would do, without doing it. The view uses this to grey
  // out the pad, so what is possible is visible before it is tried.
  //
  // Note what is NOT greyed out: a step into lava or into the snake's own body
  // is perfectly legal and simply ends the run. Only a reversal is refused,
  // because only a reversal is a non-move. Greying out the fatal ones would
  // remove the whole game.
  plan(dir) {
    if (this.over) return { kind: 'over' };
    if (this.isReversal(dir)) return { kind: 'reversal' };
    const head = step(this.body[0], dir, this.dims, this.wrap);
    if (!head) return { kind: 'die', cause: CAUSE.WALL, head: null };
    if (this.isLava(head)) return { kind: 'die', cause: CAUSE.LAVA, head };
    // The tail cell vacates on this same move, so stepping into it is legal --
    // unless the snake is already growing, in which case the tail stays put and
    // it is a genuine collision. This is the one place the growth counter
    // changes what is safe, and getting it wrong is the classic snake bug.
    //
    // Eating on this very turn does NOT hold the tail (the apple's segments
    // start arriving next turn), so chasing your own tail into an apple is
    // legal -- and this must agree exactly with what move() does below, or the
    // pad would promise something the move refuses.
    const tailStays = this.pending > 0;
    const bodyHit = this.body.some((b, i) => {
      if (i === this.body.length - 1 && !tailStays) return false;
      return eq(b, head);
    });
    if (bodyHit) return { kind: 'die', cause: CAUSE.SELF, head };
    return { kind: 'move', head, eats: this.eatsAt(head) };
  }

  eatsAt(p) {
    return !!this.apple && eq(this.apple, p);
  }

  // Take a step. Returns the plan that was carried out, so a caller can react
  // to what happened without recomputing it.
  move(dir) {
    const plan = this.plan(dir);
    if (plan.kind === 'over' || plan.kind === 'reversal') return plan;

    this.turns++;
    if (plan.kind === 'die') {
      this.over = true;
      this.cause = plan.cause;
      // The direction that killed you, kept apart from `heading` -- which is
      // not updated on a fatal move and so still holds the way you were going
      // BEFORE the last press. The view names this one, since "you drove up
      // into the wall" is only true of the press that ended the run.
      this.fatalDir = dir.slice();
      // Carry the head into the fatal cell when there is one, so the view can
      // show the snake in the lava or in its own flank rather than stopping a
      // step short of the thing that killed it. A wall death has no cell to
      // move into.
      if (plan.head) this.body.unshift(plan.head);
      return plan;
    }

    this.body.unshift(plan.head);
    this.heading = dir.slice();

    // Whether the tail is held THIS turn is decided from what was already owed,
    // before the apple credits anything -- so an apple eaten now cannot also be
    // spent now. The turn you eat on is an ordinary turn: the head advances and
    // the tail moves up. The two segments the apple is worth then arrive one
    // per turn over the two turns after it, which is growth you can watch
    // coming and plan around.
    const holdTail = this.pending > 0;
    if (this.pending > 0) this.pending--;

    if (plan.eats) {
      this.score += this.cfg.applePoints;
      this.pending += this.cfg.growPerApple;
      this.placeApple();
    }

    // Growing means keeping the tail; otherwise it moves up.
    if (!holdTail) this.body.pop();

    return plan;
  }

  get head() { return this.body[0]; }
  get length() { return this.body.length; }
}
