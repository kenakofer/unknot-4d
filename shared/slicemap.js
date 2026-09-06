// A flat slice through the board, taken at whatever the player is steering.
//
// The main view draws three axes as space and the fourth as a ring of rooms.
// That is good for seeing where things are and bad for one specific question:
// *what is one step away from me, right now, in each direction?* A perspective
// view answers that by making you judge depth, and the ring answers it by
// making you scan sideways across rooms.
//
// So this panel holds two axes and pins the rest to the head's own coordinates.
// Everything drawn on it is genuinely one step from the head along one of the
// two axes shown -- no depth to judge, no rooms to scan. It is a cross-section,
// not an overview, which is what makes it worth having beside a view that is
// already an overview.
//
// Drawn as SVG rather than a second WebGL canvas: the strokes stay crisp at
// this size and the whole thing costs almost nothing to redraw.

const NS = 'http://www.w3.org/2000/svg';

// Matches the panel background, so a mark drawn under another reads as covered
// rather than blended.
const GROUND = '#161c26';

export class SliceMap {
  // `axes` is [horizontal, vertical] -- which two board axes the panel shows.
  // Everything else is pinned to the focus cell's coordinates.
  //
  // `wrap` says which axes come back round, so the panel can draw the seam
  // where the board joins itself instead of pretending it is a wall.
  // `flipV` reverses the vertical axis, for a panel whose vertical coordinate
  // grows in the direction the screen already calls "down".
  //
  // The default suits an axis like height, where larger is up and the panel
  // should agree. It is wrong for an axis like z, where larger is SOUTH: on a
  // panel drawn from above, south belongs at the bottom, so the coordinate and
  // the screen run the same way and the flip is what makes them agree.
  constructor(svg, { axes = [3, 1], dims, wrap = [], flipV = false } = {}) {
    this.svg = svg;
    this.axes = axes;
    this.dims = dims;
    this.wrap = wrap;
    this.flipV = flipV;
    // Filled in by the game before each draw.
    this.focus = null;       // the cell the slice is taken at (the head)
    this.body = [];          // cells of the thing being steered, head first
    this.apple = null;
    // 0..1, set by the game each frame so the panel's apple pulses in step with
    // the one in the room.
    this.appleFade = undefined;
    // What occupies a cell, if anything. Returns null for empty, or
    // {colour, opacity} for a cell that is filled -- lava, a wall, a trail.
    // A game with more than one player uses this to say WHOSE wall a cell is,
    // which is the single most useful thing the panel can tell them.
    this.cellFill = () => null;
    this.glow = null;        // Set of keys, or null
    // [left, right, below, above] -- the key or name for each edge of the
    // panel. Supplied by the game, since only it knows what its keys mean.
    //
    // Optional, and worth leaving unset when the game puts the keys themselves
    // directly above the panel: the buttons are then the legend, in the right
    // place and the right colour, and edge labels only repeat them.
    this.labels = null;
  }

  // Is `p` in the slice this panel shows? Every axis except the two drawn has
  // to match the focus exactly -- that is what makes this a cross-section
  // rather than a projection, and what lets the player trust that anything on
  // screen is genuinely one step away.
  inSlice(p) {
    const [H, V] = this.axes;
    for (let d = 0; d < p.length; d++) {
      if (d === H || d === V) continue;
      if (p[d] !== this.focus[d]) return false;
    }
    return true;
  }

  // Update the apple's mark without redrawing the whole panel.
  //
  // Between moves the apple is the only thing that changes, so a full redraw
  // every frame would rebuild every wall, every grid line and every body
  // segment to animate one dot. The mark is kept from the last draw and its
  // opacity is set here instead.
  pulseApple() {
    const c = this._appleMark;
    if (!c || this.appleFade === undefined) return;
    c.setAttribute('opacity', (this._appleHere
      ? this.appleFade
      : 0.45 + 0.35 * this.appleFade).toFixed(3));
  }

