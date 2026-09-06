# 4D Snake

Snake in a 6×6×6×6 box. Walls on three sides; the fourth direction wraps.

**Play it: <https://kenan.schaefkofer.com/4d-snake/>**

Part of [4d-games](../../README.md); see that README for the shared controls and
how the fourth dimension is drawn.

## The rules

You start four segments long, laid out in a straight line along one of the three
walled axes, with clear air in every direction the head could turn. Three slabs of lava, 3×2×2×1 in random orientations, sit somewhere in the
box; there is always exactly one apple in an empty cell.

- **Press a direction** and the head moves one cell that way. Pressing toward
  the second segment does nothing — the neck is not somewhere the head can go,
  and killing you for a keypress that means *stay put* would be a trap rather
  than a rule.
- **Eat the apple** for 10 points. The apple is worth two segments, and they
  arrive one per turn over the two turns *after* you eat. Growth you can watch
  coming is growth you can plan around.
- **The run ends** if the head reaches a wall, the lava, or your own body.

The opening is always safe, and deliberately so: no wall or lava sits beside the
head, so the first press can never be the last. The snake is never laid along w
either -- that axis wraps, so a snake spread along it would start as a row of
disconnected cubes in six different rooms, which is the least readable opening
possible and the least like a snake. It starts as one line in one room, and the
fourth dimension is somewhere to go rather than where you already are.

**Nothing moves on its own.** A direction is the whole move: one press, one
step. That is a deliberate departure from arcade snake — this game is about
reading a four-dimensional position, and a clock ticking underneath would make
it a game about panic instead. The model takes a clock without changing anything
if that turns out to be wrong.

## Walls on three sides, a wrap on the fourth

x, y and z are walled; w wraps. That asymmetry is what stops the fourth
dimension from feeling like a third box to get cornered in and starts it feeling
like a direction that is always open — press `D` six times and you come back to
where you started, having passed through every frame on the way.

The ring of frames says so before any text does: with a wrapping dimension there
is no blocker standing in it, so the last frame really does join the first. Look
at Unknot beside it, where a dark block sits in that gap, and the difference is
visible rather than described.

## Reading the board

All six frames are drawn, always. In Unknot only the occupied slices get a frame
— its rope is long and the clutter would win — but here the opposite is true: a
snake in four dimensions has to see where it is going before it goes there, and
the lava you are about to wrap into is exactly what you need on screen.

- The **head** is the bright end of the snake's ramp and blinks slowly; the tail
  is dark. Which end you are steering should never be a question.
- Cells in frames other than the one you are in are dimmed, not hidden.
- **Lava** is drawn as one rounded slab per block per slice it occupies, not as
  a heap of cubes. Within a slice a block is a single object, so only its outer
  edges are filleted -- rounding each cell on its own would put a bulge at every
  internal seam. The per-slice part matters: a block's proportions are shuffled
  across all four axes when it is placed, so most blocks are two or three slices
  deep in w, and each of those rooms has to show its own share of the hazard. It is
  80% opaque, so a snake behind it is still findable.
- **The glow runs along w only.** A cell one step from lava *along the fourth
  dimension* carries a faint red wash; a cell beside lava in the same room does
  not. In three dimensions the slab is already drawn solid right there, so a
  halo around it repeats what you can plainly see, six times over, and with
  three blocks spread across several rooms each that was most of what was on
  screen. Along w it is the opposite: lava in the next room is the one hazard
  the view cannot show you from where you stand. So a hint means exactly one
  thing -- press A or D here and you are in the fire.

  Each hint is drawn as one rounded slab sharing the block's own footprint, the
  same way the lava is. A hint is that block's shadow cast one step along w, so
  it has the block's shape; drawing it per cell instead fillets every internal
  seam and a run of them reads as a stack of separate pills rather than one
  thing. Rounded harder than the lava and drawn faintly, and only in the room --
  the hints cast no shadow on the walls. Those already carry the snake, the
  head, the apple and the lava, and a fifth layer warning about a room you are
  not in turned them into noise. The hint solids say it well enough, and the
  slice panel says it exactly.

  On the panel, lava is drawn as one rounded shape per connected cluster while
  the snake is drawn square. The contrast is doing work: the snake is made of
  cells and moves a cell at a time, so square corners say what it is; the lava
  is a region of terrain, so it gets an outline rather than a grid of tiles.

  The slice panel keeps the full halo in every direction. It draws one flat
  plane, so a halo there is genuine information about that plane rather than a
  repeat of something already visible.
- **Lava casts its own shadow** on the walls, in the same rounded shape, under
  everything else's marks. It is the one projection that is not about position
  but about danger -- a hazard in a far corner of the room announces itself on
  the near wall.
- A step between frames is drawn as a **thin grey line**, not as snake — it is
  not a length of snake lying in a room, it is the same snake continuing in the
  next one. A body that has wrapped along w shows the same way.
- The **wall projections** put the head, the body and the apple on the walls of
  each room, which is usually how you find the apple before you can see it.
- **The apple pulses**, in the room and on the slice panel from one clock, so
  the two read as one object seen two ways. A soft pulse rather than the head's
  hard blink: the head is a caret and wants an edge, the apple is a prize and
  should breathe. Different shapes keep them from looking like the same kind of
  thing.

  The panel marks the apple even when it is not in the slice, as a much smaller
  dot at the same height and the same w. That is not where the apple is -- the
  pinned axes differ -- but it is two of its four coordinates, plainly stated:
  which way is up to it, and which way along the ring. The size is what keeps
  the two readings apart. A big dot is a thing you can reach; a small one is a
  bearing.

## The slice panels

The 3D view is an overview, and it is poor at one specific question: *what is
one step away from me, right now?* Perspective makes you judge depth, and the
ring of frames makes you scan sideways across rooms.

So the panels beside it are flat cross-sections rather than a second overview.
There are two, one above the other, and between them every direction on the pad
appears on exactly one of them:

- The **x-z panel**, taken at the head's own w and y, is the horizontal plane the
  arrow keys move in. North is at the top, matching both the key and the compass
  the main view is aimed along.
- The **w-y panel**, taken at the head's own x and z, is the plane `W`, `S`, `A`
  and `D` move in: vertical is up and down, horizontal is the fourth dimension
  with kata left and ana right.

Everything on either is genuinely one keypress away — and the keys sit directly
above the panel they move you around, arrows on the right to match the keyboard.
That pairing is the whole layout, and it is why the panels carry no axis labels
of their own: the key that moves you that way is already there, in the right
place and the right colour. Each panel's footer names the two axes it is holding
still, which is the only thing that tells the two apart.

Anything not in the slice is not drawn, including your own body. A segment one
step out of the plane is not reachable, and drawing it would be a picture of a
snake that is not there.

The dashed purple edges are the seam where w rejoins itself. They say the board
does not stop there; a solid border would claim a wall that is not present.

## Layout

```
src/snake.js   the rules: movement, growth, lava, collisions, wrap
src/app.js     three.js rendering and input
test/run.js    the model's tests
```

`snake.js` knows nothing about drawing and nothing about how many dimensions
there are, so the same rules run a 2D, 3D, 4D or 5D board — the test suite
exercises all four. Everything else comes from `../../shared/`.
