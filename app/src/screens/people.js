// The Access requests page in Settings (admins only; loads when the page is first shown): the people who signed in with
// Google and asked for access (requests/{uid}, newest first), each with Let in and Decline. Let in makes them a member
// through the Worker (/api/members/); their own page then opens their (empty, private) list by itself.

/**
 * @typedef {{ uid: string, name: string, email: string, at: number }} Ask
 * @typedef {{ requests: (fn: (list: Ask[]) => void) => () => void, approve: (uid: string) => Promise<string>,
 *   decline: (uid: string) => Promise<string> }} Members
 */

/** @param {string} tag @param {string} [cls] @param {string} [text] */
const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/** @param {number} at */
const when = at => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** @param {HTMLElement} host @param {{ members: Members }} deps */
export function peopleScreen(host, { members }) {
  const box = el('div', 'td-people');
  const list = el('ul', 'ui-list td-people-list');
  const empty = el('p', 'td-settings-caption', 'Nobody is waiting. When someone signs in with Google, they show up here.');
  const note = el('p', 'td-settings-caption td-people-note');
  note.setAttribute('role', 'status');
  box.append(list, empty, note);
  host.append(box);

  /** @param {Ask[]} asks */
  const draw = asks => {
    list.replaceChildren(...asks.map(a => {
      const li = el('li', 'ui-row td-people-row');
      li.dataset.uid = a.uid;
      const main = el('span', 'ui-row-main', a.name || a.email || 'Someone');
      main.append(el('span', 'ui-row-sub', [a.name ? a.email : '', a.at ? when(a.at) : ''].filter(Boolean).join(' · ')));
      const yes = /** @type {HTMLButtonElement} */ (el('button', 'ui-button td-people-yes', 'Let in'));
      const no = /** @type {HTMLButtonElement} */ (el('button', 'ui-button ui-button-quiet td-people-no', 'Decline'));
      /** @param {() => Promise<string>} act @param {string} done */
      const run = async (act, done) => {
        yes.disabled = no.disabled = true;
        const why = await act();
        note.textContent = why || done;
        if (why) yes.disabled = no.disabled = false;
      };
      yes.onclick = () => run(() => members.approve(a.uid), `${a.name || a.email} can now use the app.`);
      no.onclick = () => run(() => members.decline(a.uid), 'Declined.');
      li.append(main, yes, no);
      return li;
    }));
    empty.hidden = asks.length > 0;
  };
  // live while Settings is built (the page loads once): a new request shows up without leaving the page
  const stop = members.requests(draw);
  return { leave: () => {}, destroy: () => { stop(); box.remove(); } };
}
