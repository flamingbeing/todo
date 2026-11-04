// Ticking a task off a list (views.js loads this after the first draw, with the quick add and the task sheet): the box
// fills, the row fades out, then the save and the undo toast. A repeating task stays open and moves to its next date
// (recur.js, loaded then); past its last one it is done.
import { glide } from '@core/ui';
import { REFUSED } from '../items.js';
import { dayKey } from '../dates.js';

/** @typedef {import('../items.js').Task} Task */

/**
 * @param {import('./view-types.js').Ctx} ctx @param {Task} t @param {HTMLElement | null | undefined} row
 * @param {{ need: (k: any) => Promise<any>, withMod: (k: any, run: (m: any) => unknown) => unknown }} lazy  views.js's lazy modules
 */
export async function complete(ctx, t, row, lazy) {
  const { app, toast, undo } = ctx;
  let next = /** @type {string | null} */ (null);
  if (t.due?.rrule) {
    try {
      const { nextDay, dateLibs } = await import('../recur.js'), today = dayKey();
      next = nextDay(t.due, { done: today, today }, (await dateLibs()).RRule);
    } catch { /* offline before the library was kept: done for good is wrong, so leave it */ toast('Could not work out the next date'); ctx.redraw(); return; }
  }
  if (row) {
    await new Promise(r => setTimeout(r, 150));
    // (every completion bursts from the checkbox as the row starts to fade; off under reduced motion)
    const bit = row.querySelector('.td-check');
    if (bit) void lazy.withMod('confetti', m => m.burst(bit));
    // (the ring has filled and its check drawn, 150 ms: app.css; then the row fades, and the list drawn again closes the gap)
    if (!next) { row.classList.add('is-leaving'); await glide([[row, x => ({ opacity: String(1 - x), transform: `translateX(${x * 12}px)` })]], 0, 1).done; await (await lazy.need('gap')).closeGap(row); }
  }
  const party = app.settings.get('goalParty') ? await lazy.need('party') : null;
  const before = party ? party.doneToday(ctx.data().tasks) : 0;
  const { refused, ticked, moved, reopened } = await app.complete(t, { next, keepSubs: app.settings.get('resetSubs') === false });
  if (refused) { toast(REFUSED); ctx.redraw(); return; }
  // (Settings: the complete tone, and a cheer when this one meets the daily goal; a repeating task's move counts too)
  if (app.settings.get('tone')) void lazy.withMod('tone', m => m.playTone());
  const met = !!party?.metNow(before, before + 1, Number(app.settings.get('dailyGoal') ?? 0));
  if (met) party?.cheer();
  const said = met ? 'Task completed. Daily goal reached' : 'Task completed';
  if (moved) undo.show(said, async () => { if (await app.unmove(t, moved, reopened)) toast(REFUSED); });
  else undo.show(said, async () => { if (await app.untick(ticked)) toast(REFUSED); });
}
