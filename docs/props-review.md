# Review: the 4D table and the hyperspheres

A working document for the pass that follows. It covers the commits from
`b52e3ad` (stand the frames on a table) to `8c627e0` (lift the orbs onto a
dome): `shared/table.js`, `shared/tableshape.js`, `shared/tableconst.js`,
`shared/noise.js`, `shared/orbs.js`, `shared/orbshape.js`, and the wiring in
`snake/src/app.js`.

The brief was efficiency, with correctness issues called out where found. The
scene works. Everything below is about what it costs, plus three things that
are wrong in ways the eye does not readily catch.

**Status.** Sections 1 (item 1), 2, 3 and the material half of 6 are DONE.
Sections 4, 5, 7, 8 and the rest of 6 are open. The props have since been
assembled in `shared/props.js` and wired into all three games; the snake line
numbers below predate that and are approximate. The done work has been checked by `npm test` only; it still needs the
browser check described at the end.

Numbers marked "measured" were measured under Node on this machine with the
real modules (`marbleTiled`, `ngonRadius`); browser V8 will be in the same
range. Numbers marked "estimated" were not run.

Rules of the house that constrain the fixes: models know nothing about
drawing, nothing in `shared/` fixes the dimension count, `npm test` must pass,
and visual changes get checked in a browser with `npm run serve`. None of the
fixes below touch player-facing text.

---

## 1. The marble bake runs on every new game, and it costs seconds

*Item 1 done: the tile is baked once per page by `marbleTile()` in
`table.js`. Items 2 and 3 are open.*

**Where.** `shared/table.js` `bakeTexture()` (line 137), called from
`setSides()` when `this.tex` is null (line 287). `Table` is constructed inside
`newGame()` -> `buildScene()` in `snake/src/app.js` (line 332), so
every game gets a fresh `Table` with a null `tex`.

**Measured.** Baking the tile with the real constants:

| texels   | time    |
|----------|---------|
| 128 x 128 | 168 ms  |
| 256 x 256 | 663 ms  |
| 512 x 512 | 2790 ms |

`MARBLE_TEXELS` is 512. So the first frame after `newGame()` blocks for about
2.8 seconds. That is every restart (`restartRun`), every tutorial lesson
change (`onLesson`), and the initial load. The 2D and 3D lessons pay it too,
since the table is built unconditionally; only the orbs are gated on `has4D()`.

The comment in `tableconst.js` says the cost is "built once at startup rather
than per frame, so this is a memory cost rather than a running one". Once per
*Table*, not once per page, and the table is rebuilt per game.

**Why it is slow.** `marbleTiled` samples a 4D torus, so each texel is two
`fbm` calls (3 + 4 octaves) of 4D value noise, each octave visiting 16 lattice
corners and hashing each: roughly 112 hashes per texel, 29 million for the
tile. On top of that `valueNoise` allocates three arrays per call and `fbm`
allocates a mapped copy of `p` per octave, so the bake also creates on the
order of ten million short-lived arrays.

**Fix, in order of payoff.**

1. Hoist the texture to module scope in `table.js`. The bake depends only on
   constants (`VEINS`, `WARP`, seed 12345, `MARBLE_TEXELS`) and never on the
   instance, so one baked tile serves every `Table` for the life of the page.
   This alone removes the stall from restarts and lessons. The old table's
   texture also stops being leaked (see section 6).
2. Take the allocation out of the inner loop in `noise.js`: reuse `base`,
   `frac`, `corner` and a scratch array for the scaled point across calls.
   Expect a 2 to 3x speedup on the remaining first-load bake. `valueNoise` and
   `fbm` are tested in `test/shared.js` (determinism, range, smoothness,
   seam), so the suite will catch a slip.
3. Consider moving the bake off the main thread. `noise.js` has no DOM or
   three.js dependency, so a Worker can produce the `Uint8Array` and post it
   back; `DataTexture` accepts the buffer directly. The table would render
   untextured for the first second or two of the very first game. Only worth
   doing if the first-load stall still matters after 1 and 2.

