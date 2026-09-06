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
import { topSegments, topVertexCount, topIndex, fillTop } from './tablegrid.js';
import { marbleTiled } from './noise.js';
import { LO, HI, MARBLE_RINGS, MARBLE_TEXELS, UV_SCALE, VEINS, WARP, OUTLINE_STEP,
  YAW_FLOW, YAW_FLOW_TURNS, DRIFT_RADIUS, DRIFT_SPIN } from './tableconst.js';

// The value the table's surface writes into the stencil buffer. Anything that
// wants to be clipped to the table -- reflections, for now -- draws with
// EqualStencilFunc against this.
const TABLE_STENCIL = 7;

// Linear to sRGB, the standard transfer function.
const srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// Bake the marbling into a texture, once per page.
//
// Once per PAGE, not per table. The tile depends on nothing but the constants,
// so every table wants the same image; baking it per instance stalled every
// new game and every tutorial lesson for about 2.8 seconds -- 262 thousand
// samples of a 4D field, seven octaves each.
//
// A texture rather than vertex colour, because of what the drift does: moving
// through w TRANSLATES the pattern, it does not deform it. A translation is a
// UV offset, so one image serves every slice and the flow costs nothing per
// frame. Painting per vertex cost 85ms a rebuild, on every frame of a slide.
let bakedTile = null;
function marbleTile() {
  if (bakedTile) return bakedTile;
  bakedTile = bakeTile();
  return bakedTile;
}

