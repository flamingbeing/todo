// Web Push for reminders, as the Worker's route and cron job (listed in worker/modules.js): the same ID token check and
// revoked gate as the files route (worker/push.js has the rules). The VAPID private key is the Worker secret VAPID_PRIVATE_KEY.
import { verifyIdToken } from './claims.js';
import { adminFor } from './admin.js';
import { handlePush, runDue, firestoreStore } from './push.js';
import { VAPID_PUBLIC_KEY } from '../app/src/vapid.js';

export const pushRoute = {
  /** @param {URL} url */
  match: url => url.pathname.startsWith('/api/push/'),
  /** @param {Request} request @param {any} env @param {{ url: URL, local: boolean, project: string }} ctx */
  handle(request, env, { url, local, project }) {
    const emulator = !!(local && env.EMULATOR);
    const adm = project ? adminFor(env, local, project) : null;
    const verify = project ? (/** @type {string} */ idToken) => verifyIdToken(idToken, { project, emulator }) : null;
    const store = adm ? firestoreStore(adm, emulator ? `http://${env.FIRESTORE_EMULATOR}` : undefined) : null;
    return handlePush(request, { store, verify, revoked: adm ? async uid => !!(await adm.getDoc(`revoked/${uid}`)) : null, origin: url.origin });
  },
};

/** the cron tick: send what is due @param {any} env */
export async function pushJob(env) {
  const adm = env.FIREBASE_PROJECT && env.VAPID_PRIVATE_KEY ? adminFor(env, false, env.FIREBASE_PROJECT) : null;
  if (!adm) return;
  const vapid = { publicKey: VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'https://todo.anawj.com' };
  const r = await runDue({ store: firestoreStore(adm), vapid });
  if (r.sent || r.dropped || r.gone || r.retry || r.deferred) console.log('push', JSON.stringify(r));
}
