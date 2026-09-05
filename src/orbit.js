// Minimal orbit camera: azimuth/elevation/radius around a target point.
// Self-contained so the page has no dependency beyond three.js itself.
//
// A gentle rock is added on top of the angles the player sets, in step with the
// minimap panel so the two views always show the same face of the puzzle. The
// offsets live apart from az/el_ so the drag state is never polluted by the
// animation: dragging sets where the view is centred, the rock swings around
// that centre, and letting go leaves the centre exactly where it was put.

// Radians per pixel of drag. Low enough that a full sweep of the box takes a
// deliberate gesture rather than a flick.
const SPEED = 0.004;
export class Orbit {
  constructor(el, target, radius) {
    this.el = el;
    this.target = target;
    this.radius = radius;
    // Resting view: looking due north, from 45 degrees up.
    //
    // Azimuth places the EYE, and the camera looks back at the target, so the
    // eye sits on the south side (+z) for the view to face north (-z). Axis 2
    // is north/south with north negative, matching the direction pad.
    this.az = Math.PI * 0.5;
    this.el_ = Math.PI * 0.25;
    this.minR = 4;
    this.maxR = radius * 3;
    this.dragging = false;
    // Animation offsets, set from outside each frame. Not part of the state a
    // drag modifies.
    this.rockYaw = 0;
    this.rockTilt = 0;
    this.onChange = () => {};
  }

  // The angles actually looked from: what the player set, plus the rock.
  // Elevation stays inside the same limits a drag respects, so the swing can
  // never tip the camera over the top.
  angles() {
    return {
      az: this.az + this.rockYaw,
      el: Math.max(-1.45, Math.min(1.45, this.el_ + this.rockTilt)),
    };
  }

  // Returns camera position for the current angles.
  position() {
    const { az, el } = this.angles();
    const ce = Math.cos(el), se = Math.sin(el);
    return [
      this.target[0] + this.radius * ce * Math.cos(az),
      this.target[1] + this.radius * se,
      this.target[2] + this.radius * ce * Math.sin(az),
    ];
  }

  // Set the animation offsets and repaint. Separate from rotate() so it never
  // touches the player's own angles.
  rock(yaw, tilt) {
    if (yaw === this.rockYaw && tilt === this.rockTilt) return;
    this.rockYaw = yaw;
    this.rockTilt = tilt;
    this.onChange();
  }

  rotate(dx, dy) {
    // Drag right and the scene follows right.
    //
    // The camera's right vector is cross(up, eye - target) = (sin az, 0, -cos
    // az). Sweeping az forwards carries the eye anticlockwise, which slides
    // the world LEFT across the view -- so a rightward drag has to DECREASE
    // az. Checked in test/orbit.js against a point held directly ahead of the
    // camera, swept through every heading, because the sign of this for any
    // single fixed point depends on where that point sits.
    this.az -= dx * SPEED;
    this.el_ = Math.max(-1.45, Math.min(1.45, this.el_ - dy * SPEED));
    this.onChange();
  }

  zoom(delta) {
    this.radius = Math.max(this.minR, Math.min(this.maxR, this.radius * (1 + delta * 0.0012)));
    this.onChange();
  }
}
