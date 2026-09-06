// The text on the landing page.
//
// Prose, meant to be edited like a document. Anything written here by an AI is
// a draft: the author reads, edits or approves every player-visible sentence
// before it ships, which is only possible while the copy is gathered in a few
// known files. See shared/copy.js for the rule in full.
// It lives in shared/ rather than beside index.html because the page has no
// source directory of its own -- it is one file at the root.

export const INDEX = {
  title: '4D Games',
  lede: 'Small games played in four dimensions, and in three, and in two. ' +
        'They share one set of controls and one way of drawing the extra ' +
        'direction, so the spatial sense you build in any of them carries ' +
        'into the rest.',

  games: [
    {
      href: './games/4d-unknot/',
      dim: '4D',
      name: 'Unknot',
      text: 'Pull a knotted rope taut. One level cannot come undone in ' +
            'three dimensions — and does in four.',
    },
    {
      href: './games/4d-snake/',
      dim: '4D',
      name: 'Snake',
      text: 'Six cubes, six deep, three slabs of lava. Walls on every side ' +
            'except the fourth direction, which wraps.',
    },
    {
      href: './games/4d-tron/',
      dim: '4D',
      name: 'Tron',
      tag: '2 players',
      text: 'Two riders, one clock, permanent trails. The fourth direction ' +
            'is the lane you flee down when three dimensions run out.',
    },
  ],

  notes: [
    {
      lead: 'The fourth direction.',
      text: 'Each value along it gets its own cube frame, and the frames ' +
            'stand on a ring in order. <kbd>A</kbd> and <kbd>D</kbd> walk ' +
            'around that ring; the ring turns rather than the camera, so the ' +
            'frame you are working in is always the one directly in front of ' +
            'you, in the same place on screen. Where the ring has a solid ' +
            'block in it, that step is closed. Where it closes seamlessly, ' +
            'the last frame really does join the first.',
    },
    {
      lead: 'Everything else',
      text: 'is where you would expect: arrow keys for the horizontal ' +
            'plane, <kbd>W</kbd> and <kbd>S</kbd> for up and down. One ' +
            'colour per axis, the same colour in every game.',
    },
  ],
};
