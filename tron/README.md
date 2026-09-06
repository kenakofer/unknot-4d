# 4D Tron

Two riders, one clock, permanent trails, in a 6×6×6×6 box. Walls on three
sides; the fourth direction wraps.

**Play it: <https://kenan.schaefkofer.com/4d/tron/>**

Part of [4d-games](../README.md); see that README for the shared controls and
how the fourth dimension is drawn.

## The rules

Both riders move one cell every tick, always, whether or not anyone presses
anything. Every cell either of them leaves becomes a permanent wall. Crash into
a wall, a trail — yours or theirs — or the board edge, and you are out. Last one
riding takes the round; first to three rounds takes the match.

- **A direction is a turn, not a step.** You are always moving; the press only
  changes which way. The turn is remembered and applied at the next tick, so a
  press between ticks is never lost and a fast double-press cannot smuggle in
  two moves.
- **Reversing is refused.** The cell directly behind you is always your own
  trail, so a reversal is never anything but instant death — a control that
  exists only to kill you is a trap rather than a rule.
- **Momentum carries through the fourth dimension too.** Press `D` and you do
  not side-step one slice; you turn to face along w and keep going that way
  until you turn again. w is a lane, not a hop.

## The fourth direction is the escape

The space only ever shrinks, so a round always ends. What makes it a different
game from three-dimensional Tron is that being cut off in three dimensions is
not being cut off: a rider walled in on every side can still have `A` and `D`
open, and drop into a neighbouring slice where the board is empty.

That cuts both ways. w wraps, so drifting along it long enough brings you back
to where you started — into your own trail, which is waiting for you. Six ticks
of running away is a full lap.

## Two players

**Player one** is on the keyboard, using exactly the shared layout: arrow keys
for the horizontal plane, `W`/`S` for up and down, `A`/`D` for the fourth
dimension. Nothing learned in Snake or Unknot has to be unlearned.

**Player two** is on a controller: d-pad for the horizontal plane, `A`/`B` for
up and down, `LB`/`RB` for the fourth dimension. Shoulder buttons for w is the
good part of that mapping — they are the two controls nobody has a prior spatial
expectation about, they are symmetric, and "left shoulder goes left along the
ring" matches both the screen and player one's `A` key.

A browser cannot see a controller until a button is pressed on it, so there is
no way to detect one at load and nothing to be done about it but wait. Until
then player two falls back to `IJKL` for the horizontal plane, `U`/`O` for up
and down, and `N`/`M` for w.

## Reading the board

The camera is the one place this game departs from the others here, and it is
forced. Snake and Unknot travel the camera round the ring to whichever frame the
player is in — with one player there is one right frame to face. With two
players in different slices there is no such frame: following either one
abandons the other, and following both faces neither.

So the main view stops trying. It is a **fixed overview of the whole ring**,
every room on screen at once, showing where both riders are and how much space
is left. The moment-to-moment reading moves to a **slice panel per player**,
which is what a slice panel is for.

Each panel is the y-w plane taken at its own rider's x and z: everything on it
is one keypress away. Both riders' walls appear on both panels, because a panel
that hid the opponent's wall would be lying about the one thing it exists to
tell the truth about. Your own wall is drawn softer than theirs — both will kill
you, but theirs is the one that arrived without your choosing it.

The live rider gets a wireframe cage no trail cell has. On a board that is
mostly trail, colour and size alone are not enough to find the end of your own
line.

## Layout

```
src/tron.js    the rules: the tick, trails, collisions, rounds
src/app.js     three.js rendering and input
test/run.js    the model's tests
```

The model knows nothing about drawing, input, or how many dimensions there are —
the suite runs it in 2, 3, 4 and 5. Everything else comes from `../shared/`,
including `gamepad.js`, which turns controller polling into the same
`(axis, sign)` calls the keyboard makes.

## The part that is easy to get wrong

Both riders move at the *same* time, which makes three cases that resolving in
array order would silently get wrong — and would quietly hand player one every
tie. All three are built explicitly in the test suite:

- **Swapping through each other.** Two riders one cell apart, closing. Neither
  reaches the other's cell, but they pass through each other. That is a head-on:
  both out, round drawn.
- **Claiming the same cell.** Two riders two cells apart, closing, both moving
  into the gap. Also a head-on, also a draw.
- **Moving into a cell the opponent is leaving.** Not a collision. Both riders
  committed to their move when neither had laid this tick's wall, so a rider
  must not die on a cell being vacated on the very same tick.

The last is the one that decides the rule: deaths are judged against the board
as it stood at the *start* of the tick, minus every cell a rider is leaving.
