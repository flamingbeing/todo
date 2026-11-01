# Status

## Now

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
- Known gaps: on Today and Upcoming a drag moves a row within the flat day list only (no subtasks there); a tab
  tapped while a Settings page is open first closes that page.
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
- The import has been proven against route-mocked answers only (not the live service); a Deadline
  action in select mode.
- Dragging: Today grouped by none still orders by `order`, not `dayOrder`; the calendar's held block turning the period
  (24 px from the side, 500/700 ms) has no e2e test; a sorted list says why it has no drag (a toast with Manual order)
  rather than allowing one. Edge auto-scroll is an app stopgap (`app/src/ui/edge-scroll.js`), asked of the kit.
- Board cards: swipe actions.
- Back on a tab other than Inbox goes to Inbox (the kit's first-tab rule) though the app opens on Today.

## Decisions (dated)

- <date>: <decision>
