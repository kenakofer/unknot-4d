// Has the player been through the tutorial?
//
// One flag for every game here, not one per game. The tutorial teaches the
// fourth dimension -- the ring of rooms, and ana and kata -- which is the idea
// all these games share. Learning it is a fact about the player rather than
// about the game they happened to learn it in, so finishing it anywhere counts
// everywhere.
//
// It lives in its own module, with no dependencies, so a game can ask the
// question without pulling in the tutorial itself or the game that hosts it.

const KEY = '4dgames.tutorial';

export function tutorialSeen() {
  try { return localStorage.getItem(KEY) === '1'; } catch (e) {
    // Private browsing throws on access. Treat it as seen: showing a tutorial
    // that cannot be dismissed permanently, on every single visit, is worse
    // than not showing it.
    return true;
  }
}

export function markTutorialSeen() {
  try { localStorage.setItem(KEY, '1'); } catch (e) { /* not fatal */ }
}
