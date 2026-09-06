// Hyperspheres floating over the table.
//
// A 4D ball sliced at a fixed w is a 3D ball, and the radius of that slice
// follows the circle: r(w) = sqrt(R^2 - (w - c)^2). So an orb swells as the
// player walks toward its centre in w, shrinks as they walk past, and vanishes
// entirely once they are further than R away -- not fading out, but reaching
// zero size, which is what a sphere leaving a hyperplane actually does.
//
// That last part is the reason these are here. The table shows a 4D solid being
// cut, but it is a big slow object and its shape changes gradually. The orbs
// are the same fact stated briskly and in the small: things appear from
// nowhere, grow, shrink and wink out as you move along a direction you cannot
// point at. The size IS the fourth coordinate, made legible.
//
// Each orb carries a hazy aura, and a reflection in the table beneath it. The
// reflection is not a render pass -- see mirror() -- because the table is a
// known flat plane and a mirrored copy costs one more draw.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { sliceRadius } from './orbshape.js';

// A soft radial dot, drawn once and shared by every aura.
//
// A texture rather than geometry: an aura is a blurry blob with no shape of its
// own, and asking the GPU to shade a few hundred triangles to produce something
// deliberately formless is work for nothing.
function auraTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Falls off faster than linear, so the aura reads as a haze around a bright
  // core rather than as a disc with a soft edge.
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.42)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let shared = null;
function assets() {
  if (!shared) {
    shared = {
      ball: new THREE.SphereGeometry(1, 20, 14),
      aura: auraTexture(),
    };
  }
  return shared;
}

