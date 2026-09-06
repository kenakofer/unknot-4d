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
import { sidesAt, ngonRadius } from './tableshape.js';

export class Table {
  // `radius` is how far the slab reaches; make it large enough to read as a
  // surface the whole ring rests on rather than a plate under one frame.
  // `y` is the height of its top surface.
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
    this.shownSides = null;
  }

  // Build or rebuild the slab for a given number of sides.
  //
  // The geometry is regenerated rather than morphed because the shape changes
  // only while the player is moving between slices, and a fresh lathe of a few
  // hundred triangles costs less than the machinery to animate one.
  setSides(n) {
    // A hundredth of a side is far below anything visible, and rebuilding on
    // every frame of a slide would be wasteful.
    if (this.shownSides !== null && Math.abs(this.shownSides - n) < 0.01) return;
    this.shownSides = n;

    for (const o of [...this.group.children]) {
      this.group.remove(o);
      if (o.geometry) o.geometry.dispose();
    }

    const shape = new THREE.Shape();
    for (let i = 0; i <= this.segments; i++) {
      const th = (i / this.segments) * Math.PI * 2;
      const r = ngonRadius(th, n) * this.radius;
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

  // Follow the player's position along w. `shown` is the eased focus, so the
  // table transforms continuously as the ring turns rather than snapping when
  // the slice changes.
  update(shown, depth) {
    this.setSides(sidesAt(shown, depth));
  }
}

// Re-exported so a caller that has the table already does not need to know the
// maths lives elsewhere. The suite imports from tableshape.js directly, which is
// the point of the split.
export { sidesAt, ngonRadius, SHAPE_LOOP } from './tableshape.js';
