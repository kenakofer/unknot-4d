// Sending a first-time visitor to the tutorial.
//
// The tutorial is three playable lessons on Snake's board, because the fourth
// dimension has to be USED to be learned and Snake is the game where using it
// is simplest. Running it inside Unknot or Tron would mean embedding one
// game's engine in another, which is a lot of machinery for one screen.
//
// So a game that is not Snake sends the player there instead, with a note
// saying where to come back to. The lessons run, and finishing or skipping
// them returns the player to the game they actually asked for. From their
// side it is one continuous arrival.

import { tutorialSeen } from './tutorial-flag.js';

const RETURN_PARAM = 'then';

// Where the tutorial lives, relative to a game directory.
const TUTORIAL_GAME = '../4d-snake/';

// The tutorial's address, carrying this page as the place to return to.
export function tutorialUrl() {
  const back = location.pathname;
  return `${TUTORIAL_GAME}?${RETURN_PARAM}=${encodeURIComponent(back)}`;
}

// Call this first thing in a game that has no tutorial of its own. Returns
// true when it has redirected, so the caller can stop setting itself up.
export function sendToTutorialIfNew() {
  if (tutorialSeen()) return false;
  // Never redirect a page that is already the destination, and never loop.
  if (new URLSearchParams(location.search).has(RETURN_PARAM)) return false;
  location.replace(tutorialUrl());
  return true;
}

// Where to send the player when the tutorial ends, or null to stay put.
//
// Only same-origin absolute paths are accepted. The value arrives in a URL and
// a URL can be edited by anyone, so it is treated as untrusted: a full URL
// pointing elsewhere would turn any link to this game into an open redirect.
export function tutorialReturnTo() {
  const raw = new URLSearchParams(location.search).get(RETURN_PARAM);
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}
