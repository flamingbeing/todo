// Quick add's opening motion, loaded the first time the sheet opens (quick-add.js, lazyModules "morph"): the card grows
// out of the add button. The CSS does the moving (transform and opacity only, 300ms, decelerating, no overshoot); this
// only tells it where the button is, as the distance from the card's bottom centre to the button's centre, so the card
// starts at the button's place and size. Nothing happens under reduced motion.

/** @param {HTMLElement} sheet  the (closed) quick add dialog; call just before showModal() */
export function aim(sheet) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fab = document.getElementById('fab');
  if (!fab || fab.hidden) { sheet.style.removeProperty('--qa-dx'); sheet.style.removeProperty('--qa-dy'); return; }
  const f = fab.getBoundingClientRect();
  const w = Math.min(innerWidth, 640);                    // the card is as wide as the page, up to 40rem, centred
  const kb = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-keyboard-h')) || 0;
  const dx = f.left + f.width / 2 - innerWidth / 2;
  const dy = f.top + f.height / 2 - (innerHeight - kb - 40);   // about the card's middle once docked
  sheet.style.setProperty('--qa-dx', `${Math.round(dx)}px`);
  sheet.style.setProperty('--qa-dy', `${Math.round(dy)}px`);
  sheet.style.setProperty('--qa-s', String(Math.max(.1, +(f.width / w).toFixed(3))));
}
