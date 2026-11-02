// The app's shared bits, the same whichever data side the app has (cloud.js: sign-in and sync; a static app's local.js:
// this device only): the collections, a task's title, the refused-save line and the shapes the screens use.
export const COLL = 'tasks';
export const PROJECTS = 'projects';
export const SECTIONS = 'sections';
export const LABELS = 'labels';
export const FILTERS = 'filters';
/** a task's comments (their own collection: synced like the records, but not in RECORDS: not binned, not restored) */
export const COMMENTS = 'comments';
/** every collection of the app's own records (each goes to the bin when deleted) */
export const RECORDS = [COLL, PROJECTS, SECTIONS, LABELS, FILTERS];
/** the Inbox: the project with this id (made once, never deleted); a task with no project is in it */
export const INBOX = 'inbox';
/** @param {unknown} record  a task (or a project, section ...), or a refused save's record -> the words that name it */
export const itemText = record => {
  const r = /** @type {{ title?: unknown, name?: unknown } | null} */ (record);
  return String(r?.title ?? r?.name ?? '');
};
/** what the page says when the server refused a save at once (its copy waits in the refused list) */
export const REFUSED = 'The server refused that. A copy is kept in the refused list.';

/** @typedef {import('./dates.js').Due} Due */
/**
 * A task. priority: 1 the most urgent .. 4 the default. due: a local day and time (dates.js). Optional fields are
 * absent or null (null clears one). done tasks keep doneAt (ms); duration: minutes planned from due.time (1-1440).
 * @typedef {{ id: string, title: string, description?: string | null, projectId: string, sectionId?: string | null,
 *   parentId?: string | null, order: number, dayOrder?: number | null, priority: number, labels?: string[] | null,
 *   due?: Due | null, deadline?: string | null, duration?: number | null, reminders?: number[] | null, collapsed?: boolean | null, done: boolean, doneAt?: number | null,
 *   extId?: string | null, createdAt?: number, updatedAt?: unknown, _deleted?: boolean } & Record<string, unknown>} Task
 */
/** @typedef {Task} Item */
/** A comment on a task: plain text with the small markdown marks, up to 2000 characters; uid is its author's. @typedef {{ id: string, taskId: string, text: string, uid: string, name?: string | null, createdAt?: number, updatedAt?: unknown, _deleted?: boolean } & Record<string, unknown>} Comment */
/** @typedef {{ id: string, name: string, color: string, parentId?: string | null, order: number, favorite?: boolean | null,
 *   view?: 'list' | 'board', inbox?: boolean, collapsed?: boolean | null, createdAt?: number, updatedAt?: unknown } & Record<string, unknown>} Project */
/** @typedef {{ id: string, name: string, projectId: string, order: number, collapsed?: boolean | null, createdAt?: number, updatedAt?: unknown } & Record<string, unknown>} Section */
/** @typedef {{ id: string, name: string, color: string, order: number, favorite?: boolean | null, createdAt?: number } & Record<string, unknown>} Label */
/** @typedef {{ id: string, name: string, query: string, color: string, order: number, favorite?: boolean | null, createdAt?: number } & Record<string, unknown>} Filter */
/** @typedef {{ tasks: Task[], projects: Project[], sections: Section[], labels: Label[], filters: Filter[], comments?: Comment[] }} Data  everything, as last heard */
/** @typedef {{ title?: string, description?: string | null, projectId?: string, sectionId?: string | null, parentId?: string | null,
 *   priority?: number, labels?: string[] | null, due?: Due | null, deadline?: string | null, duration?: number | null, reminders?: number[] | null, order?: number, collapsed?: boolean }} Fields  what an add or edit sets */
/** one entry of the bin: a deleted item's last version (the bin recipe; docId is its document in the bin) */
/** @typedef {{ docId: string, id: string, kind?: unknown, deletedAt: number, data?: any }} BinEntry */
/** @typedef {{ list: () => Promise<BinEntry[]>, restore: (entry: BinEntry) => Promise<string>, purge: (entries: BinEntry[]) => Promise<void> }} BinApi */
/** @typedef {{ uid: string, email: string, name: string, photo?: string }} User */
/** @typedef {'not-set-up' | 'signed-out' | 'no-access' | 'ready'} Phase */
/** @typedef {{ phase: Phase, user?: User, role?: string }} State */
/** @typedef {ReturnType<typeof import('./task-ops.js').taskOps>} Ops */

/**
 * What the screens use of the app (cloud.js start(); local.js in a static app). A slot or screen that needs more
 * (the files recipe) takes cloud.js's Started.
 * @typedef {object} ItemsAppBase
 * @property {import('app-ui/ui/types').SyncApi} sync  for the kit's conflict sheet and refused list
 * @property {import('app-ui/settings/types').SettingsApi} settings
 * @property {import('app-ui/ui/types').UpdateApi | null} update  with a service worker only
 * @property {(task: Task, filesOf?: (id: string) => unknown[]) => Promise<string>} remove  a task and its subtasks
 *   (and each one's files: filesOf, the files slot's of)
 * @property {(p: Project, filesOf?: (id: string) => unknown[]) => Promise<string>} removeProject  with its sub-projects,
 *   sections and tasks (and their files)
 * @property {(s: Section, filesOf?: (id: string) => unknown[]) => Promise<string>} removeSection  with its tasks (and their files)
 * @property {(taskId: string, cb: (task: Task | null) => void) => () => void} watchItem  cb(null) once it is gone -> stop()
 * @property {() => Task[]} items  the tasks as last heard (a backup takes them)
 * @property {() => Data} data  every record as last heard
 * @property {(task: Task) => Promise<string>} put  a whole task under its own id (a restore); '' or the reason
 * @property {BinApi} [bin]  the deleted items (the bin recipe; the cloud app only)
 * @property {() => boolean} serverCopyIn  whether the server's copy has arrived yet
 * @typedef {ItemsAppBase & Omit<Ops, 'removeTask' | 'removeProject' | 'removeSection' | 'put'>} ItemsApp
 */
