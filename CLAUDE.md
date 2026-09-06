# Working in this repository

Conventions that are not obvious from the code, and that are easy to break
without noticing.

## User-facing text lives in copy files

**Never write a sentence the player will read into a component, a template, a
handler, or an HTML file.** It goes in a copy module:

```
shared/copy.js             text that must read identically in every game
shared/index-copy.js       the landing page
<game>/src/copy.js         that game's own text
```

HTML carries structure; copy files carry words. An element that shows text gets
an id and is filled in from copy at startup — see `writeLabels()` in each game.

**The reason is that no AI-written sentence should reach a player unreviewed.**
Every string in these files is read, edited or approved by the repository's
author before it ships. That is only possible if there is a short list of places
to look — copy scattered through the source cannot be reviewed at all, because
new strings arrive faster than anyone would find them.

So when you add user-facing text, you are drafting, not publishing. Put it in a
copy file where it can be found and rewritten. Do not scatter phrasing through
components on the grounds that it is only a word or two; that is exactly the
text that escapes review.

It follows that the copy files should read as prose, not as a lookup table:
whole sentences, in the order a player meets them, so they can be read start to
finish and judged as writing.

Two exceptions, both narrow:

- **Level names and blurbs** stay in `unknot/src/levels.js`, beside the
  paths they describe. A level is a name, a sentence and a shape together, and
  splitting them would mean editing two files to add one level. This is the one
  place outside a copy file where player-visible prose lives, so it is on the
  list of places to review -- treat the `name` and `blurb` fields there exactly
  as if they were in a copy file.
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
  the DOM. The scenery in `shared/` makes the same split: `tableshape.js`,
  `tablegrid.js`, `orbshape.js` and `noise.js` are pure arithmetic and tested,
  while `table.js` and `orbs.js` only draw. New geometry or maths goes on the
  pure side, where the suite can reach it.
- **Nothing in `shared/` knows how many dimensions there are.** Cells are plain
  arrays and rules are written over their length, which is what lets the same
  code run a 2D, 3D, 4D or 5D board. Writing `p[0], p[1], p[2], p[3]` anywhere
  quietly fixes the dimension count.
- **`npm test` must pass.** It runs every model suite plus the shared engine's.
- **Check changes in a browser.** Most of what matters here is visual, and the
  suite cannot see it. `npm run serve`, then look at the thing you changed.
  Stylesheet links are versioned (`style.css?v=N`) — bump it after editing CSS,
  or the browser serves a stale sheet.
