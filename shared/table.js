// The table the frames stand on.
//
// A large black slab under everything, and a 4D object rather than a prop: what
// is drawn is the 3D slice of it at the player's current w, so walking along
// the fourth dimension reveals a different slice and the table is seen to
// change shape -- circle to triangle to hexagon and round again.
//
// It is there to make the fourth dimension something you can watch happen to a
// familiar object. The frames tell you where you are; the ring tells you the
// slices are arranged in a loop. Neither shows you a 4D SOLID being cut, which
// is the thing that is genuinely hard to picture, and which a table is a good
// vehicle for precisely because a table is not mysterious.
//
// The solid itself, and the arithmetic of slicing it, are in tableshape.js.
// This file is only the drawing.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { sidesAt, ngonRadius, tableW } from './tableshape.js';
import { marble } from './noise.js';

// The two near-blacks the marbling runs between, as linear RGB.
//
// Both are barely off the background. A table is the one thing on screen that
// must never compete for attention -- it is what the game stands on -- so the
// veining has to be findable rather than visible: something the eye picks up
// when it rests on the background, and does not notice at all while the player
// is reading the board.
// Set by reading rendered pixels, not by picking values that look right in a
// swatch. The background is 0x0e1116 -- 14,17,22 in sRGB -- and the surface has
// to sit just above that: close enough that the table still reads as the
// darkest thing on screen, far enough that the veining has somewhere to swing.
//
// The range between them is the whole effect. Too narrow and the marbling is a
// flat slab; too wide and the table starts glowing and competing with the board
// it is supposed to sit behind.
const LO = [0.013, 0.017, 0.026];
const HI = [0.030, 0.037, 0.050];

// How many vein-widths fit across the table. Low, because the marbling should
// read as a few big slabs of stone rather than a fine pattern -- fine detail at
// this size turns to noise on screen and, worse, to shimmer as the table turns.
const MARBLE_SCALE = 2.4;
const VEINS = 0.6;
const WARP = 1.0;

// How fast the pattern flows as the table moves through w. Well under one, so
// crossing a slice drifts the stone rather than replacing it -- the surface
// should look like the same table seen a little differently, which is what it
// is.
const W_SCALE = 0.35;

// Rings of vertices from the middle to the rim. This is the resolution the
// marbling is drawn at: too few and the veins turn into visible facets, too
// many and every shape change rebuilds a mesh that costs more than it shows.
//
// 48 is where the colour step between neighbouring vertices drops below about
// a fiftieth of the ramp, which is the point at which Gouraud shading stops
// showing the grid. That is ~6k vertices, rebuilt only when the outline
// actually changes.
const MARBLE_RINGS = 48;

export class Table {
  // `radius` is the INRADIUS: how far the slab reaches at the nearest point of
  // its edge, so it means the same thing whatever shape the table currently is.
  // Make it large enough to read as a surface the whole ring rests on rather
  // than a plate under one frame. `y` is the height of its top surface.
  constructor({ radius = 40, y = -0.6, thickness = 1.2, segments = 128 } = {}) {
    this.radius = radius;
    this.y = y;
    this.thickness = thickness;
    this.segments = segments;
    this.group = new THREE.Group();
    // Behind everything: it is scenery, and nothing about the game should ever
    // be read through it.
    this.group.renderOrder = -1;
    this.mesh = null;
    this.rim = null;
    this.top = null;
    this.shownSides = null;
    // Where along w the marbling was last painted, so a move that is too small
    // to change the outline still flows the veins.
    this.paintedAt = null;
  }

