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
import { TABLE_STENCIL } from './table.js';

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

// A filled disc with a hint of falloff at the very edge -- the reflection of a
// ball read at a glance. Crisp rather than hazy: the aura is the glow AROUND a
// light, and the stone gives back the light itself.
function discTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Scratch vectors. update() runs every frame for every orb, and allocating in
// that loop is the kind of garbage that shows up as stutter.
const MIRROR = new THREE.Vector3();
const CAMV = new THREE.Vector3();
const WORLD = new THREE.Vector3();
const OFFSET = new THREE.Vector3();
const ORBW = new THREE.Vector3();
const THIS_OFFSET = new THREE.Vector3();

let shared = null;
function assets() {
  if (!shared) {
    shared = {
      ball: new THREE.SphereGeometry(1, 20, 14),
      aura: auraTexture(),
      ball2d: discTexture(),
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
  constructor({ count = 30, depth = 6, radius = 20, y = 0, eye = 0,
                rng = Math.random, color = 0xffd97a } = {}) {
    this.depth = depth;
    this.y = y;
    this.radius = radius;
    // Everything below the table's surface, so a reflection is only ever drawn
    // where there is table to catch it. A reflection is geometrically BELOW the
    // mirror, so this is the half-space the echoes live in; anything of them
    // that would rise above the stone is cut away.
    // Where this group sits in the world, so a world-space eye can be brought
    // into the orbs' own coordinates. Set by whoever parents the group.
    this.offset = [0, 0, 0];
    this.color = color;
    this.group = new THREE.Group();
    this.items = [];

    const { ball, aura, ball2d } = assets();
    for (let i = 0; i < count; i++) {
      // Spread evenly over the hemisphere above the table -- and, since these
      // are hyperspheres, over the 4D equivalent.
      //
      // A direction is drawn from the 3-sphere by normalising four Gaussians,
      // which is the standard trick and the only one that is genuinely uniform:
      // picking each angle independently crowds the poles. Three of those
      // components give the direction in the space we can see, and the fourth
      // becomes the orb's position along w, so the same draw places it in all
      // four dimensions at once.
      //
      // The vertical component is folded upward, which puts the orb in the
      // upper half-space. That biases toward the horizon rather than the zenith
      // -- there is more solid angle near the horizon -- which is where they
      // want to be anyway.
      const g = () => {
        // Box-Muller, from the seeded source, so a board's sky is reproducible.
        const u = Math.max(rng(), 1e-9), v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };
      let dx = g(), dy = g(), dz = g(), dw = g();
      const dl = Math.hypot(dx, dy, dz, dw) || 1;
      dx /= dl; dy /= dl; dz /= dl; dw /= dl;
      // Above the table, never below it.
      dy = Math.abs(dy);

      // How far out along that direction. Cubed toward the far end so they sit
      // at obviously different depths rather than on one shell.
      const rad = radius * (NEAR + (FAR - NEAR) * Math.pow(rng(), 0.65));
      // The horizontal part of the direction, renormalised, so `rad` means
      // distance across the table rather than distance along the ray.
      const flat = Math.hypot(dx, dz) || 1;
      const item = {
        x: (dx / flat) * rad,
        z: (dz / flat) * rad,
        // Height from the same draw: the vertical component of the direction,
        // scaled so an orb overhead is high and one near the horizon is low.
        h: y + RISE_LO + (RISE_HI - RISE_LO) * dy,
        phase: rng() * Math.PI * 2,
        bob: rad * 0.002 * (1 + rng()),
        dist: rad,
        // Its own extent in w, and where its centre sits along the loop.
        //
        // The ANGLE of the fourth component, not the component itself. w wraps,
        // so its slices form a circle and the orbs should be spread evenly
        // round it; the raw component is a projected coordinate and piles them
        // up in the middle -- measured, 21 per cent of orbs in each middle
        // slice against 11 at the ends. Taking the angle against a third axis
        // undoes the projection and comes out flat.
        R: 1.3 + rng() * 1.9,
        cw: ((Math.atan2(dw, dz) / (Math.PI * 2)) + 0.5) * depth,
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

      // The reflection: a flat disc lying on the table, placed where the eye
      // actually sees this orb in the surface. Crisp-edged rather than hazy --
      // polished stone gives back an image, not a glow.
      // A sprite, so it is always a circle facing the screen however the
      // camera moves -- the reflection of a ball is a ball.
      const echo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ball2d,
        color,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        // Only where the table stamped the stencil. This is the clip.
        stencilWrite: true,
        stencilRef: TABLE_STENCIL,
        stencilFunc: THREE.EqualStencilFunc,
        stencilZPass: THREE.KeepStencilOp,
      }));
      // Between the table (-1) and the play area (0 and up): the reflection is
      // in the stone, so it goes over the stone and under everything standing
      // on it.
      echo.renderOrder = -0.5;

      item.core = core;
      item.haze = haze;
      item.echo = echo;
      for (const o of [core, haze, echo]) this.group.add(o);
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
  update(w, t = 0, cam = null) {
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
      for (const o of [it.core, it.haze, it.echo]) o.visible = on;
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

      if (cam) this.reflect(it, full, cam);
      else it.echo.visible = false;
    }
  }

  // The orb's reflection in the table, as a screen-space step.
  //
  // An orb always draws as a CIRCLE on screen. So its reflection is the same
  // circle, dimmer, mirrored down the screen about where the table's surface
  // is, and showing only where there is table under it. That is the whole idea,
  // and doing it in screen space is what makes it work.
  //
  // The world-space versions all failed, each for its own reason, and the
  // reasons are worth keeping: a mirrored SOLID sits below an opaque table and
  // is hidden by it; a true reflection point for a distant light falls off the
  // table's edge entirely; and mirroring the orb's world position through the
  // plane puts it BEHIND the camera when the camera is above the table looking
  // down -- measured at -34 along the view direction, which no projection can
  // rescue. None of those are problems for a circle drawn on the screen.
  //
  // The mirror line is the table's own centre, projected. Reflecting a point
  // about it in screen y is what a still pool does to the things standing
  // around it.
  reflect(it, full, cam) {
    // The orb, and the table's middle, in screen coordinates.
    ORBW.set(it.core.position.x + this.offset[0], it.core.position.y,
             it.core.position.z + this.offset[2]);
    CAMV.copy(ORBW).project(cam);
    if (CAMV.z > 1) { it.echo.visible = false; return; }
    // The mirror line is the table directly BELOW this orb, not the table's
    // middle: a reflection appears under the thing it reflects, so each orb has
    // its own line. Using one line for all of them sends the far ones wildly
    // off, because the further an orb is the higher its foot sits on screen.
    MIRROR.set(it.core.position.x + this.offset[0], this.y,
               it.core.position.z + this.offset[2]);
    OFFSET.copy(MIRROR).project(cam);

    // Mirrored down the screen about the table's surface, then placed back in
    // the world at the table's own depth so it sits in the scene rather than
    // hovering at some arbitrary distance.
    // Below the foot by however far the orb is above it. Written as a
    // subtraction from the foot rather than as a reflection of the orb, because
    // the two differ when the orb projects BELOW its own foot on screen -- which
    // happens at these distances -- and a plain mirror then throws the
    // reflection upward into the sky.
    const rise = Math.abs(CAMV.y - OFFSET.y);
    WORLD.set(CAMV.x, OFFSET.y - rise, OFFSET.z).unproject(cam);
    it.echo.position.copy(WORLD).sub(THIS_OFFSET.set(...this.offset));

    // Matched to the orb's own size on screen. A sprite shrinks with distance,
    // so the scale is the orb's scaled by how much nearer the reflection is.
    const dOrb = cam.position.distanceTo(ORBW);
    const dEcho = cam.position.distanceTo(WORLD);
    it.echo.scale.setScalar(it.core.scale.x * 2 * (dEcho / Math.max(dOrb, 1e-3)));
    it.echo.material.opacity = it.core.material.opacity * ECHO;
    it.echo.visible = it.echo.material.opacity > 0.004;
  }
}

// How far out the orbs stand, as multiples of the table's own radius.
//
// Bounded at BOTH ends, and both bounds are measured rather than chosen.
//
// Below: they must never come between the camera and the table. The orbit
// zooms out to three times its resting radius, which is about 4.8 table radii,
// so anything nearer than that ends up in front of the board at full zoom.
//
// Above: they float ABOVE the table, and a camera that looks DOWN sees a band
// from LOOK_DOWN - fov/2 to LOOK_DOWN + fov/2 below horizontal. An object above
// the table's plane leaves the top of that band at about
// (eyeHeight - orbHeight) / tan(shallow edge). At the zoomed-out eye height
// that is ten or eleven radii for a low orb -- so the window is real but not
// wide, and it moves if the camera angle changes.
//
// The exponent biases the draw outward, so they sit at obviously different
// depths rather than on one shell.
const NEAR = 6.0;
const FAR = 10.0;

// How high they float above the table, in world units. Enough to read as
// hanging over it rather than resting on it, and little enough that the view
// still reaches them at the distances above.
// Low, so both the orb and its reflection land on screen. An orb high above
// the plane projects near or past the top of the view at these distances, and
// its reflection then mirrors even further off -- measured, orbs sat at screen
// y of 1.1 to 3.2 where the screen ends at 1. Sitting them just above the
// stone keeps the pair together in frame, which is the arrangement worth
// looking at anyway.
const RISE_LO = 0.6;
const RISE_HI = 3.2;

// Drawn size per unit of slice radius, per unit of distance.
//
// Multiplied by distance so an orb twice as far away is drawn twice as big and
// subtends the same angle -- without that the far ones are invisible specks and
// only the near ones read at all, which defeats the point of a range of depths.
//
// Kept apart from R, which sets how much of the w LOOP an orb is present for.
// Shrinking R to make them smaller also makes them rare, which is not the same
// wish -- that mistake left one orb on screen out of ten.
const SIZE = 0.019;

// How much of an orb the table gives back. Low: dark stone is a poor mirror,
// and a bright pool would read as a lamp under the table rather than as a sheen
// on it.
const ECHO = 0.55;

// Kept for the aura's reach; the reflection itself does not fade with distance,
// because a real one does not.
const FADE_BY = 11.0;


export { ECHO };
export { sliceRadius } from './orbshape.js';
