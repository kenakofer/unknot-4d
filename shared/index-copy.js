// The text on the landing page.
//
// Prose, meant to be edited like a document. Anything written here by an AI is
// a draft: the author reads, edits or approves every player-visible sentence
// before it ships, which is only possible while the copy is gathered in a few
// known files. See shared/copy.js for the rule in full.
// It lives in shared/ rather than beside index.html because the page has no
// source directory of its own -- it is one file at the root.

export const INDEX = {
  title: '4D Games', //kenan approved
  lede: 'Grid games played in four dimensions, (or in three, or in two...)' + //kenan approved
        'The movement tutorial is recommended if you\'re new to 4D motion', //kenan approved

  games: [
    {
      href: './unknot/', //kenan approved
      dim: '4D', //kenan approved
      name: 'Unknot', //kenan approved
      text: 'Untangle a purportedly knotted rope.', //kenan approved
    },
    {
      href: './snake/', //kenan approved
      dim: '4D', //kenan approved
      name: 'Snake', //kenan approved
      text: 'Eat, grow, and don\'t bonk your head or get burned.' //kenan approved
    },
    {
      href: './tron/', //kenan approved
      dim: '4D', //kenan approved
      name: 'Tron', //kenan approved
      tag: '2 players', //kenan approved
      text: 'Competitive 2 player classic in a fast-paced 4-dimensional head-to-head', //kenan approved
    },
  ],

  notes: [
    {
      lead: 'The fourth dimension.', //kenan approved
      text: 'The 4th dimension here is treated as another spatial dimension ' + //kenan approved
            'just like the others. Use arrow keys and WASD to move around.' //kenan approved
    },
  ],
};