export class Orbs {
  // `count` orbs are scattered around the ring at a radius comparable to it, so
  // they read as lights standing about the table rather than as decoration
  // stuck to one frame.
  // `eye` is roughly how high the camera rides above the table. The orbs are
  // hung relative to it rather than to the table, because a view that looks
  // down puts the horizon above the frame -- see the note on `h`.
  constructor({ count = 10, depth = 6, radius = 20, y = 0, eye = 0,
                rng = Math.random, color = 0xffd97a } = {}) {
    this.depth = depth;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.group = new THREE.Group();
    this.items = [];

    const { ball, aura } = assets();
    for (let i = 0; i < count; i++) {
      // Spread around the circle with a little jitter, so they are neither in a
      // neat ring nor clumped.
      const th = ((i + 0.5) / count) * Math.PI * 2 + (rng() - 0.5) * 0.7;
      // Far off, and at a wide spread of distances -- the near ones sit above
      // the table's own horizon while the far ones are most of a kilometre out.
      // Cubed so the draw favours the far end: distance is what makes them read
      // as things in a landscape rather than lamps around the table, and an
      // even spread would put half of them close.
      const rad = radius * (NEAR + (FAR - NEAR) * Math.pow(rng(), 1.7));
      const item = {
        // Where it sits in the three drawn dimensions.
        x: Math.cos(th) * rad,
        z: Math.sin(th) * rad,
        // Held as a small ANGLE above the table's plane rather than a fraction
        // of the distance. Proportional height sounds right and is not: at four
        // hundred units out it put orbs ninety units into the air, far outside
        // a 45-degree view looking slightly down. A few degrees of elevation
        // keeps them near the horizon, where scenery belongs, at every
        // distance.
        // ABOVE the table's plane -- these float over it, and an orb hanging
        // under the surface it lights reads as a hole rather than a lamp.
        //
        // The height still has to land in the camera's view, which is the part
        // that is easy to get wrong: the camera stands above the table looking
        // DOWN, so the horizon sits off the top of the screen and a distant
        // object at table height projects above the frame. Hanging them below
        // the eye solved that and broke the geometry instead, putting every orb
        // under the table.
        //
        // Both wants are satisfiable at once because the view is a BAND: it
        // spans from LOOK_DOWN - fov/2 to LOOK_DOWN + fov/2 below horizontal,
        // and only the near edge of that band is above the table's plane. So
        // the orbs sit a little above the plane and are drawn no further out
        // than the distance at which that height is still inside the band. See
        // reachFor().
        h: y + RISE_LO + rng() * (RISE_HI - RISE_LO),
        phase: rng() * Math.PI * 2,
        // The bob scales too, or it is invisible at these distances.
        bob: rad * 0.002 * (1 + rng()),
        // How far away it is, so its drawn size can hold steady on screen.
        dist: rad,
        // Its own extent in w, and where its centre sits along it. A range of
        // sizes means some are briefly enormous while others merely pass by.
        // How much of the w loop it is present for. Generous, so at any slice
        // several are around -- an orb is only visible while the slice is
        // within R of its centre.
        R: 1.3 + rng() * 1.9,
        cw: rng() * depth,
      };

      const core = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        // Never writes depth: it is a light, and the aura around it has to
        // survive being drawn over the same pixels.
        depthWrite: false,
        // Additive, like the haze. A translucent ball over a dark background
        // is DARKENED by its own opacity -- it came out a muddy brown rather
        // than a light. Adding to what is behind it is what makes something
        // read as glowing rather than as a coloured film.
        blending: THREE.AdditiveBlending,
      }));

      const haze = new THREE.Sprite(new THREE.SpriteMaterial({
        map: aura,
        color,
        transparent: true,
        depthWrite: false,
        // Additive, so overlapping haze accumulates into something brighter
        // rather than compositing into a flat wash.
        blending: THREE.AdditiveBlending,
      }));

      // The pool of light this orb lays on the table. A plane rather than a
      // sprite: a sprite always faces the camera, and this has to lie flat.
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: aura, color, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
      pool.rotation.x = -Math.PI / 2;

      item.core = core;
      item.haze = haze;
      item.pool = pool;
      for (const o of [core, haze, pool]) this.group.add(o);
      this.items.push(item);
    }
  }

  // Place and size every orb for the current slice.
  //
  // `w` is BACKGROUND w -- the camera's lateral angle converted to slices, the
  // same number the table's outline is cut at -- and not the gameplay w the
  // player walks along.
  //
  // That is the rule for every 4D prop in the scene, and it is the whole point
  // of the effect: the play area's w is a lattice coordinate, which room the
  // player is in, while a prop's w is a continuous parameter of a 4D solid.
  // They only ever have to agree about where the ring's frames sit. Tying
  // scenery to the gameplay w makes it change when the player MOVES; tying it
  // to the camera makes it change when the player LOOKS, which is the reading
  // that matches what a slice through a 4D object is.
  update(w, t = 0) {
    for (const it of this.items) {
      // The slice radius says how far through the ball we are cutting; SIZE
      // turns that into how big the thing is drawn. They are separate: R has to
      // stay large or the orb is hardly ever in view at all, while the drawn
      // size wants to stay modest so these read as lights standing about the
      // room rather than as the subject of the picture.
      // Scaled by its distance, so an orb ten times further away is drawn ten
      // times bigger and subtends the same angle. Without this the far ones are
      // invisible specks and only the near ones read at all -- which defeats
      // the point of putting them at a range of distances.
      const r = sliceRadius(it.R, it.cw, w, this.depth) * SIZE * it.dist;
      const on = r > 0.001;
      for (const o of [it.core, it.haze, it.pool]) o.visible = on;
      if (!on) continue;

      const y = it.h + Math.sin(t * 0.00045 + it.phase) * it.bob;
      it.core.position.set(it.x, y, it.z);
      it.core.scale.setScalar(r);
      // Brightest at its fullest: an orb caught near its own edge is a sliver
      // of a thing, and reads better dim than as a tiny hard dot.
      const full = r / (it.R * SIZE * it.dist);
      it.core.material.opacity = 0.30 + 0.55 * full;

      // The haze is larger than the core by a fixed ratio, so it grows with it
      // and an orb never ends up as a bare ball or a cloud with nothing in it.
      it.haze.position.copy(it.core.position);
      it.haze.scale.setScalar(r * 8.0);
      it.haze.material.opacity = 0.16 + 0.26 * full;

      this.glint(it, full);
    }
  }

  // The light an orb casts on the table.
  //
  // NOT a mirror image. A mirrored copy is the correct reflection for a lamp
  // standing on the surface, and these do not: at seventy table-radii out the
  // reflected ray misses the table entirely, so the mirrored objects ended up
  // floating in space beside and beneath it -- reflecting everywhere except on
  // the thing they were supposed to be reflecting in.
  //
  // What a distant light actually puts on a dark surface is a soft pool, out
  // along the direction it lies in, fading with distance. So that is what this
  // draws: a flat sprite lying on the table, always within its edge, placed
  // between the table's middle and the orb rather than under the orb. It is one
  // more draw, like the mirror was, and unlike the mirror it is always where it
  // should be.
  glint(it, full) {
    // How far out the pool sits, capped so it stays on the table however far
    // away the orb is. A distant light pools near the rim, not past it.
    const reach = Math.min(it.dist * 0.42, this.radius * 0.82);
    const len = Math.hypot(it.x, it.z) || 1;
    it.pool.position.set((it.x / len) * reach, POOL_LIFT, (it.z / len) * reach);

    // Larger and fainter the further the light is, like any pool of light.
    const near = Math.max(0, 1 - it.dist / (this.radius * FADE_BY));
    it.pool.scale.set(this.radius * (0.30 + 0.5 * near),
                      this.radius * (0.30 + 0.5 * near), 1);
    it.pool.material.opacity = ECHO * full * (0.25 + 0.75 * near);
    it.pool.visible = it.pool.material.opacity > 0.004;
  }
}

