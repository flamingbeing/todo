# Status

## Now

- Browse, Filters & Labels, Reporting, Productivity (2026-11-03, round 3 slice 2): Browse's top card follows the reference's order (Inbox, Today, Upcoming, Search only while off the tab bar; Filters & Labels, Reporting, Templates; Completed last; `browseRows` in options.js), every row with a chevron, no bell, an "Add a project" row when there are none; counts only with Show task count. Filters & Labels: "My Filters" and "Labels" heads with + and a fold chevron (kept on this device), a Manage row even on an empty group, a filter whose query cannot be read marked "!", own empty art for no filters or labels and for an empty label or filter page. Reporting is its own page (`#reporting-page`, `drawReporting` in screens/activity.js): what was added, completed and commented, by day ("3 Nov · Today"), 50 at a time, a funnel in the bar for one kind and a chart button to Productivity. Productivity: Daily and Weekly tabs, a goal ring (Edit goal opens Settings > Productivity), the streak with the longest, a vacation chip, "View all N completed tasks", and the last 7 days or 4 weeks as horizontal bars split by project colour with a dashed goal line (`bars` in stats.js). No points or levels. Startup 292.4 KiB gz JS. Tests: `e2e/browse.spec.mjs`, `e2e/reporting.spec.mjs`, filters, labels and productivity specs, axe light and dark on each; unit tests for bars, activity kinds and browseRows.
- Settings pages (2026-11-03, round 3 slice 1): the Settings screen (kit settingsScreen and every page) now loads the first time Settings opens (`screens/settings.js`, lazyModules `settings`; rows in `settings-rows.js`), startup 293.9 -> 292.0 KiB gz JS. Menu in the reference's order under group headings (Account, General; Personalization: Theme, App icon, Navigation bar, Navigation menu, Quick Add; Productivity: Productivity, Reminders, Notifications; More), a "this device" line on each page. General: Reset sub-tasks (on, as before), Task complete tone (Web Audio, `tone.js`), "Next week" and "Weekend" days (scheduler shortcuts and typed dates), Select as a swipe action. Theme: Appearance buttons and style cards over the kit's switch. App icon: four colourways (`icons/variants`, `tools/icon-variants.mjs`) swap the page and home-screen icon. Navigation bar: the add button left, center or right. Navigation menu: a checklist that hides Browse rows (tabs on the bar stay out), Hide all, a Templates row. Productivity: goal celebrations (`party.js`), days off and vacation mode in the streak. Reminders: automatic reminder for a task given a time; Notify me moved to its own Notifications page with the permission state. About: Open source licences. All new options are per device and off (or as before) by default. Tests: `e2e/settings-pages.spec.mjs`, swipe Select, unit tests for options, dates, stats, reminders, task-ops.
- Calendar and Today gaps (2026-11-03): a week block's foot drags its duration (15-minute steps, a mouse at once, a finger after a 350 ms hold so a swipe still scrolls; the end time shows while it moves; one save, Undo); a faded future repeat is a button that opens the task it repeats; Today grouped by none, priority, label or project keeps the day's own order (`dayOrder`) both shown and dragged. Tests: `e2e/calendar.spec.mjs` (resize, ghost tap), `tasks.unit`, `group-drop.unit`.
- Stats, templates, history (2026-11-02, slice 4 of 4): Browse has a Productivity row: done today and this week, the streak (days that met the daily goal, or any finished task with no goal), and a 7-day bar chart in plain SVG, all counted from completed tasks (no points); the daily and weekly goals are per-device options in Settings > General, off by default. Browse > Manage projects can save a project (sections and open tasks with their subtasks, dates cleared) as a template and make a new project from one (the `templates` collection, members write, not in the bin; rules and tests). Settings > Import has an opt-in "Also bring finished tasks (last 2 years)": fetched in 90-day windows and brought over as completed tasks with their finish time, once each (`done:<id>:<time>` extId; a task an earlier import brought over open is updated in place). Calendar-only helpers moved to `dates-cal.js` to keep startup under 290 KiB. Not built: karma/levels, template sharing, attachments.
- Web Push reminders (2026-11-03, slice 3b): with Settings > Reminders on and the permission granted, the device subscribes (`push.js`, `push-wire.js`, loaded only from `reminders-wire.js`; a failed subscribe is retried with a growing wait on the next data change, `online` or the app coming to the front; sign-out and the option going off unsubscribe) and sends the reminders due in the next 7 days, later than a minute from now (`push-items.js`, the same logic as the on-screen ones, soonest 200) to the Worker a few seconds after each change. A Worker cron (`* * * * *`; `worker/push-route.js` is listed in `worker/modules.js` ROUTES and the new SCHEDULED list that `sites.js` runs) runs `worker/push.js` `runDue`: it drops what is over 15 min late, belongs to a removed person (`revoked/`) or to a task that is done, deleted, moved or without that reminder (one batched read), leases what it sends (a run in progress does not repeat it), sends through Web Push on Web Crypto (`worker/webpush.js`: VAPID ES256 plus aes128gcm, checked against the RFC 8291 example), keeps a sent item as a tombstone until it is too late to matter (so a re-post cannot bring it back), keeps an item on 429, 5xx or a network error for the next try (after the 2-minute lease), and removes a device on 404 or 410. A run counts its outgoing requests and stops at 45 (the free plan allows 50); what did not fit waits a minute. Routes `POST /api/push/subscribe|unsubscribe|schedule` (signed in, a role, not revoked); data in Firestore `pushSubs/{uid}/devices/*`, `pushDevices/{hash}` (who a browser belongs to now: a shared browser moves to the latest person) and `pushQueue/*` (the Worker only; the rules refuse pages). A push and the on-screen one share the tag, so they collapse. Secrets `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` are on the Worker; the public key is `app/src/vapid.js`. Untested live: delivery to a real phone or browser (Chrome, iPhone home-screen app), the push services accepting the VAPID header, the cron and `batchGet`/`commit` against the real Firestore (needs the Worker deployed; the `at` and `uid` queries use single-field indexes, no composite one), and the page side (`push-wire.js`: retry, sign-out, option off during a subscribe) has no automated test.
- Reminders (2026-11-02, slice 3 of 4): a task has up to 5 reminders (at its time, or 5 min to 1 week before; a date with no time counts as 09:00), set in a Reminders row in the task sheet (needs a date) and saved as `reminders` (minutes before) with rules and tests. The per-device option Settings > General > Reminders is off by default and asks for the notification permission only when turned on (back off if refused). While the app is open or in the background a timer shows each due reminder once through the service worker (a tap opens the task); a closed app is covered by Web Push (the next item). Quick-add words ("remind 30m before") are not built. Code loads only when the option is on (`reminders-wire.js`).
- Comments (2026-11-02, slice 2 of 4): the task sheet has a Comments section (add a plain-text comment, up to 2000 characters, shown with its time and the existing small markdown marks; the author edits or deletes their own); a row shows a small speech-bubble count when a task has comments. They sync as their own `comments` collection (members write, viewers read; only the author or an admin edits or deletes; not in the bin; deleting a task leaves its comments unseen, so Undo brings them back). Rules, rules tests and `e2e/comments.spec.mjs` added; no attachments.
- Small gaps (2026-11-02, slice 1 of 4): a held row's menu now has Copy link (same address as the task sheet's). The rest of the list was already in place (Upcoming's + adds for the viewed day, Back goes to Home, board Add section, week-strip hold adds, applied sort/group line with Reset, label rules checks, Not done in Completed's select mode).
- A task manager for one person's own tasks, on app-ui 1.0.0-rc.80's kit shell (2026-11-01). Done so far (part 1 of 4):
  the data model (tasks with projects, sections, subtasks, priority 1-4, due dates with time and repeat rules, labels,
  filters; the Inbox is the project `inbox`), its rules and rules tests; five tabs (Inbox, Today, Upcoming, Search,
  Browse; opens on Today); the project page with sections; task rows, the quick add, the task sheet with subtasks, the
  project sheet, Completed (a Browse row) and Settings (Browse's gear, as a pushed screen); its own icon and look.
- Part 2 of 4 (2026-11-01): the quick add marks the words that set a date, time, priority, project, section, label or
  repeat as they are typed and fills the chips; repeat rules (recur.js), with a repeating task moving to its next date
  when ticked; the scheduler sheet (quick days, a month calendar, time, repeat menu and a custom repeat); swiping a row
  (right completes, left schedules, per device in Settings > General); holding a row opens its menu (Select task,
  Schedule, Priority, Move to, Delete) and select mode with bulk Date, Move, Priority, Duplicate, Complete and Delete;
  dragging a held row to reorder it or (pulled right) to make it a subtask, Today's own order, the + button dragged to
  add a task at a place or a new section; Browse > Manage projects to put projects in order.
- Part 3 of 4 (2026-11-01): Browse > Filters & Labels (each held and dragged into order, each with its page); labels
  picked in the task sheet and the quick add; saved filters with a query language (dates, priorities, #project,
  /section, @label, words, & | ! and brackets, commas for one list per part) whose sheet counts the matches as typed or
  says what is wrong; favourite labels and filters in Browse; the Search tab (results as tasks, projects, labels and
  filters; recent searches on this device); a project as a board (a column per section, cards dragged between them);
  Display per list on this device (layout, completed tasks, grouping, sorting, direction, a priority, label or date
  filter); Reschedule on Overdue (Today and Upcoming, with Undo); Upcoming's month and week strip (swipes by week,
  dots, tap goes to the day, a task dragged onto a day moves to it; the month opens a month picker).