  // Build or rebuild the slab for a given number of sides.
  //
  // The geometry is regenerated rather than morphed because the shape changes
  // only while the player is moving between slices, and a fresh lathe of a few
  // hundred triangles costs less than the machinery to animate one.
  // The top surface, as a radial grid: `rings` rows of `segments` vertices
  // running from the middle out to the n-gon outline.
  //
  // ExtrudeGeometry is what a slab wants everywhere else, but it triangulates a
  // polygon as a fan from the rim, so EVERY vertex it makes lies on the
  // perimeter -- measured, not assumed: a 128-gon comes back with 1536 vertices
  // and none of them inside. Vertex colour on that mesh can only interpolate
  // flatly across the middle, so there would be nothing to see. A grid gives
  // the interior vertices the marbling is painted on.
  //
  // Rings are spaced by the SQUARE ROOT of the fraction, so each one covers a
  // similar area. Even spacing crowds detail into the middle, where a table has
  // the least of it.
  topGeometry(n, R, rings) {
    const pos = [], idx = [];
    const S = this.segments;
    for (let i = 0; i <= rings; i++) {
      const f = Math.sqrt(i / rings);
      for (let j = 0; j < S; j++) {
        const th = (j / S) * Math.PI * 2;
        const r = ngonRadius(th, n) * R * f;
        pos.push(Math.cos(th) * r, 0, Math.sin(th) * r);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < S; j++) {
        const a = i * S + j, b = i * S + (j + 1) % S;
        const c = (i + 1) * S + j, d = (i + 1) * S + (j + 1) % S;
        // Wound anticlockwise seen from ABOVE, so the face normals come out
        // pointing up. Getting this backwards does not draw an upside-down
        // table, it draws a black one: the normals face away from the lights
        // and front-face culling hides the surface from the camera entirely,
        // which looks exactly like the marbling having no effect.
        //
        // The innermost ring is a cone of degenerate quads around the centre,
        // so it contributes one triangle each rather than two.
        if (i > 0) idx.push(a, b, c);
        idx.push(b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Paint the marbling into the top surface's vertex colours.
  //
  // Sampled in 4D: a vertex's own x and z, and the table's CURRENT w for the
  // other two. That is the whole point of doing it this way -- the veins are a
  // slice of a 4D field, so moving along w flows the pattern through the stone
  // instead of swapping one texture for another. The table is a 4D object and
  // now its surface is too.
  paint(geo, w) {
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    // The field is sampled in table-radius units, so the veins keep the same
    // size on screen whatever the table's dimensions are.
    const k = MARBLE_SCALE / this.radius;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const m = marble([x * k, w * W_SCALE, z * k, w * W_SCALE * 0.6],
                       { veins: VEINS, warp: WARP, octaves: 4, seed: 12345 });
      // A narrow band between two near-blacks. The surface has to stay dark
      // enough to read as a table rather than as a lit object competing with
      // the game, so the marbling is a whisper of variation, not a pattern.
      col[i * 3] = LO[0] + (HI[0] - LO[0]) * m;
      col[i * 3 + 1] = LO[1] + (HI[1] - LO[1]) * m;
      col[i * 3 + 2] = LO[2] + (HI[2] - LO[2]) * m;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  setSides(n, w) {
    // A hundredth of a side is far below anything visible, and rebuilding on
    // every frame of a slide would be wasteful.
    //
    // The marbling still has to follow w even when the shape has not moved
    // enough to rebuild -- the two change at different rates, and a table whose
    // veins only flowed when its outline changed would stutter. So a small move
    // repaints the existing surface and returns; only a real shape change
    // rebuilds the geometry.
    if (this.shownSides !== null && Math.abs(this.shownSides - n) < 0.01) {
      if (this.top && Math.abs(this.paintedAt - w) > 0.002) {
        this.paint(this.top.geometry, w);
        this.paintedAt = w;
      }
      return;
    }
    this.shownSides = n;

    for (const o of [...this.group.children]) {
      this.group.remove(o);
      if (o.geometry) o.geometry.dispose();
    }

    // `radius` is held as the INRADIUS -- the distance to the middle of an edge,
    // which is the part of the outline that comes CLOSEST in. Sizing by that
    // rather than by the corners is what keeps the table the same apparent size
    // all the way round the loop.
    //
    // The alternative, a fixed circumradius, is the obvious thing and it is
    // wrong in both directions at once: a triangle needs twice the circumradius
    // of a circle to cover the same frames, so sizing for the triangle makes
    // the circle fill the whole background, and sizing for the circle leaves
    // the frames hanging off the triangle. Fixing the inradius sizes for the
    // frames at every slice and lets the corners reach out as far as the shape
    // happens to send them.
    const R = this.circumradius(n);
    const shape = new THREE.Shape();
    for (let i = 0; i <= this.segments; i++) {
      const th = (i / this.segments) * Math.PI * 2;
      const r = ngonRadius(th, n) * R;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: this.thickness,
      bevelEnabled: false,
      curveSegments: 1,
    });
    // Extrude builds in the x-y plane and pushes along z; the table wants to
    // lie flat, so it is tipped a quarter turn and dropped to its height.
    geo.rotateX(Math.PI / 2);
    geo.translate(0, this.y, 0);

    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      // Near black, but not the background's black: it has to read as a
      // surface catching a little light rather than as a hole in the scene.
      color: 0x05070a,
      emissive: 0x000000,
    }));
    this.group.add(mesh);
    this.mesh = mesh;

    // The marbled face, laid a hair above the slab's own top so it wins the
    // depth test cleanly rather than z-fighting it. The slab underneath still
    // supplies the thickness and the sides.
    const top = new THREE.Mesh(
      this.topGeometry(n, R, MARBLE_RINGS),
      new THREE.MeshLambertMaterial({ vertexColors: true })
    );
    top.position.y = this.y + 0.01;
    this.paint(top.geometry, w);
    this.paintedAt = w;
    this.group.add(top);
    this.top = top;

    // An edge, so the silhouette is legible against a dark background. This is
    // what actually carries the shape change -- an unlit black slab on a black
    // ground would transform invisibly.
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 15),
      new THREE.LineBasicMaterial({ color: 0x1d2735 })
    );
    this.group.add(rim);
    this.rim = rim;
  }

  // Follow the player along w -- both kinds of w.
  //
  // `shown` is the eased slice, so the table transforms continuously as the
  // ring turns rather than snapping when the slice changes. `yaw` is how far
  // the camera has swung sideways from centre, converted to slices at the
  // ring's own exchange rate, so the table also answers to the drag and to the
  // rock. See tableW: the two are the same quantity in different units.
  //
  // Without the yaw term the table is the one thing on screen that ignores the
  // camera, which reads as scenery pasted behind the game rather than a solid
  // the game is standing on.
  update(shown, depth, yaw = 0, slots = depth) {
    const w = tableW(shown, yaw, slots);
    this.setSides(sidesAt(w, depth), w);
  }

  // See `radius`: the value passed in is the INRADIUS, and the geometry is
  // built from the circumradius that yields it at the current shape.
  circumradius(n) {
    return this.radius / Math.cos(Math.PI / n);
  }
}

// Re-exported so a caller that has the table already does not need to know the
// maths lives elsewhere. The suite imports from tableshape.js directly, which is
// the point of the split.
export { sidesAt, ngonRadius, tableW, SHAPE_LOOP } from './tableshape.js';
