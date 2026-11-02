// The app's tap menu: the core's openMenu (app-ui, rc.83) with this app's class names, so the look in app.css applies.
// With `pop` it is a small floating card stacked upward from its button (quick add's "+" and project popups): the icon on
// the left of each label, a title row on top.
import { openMenu as coreMenu } from '@core/ui';

const classes = { layer: 'td-menu-layer', veil: 'td-menu-veil', menu: 'td-menu', icon: 'td-menu-icon' };

/**
 * @param {HTMLElement} anchor @param {Parameters<typeof coreMenu>[1]} items
 * @param {NonNullable<Parameters<typeof coreMenu>[2]> & { pop?: boolean }} [o]
 */
export function openMenu(anchor, items, o = {}) {
  const { pop, ...rest } = o;
  const close = coreMenu(anchor, items, { ...rest, classes: pop ? { ...classes, menu: `${classes.menu} td-menu-pop` } : classes });
  if (pop) {
    // the core puts it under the button (or above when there is no room): here it always opens upward, from the button's left
    const menu = /** @type {HTMLElement | null} */ ((anchor.closest('dialog[open]') ?? document.body).querySelector(':scope > .td-menu-layer:last-of-type > .td-menu'));
    if (menu) {
      const r = anchor.getBoundingClientRect(), m = menu.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, innerWidth - m.width - 8)), top = Math.max(8, r.top - m.height - 8);
      menu.style.left = `${left}px`; menu.style.top = `${top}px`;
      menu.style.transformOrigin = `${r.left + r.width / 2 - left}px ${m.height}px`;
    }
  }
  return close;
}