A cheaper alternative to 3 is baking at 256 and letting the mipmapped linear
filter blur it; the comment says 512 was chosen so the veins are not soft when
the table fills the screen, so that is a visual call, not one to make from
here.

## 2. The top surface is rebuilt from scratch on nearly every frame of a slide or drag

*Done. The grid maths moved to `shared/tablegrid.js` (pure, tested in
`test/shared.js`); `table.js` builds the buffers once in `topGeometry()` and
rewrites them in `reshapeTop()`, setting the bounding sphere by hand. The
threshold is `OUTLINE_STEP` in `tableconst.js`. Measured: a reshape is now
0.14 ms of JS against 8 ms before, plus one `bufferSubData` of two
attributes instead of a fresh geometry. Below is the original analysis.*

**Where.** `shared/table.js` `setSides()` (line 214) and `topGeometry()`
(line 79). `Table.update()` runs every frame from `aimAtFocus()`, and
`setSides` rebuilds whenever the side count has moved by more than 0.01.

**How often.** The slide is exponential at `SLIDE_RATE` 7.7 and finishes at
0.01 of a slice, so one step along w takes about 0.6 s, roughly 36 frames, and
the side count moves on almost all of them. A camera drag changes `yaw` and so
`tableW`, so the outline rebuilds on every frame of a drag as well. The rock
is correctly excluded.

**What a rebuild does.** With `MARBLE_RINGS` 80 the segment count comes out at
252, so the grid is 20,412 vertices and about 40,000 triangles. Each rebuild:

- calls `ngonRadius` (trig, modulo) 20,412 times, though its value depends
  only on the angle and the side count, of which there are 252 distinct
  angles per rebuild;
- pushes into three growable JS arrays and then copies them into typed
  arrays;
- runs `computeVertexNormals` over 40k triangles for a surface that is flat,
  so every normal is (0, 1, 0);
- builds an `ExtrudeGeometry` from a 129-point `Shape` and an
  `EdgesGeometry` over it (cheap, a few hundred triangles);
- allocates three new materials (see section 6);
- uploads new position, uv, normal and index buffers.

**Measured.** The JS array construction alone, without three.js, normals or
upload, is 8.0 ms per rebuild. With normals, `BufferGeometry` construction,
extrude, edges and upload the estimate is 12 to 20 ms, which is the whole
frame budget at 60 Hz. Every slide and every drag will be running below 60 fps
and generating tens of megabytes of garbage.

**Fix.**

1. Keep one top geometry with fixed topology. The index and the ring/segment
   layout never change between rebuilds, only the radius at each angle. Build
   the `BufferGeometry` once with a preallocated `Float32Array` for position
   and uv, a constant normal attribute, and a fixed index. On a shape change
   rewrite position and uv in place and set `needsUpdate`. Set
   `attribute.usage = THREE.DynamicDrawUsage` on the two that change.
2. Compute `ngonRadius(th, n)` once per segment (252 calls) and multiply by
   the ring's `f` on the way round, instead of once per vertex.
3. Drop `computeVertexNormals`; write the constant normal once.
4. Rebuild threshold in the right space. `sidesAt` interpolates in 1/n, so as
   the shape approaches the 64-gon the side count races while the outline is
   visually still. Testing `|1/shown - 1/n| > eps` instead of `|shown - n| >
   0.01` would suppress most rebuilds through the circular quarter of the
   loop with no visible change. Pick `eps` by looking, then encode it in
   `tableconst.js` with the reasoning.
5. The slab (`ExtrudeGeometry`) and rim (`EdgesGeometry`) can stay as they
   are. They are small. If they ever matter, the same trick applies: the
   outline has 129 points whatever the shape.

The tests in `test/shared.js` cover `sidesAt`, `ngonRadius` and `tableW`, not
the mesh, so this is a browser check: slide through w with the frame timer
open and watch the outline still change shape and the marbling still flow.