- Part 4 of 4 (2026-11-01): Settings > Import (a personal API token typed once, used in the browser only and
  never kept; a preview of what would come over, then the writes through the write queue; a second import adds nothing
  twice); deadlines (a Deadline row in the task sheet, the target and "in 5 days" on a row, purple and red when past,
  the quick add's "..." > Deadline and the `{march 30}` words); the install row checked (first in Settings > About,
  hidden once installed, nothing prompts on load); a pass over every screen in light and dark against the references
  (row 74 pt, checkbox 22, add button 56, bars on the grouped ground, the sync chip only when it has news); row sizes
  now have a test (`e2e/metrics.spec.mjs`).
- Calendar layout (2026-11-01): every list can show as a calendar (Display > Layout, per device). A week is 3 days on
  a phone and 7 from 600 px (Today is its own day): an hour grid with blocks as long as each task's new duration
  (overlaps side by side), an all-day row (two, then "+N", or all), a now line that moves each minute; a tap on an empty
  half hour adds a 30-minute task there, the ring completes, a held task drags to another time, day or the all-day row
  (one save, Undo). Month shows chips per day with "+N more" (a day sheet with Add task) and drags between days;
  Agenda is Upcoming's day list for any list. The top row has the month (a picker), counts for "No date" and "Overdue"
  (each a sheet to tick tasks and schedule them), the arrows and Today; sideways swipes page. Future repeats show
  faded when asked for. The calendar's maths is in `app/src/cal.js` (unit tested); the screen loads only when used.
