// Types only: views.js names them for the lazy screens; nothing loads this file (it keeps the startup bytes down).
/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../items.js').Item} Item */
/** @typedef {import('../items.js').Data} Data */
/**
 * The tools slot (modules.js "listFilter"; the search recipe fills it): draws into the slot and narrows the tasks.
 * @typedef {(o: { slot: HTMLElement, redraw: () => void }) => { feed: (items: Item[]) => void, pick: (items: Item[]) => Item[] | null,
 *   passage?: (item: Item) => HTMLElement | null }} ListFilter
 */
/**
 * The tasks' files slot (modules.js "itemFiles"; the files recipe fills it).
 * @typedef {object} ItemFiles
 * @property {(byItem: Map<string, unknown[]>) => void} feed
 * @property {(itemId: string) => unknown[]} of
 * @property {(item: Item) => HTMLElement | null} thumbs
 * @property {(slot: HTMLElement, editing: () => Item | null) => () => void} mount
 * @typedef {(o: { app: any, toast: (message: string) => unknown }) => ItemFiles} ItemFilesSlot
 */
/**
 * What the lazy screens get from the lists (one object, made once).
 * @typedef {object} Ctx
 * @property {import('../items.js').ItemsApp} app
 * @property {() => Data} data
 * @property {() => boolean} canWrite
 * @property {(message: string, o?: { action?: { label: string, run: () => void } }) => unknown} toast
 * @property {{ show: (message: string, undo: () => unknown) => void }} undo
 * @property {(t: Task) => void} openTask
 * @property {(id: string) => void} openProject
 * @property {(o?: AddContext, hold?: { handTo: (f: HTMLElement) => void } | null) => void} openQuickAdd  hold: the keyboard held by the tap (holdKeyboard)
 * @property {(o?: { project?: import('../items.js').Project, parentId?: string }) => void} openProjectSheet
 * @property {(what: { task: Task } | { project: import('../items.js').Project }) => void} openActivity
 * @property {(p: import('../items.js').Project) => void} openProjectComments
 * @property {(t: Task, row?: HTMLElement | null) => void} complete
 * @property {(p: import('../items.js').Project) => Promise<boolean>} removeProject  asks first; true once asked and said yes
 * @property {(o?: Partial<import('../ui/row.js').RowContext>) => import('../ui/row.js').RowContext} rows
 * @property {() => import('../items.js').User | undefined} user
 * @property {ItemFiles | undefined} files
 * @property {(kind: 'labels' | 'filters', id: string) => void} openPlace  a label's or a filter's page
 * @property {() => string} top  the screen on top
 * @property {(view: string) => import('../tasks.js').Display} display  a list's Display choices
 * @property {() => void} redraw
 * @property {{ menu: (s: import('../items.js').Section, b: HTMLElement) => void, field: (value: string, s: import('../items.js').Section | null, pid: string) => HTMLElement,
 *   naming: () => { projectId: string, sectionId: string, after?: string } | null, add: (pid: string) => void }} sections  a project's sections, named in place
 */
/** @typedef {{ projectId?: string, sectionId?: string | null, parentId?: string | null, due?: import('../dates.js').Due | null, deadline?: string | null, order?: number, duration?: number, priority?: number, labels?: string[] }} AddContext */

export {};
