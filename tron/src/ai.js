// A rider for the computer to drive, when nobody has joined as player two.
//
// Tron needs two riders and a browser cannot see a controller until somebody
// presses a button on it, so the honest default -- an empty seat, a rider
// driving straight into a wall on tick six -- is the worst thing the game could
// do with its opening minute. This fills the seat until a person takes it.
//
// The whole of it is one idea: DO NOT GET SHUT IN. A Tron round is lost long
// before the crash, at the moment the rider seals itself into a pocket smaller
// than the one it left, and no amount of clever chasing matters next to that.
// So each candidate direction is scored by how much board is still reachable
// after taking it -- a flood fill from the cell it would land on -- and the
// biggest room wins. That single rule produces most of what looks like skill:
// it hugs walls (a step along a wall costs almost no space), it refuses to
// enter a corridor that dead-ends, and it takes the fourth dimension whenever
// three-dimensional space is closing, because the flood fill counts cells in
// every axis without being told how many there are.
//
// Like the model it plays, this knows nothing about drawing, and nothing about
// how many dimensions there are.

import { key, step, unitDirs } from '../../shared/grid.js';

// How much weight each consideration carries, all measured in cells so they can
// be added at all. Reachable space is the unit; everything else is a nudge
// worth a few cells, which is the point -- a nudge must never talk the rider
// into a smaller room.
export const WEIGHTS = {
  // Prefer holding the current line. Without this the rider jitters between
  // equal-scoring directions every tick, which reads as a machine rather than
  // a rider, and lays a staircase of trail that wastes its own space.
  straight: 2.5,
  // Prefer keeping away from the other rider. Small: this is a tiebreak among
  // roomy directions, not a reason to take a cramped one. Tron is not a chase.
  distance: 0.6,
  // Cells one step further out that are themselves free. A cell with open
  // neighbours is somewhere you can leave again; a cell with none is a hole
  // that the flood fill alone rates as generously as open ground.
  breathing: 1.2,
};

// The two opponents, and they are genuinely two different players rather than
// one player turned down.
//
// EASY does the one thing that keeps a Tron round going: it holds its line, and
// swerves only when the next cell would kill it. Nothing else. That is a real
// opponent to a new player -- it never crashes on its own, so beating it means
// actually cutting it off -- and it is beatable by anyone, because it will
// never cut YOU off on purpose, and it will happily wall itself into a pocket
// it could have seen coming.
//
// The `mistake` chance is what stops even that from being airtight. One time in
// a hundred it does not look before it moves, which is the difference between
// an opponent that can only be out-manoeuvred and one that occasionally just
// loses -- and on a board this size, "occasionally" is about once a round.
//
// HARD is the flood fill below: it counts the space each direction leaves it
// and takes the biggest room, which is most of what good Tron is.
export const LEVELS = {
  easy: { look: true, mistake: 0.01 },
  hard: { horizon: 1200, blunder: 0 },
};

export const DEFAULT_LEVEL = 'easy';

// Bigger than any room the fill can report, so avoiding a cell the opponent
// might also take always beats whatever space that cell led to.
const HEAD_ON_PENALTY = 1e6;

export class Rider {
  // `level` is a key of LEVELS, or an object of the same shape.
  constructor({ level = DEFAULT_LEVEL, rng = Math.random } = {}) {
    this.cfg = typeof level === 'string'
      ? LEVELS[level] || LEVELS[DEFAULT_LEVEL] : level;
    this.rng = rng;
  }

  // The direction this rider wants to take next, or null to carry straight on
  // -- which is also what it answers when nothing survivable is left, since
  // every choice ends the same way then and a rider that dies going somewhere
  // reads better than one that dies swerving.
  choose(game, id) {
    const me = game.riders[id];
    if (!me || !me.alive || game.over) return null;
    return this.cfg.look ? this.swerve(game, id) : this.fill(game, id);
  }

  // --- easy: hold the line, turn at the last moment ------------------------
  //
  // The rider looks exactly one cell ahead. If the cell it is about to enter is
  // free it keeps going, and if it is not, it turns -- into the roomiest of the
  // directions still open, judged only by how many free neighbours each one has
  // rather than by any fill. One cell of foresight is the whole character of
  // this opponent: it is why it survives an open board indefinitely and why it
  // still drives into pockets, which is precisely the mistake a new player is
  // learning not to make.
  swerve(game, id) {
    const me = game.riders[id];
    const ahead = step(me.at, me.heading, game.dims, game.wrap);
    const doomed = !ahead || game.occupied(ahead);
    // The mistake: it simply does not look this tick. Harmless on open board --
    // it was going straight anyway -- and fatal exactly when it mattered, which
    // is the point.
    if (!doomed || this.rng() < this.cfg.mistake) return null;

    const options = [];
    for (const dir of unitDirs(game.D)) {
      if (game.isReversal(me, dir)) continue;
      const to = step(me.at, dir, game.dims, game.wrap);
      if (!to || game.occupied(to)) continue;
      options.push({ dir, score: this.open(game, to, me) });
    }
    if (!options.length) return null;
    // Among equally roomy turns, take one at random rather than the first by
    // axis order -- a rider that always turns the same way on a wall traces a
    // recognisable staircase, and once a player sees it the opponent stops
    // being one. The rng is the game's, so a seeded replay is still exact.
    const best = Math.max(...options.map((o) => o.score));
    const tied = options.filter((o) => o.score === best);
    return tied[Math.floor(this.rng() * tied.length)].dir;
  }

