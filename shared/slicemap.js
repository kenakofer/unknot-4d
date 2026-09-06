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
  constructor(svg, { axes = [3, 1], dims, wrap = [] } = {}) {
    this.svg = svg;
    this.axes = axes;
    this.dims = dims;
    this.wrap = wrap;
    // Filled in by the game before each draw.
    this.focus = null;       // the cell the slice is taken at (the head)
    this.body = [];          // cells of the thing being steered, head first
    this.apple = null;
    this.isLava = () => false;
    this.glow = null;        // Set of keys, or null
    // [left, right, below, above] -- the key or name for each edge of the
    // panel. Supplied by the game, since only it knows what its keys mean.
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
    const py = (v) => oy + (ny - 1 - v) * cell;

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

    // --- lava, and the glow beside it ------------------------------------
    // Drawn first, so the snake and the apple sit on top of them.
    for (let h = 0; h < nx; h++) {
      for (let v = 0; v < ny; v++) {
        const p = this.focus.slice();
        p[H] = h; p[V] = v;
        if (this.isLava(p)) {
          rect(h, v, '#ff2b1d', 0.8);
        } else if (this.glow && this.glow.has(p.join(','))) {
          rect(h, v, '#ff5a3c', 0.16);
        }
      }
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
    for (let i = this.body.length - 1; i >= 1; i--) {
      const p = this.body[i];
      if (!this.inSlice(p)) continue;
      const t = this.body.length < 2 ? 0 : i / (this.body.length - 1);
      rect(p[H], p[V], mix([0x8d, 0xff, 0xc8], [0x2a, 0x8f, 0x6a], t), 1,
           cell * 0.16);
    }

    // --- the apple -------------------------------------------------------
    if (this.apple && this.inSlice(this.apple)) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', (px(this.apple[H]) + cell / 2).toFixed(2));
      c.setAttribute('cy', (py(this.apple[V]) + cell / 2).toFixed(2));
      c.setAttribute('r', (cell * 0.3).toFixed(2));
      c.setAttribute('fill', '#24ff5e');
      svg.appendChild(c);
    }

    // --- the head --------------------------------------------------------
    // Last, over everything, and ringed: this is the one mark the player looks
    // for first, and it must never be ambiguous which cell it is in.
    const hr = rect(fh, fv, '#8dffc8', 1, cell * 0.14);
    hr.setAttribute('rx', (cell * 0.18).toFixed(2));
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

function mix(a, b, t) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
