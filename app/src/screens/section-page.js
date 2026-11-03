// The Add section screen (a name, a description and the tick), loaded the first time it opens; Edit section is the
// same screen with the section's values in it.
import { REFUSED } from '../items.js';

/** @type {{ pid: string, section: import('../items.js').Section | null, wired: boolean }} */
const state = { pid: '', section: null, wired: false };

/**
 * @param {import('./views.js').Ctx} ctx @param {string} pid @param {() => void} forget the lists redraw their open name field
 * @param {() => { push: (id: string) => unknown, pop: () => unknown } | undefined} screens
 * @param {import('../items.js').Section | null} [section]  this one's Edit section, else a new one at the end of pid
 */
export function openSectionPage(ctx, pid, forget, screens, section = null) {
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const name = /** @type {HTMLInputElement} */ ($('section-name')), desc = /** @type {HTMLTextAreaElement} */ ($('section-desc'));
  const done = /** @type {HTMLButtonElement} */ ($('section-done'));
  state.pid = pid; state.section = section;
  if (!state.wired) {
    state.wired = true;
    const save = async () => {
      const text = name.value.trim();
      if (!text || !ctx.canWrite()) return;
      done.disabled = true;
      const s = state.section;
      const r = s ? await ctx.app.editSection(s, text, desc.value) : (await ctx.app.addSection(state.pid, text, undefined, desc.value)).refused;
      if (r) ctx.toast(REFUSED);
      forget(); screens()?.pop();
    };
    name.addEventListener('input', () => { done.disabled = !name.value.trim(); });
    $('section-form').addEventListener('submit', e => { e.preventDefault(); void save(); });
    done.addEventListener('click', () => { void save(); });
  }
  $('section-title').textContent = section ? 'Edit section' : 'Add section';
  done.setAttribute('aria-label', section ? 'Save section' : 'Add section');
  name.value = section?.name ?? '';
  desc.value = typeof section?.description === 'string' ? section.description : '';
  done.disabled = !name.value.trim();
  screens()?.push('#section-page');
  setTimeout(() => name.focus(), 120);
}
