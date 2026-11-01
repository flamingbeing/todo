// A sticky head (Upcoming's week strip, the Search field) sits under the top bar, which sticks too, where both stick in
// the same scroll (a phone); where the page scrolls inside its own box, under the bar already, it sticks at 0.

/** @param {HTMLElement} el */
export function underBar(el) {
  let box = el.parentElement;
  while (box && box !== document.body && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  const bar = document.querySelector('.ui-bar')?.getBoundingClientRect().bottom ?? 0;
  el.style.top = `${Math.max(0, Math.round(bar - (box && box !== document.body ? box.getBoundingClientRect().top : 0)))}px`;
}