  draw() {
    const svg = this.svg;
    if (!svg || !this.focus) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const [H, V] = this.axes;
    const nx = this.dims[H], ny = this.dims[V];

    const vb = svg.viewBox && svg.viewBox.baseVal;
    const W = (vb && vb.width) || 240;
    const Ht = (vb && vb.height) || 160;
    // Square cells, sized so the whole slice fits with a margin for the labels.
    const pad = 15;
    const cell = Math.min((W - pad * 2) / nx, (Ht - pad * 2) / ny);
    const ox = (W - cell * nx) / 2;
    const oy = (Ht - cell * ny) / 2;

    // Board coordinates to panel coordinates. The vertical axis is flipped:
    // higher up on the board is higher on the panel, because W is up in the
    // game and a panel that disagreed with the up key would be worse than no
    // panel at all.
    const px = (h) => ox + h * cell;
    const py = (v) => oy + (this.flipV ? v : ny - 1 - v) * cell;

    const rect = (h, v, fill, opacity = 1, inset = 0) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', (px(h) + inset).toFixed(2));
      r.setAttribute('y', (py(v) + inset).toFixed(2));
      r.setAttribute('width', (cell - inset * 2).toFixed(2));
      r.setAttribute('height', (cell - inset * 2).toFixed(2));
      r.setAttribute('fill', fill);
      if (opacity !== 1) r.setAttribute('opacity', opacity);
      svg.appendChild(r);
      return r;
    };

    // The cell the slice is taken at, in panel terms.
    const fh = this.focus[H], fv = this.focus[V];

    // --- the ground ------------------------------------------------------
    const ground = document.createElementNS(NS, 'rect');
    ground.setAttribute('x', ox.toFixed(2));
    ground.setAttribute('y', oy.toFixed(2));
    ground.setAttribute('width', (cell * nx).toFixed(2));
    ground.setAttribute('height', (cell * ny).toFixed(2));
    ground.setAttribute('fill', GROUND);
    svg.appendChild(ground);

    // --- whatever fills a cell, and any glow beside it --------------------
    // Drawn first, so the player's own marker sits on top.
    //
    // Filled cells are grouped into CLUSTERS and each cluster drawn as one
    // rounded shape, not as a grid of separate squares. A slab of lava is one
    // piece of terrain; drawing it cell by cell made it read as a pile of
    // tiles, and rounding each tile made that worse rather than better -- the
    // same mistake the 3D view made before its lava was drawn per block.
    //
    // The contrast with the snake is the point. The snake is square because it
    // is made of cells and moves a cell at a time; the lava is rounded because
    // it is a region. One is a body, the other is terrain, and the shapes say
    // so before the colours do.
    const filled = new Map();     // "h,v" -> {colour, opacity}
    for (let h = 0; h < nx; h++) {
      for (let v = 0; v < ny; v++) {
        const p = this.focus.slice();
        p[H] = h; p[V] = v;
        const f = this.cellFill(p);
        if (f) filled.set(h + ',' + v, f);
        else if (this.glow && this.glow.has(p.join(','))) {
          rect(h, v, '#ff5a3c', 0.16);
        }
      }
    }
    for (const group of clusters(filled)) {
      const d = clusterPath(group.cells, px, py, cell, cell * 0.34);
      // A cluster whose outline came out empty draws nothing, rather than an
      // element with no geometry. Belt and braces: every shape of cluster
      // should produce a loop, but an empty <path> is invisible in a
      // screenshot and confusing in the DOM, so it does not get added at all.
      if (!d) continue;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', group.colour);
      const op = group.opacity === undefined ? 0.85 : group.opacity;
      if (op !== 1) path.setAttribute('opacity', op);
      svg.appendChild(path);
    }