- Dragging (2026-11-01): lists, boards, the + and calendar blocks scroll by themselves near an edge; a row dragged to
  another group takes its date, priority, label or project (Undo); Today has a postpone place; boards group by Display.
- Gestures and navigation (2026-11-01): the app opens on a Home view (Settings > General, Today unless set); Back on
  another tab goes Home, Back on Home says "Press Back again to close"; a tab tapped over a Settings page goes straight
  there (the next Back goes Home); the current tab tapped scrolls to top; a long press on the tab bar opens Settings >
  Tab bar. Board cards follow the row swipes (Settings > General > Swipe right / left; both None turns them off): a sideways swipe on a card completes or schedules it, and the
  board still pages from the gaps, headers and dots. Two fingers dragged down over rows select them; select mode's
  "..." has Deadline (sets or clears it on every selected task, with Undo).
- Remaining gaps, part 1 (2026-11-01): "This weekend" on a Saturday or Sunday means the next Saturday; a repeating
  task ticked opens its done subtasks again (Undo puts them back); a task's duration (the scheduler's Duration row,
  "for 45 min" typed with its chip, the time range on rows and in the sheet, Today's count with minutes); Postpone in
  the scheduler; select mode shows a circle on every row; deadline words in filters and Deadline in Display's grouping
  and sorting; a title starting "* " is a note (no box, no swipe to complete); a little markdown in a task's words
  (our own small renderer, lazy, DOM nodes only, links to a new tab; rows underline a link's words).
- Remaining gaps, part 2 (2026-11-01): each label in a task is text of 1 to 64 (rules, with tests); Browse's task
  counts are per device now (an old value on the account doc still saves); quick add chips smaller and even, the
  priority chip in its colour with a filled flag; the scheduler's calendar rows 46 pt with the picked day in its date's
  colour; the sheets' X and "…" neutral; a row with a fold chevron keeps its project at the right edge; Browse shows a
  name or the part of an email before the @; no empty Advanced heading in Settings. Also: Copy link in the task sheet
  (`#task=<id>` opens it once signed in), Select on Completed (Not done or Delete, with Undo), a long press on a day of
  the week strip adds a task that day, a section's "…" > Add section after (between board columns too), and a line over
  a list sorted or grouped its own way with Reset. Startup 289.9 -> 289.3 KiB gz (arrange.js moved off the first
  screen).
- Known gaps: on Today and Upcoming a drag moves a row within the flat day list only (no subtasks there); Home, the tab
  tap over Settings and two-finger select run on app-only stopgaps until the kit has them (see Next).
- Review fixes (2026-11-01): dark mode fills (+, Done, send) at full colour; top bar without the cloud while saved,
  ring "…", bare-chevron Back, slimmer bar and title gaps, Browse's person and gear in the bar row; Upcoming's + adds
  for the day in sight; the unused ensureInbox dropped. Settings pages are screens of their own (shell.js
  onPage, app-ui rc.80's `menu.onPage`).
- Startup and shared fixes (2026-10-28): no sign-in flash, last list painted at once, modulepreload, no pinch zoom, PNG
  icons and theme colours. On app-sync 1.5.5 and app-devkit 1.16.0 (2026-10-30).

## Waiting on the owner

- <nothing>

## Next

- Reporting: no "Deleted" or "Updated" kinds (nothing records them: the bin module is not installed and there is no change log); no per-project filter or other people (one-person app).
- Productivity bars are horizontal like the reference's screen, not the vertical 24 px bars the spec named.
- Calendar: resizing has no keyboard path (the scheduler's Duration row covers it); the kit asks in the owner's private
  notes (gesture rank, edge auto-scroll).
- app-ui: home tab option, then drop the stopgap (shell.js startShell; the asks are in the owner's private notes).
- The import has been proven against route-mocked answers only (not the live service).
- Dragging: the calendar's held block turning the period
  (24 px from the side, 500/700 ms) has no e2e test; a sorted list says why it has no drag (a toast with Manual order)
  rather than allowing one. Edge auto-scroll is an app stopgap (`app/src/ui/edge-scroll.js`), asked of the kit.

- Not built yet, by choice for now: archiving a project or section; any project, filter or label as
  a tab; holidays in the calendar; a planning sidebar.
- Settings round 3 left out: a real home-screen icon change on an installed app (the manifest icon stays; only the tab
  and new shortcuts follow App icon); location reminders; a theme sub showing the current choice in the menu. Theme
  cards are an app stopgap over the kit's selects (ask in the owner's private notes).
- Startup is 292.0 of 295 KiB gz JS (Checks' budget) after Settings went lazy: row-drag.js, row-swipe.js and the week
  strip could load on first touch to win more back.
- Settings: the empty-heading fix is app-side (shell.js byGroup) until the kit hides a group with no shown page.
- Copy link: a link opened while signed out opens the task after sign-in only if the page is not reloaded meanwhile.
- The "Import from ..." Settings row names the service it imports from; reword to neutral words if the public-repo rule
  should cover it too.

## Decisions (dated)

- <date>: <decision>
