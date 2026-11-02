// The optional modules' Worker routes (README, "Modules"): one import and one entry per module, which
// `node tools/add.mjs <recipe>` writes after the "add:" marks and `--remove` takes out again. A route is
//   { match(url) -> boolean, handle(request, env, { url, local, project }) -> Promise<Response> }
// and sites.js asks each in turn, after its own /api/ routes; the security headers are added to its answer there.
// SCHEDULED: jobs for the Cloudflare cron trigger (wrangler.jsonc "triggers"): (env, ctx) => Promise, all run on every tick.
// add: worker imports
// cloud{ Web Push for reminders (the app's own, not a recipe)
import { pushRoute, pushJob } from './push-route.js';
// }cloud

/** @type {{ match(url: URL): boolean, handle(request: Request, env: any, ctx: { url: URL, local: boolean, project: string }): Promise<Response> }[]} */
export const ROUTES = [
  // add: worker routes
  // cloud{
  pushRoute,
  // }cloud
];

/** @type {((env: any, ctx: { waitUntil(p: Promise<unknown>): void }) => unknown)[]} */
export const SCHEDULED = [
  // cloud{
  pushJob,
  // }cloud
];
