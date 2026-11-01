// A tap menu: a short list of actions next to the button that opened it (the bar's "…", a section's "…", the task
// sheet's priority row). The kit's hold menu lifts a preview of what was held; this one only lists, so a plain tap
// opens it. It reuses the kit's menu look (.ui-menu-layer, .ui-menu, .ui-menu-item). Esc, a tap outside or a pick
// closes it, and the focus goes back to the button. It opens as a popover, above any sheet.
import { icon } from '@core/ui';

/** @typedef {{ label: string, icon?: import('app-ui/icons/lucide.js').IconNodes, color?: string, danger?: boolean, checked?: boolean, run: () => unknown }} MenuItem */

/** @type {(() => void) | null} */
let closeOpen = null;

/**
 * @param {HTMLElement} anchor  the button it opens from (its aria-expanded follows)
 * @param {(MenuItem | null)[]} items  null: a divider
 * @param {{ label?: string }} [o]  label: the menu's name for screen readers
 */
export function openMenu(anchor, items, { label = '' } = {}) {
  closeOpen?.();
  const layer = document.createElement('div'), veil = document.createElement('div'), menu = document.createElement('div');
  layer.className = 'ui-menu-layer is-open td-menu-layer';
  veil.className = 'ui-menu-veil td-menu-veil';
  menu.className = 'ui-menu td-menu';
  menu.setAttribute('role', 'menu');
  if (label) menu.setAttribute('aria-label', label);
  const buttons = items.map(item => {
    if (!item) return document.createElement('hr');
    const b = document.createElement('button');
    b.type = 'button'; b.className = `ui-menu-item${item.danger ? ' ui-danger' : ''}`;
    b.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemradio');
    if (item.checked !== undefined) b.setAttribute('aria-checked', String(item.checked));
    const text = document.createElement('span');
    text.textContent = item.label;
    b.append(text);
    if (item.icon) {
      const i = icon(item.icon, { class: 'td-menu-icon' });
      if (item.color) i.style.color = item.color;
      b.append(i);
    }
    b.addEventListener('click', () => { close(); void item.run(); });
    return b;
  });
  menu.append(...buttons);
  layer.append(veil, menu);
  // in the top layer, inside an open sheet when it opens from one: a modal sheet leaves the rest of the page inert
  layer.popover = 'manual';
  (anchor.closest('dialog[open]') ?? document.body).append(layer);
  layer.showPopover();
  document.documentElement.classList.add('ui-menu-open');
  anchor.setAttribute('aria-expanded', 'true');

  // under the button, kept on screen; above it when there is no room below
  const r = anchor.getBoundingClientRect(), m = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.right - m.width, innerWidth - m.width - 8));
  const below = r.bottom + 6, top = below + m.height > innerHeight - 8 ? Math.max(8, r.top - m.height - 6) : below;
  menu.style.left = `${left}px`; menu.style.top = `${top}px`;
  menu.style.transformOrigin = `${r.left + r.width / 2 - left}px ${top > r.top ? 0 : m.height}px`;

  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    const all = /** @type {HTMLButtonElement[]} */ (buttons.filter(b => b instanceof HTMLButtonElement));
    const i = all.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus(); }
  };
  const close = () => {
    if (closeOpen !== close) return;
    closeOpen = null;
    layer.remove();
    document.documentElement.classList.remove('ui-menu-open');
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true);
    if (document.activeElement === document.body || !document.activeElement) anchor.focus({ preventScroll: true });
  };
  veil.addEventListener('pointerdown', e => { e.preventDefault(); close(); });
  document.addEventListener('keydown', onKey, true);
  closeOpen = close;
  /** @type {HTMLElement | undefined} */ (buttons.find(b => b instanceof HTMLButtonElement))?.focus({ preventScroll: true });
  return close;
}
