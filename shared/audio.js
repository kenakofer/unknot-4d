// Sound, and whether it is wanted.
//
// There are no sounds in these games yet. This module exists anyway, because
// the PREFERENCE is a real thing a player can express and it should be
// remembered from the moment they express it -- not from whenever sounds
// happen to arrive. A toggle that quietly forgets is worse than no toggle.
//
// So `enabled` is honest about what it means: the player wants sound, if there
// is any. Adding sounds later is a matter of registering them and calling
// play(); the mute path, the persistence and the UI are already right.

const KEY = '4dgames.sound';

// One shared preference across every game here, like the controls and the
// colours. A player who turns sound off in Snake has said something about how
// they want to play, not something about Snake.
let enabled = read();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    // Default ON. A player who has never touched the setting should hear the
    // game as it was designed; silence is the choice, not the default.
    return v === null ? true : v === '1';
  } catch (e) {
    // Private browsing and blocked site data both throw here. Sound on, and
    // the preference simply will not persist -- which is better than failing
    // to load the game over a setting.
    return true;
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSound(on) {
  enabled = !!on;
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch (e) {
    // See read(): not persisting is survivable, throwing is not.
  }
  for (const fn of listeners) fn(enabled);
  return enabled;
}

export function toggleSound() {
  return setSound(!enabled);
}

// Anything that wants to know when the preference changes -- a menu label, a
// running piece of music.
const listeners = new Set();
export function onSoundChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Playing something.
//
// Nothing is registered yet, so play() is a no-op that already respects the
// preference. When sounds arrive they go through here and inherit the mute for
// free.
//
// The context is created lazily and only on a real gesture: browsers refuse to
// start audio before a user has interacted with the page, and constructing one
// eagerly earns a console warning on every load for no benefit.
// ---------------------------------------------------------------------------

let ctx = null;

function context() {
  if (ctx) return ctx;
  const AC = typeof AudioContext !== 'undefined' ? AudioContext
    : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { ctx = null; }
  return ctx;
}

// Registered sounds, by name. A sound is a function taking the AudioContext and
// a start time, so a game can define one as a synthesised tone with no asset
// file to load or ship.
const sounds = new Map();

export function registerSound(name, make) {
  sounds.set(name, make);
}

export function play(name) {
  if (!enabled) return false;
  const make = sounds.get(name);
  if (!make) return false;
  const c = context();
  if (!c) return false;
  // A context can start suspended when it was created before the first
  // gesture; resuming is harmless when it is already running.
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { make(c, c.currentTime); } catch (e) { return false; }
  return true;
}
