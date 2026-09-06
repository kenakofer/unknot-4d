# Working in this repository

Conventions that are not obvious from the code, and that are easy to break
without noticing.

## User-facing text lives in copy files

**Never write a sentence the player will read into a component, a template, a
handler, or an HTML file.** It goes in a copy module:

```
shared/copy.js             text that must read identically in every game
shared/index-copy.js       the landing page
games/<game>/src/copy.js   that game's own text
```

HTML carries structure; copy files carry words. An element that shows text gets
an id and is filled in from copy at startup — see `writeLabels()` in each game.

The reason is not tidiness. Copy scattered through the source cannot be reviewed
*as writing*: you cannot read the game's voice without reading the game's code,
and a phrase that drifts out of step with the rest is invisible until a player
hits it. Gathered, all of it can be read start to finish in a minute.

Two exceptions, both narrow:

- **Level names and blurbs** stay in `games/4d-unknot/src/levels.js`, beside the
  paths they describe. A level is a name, a sentence and a shape together, and
  splitting them would mean editing two files to add one level.
- **Strings the player never sees** — key names (`'Escape'`, `' '`), element
  ids, CSS classes, storage keys — are code that happens to be a string. They
  stay where they are used.

Composed sentences belong in copy too, as functions rather than fragments:

```js
lostBy: (name, cause) => `${name} went ${cause}`,
```

That keeps the whole sentence readable in one place, which is the point.

## Everything else

- **Models know nothing about drawing.** `snake.js`, `tron.js` and `knot.js` run
  under Node and are tested there. Nothing in them may import three.js or touch
  the DOM.
- **Nothing in `shared/` knows how many dimensions there are.** Cells are plain
  arrays and rules are written over their length, which is what lets the same
  code run a 2D, 3D, 4D or 5D board. Writing `p[0], p[1], p[2], p[3]` anywhere
  quietly fixes the dimension count.
- **`npm test` must pass.** It runs every model suite plus the shared engine's.
- **Check changes in a browser.** Most of what matters here is visual, and the
  suite cannot see it. `npm run serve`, then look at the thing you changed.
  Stylesheet links are versioned (`style.css?v=N`) — bump it after editing CSS,
  or the browser serves a stale sheet.
