// Every completion: about 30 coloured bits burst from the checkbox (60-80 px out, then fall with gravity and fade over
// 2 s). Opacity and transform only; skipped under reduced motion. Loaded on the first completion (views.js lazyModules
// "confetti").
const COLOURS = ['#dc4c3e', '#f2a33a', '#3d9e5f', '#2f7fd8', '#8b5cf6', '#e86fa8'];
export const BITS = 30, MS = 2000;

/** burst from an element's centre @param {Element} from */
export function burst(from) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = from.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'td-confetti';
  box.setAttribute('aria-hidden', 'true');
  box.style.left = `${b.left + b.width / 2}px`;
  box.style.top = `${b.top + b.height / 2}px`;
  for (let i = 0; i < BITS; i++) {
    const bit = document.createElement('span');
    bit.className = 'td-confetti-bit';
    bit.style.background = COLOURS[i % COLOURS.length];
    const a = (i / BITS) * Math.PI * 2 + (i % 2) * 0.1, r = 60 + (i % 5) * 5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r, fall = 140 + (i % 4) * 25;
    // out fast (decelerating), then gravity: the fall quickens as it fades
    bit.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0, easing: 'cubic-bezier(0,0,.2,1)' },
      { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: .25, easing: 'cubic-bezier(.5,0,1,1)' },
      { transform: `translate(${x * 1.15}px, ${y + fall}px) scale(.6)`, opacity: 0, offset: 1 },
    ], { duration: MS, fill: 'forwards' });
    box.append(bit);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), MS + 100);
}
