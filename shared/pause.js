// The pause menu.
//
// Every game here gets the same one, opened the same way, with the same items
// in the same order -- so a player who has found it once has found it in all of
// them. It is the only place a run can be abandoned, which is the point:
// restarting used to be a bare keypress, and a bare keypress next to the
// movement keys will eventually be hit by accident and throw away a good game.
//
// Escape opens and closes it. That is what Escape means everywhere else, and it
// is nowhere near the keys a player is actually using.

import { soundEnabled, toggleSound } from './audio.js';
import { PAUSE } from './copy.js';

const NS_HTML = 'http://www.w3.org/1999/xhtml';

export class PauseMenu {
  // `onPause` / `onResume` let a game stop its own clock. A turn-based game can
  // ignore them; a game with a clock must not run while the menu is up.
  //
  // `onRestart` starts a fresh run. `home` is where "All games" goes.
  // `onTutorial`, when a game has one, adds a "Movement tutorial" item that
  // replays it. Named for what it teaches rather than which game it lives in:
  // it covers the controls and the ring of rooms, which every game here
  // shares, not the rules of any one of them.
  constructor({ onRestart, onPause, onResume, onTutorial,
                home = '../../' } = {}) {
    this.onRestart = onRestart || (() => {});
    this.onTutorial = onTutorial || null;
    this.onPause = onPause || (() => {});
    this.onResume = onResume || (() => {});
    this.home = home;
    this.open = false;
    this.build();
    this.bind();
  }

  build() {
    const el = document.createElementNS(NS_HTML, 'div');
    el.id = 'pause';
    el.innerHTML = `
      <div class="card">
        <h2>${PAUSE.heading}</h2>
        <div class="items">
          <button data-act="resume"><span class="k">Esc</span><span class="s">${PAUSE.resume}</span></button>
          <button data-act="restart"><span class="k">↺</span><span class="s">${PAUSE.restart}</span></button>
          <button data-act="sound"><span class="k" id="pauseSoundIcon">♪</span><span class="s" id="pauseSoundLabel">${PAUSE.soundOn}</span></button>
          <button data-act="tutorial"${this.onTutorial ? '' : ' hidden'}><span class="k">?</span><span class="s">${PAUSE.tutorial}</span></button>
          <a data-act="home" href="${this.home}"><span class="k">←</span><span class="s">${PAUSE.home}</span></a>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    el.addEventListener('click', (ev) => {
      // A click on the backdrop closes, like any modal. A click inside the card
      // must not, or picking a menu item would dismiss the menu under the
      // pointer before the item ran.
      if (ev.target === el) { this.hide(); return; }
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'resume') { this.hide(); }
      else if (act === 'restart') { this.hide(); this.onRestart(); }
      else if (act === 'sound') { toggleSound(); this.syncSound(); }
      else if (act === 'tutorial' && this.onTutorial) { this.onTutorial(); }
      // 'home' is a real link; let the browser follow it.
    });

    this.syncSound();
  }

  syncSound() {
    const on = soundEnabled();
    const label = this.el.querySelector('#pauseSoundLabel');
    const icon = this.el.querySelector('#pauseSoundIcon');
    if (label) label.textContent = on ? PAUSE.soundOn : PAUSE.soundOff;
    // A struck-through note for off, so the state is legible from the glyph
    // alone rather than only from the word beside it.
    if (icon) icon.textContent = on ? '♪' : '♪̸';
    const btn = this.el.querySelector('[data-act="sound"]');
    if (btn) btn.classList.toggle('off', !on);
  }

  bind() {
    addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      this.toggle();
    });
  }

  toggle() { this.open ? this.hide() : this.show(); }

  show() {
    if (this.open) return;
    this.open = true;
    this.el.classList.add('show');
    this.onPause();
    // Focus the first item, so the menu is usable from the keyboard alone
    // without hunting for where the focus went.
    const first = this.el.querySelector('button');
    if (first) first.focus();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('show');
    this.onResume();
  }
}
