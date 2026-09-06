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
// reflection is not a render pass -- see reflect() -- because an orb is a
// circle on screen and its reflection is the same circle, lower down and
// dimmer, which costs one more sprite.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { sliceRadius } from './orbshape.js';
import { TABLE_STENCIL } from './table.js';

// A soft radial dot, drawn once and shared by every aura. A texture rather
// than geometry: an aura is deliberately formless, and shading triangles to
// produce it would be work for nothing.
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

// Scratch vectors, so the per-frame loop allocates nothing.
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
  // `count` orbs are scattered over a dome above the table, at radii that are
  // multiples of `radius` -- the TABLE's, since that is what sets how far out
  // they must stand to keep clear of the camera. `y` is the table's top, which
  // is the plane the reflections are mirrored about.
  constructor({ count = 30, depth = 6, radius = 20, y = 0,
                rng = Math.random, color = 0xffd97a } = {}) {
    this.depth = depth;
    this.y = y;
    this.radius = radius;
    // Where this group sits in the world, so a world-space eye can be brought
    // into the orbs' own coordinates. Set by whoever parents the group.
    this.offset = [0, 0, 0];
    this.color = color;
    this.group = new THREE.Group();
    this.items = [];

    const { ball, aura, ball2d } = assets();
    for (let i = 0; i < count; i++) {
      // A uniform direction on the 3-sphere, by normalising four Gaussians --
      // picking angles independently would crowd the poles. Three components
      // are the direction in the space we can see; the fourth becomes the
      // orb's place along w. The vertical component is folded upward, which
      // puts the orb above the table and, since there is more solid angle near
      // the horizon than the zenith, mostly near the horizon.
      const g = () => {
        // Box-Muller, from the seeded source, so a board's sky is reproducible.
        const u = Math.max(rng(), 1e-9), v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };
      let dx = g(), dy = g(), dz = g(), dw = g();
      const dl = Math.hypot(dx, dy, dz, dw) || 1;
      dx /= dl; dy /= dl; dz /= dl; dw /= dl;
      dy = Math.abs(dy);

      // How far out along that direction. NEAR bounds the radius, but on a
      // dome that is not enough: an orb halfway up comes much closer to a
      // zoomed-out, risen camera than one on the horizon does -- measured,
      // twelve units against thirty-one for the same radius. So the orb is
      // walked outward until it clears the eye's actual reach.
      let rad = radius * (NEAR + (FAR - NEAR) * Math.pow(rng(), 0.65));
      for (let tries = 0; tries < 24; tries++) {
        if (this.clearsCamera(dx, dy, dz, rad, radius)) break;
        rad *= 1.12;
      }

      // Straight onto the sphere, vertical component included. Renormalising
      // the horizontal part instead gave every orb the same distance across
      // the table and flattened the dome into a ring, which is what it looked
      // like.
      const item = {
        x: dx * rad,
        z: dz * rad,
        // The dome is squashed so its top sits where the camera can see it --
        // see DOME_SQUASH. The spread over the hemisphere is otherwise as
        // drawn.
        h: y + dy * rad * DOME_SQUASH,
        phase: rng() * Math.PI * 2,
        bob: rad * 0.002 * (1 + rng()),
        // Distance from the table's middle, which keeps apparent size steady.
        dist: rad,
        // Its extent in w, and where its centre sits along the loop.
        //
        // The ANGLE of the fourth component, not the component itself: w
        // wraps, so its slices form a circle and the orbs should be spread
        // evenly round it. The raw component is a projected coordinate and
        // piles them up in the middle -- measured, 21 per cent of orbs in each
        // middle slice against 11 at the ends.
        R: 1.3 + rng() * 1.9,
        cw: ((Math.atan2(dw, dz) / (Math.PI * 2)) + 0.5) * depth,
      };

      // Additive and never writing depth, like everything here: a translucent
      // ball over a dark background is darkened by its own opacity and came
      // out a muddy brown. Adding to what is behind is what reads as glowing.
      const core = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));

      const haze = new THREE.Sprite(new THREE.SpriteMaterial({
        map: aura,
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));

      // The reflection: a crisp disc, since polished stone gives back an image
      // rather than a glow. A sprite, so it is a circle facing the screen
      // however the camera moves -- the reflection of a ball is a ball.
      const echo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ball2d,
        color,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        // Only where the table stamped the stencil.
        stencilWrite: true,
        stencilRef: TABLE_STENCIL,
        stencilFunc: THREE.EqualStencilFunc,
        stencilZPass: THREE.KeepStencilOp,
      }));
      // Between the table (-1) and the play area (0 and up): in the stone,
      // under everything standing on it.
      echo.renderOrder = -0.5;

      item.core = core;
      item.haze = haze;
      item.echo = echo;
      for (const o of [core, haze, echo]) this.group.add(o);
      this.items.push(item);
    }
  }

  // Does an orb on this ray, at this radius, stay out of the camera's way?
  clearsCamera(dx, dy, dz, rad, radius) {
    const keepOut = radius * CAMERA_REACH;
    const eyeUp = keepOut * Math.sin(CAMERA_RISE);
    const eyeOut = keepOut * Math.cos(CAMERA_RISE);
    const h = dy * rad * DOME_SQUASH;
    const f = Math.hypot(dx, dz) * rad;
    // The camera orbits, so the distance to measure is to the whole circle
    // the eye travels at full zoom-out, not to one point on it: testing a
    // single bearing let an orb sit twenty-six units from an eye that simply
    // swung round to meet it. The nearest approach to a circle of radius
    // eyeOut at height eyeUp is horizontally |f - eyeOut|, vertically h - eyeUp.
    if (Math.hypot(Math.abs(f - eyeOut), h - eyeUp) <= keepOut * CLEARANCE) return false;

    // And it must stand outside the column above the table: an orb near the
    // table's axis is behind the play area from every bearing however high it
    // is. Measured, the offender sat three units from the axis and covered a
    // hundred and fifty pixels. Low orbs get no exemption; that is what left
    // one sitting behind the board.
    return f > radius * COLUMN;
  }

  // Place and size every orb for the current slice.
  //
  // `w` is BACKGROUND w -- the camera's lateral angle converted to slices, the
  // same number the table's outline is cut at -- not the gameplay w the player
  // walks along. That is the rule for every 4D prop here: the play area's w is
  // which room the player is in, while a prop's w is a continuous parameter of
  // a 4D solid. Tying scenery to the camera makes it change when the player
  // LOOKS rather than when they MOVE, which is what a slice through a 4D object
  // is.
  update(w, t = 0, cam = null) {
    for (const it of this.items) {
      // Slice radius times drawn size per unit, times distance -- see SIZE.
      const r = sliceRadius(it.R, it.cw, w, this.depth) * SIZE * it.dist;
      const on = r > 0.001;
      for (const o of [it.core, it.haze, it.echo]) o.visible = on;
      if (!on) continue;

      const y = it.h + Math.sin(t * 0.00045 + it.phase) * it.bob;
      it.core.position.set(it.x, y, it.z);
      it.core.scale.setScalar(r);
      // Brightest at its fullest: an orb caught near its own edge reads
      // better dim than as a tiny hard dot.
      const full = r / (it.R * SIZE * it.dist);
      it.core.material.opacity = 0.30 + 0.55 * full;

      // A fixed ratio to the core, so an orb is never a bare ball or an empty
      // cloud.
      it.haze.position.copy(it.core.position);
      it.haze.scale.setScalar(r * 8.0);
      it.haze.material.opacity = 0.16 + 0.26 * full;

      if (cam) this.reflect(it, full, cam);
      else it.echo.visible = false;
    }
  }

  // The orb's reflection in the table, as a screen-space step.
  //
  // An orb always draws as a circle on screen, so its reflection is the same
  // circle, dimmer, mirrored down the screen about the table's surface, and
  // showing only where there is table under it.
  //
  // The world-space versions all failed, and the reasons are worth keeping: a
  // mirrored solid sits below an opaque table and is hidden by it; a true
  // reflection point for a distant light falls off the table's edge; and
  // mirroring the orb's position through the plane puts it BEHIND a camera
  // that is looking down at the table -- measured at -34 along the view
  // direction. None of those trouble a circle drawn on the screen.
  reflect(it, full, cam) {
    // The orb in screen coordinates.
    ORBW.set(it.core.position.x + this.offset[0], it.core.position.y,
             it.core.position.z + this.offset[2]);
    CAMV.copy(ORBW).project(cam);
    if (CAMV.z > 1) { it.echo.visible = false; return; }
    // The mirror line is the table directly below THIS orb, not the table's
    // middle: the further an orb is, the higher its foot sits on screen, and
    // one shared line sent the far ones wildly off.
    MIRROR.set(it.core.position.x + this.offset[0], this.y,
               it.core.position.z + this.offset[2]);
    OFFSET.copy(MIRROR).project(cam);

    // Below the foot by however far the orb is above it, then put back in the
    // world at the foot's depth. A subtraction from the foot rather than a
    // reflection of the orb, because an orb can project BELOW its own foot at
    // these distances, and a plain mirror then throws the reflection into the
    // sky.
    const rise = Math.abs(CAMV.y - OFFSET.y);
    WORLD.set(CAMV.x, OFFSET.y - rise, OFFSET.z).unproject(cam);
    it.echo.position.copy(WORLD).sub(THIS_OFFSET.set(...this.offset));

    // Matched to the orb's size on screen: a sprite shrinks with distance, so
    // scale by how much nearer the reflection is.
    const dOrb = cam.position.distanceTo(ORBW);
    const dEcho = cam.position.distanceTo(WORLD);
    it.echo.scale.setScalar(it.core.scale.x * 2 * (dEcho / Math.max(dOrb, 1e-3)));
    it.echo.material.opacity = it.core.material.opacity * ECHO;
    it.echo.visible = it.echo.material.opacity > 0.004;
  }
}

