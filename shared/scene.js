// Scene furniture shared by every game: the cube frames that stand for each
// w-slice, the blocker that marks a gap the player cannot step across, and the
// wall projections that make a shape inside a box legible without turning it.
//
// This is the visual half of the spatial vocabulary. The ring in ring.js
// decides WHERE each frame goes; this decides what a frame LOOKS like, and
// both games use the same answer so a player reads the second one the way they
// learned to read the first.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';

export const COLORS = {
  frameFocused: 0x6f86a8,
  frameDim: 0x3d4a5e,
  blocker: 0x11151c,
  blockerRim: 0x2c3646,
  bg: 0x0e1116,
};

// A cell centre sits on an integer, and the box's face is half a cell beyond
// the outermost one; the nudge pulls a quad just inside so it does not z-fight
// the frame's own edge lines. This is a nudge, not an inset -- half a cell
// would leave the marks visibly floating in the room.
export const WALL_NUDGE = 0.004;

// Standard lighting. Every game wants the same, so the scenes match.
export function addLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key1 = new THREE.DirectionalLight(0xffffff, 0.9);
  key1.position.set(1, 2, 1.5);
  scene.add(key1);
  const key2 = new THREE.DirectionalLight(0x88aaff, 0.35);
  key2.position.set(-1.5, -0.5, -1);
  scene.add(key2);
  return scene;
}

// The wireframe box for one w-slice, placed at `off`.
//
// `dims3` is the drawn extent in cells; the box is one cell larger than the
// span between the outermost cell centres, so the cells sit inside the room
// rather than half outside it.
export function sliceFrame(dims3, off, focused) {
  const [X, Y, Z] = dims3;
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(X, Y, Z));
  const box = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: focused ? COLORS.frameFocused : COLORS.frameDim,
    transparent: !focused,
    opacity: focused ? 1 : 0.6,
  }));
  const centre = [X / 2 - 0.5, Y / 2 - 0.5, Z / 2 - 0.5];
  box.position.set(centre[0] + off[0], centre[1] + off[1], centre[2] + off[2]);
  return box;
}

// The blocker: a solid cube standing in the ring's spare slot, saying plainly
// that the rope, the snake, or whatever else cannot step from the last frame to
// the first.
//
// A wrapping dimension has no such slot and gets no blocker -- the ring closes
// and the step really is available. That difference is the clearest statement
// of the rule either game makes, and it is made by the geometry rather than by
// a line of text.
export function blocker(dims3, off) {
  const [X, Y, Z] = dims3;
  const group = new THREE.Group();
  const centre = [X / 2 - 0.5, Y / 2 - 0.5, Z / 2 - 0.5];
  const pos = [centre[0] + off[0], centre[1] + off[1], centre[2] + off[2]];
  const solid = new THREE.Mesh(
    new THREE.BoxGeometry(X, Y, Z),
    new THREE.MeshLambertMaterial({ color: COLORS.blocker })
  );
  solid.position.set(...pos);
  group.add(solid);
  // An edge outline, so it reads as a wall rather than a hole in the scene.
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(X, Y, Z)),
    new THREE.LineBasicMaterial({ color: COLORS.blockerRim })
  );
  rim.position.set(...pos);
  group.add(rim);
  return group;
}

// ---------------------------------------------------------------------------
// Wall projections.
//
// Flattening the contents of a box onto the walls behind it reads as a plan and
// two elevations. It is what makes a position inside a box legible without
// turning the box: the three marks say where along each axis a thing sits, and
// a player learns to read depth off them rather than guessing from perspective.
//
// Not shadows -- no light, no shadow map. The lattice is axis aligned, so
// flattening one coordinate onto a wall is exact and costs nothing.
// ---------------------------------------------------------------------------

// Which walls of a frame the camera can see the inside of, as {axis, at} in
// world space.
//
// A wall faces the viewer from inside whenever the eye is on the interior side
// of it -- so the low wall on an axis shows while the eye is above its
// coordinate, and the high wall while the eye is below. The count changes as
// the camera rocks, which is the point: the projections stay on whatever the
// player can actually see into.
export function visibleWalls(eye, off, dims3) {
  const out = [];
  for (let d = 0; d < 3; d++) {
    const lo = off[d] - 0.5, hi = off[d] + dims3[d] - 0.5;
    if (eye[d] > lo) out.push({ axis: d, at: lo + WALL_NUDGE });
    if (eye[d] < hi) out.push({ axis: d, at: hi - WALL_NUDGE });
  }
  return out;
}

// A short string naming which walls are showing across every frame on screen.
// The rock moves the camera every frame but crosses a wall's plane only now and
// then, so this is what decides whether the projections need rebuilding.
//
// Every frame has to be included: they sit at different points around the ring,
// so the camera can be inside one frame's x range and outside another's.
export function wallSetKey(eye, offsets, dims3) {
  let k = '';
  for (const off of offsets) {
    for (let d = 0; d < 3; d++) {
      k += (eye[d] > off[d] - 0.5 ? '1' : '0');
      k += (eye[d] < off[d] + dims3[d] - 0.5 ? '1' : '0');
    }
  }
  return k;
}

// A rectangle on a wall, spanning from `p0` to `p1` and `h` wide either side.
// Both points are flattened onto the wall first, so the result is the shadow
// the segment between them would cast straight onto it.
//
// A segment perpendicular to the wall flattens to a point: there is nothing to
// draw, and the dot at each end covers that spot anyway.
export function wallBar(p0, p1, axis, at, h) {
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  const A = [p0[a], p0[b]], B = [p1[a], p1[b]];
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [];
  dx /= len; dy /= len;
  const nx = -dy * h, ny = dx * h;
  const corner = (P, sx, sy) => {
    const v = [0, 0, 0];
    v[axis] = at;
    v[a] = P[0] + sx;
    v[b] = P[1] + sy;
    return v;
  };
  const c0 = corner(A, nx, ny), c1 = corner(A, -nx, -ny);
  const c2 = corner(B, -nx, -ny), c3 = corner(B, nx, ny);
  return [c0, c1, c2, c0, c2, c3];   // 6 points = 2 triangles
}