## 3. Correctness: the reflections use last frame's camera matrices -- DONE

*Fixed in `Props.update()` (`shared/props.js`), which calls
`camera.updateMatrixWorld()` before `orbs.update`.*

**Where.** `snake/src/app.js` line 1158 calls `orbs.update(...,
camera)` after `aimAtFocus()` has moved the camera via `orbit.onChange` (line
384: `camera.position.set(...)` then `camera.lookAt(...)`). `Orbs.reflect()`
then calls `Vector3.project(cam)` and `unproject(cam)`, which read
`camera.matrixWorldInverse`, `camera.matrixWorld` and the projection matrices.

Three.js only refreshes `matrixWorld` and `matrixWorldInverse` inside
`renderer.render()`, so at the point `reflect()` runs they still describe
the previous frame's camera. `cam.position.distanceTo(...)` in the same
function reads the fresh position. So the reflection is placed from a
one-frame-old view while its scale uses the current one.

**Effect.** While the camera moves (the rock, which is always on, plus drags
and zooms) each reflection sits where its orb was on screen a frame ago. At
the rock's speed the offset is a pixel or two, which is why it has not been
seen, but during a fast drag the reflections lag visibly behind their orbs.

**Fix.** Call `camera.updateMatrixWorld()` immediately before `orbs.update`
in `render()`. It is cheap, and `renderer.render` will find the matrices
already current. Alternatively pass the camera into `Orbs.update` only after
a single `updateMatrixWorld()` in `aimAtFocus`, since the same staleness would
affect anything else that projects there.

## 4. Correctness (probable, verify in browser): reflections draw over opaque things standing on the table

**Where.** `shared/orbs.js` echo material (line 218): `transparent: true`,
`depthTest: false`, `renderOrder = -0.5`, stencil-clipped to the table.

**Reasoning.** `transparent: true` puts the echo in three.js's transparent
list, which is drawn after the *entire* opaque list, whatever `renderOrder`
says; `renderOrder` only orders within a list. `depthTest: false` means it
does not check what is in front of it. The stencil only says "there is table
under this pixel", and nothing in the play area except the wall projections
writes the stencil. So wherever an opaque object stands over table (the
focused frame's edges are opaque, `transparent: !focused` in
`shared/scene.js` line 48; snake segments with fade 1 are opaque, `transparent:
f < 1` in app.js line 710) and a reflection's disc overlaps it on screen, the
disc is added on top of the object rather than hidden behind it.

Whether it happens in practice depends on whether a reflection ever lands on
the board. The orbs stand outside a 3.2-radius column, but a reflection is
placed *below the orb's foot* on screen by the orb's apparent height, and the
dome reaches high, so far orbs' reflections sweep down across the middle of
the picture. At `ECHO` 0.275 it would read as a faint warm glow over a frame
edge or a snake segment, easy to take for lighting.

**Fix.** Set `transparent: false` on the echo material and keep
`AdditiveBlending`, `depthWrite: false`, `depthTest: false` and the stencil.
Three.js applies `material.blending` regardless of the `transparent` flag
(the flag only forces NoBlending when blending is Normal and transparent is
false), so the sprite still adds. It then sorts into the opaque list at
`renderOrder -0.5`, after the table (group order -1) and before every cell,
edge and projection (0 and up), and the opaque things drawn later simply
paint over it. Check in the browser that the reflections still appear and
that a reflection under the focused frame is now cut by the frame's edges.

If that reordering is unwelcome for some other reason, the alternative is to
have the cells write a stencil value that is not `TABLE_STENCIL`, which is
more invasive.

## 5. Correctness (minor): the orbs' place in w is tied to their place in z

**Where.** `shared/orbs.js` line 187: `cw` is derived from `atan2(dw, dz)`,
where `dz` is also the orb's spatial z direction.

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
coupling; the fourth Gaussian is then unnecessary and can go. This is a design
observation as much as a bug, and it changes which orbs are visible at a
given slice for a given seed, so the author should decide.

