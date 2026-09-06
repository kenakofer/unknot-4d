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

// Axis 0 is east/west, 1 is up/down, 2 is north/south, 3 is the fourth
// dimension. The order here is the order they appear on the pad: the two
// horizontal pairs first, then vertical, then w.
export const DIRECTIONS = [
  { key: 'ArrowUp',    label: '↑', name: 'north', axis: 2, sign: -1 },
  { key: 'ArrowDown',  label: '↓', name: 'south', axis: 2, sign:  1 },
  { key: 'ArrowLeft',  label: '←', name: 'west',  axis: 0, sign: -1 },
  { key: 'ArrowRight', label: '→', name: 'east',  axis: 0, sign:  1 },
  { key: 'w', label: 'W', name: 'up',   axis: 1, sign:  1 },
  { key: 's', label: 'S', name: 'down', axis: 1, sign: -1 },
  // The ring of frames runs left to right in w order, so A steps to the frame
  // on the left and D to the one on the right -- matching where they sit on
  // the keyboard, and where the frames sit on screen.
  { key: 'a', label: 'A', name: 'w back', axis: 3, sign: -1 },
  { key: 'd', label: 'D', name: 'w fwd',  axis: 3, sign:  1 },
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
  // `host` is the element to fill with buttons. `onPush(axis, sign, ev)` runs
  // when one is pressed; `isLive(axis, sign)` decides which are greyed out.
  constructor(host, { onPush, isLive = () => true, dirs = DIRECTIONS } = {}) {
    this.host = host;
    this.dirs = dirs;
    this.onPush = onPush;
    this.isLive = isLive;
    this.build();
  }

  build() {
    const host = this.host;
    host.innerHTML = '';
    for (const b of this.dirs) {
      const btn = document.createElement('button');
      btn.className = 'padbtn ax' + b.axis;
      btn.dataset.axis = b.axis;
      btn.dataset.sign = b.sign;
      btn.innerHTML =
        `<span class="glyph">${b.label}</span><span class="nm">${b.name}</span>`;
      btn.title = `${b.name} (${b.key})`;
      btn.addEventListener('click', (ev) => this.onPush(b.axis, b.sign, ev));
      host.appendChild(btn);
    }
    this.update();
  }

  // Grey out directions that would do nothing, so the pad shows what is
  // possible rather than making the player find out by trying.
  update() {
    const kids = [...this.host.children];
    if (!kids.length) return;
    kids.forEach((btn, k) => {
      const b = this.dirs[k];
      btn.classList.toggle('dead', !this.isLive(b.axis, b.sign));
    });
  }

  // Flash a button green or red, so a press that did nothing still says so.
  flash(axis, sign, good) {
    const k = this.dirs.findIndex((b) => b.axis === axis && b.sign === sign);
    const btn = this.host.children[k];
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
      ev.preventDefault();
      this.onPush(hit.axis, hit.sign, ev);
    };
    target.addEventListener('keydown', handler);
    return () => target.removeEventListener('keydown', handler);
  }
}