// A small square on a wall, to mark a point or round off a joint.
export function wallDot(p, axis, at, h) {
  const q = [];
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  for (const [da, db] of [[-h, -h], [h, -h], [h, h], [-h, -h], [h, h], [-h, h]]) {
    const v = [0, 0, 0];
    v[axis] = at;
    v[a] = p[a] + da;
    v[b] = p[b] + db;
    q.push(v);
  }
  return q;   // 6 points = 2 triangles
}

// A rounded rectangle on a wall: the flat counterpart of roundedBox, so a
// rounded solid casts a mark of the same shape rather than a hard-cornered one.
//
// `lo` and `hi` are the rectangle's corners in the wall's own two axes, and `r`
// is the corner radius. Built as a triangle fan around the centre, walking the
// outline: the straight runs are two points each and every corner is an arc.
export function wallRoundedRect(lo, hi, axis, at, r, seg = 5) {
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  const w = hi[0] - lo[0], h = hi[1] - lo[1];
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
  // The centres of the four corner arcs.
  const corners = [
    [hi[0] - rad, hi[1] - rad, 0],
    [lo[0] + rad, hi[1] - rad, Math.PI / 2],
    [lo[0] + rad, lo[1] + rad, Math.PI],
    [hi[0] - rad, lo[1] + rad, Math.PI * 1.5],
  ];
  const outline = [];
  for (const [ox, oy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const t = a0 + (i / seg) * (Math.PI / 2);
      outline.push([ox + Math.cos(t) * rad, oy + Math.sin(t) * rad]);
    }
  }
  const pt = (x, y) => {
    const v = [0, 0, 0];
    v[axis] = at;
    v[a] = x;
    v[b] = y;
    return v;
  };
  const out = [];
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % outline.length];
    out.push(pt(cx, cy), pt(p[0], p[1]), pt(q[0], q[1]));
  }
  return out;
}

// A material for a projection layer.
//
// The stencil buffer is what stops a layer compounding with itself. A
// translucent ribbon that overlaps its own geometry blends TWICE over the same
// pixel, so every joint comes out brighter than the straight runs. So each
// pixel is claimed the first time the layer covers it: write `ref` into the
// stencil, and only accept fragments where the stencil does not already hold
// it. Layers with different refs paint over each other in render order, which
// is how a marker covers the ribbon underneath rather than blending into it.
export function projectionMaterial({ color, opacity = 0.1, ref = 1,
                                     vertexColors = false }) {
  return new THREE.MeshBasicMaterial({
    ...(vertexColors ? { vertexColors: true } : { color }),
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: ref,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
}

// Swap a mesh's geometry for one built from a flat position array, disposing
// the old. Projections are rebuilt often, so the old geometry is released
// rather than left for the GPU to hold on to.
export function setGeometry(mesh, positions, colors = null) {
  mesh.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  mesh.geometry = g;
}

// ---------------------------------------------------------------------------
// A rounded box.
//
// three.js has no rounded-box primitive, so this builds one: a box whose twelve
// edges and eight corners are filleted by `r`. It is made by sweeping a sphere
// of radius r over the inner box -- which is exactly what a rounded box IS --
// and the cheap way to get that is to take a sphere's own vertices and push
// each one out to the nearest point of the inner box's surface.
//
// Starting from a sphere rather than a box is what makes the corners come out
// right: every vertex already lies on a smooth surface, so the fillets are
// continuous and the normals are correct without any welding.
//
// `size` is the FULL extent of the finished shape, so a rounded 1x1x1 fits the
// same cell an ordinary 1x1x1 box would.
export function roundedBox(size, r, segments = 16) {
  const [W, H, D] = size;
  // The inner box the sphere is swept over. Never negative: a radius larger
  // than half the smallest side collapses that axis to a line, which is what a
  // capsule is, and is the right answer rather than an error.
  const half = [
    Math.max(0, W / 2 - r),
    Math.max(0, H / 2 - r),
    Math.max(0, D / 2 - r),
  ];
  const geo = new THREE.SphereGeometry(r, segments * 2, segments);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    // The nearest point of the inner box, in the direction this vertex faces.
    // Clamping the direction to the box's half-extents picks the face, edge or
    // corner the vertex belongs to, and offsetting by r * n rounds it.
    pos.setXYZ(i,
      Math.max(-half[0], Math.min(half[0], nx * W)) + nx * r,
      Math.max(-half[1], Math.min(half[1], ny * H)) + ny * r,
      Math.max(-half[2], Math.min(half[2], nz * D)) + nz * r);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// The cursor blink.
//
// Slow and shallow: it should catch the eye when you are hunting for the head
// without pulling at it while you are looking somewhere else. A hard switch
// rather than a fade -- a caret blinks, it does not breathe -- and slightly
// longer lit than dim, so the mark is easier to find than to lose.
// ---------------------------------------------------------------------------
export const BLINK_PERIOD = 800;   // ms for a full cycle
export const BLINK_DUTY = 0.58;    // fraction of the cycle spent at full strength

export const blinkPhase = (ms) =>
  ((ms % BLINK_PERIOD) / BLINK_PERIOD) < BLINK_DUTY ? 0 : 1;
