// Level definitions. Each level is a starting path in a grid. Every level is
// played in four dimensions -- a 3D path is lifted to w = 0 as it loads -- so
// they are all solvable; `knotted` marks the ones whose 3D shadow is a real
// knot, which is what makes the fourth direction necessary rather than a
// convenience. The suite checks that claim.
const TREFOIL_3D = [[0,3,4],[1,3,4],[2,3,4],[3,3,4],[4,3,4],[5,3,4],[5,4,4],[6,4,4],[6,4,3],[7,4,3],[7,5,3],[7,5,2],[8,5,2],[8,6,2],[8,6,3],[8,7,3],[8,7,4],[7,7,4],[7,7,5],[6,7,5],[6,7,6],[5,7,6],[5,7,5],[4,7,5],[4,6,5],[4,6,4],[4,5,4],[4,4,4],[4,4,3],[4,3,3],[4,3,2],[4,2,2],[4,2,3],[5,2,3],[5,2,4],[6,2,4],[6,2,5],[6,3,5],[6,3,6],[6,4,6],[6,4,5],[6,5,5],[6,6,5],[6,6,4],[5,6,4],[5,7,4],[5,7,3],[4,7,3],[4,7,2],[3,7,2],[3,7,3],[2,7,3],[2,7,4],[2,6,4],[2,6,5],[3,6,5],[3,5,5],[3,5,6],[4,5,6],[4,4,6],[4,4,5],[5,4,5],[5,5,5],[5,5,6],[6,5,6],[7,5,6],[8,5,6],[9,5,6]];

const LIFT_TREFOIL = TREFOIL_3D.map((p) => [...p, 0]);

export const LEVELS = [
  {
    name: 'First bump',
    blurb: 'One detour. Flatten it.',
    dims: [8, 8, 8],
    path: [[1,1,1],[2,1,1],[2,2,1],[3,2,1],[4,2,1],[4,1,1],[5,1,1],[6,1,1]],
  },
  {
    name: 'Long bend',
    blurb: 'Grab the corner and walk it down the rope.',
    dims: [10, 10, 10],
    // A long straight run with a detour parked in the middle of it. Walking
    // the bend along the rope brings the slack to where it can be pulled in.
    path: [[1,1,1],[2,1,1],[3,1,1],[3,2,1],[4,2,1],[5,2,1],[5,1,1],
           [6,1,1],[7,1,1],[8,1,1]],
  },
  {
    name: 'Staircase',
    blurb: 'Slack in three directions at once.',
    dims: [8, 8, 8],
    path: [[1,1,1],[1,1,2],[1,2,2],[2,2,2],[2,2,3],[2,3,3],[3,3,3],
           [3,3,2],[3,2,2],[3,2,1],[4,2,1],[4,1,1],[5,1,1]],
  },
  {
    name: 'Tangle',
    blurb: 'Loose, but not knotted. It all comes out.',
    dims: [8, 8, 8],
    path: [[1,3,3],[2,3,3],[2,4,3],[2,4,4],[3,4,4],[3,3,4],[4,3,4],[4,3,3],
           [4,2,3],[3,2,3],[3,2,4],[3,2,5],[4,2,5],[5,2,5],[5,3,5],[5,4,5],
           [5,4,4],[5,4,3],[5,5,3],[6,5,3]],
  },
  {
    name: 'Trefoil',
    blurb: 'A real knot. Stuck at 27 steps with three directions -- ' +
           'use the fourth and it comes undone.',
    // Symmetric so the 4D view can be rotated between any pair of axes.
    dims: [10, 10, 10, 10],
    // Its 3D shadow is a genuine trefoil, which is why three directions are
    // not enough. Checked by the suite.
    knotted: true,
    // Stuck at 27 steps if the w moves are never used; reaches the taut 13
    // once they are. That gap is the whole demonstration.
    path: LIFT_TREFOIL,
  },
];
