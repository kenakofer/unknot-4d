// Level definitions. Each level is a starting path in a grid; `expect` records
// whether it is known solvable, so the UI can be honest about impossible ones.
export const LEVELS = [
  {
    name: 'First bump',
    blurb: 'One detour. Flatten it.',
    dims: [8, 8, 8],
    expect: 'solvable',
    path: [[1,1,1],[2,1,1],[2,2,1],[3,2,1],[4,2,1],[4,1,1],[5,1,1],[6,1,1]],
  },
  {
    name: 'Staircase',
    blurb: 'Slack in three directions at once.',
    dims: [8, 8, 8],
    expect: 'solvable',
    path: [[1,1,1],[1,1,2],[1,2,2],[2,2,2],[2,2,3],[2,3,3],[3,3,3],
           [3,3,2],[3,2,2],[3,2,1],[4,2,1],[4,1,1],[5,1,1]],
  },
];