    // --- the grid --------------------------------------------------------
    for (let i = 0; i <= nx; i++) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', px(i).toFixed(2)); l.setAttribute('x2', px(i).toFixed(2));
      l.setAttribute('y1', oy.toFixed(2));
      l.setAttribute('y2', (oy + cell * ny).toFixed(2));
      l.setAttribute('stroke', '#2c3646');
      l.setAttribute('stroke-width', '0.7');
      svg.appendChild(l);
    }
    for (let i = 0; i <= ny; i++) {
      const y = (oy + cell * i).toFixed(2);
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', ox.toFixed(2));
      l.setAttribute('x2', (ox + cell * nx).toFixed(2));
      l.setAttribute('y1', y); l.setAttribute('y2', y);
      l.setAttribute('stroke', '#2c3646');
      l.setAttribute('stroke-width', '0.7');
      svg.appendChild(l);
    }

    // --- the seam, where a wrapping axis rejoins itself -------------------
    // A dashed edge rather than a solid one: the board does not stop here, it
    // continues on the far side. Without this the panel would look like a room
    // with four walls, which for a wrapping axis is exactly the wrong idea.
    if (this.wrap[H]) {
      for (const x of [ox, ox + cell * nx]) {
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', x.toFixed(2)); l.setAttribute('x2', x.toFixed(2));
        l.setAttribute('y1', oy.toFixed(2));
        l.setAttribute('y2', (oy + cell * ny).toFixed(2));
        l.setAttribute('stroke', '#c89bff');
        l.setAttribute('stroke-width', '1.4');
        l.setAttribute('stroke-dasharray', '3 3');
        l.setAttribute('opacity', '0.75');
        svg.appendChild(l);
      }
    }

    // --- the body --------------------------------------------------------
    // Only the segments actually in this slice. A segment one step out of it is
    // not drawn at all: the whole value of the panel is that what you see is
    // what you can reach, and a body drawn flat regardless of depth would be a
    // picture of a snake that is not there.
    //
    // Adjacent segments are JOINED. A segment is drawn as a rounded rectangle
    // that reaches out to whichever of its neighbours sits next to it on this
    // panel, so a run of them is one continuous shape with rounded ends rather
    // than a column of separate beads.
    //
    // "Next to it on this panel" is the careful part, and it is not the same as
    // "next to it in the body". Two segments consecutive in the snake are only
    // neighbours HERE if their step was along one of the two axes this panel
    // draws; a step along a pinned axis puts them in different slices, and
    // joining those would draw a bridge across a gap the snake did not cross.
    const inset = cell * 0.16;
    const near = (a, b) => {
      if (!a || !b) return false;
      if (!this.inSlice(a) || !this.inSlice(b)) return false;
      const dh = Math.abs(a[H] - b[H]), dv = Math.abs(a[V] - b[V]);
      return dh + dv === 1;
    };
    for (let i = this.body.length - 1; i >= 1; i--) {
      const p = this.body[i];
      if (!this.inSlice(p)) continue;
      const t = this.body.length < 2 ? 0 : i / (this.body.length - 1);
      const fill = mix([0x8d, 0xff, 0xc8], [0x2a, 0x8f, 0x6a], t);

      // Reach toward each adjacent neighbour by exactly the inset, which is the
      // width of the gap between two cells' rectangles -- so the two meet
      // flush and the joint disappears.
      let x0 = px(p[H]) + inset, y0 = py(p[V]) + inset;
      let x1 = px(p[H]) + cell - inset, y1 = py(p[V]) + cell - inset;
      for (const q of [this.body[i - 1], this.body[i + 1]]) {
        if (!near(p, q)) continue;
        if (q[H] === p[H] + 1) x1 += inset;
        else if (q[H] === p[H] - 1) x0 -= inset;
        // Which screen direction a step along +V takes depends on flipV: it is
        // upward (smaller y) normally, downward when the axis is flipped. Ask
        // py rather than assuming, so the two cases cannot drift apart.
        else if (q[V] === p[V] + 1) {
          if (py(q[V]) < py(p[V])) y0 -= inset; else y1 += inset;
        } else if (q[V] === p[V] - 1) {
          if (py(q[V]) < py(p[V])) y0 -= inset; else y1 += inset;
        }
      }

      // Square corners, deliberately.
      //
      // The snake is the thing made of cells -- it occupies whole cells, moves
      // a cell at a time, and the panel's grid is the scale it is read at.
      // Square corners say that; rounded ones made it look like a drawn shape
      // laid over the grid rather than something sitting in it. The lava, which
      // is a solid region rather than a run of cells, is rounded instead, and
      // the contrast is doing work: one is a body, the other is terrain.
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x0.toFixed(2));
      r.setAttribute('y', y0.toFixed(2));
      r.setAttribute('width', (x1 - x0).toFixed(2));
      r.setAttribute('height', (y1 - y0).toFixed(2));
      r.setAttribute('fill', fill);
      svg.appendChild(r);
    }

    // --- the apple -------------------------------------------------------
    //
    // In slice: a full dot, where it actually is.
    //
    // Out of slice: a much smaller dot at the same place on the two axes the
    // panel DOES show. It is not where the apple is -- the pinned axes differ,
    // so it is somewhere else entirely -- but it says how far up and how far
    // along w the apple sits, which is the part of the answer this panel is in
    // a position to give. Two of the four coordinates, plainly, rather than
    // nothing at all. The size difference is what keeps the two readings apart:
    // a big dot is a thing you can reach, a small one is a bearing.
    if (this.apple) {
      const here = this.inSlice(this.apple);
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', (px(this.apple[H]) + cell / 2).toFixed(2));
      c.setAttribute('cy', (py(this.apple[V]) + cell / 2).toFixed(2));
      c.setAttribute('r', (cell * (here ? 0.3 : 0.12)).toFixed(2));
      c.setAttribute('fill', '#24ff5e');
      // The blink runs on both, in step with the apple in the room, so the two
      // read as one object seen two ways.
      if (this.appleFade !== undefined) {
        c.setAttribute('opacity', (here ? this.appleFade
                                        : 0.45 + 0.35 * this.appleFade).toFixed(3));
      } else if (!here) {
        c.setAttribute('opacity', '0.8');
      }
      svg.appendChild(c);
      this._appleMark = c;
      this._appleHere = here;
    } else {
      this._appleMark = null;
    }

    // --- the head --------------------------------------------------------
    // Last, over everything, and ringed: this is the one mark the player looks
    // for first, and it must never be ambiguous which cell it is in.
    // The same inset the body uses, so where a segment reaches out to the head
    // the two meet flush instead of leaving a hairline seam. Square, like the
    // body it is the end of.
    rect(fh, fv, '#8dffc8', 1, inset);
    const ring = document.createElementNS(NS, 'rect');
    ring.setAttribute('x', px(fh).toFixed(2));
    ring.setAttribute('y', py(fv).toFixed(2));
    ring.setAttribute('width', cell.toFixed(2));
    ring.setAttribute('height', cell.toFixed(2));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#ffffff');
    ring.setAttribute('stroke-width', '1.2');
    ring.setAttribute('opacity', '0.85');
    svg.appendChild(ring);

    // --- the labels ------------------------------------------------------
    // Which key moves which way on this panel. Without these it is a grid of
    // coloured squares, and the player has to work out the mapping by moving
    // and watching -- which is exactly the guesswork the panel exists to
    // remove. The colours are the shared per-axis ones, so a glance ties the
    // panel to the pad.
    const label = (text, x, y, colour, anchor = 'middle') => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x.toFixed(2));
      t.setAttribute('y', y.toFixed(2));
      t.setAttribute('fill', colour);
      t.setAttribute('font-size', '9.5');
      t.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
      t.setAttribute('text-anchor', anchor);
      t.setAttribute('font-weight', '600');
      t.setAttribute('opacity', '0.85');
      t.textContent = text;
      svg.appendChild(t);
    };
    const mid = { x: ox + cell * nx / 2, y: oy + cell * ny / 2 };
    if (this.labels) {
      const [lo, hi, below, above] = this.labels;
      label(lo, ox - 4, mid.y + 3, this.axisColour(H), 'end');
      label(hi, ox + cell * nx + 4, mid.y + 3, this.axisColour(H), 'start');
      label(above, mid.x, oy - 4, this.axisColour(V));
      label(below, mid.x, oy + cell * ny + 9, this.axisColour(V));
    }
  }

  // The shared per-axis colours, so the panel, the pad and the ring of frames
  // all say the same thing about which direction is which.
  axisColour(d) {
    return ['#ff9e6d', '#6ee7a8', '#7cc4ff', '#c89bff'][d] || '#8fa0b8';
  }
}

