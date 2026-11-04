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

/**
 * The inline name field of a new section between two others (views.js asks for it once, the first time). The page is
 * drawn again on every change, synced ones too: the open field is the same element each time, so what was typed stays;
 * the browser blurs a focused element it takes out, so that blur is not the person leaving it.
 * @param {import('./views.js').Ctx} ctx
 * @param {{ naming: () => { projectId: string, sectionId: string, after?: string, order?: number } | null, stop: () => void, redraw: () => void }} o
 * @returns {(value: string, section: import('../items.js').Section | null, pid: string) => HTMLFormElement}
 */
export function nameFields(ctx, o) {
  /** @type {{ for: object | null, form: HTMLFormElement, moving: boolean } | null} */
  let shown = null;
  return (value, section, pid) => {
    const naming = o.naming();
    if (shown && naming && shown.for === naming) {
      const was = shown, input = /** @type {HTMLInputElement} */ (was.form.elements[0]);
      was.moving = document.activeElement === input;
      queueMicrotask(() => { was.moving = false; });
      return was.form;
    }
    const form = document.createElement('form'), input = document.createElement('input');
    const me = shown = { for: naming, form, moving: false };
    form.className = 'td-name-field';
    input.value = value; input.maxLength = 120; input.placeholder = 'Name this section';
    input.setAttribute('aria-label', section ? `New name for ${section.name}` : 'Name of the new section');
    let done = false;
    const at = naming?.order;
    const finish = async (/** @type {boolean} */ save) => {
      if (done) return;
      done = true; o.stop();
      if (shown === me) shown = null;
      const name = input.value.trim();
      if (save && name) {
        const r = section ? await ctx.app.renameSection(section, name) : (await ctx.app.addSection(pid, name, at)).refused;
        if (r) ctx.toast(REFUSED);
      }
      o.redraw();
    };
    form.addEventListener('submit', e => { e.preventDefault(); void finish(true); });
    input.addEventListener('blur', () => {
      if (!me.moving) { void finish(true); return; }
      // (moved by a redraw: focus it again where the caret was)
      const [a, b] = [input.selectionStart, input.selectionEnd];
      queueMicrotask(() => { if (input.isConnected && !done) { input.focus({ preventScroll: true }); input.setSelectionRange(a, b); } });
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); void finish(false); } });
    form.append(input);
    return form;
  };
}
