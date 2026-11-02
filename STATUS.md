# Status

## Now

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

- Calendar: resizing a block to change its duration; tapping a faded future repeat; a block's title in a narrow
  overlap lane breaks mid-word; the kit asks in the owner's private notes (gesture rank, edge auto-scroll).
- app-ui: home tab option, then drop the stopgap (shell.js startShell; the asks are in the owner's private notes).
- The import has been proven against route-mocked answers only (not the live service).
- Dragging: Today grouped by none still orders by `order`, not `dayOrder`; the calendar's held block turning the period
  (24 px from the side, 500/700 ms) has no e2e test; a sorted list says why it has no drag (a toast with Manual order)
  rather than allowing one. Edge auto-scroll is an app stopgap (`app/src/ui/edge-scroll.js`), asked of the kit.

- Not built yet, by choice for now: comments on a task; archiving a project or section; any project, filter or label as
  a tab; a completion sound; holidays in the calendar; a planning sidebar.
- Startup is 289.3 of 290 KiB gz: the next feature on the first screen needs bytes won back first (row-drag.js,
  row-swipe.js and the week strip could load on first touch).
- Settings: the empty-heading fix is app-side (shell.js byGroup) until the kit hides a group with no shown page.
- Copy link: a link opened while signed out opens the task after sign-in only if the page is not reloaded meanwhile.
- The "Import from ..." Settings row names the service it imports from; reword to neutral words if the public-repo rule
  should cover it too.

## Decisions (dated)

- <date>: <decision>
