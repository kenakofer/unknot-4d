// Confetti.
//
// A moment's celebration for finishing something: the tutorial's last lesson,
// a knot pulled straight. It falls over the whole screen, cards included, on a
// canvas of its own that takes no pointer events and is removed again the
// moment the last piece lands -- so nothing about the page is different once
// it is over.
//
// The colours are the axis colours and the accent, read from the stylesheet,
// so the shower is made of the same palette as the game under it.
//
// The arithmetic is in confettishape.js, where the suite can reach it. This
// file only draws.

import { makePieces, advance } from './confettishape.js';
import { makeRng } from './grid.js';

const COLOUR_VARS = ['--ax0', '--ax1', '--ax2', '--ax3', '--accent'];

// The physics is stepped in slices no longer than this. A frame that arrives
// late -- a tab that was in the background, a stalled main thread -- is caught
// up in several small steps rather than one big one, which would fling every
// piece off the bottom. Beyond a couple of seconds the drop is simply over.
const STEP = 1 / 60;
const MAX_GAP = 2;

let canvas = null;
let pieces = [];
let last = 0;
let frame = 0;

function palette() {
  const style = getComputedStyle(document.documentElement);
  const out = COLOUR_VARS.map((v) => style.getPropertyValue(v).trim())
    .filter(Boolean);
  return out.length ? out : ['#ffffff'];
}

// Match the canvas to the window, at device resolution. Cheap when nothing
// has changed, so it runs every frame and follows a resize mid-fall.
function fit() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return dpr;
}

export function dropConfetti() {
  // Someone who has asked for less motion gets the words and not the shower.
  if (window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti';
    document.body.appendChild(canvas);
  }
  fit();
  const rng = makeRng(Date.now());
  pieces = pieces.concat(
    makePieces(window.innerWidth, window.innerHeight, palette(), rng));
  if (!frame) {
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }
}

function tick(now) {
  let gap = Math.min((now - last) / 1000, MAX_GAP);
  last = now;
  while (gap > 0) {
    const dt = Math.min(gap, STEP);
    pieces = advance(pieces, dt, window.innerHeight);
    gap -= dt;
  }
  const dpr = fit();
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const p of pieces) {
    // Squashing the height by a cosine of time is a flat piece seen edge-on
    // and face-on by turns: the flutter that says "paper" rather than "dot".
    const flip = Math.cos(p.phase * 1.7 + p.t * 6);
    ctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
    ctx.rotate(p.rot);
    ctx.scale(1, flip);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  }
  if (pieces.length) {
    frame = requestAnimationFrame(tick);
  } else {
    frame = 0;
    canvas.remove();
    canvas = null;
  }
}
