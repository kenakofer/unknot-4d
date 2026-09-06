// The direction pad: the one control surface every game here shares.
//
// Eight buttons, four axes, one colour per axis. The keys and the meanings are
// fixed across games so that spatial sense earned in one carries into the next
// -- W is always up, D is always forward along the fourth dimension, and the
// frames on screen are always laid out so that "forward along w" is the frame
// to the right. A player who has learned to think in four directions in one
// game should never have to relearn which key is which to play another.
//
// What a push MEANS is the game's business; this module only names the
// directions, reports which are live, and shows what happened.

import { DIRECTIONS as NAME } from './copy.js';

// Axis 0 is east/west, 1 is up/down, 2 is north/south, 3 is the fourth
// dimension. The order here is the order they appear on the pad: the two
// horizontal pairs first, then vertical, then w.
export const DIRECTIONS = [
  { key: 'ArrowUp',    label: '↑', name: NAME.north, axis: 2, sign: -1 },
  { key: 'ArrowDown',  label: '↓', name: NAME.south, axis: 2, sign:  1 },
  { key: 'ArrowLeft',  label: '←', name: NAME.west,  axis: 0, sign: -1 },
  { key: 'ArrowRight', label: '→', name: NAME.east,  axis: 0, sign:  1 },
  { key: 'w', label: 'W', name: NAME.up,   axis: 1, sign:  1 },
  { key: 's', label: 'S', name: NAME.down, axis: 1, sign: -1 },
  // The ring of frames runs left to right in w order, so A steps to the frame
  // on the left and D to the one on the right -- matching where they sit on
  // the keyboard, and where the frames sit on screen.
  //
  // ANA and KATA are the names for the two directions along a fourth spatial
  // axis, from Hinton, who coined them for exactly this problem: up and down
  // were already taken. Greek ana "up" and kata "down", so ana is the positive
  // direction and kata the negative -- D and A respectively.
  //
  // They are better labels than "w fwd" and "w back" for the same reason north
  // beats "y plus": a direction with a name of its own is a place you can think
  // about, and the whole difficulty of these games is learning to think about
  // this one.
  { key: 'a', label: 'A', name: NAME.kata, axis: 3, sign: -1 },
  { key: 'd', label: 'D', name: NAME.ana,  axis: 3, sign:  1 },
];

// Key -> direction, with both cases of the letter keys.
export const KEYMAP = {};
for (const b of DIRECTIONS) {
  KEYMAP[b.key] = b;
  if (b.key.length === 1) KEYMAP[b.key.toUpperCase()] = b;
}

// A unit step along `axis` in a space of `dims` dimensions. Directions past the
// end of the space come back as all-zero, so a 3D game can share this list
// without special-casing the w pair.
export function dirVec(axis, sign, D) {
  const v = Array(D).fill(0);
  if (axis < D) v[axis] = sign;
  return v;
}

export class Pad {
  // `host` is the element to fill with buttons -- or an array of them, when a
  // game wants its clusters in different places on the page.
  //
  // Splitting the pad is worth supporting rather than faking with CSS, because
  // the split is structural: a game that puts each cluster above the panel
  // showing the plane it moves in is saying those two things belong together,
  // and the markup should say so too. With `hosts`, each is filled with
  // whichever directions it was given.
  // `teachOnly` makes the pad disappear once the player has shown they no
  // longer need it -- once every key it displays has been pressed on a real
  // keyboard.
  //
  // The pad is a teaching aid: it says which key goes which way and which
  // directions are available. A player who has used all eight keys has learned
  // the first of those, and the second is one rule they will not forget. Past
  // that point the pad is furniture in front of the board.
  //
  // It resets each round, deliberately. Hiding permanently would mean deciding
  // on a player's behalf that they are done with it; hiding for the round they
  // demonstrated it in makes the same offer again next time, at no cost to
  // anyone who wants it. And a player who never touches the keyboard -- clicking
  // the buttons, or on a tablet -- never triggers it at all, so it can never
  // take away the only controls someone has.
  constructor(host, { onPush, isLive = () => true, isPresent = () => true,
                      dirs = DIRECTIONS, teachOnly = false } = {}) {
    this.hosts = Array.isArray(host) ? host : [host];
    this.dirs = dirs;
    this.onPush = onPush;
    this.isLive = isLive;
    this.isPresent = isPresent;
    this.teachOnly = teachOnly;
    // Which keys have been pressed on a keyboard this round. Clicks do not
    // count: clicking a button is not evidence that the player knows the key.
    this.used = new Set();
    // Buttons in the order `dirs` gives, whichever host each landed in, so
    // update() and flash() do not care how the pad was split.
    this.buttons = [];
    this.build();
  }

  // Start the round over: every key is unlearned and the pad comes back.
  resetTaught() {
    this.used.clear();
    this.showHosts();
  }

