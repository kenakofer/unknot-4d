# 4D Games

Small games played in four dimensions — and, where it makes sense, in three, two
or five. They share one set of controls and one way of drawing the extra
direction, so the spatial sense you build in any of them carries into the rest.
That transfer is the point of keeping them in one repository rather than four.

| | | |
|---|---|---|
| [4D Unknot](games/4d-unknot/) | Pull a knotted rope taut. One level cannot come undone in three dimensions — and does in four. | <https://kenan.schaefkofer.com/4d-unknot/> |
| [4D Snake](games/4d-snake/) | Six cubes, six deep, three slabs of lava. Walls on every side except the fourth direction, which wraps. | <https://kenan.schaefkofer.com/4d-snake/> |

Each game is served from its own directory, so the URL is just the game's name:
`kenan.schaefkofer.com/<n>d-<game>`. The root is an index linking to them all.

## Running it locally

```
npm run serve      # http://localhost:8123
npm test           # every game's model tests, plus the shared engine's
```

No build step and no dependencies; three.js loads from a CDN.

## The shared language

Everything in `shared/` exists because more than one game needs it to behave
*identically*. A rule that lives in one game's directory is that game's own; a
rule that lives here is a promise to the player.

**The fourth direction is a ring of frames.** Three axes are drawn as space.
The fourth is drawn as separate copies of that space — one cube frame per value
— standing on a flat circle in order. The frame you are working in is nearest
the camera, and the camera travels round the ring to whichever frame you move
into, turning to meet it square on. Something that steps along the fourth axis
is then visibly the same thing continuing in the next room, rather than two
ghosts overlapping in one.

The frames stand still and the camera moves, not the other way round. Shifting
the frames to bring the focused one to a fixed camera only reads as motion when
something left behind gives the eye an anchor; move off a frame you were alone
in and the whole world translating under you looks like nothing happening.

**Whether the ring closes states the rule.** A dimension that does not wrap gets
one more slot than it has values, and a solid dark block stands in the gap — you
can see that the step from the last frame to the first is not available. A
dimension that wraps uses exactly as many slots as values, so the ring closes
seamlessly and the step really is there. Unknot's w is walled; Snake's wraps.
Neither game has to explain this in words.

**The controls never move.** Arrow keys for the horizontal plane, `W`/`S` for up
and down, `A`/`D` for back and forward along the fourth dimension — `A` toward
the frame on the left and `D` toward the one on the right, matching both the
keyboard and the screen. One colour per axis, the same colour in every game:
orange for axis 0, green for axis 1, blue for axis 2, purple for the fourth.
Directions that would do nothing are greyed out, so the pad shows what is
possible rather than making you find out by trying.

**The view rocks rather than orbits.** A gentle sway, a slow nod on top of it at
a period that does not divide into the first. A full spin would keep swapping
which way is left and which is right, and every one of these games rests on
those meaning one fixed thing; a small swing keeps them stable while the
parallax separates things that overlap in any single still view. Every view on
screen swings from the same clock, so they never disagree about which face you
are looking at.

**Wall projections.** The contents of a room are flattened onto whichever of its
walls the camera can see into, which reads as a plan and two elevations. It is
what makes a position inside a box legible without turning the box, and it is
where you learn to read depth from rather than guessing at perspective.

## Layout

```
index.html          the index page
shared/
  ring.js           the ring of w-slice frames, and the slide between them
  orbit.js          orbit camera, with the rock riding on top
  rock.js           the shared sway clock
  pad.js            the direction pad: keys, glyphs, live/dead state
  grid.js           cells, steps, walls and wraps, boxes, seeded randomness
  scene.js          frames, blockers, wall projections, lighting
  style.css         the shared look
games/
  4d-unknot/        rope-untangling puzzle
  4d-snake/         snake in a 6x6x6x6 box
test/shared.js      tests for the shared engine
```

Nothing in `shared/` knows how many dimensions there are. Cells are plain arrays
and every rule is written over their length, which is what lets the same code
run a 2D board, a 3D one, a 4D one or a 5D one. Writing `p[0], p[1], p[2], p[3]`
anywhere would quietly fix the dimension count and the family would stop being
one family. Snake's own test suite runs its rules in 2, 3, 4 and 5 dimensions
for exactly this reason.

## Adding a game

1. `games/<n>d-<name>/`, with `index.html`, `src/`, `test/`.
2. Link `../../shared/style.css`; add only what is genuinely the game's own.
3. Build the model as a pure module with no reference to three.js or the DOM, so
   it runs under Node and its rules can be tested where bugs are cheap to find.
4. Use `Ring`, `Slide`, `Orbit`, `rockAt`, `Pad` and the helpers in `scene.js`
   for anything the player has already learned elsewhere. If you find yourself
   about to change one of them for one game's benefit, that is the signal to ask
   whether the change belongs in every game.
5. Add the tests to `package.json`'s `test` script and a card to `index.html`.
