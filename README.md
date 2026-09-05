# Unknot

A quantized knot-untangling puzzle. A rope runs through a lattice of cells from
one pinned end to the other; you make one atomic edit at a time and try to pull
it taut. Some levels come undone. One of them cannot — until you get a fourth
dimension.

**Play it: <https://kenan.schaefkofer.com/unknot-4d/>**

## Running it locally

```
npm run serve      # http://localhost:8123
npm test           # model + invariant tests
node test/fourd.js # the 4D demonstration
```

No build step and no dependencies; three.js loads from a CDN.

## Playing

Select a cell, then push a direction. The rope goes that way and the selection
follows, so you walk along the strand shaping it as you go.

- **Click a cell** to select it. That is all clicking does.
- **Arrow keys** push north / south / west / east.
- **W** / **S** push up / down; **A** / **D** step back and forward along the
  4th dimension -- the frames sit in a ring, and A moves left along it, D right.
- **Pushing backwards** along the rope turns it around, so the cursor always
  points the way you are heading and you can carry on sculpting forwards.
- **Shift + a direction** rotates the 4D view.
- **Every level has a fourth dimension.** A level laid out in 3D is lifted to
  w = 0 as it loads, so the rope does not move -- it just has somewhere new to
  go. On the Trefoil that is the difference between stuck and solved.

Each w-slice gets its own cube frame, standing on a shared surface and receding
back and to the left from the one holding the selection. Where the rope steps
between slices it is drawn as a thin grey line rather than rope, since that step
is the strand continuing in the next frame, not a length of rope lying in space.
- **Drag the background** to look around; scroll to zoom. `ctrl+z` undo, `r` reset.

Pushing a direction does whichever of four things applies there: remove a
detour, offset a corner, travel along the rope, or add a detour. Shrinking is
tried first, so pushing one way and back again is a true undo rather than a pile
of slack. Directions that would do nothing are greyed out on the pad.

A push looks at the one cell you pointed at, and does one of three things:

| the cell one step that way | what happens |
|---|---|
| the next cell along the rope | move there; the rope is untouched |
| three steps along the rope | cut out the two cells in between, move there |
| empty, and a corner next to you folds onto it | slide that corner there; no cells added or removed |
| empty | grow the strand out to it (two new cells), move there |
| anything else | nothing |

Sliding corners is what makes a detour walkable. On *First bump*, pressing right
three times solves the level: the first walks up to the bend, the second drags
the corner along without changing the rope's length, and by then the detour is
short enough that the third cuts it out.

A push never reshapes a part of the strand you are not pointing at. Standing
beside a detour and pushing *away* from it grows into the empty space; it does
not quietly collapse the detour behind you.

Cutting is capped at three steps for a reason. Deleting a longer excursion would
erase a loop that might be threaded through another strand -- that is the rope
passing through itself, not a deformation, and it would untie knots that must
stay tied. Three steps is the longest span that cannot enclose anything.

The rule the whole control rests on: **after any legal push the cursor sits one
step along the direction you pressed, and it is always on the rope.** There are
no exceptions -- a push that cannot do any of the three things above simply does
nothing.

To undo a detour, push *across* it: from the cell before it toward the cell
after, which is three steps along the rope.

If a push is blocked only by the wall, the whole rope slides over to make room.
It is the same rope, just re-centred, so nothing is lost -- it only stops you
getting wedged into a corner.

A colour ramp runs from one end of the rope to the other, which makes a strand
easy to follow where it crosses itself. It is anchored to the pinned ends rather
than to the direction of travel, so walking backwards -- which turns the rope
around internally -- leaves every cell exactly the colour it was.

A small panel shows the whole puzzle as a smoothed knot diagram. Both it and the
main view rock gently from side to side, locked together: one clock drives the
swing, the panel centres on wherever the camera is pointed, and it follows the
camera's zoom as far as its own frame allows. Rocking rather than orbiting keeps
up, down, left and right meaning the same thing while the parallax separates
strands that overlap in any one still view. A pink dot marks the selection, and
where the rope crosses itself the nearer strand breaks the one behind, the same
way a knot diagram shows which strand passes over.

The two projections were written independently and do not share a convention --
the panel's yaw runs opposite the camera's, related by `ang = pi/2 - az`. That
is asserted in `test/orbit.js` by checking a world point lands on the same side
of centre in both views, through a full turn and a full rock cycle, rather than
trusting the algebra.

The lattice path is relaxed before drawing, so a staircase of right-angle steps
collapses into the straight line it was approximating and only real structure is
left. The pinned ends, the selection and the w-crossings stay put, so the shape
still lines up with what the main view shows.

## Why some levels are impossible

The rope is a self-avoiding lattice path with both ends pinned. Every move is an
*ambient isotopy* — it deforms the rope without ever passing it through itself:

- **corner flip** — push a vertex to the far corner of its unit square (same
  length). Applied repeatedly this walks a bend along the rope, which is what
  dragging a bend does.
- **grow-edge** — push an edge sideways, adding two steps of slack
- **shrink-edge / hairpin shrink** — the inverses, removing slack

Because no move lets the rope cross itself, the *knot type* never changes. That
claim is not taken on trust: `src/invariant.js` computes the **knot determinant**
|Δ(−1)| — 1 for an unknot, 3 for a trefoil — and the suite checks it holds still
across hundreds of random legal moves. It is test infrastructure rather than
something the player sees; a number on screen that cannot be acted on is noise.

Closing the open arc is the subtle part: `invariant.js` routes the closure far
outside the box. The obvious shortcut — joining the two ends with a straight
chord — is wrong, because the chord sweeps through the rope as it moves and the
"invariant" changes.

## The 4D part

Knots are 1-dimensional curves, and they are only ever knotted in exactly three
dimensions. In 4D there is always a spare direction to lift one strand over
another, so every closed loop comes undone. (What *is* knotted in 4D is
2-spheres — surfaces, not curves.)

Every level here is played in a 4D lattice; a 3D layout is lifted to w = 0 as it
loads, which leaves the rope exactly where it was. The Trefoil is the level where
that matters. Measured with the same solver and the same move set:

| | 3D | 4D |
|---|---|---|
| Trefoil, taut at 13 | stuck at **27** | solved at **13** |

In 3D the slack all comes out and then it jams. In 4D you lift a sub-arc into a
neighbouring w-slice, where it cannot collide with the strands it left behind,
slide it past, and drop it back. `test/fourd.js` runs this.

The determinant is only defined in 3-space, since it is computed from a planar
diagram. The trefoil's 3D shadow stays knotted (det 3) the whole time, which is
exactly the point: the shadow is not the knot, and the fourth direction is what
frees it.

## Layout

```
src/knot.js       lattice path model + the move set (dimension-agnostic)
src/invariant.js  knot determinant, and the arc closure it needs
src/levels.js     level definitions
src/app.js        three.js rendering and input
src/orbit.js      orbit camera
test/run.js       test suite
test/fourd.js     the 3D-vs-4D demonstration
test/explore.js   exhaustive BFS over reachable configurations
```
