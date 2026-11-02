// The Add section screen (a name and the tick), loaded the first time it opens.
import { REFUSED } from '../items.js';

/** @type {{ pid: string, wired: boolean }} */
const state = { pid: '', wired: false };

/**
 * @param {import('./views.js').Ctx} ctx @param {string} pid @param {() => void} forget the lists redraw their open name field
 * @param {() => { push: (id: string) => unknown, pop: () => unknown } | undefined} screens
 */
export function openSectionPage(ctx, pid, forget, screens) {
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const name = /** @type {HTMLInputElement} */ ($('section-name')), done = /** @type {HTMLButtonElement} */ ($('section-done'));
  state.pid = pid;
  if (!state.wired) {
    state.wired = true;
    const save = async () => {
      const text = name.value.trim();
      if (!text || !ctx.canWrite()) return;
      done.disabled = true;
      const r = (await ctx.app.addSection(state.pid, text)).refused;
      if (r) ctx.toast(REFUSED);
      forget(); screens()?.pop();
    };
    name.addEventListener('input', () => { done.disabled = !name.value.trim(); });
    $('section-form').addEventListener('submit', e => { e.preventDefault(); void save(); });
    done.addEventListener('click', () => { void save(); });
  }
  name.value = ''; done.disabled = true;
  screens()?.push('#section-page');
  setTimeout(() => name.focus(), 120);
}