// How far out the orbs stand, as multiples of the table's radius. Both bounds
// are measured. Below: the orbit zooms out to about 4.8 table radii, so
// anything nearer is in front of the board at full zoom. Above: a camera
// looking down loses an object above the table's plane past about
// (eyeHeight - orbHeight) / tan(shallow edge of the view), which is ten or
// eleven radii for a low orb. The draw is biased outward by an exponent so
// they sit at visibly different depths rather than on one shell.
const NEAR = 6.0;
const FAR = 10.0;

// Where full zoom-out puts the eye: how far from the table's middle, in table
// radii, and how high it rides.
const CAMERA_REACH = 4.8;
const CAMERA_RISE = 21 * Math.PI / 180;

// The column above the table, in table radii, that orbs must stand clear of.
// Anything inside it is behind the board from somewhere on the orbit.
const COLUMN = 3.2;

// Margin beyond the camera's reach: an orb that merely avoids the lens still
// looms as it passes.
const CLEARANCE = 0.55;

// How much the dome is flattened. Unflattened it is geometrically right and
// visually useless: orbs land 25 to 84 degrees above horizontal, while a
// 45-degree view tilted 21 degrees down reaches only 1.5 degrees up. The
// alternative is a much wider field of view, which distorts the board to show
// scenery.
const DOME_SQUASH = 0.42;

// Drawn size per unit of slice radius, per unit of distance. Multiplied by
// distance so a far orb subtends the same angle as a near one; without that
// the far ones are invisible specks. Kept apart from R, which sets how much of
// the w loop an orb is present for: shrinking R to make them smaller also makes
// them rare, and that mistake left one orb on screen out of ten.
const SIZE = 0.019;

// How much of an orb the table gives back. Low: a bright pool reads as a lamp
// under the table rather than a sheen on it.
const ECHO = 0.275;

export { sliceRadius } from './orbshape.js';
