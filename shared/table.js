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
import { marbleTiled } from './noise.js';
import { LO, HI, MARBLE_RINGS, MARBLE_TEXELS, UV_SCALE, VEINS, WARP,
  YAW_FLOW, YAW_FLOW_TURNS, DRIFT_RADIUS, DRIFT_SPIN } from './tableconst.js';

// Linear to sRGB, the standard transfer function.
const srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

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
    this.tex = null;
    this.depth = 1;
    this.shownSides = null;
    // The sample position the marbling was last painted at -- the w drift and
    // the camera's swing together, since either moving is a reason to repaint.
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
    const pos = [], idx = [], uv = [];
    // Enough segments that the gap between neighbours around the rim is about
    // the same as the gap between rings. A fixed count over-tessellates the
    // middle and leaves the rim coarse -- measured, the worst edge on a
    // 128-segment grid was 2.2 units long, and a colour step spread over an
    // edge that size is exactly the blockiness the ring count was raised to
    // avoid.
    const S = Math.max(96, Math.ceil((2 * Math.PI * rings) / 2 / 4) * 4);
    for (let i = 0; i <= rings; i++) {
      const f = Math.sqrt(i / rings);
      for (let j = 0; j < S; j++) {
        const th = (j / S) * Math.PI * 2;
        const r = ngonRadius(th, n) * R * f;
        const px = Math.cos(th) * r, pz = Math.sin(th) * r;
        pos.push(px, 0, pz);
        // Planar UVs in table-radius units, so the veins keep one size on
        // screen whatever the table's dimensions and whatever shape it is.
        uv.push(px * UV_SCALE / this.radius, pz * UV_SCALE / this.radius);
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
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Bake the marbling into a texture, once.
  //
  // The surface used to be painted per vertex, and that is where this went
  // wrong: a noise lookup is ~4us, so repainting 20k vertices cost 85ms of
  // arithmetic against 2ms of upload -- measured -- and it happened on every
  // frame of a slide. No mesh resolution makes that affordable, because the
  // cost is per sample rather than per triangle.
  //
  // What makes a texture the right answer is not caching in general, it is what
  // the drift actually does. Moving through w TRANSLATES the pattern along the
  // field's other axes; it does not deform it. A translation is a UV offset, so
  // the same image serves every slice and the flow costs nothing per frame.
  // The field is tiled, so the offset can run forever without a seam.
  bakeTexture() {
    const N = MARBLE_TEXELS;
    const data = new Uint8Array(N * N * 4);
    // Sampled on a torus so the image tiles: a point's coordinates are taken
    // round a circle, which makes opposite edges genuinely continuous rather
    // than merely similar. Without this the offset would step across a visible
    // seam every time it wrapped.
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
    this.paintedAt = turns;
  }

  setSides(n, w, flow = 0) {
    // A hundredth of a side is far below anything visible, and rebuilding on
    // every frame of a slide would be wasteful.
    //
    // The marbling still has to follow w even when the shape has not moved
    // enough to rebuild -- the two change at different rates, and a table whose
    // veins only flowed when its outline changed would stutter. So a small move
    // repaints the existing surface and returns; only a real shape change
    // rebuilds the geometry.
    // The marbling follows w on every call, guard or not: sliding it is two
    // number assignments now, so there is nothing to be saved by skipping it
    // and a stale offset is exactly how the surface came to ignore the camera.
    this.flowTo(w, flow);
    if (this.shownSides !== null && Math.abs(this.shownSides - n) < 0.01) return;
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
    // Baked once and reused: the pattern never changes, only where it is
    // sampled from, and that is an offset on the texture rather than new data.
    if (!this.tex) this.tex = this.bakeTexture();
    const top = new THREE.Mesh(
      this.topGeometry(n, R, MARBLE_RINGS),
      new THREE.MeshLambertMaterial({ map: this.tex })
    );
    top.position.y = this.y + 0.01;
    this.flowTo(w, flow);
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
  // `yaw` is where the player has aimed the view; `sway` is the rock on top of
  // it. They are taken apart because the outline and the surface want different
  // things from the camera.
  //
  // The OUTLINE follows the aim only. Turning the view a frame's width cuts the
  // same shape as stepping a frame, which is the point of the lock -- but a
  // table that also morphed under the endless little sway would rebuild its
  // geometry every frame for a change nobody asked to see.
  //
  // The SURFACE follows both, and the sway at a much higher gain, because that
  // is the thing being claimed: look at the stone from a slightly different
  // angle in the fourth dimension and you are seeing a slightly different slice
  // of it. Sliding the pattern is free; remaking the outline is not.
  update(shown, depth, yaw = 0, slots = depth, sway = 0) {
    // Kept so flowTo can express w as a fraction of a lap, which is what makes
    // the marbling wrap when w does.
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