// Connected runs of filled cells, grouped so that each comes out as one shape.
//
// Cells only join when they share an EDGE and agree on colour and weight. The
// colour test matters wherever two things can be adjacent and are not the same
// thing -- two players' walls touching in Tron, say -- since merging those
// would draw one region where there are two.
function clusters(filled) {
  const seen = new Set();
  const out = [];
  for (const [k, f] of filled) {
    if (seen.has(k)) continue;
    const cells = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop();
      const [h, v] = cur.split(',').map(Number);
      cells.push([h, v]);
      for (const [dh, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (h + dh) + ',' + (v + dv);
        if (seen.has(nk)) continue;
        const nf = filled.get(nk);
        if (!nf || nf.colour !== f.colour || nf.opacity !== f.opacity) continue;
        seen.add(nk);
        stack.push(nk);
      }
    }
    out.push({ cells, colour: f.colour, opacity: f.opacity });
  }
  return out;
}

// An SVG path covering a set of cells, with the cluster's outer corners
// rounded by `r`.
//
// Built per cell rather than by tracing the boundary. Boundary tracing is the
// textbook approach and I got it wrong three times: keying edges by their start
// point drops one whenever two edges leave the same point, collinear points
// have to be pruned before rounding or the arcs double back, and a pinch point
// where two loops meet needs a tie-break. Each fix revealed the next, and the
// failures were silent -- a wedge or a sliver rather than an error.
//
// This is duller and cannot go wrong. Every cell contributes one rectangle, so
// the union is exactly the cluster by construction; the only cleverness is that
// a cell rounds a corner when both sides meeting there are exposed, which is
// precisely when that corner is on the outside of the cluster. Interior corners
// stay square and the rectangles meet flush, so the whole thing reads as one
// rounded shape.
function clusterPath(cells, px, py, cell, r) {
  const has = new Set(cells.map(([h, v]) => h + ',' + v));
  const at = (h, v) => has.has(h + ',' + v);
  let d = '';
  for (const [h, v] of cells) {
    const x0 = px(h), x1 = px(h) + cell;
    // py gives the TOP of a cell's row, and y grows downward.
    const y0 = py(v), y1 = py(v) + cell;
    const up = at(h, v + 1), down = at(h, v - 1);
    const left = at(h - 1, v), right = at(h + 1, v);
    // A corner is rounded only when both of its sides are exposed.
    const tl = !up && !left ? r : 0;
    const tr = !up && !right ? r : 0;
    const br = !down && !right ? r : 0;
    const bl = !down && !left ? r : 0;
    d += `M${(x0 + tl).toFixed(2)},${y0.toFixed(2)}`;
    d += `L${(x1 - tr).toFixed(2)},${y0.toFixed(2)}`;
    if (tr) d += `Q${x1.toFixed(2)},${y0.toFixed(2)} ${x1.toFixed(2)},${(y0 + tr).toFixed(2)}`;
    d += `L${x1.toFixed(2)},${(y1 - br).toFixed(2)}`;
    if (br) d += `Q${x1.toFixed(2)},${y1.toFixed(2)} ${(x1 - br).toFixed(2)},${y1.toFixed(2)}`;
    d += `L${(x0 + bl).toFixed(2)},${y1.toFixed(2)}`;
    if (bl) d += `Q${x0.toFixed(2)},${y1.toFixed(2)} ${x0.toFixed(2)},${(y1 - bl).toFixed(2)}`;
    d += `L${x0.toFixed(2)},${(y0 + tl).toFixed(2)}`;
    if (tl) d += `Q${x0.toFixed(2)},${y0.toFixed(2)} ${(x0 + tl).toFixed(2)},${y0.toFixed(2)}`;
    d += 'Z';
  }
  return d;
}

function mix(a, b, t) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
