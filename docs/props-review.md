# Review: the 4D table and the hyperspheres

What is left of a review of the commits from `b52e3ad` (stand the frames on a
table) to `8c627e0` (lift the orbs onto a dome). The brief was efficiency, with
correctness issues called out where found.

Everything the review found and settled has been done and removed from this
file; `git log` for `shared/noise.js`, `shared/table.js`, `shared/tablegrid.js`
and `shared/orbs.js` has the reasoning. The three notes below are the ones that
were never for the reviewer to settle: none of them is a defect, and each
changes how the scene LOOKS. They want deciding by eye.

Rules of the house that constrain any fix: models know nothing about drawing,
nothing in `shared/` fixes the dimension count, `npm test` must pass, and
visual changes get checked in a browser with `npm run serve`. None of the notes
below touch player-facing text.

---

## 1. The orbs' place in w is tied to their place in z

**Where.** `shared/orbs.js`, in the constructor: `cw` is derived from
`atan2(dw, dz)`, where `dz` is also the orb's spatial z direction.

**Effect.** An orb's slot on the w loop and its bearing across the table are
no longer independent. Orbs at the table's left and right (`dz` near 0) get
`cw` near a quarter or three quarters of the loop; orbs at the near and far
sides get `cw` near zero, half, or the seam. As the player turns through w
the visible set therefore drifts around the compass rather than being an
independent sample each time. With `R` between 1.3 and 3.2 on a depth-6 loop
each orb is present for 43 to 100 percent of the loop, so the correlation is
softened, but it is there.

The comment says the angle was chosen because the raw `dw` component piles up
in the middle. A separate `rng()` draw for `cw` is exactly as flat and has no
coupling; the fourth Gaussian is then unnecessary and can go.

**Why it is still here.** It changes which orbs are visible at a given slice
for a given seed, so every board's sky changes. That is a design decision, not
a bug fix.

## 2. GPU: the auras are large additive quads

The haze sprite is scaled to `8 * r`, and `r` grows with distance so that
apparent size is constant. Each aura therefore covers a fixed, sizeable patch
of screen regardless of depth: at full slice radius one quad is on the order
of a quarter of the view's width. Thirty additive quads at device pixel ratio
2 is several full screens of blended overdraw per frame. On a discrete GPU
this is invisible; on an integrated or mobile GPU it will be the largest
single cost in the scene.

The aura texture's gradient reaches 0.10 alpha at 55 percent of its radius
and zero at 100 percent, so the outer 45 percent of every quad, and all four
corners, contribute almost nothing. Two cheap options, either of which halves
the fill: bake the gradient so it reaches zero at about 70 percent of the
texture and drop the scale factor to match, or keep the look and accept the
cost.

**Why it is still here.** The auras are most of what the orbs look like.
Measure with the browser's GPU profiler on the hardware that would suffer,
and only then trade any of the glow away.

## 3. `MARBLE_RINGS` is probably too high

With the marbling in a texture the interior vertices only serve per-vertex
lighting and the rim's fidelity. The comment in `tableconst.js` says so. Try
24 or 32 and look at the table under the lights; the grid tests hold for any
ring count.

**Why it is still here.** Same reason: it is a question about how the stone
reads, and the suite cannot see it.

## Two smaller things, if either file is opened anyway

- `ECHO` and `SIZE` in `shared/orbs.js` are defined *after* the class that
  closes over them. It works, because they are only read at call time, but it
  reads oddly beside the constants block.
- `table.attached` is a `Group`, which is what resets the group order to 0 for
  the orbs and so lets the echo's `renderOrder` of -0.5 sit between the table
  (-1) and the play area (0). It works because `attached` happens to be a
  `Group`; a comment there would save the next reader the trace.
