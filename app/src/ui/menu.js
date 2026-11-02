// The app's tap menu: the core's openMenu (app-ui, rc.83) with this app's class names, so the look in app.css applies.
import { openMenu as coreMenu } from '@core/ui';

const classes = { layer: 'td-menu-layer', veil: 'td-menu-veil', menu: 'td-menu', icon: 'td-menu-icon' };

/** @type {typeof coreMenu} */
export const openMenu = (anchor, items, o = {}) => coreMenu(anchor, items, { ...o, classes });
