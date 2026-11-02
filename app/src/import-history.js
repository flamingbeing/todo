// The import's finished-task history: the other app lists finished tasks by completion date, at most 3 months per request and
// 200 per page with a cursor. This walks back in 90-day windows (2 years by default) and returns the items as one list for
// import-map.js (`sync.completed`). Nothing is kept: the token goes only in the Authorization header of a GET to the same host
// as the full sync (the page's policy allows only that host). Throws an Error whose message is what the page says.

export const COMPLETED_URL = 'https://api.todoist.com/api/v1/tasks/completed/by_completion_date';
export const WINDOW_DAYS = 90;
const PAGE = 200, MAX_PAGES = 25, MAX_ITEMS = 5000;

/**
 * @param {string} token @param {typeof fetch} fetcher @param {AbortSignal} signal
 * @param {{ now?: number, years?: number }} [o]  now: the clock (ms); years: how far back to look
 * @returns {Promise<Record<string, any>[]>}
 */
export async function fetchCompleted(token, fetcher, signal, { now = Date.now(), years = 2 } = {}) {
  /** @type {Record<string, any>[]} */
  const out = [];
  const windows = Math.ceil(years * 365 / WINDOW_DAYS);
  for (let w = 0; w < windows; w++) {
    const until = now - w * WINDOW_DAYS * 86_400_000, since = until - WINDOW_DAYS * 86_400_000;
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ since: new Date(since).toISOString(), until: new Date(until).toISOString(), limit: String(PAGE) });
      if (cursor) q.set('cursor', cursor);
      /** @type {Response} */
      let res;
      try {
        res = await fetcher(`${COMPLETED_URL}?${q}`, { method: 'GET', signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${token}` } });
      } catch {
        throw new Error(signal.aborted ? 'That took too long.' : 'Could not reach the server.');
      }
      if (res.status === 401 || res.status === 403) throw new Error('That token was not accepted');
      if (res.status === 429) throw new Error('Too many tries just now.');
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      /** @type {any} */
      let body;
      try { body = await res.json(); } catch { throw new Error('The answer was not readable.'); }
      const items = Array.isArray(body?.items) ? body.items : [];
      out.push(...items.filter((/** @type {unknown} */ x) => x && typeof x === 'object'));
      if (out.length >= MAX_ITEMS) return out.slice(0, MAX_ITEMS);
      cursor = typeof body?.next_cursor === 'string' ? body.next_cursor : '';
      if (!cursor) break;
    }
  }
  return out;
}
