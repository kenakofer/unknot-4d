# 4D Games

Small games played in four dimensions — and, where it makes sense, in three, two
or five. They share one set of controls and one way of drawing the extra
direction, so the spatial sense you build in any of them carries into the rest.
That transfer is the point of keeping them in one repository rather than four.

| | | |
|---|---|---|
| [4D Unknot](games/4d-unknot/) | Pull a knotted rope taut. One level cannot come undone in three dimensions — and does in four. | <https://kenan.schaefkofer.com/4d-unknot/> |
| [4D Snake](games/4d-snake/) | Six cubes, six deep, three slabs of lava. Walls on every side except the fourth direction, which wraps. | <https://kenan.schaefkofer.com/4d-snake/> |
| [4D Tron](games/4d-tron/) | Two riders, one clock, permanent trails. The fourth direction is the lane you flee down when three dimensions run out. Two players. | <https://kenan.schaefkofer.com/4d-tron/> |

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

The ring turns; the camera stands still. The frame you are working in is always
the one at the near point of the circle, 6 o'clock, directly in front of you --
so the room you are playing in is in the same place on screen, at the same
distance, whatever w you are at, and the view you dialled in survives every move
along the fourth dimension.

The frames do not turn as the ring does. Each is placed by translation alone, so
all of them keep one fixed orientation however far the ring has rotated: it is a
carousel of positions, not of objects. That is what lets up, down, left and
right go on meaning one thing while the right room is always in front of you.

A game with two players has no single focus to centre on, so Tron leaves the
ring unturned and takes a fixed overview of the whole circle instead.

**Whether the ring closes states the rule.** A dimension that does not wrap gets
one more slot than it has values, and a solid dark block stands in the gap — you
can see that the step from the last frame to the first is not available. A
dimension that wraps uses exactly as many slots as values, so the ring closes
seamlessly and the step really is there. Unknot's w is walled; Snake's wraps.
Neither game has to explain this in words.

**The controls never move.** Arrow keys for the horizontal plane, `W`/`S` for up
and down, `A`/`D` along the fourth dimension — `A` toward the frame on the left
and `D` toward the one on the right, matching both the keyboard and the screen.

Those two directions are called **kata** and **ana**, the names Hinton coined
for a fourth spatial axis when up and down were already taken (Greek *ana* "up",
*kata* "down"; ana is the positive direction, so `D`). They earn their place for
the same reason north beats "y plus": a direction with a name of its own is
something you can think about, and learning to think about this one is the whole
difficulty these games are made of. One colour per axis, the same colour in every game:
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

**The movement tutorial is shared.** A first-time visitor to any of the three
games is sent to it before that game loads, and returned afterwards. It teaches
the controls and the ring of rooms -- the fourth dimension, which is the idea
all these games are built on -- using Snake's board, because the fourth
dimension has to be *used* to be learned and Snake is the simplest game to use
it in. Finishing or skipping it counts everywhere: learning it is a fact about
the player, not about the game they happened to learn it in.

**Escape opens the pause menu**, in every game, with the same items in the same
order: resume, restart, sound, and back to the index. It is the only place a run
can be abandoned. Restarting used to be a bare `R`, one key from the movement
cluster, which meant a good game was always one slip from being thrown away; it
now takes a deliberate Escape and a click. A game with a clock stops it while
the menu is up, and no input -- keyboard or controller -- reaches the game
behind it.

The sound setting is shared across every game and remembered, on the grounds
that turning sound off says something about how a player wants to play rather
than something about one game. There are no sounds yet; `audio.js` exists so the
preference is honoured from the moment it is expressed rather than from whenever
sounds arrive.

**Controllers, where a game wants them.** `gamepad.js` turns the Gamepad API's
polling into the same `(axis, sign)` calls the keyboard makes, so a game gains
controller support without learning anything about gamepads. The mapping is
fixed across games for the same reason the keys are: d-pad for the horizontal
plane, `A`/`B` for up and down, `LB`/`RB` for the fourth dimension. Note that a
browser cannot see a controller until a button is pressed on it, so a game can
never report one as absent -- only invite the player to press something.

**A slice panel, where a game wants one.** `slicemap.js` draws a flat
cross-section through the board at whatever the player is steering: two axes
shown, every other axis pinned to the focus cell's own coordinates. That pinning
is the point — everything on the panel is genuinely one step away, with no depth
to judge and no rooms to scan, which is exactly the question a 3D overview
answers worst. Snake takes its y-w plane; the axes are a parameter, so another
game picks whichever pair it is worst at showing.

## Where the words are

Everything the player reads lives in a copy module, never in a component or a
template:

```
shared/copy.js             text that must read identically in every game
shared/index-copy.js       the landing page
games/<game>/src/copy.js   that game's own text
```

HTML carries the structure and copy carries the words, so neither repeats the
other.

The point is review. No AI-written sentence ships to a player unread: everything
in these files is edited or approved by hand, and that is only possible while
there is a short list of places to look. Text written anywhere else escapes
that -- not through carelessness, but because new strings arrive faster than
anyone would hunt them down.

Unknot's level names and blurbs are the one exception, staying in `levels.js`
beside the paths they describe -- a level is a name, a sentence and a shape
together. See `CLAUDE.md` for the rule in full.

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
  table.js          the 4D table the frames stand on, sliced at the camera's w
  tableshape.js     the table's outline as a function of w, pure
  tablegrid.js      the top surface's vertex grid, pure
  tableconst.js     the marbling's numbers
  noise.js          seeded value noise in any number of dimensions
  orbs.js           hyperspheres over the table, and their reflections
  orbshape.js       the size of a hypersphere's slice, pure
  slicemap.js       a flat cross-section panel, taken at the player's position
  gamepad.js        controller polling, as (axis, sign) presses
  pause.js          the pause menu every game shares
  audio.js          the sound preference, and sounds when there are any
  tutorial-flag.js  whether the player has done the movement tutorial
  tutorial-entry.js sending a first-time visitor to it, and back again
  copy.js           text shared by every game
  index-copy.js     the landing page's text
  style.css         the shared look
games/
  4d-unknot/        rope-untangling puzzle
  4d-snake/         snake in a 6x6x6x6 box
  4d-tron/          two-player tron, on a clock
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
4. Use `Ring`, `Slide`, `Orbit`, `rockAt`, `Pad`, `SliceMap` and the helpers in
   `scene.js`
   for anything the player has already learned elsewhere. If you find yourself
   about to change one of them for one game's benefit, that is the signal to ask
   whether the change belongs in every game.
5. Add the tests to `package.json`'s `test` script and a card to `index.html`.