function bakeTile() {
  const N = MARBLE_TEXELS;
  const data = new Uint8Array(N * N * 4);
  // marbleTiled samples a torus, so opposite edges of the tile are the same
  // points of the field and the offset can wrap without a seam.
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N;
      const m = marbleTiled(u, v, { veins: VEINS, warp: WARP, octaves: 4, seed: 12345 });
      const o = (j * N + i) * 4;
      // Encoded to sRGB on the way in. LO and HI are linear, like every other
      // colour here, but the texture is flagged sRGB and three.js decodes it
      // back to linear when it samples -- so writing linear bytes would apply
      // that decode twice. The values are small enough that the second decode
      // crushes them to nothing: the ramp baked to bytes 3..8 out of 255 and
      // the table came out uniformly black.
      data[o]     = Math.round(255 * srgb(LO[0] + (HI[0] - LO[0]) * m));
      data[o + 1] = Math.round(255 * srgb(LO[1] + (HI[1] - LO[1]) * m));
      data[o + 2] = Math.round(255 * srgb(LO[2] + (HI[2] - LO[2]) * m));
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Spin about the middle of the tile rather than its corner. On an
  // infinitely repeating texture either is seamless, but a corner pivot
  // sweeps the sampled region across the surface as it turns, which reads as
  // the stone sliding sideways whenever the table rotates.
  tex.center.set(0.5, 0.5);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

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
    // For things that stand ON the table rather than being part of it. Kept in
    // its own group because the table's own children are disposed and rebuilt
    // whenever its shape changes.
    this.attached = new THREE.Group();
    this.group.add(this.attached);
    // Behind everything: it is scenery, and nothing about the game should ever
    // be read through it.
    this.group.renderOrder = -1;
    this.mesh = null;
    this.rim = null;
    this.depth = 1;
    this.shownSides = null;

    this.tex = marbleTile();

    // Made once: nothing about the materials depends on the shape, and a
    // rebuild used to allocate three new ones and dispose none.
    this.slabMaterial = new THREE.MeshLambertMaterial({
      // Near black, but not the background's black: it has to read as a
      // surface catching a little light rather than as a hole in the scene.
      color: 0x05070a,
      emissive: 0x000000,
    });
    this.topMaterial = new THREE.MeshLambertMaterial({
      map: this.tex,
      // Stamp every pixel of the table's surface into the stencil buffer, so
      // later passes can draw ONLY where there is table. This is what lets a
      // reflection be clipped to the stone without knowing anything about the
      // table's shape -- which matters here, because that shape changes as
      // the player moves through w.
      stencilWrite: true,
      stencilRef: TABLE_STENCIL,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    });
    this.rimMaterial = new THREE.LineBasicMaterial({ color: 0x1d2735 });

    // The marbled face, a hair above the slab's own top so it wins the depth
    // test rather than z-fighting it. Built once: the grid's topology never
    // changes (see tablegrid.js), so a shape change rewrites the positions in
    // place rather than making a new geometry.
    this.top = new THREE.Mesh(this.topGeometry(MARBLE_RINGS), this.topMaterial);
    this.top.position.y = this.y + 0.01;
    this.group.add(this.top);
  }

  // The top surface's buffers, allocated once and filled by reshapeTop.
  //
  // A grid rather than ExtrudeGeometry's fan from the rim, so the surface has
  // interior vertices for the lights to fall off across. It is flat, so the
  // normal is (0, 1, 0) everywhere and is written once.
  topGeometry(rings) {
    const S = topSegments(rings);
    const count = topVertexCount(rings, S);
    this.rings = rings;
    this.topSegs = S;
    const g = new THREE.BufferGeometry();
    const pos = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3);
    const uv = new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2);
    pos.setUsage(THREE.DynamicDrawUsage);
    uv.setUsage(THREE.DynamicDrawUsage);
    const normal = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) normal[i * 3 + 1] = 1;
    g.setAttribute('position', pos);
    g.setAttribute('uv', uv);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    g.setIndex(topIndex(rings, S));
    return g;
  }

  // Move the top surface's vertices onto an n-gon of circumradius R, in place.
  reshapeTop(n, R) {
    const g = this.top.geometry;
    const pos = g.attributes.position, uv = g.attributes.uv;
    const reach = fillTop(pos.array, uv.array, n, R, this.rings, this.topSegs,
                          UV_SCALE / this.radius);
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    // The renderer culls by the bounding sphere, and rewriting the array does
    // not refresh it; a stale sphere gets the table culled while it is plainly
    // in view. fillTop already knows the furthest corner, so set it by hand.
    if (!g.boundingSphere) g.boundingSphere = new THREE.Sphere();
    g.boundingSphere.center.set(0, 0, 0);
    g.boundingSphere.radius = reach;
  }

  // Slide the baked pattern to where the table currently is along w.
  //
  // The path through the tile is a CIRCLE, not a line, and that is what makes
  // the fourth dimension close properly. w wraps -- walking far enough returns
  // you to the slice you started on -- so the marbling has to return with it.
  // A straight drift does not: over a full lap of a six-deep board it moved the
  // offset by 0.651 and -0.399 of a tile, so a player who walked all the way
  // round found the same slice and the same outline wearing different stone.
  //
  // Tuning those numbers to land on whole tiles would work and would be brittle
  // -- it couples the drift rate, the board's depth and the tile size, so
  // changing any one of them silently reopens the seam. A circle closes for
  // ANY radius and any depth, because it returns to its own start by
  // construction. The texture repeats, so a closed path is a seamless one.
  //
  // It also sees more of the tile, not less: the circumference at this radius
  // is 1.95 tiles against the old straight path's 0.76.
  //
  // Still two numbers a frame.
  flowTo(w, flow) {
    // Turns around the loop. `w` is in slices and `depth` slices make a lap, so
    // the angle is the fraction of a lap travelled; `flow` is the camera's own
    // swing, which is motion through the same dimension and so turns the same
    // way.
    const turns = (w / Math.max(1, this.depth)) + flow * YAW_FLOW_TURNS;
    const a = turns * Math.PI * 2;
    if (this.tex) {
      this.tex.offset.set(Math.cos(a) * DRIFT_RADIUS, Math.sin(a) * DRIFT_RADIUS);
      // Rotating the sampling as well as translating it means a lap does not
      // merely retrace one band of the tile -- the pattern arrives back where
      // it started having genuinely been somewhere, rather than having slid
      // back and forth.
      this.tex.rotation = a * DRIFT_SPIN;
    }
  }

  setSides(n, w, flow = 0) {
    // The marbling follows w on every call, guard or not: a stale offset is
    // exactly how the surface came to ignore the camera.
    this.flowTo(w, flow);
    // Reshape only for a change worth seeing, measured in reciprocal sides --
    // see OUTLINE_STEP.
    if (this.shownSides !== null &&
        Math.abs(1 / this.shownSides - 1 / n) < OUTLINE_STEP) return;
    this.shownSides = n;

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

    this.reshapeTop(n, R);

    // The slab and its rim are remade: a few hundred triangles, and the rim's
    // edge set depends on which corners are sharp enough to draw. Only the
    // table's own parts go; things that ride along live in `attached`, which
    // is never cleared -- the orbs were once parented here and vanished on the
    // first change of shape.
    for (const o of [this.mesh, this.rim]) {
      if (!o) continue;
      this.group.remove(o);
      o.geometry.dispose();
    }

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

    this.mesh = new THREE.Mesh(geo, this.slabMaterial);
    this.group.add(this.mesh);

    // An edge, so the silhouette is legible: an unlit black slab on a black
    // ground would transform invisibly.
    this.rim = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), this.rimMaterial);
    this.group.add(this.rim);
  }

  // Follow the player along w -- both kinds of w.
  //
  // `shown` is the eased slice, so the table transforms continuously as the
  // ring turns rather than snapping. `yaw` is where the player has aimed the
  // view and `sway` is the rock on top of it, both converted to slices at the
  // ring's own exchange rate (see tableW). Without them the table is the one
  // thing on screen that ignores the camera, and reads as scenery pasted
  // behind the game.
  //
  // The OUTLINE follows the aim only: a table that morphed under the endless
  // little sway would reshape every frame for a change nobody asked to see.
  // The SURFACE follows both, and the sway at a much higher gain, because that
  // is the claim being made -- look at the stone from a slightly different
  // angle in the fourth dimension and you see a slightly different slice of
  // it. Sliding the pattern is free; reshaping the outline is not.
  update(shown, depth, yaw = 0, slots = depth, sway = 0) {
    // flowTo expresses w as a fraction of a lap, which is what makes the
    // marbling wrap when w does.
    this.depth = depth;
    const w = tableW(shown, yaw, slots);
    this.setSides(sidesAt(w, depth), w, (yaw + sway) * YAW_FLOW);
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

export { TABLE_STENCIL };