// How far out the orbs stand, as multiples of the table's own radius.
//
// Bounded above by geometry rather than by taste. The orbs float ABOVE the
// table, and the camera looks DOWN at 35 degrees with a 45-degree fov, so the
// view reaches from 12.5 to 57.5 degrees below horizontal. An object above the
// table's plane leaves the top of that band at a distance of about
// (eyeHeight - orbHeight) / tan(12.5 deg) -- which, measured, is four or five
// table radii, not the thirty-odd tried first. Beyond that the only way to keep
// an orb on screen is to sink it below the table, which is where they all ended
// up.
//
// The exponent biases the draw outward, so they sit at obviously different
// depths rather than on one shell.
const NEAR = 1.9;
const FAR = 4.4;

// How high they float above the table, in world units. Enough to read as
// hanging over it rather than resting on it, and little enough that the view
// still reaches them at the distances above.
const RISE_LO = 1.2;
const RISE_HI = 7.0;

// Drawn size per unit of slice radius, per unit of distance.
//
// Multiplied by distance so an orb twice as far away is drawn twice as big and
// subtends the same angle -- without that the far ones are invisible specks and
// only the near ones read at all, which defeats the point of a range of depths.
//
// Kept apart from R, which sets how much of the w LOOP an orb is present for.
// Shrinking R to make them smaller also makes them rare, which is not the same
// wish -- that mistake left one orb on screen out of ten.
const SIZE = 0.020;

// How much of an orb the table gives back. Low: dark stone is a poor mirror,
// and a bright pool would read as a lamp under the table rather than as a sheen
// on it.
const ECHO = 0.30;

// How far above the table's surface the pool is drawn. Just enough to win the
// depth test against the marbling without floating above it.
const POOL_LIFT = 0.02;

// The distance, in table radii, at which a light stops laying anything the eye
// can see on the table. Beyond it the pool is still drawn but has faded out.
const FADE_BY = 5.0;

export { ECHO };
export { sliceRadius } from './orbshape.js';