## 6. Leaks and dead weight

- **Materials are never disposed.** *Done: the three materials are made once
  in the constructor and reused, and the doubled `flowTo` call is gone.*
- **The baked texture is never disposed.** *Done by section 1: there is one
  per page now, shared by reference.*
- **`renderer.localClippingEnabled = true`** *Done: removed, with its
  clipping-plane comment.*
- **Unused in `orbs.js`:** *Done: the `eye` option, `FADE_BY` and the `ECHO`
  export are gone, and the stale comments that referred to them.* `ECHO` and
  `SIZE` are still defined *after* the class that closes over them, which
  works because they are only read at call time, but reads oddly beside the
  constants block.
- **`MARBLE_RINGS` is probably too high now.** With the marbling in a texture
  the interior vertices only serve per-vertex lighting and the rim's fidelity.
  The comment in `tableconst.js` says so. Try 24 or 32 and look at the table
  under the lights; the grid tests hold for any ring count.

## 7. Per-frame work in `Orbs.update`

Thirty orbs, so all of this is small, but the file's own comment says
allocation in this loop is the kind of garbage that shows up as stutter:

- `for (const o of [it.core, it.haze, it.echo])` allocates an array per orb
  per frame (line 306). Write the three assignments out.
- `THIS_OFFSET.set(...this.offset)` spreads an array per visible orb per
  frame (line 370). Store `offset` as a `Vector3` and `sub` it directly, or
  read the group's world position once per `update` with
  `group.getWorldPosition` and drop the externally-set `offset` field, which
  is a second copy of the same fact and can drift from it.
- Ninety draw calls with ninety materials. Fine at this count; if the orb
  count grows, the cores could become one `InstancedMesh` with instance colour
  carrying opacity, and the sprites a `Points` cloud with a custom shader. Not
  worth doing at thirty.

## 8. GPU: the auras are large additive quads

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
cost. This is a look decision; measure with the browser's GPU profiler before
changing it.

## 9. Things checked and found fine

- `sliceRadius` handles the wrap correctly and is tested at the seam.
- The `TABLE_STENCIL` value 7 does not collide with the projection refs
  1 to 4, and the projections' `NotEqual`/`Replace` writes only ever hide a
  reflection where a projection is drawn, which is in front of it anyway.
- `renderOrder` bookkeeping: `table.attached` is a `Group`, so it resets the
  group order to 0 for the orbs, which is what lets the echo's -0.5 sit
  between the table (-1) and the play area (0). It works, but it works
  because `attached` happens to be a `Group`; a comment there would save the
  next reader the trace.
- The far plane at 6000 with near 0.1 is a 60,000:1 ratio. The comment's
  argument that nothing near the camera overlaps anything far is right, and
  a 24-bit depth buffer copes.
- The scratch vectors in `orbs.js` do their job; `reflect()` allocates
  nothing beyond the spread noted above.
- Nothing in `shared/` counts dimensions; `noise.js` and `orbshape.js` are
  written over array length as required.

## Suggested order of work

1. *Done.* Section 1, item 1 (module-scope texture).
2. **Browser-check the done work first.** `npm run serve`, open snake, and
   confirm: the table is visible and marbled from the first frame; stepping
   through w still morphs the outline, and the marbling still flows; a fast
   drag does not make the table vanish (that would be the bounding sphere);
   restarting and changing tutorial lessons no longer stalls. Then watch the
   circular quarter of the loop for any popping of the outline; if there is
   any, lower `OUTLINE_STEP`.
3. *Done.* Section 3 (`updateMatrixWorld`), in `Props.update()`.
4. Section 4 (`transparent: false` on the echo). One line, verify in browser.
5. *Done.* Section 2 (fixed-topology top surface).
6. *Done.* Section 6's dead code.
7. Section 1, item 2 (allocation-free noise), if first-load time still
   matters.
8. Sections 5, 7 and 8 as the author prefers.

Run `npm test` after each step. Steps 2 and 4 need the browser.
