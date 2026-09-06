// The rock: a gentle, endless sway added on top of wherever the player has
// aimed the camera.
//
// It is not an orbit. A full spin would keep swapping which way is left and
// which is right, and every one of these games rests on left, right, up and
// down meaning one fixed thing. A small swing keeps those stable while the
// parallax does the real work: two things that overlap exactly in one still
// view come apart a moment later, so a 3D shape in a box reads as a shape
// rather than a flat tangle.
//
// It lives here rather than in any one view because more than one view uses it
// at once -- the main camera and a diagram panel, say -- and they must swing
// from the SAME clock. Two copies of this rule would drift apart within a
// minute and the two views would start disagreeing about which face of the
// puzzle is showing.

export const ROCK = 0.105;       // radians of yaw either side of centre
export const PERIOD = 9000;      // ms for a full yaw swing
// A slower nod on top of the side-to-side swing. The two periods are chosen
// not to divide into each other, so the view never repeats exactly and
// anything hidden at one moment comes clear a little later.
export const NOD = 0.04;         // radians of tilt either side of centre
export const NOD_PERIOD = 14300; // ms, deliberately not a multiple of PERIOD

// The rock, as offsets to add to whatever the camera is already looking at.
// Every view calls this with the same clock, so they swing together.
export function rockAt(ms) {
  return {
    yaw: Math.sin((ms / PERIOD) * Math.PI * 2) * ROCK,
    tilt: Math.sin((ms / NOD_PERIOD) * Math.PI * 2) * NOD,
  };
}
