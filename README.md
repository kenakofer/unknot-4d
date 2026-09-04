# Unknot

A quantized knot-untangling puzzle. A rope runs through a lattice of cells from
one pinned end to the other; you make one atomic edit at a time and try to pull
it taut. Some levels come undone. One of them cannot — until you get a fourth
dimension.

## Running it

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
- **W** / **S** push up / down; **A** / **D** push out / in (the 4th dimension).
- **Space** reverses the rope, to sculpt from the other end.
- **Shift + a direction** rotates the 4D view.
- **4th dimension** checkbox gives any level a fourth direction to move in. The
  rope does not move when you switch it on -- it just gains somewhere new to go,
  which is the whole point: try it on the Trefoil. It cannot be switched off
  while part of the rope is off the w = 0 slice.
- **Drag the background** to look around; scroll to zoom. `ctrl+z` undo, `r` reset.

Pushing a direction does whichever of four things applies there: remove a
detour, offset a corner, travel along the rope, or add a detour. Shrinking is
tried first, so pushing one way and back again is a true undo rather than a pile
of slack. Directions that would do nothing are greyed out on the pad.

**If the cell in that direction is the next one along the rope, the cursor just
goes there** and the rope is left alone.

**If it is three steps away along the rope**, the strand has taken a little
detour to get back beside itself: pushing that way cuts the detour out, removing
the two cells in between, and the cursor lands on the target. Works the same
three ahead or three behind.

Anything further round is *not* cut. Deleting a longer excursion would erase a
loop that might be threaded through another strand -- that is the rope passing
through itself, not a deformation, and it would untie knots that must stay tied.
A three-step span is the longest that cannot enclose anything.

Reshaping is what happens when you push *off* the rope's line.

The rule the whole control rests on: **after any legal push the cursor sits one
step along the direction you pressed, and it is always on the rope** -- whether
the rope was followed, bent, or grown. The one exception is absorbing a detour,
where the cell in that direction is not on the rope afterwards and there is
nothing there to select, so the cursor stays where it was.

A consequence worth knowing: after growing a detour the cursor is *on* it, so
pushing back travels along it. To absorb a detour, push back from the cell you
grew it from.

If a push is blocked only by the wall, the whole rope slides over to make room.
It is the same rope, just re-centred, so nothing is lost -- it only stops you
getting wedged into a corner.

Each segment carries a cone arrowhead, so which way the rope runs is readable at
any point and from any angle, not just from the colour ramp between its ends.

## Why some levels are impossible

The rope is a self-avoiding lattice path with both ends pinned. Every move is an
*ambient isotopy* — it deforms the rope without ever passing it through itself:

- **corner flip** — push a vertex to the far corner of its unit square (same
  length). Applied repeatedly this walks a bend along the rope, which is what
  dragging a bend does.
- **grow-edge** — push an edge sideways, adding two steps of slack
- **shrink-edge / hairpin shrink** — the inverses, removing slack

Because no move lets the rope cross itself, the *knot type* never changes. The
app shows the **knot determinant** |Δ(−1)|, computed live from the rope's current
shape: 1 for an unknot, 3 for a trefoil. Play with any level and watch it sit
still — that number not moving is the proof that a knotted level is unwinnable,
not just hard.

`src/invariant.js` closes the open arc far outside the box before measuring. The
obvious shortcut — joining the two ends with a straight chord — is wrong: the
chord sweeps through the rope as it moves and the "invariant" changes.

## The 4D part

Knots are 1-dimensional curves, and they are only ever knotted in exactly three
dimensions. In 4D there is always a spare direction to lift one strand over
another, so every closed loop comes undone. (What *is* knotted in 4D is
2-spheres — surfaces, not curves.)

The last level is the same trefoil in a 10×10×10×4 lattice. Measured with the
same solver and the same move set:

| | 3D | 4D |
|---|---|---|
| Trefoil, taut at 13 | stuck at **27** | solved at **13** |

In 3D the slack all comes out and then it jams. In 4D you lift a sub-arc into a
neighbouring w-slice, where it cannot collide with the strands it left behind,
slide it past, and drop it back. `test/fourd.js` runs this.

The determinant is hidden on 4D levels. It is computed from a planar diagram, so
it only means anything in 3-space — and the 4D level's 3D shadow is still a
trefoil, which is exactly the point: the shadow is not the knot.

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
