// Controller support.
//
// The Gamepad API is polled, not evented: there is no "button pressed" event to
// listen for, so something has to ask the browser for the current state on
// every frame and work out what changed. That is what this module is -- it
// turns polling into the same (axis, sign) calls the keyboard already makes, so
// a game wires up a controller without learning anything about gamepads.
//
// Two details that are easy to get wrong and unpleasant to debug:
//
//   Edge detection. These games are turn-based or tick-based, so a HELD button
//   must fire once, not sixty times a second. Every control is compared against
//   its state on the previous poll and only reported on the false -> true edge.
//
//   Controllers are invisible until used. Browsers hide connected gamepads
//   until a button is pressed on them, as anti-fingerprinting. So a game cannot
//   say "no controller found" at load; it can only wait, which is why `onConnect`
//   exists and why the UI should say "press a button to join" rather than
//   reporting an absence.
//
// The mapping below is the "standard" layout, which is what a browser reports
// for anything Xbox- or PlayStation-shaped. A controller that does not match it
// still works through the sticks and the d-pad, which are the parts that matter.

// Standard-layout button indices.
export const BUTTON = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5,
  LT: 6, RT: 7,
  BACK: 8, START: 9,
  L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

// How far a stick must be pushed before it counts. Sticks rest a little off
// centre and drift as they wear, so a low threshold would fire moves on an
// untouched controller.
const DEADZONE = 0.55;

// The default control scheme, and the one every game here should use unless it
// has a reason not to -- the point of the shared layer is that a player who
// learns a controller in one game keeps it in the next.
//
//   d-pad        the horizontal plane   (axes 0 and 2)
//   A / B        up and down            (axis 1)
//   LB / RB      the fourth dimension   (axis 3)
//
// LB and RB for w is the good part. They are the two controls a player has no
// prior spatial expectation about, they are symmetric, and "left shoulder goes
// left along the ring" matches both the screen and the A/D keys.
export const STANDARD_MAP = [
  { button: BUTTON.LEFT,  axis: 0, sign: -1 },
  { button: BUTTON.RIGHT, axis: 0, sign:  1 },
  { button: BUTTON.UP,    axis: 2, sign: -1 },
  { button: BUTTON.DOWN,  axis: 2, sign:  1 },
  { button: BUTTON.A,     axis: 1, sign:  1 },
  { button: BUTTON.B,     axis: 1, sign: -1 },
  { button: BUTTON.LB,    axis: 3, sign: -1 },
  { button: BUTTON.RB,    axis: 3, sign:  1 },
];

// The left stick doubles for the d-pad, so a player who reaches for it is not
// met with nothing. Right stick is left alone: on a 4D board it is not obvious
// which pair of axes it should mean, and guessing wrong is worse than leaving
// it unbound.
export const STICK_MAP = [
  { stick: 0, dir: -1, axis: 0, sign: -1 },   // left
  { stick: 0, dir:  1, axis: 0, sign:  1 },   // right
  { stick: 1, dir: -1, axis: 2, sign: -1 },   // up (stick y is inverted)
  { stick: 1, dir:  1, axis: 2, sign:  1 },   // down
];

export class Gamepads {
  // `onPress(axis, sign, padIndex)` fires once per press, per control.
  // `onConnect(padIndex)` fires the first time a pad is seen -- which, because
  // of the visibility rule above, is the first time a button is pressed on it.
  constructor({ onPress, onConnect, onDisconnect,
                map = STANDARD_MAP, sticks = STICK_MAP,
                deadzone = DEADZONE } = {}) {
    this.onPress = onPress || (() => {});
    this.onConnect = onConnect || (() => {});
    this.onDisconnect = onDisconnect || (() => {});
    this.map = map;
    this.sticks = sticks;
    this.deadzone = deadzone;
    // Previous state per pad index, so a held control is not re-reported.
    this.prev = new Map();
    this.seen = new Set();

    // These events fire reliably on disconnect, and on connect only once the
    // pad has been used -- so they are worth listening to for the tidy-up, but
    // never for detection.
    this._onGamepadDisconnected = (e) => {
      this.prev.delete(e.gamepad.index);
      if (this.seen.delete(e.gamepad.index)) this.onDisconnect(e.gamepad.index);
    };
    addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }

  // Anything connected right now. Empty until a button has been pressed.
  list() {
    if (!navigator.getGamepads) return [];
    return [...navigator.getGamepads()].filter(Boolean);
  }

  get count() { return this.list().length; }

  // Poll once. Call this from the render loop -- it is cheap, and there is no
  // other way to see a controller.
  poll() {
    for (const gp of this.list()) {
      if (!this.seen.has(gp.index)) {
        this.seen.add(gp.index);
        this.onConnect(gp.index);
      }
      const now = this.readState(gp);
      const was = this.prev.get(gp.index);
      if (was) {
        for (const k of Object.keys(now)) {
          // The false -> true edge, and only that. A held control does nothing
          // further until it is released and pressed again.
          if (now[k] && !was[k]) {
            const [axis, sign] = k.split(':');
            this.onPress(+axis, +sign, gp.index);
          }
        }
      }
      this.prev.set(gp.index, now);
    }
  }

  // The current state of every mapped control, keyed "axis:sign". Buttons and
  // stick deflections collapse into the same key, so pushing the stick left
  // while holding d-pad left is one control held, not two -- and releasing
  // either one does not re-fire the other.
  readState(gp) {
    const out = {};
    const set = (axis, sign, on) => {
      const k = `${axis}:${sign}`;
      out[k] = out[k] || on;
    };
    for (const m of this.map) {
      const b = gp.buttons[m.button];
      set(m.axis, m.sign, !!(b && (b.pressed || b.value > 0.5)));
    }
    for (const s of this.sticks) {
      const v = gp.axes[s.stick];
      set(s.axis, s.sign,
          v !== undefined && (s.dir < 0 ? v < -this.deadzone : v > this.deadzone));
    }
    return out;
  }

  // A button -- any button -- pressed on any pad since the last poll. Games use
  // this for "press a button to join" and for dismissing a round-over card,
  // where which control it was does not matter.
  anyPressed() {
    for (const gp of this.list()) {
      for (const b of gp.buttons) if (b && (b.pressed || b.value > 0.5)) return gp.index;
    }
    return -1;
  }

  stop() {
    removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }
}
