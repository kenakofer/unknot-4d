// Minimal orbit camera: azimuth/elevation/radius around a target point.
// Self-contained so the page has no dependency beyond three.js itself.
export class Orbit {
  constructor(el, target, radius) {
    this.el = el;
    this.target = target;
    this.radius = radius;
    this.az = Math.PI * 0.25;
    this.el_ = Math.PI * 0.28;
    this.minR = 4;
    this.maxR = radius * 3;
    this.dragging = false;
    this.onChange = () => {};
  }

  // Returns camera position for the current angles.
  position() {
    const ce = Math.cos(this.el_), se = Math.sin(this.el_);
    return [
      this.target[0] + this.radius * ce * Math.cos(this.az),
      this.target[1] + this.radius * se,
      this.target[2] + this.radius * ce * Math.sin(this.az),
    ];
  }

  rotate(dx, dy) {
    this.az -= dx * 0.008;
    this.el_ = Math.max(-1.45, Math.min(1.45, this.el_ + dy * 0.008));
    this.onChange();
  }

  zoom(delta) {
    this.radius = Math.max(this.minR, Math.min(this.maxR, this.radius * (1 + delta * 0.0012)));
    this.onChange();
  }
}