  // --- hard: take the biggest room ----------------------------------------
  fill(game, id) {
    const scored = this.rank(game, id);
    if (!scored.length) return null;
    // A blunder is the second-best move, not a random one. Randomness would
    // send the rider into walls, which is not a mistake a player recognises;
    // taking the smaller of two good rooms is exactly the mistake they make
    // themselves, and it is the one they can punish.
    if (scored.length > 1 && this.cfg.blunder &&
        this.rng() < this.cfg.blunder) return scored[1].dir;
    return scored[0].dir;
  }

  // Every direction worth taking, best first, with the score that got it there.
  // Exposed rather than kept inside `choose` because it is the whole of the
  // reasoning, and a test that can only see the answer cannot say why it was
  // wrong.
  rank(game, id) {
    const me = game.riders[id];
    const other = game.riders.find((r) => r !== me && r.alive);
    // The cells the opponent could occupy next tick. Driving into one is not a
    // certain death -- they may go elsewhere -- but it is a coin flip on a
    // board where there is almost always a move that is not, and this rider is
    // not here to gamble.
    const contested = new Set();
    if (other) {
      for (const d of unitDirs(game.D)) {
        const to = step(other.at, d, game.dims, game.wrap);
        if (to && !game.occupied(to)) contested.add(key(to));
      }
    }

    const out = [];
    for (const dir of unitDirs(game.D)) {
      // The model refuses a reversal outright, so scoring one would be
      // scoring a move that will never be taken.
      if (game.isReversal(me, dir)) continue;
      const to = step(me.at, dir, game.dims, game.wrap);
      if (!to || game.occupied(to)) continue;

      let score = this.room(game, to, me);
      score += this.open(game, to, me) * WEIGHTS.breathing;
      if (sameDir(dir, me.heading)) score += WEIGHTS.straight;
      if (other) score += manhattan(to, other.at) * WEIGHTS.distance;
      // Worth more than any room: the penalty has to outweigh the space a
      // head-on cell usually sits in, or the rider would drive into one every
      // time the open board happened to lie that way. A direction that is only
      // maybe fatal still loses to any direction that is not.
      if (contested.has(key(to))) score -= HEAD_ON_PENALTY;

      out.push({ dir, score, to });
    }
    // Ties broken by axis order rather than by chance, so a seeded game replays
    // exactly -- the model promises that and its opponent must not break it.
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  // How many cells are reachable from `from`, stopping at `horizon`.
  //
  // The rider's own cell is treated as free: it is about to be vacated, and
  // counting it as a wall would make every direction look one cell poorer than
  // it is, uniformly, which changes nothing -- but it would also cut a corridor
  // in half that the rider is standing in the middle of, which changes a lot.
  //
  // The horizon is a budget, not a difficulty. Any room past about a thousand
  // cells is "as much space as I could want", and choosing between two of them
  // on exact size is meaningless -- so stopping there costs nothing in
  // judgement while bounding the work, which matters because this runs inside
  // a render loop with a 420ms clock and eight directions to score per tick.
  room(game, from, me) {
    const seen = new Set([key(from)]);
    const queue = [from];
    let n = 0;
    const mine = key(me.at);
    for (let i = 0; i < queue.length && n < this.cfg.horizon; i++) {
      const p = queue[i];
      n++;
      for (const d of unitDirs(game.D)) {
        const q = step(p, d, game.dims, game.wrap);
        if (!q) continue;
        const k = key(q);
        if (seen.has(k)) continue;
        if (k !== mine && game.occupied(q)) continue;
        seen.add(k);
        queue.push(q);
      }
    }
    return n;
  }

  // How many of a cell's neighbours are free. See WEIGHTS.breathing: the flood
  // fill measures the room, this measures the doorway.
  open(game, at, me) {
    const mine = key(me.at);
    let n = 0;
    for (const d of unitDirs(game.D)) {
      const q = step(at, d, game.dims, game.wrap);
      if (q && (key(q) === mine || !game.occupied(q))) n++;
    }
    return n;
  }
}

function sameDir(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function manhattan(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) n += Math.abs(a[i] - b[i]);
  return n;
}
