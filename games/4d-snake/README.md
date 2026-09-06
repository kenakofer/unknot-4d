# 4D Snake

Snake in a 6×6×6×6 box. Walls on three sides; the fourth direction wraps.

**Play it: <https://kenan.schaefkofer.com/4d-snake/>**

Part of [4d-games](../../README.md); see that README for the shared controls and
how the fourth dimension is drawn.

## The rules

You start four segments long, laid out in a straight line with room in front of
you. Three slabs of lava, 3×2×2×1 in random orientations, sit somewhere in the
box; there is always exactly one apple in an empty cell.

- **Press a direction** and the head moves one cell that way. Pressing toward
  the second segment does nothing — the neck is not somewhere the head can go,
  and killing you for a keypress that means *stay put* would be a trap rather
  than a rule.
- **Eat the apple** for 10 points. The apple is worth two segments, and they
  arrive one per turn over the two turns *after* you eat. Growth you can watch
  coming is growth you can plan around.
- **The run ends** if the head reaches a wall, the lava, or your own body.

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
- **Lava** is 80% opaque; the cells around it carry a 10% red wash, so danger
  has an outline you can see coming rather than an edge you find by crossing it.
- A step between frames is drawn as a **thin grey line**, not as snake — it is
  not a length of snake lying in a room, it is the same snake continuing in the
  next one. A body that has wrapped along w shows the same way.
- The **wall projections** put the head, the body and the apple on the walls of
  each room, which is usually how you find the apple before you can see it.

## The slice panel

The 3D view is an overview, and it is poor at one specific question: *what is
one step away from me, right now?* Perspective makes you judge depth, and the
ring of frames makes you scan sideways across rooms.

So the panel beside it is a flat cross-section rather than a second overview. It
shows the **y-w plane** taken at the head's own x and z: vertical is up and down
(`W` and `S`), horizontal is the fourth dimension (`A` to the left, `D` to the
right, matching the keyboard and the direction the ring advances). Everything on
it is genuinely one keypress away — the four edges of the panel are four keys.

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
