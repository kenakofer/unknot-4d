// The scenery every game shares: the 4D table the ring of frames stands on,
// and the hyperspheres hung over it.
//
// Assembled here so a game wires it in the same way whether it has a focus
// (snake, unknot) or a fixed camera (tron), and so the rule the props follow
// is written once: they are cut at BACKGROUND w -- the camera's lateral angle
// converted to slices at the ring's own rate, plus the eased focus -- never at
// the gameplay w the player walks along. Turning the view is what reveals a
// different slice of the scenery, not moving along the board's fourth axis.
//
// A game that uses this needs two things from its renderer setup, both of
// which are easy to forget and silently wrong without:
//
//   renderer:  { stencil: true }   the reflections are clipped to the stone
//                                  by stencil, not by clipping planes
//   camera:    far = FAR_PLANE     the orbs stand well past the board
//
// The maths of where the table sits is in tableshape.js, where the suite can
// reach it; this file only draws.

import { Table, tableW } from './table.js';
import { tableFit } from './tableshape.js';
import { Orbs } from './orbs.js';
import { makeRng } from './grid.js';

// The far plane has to clear the orbs AND their reflections, which are mirrored
// below the table and so are always the further of the two. Everything else in
// a scene is within about fifty of the camera, so the depth buffer is not being
// asked to do anything hard by this: the far objects never overlap the near
// ones in a way that needs resolving.
export const FAR_PLANE = 6000;

// How far a camera should look down at a board with orbs behind it, in degrees.
//
// Shallow enough that the top of the view clears the horizon. With a 45-degree
// fov the view spans LOOK_DOWN +/- 22.5, so anything under about 22 degrees
// puts the far edge AT or above horizontal -- and an orb standing on the plane
// is then visible however far out it is and whatever the zoom.
//
// That is worth more than it sounds. At 35 degrees the view reached only about
// three table radii before the horizon left the top of the screen, while the
// orbs have to stand beyond five to stay clear of the camera at full zoom-out:
// the two constraints had no overlap, and the orbs vanished. Coming down here
// removes the bound rather than trading one for another.
export const LOOK_DOWN_DEG = 21;

// The table's top, relative to the frames' floor at y = -0.5: a little below,
// so the rooms stand on it rather than sinking into it.
export const TABLE_Y = -0.9;

// One seed for every game: a given board always has the same lights in the
// same places. The scene should be somewhere you can come back to, not a new
// arrangement on every reload.
const ORB_SEED = 20260906;

export class Props {
  // `dims3` and `ring` are what the frames were built from; `depth` is the
  // number of slices along w. `orbs: false` leaves the table on its own, which
  // is what a board with no fourth dimension wants -- the hyperspheres' whole
  // point is to swell and vanish as w changes, and with nowhere to go along w
  // they would simply hang there.
  constructor({ dims3, ring, depth, orbs = true, seed = ORB_SEED, y = TABLE_Y }) {
    const { centre, inradius } = tableFit(dims3, ring.radius);
    this.depth = depth;
    this.slots = ring.slots;

    this.table = new Table({ radius: inradius, y });
    this.table.group.position.set(centre[0], 0, centre[1]);
    // Add this to the world. The orbs ride on the table's own group, so they
    // inherit its position and take its top as their mirror plane.
    this.group = this.table.group;

    this.orbs = null;
    if (orbs) {
      this.orbs = new Orbs({
        depth,
        // The TABLE's radius, not the ring's: it sets how far out the orbs
        // stand and, more importantly, how much surface there is to catch a
        // reflection.
        radius: this.table.radius,
        y: y + 0.01,
        rng: makeRng(seed),
      });
      this.table.attached.add(this.orbs.group);
      // Where the group ends up in the world, so the orbs can bring the camera
      // into their own coordinates when placing reflections.
      this.orbs.offset = [centre[0], 0, centre[1]];
    }
  }

  // Once per frame, after the camera has been placed for it.
  //
  // `shown` is the eased focus; `yaw` is how far the view has been turned from
  // its resting azimuth by the player, and `sway` how far the rock has swung it
  // on top. They go in separately because the table's outline answers to the
  // aim alone -- it should not rebuild under the endless little sway -- while
  // its marbling and the orbs answer to both. `t` is the shared clock, in ms.
  update(shown, yaw, sway, t, camera) {
    this.table.update(shown, this.depth, yaw, this.slots, sway);
    if (this.orbs) {
      // The reflections are placed by projecting through the camera, which
      // reads its world matrices -- and those are only refreshed by render().
      // Without this the mirror images trail the camera by one frame.
      camera.updateMatrixWorld();
      this.orbs.update(tableW(shown, yaw + sway, this.slots), t, camera);
    }
  }
}