  // Note a key press and hide any cluster whose keys are all now known.
  //
  // Per HOST rather than all at once, so a two-player game hides each player's
  // cluster when that player has learned theirs -- one player's fluency should
  // not remove the other's controls.
  noteKey(dir) {
    if (!this.teachOnly) return;
    this.used.add(dir.key);
    this.hosts.forEach((host, i) => {
      const mine = this.dirsFor(i);
      if (!mine.every((b) => this.used.has(b.key))) return;
      if (host.classList.contains('taught')) return;   // already going
      host.classList.add('taught');
      // Give the space back once the fade has finished, so the panels below
      // move into somewhere already empty rather than pulling the pad out from
      // under themselves. Timed rather than driven by transitionend, which does
      // not fire if the element is hidden or the transition is interrupted.
      host._goneTimer = setTimeout(() => host.classList.add('gone'), 500);
    });
  }

  showHosts() {
    for (const host of this.hosts) {
      clearTimeout(host._goneTimer);
      host.classList.remove('taught', 'gone');
    }
  }

  // Which directions belong in host `i`. A single host takes them all; two
  // hosts split by axis, since that is the split every game here wants -- the
  // fourth dimension and height in one cluster, the horizontal plane in the
  // other.
  dirsFor(i) {
    if (this.hosts.length < 2) return this.dirs;
    const vertical = (b) => b.axis === 1 || b.axis === 3;
    return this.dirs.filter((b) => (i === 0 ? vertical(b) : !vertical(b)));
  }

  build() {
    this.buttons = [];
    const made = new Map();
    this.hosts.forEach((host, i) => {
      host.innerHTML = '';
      for (const b of this.dirsFor(i)) {
        const btn = document.createElement('button');
        btn.className = 'padbtn ax' + b.axis;
        btn.dataset.axis = b.axis;
        btn.dataset.sign = b.sign;
        btn.innerHTML =
          `<span class="glyph">${b.label}</span><span class="nm">${b.name}</span>`;
        btn.title = `${b.name} (${b.key})`;
        btn.addEventListener('click', (ev) => this.onPush(b.axis, b.sign, ev));
        host.appendChild(btn);
        made.set(b, btn);
      }
    });
    // Indexed by `dirs` order regardless of which host holds each button.
    this.buttons = this.dirs.map((b) => made.get(b) || null);
    this.update();
  }

  // Grey out directions that would do nothing, so the pad shows what is
  // possible rather than making the player find out by trying.
  //
  // `isPresent` is a different question: whether the direction exists on this
  // board at all. A 2D board has no up, and a greyed-out W would suggest a
  // direction that is temporarily unavailable rather than one that is not
  // there -- so an absent direction is hidden outright. Defaults to true, so a
  // game that never mentions it sees no change.
  update() {
    this.buttons.forEach((btn, k) => {
      if (!btn) return;
      const b = this.dirs[k];
      const present = this.isPresent(b.axis, b.sign);
      btn.classList.toggle('absent', !present);
      btn.classList.toggle('dead', present && !this.isLive(b.axis, b.sign));
    });
    // A cluster with nothing present in it is not a cluster.
    this.hosts.forEach((host, i) => {
      const any = this.dirsFor(i).some((b) => this.isPresent(b.axis, b.sign));
      host.classList.toggle('absent', !any);
    });
  }

  // Flash a button green or red, so a press that did nothing still says so.
  flash(axis, sign, good) {
    const k = this.dirs.findIndex((b) => b.axis === axis && b.sign === sign);
    const btn = this.buttons[k];
    if (!btn) return;
    btn.classList.remove('hit', 'miss');
    void btn.offsetWidth;              // restart the animation
    btn.classList.add(good ? 'hit' : 'miss');
  }

  // Wire up the keyboard. Returns a teardown function.
  //
  // `onPush` is given the event, so a game can read modifiers off it -- shift
  // to rotate the view rather than move, say.
  //
  // `gate` is asked before every press and can refuse it. A game with a modal
  // open passes one, so a key aimed at the menu does not also move the player
  // behind it -- and, since the pad's own buttons are still clickable, the menu
  // is what decides whether the game is accepting input rather than each
  // control deciding for itself.
  bindKeys(target = window, gate = null) {
    const handler = (ev) => {
      const hit = KEYMAP[ev.key];
      if (!hit) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (gate && !gate()) return;
      if (!this.isPresent(hit.axis, hit.sign)) return;
      ev.preventDefault();
      // Noted before the push, so a key that ends the round still counts
      // toward having been learned.
      this.noteKey(hit);
      this.onPush(hit.axis, hit.sign, ev);
    };
    target.addEventListener('keydown', handler);
    return () => target.removeEventListener('keydown', handler);
  }
}
